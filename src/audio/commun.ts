// audio/commun.ts — Extrait de l'ancien monolithe DSP.
import { fft } from "./fft";

// Noms français ET anglais comme clés directement : évite d'avoir besoin
// d'optionIds sur chaque paramètre "Clé" pour retrouver la bonne tonique
// quel que soit la langue de l'interface (ctx.paramTexte renvoie la valeur
// brute stockée, dans la langue où elle a été choisie). Mêmes alias que
// traduireCle() plus bas dans generation.ts.
export const DEMI_TONS_CLE: Record<string, number> = {
  Do: 0, C: 0,
  "Do#": 1, "C#": 1,
  Ré: 2, D: 2,
  "Mi♭": 3, Eb: 3, "D#": 3,
  Mi: 4, E: 4,
  Fa: 5, F: 5,
  "Fa#": 6, "F#": 6,
  Sol: 7, G: 7,
  "Sol#": 8, "G#": 8,
  La: 9, A: 9,
  "Si♭": 10, Bb: 10, "A#": 10,
  Si: 11, B: 11,
};


export function frequenceDeNoteMidi(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}


export interface PositionZone {
  debut: number;
  duree: number;
}


export const TAILLE_FFT = 2048;

export const SAUT_FFT = TAILLE_FFT / 2;

export const TAILLE_FFT_BRUIT = 8192;

export const SAUT_FFT_BRUIT = TAILLE_FFT_BRUIT / 2;

const TAILLE_FFT_HAUTEUR = 2048;

const SAUT_ANALYSE_HAUTEUR = TAILLE_FFT_HAUTEUR / 4;


export function frequenceDepuisValeur(v: number, min: number, max: number): number {
  const n = Math.max(0, Math.min(255, v)) / 255;
  return min + (max - min) * n;
}


export function creerFenetreHann(taille: number): Float64Array {
  const fenetre = new Float64Array(taille);
  for (let i = 0; i < taille; i++) {
    fenetre[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (taille - 1)));
  }
  return fenetre;
}


/**
 * Downmix multi-canal vers mono (moyenne des canaux) — étape commune à
 * plusieurs analyses spectrales/temporelles qui ne travaillent que sur un
 * signal mono (chroma, MFCC, centroïde...).
 */
export function mixdownMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) mono[i] += ch[i] / buffer.numberOfChannels;
  }
  return mono;
}


/**
 * Décalage (en échantillons) où `extraitCentre` prend son extrait dans le
 * buffer d'origine — 0 si le buffer est déjà assez court pour ne pas être
 * tronqué. Exporté séparément (et utilisé PAR `extraitCentre` ci-dessous,
 * source unique) pour qu'un consommateur en aval (ex. un nœud d'étirement
 * temporel recevant un chemin d'alignement calculé sur cet extrait) puisse
 * replacer un indice d'échantillon/de trame dans le référentiel du buffer
 * complet, sans avoir à redupliquer ce calcul.
 */
export function decalageExtraitCentre(buffer: AudioBuffer, dureeMaxS: number): number {
  const longueurMax = Math.floor(dureeMaxS * buffer.sampleRate);
  if (buffer.length <= longueurMax) return 0;
  return Math.floor((buffer.length - longueurMax) / 2);
}

/**
 * Extrait central d'un buffer, plafonné à `dureeMaxS` — évite les
 * intros/outros silencieux ou atypiques (fade-in, applaudissements...), plus
 * représentatif du corps de la piste, et borne le coût de calcul des analyses
 * qui tournent sur un extrait plutôt que le buffer entier. Retourne le buffer
 * tel quel si déjà assez court (aucun coût ni changement de comportement sur
 * les pistes courtes).
 */
export function extraitCentre(buffer: AudioBuffer, dureeMaxS: number): AudioBuffer {
  const longueurMax = Math.floor(dureeMaxS * buffer.sampleRate);
  if (buffer.length <= longueurMax) return buffer;
  const debut = decalageExtraitCentre(buffer, dureeMaxS);
  const extrait = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: longueurMax,
    sampleRate: buffer.sampleRate,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    extrait.copyToChannel(buffer.getChannelData(c).subarray(debut, debut + longueurMax), c);
  }
  return extrait;
}


/**
 * Étire la durée sans toucher à la hauteur — vocodeur de phase.
 *
 * LE SAUT DE SYNTHÈSE EST BORNÉ, et ce n'est pas un détail de confort. Le recollement additionne des
 * trames fenêtrées par une Hann et divise par la somme de leurs carrés ; cette somme ne reste
 * remplie que si les trames se recouvrent d'au moins trois quarts. L'ancienne version fixait le saut
 * d'ANALYSE et calculait celui de synthèse par `ha × facteur` : à facteur 4, il atteignait la taille
 * de la fenêtre, le recouvrement tombait à zéro, et l'on divisait par une enveloppe qui touchait
 * zéro. Mesuré sur un son de crête 0,77 : crête 1,4 à +20 demi-tons, **73 à +24 demi-tons** — c'est-
 * à-dire à l'intérieur même de la plage du curseur de « Changement de tonalité » —, et jusqu'à 200 à
 * +36. « Changement de tempo » à 25 % et « Glissando de tonalité » étaient touchés de la même façon.
 *
 * On fixe donc le saut du côté qui décide de l'enveloppe : à l'étirement, c'est la SYNTHÈSE qui doit
 * garder son recouvrement, et le saut d'analyse se déduit du facteur ; au raccourcissement, c'est
 * l'inverse. Les deux règles se rejoignent à facteur 1.
 */
