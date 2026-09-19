// audio/pghi.ts — Retrouver la phase d'un spectrogramme sans itérer.
//
// D'après Zdeněk Průša, Peter Balazs et Peter L. Søndergaard, « A Noniterative Method for
// Reconstruction of Phase from STFT Magnitude », IEEE/ACM Transactions on Audio, Speech and
// Language Processing 25(5), 2017, p. 1154-1164 — l'algorithme PGHI, pour *phase gradient heap
// integration*.
//
// CE QUI MANQUAIT, ou plutôt ce qui existait mal : Attic a un nœud Griffin-Lim, qui ITÈRE — il
// projette alternativement sur les magnitudes voulues et sur l'ensemble des vrais spectrogrammes,
// soixante fois, en partant d'une phase au hasard. C'est la méthode de 1984, et elle a deux défauts
// qu'on ne peut pas régler en itérant davantage : elle part de rien, et elle converge vers un
// minimum local dont la qualité dépend du hasard initial.
//
// L'IDÉE DE PGHI, et elle est belle : la phase n'est pas indépendante de la magnitude. Pour une
// fenêtre GAUSSIENNE, les deux sont liées exactement —
//
//     ∂φ/∂t = ω + (1/λ)·∂s/∂ω        ∂φ/∂ω = −λ·∂s/∂t        avec s = log |S|
//
// — si bien que le GRADIENT de la phase se lit directement sur la magnitude, qu'on connaît. Il ne
// reste qu'à l'intégrer. Et c'est là que le second geste de l'article intervient : on n'intègre pas
// dans un ordre arbitraire, mais EN PARTANT DES PLUS FORTES MAGNITUDES et en descendant, par un tas
// de priorité. La raison est que le gradient est fiable là où il y a de l'énergie et n'a aucun sens
// là où il n'y en a pas : intégrer à travers une zone vide propagerait du bruit dans tout le reste.
//
// D'où le nom : intégration du gradient de phase par tas.
//
// LES CONSTANTES SONT DÉRIVÉES ET NON RECOPIÉES. En discret, avec un saut de `a` échantillons et
// `M` canaux, ω = 2πn/M et t = ma, donc :
//     tgrad = a·∂φ/∂t = 2π·a·n/M + (a·M/γ)·∂s/∂n       avec γ = 2πλ
//     fgrad = (2π/M)·∂φ/∂ω = −(γ/(a·M))·∂s/∂m
// Un signe fautif ne donnerait pas un son un peu moins bon mais du bruit, et la mesure de
// convergence spectrale des tests le verrait immédiatement.
import { fft } from "./fft";

/**
 * Fenêtre gaussienne, et le λ qui va avec.
 *
 * C'est la seule fenêtre pour laquelle la relation phase-magnitude est EXACTE — l'article le
 * démontre, et c'est pourquoi le nœud l'emploie plutôt que la fenêtre de Hann du reste d'Attic.
 * λ est choisi pour que la gaussienne tombe à deux millièmes au bord : plus large, elle serait
 * tronquée et la relation cesserait de tenir ; plus étroite, elle gâcherait de la résolution.
 */
export function fenetreGauss(n: number): { fenetre: Float64Array; lambda: number } {
  const lambda = (n * n) / 8;
  // Le centre tombe sur un indice ENTIER, `n/2`, et non sur `(n−1)/2` : c'est ce qui permet de
  // ramener exactement la phase au centre de la fenêtre par une rotation de la trame (voir
  // `analyser`). Avec un centre à la demi-case, la rotation ne serait pas entière et il resterait
  // un terme de phase linéaire en fréquence.
  const centre = n / 2;
  const fenetre = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const d = i - centre;
    fenetre[i] = Math.exp((-Math.PI * d * d) / lambda);
  }
  return { fenetre, lambda };
}

export interface Spectrogramme {
  /** Un tableau de `bins` modules par trame. */
  modules: Float32Array[];
  /** Les phases, quand on les a. */
  phases: Float32Array[];
  taille: number;
  saut: number;
  /** Longueur du signal analysé, pour resynthétiser à la bonne taille. */
  longueur: number;
}

const binsDe = (taille: number) => taille / 2 + 1;

