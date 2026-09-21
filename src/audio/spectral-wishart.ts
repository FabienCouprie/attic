// audio/spectral-wishart.ts — Quatre mises en forme du spectre, d'après Trevor Wishart.
//
// D'après Trevor Wishart, « Audible Design: A Plain and Easy Introduction to Practical Sound
// Composition », Orpheus the Pantomime, 1994, et les programmes qu'il en a tirés pour le Composers
// Desktop Project — `SPEC TRACE`, `BLUR BLUR`, `BLUR FREEZE`, `FOCUS` et leur parenté.
//
// CE QUI MANQUAIT. Attic sait DÉCOMPOSER un spectre — sinusoïdes plus bruit (SMS), sinus plus
// transitoires plus bruit (STN), reconstruction de phase (PGHI), retard et formule spectrale — mais
// il ne sait pas le METTRE EN FORME. Décomposer répond à « de quoi ce son est-il fait » ; mettre en
// forme répond à « qu'est-ce que j'en garde, et comment je l'étale ». Ce sont deux gestes
// différents, et le second est celui du compositeur.
//
// CE QUE LES QUATRE ONT EN COMMUN, ET POURQUOI ILS VIVENT ENSEMBLE. Tous travaillent sur la même
// suite de trames : analyse par transformée de Fourier à fenêtre glissante, transformation des
// trames, recollement. Écrire quatre fois l'analyse aurait été écrire quatre fois la même chose
// avec quatre occasions de se tromper sur le recollement — celui-ci est ici une seule fonction,
// éprouvée par le test qui compte : transformer par l'identité doit rendre le son d'origine.
//
// LE RECOLLEMENT, ET POURQUOI IL SE NORMALISE. Une fenêtre de Hann est posée à l'analyse ET à la
// synthèse : c'est ce qui évite qu'une trame modifiée ne laisse une marche à ses bords. Mais deux
// fenêtres multipliées ne s'additionnent plus à un, et la somme dépend du saut. Au lieu de choisir
// un saut où cela tombe juste, on ACCUMULE la somme des fenêtres au carré et l'on divise par elle :
// l'exactitude ne dépend alors plus du réglage, et un saut inhabituel ne fait pas baisser le son
// sans qu'on sache pourquoi.
import { fft } from "./fft";
import { creerFenetreHann, type TrameFFT } from "./commun";

/** Taille de trame par défaut : 2048 échantillons, soit 46 ms à 44 100 Hz. */
export const TAILLE_TRAME = 2048;
/** Saut par défaut : un quart de trame, le compromis habituel entre finesse et coût. */
export const SAUT = TAILLE_TRAME / 4;

/** Analyse : le signal découpé en trames fenêtrées, chacune transformée. */
export function analyser(donnees: Float32Array, taille = TAILLE_TRAME, saut = SAUT): TrameFFT[] {
  const fenetre = creerFenetreHann(taille);
  const trames: TrameFFT[] = [];
  for (let debut = 0; debut + taille <= donnees.length; debut += saut) {
    const re = new Float64Array(taille);
    const im = new Float64Array(taille);
    for (let i = 0; i < taille; i++) re[i] = donnees[debut + i] * fenetre[i];
    fft(re, im, false);
    trames.push({ re, im });
  }
  return trames;
}

/**
 * Recollement : les trames transformées, remises bout à bout.
 *
 * Le `longueur` demandé est celui du signal d'origine ; ce qui dépasse est coupé, ce qui manque
 * reste à zéro. La division par la somme des fenêtres au carré est ce qui rend l'opération exacte
 * quel que soit le saut (cf. l'en-tête).
 */
export function recoller(trames: TrameFFT[], longueur: number, taille = TAILLE_TRAME, saut = SAUT): Float32Array {
  const fenetre = creerFenetreHann(taille);
  const sortie = new Float64Array(longueur);
  const poids = new Float64Array(longueur);
  trames.forEach((trame, k) => {
    const re = Float64Array.from(trame.re);
    const im = Float64Array.from(trame.im);
    fft(re, im, true);
    const debut = k * saut;
    for (let i = 0; i < taille; i++) {
      const j = debut + i;
      if (j >= longueur) break;
      sortie[j] += re[i] * fenetre[i];
      poids[j] += fenetre[i] * fenetre[i];
    }
  });
  return Float32Array.from(sortie, (v, i) => (poids[i] > 1e-9 ? v / poids[i] : 0));
}