/** La longueur que `etirerDureeVoie` rendra, utile pour dimensionner avant de calculer. */
export function longueurEtiree(
  longueur: number, facteur: number, tailleFenetre: number = TAILLE_FFT_HAUTEUR,
): number {
  const n = Math.max(256, Math.min(16384, 2 ** Math.round(Math.log2(Math.max(2, tailleFenetre)))));
  return Math.max(n, Math.round(longueur * facteur));
}

/**
 * L'étirement d'UNE voie, sans `AudioBuffer`.
 *
 * POURQUOI CE CŒUR EST SÉPARÉ. Le calcul n'a jamais eu besoin du Web Audio : `AudioBuffer` ne
 * servait que de récipient à des `Float32Array`. Or c'est lui qui empêchait ce traitement, et tous
 * ceux qui en dépendent, de sortir du fil de l'interface : `AudioBuffer` n'existe pas dans un
 * worker. Le corps de la boucle est déplacé sans qu'une seule opération change, ce qui garantit un
 * son identique ; les empreintes des composants concernés le vérifient.
 */
export function etirerDureeVoie(
  src: Float32Array, facteur: number, tailleFenetre: number = TAILLE_FFT_HAUTEUR,
): Float32Array {
  // La fenêtre d'analyse, en puissance de deux (la transformée l'exige) ; le saut en est le quart.
  const n = Math.max(256, Math.min(16384, 2 ** Math.round(Math.log2(Math.max(2, tailleFenetre)))));
  const nbBins = n / 2 + 1;
  const saut = n === TAILLE_FFT_HAUTEUR ? SAUT_ANALYSE_HAUTEUR : n / 4;
  const ha = facteur >= 1 ? Math.max(1, Math.round(saut / facteur)) : saut;
  const hs = facteur >= 1 ? saut : Math.max(1, Math.round(saut * facteur));
  const fenetre = creerFenetreHann(n);
  const longueurSortie = Math.max(n, Math.round(src.length * facteur));

  const sortie = new Float64Array(longueurSortie);
  const enveloppe = new Float64Array(longueurSortie);
  const phasePrecedente = new Float64Array(nbBins);
  const phaseSynthese = new Float64Array(nbBins);
  let premiereTrame = true;

  let posAnalyse = 0;
  let posSynthese = 0;
  while (posAnalyse < src.length) {
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const idx = posAnalyse + i;
      re[i] = (idx < src.length ? src[idx] : 0) * fenetre[i];
    }
    fft(re, im, false);

    for (let b = 0; b < nbBins; b++) {
      const magnitude = Math.hypot(re[b], im[b]);
      const phase = Math.atan2(im[b], re[b]);

      if (premiereTrame) {
        phaseSynthese[b] = phase;
      } else {
        const omegaBin = (2 * Math.PI * b) / n;
        let deltaPhase = phase - phasePrecedente[b] - omegaBin * ha;
        deltaPhase -= 2 * Math.PI * Math.round(deltaPhase / (2 * Math.PI));
        const frequenceInstantanee = omegaBin + deltaPhase / ha;
        phaseSynthese[b] += frequenceInstantanee * hs;
      }
      phasePrecedente[b] = phase;

      re[b] = magnitude * Math.cos(phaseSynthese[b]);
      im[b] = magnitude * Math.sin(phaseSynthese[b]);
      if (b > 0 && b < n - b) {
        re[n - b] = re[b];
        im[n - b] = -im[b];
      }
    }
    premiereTrame = false;

    fft(re, im, true);
    for (let i = 0; i < n; i++) {
      const pos = posSynthese + i;
      if (pos >= longueurSortie) break;
      sortie[pos] += re[i] * fenetre[i];
      enveloppe[pos] += fenetre[i] * fenetre[i];
    }

    posAnalyse += ha;
    posSynthese += hs;
  }

  const out = new Float32Array(longueurSortie);
  for (let i = 0; i < longueurSortie; i++) {
    out[i] = enveloppe[i] > 1e-6 ? sortie[i] / enveloppe[i] : 0;
  }
  return out;
}

