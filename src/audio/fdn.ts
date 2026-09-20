// audio/fdn.ts — Une réverbération dont la décroissance dépend de la fréquence.
//
// D'après Jean-Marc Jot et Antoine Chaigne, « Digital delay networks for designing artificial
// reverberators », AES Convention 90, 1991 — le réseau de retards rétroactifs (FDN) et, surtout, la
// façon d'y contrôler EXPLICITEMENT le temps de réverbération par bande ; le contrôle exact du RT60
// a été repris et précisé par Sebastian J. Schlecht et Emanuël A. P. Habets, « Accurate
// reverberation time control in feedback delay networks », DAFx-17.
//
// CE QUI MANQUAIT, et c'est le seul manque réel des cinq réverbérations déjà là : AUCUNE n'a de
// décroissance dépendante de la fréquence. La convolution demande un fichier de réponse ; les
// autres — simple, fractale, progressive, velours — décroissent partout au même rythme. Or c'est
// exactement ce qu'une salle ne fait pas : l'air et les matériaux absorbent l'aigu bien plus vite
// que le grave, si bien qu'une vraie queue de réverbération S'ASSOMBRIT en s'éteignant. Sans cela,
// une réverbération sonne comme un effet et non comme un lieu.
//
// COMMENT MARCHE UN FDN. N lignes à retard, bouclées les unes sur les autres par une matrice de
// rétroaction. Si cette matrice est UNITAIRE — elle conserve l'énergie —, le réseau ne s'éteint
// jamais et sonne comme une salle infinie ; c'est alors l'atténuation placée sur chaque ligne qui
// décide de la décroissance. Séparer ainsi la DIFFUSION (la matrice) de l'ABSORPTION (les filtres)
// est l'idée de l'article, et c'est elle qui rend le RT60 réglable sans toucher au reste.
//
// LE CALCUL DE L'ABSORPTION, dérivé et non recopié. Une ligne de m échantillons est parcourue
// `fs/m` fois par seconde ; pour que l'énergie perde 60 dB en T secondes, chaque passage doit coûter
// `60·m/(T·fs)` décibels, soit un gain de `10^(−3m/(T·fs))`. Pour que ce gain dépende de la
// fréquence, on met sur chaque ligne un passe-bas d'ordre un, `g(1−a)/(1−a·z⁻¹)`, dont le module
// vaut `g` au continu et `g(1−a)/√(1 − 2a·cos ω + a²)` ailleurs. On fixe donc g par le temps du
// grave, puis on résout en `a` pour que le module tombe juste à une FRÉQUENCE DE RÉFÉRENCE choisie :
//
//     g = 10^(−3m/(T_bas·fs))     et     (1−a)/√(1 − 2a·cos ω₁ + a²) = r₁ = 10^(−3m/(T_haut·fs))/g
//     soit   (1−r₁²)·a² + 2(r₁²·cos ω₁ − 1)·a + (1−r₁²) = 0
//
// Les deux racines de cette équation sont inverses l'une de l'autre — leur produit vaut 1 —, et on
// garde donc celle de module inférieur à un, qui est la seule stable.
//
// POURQUOI UNE FRÉQUENCE DE RÉFÉRENCE ET NON NYQUIST. Une première version résolvait à Nyquist, ce
// qui est plus simple — `(1−a)/(1+a) = r` — mais rend le réglage trompeur : la mesure donnait alors
// 0,73 s à 18 kHz pour 0,50 demandé, l'exactitude tombant à une fréquence que personne n'écoute.
// En résolvant à 8 kHz, le réglage annonce ce qu'on entend. C'est ce que les tests VÉRIFIENT, par
// l'intégrale de Schroeder sur la réponse obtenue, bande par bande.
import { courbeSchroeder } from "./velours";

export interface OptionsFdn {
  sampleRate: number;
  /** Nombre de lignes à retard : une puissance de deux, pour la matrice de Hadamard. */
  lignes?: number;
  /** Retard le plus court, en millisecondes — la « taille » de la salle. */
  retardMin?: number;
  retardMax?: number;
  /** Temps de réverbération dans le grave, en secondes. */
  rt60Bas?: number;
  /** Temps de réverbération dans l'aigu. Plus court que le grave dans toute salle réelle. */
  rt60Haut?: number;
  /** Fréquence à laquelle `rt60Haut` est exact, en Hz. */
  freqRef?: number;
  /** Queue ajoutée après le son, en secondes. Absente : le RT60 le plus long. */
  queue?: number;
  /** Largeur stéréo, de 0 (mono) à 1. */
  largeur?: number;
  melange?: number;
}

