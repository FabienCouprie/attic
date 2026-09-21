// audio/concret.ts — Trois outils de la musique concrète : la vitesse variable, la convolution de
// deux sons, les résonateurs.
//
// POURQUOI ENSEMBLE. Ce sont les trois gestes qui manquaient au catalogue pour un compositeur
// électroacousticien, relevés le 2026-09-21 : on accélère une bande, on fait sonner un son par un
// autre, on accorde un bruit. Aucun ne suppose de modèle — ni note, ni instrument, ni hauteur
// écrite : chacun prend un son tel qu'il est et le transforme en un autre son.

import { estCourbe, valeursParametre } from "./courbe";

// ── Vitesse variable ─────────────────────────────────────────────────────────────────────────

/** Bornes de la transposition, en demi-tons : quatre octaves de part et d'autre. */
export const TRANSPOSITION_MAX = 48;
/** Au-delà, on refuse plutôt que de fabriquer en silence un fichier d'une heure. */
export const DUREE_SORTIE_MAX_S = 20 * 60;

/**
 * Les rapports de vitesse, un par échantillon de la SOURCE.
 *
 * LA COURBE SUIT LA SOURCE, ET NON LA SORTIE. La durée de la sortie dépend de la vitesse ; indexer la
 * courbe sur la sortie ferait dépendre la courbe d'elle-même. Indexée sur la source, elle décrit le
 * geste posé sur le matériau — « ralentir sur l'attaque, accélérer dans la résonance » — et la durée
 * de sortie en découle.
 *
 * LA COURSE EST EN DEMI-TONS, donc géométrique en vitesse : de −12 à +12, le milieu de la courbe
 * vaut la vitesse d'origine et non une vitesse de 1,25. C'est ainsi que l'oreille l'entend.
 */
export function rapportsDeVitesse(
  n: number, transposition: number, courbe?: unknown, bornes: { min: number; max: number } = { min: -12, max: 12 },
): Float32Array {
  const bornee = (st: number) => Math.max(-TRANSPOSITION_MAX, Math.min(TRANSPOSITION_MAX, st));
  const demiTons = estCourbe(courbe)
    ? valeursParametre(courbe, n, transposition, { min: bornee(bornes.min), max: bornee(bornes.max) })
    : new Float32Array(n).fill(bornee(transposition));
  return Float32Array.from(demiTons, (st) => Math.pow(2, bornee(st) / 12));
}

/** Les positions de lecture dans la source, une par échantillon de sortie. */
export function positionsDeLecture(rapports: Float32Array): Float64Array {
  const n = rapports.length;
  let attendu = 0;
  for (let i = 0; i < n; i++) attendu += 1 / rapports[i];
  const positions = new Float64Array(Math.ceil(attendu) + 2);
  let pos = 0, k = 0;
  while (pos < n && k < positions.length) {
    positions[k++] = pos;
    pos += rapports[Math.min(n - 1, Math.floor(pos))];
  }
  return positions.subarray(0, k);
}

/** Demi-largeur du noyau, en passages par zéro : assez pour que le repliement reste sous −60 dB. */
const DEMI_LARGEUR = 8;

/**
 * Lit la source à une position fractionnaire, par un sinus cardinal fenêtré dont la coupure suit la
 * vitesse.
 *
 * POURQUOI UNE COUPURE. Accélérer une bande de deux octaves pousse un 8 kHz à 32 kHz, au-delà de ce
 * qu'un fichier à 44,1 kHz peut porter ; une interpolation ordinaire le replierait à 12,1 kHz, un son
 * qui n'existait nulle part. La bande magnétique, elle, ne replie pas. Le noyau coupe donc à la
 * moitié de la fréquence d'échantillonnage divisée par la vitesse, et s'élargit d'autant.
 *
 * À vitesse 1 et position entière, le noyau vaut 1 au centre et 0 ailleurs : la source est rendue
 * exactement, sans le moindre lissage.
 */
function lireSinc(src: Float32Array, pos: number, coupure: number): number {
  // Le cas exact dit tout haut : en flottant, sin(π k) ne vaut pas tout à fait zéro.
  if (coupure === 1 && Number.isInteger(pos)) return pos >= 0 && pos < src.length ? src[pos] : 0;
  const demi = Math.ceil(DEMI_LARGEUR / coupure);
  const centre = Math.floor(pos);
  let somme = 0, poids = 0;
  for (let k = centre - demi + 1; k <= centre + demi; k++) {
    const x = pos - k;
    const ax = Math.abs(x);
    if (ax >= demi) continue;
    const arg = Math.PI * coupure * x;
    const sinc = ax < 1e-9 ? 1 : Math.sin(arg) / arg;
    const fenetre = 0.42 + 0.5 * Math.cos((Math.PI * x) / demi) + 0.08 * Math.cos((2 * Math.PI * x) / demi);
    const w = sinc * fenetre;
    poids += w;
    if (k >= 0 && k < src.length) somme += src[k] * w;
  }
  return poids > 0 ? somme / poids : 0;
}