export function etirerDuree(entree: AudioBuffer, facteur: number, tailleFenetre: number = TAILLE_FFT_HAUTEUR): AudioBuffer {
  const longueurSortie = longueurEtiree(entree.length, facteur, tailleFenetre);
  const resultat = new AudioBuffer({
    numberOfChannels: entree.numberOfChannels,
    length: longueurSortie,
    sampleRate: entree.sampleRate,
  });
  for (let c = 0; c < entree.numberOfChannels; c++) {
    resultat.getChannelData(c).set(etirerDureeVoie(entree.getChannelData(c), facteur, tailleFenetre));
  }
  return resultat;
}

// Changement de tempo : c'est exactement l'étape d'étirement du changement de
// tonalité, utilisée seule (sans le rééchantillonnage qui suit) — la durée
// change, la hauteur reste intacte grâce à la correction de phase.

/** Le rééchantillonnage d'UNE voie, sans `AudioBuffer`. Même remarque que `etirerDureeVoie`. */
export function reechantillonnerVoie(
  src: Float32Array, ratio: number, longueurCible: number,
): Float32Array {
  const dst = new Float32Array(longueurCible);
  for (let i = 0; i < longueurCible; i++) {
    const positionSource = i * ratio;
    const idx = Math.floor(positionSource);
    const frac = positionSource - idx;
    // Interpolation cubique Catmull-Rom (4 points)
    const p0 = idx - 1 >= 0 ? src[idx - 1] : 0;
    const p1 = idx < src.length ? src[idx] : 0;
    const p2 = idx + 1 < src.length ? src[idx + 1] : 0;
    const p3 = idx + 2 < src.length ? src[idx + 2] : 0;
    const t = frac;
    const t2 = t * t;
    const t3 = t2 * t;
    dst[i] = p1
           + 0.5 * (p2 - p0) * t
           + (p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3) * t2
           + (-0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3) * t3;
  }
  return dst;
}

export function reechantillonnerVers(buffer: AudioBuffer, ratio: number, longueurCible: number): AudioBuffer {
  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: longueurCible,
    sampleRate: buffer.sampleRate,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    resultat.getChannelData(c).set(reechantillonnerVoie(buffer.getChannelData(c), ratio, longueurCible));
  }
  return resultat;
}


export interface TrameFFT {
  re: Float64Array;
  im: Float64Array;
}


export function tramesDepuisBuffer(
  donnees: Float32Array,
  fftTaille: number,
  saut: number,
  fenetre: Float64Array
): TrameFFT[] {
  const trames: TrameFFT[] = [];
  for (let debut = 0; debut + fftTaille <= donnees.length; debut += saut) {
    const re = new Float64Array(fftTaille);
    const im = new Float64Array(fftTaille);
    for (let i = 0; i < fftTaille; i++) re[i] = donnees[debut + i] * fenetre[i];
    fft(re, im, false);
    trames.push({ re, im });
  }
  return trames;
}


/**
 * Contexte audio destiné au SEUL décodage de fichiers (`decodeAudioData`).
 *
 * `new AudioContext()` ouvre un vrai périphérique de SORTIE, alors que décoder
 * n'a rien à jouer. Conséquence : sur une machine sans sortie audio — poste dont
 * l'audio est désactivé, session distante, serveur, runner d'intégration
 * continue — la construction échoue (« DeviceUnavailable: No output device
 * available ») et le nœud tombe en erreur alors que rien ne devait sortir par
 * les haut-parleurs. Un `OfflineAudioContext` fait exactement le même travail
 * sans réclamer de périphérique.
 *
 * La fréquence est fixée à 48 kHz parce que `decodeAudioData` RÉÉCHANTILLONNE
 * toujours vers la fréquence du contexte : la valeur n'est donc pas neutre. Un
 * `AudioContext` adopte celle de la carte son — mesuré à 48 kHz ici, valeur
 * usuelle sous Chromium/Electron —, si bien que le résultat d'une conversion
 * dépendait jusqu'ici du matériel de l'utilisateur. Le figer rend le décodage
 * déterministe d'une machine à l'autre, et conserve le comportement observé.
 */
const SR_DECODAGE = 48000;

export function contexteDecodage(): OfflineAudioContext {
  return new OfflineAudioContext(1, 1, SR_DECODAGE);
}

/**
 * Ramène un tampon sous la pleine échelle, s'il la dépasse — et seulement dans ce cas.
 *
 * Plusieurs générateurs additionnent des voix ou des bandes sans normaliser : trois voix de synthé
 * à pleine échelle, quatre bandes saturées, une grosse caisse et un charleston qui tombent ensemble.
 * Leur crête dépassait 1, et l'export l'écrêtait. Sous 0,99, rien n'est touché : le son d'un nœud
 * qui restait dans la pleine échelle ne change pas d'un bit.
 */
export function plafonnerCrete<T extends { numberOfChannels: number; getChannelData: (c: number) => Float32Array }>(b: T, plafond = 0.99): T {
  let crete = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const x = b.getChannelData(c);
    for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > crete) crete = a; }
  }
  if (crete <= plafond) return b;
  const k = plafond / crete;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const x = b.getChannelData(c);
    for (let i = 0; i < x.length; i++) x[i] *= k;
  }
  return b;
}
