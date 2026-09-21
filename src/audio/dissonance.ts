// audio/dissonance.ts — La dissonance mesurée, et la gamme qu'un timbre appelle.
//
// D'après Reinier Plomp et Willem Levelt, « Tonal Consonance and Critical Bandwidth », Journal of
// the Acoustical Society of America 38(4), 1965 ; et William Sethares, « Local consonance and the
// relationship between timbre and scale », JASA 94(3), 1993, repris dans « Tuning, Timbre,
// Spectrum, Scale », Springer, 1998 (2ᵉ édition 2005).
//
// CE QUI MANQUAIT, ET POURQUOI C'EST LE PLUS BEAU DES TROUS. Attic mesure des spectres — analyseur,
// spectrogramme, centroïde, décompositions SMS et STN. Attic connaît les tempéraments historiques.
// RIEN NE RELIE LES DEUX. Or c'est exactement la thèse de Sethares : la consonance ne tient pas à
// des intervalles fixés d'avance, mais à l'accord entre le SPECTRE d'un son et la GAMME qu'on lui
// applique. Un son dont les partiels sont harmoniques appelle les rapports simples ; un son dont
// les partiels ne le sont pas en appelle d'autres, et les gammes qui en découlent n'ont aucune
// raison de ressembler aux nôtres.
//
// LE MODÈLE, ET CE QU'IL DIT. Deux sons purs voisins battent : tant qu'ils tombent dans la même
// bande critique, l'oreille ne les sépare pas et entend une rugosité. La dissonance de deux
// partiels est donc nulle à l'unisson, monte jusqu'à un maximum situé vers un quart de la bande
// critique, puis retombe quand ils s'écartent assez pour être entendus séparément. Sethares en
// donne une forme close, ajustée sur les mesures de Plomp et Levelt :
//
//     d(f₁, f₂) = min(a₁, a₂) · ( e^(−3,5·s·Δf) − e^(−5,75·s·Δf) ),   s = 0,24 / (0,0207·f₁ + 18,96)
//
// LA COURBE DE DISSONANCE d'un timbre est ce que l'on obtient en faisant sonner ce timbre CONTRE
// LUI-MÊME transposé, pour tous les intervalles d'une octave ou deux. Ses creux sont les
// intervalles que ce timbre supporte — c'est-à-dire sa gamme. Pour un son harmonique, on y
// retrouve l'octave, la quinte, la quarte, les tierces : l'intonation juste n'est pas un choix
// culturel mais la conséquence d'un spectre harmonique, et c'est ce que le calcul montre.

/** Un partiel : une fréquence et son amplitude. */
export interface Partiel { frequence: number; amplitude: number }

// Les constantes de Sethares, ajustées sur les courbes de Plomp et Levelt.
const X_ETOILE = 0.24;   // position du maximum de dissonance, en fraction de bande critique
const S1 = 0.0207;
const S2 = 18.96;
const B1 = 3.5;
const B2 = 5.75;

/**
 * La dissonance de deux partiels.
 *
 * Nulle à l'unisson — deux sons identiques ne battent pas —, maximale vers un quart de la bande
 * critique, décroissante ensuite. L'amplitude retenue est la PLUS PETITE des deux : un partiel
 * fort ne rend pas rugueux un partiel inaudible, c'est le plus faible des deux qui borne ce qu'on
 * entend du battement.
 */
export function dissonancePaire(f1: number, a1: number, f2: number, a2: number): number {
  const [basse, haute] = f1 <= f2 ? [f1, f2] : [f2, f1];
  if (basse <= 0) return 0;
  const ecart = haute - basse;
  const s = X_ETOILE / (S1 * basse + S2);
  return Math.min(a1, a2) * (Math.exp(-B1 * s * ecart) - Math.exp(-B2 * s * ecart));
}

/** La dissonance intrinsèque d'un ensemble de partiels : toutes les paires, une fois chacune. */
export function dissonanceSpectre(partiels: readonly Partiel[]): number {
  let total = 0;
  for (let i = 0; i < partiels.length; i++) {
    for (let j = i + 1; j < partiels.length; j++) {
      total += dissonancePaire(
        partiels[i].frequence, partiels[i].amplitude,
        partiels[j].frequence, partiels[j].amplitude,
      );
    }
  }
  return total;
}