/** Les modules d'une trame, un par case. */
export function modules(trame: TrameFFT): Float64Array {
  const n = trame.re.length;
  const m = new Float64Array(n);
  for (let i = 0; i < n; i++) m[i] = Math.hypot(trame.re[i], trame.im[i]);
  return m;
}

/** Une trame dont on garde les phases et dont on impose les modules. */
export function imposerModules(trame: TrameFFT, cibles: Float64Array): TrameFFT {
  const n = trame.re.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const m = Math.hypot(trame.re[i], trame.im[i]);
    if (m < 1e-12) { re[i] = cibles[i]; im[i] = 0; continue; }
    const k = cibles[i] / m;
    re[i] = trame.re[i] * k;
    im[i] = trame.im[i] * k;
  }
  return { re, im };
}

// ── 1. TRAÇAGE SPECTRAL ────────────────────────────────────────────────────────────────────────
//
// Ne garder que les N cases les plus fortes de chaque trame, et faire taire les autres.
//
// CE QUE CELA FAIT ENTENDRE, et c'est la raison d'être du procédé : un son complexe cesse d'être
// une masse et devient quelques LIGNES qui se tressent. À N = 1, on entend le partiel dominant se
// déplacer — une mélodie que le son contenait sans qu'on l'entende. À N = 60, on entend le son,
// débarrassé de son bruit de fond. Ce n'est donc pas un filtre : un filtre garde une RÉGION du
// spectre, décidée d'avance ; le traçage garde ce qui est fort, où que cela se trouve, et cela
// change à chaque trame.
export function tracer(trames: TrameFFT[], nGardees: number): TrameFFT[] {
  return trames.map((trame) => {
    const n = trame.re.length;
    const demi = n >> 1;
    const m = modules(trame);
    // On ne classe que la moitié utile : au-delà, le spectre d'un signal réel est le reflet
    // conjugué de la première moitié, et garder un partiel sans son reflet rendrait un signal
    // complexe — c'est-à-dire du bruit à la resynthèse.
    const rangs = Array.from({ length: demi + 1 }, (_, i) => i).sort((a, b) => m[b] - m[a]);
    const garder = new Uint8Array(n);
    for (let k = 0; k < Math.min(nGardees, rangs.length); k++) {
      const i = rangs[k];
      garder[i] = 1;
      if (i > 0 && i < demi) garder[n - i] = 1;
    }
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      if (!garder[i]) continue;
      re[i] = trame.re[i];
      im[i] = trame.im[i];
    }
    return { re, im };
  });
}

// ── 2. FLOU SPECTRAL ───────────────────────────────────────────────────────────────────────────
//
// Moyenner les modules sur plusieurs trames voisines.
//
// CE QUE CELA FAIT, ET CE QUE CELA NE FAIT PAS. Cela étale le son DANS LE TEMPS sans changer sa
// durée : une attaque devient une montée, une note qui change de hauteur devient un accord tenu.
// Aucun étirement ne fait cela — Paulstretch et le vocodeur de phase allongent la durée, donc
// déplacent tout ce qui suit ; ici la fin arrive à l'heure, mais on ne sait plus quand les choses
// ont commencé. C'est un flou, au sens photographique : le bougé, pas le ralenti.
export function flouter(trames: TrameFFT[], largeur: number): TrameFFT[] {
  const w = Math.max(1, Math.round(largeur));
  if (w <= 1) return trames;
  const tousModules = trames.map(modules);
  return trames.map((trame, k) => {
    const n = trame.re.length;
    const moyenne = new Float64Array(n);
    const a = Math.max(0, k - (w >> 1));
    const z = Math.min(trames.length - 1, a + w - 1);
    for (let j = a; j <= z; j++) {
      const m = tousModules[j];
      for (let i = 0; i < n; i++) moyenne[i] += m[i];
    }
    const inv = 1 / (z - a + 1);
    for (let i = 0; i < n; i++) moyenne[i] *= inv;
    // Les phases restent celles de la trame : elles portent le grain du son, et les moyenner
    // rendrait un signal sans relief — les phases d'un son ne s'additionnent pas comme ses
    // énergies.
    return imposerModules(trame, moyenne);
  });
}

