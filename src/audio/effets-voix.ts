// audio/effets-voix.ts — Harmoniser une voix, et le vocodeur.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { valeurA, valeurMax } from "./courbe";
import { POINTS_AUTOMATION, poserParam } from "./automation";
import { changerTonaliteVoie } from "./effets-spectral";

export interface OptionsHarmoniser {
  interval1: number;
  /**
   * Le niveau de la première voix, en pour cent. Un tableau le fait varier échantillon par
   * échantillon.
   *
   * LA MARQUE « TRAMES » DE CE COMPOSANT NE PORTE PAS SUR LUI. Le décalage de hauteur travaille par
   * blocs, et c'est pour cela que la fiche est marquée ; mais le mélange est un GAIN appliqué
   * après, échantillon par échantillon, de sorte qu'une courbe y est lue sans perdre de résolution.
   */
  mix1: number | Float32Array;
  interval2: number;
  /** Le niveau de la seconde voix, en pour cent. Un tableau le fait varier. */
  mix2: number | Float32Array;
}

/**
 * L'harmonisation d'UNE voie, sans `AudioBuffer`.
 *
 * Les voix ajoutées sont indépendantes d'un canal à l'autre, la transposition traitant chaque canal
 * pour lui-même : le calcul par voie rend donc exactement ce que rendait le calcul par tampon, et la
 * comparaison d'empreinte le vérifie. C'est ce cœur qui permet au composant de quitter le fil de
 * l'interface, `AudioBuffer` n'existant pas dans un worker.
 */
export function harmoniserVoie(x: Float32Array, o: OptionsHarmoniser): Float32Array {
  const out = Float32Array.from(x);
  const ajouterVoix = (interval: number, gainRel: number | Float32Array): void => {
    // LA SORTIE ANTICIPÉE SE DÉCIDE SUR LE MAXIMUM, et non sur la valeur du moment : une courbe qui
    // monte quelque part demande la voix, et la sauter reviendrait à ne jamais l'entendre. Une
    // courbe nulle partout la saute, ce qui épargne tout le décalage de hauteur.
    if (valeurMax(gainRel) <= 0 || interval === 0) return;
    const voix = changerTonaliteVoie(x, interval);
    // `valeurA` rend un scalaire tel quel : un seul chemin de calcul, modulé ou non.
    for (let i = 0; i < x.length; i++) out[i] += voix[i] * (valeurA(gainRel, i) / 100);
  };
  ajouterVoix(o.interval1, o.mix1);
  ajouterVoix(o.interval2, o.mix2);
  return out;
}

export function harmoniser(
  buffer: AudioBuffer,
  interval1: number,
  mix1: number | Float32Array,
  interval2: number,
  mix2: number | Float32Array,
): AudioBuffer {
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: buffer.sampleRate });
  const o = { interval1, mix1, interval2, mix2 };
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    resultat.getChannelData(c).set(harmoniserVoie(buffer.getChannelData(c), o));
  }
  return resultat;
}

// --- Vocoder filterbank : modulateur + porteuse → effet robot -----------------
// Découpe modulateur et porteuse en bandes passe-bande, détecte l'enveloppe du
// modulateur par bande, puis applique cette enveloppe à la porteuse correspondante.

async function filtreBiquadSpectral(
  buffer: AudioBuffer,
  type: BiquadFilterType,
  frequency: number | Float32Array,
  Q: number | Float32Array = 0.707,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  // `poserParam` pose un nombre comme avant, par `value`, et une courbe par automation.
  poserParam(filter.frequency, frequency, buffer.duration);
  poserParam(filter.Q, Q, buffer.duration);
  source.connect(filter);
  filter.connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}

function detecterEnveloppe(buffer: AudioBuffer, attackMs: number, releaseMs: number): Float32Array[] {
  const sr = buffer.sampleRate;
  const attackCoeff = Math.exp(-1 / (Math.max(0.01, attackMs) / 1000 * sr));
  const releaseCoeff = Math.exp(-1 / (Math.max(0.01, releaseMs) / 1000 * sr));
  const envs: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const env = new Float32Array(buffer.length);
    let e = 0;
    for (let i = 0; i < buffer.length; i++) {
      const target = Math.abs(src[i]);
      e = target > e ? attackCoeff * e + (1 - attackCoeff) * target : releaseCoeff * e + (1 - releaseCoeff) * target;
      env[i] = e;
    }
    envs.push(env);
  }
  return envs;
}

