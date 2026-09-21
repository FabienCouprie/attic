// audio/mono-grave.ts — Passer le grave en mono, et lui seul.
//
// POURQUOI C'EST UN CLASSIQUE, et pourquoi il manquait au catalogue alors que tout le reste de la
// trousse stéréo y était — largeur M-S, extraction centre/côté, goniomètre, ampleur.
//
// TROIS RAISONS, ET AUCUNE N'EST UNE SUPERSTITION DE STUDIO.
//
//  1. LA GRAVURE. Un sillon de disque porte la somme des canaux sur un axe et leur différence sur
//     l'autre : un grave décorrélé fait sauter le burin hors du sillon, et l'atelier de gravure
//     refuse le disque ou en baisse le niveau.
//  2. LA SALLE. Sous une centaine de hertz, la longueur d'onde dépasse trois mètres — l'oreille n'y
//     localise plus rien, et deux graves différents ne produisent qu'un flottement d'énergie selon
//     l'endroit où l'on se tient. On ne perd donc aucune information en les réunissant.
//  3. LA SOMME MONO. C'est dans le grave que les annulations coûtent le plus cher, parce que c'est
//     là qu'est l'énergie. Un grave sans côté ne peut plus s'annuler nulle part.
//
// LE TRAITEMENT EST UN PASSE-HAUT SUR LE CÔTÉ, ET RIEN D'AUTRE. C'est la formulation qui rend
// l'opération exacte, et le premier jet ne l'avait pas trouvée : il séparait chaque canal en deux
// bandes et réunissait la bande grave. Deux défauts, mesurés par les tests. Le premier est que la
// bande « aiguë » obtenue par soustraction garde énormément de grave — à 50 Hz sous une coupure à
// 120, la moitié de l'amplitude restait, parce qu'un filtre déphase et qu'une soustraction ne fait
// pas disparaître ce qui est déphasé. Le second est que la mesure de corrélation rendue regardait
// les bandes INTERNES et non la sortie réelle : elle annonçait 1,00 pour un travail à moitié fait.
//
// Écrit sur le côté, tout devient exact. Le milieu n'est JAMAIS filtré, si bien que la somme mono
// ressort au bit près, quel que soit le réglage — c'est la propriété qu'on veut le plus ici, et
// elle est gratuite. Et à quantité nulle, l'entrée ressort telle quelle, sans même un déphasage.

/** Un biquad passe-haut Butterworth d'ordre deux. */
function passeHaut(x: Float32Array, f0: number, sr: number): Float32Array {
  const w = (2 * Math.PI * f0) / sr;
  const cos = Math.cos(w), sin = Math.sin(w);
  const alpha = sin / Math.SQRT2;              // Q = 1/√2 : Butterworth
  const b0 = (1 + cos) / 2, b1 = -(1 + cos), b2 = (1 + cos) / 2;
  const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
  const out = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 / a0) * x[i] + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

/** Un biquad passe-bas Butterworth d'ordre deux. Sert aux mesures, pas au traitement. */
function passeBas(x: Float32Array, f0: number, sr: number): Float32Array {
  const w = (2 * Math.PI * f0) / sr;
  const cos = Math.cos(w), sin = Math.sin(w);
  const alpha = sin / Math.SQRT2;
  const b0 = (1 - cos) / 2, b1 = 1 - cos, b2 = (1 - cos) / 2;
  const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
  const out = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 / a0) * x[i] + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

/** Le grave d'un signal : deux passe-bas en cascade, soit 24 dB par octave. Pour mesurer. */
export const grave = (x: Float32Array, coupureHz: number, sr: number): Float32Array =>
  passeBas(passeBas(x, coupureHz, sr), coupureHz, sr);

/** L'aigu d'un signal : deux passe-haut en cascade. C'est lui qui travaille, sur le côté. */
export const aigu = (x: Float32Array, coupureHz: number, sr: number): Float32Array =>
  passeHaut(passeHaut(x, coupureHz, sr), coupureHz, sr);

export interface ResultatMonoGrave {
  gauche: Float32Array;
  droite: Float32Array;
  /** Corrélation des deux canaux SOUS la coupure, mesurée sur l'entrée puis sur la SORTIE. */
  correlationAvant: number;
  correlationApres: number;
  /** Ce que le côté perd dans le grave, en décibels — le travail réellement fait. */
  coteRetireDb: number;
}

/** La corrélation de deux signaux, entre −1 et 1. */
export function correlation(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa * bb > 1e-20 ? ab / Math.sqrt(aa * bb) : 1;
}

const efficace = (x: Float32Array) => {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return x.length > 0 ? Math.sqrt(s / x.length) : 0;
};

/**
 * Réunit le grave des deux canaux, laisse l'aigu intact.
 *
 * `quantite` permet de n'en faire qu'une partie : à 100 % le côté n'a plus de grave du tout, à
 * 50 % il en garde la moitié. Le réglage est utile, parce qu'un grave entièrement mono resserre
 * parfois une réverbération qu'on avait voulue large.
 */
export function monoGrave(
  gauche: Float32Array, droite: Float32Array, coupureHz: number, sr: number, quantite = 1,
): ResultatMonoGrave {
  const n = Math.min(gauche.length, droite.length);
  const q = Math.min(1, Math.max(0, quantite));
  const milieu = new Float32Array(n), cote = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    milieu[i] = (gauche[i] + droite[i]) / 2;
    cote[i] = (gauche[i] - droite[i]) / 2;
  }
  const coteHaut = aigu(cote, coupureHz, sr);
  const sortieG = new Float32Array(n), sortieD = new Float32Array(n);
  const coteApres = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    coteApres[i] = cote[i] * (1 - q) + coteHaut[i] * q;
    sortieG[i] = milieu[i] + coteApres[i];
    sortieD[i] = milieu[i] - coteApres[i];
  }

  // LES MESURES SE PRENNENT SUR LA SORTIE, et non sur les bandes internes : c'est la faute du
  // premier jet, qui annonçait une corrélation de 1,00 en regardant ce qu'il venait de fabriquer.
  const graveAvant = efficace(grave(cote, coupureHz, sr));
  const graveApres = efficace(grave(coteApres, coupureHz, sr));
  return {
    gauche: sortieG, droite: sortieD,
    correlationAvant: correlation(grave(gauche.subarray(0, n), coupureHz, sr), grave(droite.subarray(0, n), coupureHz, sr)),
    correlationApres: correlation(grave(sortieG, coupureHz, sr), grave(sortieD, coupureHz, sr)),
    coteRetireDb: graveAvant > 1e-12 ? 20 * Math.log10(Math.max(1e-12, graveApres) / graveAvant) : 0,
  };
}
