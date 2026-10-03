// audio/effets-spectral.ts — Changer la duree ou la hauteur, par vocodeur de phase.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { etirerDuree, etirerDureeVoie, reechantillonnerVoie, creerFenetreHann } from "./commun";

export function changerTempo(buffer: AudioBuffer, vitessePct: number, fenetreMs?: number): AudioBuffer {
  const facteur = 100 / Math.max(1, vitessePct);
  // La fenêtre, en millisecondes, ramenée à la puissance de deux la plus proche par `etirerDuree` :
  // courte, les attaques restent nettes ; longue, les sons tenus restent lisses.
  const taille = fenetreMs && fenetreMs > 0 ? Math.round((fenetreMs / 1000) * buffer.sampleRate) : undefined;
  return etirerDuree(buffer, facteur, taille);
}



/**
 * Le changement de tonalité d'UNE voie, sans `AudioBuffer`.
 *
 * Étirer puis rééchantillonner du même rapport : la durée revient à sa valeur et la hauteur a bougé.
 * Ce cœur existe pour que les composants qui en dépendent puissent quitter le fil de l'interface,
 * `AudioBuffer` n'existant pas dans un worker. Les opérations sont celles de `changerTonalite`, sans
 * changement.
 */
export function changerTonaliteVoie(x: Float32Array, demiTons: number): Float32Array {
  const ratio = Math.pow(2, demiTons / 12);
  return reechantillonnerVoie(etirerDureeVoie(x, ratio), ratio, x.length);
}

export function changerTonalite(buffer: AudioBuffer, demiTons: number): AudioBuffer {
  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    resultat.getChannelData(c).set(changerTonaliteVoie(buffer.getChannelData(c), demiTons));
  }
  return resultat;
}

// Glissando de tonalité : la hauteur évolue continuellement entre deux valeurs
// en demi-tons, tout en conservant la durée totale.
// L'algorithme découpe le signal en segments courts, applique un pitch-shift
// statique par segment (interpolation linéaire en demi-tons), puis recolle les
// segments par overlap-add avec fenêtre de Hann et normalisation d'enveloppe.
// Si les deux hauteurs sont identiques, on retombe sur un pitch-shift statique.
/** Ce qu'un glissando demande, une fois sorti de l'`AudioBuffer` qui le portait. */
export interface OptionsGlissando {
  debut: number;
  fin: number;
  /** La fréquence d'échantillonnage : un tableau de nombres ne la porte pas. */
  sr: number;
  segmentSec?: number;
}

/**
 * Le glissando de tonalité d'UNE voie, sans `AudioBuffer`.
 *
 * CE CŒUR EXISTE POUR QUE LE COMPOSANT PUISSE QUITTER LE FIL DE L'INTERFACE. `AudioBuffer` n'y
 * servait que de récipient — des canaux, une longueur, une fréquence d'échantillonnage — et c'est
 * lui seul qui retenait le calcul dans le fil. **Mesuré sur trois secondes de son : 615
 * millisecondes, et pas un seul message pendant ce temps**, donc un gel total, le plus long de tous
 * les effets relevés.
 *
 * LES OPÉRATIONS SONT CELLES D'AVANT, SANS CHANGEMENT : découpage en segments, transposition
 * statique de chacun, recollement par fenêtre de Hann et division par l'enveloppe de recouvrement.
 */
export function glissandoTonaliteVoie(x: Float32Array, o: OptionsGlissando): Float32Array {
  if (Math.abs(o.fin - o.debut) < 1e-6) return changerTonaliteVoie(x, o.debut);

  const len = x.length;
  const segmentLen = Math.max(4096, Math.round((o.segmentSec ?? 0.2) * o.sr));
  if (len <= segmentLen) return glissandoCourtVoie(x, o.debut, o.fin);

  const N = Math.max(2, Math.min(50, Math.round(len / (segmentLen / 2)) + 1));
  const overlap = Math.floor((len - segmentLen) / (N - 1));
  const outputLen = (N - 1) * overlap + segmentLen;

  const out = new Float32Array(outputLen);
  const enveloppe = new Float32Array(outputLen);
  const fenetre = creerFenetreHann(segmentLen);
  const segment = new Float32Array(segmentLen);

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const semi = o.debut + (o.fin - o.debut) * t;
    const startSrc = i * overlap;
    for (let j = 0; j < segmentLen; j++) {
      const idx = startSrc + j;
      segment[j] = idx >= 0 && idx < len ? x[idx] : 0;
    }
    const transpose = changerTonaliteVoie(segment, semi);
    const startDst = i * overlap;
    for (let j = 0; j < segmentLen; j++) {
      const pos = startDst + j;
      if (pos >= outputLen) break;
      const w = fenetre[j];
      out[pos] += transpose[j] * w;
      enveloppe[pos] += w;
    }
  }

  for (let i = 0; i < outputLen; i++) out[i] = enveloppe[i] > 1e-6 ? out[i] / enveloppe[i] : 0;
  // Rallonger à la durée originale si le recouvrement a raccourci légèrement.
  return outputLen === len ? out : out.subarray(0, len);
}

export function glissandoTonalite(buffer: AudioBuffer, debutDemiTons: number, finDemiTons: number, segmentSec = 0.2): AudioBuffer {
  const sr = buffer.sampleRate;
  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: sr,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const voie = glissandoTonaliteVoie(buffer.getChannelData(c), { debut: debutDemiTons, fin: finDemiTons, sr, segmentSec });
    resultat.getChannelData(c).set(voie.subarray(0, buffer.length));
  }
  return resultat;
}

// Fallback pour les sons plus courts qu'une fenêtre : lecture temporelle variable
// normalisée sur la durée originale. La trajectoire de pitch est exacte en forme,
// la hauteur moyenne est ramenée autour de l'original pour conserver la durée.
function glissandoCourtVoie(src: Float32Array, debutDemiTons: number, finDemiTons: number): Float32Array {
  const len = src.length;
  const dst = new Float32Array(len);

  const a = debutDemiTons;
  const b = finDemiTons - debutDemiTons;
  const A = Math.pow(2, a / 12);
  const k = (b * Math.LN2) / 12;
  const R1 = (A * (Math.exp(k) - 1)) / k;
  const invR1 = 1 / R1;

  for (let i = 0; i < len; i++) {
    const t = i / len;
    const R = (A * (Math.exp(k * t) - 1)) / k;
    const pos = len * R * invR1;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const p0 = idx - 1 >= 0 ? src[idx - 1] : 0;
    const p1 = idx < src.length ? src[idx] : 0;
    const p2 = idx + 1 < src.length ? src[idx + 1] : 0;
    const p3 = idx + 2 < src.length ? src[idx + 2] : 0;
    const t2 = frac * frac;
    const t3 = t2 * frac;
    dst[i] =
      p1
      + 0.5 * (p2 - p0) * frac
      + (p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3) * t2
      + (-0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3) * t3;
  }

  return dst;
}