/** Vrai si n est premier. Sert à choisir des retards sans diviseur commun. */
export function estPremier(n: number): boolean {
  if (n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
  return true;
}

/**
 * Des longueurs de retard PREMIÈRES ENTRE ELLES, réparties géométriquement.
 *
 * Deux retards ayant un diviseur commun font coïncider leurs échos périodiquement, ce qui s'entend
 * comme une résonance métallique. Les prendre premiers l'écarte par construction : deux nombres
 * premiers distincts n'ont aucun diviseur commun. La répartition géométrique plutôt que linéaire
 * donne une densité d'échos plus régulière à l'oreille.
 */
export function retardsPremiers(n: number, minEch: number, maxEch: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const cible = Math.round(minEch * Math.pow(maxEch / minEch, n > 1 ? i / (n - 1) : 0));
    let p = Math.max(2, cible);
    while (!estPremier(p) || out.includes(p)) p++;
    out.push(p);
  }
  return out;
}

/**
 * Transformée de Hadamard rapide, normalisée : une matrice de rétroaction unitaire en n·log n.
 *
 * Unitaire veut dire que la matrice conserve l'énergie — sans les filtres d'absorption, le réseau
 * ne s'éteindrait jamais. C'est la condition que l'article pose, et elle se vérifie : un test
 * compare la norme avant et après.
 */
export function hadamard(x: Float64Array): void {
  const n = x.length;
  for (let pas = 1; pas < n; pas <<= 1) {
    for (let i = 0; i < n; i += pas << 1) {
      for (let j = i; j < i + pas; j++) {
        const a = x[j], b = x[j + pas];
        x[j] = a + b;
        x[j + pas] = a - b;
      }
    }
  }
  const inv = 1 / Math.sqrt(n);
  for (let i = 0; i < n; i++) x[i] *= inv;
}

export interface Absorption {
  /** Module du filtre au grave. */
  g: number;
  /** Coefficient du passe-bas d'ordre un. */
  a: number;
}

/**
 * Les coefficients d'absorption d'une ligne, pour deux temps de réverbération donnés.
 *
 * La dérivation est dans l'en-tête du fichier. Le cas `rt60Haut ≥ rt60Bas` est permis — un aigu qui
 * dure plus que le grave n'existe pas dans une salle, mais c'est un effet qu'on peut vouloir —, et
 * `a` devient alors négatif, ce qui fait du filtre un passe-haut. La formule s'en charge seule.
 */
export function coefficientsAbsorption(
  m: number, rt60Bas: number, rt60Haut: number, sampleRate: number, freqRef = 8000,
): Absorption {
  const tBas = Math.max(0.01, rt60Bas), tHaut = Math.max(0.01, rt60Haut);
  const g = Math.pow(10, (-3 * m) / (tBas * sampleRate));
  // Rapport visé à la fréquence de référence, borné pour écarter les cas dégénérés.
  const r = Math.min(1e3, Math.max(1e-3, Math.pow(10, (-3 * m * (1 / tHaut - 1 / tBas)) / sampleRate)));
  const w = (2 * Math.PI * Math.min(freqRef, sampleRate / 2 - 1)) / sampleRate;
  const r2 = r * r;
  const A = 1 - r2;
  // Temps égaux : le filtre est une simple atténuation, sans mémoire.
  if (Math.abs(A) < 1e-12) return { g, a: 0 };
  const B = 2 * (r2 * Math.cos(w) - 1);
  const disc = Math.max(0, B * B - 4 * A * A);
  const racine = Math.sqrt(disc);
  const a1 = (-B + racine) / (2 * A), a2 = (-B - racine) / (2 * A);
  // Les deux racines sont inverses l'une de l'autre : on garde la seule qui soit stable.
  let a = Math.abs(a1) < 1 ? a1 : a2;
  if (!Number.isFinite(a) || Math.abs(a) >= 1) a = 0;

  // STABILITÉ. Le module du filtre doit rester sous un à TOUTES les fréquences, et pas seulement à
  // celle qu'on a visée : sinon la boucle n'décroît pas, elle enfle. Le maximum tombe à Nyquist
  // quand `a` est négatif, c'est-à-dire quand on demande un aigu plus long que le grave. Mesuré
  // avant ce garde-fou : un module de 2,37 à Nyquist, et une réponse dont la crête atteignait
  // 1,2 × 10¹³ au lieu de s'éteindre — la demande était physiquement impossible, et rien ne le
  // disait. On borne donc `a` au plus négatif qui garde la boucle sous l'unité.
  const LIMITE = 0.999;
  const moduleNyquist = (aa: number) => (g * (1 - aa)) / Math.abs(1 + aa);
  if (a < 0 && moduleNyquist(a) >= LIMITE) a = (g - LIMITE) / (g + LIMITE);
  return { g, a };
}

/**
 * Le réseau, appliqué à un signal.
 *
 * Rend deux voies. La queue est ajoutée APRÈS le son : une réverbération qui s'arrêterait avec lui
 * ne serait pas une réverbération.
 */
