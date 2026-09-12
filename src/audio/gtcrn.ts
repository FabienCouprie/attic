// audio/gtcrn.ts — Débruitage par GTCRN : l'analyse/synthèse autour du modèle.
//
// GTCRN (Xiaobin-Rong/gtcrn, MIT, © 2024 Rong Xiaobin) est un modèle de
// rehaussement de parole de 0,5 Mo. Il travaille **image par image** sur un
// spectrogramme, et porte trois caches d'une trame à la suivante : il n'est donc
// pas question d'un appel unique sur tout le fichier.
//
// LE CONTRAT, relevé sur le `infer.py` amont puis VÉRIFIÉ contre le couple
// bruité/débruité que le dépôt publie :
//   16 kHz mono · STFT 512 points, saut de 256 · fenêtre de Hann **à la
//   puissance 0,5**, en analyse comme en synthèse · cadrage centré par réflexion.
// La racine de Hann n'est pas un détail : w² = hann, et une fenêtre de Hann à
// 50 % de recouvrement somme exactement à 1. La reconstruction est donc exacte
// sans aucune normalisation de la somme des fenêtres — utiliser Hann des deux
// côtés, ou normaliser en plus, dégraderait le signal de façon diffuse.
//
// Reproduire ce contrat rend la sortie des auteurs à **−71 dB** d'erreur
// relative au signal (écart maximal 0,00003, soit l'arrondi flottant).
//
// La boucle de trames reçoit le modèle sous forme de FONCTION, pas de session :
// le module est ainsi testable sans onnxruntime, et une fonction identité doit
// rendre le signal d'entrée inchangé — ce qui vérifie d'un coup le fenêtrage, le
// cadrage, le recouvrement et l'absence de normalisation parasite.
import { fft } from "./fft";

export const GTCRN_SAMPLE_RATE = 16000;
export const GTCRN_NFFT = 512;
export const GTCRN_HOP = 256;
export const GTCRN_BINS = GTCRN_NFFT / 2 + 1; // 257

/** Fenêtre de Hann élevée à la puissance 0,5. */
export function fenetreRacineHann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  return w;
}

/**
 * Cadrage centré par réflexion, comme `torch.stft(center=True)`.
 *
 * Sans lui, la première moitié de trame manque et le modèle démarre sur un
 * silence qu'il prend pour du signal : le début du fichier ressort atténué.
 */
export function cadrerParReflexion(signal: Float32Array, pad: number): Float32Array {
  const out = new Float32Array(signal.length + 2 * pad);
  for (let i = 0; i < pad; i++) out[i] = signal[Math.min(signal.length - 1, pad - i)] ?? 0;
  out.set(signal, pad);
  for (let i = 0; i < pad; i++) {
    out[pad + signal.length + i] = signal[Math.max(0, signal.length - 2 - i)] ?? 0;
  }
  return out;
}

/** Nombre de trames qu'un signal de cette longueur produira. */
export function nombreDeTrames(longueur: number, nfft = GTCRN_NFFT, hop = GTCRN_HOP): number {
  const cadre = longueur + nfft; // pad de nfft/2 de chaque côté
  return Math.max(0, Math.floor((cadre - nfft) / hop) + 1);
}

/**
 * Le modèle, vu par la boucle : une trame spectrale entre, une trame sort.
 *
 * Les deux sont des parties réelle et imaginaire entrelacées, `[re, im]` par
 * bin, soit 2 × 257 valeurs — la disposition exacte qu'attend le tenseur
 * `mix [1, 257, 1, 2]` de l'ONNX. Les caches restent la responsabilité de
 * l'appelant, qui seul connaît le moteur d'inférence.
 */
export type TraiterTrame = (spectre: Float32Array) => Promise<Float32Array>;

export interface OptionsDebruitage {
  /** Appelé avec une fraction entre 0 et 1. */
  surProgres?: (fraction: number) => void;
  /** Mélange avec l'entrée : 1 = sortie du modèle seule, 0 = entrée inchangée. */
  force?: number;
}

/**
 * Débruite un signal 16 kHz mono, trame par trame.
 *
 * Le `force` permet de doser : un débruitage complet supprime le bruit mais
 * emporte parfois une partie de la réverbération et du souffle qui font le
 * naturel d'une voix. C'est un mélange linéaire du signal traité et de l'original,
 * appliqué après synthèse — donc sans toucher au modèle.
 */