// ── 3. GEL SPECTRAL ────────────────────────────────────────────────────────────────────────────
//
// Tenir le spectre d'un instant, pour toute la suite.
//
// EN QUOI CELA DIFFÈRE DU GEL GRANULAIRE, déjà présent. Celui-là boucle un morceau de SIGNAL : on
// entend la boucle, sa période et ses raccords, et le son garde le grain du bout qu'on a pris. Ici
// on tient une ANALYSE : les modules sont ceux de l'instant choisi, mais les phases continuent
// d'avancer comme si le son se prolongeait. Il n'y a donc pas de période, pas de raccord, et le
// son ne bouge plus du tout — c'est l'immobilité, pas la répétition.
//
// LES PHASES AVANCENT DE LA VALEUR NOMINALE DE CHAQUE CASE : la case `i` d'une trame de taille `N`
// porte la pulsation `2πi/N`, qui avance de `2πi·saut/N` d'une trame à la suivante. Les figer
// aurait donné un son métallique, toutes les cases repartant ensemble à chaque trame.
export function geler(trames: TrameFFT[], indexGel: number, taille = TAILLE_TRAME, saut = SAUT): TrameFFT[] {
  if (trames.length === 0) return trames;
  const k0 = Math.max(0, Math.min(trames.length - 1, Math.round(indexGel)));
  const tenus = modules(trames[k0]);
  const n = trames[k0].re.length;
  const demi = n >> 1;
  // Les phases de départ, celles de la trame gelée.
  const phase0 = new Float64Array(n);
  for (let i = 0; i < n; i++) phase0[i] = Math.atan2(trames[k0].im[i], trames[k0].re[i]);
  return trames.map((trame, k) => {
    if (k < k0) return trame;
    const avance = k - k0;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i <= demi; i++) {
      const phi = phase0[i] + (2 * Math.PI * i * saut * avance) / taille;
      const a = tenus[i] * Math.cos(phi);
      const b = tenus[i] * Math.sin(phi);
      re[i] = a; im[i] = b;
      // Le reflet conjugué, sans quoi le signal rendu ne serait pas réel.
      if (i > 0 && i < demi) { re[n - i] = a; im[n - i] = -b; }
    }
    return { re, im };
  });
}

// ── 4. GLISSANDO INTÉRIEUR ─────────────────────────────────────────────────────────────────────
//
// Garder l'enveloppe de formants du son, et remplacer ce qu'il y a dessous par un ton de Risset.
//
// D'OÙ CELA VIENT. Wishart appelle cela « inner glissando » : l'illusion de Shepard — décrite par
// Roger Shepard en 1964, rendue continue par Jean-Claude Risset — habillée du timbre d'un son
// réel. Attic a déjà le « Glissando de Risset », qui produit l'illusion NUE ; ce qui manquait est
// de la faire passer par la bouche de quelqu'un. L'enveloppe de formants est ce qui fait qu'une
// voyelle est un « a » ou un « ou » : elle ne dépend pas de la hauteur, et c'est précisément pour
// cela qu'on peut changer la hauteur sans changer la voyelle.
//
// COMMENT L'ENVELOPPE EST PRISE. Par moyenne glissante sur les cases — un lissage en fréquence,
// qui garde les bosses larges (les formants) et efface les raies fines (les partiels). C'est le
// geste le plus simple qui sépare les deux, et il n'exige pas de cepstre.

