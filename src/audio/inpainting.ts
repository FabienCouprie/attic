// audio/inpainting.ts — Reconstruire un morceau de son qui manque.
//
// D'après Amir Adler, Valentin Emiya, Maria G. Jafari, Michael Elad, Rémi Gribonval et Mark D.
// Plumbley, « Audio Inpainting », IEEE Transactions on Audio, Speech and Language Processing 20(3),
// 2012, p. 922-932, qui a donné son nom au problème ; la méthode employée ici est celle qui reste
// la référence pour les trous courts, l'interpolation AUTORÉGRESSIVE de A. J. E. M. Janssen,
// R. N. J. Veldhuis et L. B. Vries, « Adaptive interpolation of discrete-time signals that can be
// modeled as autoregressive processes », IEEE Trans. ASSP 34(2), 1986 — revisitée en 2024 par
// Mokrý et Rajmic, « Janssen 2.0 » (https://arxiv.org/pdf/2409.06392), qui confirme qu'elle tient
// encore devant les méthodes parcimonieuses et neuronales sur les trous de quelques dizaines de
// millisecondes.
//
// CE QUI MANQUAIT. « Suppression de clics » interpole des clics BREFS — quelques échantillons. Rien
// dans Attic ne reconstruit un trou de vingt ou cinquante millisecondes : un décrochage réseau, une
// rayure, un blanc qu'on veut faire disparaître. Or le Sélecteur multi-zones est déjà là pour
// DÉSIGNER le passage : on sélectionne, et le nœud rebâtit.
//
// L'IDÉE, et elle est belle. On suppose que le son est autorégressif : chaque échantillon est à peu
// près une combinaison linéaire des p précédents. Ce n'est pas une vue de l'esprit — c'est
// exactement ce que fait un instrument, dont la matière impose une résonance. Le problème se mord
// alors la queue : pour estimer le modèle il faudrait le son entier, et pour reconstituer le son il
// faudrait le modèle. Janssen tourne la difficulté en ALTERNANT — on estime le modèle sur le son
// courant (trou bouché tant bien que mal), puis on recalcule le trou qui minimise l'erreur de
// prédiction de ce modèle, et on recommence. Chaque tour améliore les deux.
//
// POURQUOI ÇA MARCHE SI BIEN SUR UNE NOTE. Une sinusoïde est un processus autorégressif d'ordre
// DEUX, exactement : `x[n] = 2·cos(ω)·x[n−1] − x[n−2]`. Un modèle d'ordre trente peut donc porter
// quinze partielles sans approximation, phases comprises — d'où des reconstructions à quarante
// décibels là où une interpolation linéaire en rend dix.

export interface Trou {
  /** Premier échantillon manquant. */
  debut: number;
  longueur: number;
}

export interface OptionsInpainting {
  /** Ordre du modèle autorégressif. */
  ordre?: number;
  /** Tours d'alternance entre l'estimation du modèle et le calcul du trou. */
  iterations?: number;
  /** Échantillons de contexte pris de chaque côté du trou. */
  contexte?: number;
  /** Longueur de trou au-delà de laquelle on renonce, plutôt que de calculer une heure. */
  trouMax?: number;
}

/** Autocorrélation d'un segment, jusqu'au décalage `p`. */
export function autocorrelation(x: Float64Array, p: number): Float64Array {
  const r = new Float64Array(p + 1);
  for (let d = 0; d <= p; d++) {
    let s = 0;
    for (let i = d; i < x.length; i++) s += x[i] * x[i - d];
    r[d] = s;
  }
  return r;
}

/**
 * Levinson-Durbin : les coefficients du modèle autorégressif, à partir de l'autocorrélation.
 *
 * Rend `a` tel que l'erreur de prédiction soit `x[n] + a₁·x[n−1] + … + a_p·x[n−p]`. La récursion
 * exploite la structure de Toeplitz du système et coûte p² au lieu de p³ ; elle rend en prime les
 * coefficients de réflexion, dont le module reste inférieur à un quand le système est bien posé —
 * ce qui garantit un modèle stable, donc un trou qui ne diverge pas.
 */
export function levinson(r: Float64Array): Float64Array {
  const p = r.length - 1;
  const a = new Float64Array(p + 1);
  a[0] = 1;
  if (r[0] <= 0) return a;
  let erreur = r[0];
  const tmp = new Float64Array(p + 1);
  for (let m = 1; m <= p; m++) {
    let acc = r[m];
    for (let i = 1; i < m; i++) acc += a[i] * r[m - i];
    const k = -acc / erreur;
    // Un coefficient de réflexion au-delà de un signale un système dégénéré — segment constant,
    // silence, ou autocorrélation numériquement plate. On s'arrête là avec ce qu'on a.
    if (!Number.isFinite(k) || Math.abs(k) >= 1) break;
    tmp.set(a.subarray(0, m + 1));
    for (let i = 1; i < m; i++) a[i] = tmp[i] + k * tmp[m - i];
    a[m] = k;
    erreur *= 1 - k * k;
    if (erreur <= 1e-30) break;
  }
  return a;
}