export async function vocoder(
  modulateur: AudioBuffer,
  porteuse: AudioBuffer,
  bands: number,
  /**
   * Les deux bornes du banc et le facteur de qualité des filtres. Un tableau les fait varier.
   *
   * LES DEUX BORNES NE SERVENT PAS DIRECTEMENT, et c'est ce qui les avait mises de côté : la
   * fréquence de la bande `i` est leur moyenne géométrique pondérée, `fMin · (fMax/fMin)^(i/(n−1))`.
   * La combinaison se fait donc sur les tableaux, point par point, avant d'être remise au
   * paramètre audio du filtre.
   */
  fMin: number | Float32Array,
  fMax: number | Float32Array,
  Q: number | Float32Array,
  mix: number | Float32Array,
): Promise<AudioBuffer> {
  const sr = modulateur.sampleRate;
  const length = Math.min(modulateur.length, porteuse.length);
  const nch = modulateur.numberOfChannels;
  const resultat = new AudioBuffer({ numberOfChannels: nch, length, sampleRate: sr });
  for (let c = 0; c < nch; c++) resultat.getChannelData(c).fill(0);

  // LA COMBINAISON SE FAIT À LA RÉSOLUTION DE L'AUTOMATION, et non à celle du signal : `poserParam`
  // ne programme que deux mille quarante-huit points de toute façon, et un tableau par bande à la
  // longueur du son pèserait des centaines de mégaoctets pour un résultat identique.
  const nBornes = Math.max(
    typeof fMin === "number" ? 0 : fMin.length,
    typeof fMax === "number" ? 0 : fMax.length,
  );
  /** La fréquence de la bande `i` : un nombre si les deux bornes en sont, un tableau sinon. */
  const frequenceBande = (i: number): number | Float32Array => {
    const puissance = i / Math.max(1, bands - 1);
    const calcul = (k: number) =>
      valeurA(fMin, k) * Math.pow(valeurA(fMax, k) / valeurA(fMin, k), puissance);
    if (nBornes === 0) return calcul(0);
    const out = new Float32Array(POINTS_AUTOMATION);
    for (let k = 0; k < POINTS_AUTOMATION; k++) {
      out[k] = calcul(Math.round((k * (nBornes - 1)) / (POINTS_AUTOMATION - 1)));
    }
    return out;
  };

  for (let i = 0; i < bands; i++) {
    const freq = frequenceBande(i);
    const modBand = await filtreBiquadSpectral(modulateur, "bandpass", freq, Q);
    const carBand = await filtreBiquadSpectral(porteuse, "bandpass", freq, Q);
    const envs = detecterEnveloppe(modBand, 1, 20);
    for (let c = 0; c < nch; c++) {
      const dst = resultat.getChannelData(c);
      const car = carBand.getChannelData(c);
      const env = envs[c];
      for (let j = 0; j < length; j++) dst[j] += car[j] * env[j];
    }
  }

  // `valeurA` rend un scalaire tel quel : un seul chemin de calcul, modulé ou non.
  const mixA = (i: number) => valeurA(mix, i) / 100;
  const sortie = new AudioBuffer({ numberOfChannels: nch, length, sampleRate: sr });
  for (let c = 0; c < nch; c++) {
    const src = modulateur.getChannelData(c);
    const wet = resultat.getChannelData(c);
    const dst = sortie.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const mixVal = mixA(i);
      dst[i] = src[i] * (1 - mixVal) + wet[i] * mixVal;
    }
  }
  return sortie;
}

// Wah-wah : filtre passe-bande dont la fréquence centrale balaie une plage.
//
// LE BALAYAGE PEUT VENIR D'UNE COURBE PLUTÔT QUE DU LFO, et c'est précisément ce que l'en-tête de
// `audio/courbe.ts` réclamait : un effet n'a pas à exister en deux exemplaires selon la règle qui
// fait varier son paramètre. Sans courbe branchée, le LFO sinusoïdal d'origine décide, et le son
// ne bouge pas d'un bit ; avec une courbe, c'est elle qui promène la fréquence centrale, et l'on
// obtient la pédale actionnée au pied plutôt que l'oscillation régulière.
//
// LES BORNES DU BALAYAGE SONT DES RÉGLAGES, ET NON DES BORNES DE MODULATION. La distinction compte
// pour l'inspecteur : elles veulent dire quelque chose avec ou sans courbe — le wah balaie entre
// elles dans les deux cas —, là où les bornes d'un paramètre modulé ne servent à rien tant qu'aucune
// courbe n'est branchée. Elles étaient jusqu'ici câblées à 200 et 2500 Hz, invisibles et
// irréglables.