/** L'enveloppe de formants d'une trame : le spectre lissé en fréquence. */
export function enveloppeFormants(m: Float64Array, largeur: number): Float64Array {
  const n = m.length;
  const demi = n >> 1;
  // Largeur nulle : aucun lissage, l'enveloppe est le spectre. C'est le contrat le plus simple à
  // se rappeler, et il donne un point de comparaison — brancher zéro doit rendre le son d'origine.
  const w = Math.max(0, Math.round(largeur));
  const env = new Float64Array(n);
  // Sommes cumulées plutôt qu'une somme glissante : la fenêtre se rétrécit aux deux bords, et une
  // somme glissante y demande deux cas particuliers qu'on écrit de travers une fois sur deux.
  const cumul = new Float64Array(demi + 2);
  for (let i = 0; i <= demi; i++) cumul[i + 1] = cumul[i] + m[i];
  for (let i = 0; i <= demi; i++) {
    const a = Math.max(0, i - w), z = Math.min(demi, i + w);
    env[i] = (cumul[z + 1] - cumul[a]) / (z - a + 1);
    if (i > 0 && i < demi) env[n - i] = env[i];
  }
  return env;
}

export interface OptionsGlissandoInterieur {
  /** Octaves par seconde. Positif : cela monte sans fin ; négatif : cela descend. */
  vitesse: number;
  /** Nombre d'octaves que l'illusion empile. Moins de trois et l'on entend la supercherie. */
  octaves: number;
  /** Largeur du lissage qui extrait les formants, en cases. */
  lissage: number;
  taille?: number;
  saut?: number;
  frequence: number;
}

/**
 * Le spectre d'un ton de Risset à un instant donné, avant habillage.
 *
 * Les partiels sont espacés d'une octave et leur amplitude suit une cloche posée sur l'échelle des
 * octaves : un partiel naît en bas, traverse, et s'éteint en haut, si bien qu'on ne surprend
 * jamais ni son apparition ni sa disparition. C'est tout le mécanisme de l'illusion.
 *
 * UNE LIMITE À CONNAÎTRE : les partiels sont posés sur la case la plus proche, et les cases du bas
 * sont larges. Sur une trame de 2048 points à 44 100 Hz, une case vaut 21,5 Hz : les deux ou trois
 * octaves les plus graves tombent donc à côté de leur fréquence — mesuré, un rapport de 1,67 au
 * lieu de 2 entre la troisième et la quatrième. Cela ne s'entend pas, parce que la cloche les
 * garde très faibles, mais il ne faut pas y chercher une justesse qui n'y est pas.
 */
export function spectreRisset(n: number, frequence: number, position: number, octaves: number): Float64Array {
  const demi = n >> 1;
  const spectre = new Float64Array(n);
  const base = 27.5; // le la le plus grave d'un piano : le bas de la cloche
  const centre = octaves / 2;
  const largeur = octaves / 4;
  for (let o = -1; o <= octaves + 1; o++) {
    const rang = o + (position - Math.floor(position));
    const f = base * Math.pow(2, rang);
    const i = Math.round((f * n) / frequence);
    if (i <= 0 || i > demi) continue;
    const d = (rang - centre) / largeur;
    spectre[i] += Math.exp(-0.5 * d * d);
    // Le reflet conjugué : un spectre qui n'est pas symétrique rend un signal COMPLEXE, c'est-à-
    // dire du bruit une fois recollé. C'est la faute qui ne se voit pas dans le code et s'entend
    // tout de suite.
    if (i > 0 && i < demi) spectre[n - i] += Math.exp(-0.5 * d * d);
  }
  return spectre;
}

export function glissandoInterieur(trames: TrameFFT[], o: OptionsGlissandoInterieur): TrameFFT[] {
  const taille = o.taille ?? TAILLE_TRAME;
  const saut = o.saut ?? SAUT;
  const parSeconde = saut / o.frequence;
  return trames.map((trame, k) => {
    const n = trame.re.length;
    const env = enveloppeFormants(modules(trame), o.lissage);
    const position = k * parSeconde * o.vitesse;
    const risset = spectreRisset(n, o.frequence, position, o.octaves);
    const cibles = new Float64Array(n);
    for (let i = 0; i < n; i++) cibles[i] = env[i] * risset[i];
    return imposerModules(trame, cibles);
  });
}