/** La vitesse variable : la bande qu'on accélère ou qu'on freine, hauteur et durée liées. */
export function vitesseVariable(buffer: AudioBuffer, rapports: Float32Array): AudioBuffer {
  const positions = positionsDeLecture(rapports);
  if (positions.length / buffer.sampleRate > DUREE_SORTIE_MAX_S) {
    throw new Error(`la sortie durerait ${Math.round(positions.length / buffer.sampleRate / 60)} min, au-delà de ${DUREE_SORTIE_MAX_S / 60}`);
  }
  const sortie = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels, length: Math.max(1, positions.length), sampleRate: buffer.sampleRate,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c), dst = sortie.getChannelData(c);
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const r = rapports[Math.min(rapports.length - 1, Math.floor(p))];
      dst[i] = lireSinc(src, p, Math.min(1, 1 / r));
    }
  }
  return sortie;
}

// ── Convolution de deux sons ─────────────────────────────────────────────────────────────────

const pic = (b: AudioBuffer): number => {
  let m = 0;
  for (let c = 0; c < b.numberOfChannels; c++) { const x = b.getChannelData(c); for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); }
  return m;
};

async function reechantillonner(b: AudioBuffer, sr: number): Promise<AudioBuffer> {
  if (b.sampleRate === sr) return b;
  const off = new OfflineAudioContext(b.numberOfChannels, Math.max(1, Math.ceil(b.duration * sr)), sr);
  const s = off.createBufferSource();
  s.buffer = b; s.connect(off.destination); s.start(0);
  return off.startRendering();
}

/**
 * Convolue un son par un autre.
 *
 * Chaque échantillon du premier déclenche une copie du second, à sa hauteur : le résultat a le
 * spectre des DEUX — seules les fréquences communes survivent, multipliées — et la durée de leur
 * somme. C'est ce que fait une réverbération, dont le second son serait la réponse d'une salle ;
 * mais le second son peut être n'importe quoi, et c'est tout l'intérêt : une voix par un gong, un
 * frottement par une goutte. L'opération est symétrique : échanger les deux sons rend le même son.
 *
 * LE NIVEAU EST RAMENÉ À CELUI DU PREMIER SON. Une convolution brute de deux sons à pleine échelle
 * additionne des milliers d'échantillons, et sortirait à +40 dB ; rien de musical ne dépend de ce
 * chiffre. Le calcul passe par le nœud de convolution du navigateur, qui travaille par blocs en
 * transformée de Fourier.
 */
export async function convoluerDeuxSons(a: AudioBuffer, b: AudioBuffer, mixPct: number): Promise<AudioBuffer> {
  if (a.numberOfChannels > 2 || b.numberOfChannels > 2) {
    throw new Error("deux canaux au plus de chaque côté");
  }
  const sr = a.sampleRate;
  const reponse = await reechantillonner(b, sr);
  const n = a.length + reponse.length - 1;
  const canaux = Math.max(a.numberOfChannels, reponse.numberOfChannels);
  const off = new OfflineAudioContext(canaux, n, sr);
  const source = off.createBufferSource();
  source.buffer = a;
  const conv = off.createConvolver();
  conv.normalize = false;
  conv.buffer = reponse;
  source.connect(conv).connect(off.destination);
  source.start(0);
  const humide = await off.startRendering();

  const niveau = pic(humide) > 0 ? pic(a) / pic(humide) : 0;
  const mix = Math.max(0, Math.min(1, mixPct / 100));
  const sortie = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: sr });
  for (let c = 0; c < canaux; c++) {
    const h = humide.getChannelData(Math.min(c, humide.numberOfChannels - 1));
    const s = a.getChannelData(Math.min(c, a.numberOfChannels - 1));
    const d = sortie.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = h[i] * niveau * mix + (i < s.length ? s[i] : 0) * (1 - mix);
  }
  return sortie;
}

// ── Résonateurs ──────────────────────────────────────────────────────────────────────────────

export type StructureResonateurs = "harmonique" | "impaire" | "barre" | "accord";

/**
 * Les rapports de fréquence des résonateurs, au-dessus de la fondamentale.
 *
 * La barre libre suit la théorie des poutres : les racines de cos β · ch β = 1, soit 4,730, 7,853,
 * 10,996, puis (2n + 1) π / 2 à mieux qu'un millième ; les fréquences vont comme β², d'où
 * 1 ; 2,756 ; 5,404 ; 8,933… — les mêmes que la « Barre modale » du catalogue. L'accord répète les
 * intervalles donnés d'octave en octave jusqu'au nombre voulu.
 */