/**
 * Analyse : modules et phases, fenêtre gaussienne, un bourrage d'une fenêtre de chaque côté.
 *
 * LA TRAME EST TOURNÉE avant la transformée, de sorte que le centre de la fenêtre tombe à
 * l'indice zéro. Sans cela, la phase est référencée au DÉBUT de la trame et porte un terme
 * linéaire en fréquence, `−2π·k·centre/M` — mesuré : un écart de phase de π entre deux bins
 * voisins, là où la relation de l'article en prédit zéro. PGHI intégrait alors ce terme parasite
 * et rendait du bruit (convergence spectrale de −0,8 dB au lieu de −24). C'est le fenêtrage à
 * phase nulle des vocodeurs, et il est ici indispensable et non cosmétique.
 */
export function analyser(x: Float32Array, taille: number, saut: number): Spectrogramme {
  const { fenetre } = fenetreGauss(taille);
  const bins = binsDe(taille);
  const centre = taille / 2;
  const modules: Float32Array[] = [], phases: Float32Array[] = [];
  const re = new Float64Array(taille), im = new Float64Array(taille);
  for (let debut = -taille; debut < x.length; debut += saut) {
    im.fill(0);
    for (let i = 0; i < taille; i++) {
      const j = debut + i;
      re[(i - centre + taille) % taille] = (j >= 0 && j < x.length ? x[j] : 0) * fenetre[i];
    }
    fft(re, im, false);
    const m = new Float32Array(bins), p = new Float32Array(bins);
    for (let k = 0; k < bins; k++) { m[k] = Math.hypot(re[k], im[k]); p[k] = Math.atan2(im[k], re[k]); }
    modules.push(m); phases.push(p);
  }
  return { modules, phases, taille, saut, longueur: x.length };
}

/** Synthèse : addition pondérée des trames, normalisée par la somme des carrés de la fenêtre. */
export function synthetiser(s: Spectrogramme): Float32Array {
  const { fenetre } = fenetreGauss(s.taille);
  const bins = binsDe(s.taille);
  const total = s.longueur + 2 * s.taille;
  const acc = new Float64Array(total), norme = new Float64Array(total);
  const centre = s.taille / 2;
  const re = new Float64Array(s.taille), im = new Float64Array(s.taille);

  for (let t = 0; t < s.modules.length; t++) {
    const m = s.modules[t], p = s.phases[t];
    re.fill(0); im.fill(0);
    for (let k = 0; k < bins; k++) {
      re[k] = m[k] * Math.cos(p[k]);
      im[k] = m[k] * Math.sin(p[k]);
      if (k > 0 && k < bins - 1) { re[s.taille - k] = re[k]; im[s.taille - k] = -im[k]; }
    }
    im[bins - 1] = 0;
    fft(re, im, true);
    const debut = t * s.saut; // décalé de `taille` par rapport au signal, cf. le bourrage
    // Rotation inverse de celle de l'analyse, avec la même correspondance d'indices.
    for (let i = 0; i < s.taille; i++) {
      const j = debut + i;
      if (j < 0 || j >= total) continue;
      acc[j] += re[(i - centre + s.taille) % s.taille] * fenetre[i];
      norme[j] += fenetre[i] * fenetre[i];
    }
  }
  const sortie = new Float32Array(s.longueur);
  for (let i = 0; i < s.longueur; i++) {
    const j = i + s.taille;
    sortie[i] = norme[j] > 1e-12 ? acc[j] / norme[j] : 0;
  }
  return sortie;
}

/** Tas de priorité sur les magnitudes, la plus forte en tête. */
class Tas {
  private idx: number[] = [];
  private readonly poids: (i: number) => number;
  constructor(poids: (i: number) => number) { this.poids = poids; }
  get taille(): number { return this.idx.length; }
  pousser(i: number): void {
    this.idx.push(i);
    let e = this.idx.length - 1;
    while (e > 0) {
      const p = (e - 1) >> 1;
      if (this.poids(this.idx[p]) >= this.poids(this.idx[e])) break;
      [this.idx[p], this.idx[e]] = [this.idx[e], this.idx[p]];
      e = p;
    }
  }
  retirer(): number {
    const tete = this.idx[0];
    const dernier = this.idx.pop()!;
    if (this.idx.length > 0) {
      this.idx[0] = dernier;
      let e = 0;
      for (;;) {
        const g = 2 * e + 1, d = g + 1;
        let plus = e;
        if (g < this.idx.length && this.poids(this.idx[g]) > this.poids(this.idx[plus])) plus = g;
        if (d < this.idx.length && this.poids(this.idx[d]) > this.poids(this.idx[plus])) plus = d;
        if (plus === e) break;
        [this.idx[plus], this.idx[e]] = [this.idx[e], this.idx[plus]];
        e = plus;
      }
    }
    return tete;
  }
}