export async function debruiterParTrames(
  signal: Float32Array,
  traiter: TraiterTrame,
  options: OptionsDebruitage = {},
): Promise<Float32Array> {
  const force = Math.max(0, Math.min(1, options.force ?? 1));
  const pad = GTCRN_NFFT / 2;
  const w = fenetreRacineHann(GTCRN_NFFT);
  const cadre = cadrerParReflexion(signal, pad);
  const nbTrames = nombreDeTrames(signal.length);

  const accumulateur = new Float32Array(cadre.length);
  // Somme des fenêtres au carré, position par position. Au CŒUR du signal elle
  // vaut 1 — c'est la propriété de la racine de Hann à 50 % de recouvrement — mais
  // aux deux BORDS les trames manquent : les premiers et derniers échantillons ne
  // sont couverts qu'une fois au lieu de deux, et ressortent atténués. Mesuré
  // avant d'ajouter cette division : la fin d'un signal sortait à 0,864 de son
  // niveau, et la reconstruction plafonnait à 45 dB au lieu d'être exacte.
  // `torch.istft` fait cette même division ; s'en passer était le défaut.
  const normes = new Float32Array(cadre.length);
  const re = new Float64Array(GTCRN_NFFT);
  const im = new Float64Array(GTCRN_NFFT);
  const spectre = new Float32Array(GTCRN_BINS * 2);

  for (let f = 0; f < nbTrames; f++) {
    const debut = f * GTCRN_HOP;
    for (let i = 0; i < GTCRN_NFFT; i++) {
      re[i] = (cadre[debut + i] ?? 0) * w[i];
      im[i] = 0;
    }
    fft(re, im, false);
    for (let k = 0; k < GTCRN_BINS; k++) {
      spectre[k * 2] = re[k];
      spectre[k * 2 + 1] = im[k];
    }

    const traite = await traiter(spectre);

    // Reconstruction hermitienne : l'ONNX ne rend que les 257 bins utiles.
    for (let k = 0; k < GTCRN_BINS; k++) {
      re[k] = traite[k * 2];
      im[k] = traite[k * 2 + 1];
    }
    for (let k = GTCRN_BINS; k < GTCRN_NFFT; k++) {
      re[k] = re[GTCRN_NFFT - k];
      im[k] = -im[GTCRN_NFFT - k];
    }
    fft(re, im, true);
    for (let i = 0; i < GTCRN_NFFT; i++) {
      accumulateur[debut + i] += re[i] * w[i];
      normes[debut + i] += w[i] * w[i];
    }

    if (options.surProgres && (f % 64 === 0 || f === nbTrames - 1)) {
      options.surProgres((f + 1) / nbTrames);
    }
  }

  const sortie = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    const norme = normes[pad + i];
    // Le seuil protège du tout début et de la toute fin du tampon cadré, où la
    // fenêtre s'annule : diviser par ~0 y produirait des valeurs énormes.
    const traite = norme > 1e-8 ? accumulateur[pad + i] / norme : 0;
    sortie[i] = force === 1 ? traite : traite * force + signal[i] * (1 - force);
  }
  return sortie;
}

/**
 * Niveau des parties les plus CALMES d'un signal, en amplitude RMS.
 *
 * Sert à chiffrer ce qu'un débruitage a réellement fait. Le niveau global ne le
 * dit pas : il est dominé par la parole, qui doit justement être préservée, si
 * bien qu'un débruitage réussi le fait à peine bouger. Le décile inférieur des
 * trames, lui, mesure le plancher — c'est-à-dire le bruit.
 */
export function planchecherDeBruit(signal: Float32Array, echantillonsParTrame = 320): number {
  if (signal.length === 0) return 0;
  const niveaux: number[] = [];
  for (let d = 0; d + echantillonsParTrame <= signal.length; d += echantillonsParTrame) {
    let s = 0;
    for (let i = d; i < d + echantillonsParTrame; i++) s += signal[i] * signal[i];
    niveaux.push(Math.sqrt(s / echantillonsParTrame));
  }
  if (niveaux.length === 0) return 0;
  niveaux.sort((a, b) => a - b);
  return niveaux[Math.floor(niveaux.length * 0.1)];
}

/** Rapport signal/bruit entre un signal de référence et sa version dégradée, en dB. */
export function rapportSignalBruit(reference: Float32Array, mesure: Float32Array): number {
  const n = Math.min(reference.length, mesure.length);
  let signal = 0, bruit = 0;
  for (let i = 0; i < n; i++) {
    signal += reference[i] * reference[i];
    const d = mesure[i] - reference[i];
    bruit += d * d;
  }
  if (bruit === 0) return Infinity;
  if (signal === 0) return -Infinity;
  return 10 * Math.log10(signal / bruit);
}