/**
 * La dissonance d'un timbre contre lui-même transposé du rapport `alpha`.
 *
 * On réunit les deux spectres et l'on compte TOUTES les paires, y compris celles internes à
 * chaque copie. Celles-ci ajoutent une constante qui ne dépend pas de l'intervalle — la dissonance
 * propre du timbre, présente même à l'unisson — et c'est elle qui fait que la courbe ne descend
 * jamais à zéro. La retirer donnerait une courbe plus jolie et moins vraie : un timbre rugueux
 * l'est à tous les intervalles.
 */
export function dissonanceIntervalle(partiels: readonly Partiel[], alpha: number): number {
  const transpose = partiels.map((p) => ({ frequence: p.frequence * alpha, amplitude: p.amplitude }));
  return dissonanceSpectre([...partiels, ...transpose]);
}

export interface PointCourbe { alpha: number; cents: number; dissonance: number }

/**
 * La courbe de dissonance, échantillonnée en CENTS et non en rapport de fréquence.
 *
 * Le pas régulier en cents plutôt qu'en rapport n'est pas un détail : l'oreille entend les
 * intervalles en logarithme, et un pas régulier en rapport donnerait une courbe deux fois plus
 * fine dans l'aigu de l'intervalle que dans son grave, donc des creux inégalement localisés.
 */
export function courbeDissonance(
  partiels: readonly Partiel[], centsMax = 1200, pasCents = 1,
): PointCourbe[] {
  const points: PointCourbe[] = [];
  for (let c = 0; c <= centsMax; c += pasCents) {
    const alpha = Math.pow(2, c / 1200);
    points.push({ alpha, cents: c, dissonance: dissonanceIntervalle(partiels, alpha) });
  }
  return points;
}

/**
 * Les creux de la courbe : les intervalles que ce timbre supporte.
 *
 * `profondeurMin` écarte les creux insignifiants — une courbe échantillonnée finement en a
 * toujours quelques-uns dus au calcul plutôt qu'à la musique. Un creux est retenu s'il descend
 * d'au moins cette fraction de l'amplitude totale de la courbe sous ses deux sommets voisins.
 *
 * LES DEUX BOUTS NE SONT JAMAIS RETENUS, faute d'avoir un voisin de chaque côté. Cela compte au
 * moment de choisir l'étendue : une courbe calculée jusqu'à 1200 cents exactement ne rendra PAS
 * l'octave, qui est pourtant son creux le plus profond. Il faut demander un peu au-delà.
 */
export function creux(points: readonly PointCourbe[], profondeurMin = 0.01): PointCourbe[] {
  if (points.length < 3) return [];
  const valeurs = points.map((p) => p.dissonance);
  const etendue = Math.max(...valeurs) - Math.min(...valeurs);
  if (etendue <= 0) return [];
  const retenus: PointCourbe[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    if (!(valeurs[i] <= valeurs[i - 1] && valeurs[i] < valeurs[i + 1])) continue;
    // Remonter des deux côtés jusqu'au sommet, pour mesurer la profondeur réelle du creux.
    let g = i, d = i;
    while (g > 0 && valeurs[g - 1] >= valeurs[g]) g--;
    while (d < points.length - 1 && valeurs[d + 1] >= valeurs[d]) d++;
    const profondeur = Math.min(valeurs[g], valeurs[d]) - valeurs[i];
    if (profondeur / etendue >= profondeurMin) retenus.push(points[i]);
  }
  return retenus;
}

/** Les rapports simples, pour nommer un creux quand il en approche un. */
const RAPPORTS: [number, number, string][] = [
  [1, 1, "1/1"], [16, 15, "16/15"], [9, 8, "9/8"], [6, 5, "6/5"], [5, 4, "5/4"],
  [4, 3, "4/3"], [7, 5, "7/5"], [3, 2, "3/2"], [8, 5, "8/5"], [5, 3, "5/3"],
  [7, 4, "7/4"], [9, 5, "9/5"], [15, 8, "15/8"], [2, 1, "2/1"],
];

/** Le rapport simple le plus proche d'un intervalle, s'il en est assez près. */
export function rapportProche(cents: number, toleranceCents = 15): string | null {
  let meilleur: string | null = null;
  let ecartMin = toleranceCents;
  for (const [n, d, nom] of RAPPORTS) {
    const c = 1200 * Math.log2(n / d);
    const ecart = Math.abs(c - cents);
    if (ecart <= ecartMin) { ecartMin = ecart; meilleur = nom; }
  }
  return meilleur;
}