export interface ResultatPghi {
  phases: Float32Array[];
  /** Part des points du spectrogramme qui portaient assez d'énergie pour être intégrés. */
  partIntegree: number;
  /** Nombre d'îlots : des régions d'énergie séparées par du vide, intégrées indépendamment. */
  ilots: number;
}

/**
 * PGHI : les phases, à partir des seuls modules.
 *
 * `tolerance` est relative au module le plus fort. En dessous, un point est laissé à phase nulle et
 * n'est pas propagé : c'est ce qui empêche le bruit numérique d'une zone vide de contaminer tout le
 * spectrogramme. L'article insiste sur ce point, et c'est lui qui fait la différence avec une
 * intégration naïve.
 */
export function pghi(
  modules: Float32Array[], taille: number, saut: number, tolerance = 1e-6,
): ResultatPghi {
  const { lambda } = fenetreGauss(taille);
  const nT = modules.length;
  const bins = modules[0]?.length ?? 0;
  const phases = Array.from({ length: nT }, () => new Float32Array(bins));
  if (nT === 0 || bins === 0) return { phases, partIntegree: 0, ilots: 0 };

  const gamma = 2 * Math.PI * lambda;
  const facteurT = (saut * taille) / gamma;
  const facteurF = gamma / (saut * taille);

  // Log-magnitudes, et le seuil sous lequel on ne propage pas.
  let maxMod = 0;
  for (const m of modules) for (const v of m) if (v > maxMod) maxMod = v;
  if (maxMod <= 0) return { phases, partIntegree: 0, ilots: 0 };
  const seuil = tolerance * maxMod;
  const plancher = Math.log(Math.max(1e-300, seuil * 1e-3));
  const lg = (t: number, k: number) =>
    t < 0 || t >= nT || k < 0 || k >= bins ? plancher : Math.max(plancher, Math.log(Math.max(1e-300, modules[t][k])));

  // Les deux gradients, dérivés dans l'en-tête du fichier.
  const tgrad = new Float64Array(nT * bins), fgrad = new Float64Array(nT * bins);
  for (let t = 0; t < nT; t++) {
    for (let k = 0; k < bins; k++) {
      const dk = (lg(t, k + 1) - lg(t, k - 1)) / 2;
      const dt = (lg(t + 1, k) - lg(t - 1, k)) / 2;
      tgrad[t * bins + k] = facteurT * dk + (2 * Math.PI * saut * k) / taille;
      fgrad[t * bins + k] = -facteurF * dt;
    }
  }

  const fait = new Uint8Array(nT * bins);
  const significatif = new Uint8Array(nT * bins);
  const restants: number[] = [];
  for (let t = 0; t < nT; t++) {
    for (let k = 0; k < bins; k++) {
      const i = t * bins + k;
      if (modules[t][k] > seuil) { significatif[i] = 1; restants.push(i); }
    }
  }
  // Les plus forts d'abord : le premier point de chaque îlot est le plus fort qui reste.
  restants.sort((a, b) => modules[Math.floor(b / bins)][b % bins] - modules[Math.floor(a / bins)][a % bins]);

  const tas = new Tas((i) => modules[Math.floor(i / bins)][i % bins]);
  const phaseDe = (i: number) => phases[Math.floor(i / bins)][i % bins];
  let integres = 0, ilots = 0;

  for (const depart of restants) {
    if (fait[depart]) continue;
    // Nouvel îlot : sa phase de départ est arbitraire — seules les DIFFÉRENCES de phase
    // s'entendent, et deux îlots séparés par du vide ne se recouvrent pas à l'oreille.
    ilots++;
    fait[depart] = 1; integres++;
    tas.pousser(depart);

    while (tas.taille > 0) {
      const i = tas.retirer();
      const t = Math.floor(i / bins), k = i % bins;
      const phi = phaseDe(i);

      // Vers la trame suivante et la précédente : intégration du gradient temporel, moyenné
      // entre les deux points — un trapèze, et non un rectangle, ce qui divise l'erreur par deux.
      if (t + 1 < nT) {
        const j = (t + 1) * bins + k;
        if (significatif[j] && !fait[j]) {
          phases[t + 1][k] = phi + (tgrad[i] + tgrad[j]) / 2;
          fait[j] = 1; integres++; tas.pousser(j);
        }
      }
      if (t - 1 >= 0) {
        const j = (t - 1) * bins + k;
        if (significatif[j] && !fait[j]) {
          phases[t - 1][k] = phi - (tgrad[i] + tgrad[j]) / 2;
          fait[j] = 1; integres++; tas.pousser(j);
        }
      }
      if (k + 1 < bins) {
        const j = t * bins + k + 1;
        if (significatif[j] && !fait[j]) {
          phases[t][k + 1] = phi + (fgrad[i] + fgrad[j]) / 2;
          fait[j] = 1; integres++; tas.pousser(j);
        }
      }
      if (k - 1 >= 0) {
        const j = t * bins + k - 1;
        if (significatif[j] && !fait[j]) {
          phases[t][k - 1] = phi - (fgrad[i] + fgrad[j]) / 2;
          fait[j] = 1; integres++; tas.pousser(j);
        }
      }
    }
  }
  return { phases, partIntegree: integres / (nT * bins), ilots };
}