/**
 * Autocorrélation du filtre d'erreur : `ρ[d] = Σ b_k·b_{k+d}` avec `b = [1, a₁, …, a_p]`.
 *
 * C'est elle qui porte tout le système à résoudre. L'énergie de l'erreur de prédiction s'écrit
 * `Σᵢⱼ x_i·x_j·ρ[|i−j|]` : une forme quadratique dont la matrice est BANDÉE — nulle dès que deux
 * échantillons sont éloignés de plus de p —, et c'est cette structure qui rend le calcul possible.
 */
export function rhoDepuisAr(a: Float64Array): Float64Array {
  const p = a.length - 1;
  const rho = new Float64Array(p + 1);
  for (let d = 0; d <= p; d++) {
    let s = 0;
    for (let k = 0; k + d <= p; k++) s += a[k] * a[k + d];
    rho[d] = s;
  }
  return rho;
}

/**
 * Résout un système symétrique défini positif BANDÉ, par Cholesky.
 *
 * `bande[i·(p+1) + d]` porte l'élément (i, i+d). Le coût est `g·p²` au lieu de `g³` : pour un trou
 * de mille échantillons et un modèle d'ordre cent, dix millions d'opérations au lieu d'un
 * milliard. Rend faux si la matrice n'est pas définie positive, ce qui arrive sur un segment
 * dégénéré — l'appelant garde alors son interpolation de départ au lieu d'écrire n'importe quoi.
 */
export function resoudreBande(bande: Float64Array, b: Float64Array, g: number, p: number): boolean {
  const R = new Float64Array(g * (p + 1));
  const el = (i: number, d: number) => (d <= p && i + d < g ? R[i * (p + 1) + d] : 0);
  for (let i = 0; i < g; i++) {
    let s = bande[i * (p + 1)];
    for (let k = Math.max(0, i - p); k < i; k++) { const v = el(k, i - k); s -= v * v; }
    if (!(s > 1e-20)) return false;
    const d0 = Math.sqrt(s);
    R[i * (p + 1)] = d0;
    for (let d = 1; d <= p && i + d < g; d++) {
      let t = bande[i * (p + 1) + d];
      for (let k = Math.max(0, i - p); k < i; k++) t -= el(k, i - k) * el(k, i + d - k);
      R[i * (p + 1) + d] = t / d0;
    }
  }
  // Rᵀ y = b, puis R x = y — les deux en bande.
  const y = new Float64Array(g);
  for (let i = 0; i < g; i++) {
    let s = b[i];
    for (let k = Math.max(0, i - p); k < i; k++) s -= el(k, i - k) * y[k];
    y[i] = s / R[i * (p + 1)];
  }
  for (let i = g - 1; i >= 0; i--) {
    let s = y[i];
    for (let d = 1; d <= p && i + d < g; d++) s -= el(i, d) * b[i + d];
    b[i] = s / R[i * (p + 1)];
  }
  return true;
}

/** Interpolation linéaire d'un trou : le point de départ de l'alternance, et le témoin des tests. */
export function interpolerLineaire(seg: Float64Array, debut: number, longueur: number): void {
  const avant = debut > 0 ? seg[debut - 1] : 0;
  const apres = debut + longueur < seg.length ? seg[debut + longueur] : 0;
  for (let i = 0; i < longueur; i++) seg[debut + i] = avant + ((apres - avant) * (i + 1)) / (longueur + 1);
}

/**
 * Un trou, bouché par l'alternance de Janssen sur un segment de contexte.
 *
 * Le segment est modifié sur place. `debut` et `longueur` désignent le trou DANS le segment.
 */