export function traiterFdn(x: Float32Array, o: OptionsFdn): { gauche: Float32Array; droite: Float32Array } {
  const sr = o.sampleRate;
  const N = [4, 8, 16, 32].includes(o.lignes ?? 8) ? (o.lignes ?? 8) : 8;
  const minEch = Math.max(8, Math.round(((o.retardMin ?? 23) * sr) / 1000));
  const maxEch = Math.max(minEch + 8, Math.round(((o.retardMax ?? 79) * sr) / 1000));
  const rtBas = Math.max(0.05, o.rt60Bas ?? 2);
  const rtHaut = Math.max(0.05, o.rt60Haut ?? 0.7);
  const melange = Math.min(1, Math.max(0, o.melange ?? 0.35));
  const largeur = Math.min(1, Math.max(0, o.largeur ?? 1));
  const queue = Math.max(0.05, o.queue ?? Math.max(rtBas, rtHaut));
  const n = x.length + Math.round(queue * sr);

  const retards = retardsPremiers(N, minEch, maxEch);
  const lignes = retards.map((m) => new Float64Array(m));
  const curseurs = new Int32Array(N);
  const absorptions = retards.map((m) => coefficientsAbsorption(m, rtBas, rtHaut, sr, o.freqRef ?? 8000));
  const etats = new Float64Array(N); // mémoire des passe-bas

  // Entrées et sorties : des signes alternés donnent deux voies décorrélées sans rien coûter, et
  // c'est le procédé usuel. La voie droite prend un motif de signes différent.
  const entree = Float64Array.from({ length: N }, (_, i) => (i % 2 === 0 ? 1 : -1) / Math.sqrt(N));
  const sortieG = Float64Array.from({ length: N }, (_, i) => ((i >> 1) % 2 === 0 ? 1 : -1) / Math.sqrt(N));
  const sortieD = Float64Array.from({ length: N }, (_, i) => ((i >> 2) % 2 === 0 ? 1 : -1) / Math.sqrt(N));

  const gauche = new Float32Array(n), droite = new Float32Array(n);
  const u = new Float64Array(N);

  for (let t = 0; t < n; t++) {
    const sec = t < x.length ? x[t] : 0;
    let humideG = 0, humideD = 0;
    for (let i = 0; i < N; i++) {
      const s = lignes[i][curseurs[i]];
      // Absorption : g·(1−a)·s + a·état — le passe-bas d'ordre un dérivé dans l'en-tête.
      const { g, a } = absorptions[i];
      const y = g * (1 - a) * s + a * etats[i];
      etats[i] = y;
      u[i] = y;
      humideG += sortieG[i] * y;
      humideD += sortieD[i] * y;
    }
    hadamard(u); // diffusion, unitaire
    for (let i = 0; i < N; i++) {
      lignes[i][curseurs[i]] = u[i] + entree[i] * sec;
      curseurs[i] = curseurs[i] + 1 === lignes[i].length ? 0 : curseurs[i] + 1;
    }
    // La largeur mélange les deux voies : à zéro, les deux sont identiques.
    const moyenne = (humideG + humideD) / 2;
    const g2 = moyenne + largeur * (humideG - moyenne);
    const d2 = moyenne + largeur * (humideD - moyenne);
    gauche[t] = melange * g2 + (1 - melange) * sec;
    droite[t] = melange * d2 + (1 - melange) * sec;
  }
  return { gauche, droite };
}

/** La réponse impulsionnelle du réseau : le son de la salle, à regarder ou à convoluer. */
export function reponseFdn(o: OptionsFdn): { gauche: Float32Array; droite: Float32Array } {
  const impulsion = new Float32Array(1);
  impulsion[0] = 1;
  return traiterFdn(impulsion, { ...o, melange: 1 });
}

/**
 * Filtre passe-bande d'ordre deux, pour mesurer une décroissance BANDE PAR BANDE.
 *
 * Il n'est pas là pour faire du son mais pour permettre la vérification : sans lui, on ne pourrait
 * que constater une décroissance globale, et la promesse de ce nœud porte précisément sur le fait
 * qu'elle diffère selon la fréquence.
 */
export function filtrerBande(x: Float32Array, sampleRate: number, f0: number, q = 2): Float32Array {
  const w = (2 * Math.PI * f0) / sampleRate;
  const alpha = Math.sin(w) / (2 * q);
  const b0 = alpha, b1 = 0, b2 = -alpha;
  const a0 = 1 + alpha, a1 = -2 * Math.cos(w), a2 = 1 - alpha;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

/**
 * RT60 mesuré sur une réponse, par la pente de l'intégrale de Schroeder entre −5 et −35 dB.
 *
 * C'est le T30 de la norme, extrapolé à 60 dB — la mesure de la littérature. On ne part pas de zéro
 * décibel parce que le tout début d'une réponse n'est pas encore de la réverbération, et on ne
 * descend pas plus bas que −35 dB pour rester au-dessus du plancher numérique.
 */
export function rt60Mesure(h: Float32Array, sampleRate: number): number {
  const c = courbeSchroeder(h);
  let i5 = -1, i35 = -1;
  for (let i = 0; i < c.length; i++) {
    if (i5 < 0 && c[i] <= -5) i5 = i;
    if (c[i] <= -35) { i35 = i; break; }
  }
  if (i5 < 0 || i35 < 0 || i35 <= i5) return 0;
  return ((i35 - i5) / sampleRate) * 2;
}