/**
 * Un timbre harmonique de `n` partiels, dont l'amplitude décroît comme `1/k^decroissance`.
 *
 * Sert de référence : c'est le timbre dont Sethares montre que la courbe de dissonance retrouve
 * l'intonation juste, et c'est donc lui qui permet de vérifier que le calcul est juste.
 */
export function timbreHarmonique(fondamentale: number, n: number, decroissance = 1): Partiel[] {
  return Array.from({ length: n }, (_, k) => ({
    frequence: fondamentale * (k + 1),
    amplitude: Math.pow(k + 1, -decroissance),
  }));
}

/**
 * Un timbre ÉTIRÉ : les partiels suivent `f·k^(log₂ e)` au lieu de `f·k`, où `e` est le facteur
 * d'étirement de l'octave.
 *
 * C'est l'expérience décisive de Sethares. À `e = 2`, le timbre est harmonique et la gamme qui en
 * sort est la nôtre. À `e = 2,1`, tous les creux se déplacent : l'octave n'est plus à 1200 cents
 * mais à 1249, et la quinte suit. Un timbre inharmonique appelle une autre gamme, et ce n'est pas
 * une métaphore — c'est ce que la courbe montre.
 */
export function timbreEtire(fondamentale: number, n: number, etirement: number, decroissance = 1): Partiel[] {
  const puissance = Math.log2(etirement);
  return Array.from({ length: n }, (_, k) => ({
    frequence: fondamentale * Math.pow(k + 1, puissance),
    amplitude: Math.pow(k + 1, -decroissance),
  }));
}

/**
 * La rugosité d'un son au fil du temps : une valeur par trame.
 *
 * NORMALISÉE PAR L'ÉNERGIE DES PARTIELS RETENUS, et c'est nécessaire. La dissonance brute est
 * proportionnelle au carré des amplitudes : un passage fort serait déclaré rugueux et un passage
 * doux consonant, alors que c'est le même accord joué à deux nuances. Rapporter à l'énergie donne
 * une mesure de la QUALITÉ du son et non de son volume — ce qu'on veut d'un indicateur de
 * dissonance.
 */
export function rugositeParTrame(
  trames: readonly (Float64Array | Float32Array)[], frequence: number, taille: number, combien = 12,
): number[] {
  return trames.map((m) => {
    const partiels = partielsDepuisModules(m, frequence, taille, combien);
    if (partiels.length < 2) return 0;
    const energie = partiels.reduce((s, p) => s + p.amplitude * p.amplitude, 0);
    return energie > 0 ? dissonanceSpectre(partiels) / energie : 0;
  });
}

/**
 * Les partiels les plus forts d'un spectre mesuré.
 *
 * On ne garde que les SOMMETS — une case plus forte que ses deux voisines —, faute de quoi un
 * partiel large serait compté plusieurs fois et pèserait autant que plusieurs notes.
 */
export function partielsDepuisModules(
  modules: Float64Array | Float32Array, frequence: number, taille: number, combien = 12,
): Partiel[] {
  const demi = Math.min(modules.length, Math.floor(taille / 2));
  const sommets: Partiel[] = [];
  for (let i = 1; i < demi - 1; i++) {
    if (modules[i] <= modules[i - 1] || modules[i] < modules[i + 1]) continue;
    // Interpolation parabolique : le sommet vrai tombe rarement au centre d'une case, et un
    // partiel mal situé de quelques hertz déplace les creux de la courbe de plusieurs cents.
    const a = modules[i - 1], b = modules[i], c = modules[i + 1];
    const denom = a - 2 * b + c;
    const decalage = Math.abs(denom) > 1e-12 ? (0.5 * (a - c)) / denom : 0;
    sommets.push({ frequence: ((i + decalage) * frequence) / taille, amplitude: b });
  }
  sommets.sort((x, y) => y.amplitude - x.amplitude);
  const gardes = sommets.slice(0, combien);
  const plusFort = gardes[0]?.amplitude ?? 1;
  return gardes
    .map((p) => ({ frequence: p.frequence, amplitude: plusFort > 0 ? p.amplitude / plusFort : 0 }))
    .sort((x, y) => x.frequence - y.frequence);
}