/**
 * Convergence spectrale, en décibels — la mesure de l'article.
 *
 * On resynthétise, on réanalyse, et on compare les MODULES obtenus aux modules voulus. Plus le
 * nombre est bas, meilleure est la reconstruction. C'est la seule mesure honnête ici : comparer les
 * signaux échantillon par échantillon n'aurait aucun sens, puisque le problème n'a pas de solution
 * unique — un décalage de phase global donne un son identique à l'oreille.
 */
export function convergenceSpectrale(voulus: Float32Array[], obtenus: Float32Array[]): number {
  let num = 0, den = 0;
  const n = Math.min(voulus.length, obtenus.length);
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < voulus[t].length; k++) {
      const d = obtenus[t][k] - voulus[t][k];
      num += d * d;
      den += voulus[t][k] * voulus[t][k];
    }
  }
  if (den <= 0) return 0;
  return 20 * Math.log10(Math.sqrt(num / den));
}

/**
 * Griffin-Lim, sur la même fenêtre et le même saut : le témoin des mesures.
 *
 * Attic a déjà un nœud Griffin-Lim, mais il emploie une fenêtre de Hann : le comparer directement à
 * PGHI mélangerait deux différences — l'algorithme et la fenêtre. Ici les deux méthodes partagent
 * tout sauf ce qu'on veut mesurer. C'est aussi ce qui permet d'AFFINER une phase PGHI par quelques
 * tours d'itération, ce que l'article recommande : PGHI est un excellent point de départ.
 */
export function griffinLim(
  modules: Float32Array[], taille: number, saut: number, longueur: number,
  iterations: number, phasesInitiales?: Float32Array[],
): Float32Array {
  const bins = modules[0]?.length ?? 0;
  let phases: Float32Array[] = phasesInitiales
    ? phasesInitiales.map((p) => new Float32Array(p))
    : modules.map(() => new Float32Array(bins));
  let signal = synthetiser({ modules, phases, taille, saut, longueur });
  for (let it = 0; it < iterations; it++) {
    const a = analyser(signal, taille, saut);
    // On garde les phases obtenues et on réimpose les modules voulus : c'est tout Griffin-Lim.
    phases = a.phases.slice(0, modules.length) as Float32Array[];
    while (phases.length < modules.length) phases.push(new Float32Array(bins));
    signal = synthetiser({ modules, phases, taille, saut, longueur });
  }
  return signal;
}