export function janssen(
  seg: Float64Array, debut: number, longueur: number, ordre: number, iterations: number,
): { tours: number; erreur: number } {
  interpolerLineaire(seg, debut, longueur);
  const p = Math.max(2, Math.min(ordre, seg.length - longueur - 2, 1024));
  let tours = 0, erreur = 0;

  for (let t = 0; t < iterations; t++) {
    tours = t + 1;
    const a = levinson(autocorrelation(seg, p));
    const rho = rhoDepuisAr(a);

    // Le système : pour chaque échantillon manquant i, Σⱼ ρ[|i−j|]·x_j = 0, séparé en inconnues
    // (le trou) et connues (le reste). La matrice est bandée de demi-largeur p.
    const g = longueur;
    const bande = new Float64Array(g * (p + 1));
    const b = new Float64Array(g);
    for (let i = 0; i < g; i++) {
      for (let d = 0; d <= p && i + d < g; d++) bande[i * (p + 1) + d] = rho[d];
      let s = 0;
      for (let d = -p; d <= p; d++) {
        const j = debut + i + d;
        if (j < 0 || j >= seg.length) continue;
        const dansLeTrou = j >= debut && j < debut + g;
        if (dansLeTrou) continue;
        s += rho[Math.abs(d)] * seg[j];
      }
      b[i] = -s;
    }
    if (!resoudreBande(bande, b, g, p)) break;
    let bouge = 0;
    for (let i = 0; i < g; i++) {
      const v = b[i];
      if (!Number.isFinite(v)) return { tours, erreur };
      bouge = Math.max(bouge, Math.abs(v - seg[debut + i]));
      seg[debut + i] = v;
    }
    erreur = bouge;
    // Le trou ne bouge plus : les tours suivants ne changeraient rien.
    if (bouge < 1e-7) break;
  }
  return { tours, erreur };
}

export interface ResultatInpainting {
  signal: Float32Array;
  /** Trous effectivement reconstruits. */
  bouches: number;
  /** Échantillons reconstruits en tout. */
  echantillons: number;
  /** Trous laissés tels quels parce que trop longs ou sans contexte. */
  renonces: number;
}

/**
 * Bouche une liste de trous dans un signal.
 *
 * Chaque trou est traité avec SON contexte, indépendamment des autres : deux trous voisins ne se
 * gênent donc pas, et un trou dont le contexte contient un autre trou reçoit tout de même une
 * interpolation de départ — ce qui vaut mieux que de renoncer.
 */
export function boucherTrous(
  x: Float32Array, trous: Trou[], o: OptionsInpainting = {},
): ResultatInpainting {
  const signal = Float32Array.from(x);
  const trouMax = o.trouMax ?? 20000;
  const iterations = o.iterations ?? 12;
  let bouches = 0, echantillons = 0, renonces = 0;

  for (const trou of trous) {
    const debut = Math.max(0, Math.round(trou.debut));
    const longueur = Math.min(Math.round(trou.longueur), x.length - debut);
    if (longueur <= 0) continue;
    if (longueur > trouMax) { renonces++; continue; }

    // L'ordre par défaut suit la règle de l'article : plus le trou est long, plus il faut de
    // mémoire pour le franchir. Le plafond, lui, est une affaire de temps de calcul.
    const ordre = Math.max(8, Math.min(o.ordre ?? 3 * longueur + 2, 256));
    const contexte = Math.max(o.contexte ?? 4 * ordre, 2 * ordre);
    const g0 = Math.max(0, debut - contexte);
    const g1 = Math.min(x.length, debut + longueur + contexte);
    if (g1 - g0 <= longueur + 2 * ordre) { renonces++; continue; }

    const seg = new Float64Array(g1 - g0);
    for (let i = 0; i < seg.length; i++) seg[i] = signal[g0 + i];
    janssen(seg, debut - g0, longueur, ordre, iterations);
    for (let i = 0; i < longueur; i++) signal[debut + i] = seg[debut - g0 + i];
    bouches++;
    echantillons += longueur;
  }
  return { signal, bouches, echantillons, renonces };
}

/**
 * Trouve les passages muets d'un signal — les décrochages, qui sont exactement à zéro.
 *
 * Le seuil n'est pas zéro strict : un fichier passé par un encodage laisse des valeurs d'un
 * millième au lieu du silence exact. Et une durée minimale, sans quoi chaque passage à zéro d'une
 * sinusoïde serait pris pour un trou — ce qui est exactement l'erreur que fait un détecteur naïf.
 */
export function detecterTrous(x: Float32Array, seuil = 1e-4, longueurMin = 16): Trou[] {
  const trous: Trou[] = [];
  let debut = -1;
  for (let i = 0; i <= x.length; i++) {
    const muet = i < x.length && Math.abs(x[i]) <= seuil;
    if (muet && debut < 0) debut = i;
    else if (!muet && debut >= 0) {
      if (i - debut >= longueurMin) trous.push({ debut, longueur: i - debut });
      debut = -1;
    }
  }
  return trous;
}

/** Rapport signal sur distorsion SUR LE TROU, en décibels : la mesure de la littérature. */
export function sdrTrou(original: Float32Array, essai: Float32Array, trous: Trou[]): number {
  let signal = 0, bruit = 0;
  for (const t of trous) {
    for (let i = t.debut; i < Math.min(t.debut + t.longueur, original.length); i++) {
      signal += original[i] * original[i];
      const d = original[i] - essai[i];
      bruit += d * d;
    }
  }
  if (signal <= 0) return 0;
  return 10 * Math.log10(signal / Math.max(1e-20, bruit));
}