export function rapportsResonateurs(structure: StructureResonateurs, nombre: number, intervalles: number[] = [0, 4, 7]): number[] {
  const n = Math.max(1, Math.min(64, Math.round(nombre)));
  if (structure === "impaire") return Array.from({ length: n }, (_, k) => 2 * k + 1);
  if (structure === "barre") {
    const betas = [4.7300407449, 7.8532046241, 10.9956078380];
    const beta = (k: number) => betas[k] ?? ((2 * (k + 1) + 1) * Math.PI) / 2;
    return Array.from({ length: n }, (_, k) => (beta(k) / betas[0]) ** 2);
  }
  if (structure === "accord") {
    const pas = intervalles.length ? [...intervalles].sort((x, y) => x - y) : [0];
    const r: number[] = [];
    for (let octave = 0; r.length < n && octave < 12; octave++) {
      for (const st of pas) { if (r.length < n) r.push(Math.pow(2, (st + 12 * octave) / 12)); }
    }
    return r;
  }
  return Array.from({ length: n }, (_, k) => k + 1);
}

export interface OptionsResonateurs {
  fondamentale: number;
  rapports: number[];
  /** Temps de décroissance de 60 dB, en secondes. */
  t60: number;
  /** 100 : tous les résonateurs au même niveau ; 0 : le k-ième à 1/k². */
  brillance: number;
  mix: number;
  /** La fondamentale échantillon par échantillon, si une courbe la pilote. */
  fondamentales?: Float32Array | null;
}

/**
 * Un banc de résonateurs accordés, que n'importe quel son fait sonner.
 *
 * Chaque résonateur est un filtre à deux pôles de rayon r = 10^(−3 / (T60 · sr)) : sa réponse à une
 * impulsion décroît de 60 dB en T60 secondes, ce qui est le réglage qu'un compositeur a en tête, et
 * non un facteur de qualité. Son gain est normalisé à 1 à la résonance, pour que le nombre de
 * résonateurs et leur finesse ne décident pas du niveau.
 *
 * On lui ajoute une queue de T60 secondes, plafonnée à vingt : un résonateur qu'on coupe à la fin
 * du son d'entrée perdrait précisément ce qu'on est venu chercher.
 */
export function resonateurs(buffer: AudioBuffer, o: OptionsResonateurs): AudioBuffer {
  const sr = buffer.sampleRate, nyquist = sr / 2;
  const t60 = Math.max(0.01, o.t60);
  const queue = Math.round(Math.min(20, t60) * sr);
  const n = buffer.length + queue;
  const r = Math.pow(10, -3 / (t60 * sr));
  const exposant = 2 * (1 - Math.max(0, Math.min(100, o.brillance)) / 100);
  const poids = o.rapports.map((_, k) => Math.pow(1 / (k + 1), exposant));
  const humide = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: n, sampleRate: sr });

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const x = buffer.getChannelData(c), y = humide.getChannelData(c);
    const y1 = new Float64Array(o.rapports.length), y2 = new Float64Array(o.rapports.length);
    // Coefficients fixes sans courbe ; recalculés à chaque échantillon avec une.
    const coef = (f0: number) => o.rapports.map((q) => {
      const f = f0 * q;
      if (f <= 0 || f >= nyquist * 0.98) return null;
      const w = (2 * Math.PI * f) / sr;
      return { b: 2 * r * Math.cos(w), g: (1 - r) * Math.sqrt(1 - 2 * r * Math.cos(2 * w) + r * r) };
    });
    const fixes = o.fondamentales ? null : coef(o.fondamentale);
    for (let i = 0; i < n; i++) {
      const cs = fixes ?? coef(o.fondamentales![Math.min(i, o.fondamentales!.length - 1)]);
      const entree = i < x.length ? x[i] : 0;
      let s = 0;
      for (let k = 0; k < cs.length; k++) {
        const ck = cs[k];
        if (!ck) continue;
        const v = ck.g * entree + ck.b * y1[k] - r * r * y2[k];
        y2[k] = y1[k]; y1[k] = v;
        s += v * poids[k];
      }
      y[i] = s;
    }
  }

  const niveau = pic(humide) > 0 ? pic(buffer) / pic(humide) : 0;
  const mix = Math.max(0, Math.min(1, o.mix / 100));
  const sortie = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: n, sampleRate: sr });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const h = humide.getChannelData(c), s = buffer.getChannelData(c), d = sortie.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = h[i] * niveau * mix + (i < s.length ? s[i] : 0) * (1 - mix);
  }
  return sortie;
}
