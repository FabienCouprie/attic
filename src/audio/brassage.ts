// audio/brassage.ts — Un seul moteur de segments, d'où sortent quatre transformations.
//
// D'après Trevor Wishart, « Audible Design » (1994), et la famille `brassage` du Composers Desktop
// Project. Le mot est le français « brassage », que Wishart a gardé tel quel.
//
// CE QUI EST EN JEU, ET POURQUOI CE N'EST PAS UN GRANULATEUR DE PLUS. Attic sait déjà découper en
// grains — « Gel granulaire » boucle un grain, « Découpe aléatoire » brouille des tranches,
// « Mosaïquage par corpus » remplace chaque grain par celui d'un autre son. Chacun fait UNE chose.
// Le brassage est l'inverse : un seul mécanisme — lire des segments et les recoller — dont quatre
// réglages différents donnent quatre transformations que l'on croit distinctes.
//
//   VITESSE DE LECTURE seule      → étirement ou compression, sans toucher à la hauteur
//   TRANSPOSITION seule            → changement de hauteur, sans toucher à la durée
//   DENSITÉ et DISPERSION           → granulation, du nuage clairsemé au mur continu
//   DISPERSION DE POSITION forte    → brouillage de la source, l'ordre des choses se perd
//
// Le rendre en un nœud plutôt qu'en quatre n'est pas une économie de code : c'est ce qui rend
// visible qu'ils sont le même geste. On passe de l'un à l'autre en bougeant un curseur, et l'on
// entend le chemin entre les deux — ce qu'aucune suite de quatre nœuds séparés ne montre.
//
// COMMENT LA POSITION DE LECTURE EST CALCULÉE. Pour un grain qui sort à l'instant `t`, on lit la
// source à `t × vitesse`, plus un écart tiré au sort. La vitesse est donc le rapport entre le
// temps de la sortie et celui de la source : à 0,5, il faut deux secondes de sortie pour parcourir
// une seconde de source — c'est l'étirement. La transposition, elle, ne touche pas à cette
// position : elle change la CADENCE À LAQUELLE le grain est relu. Les deux sont indépendantes, et
// c'est exactement ce qu'un lecteur de bande ne sait pas faire.

/** Générateur pseudo-aléatoire reproductible : une graine donnée rejoue le même brassage. */
function tirage(graine: number): () => number {
  let g = (graine | 0) || 1;
  return () => {
    g = (g * 1103515245 + 12345) & 0x7fffffff;
    return g / 0x7fffffff;
  };
}

export interface OptionsBrassage {
  /** Longueur d'un segment, en secondes. */
  grainSec: number;
  /** Segments démarrés par seconde. Au-delà de 1/grainSec, ils se recouvrent. */
  densite: number;
  /**
   * Rapport entre le temps de la sortie et celui de la source. 1 : la source est parcourue à son
   * rythme. 0,5 : deux fois plus lentement — un étirement. 2 : deux fois plus vite.
   */
  vitesse: number;
  /** Transposition des segments, en demi-tons. N'affecte pas la position de lecture. */
  transposition: number;
  /** Écart maximal tiré au sort sur la position de lecture, en secondes. */
  dispersionSec: number;
  /** Écart maximal tiré au sort sur la transposition, en demi-tons. */
  dispersionDemiTons: number;
  /** Durée de la sortie, en secondes. Absente : celle de la source divisée par la vitesse. */
  dureeSec?: number;
  /** Graine du tirage. Zéro est traité comme 1 : le tirage est toujours reproductible. */
  graine: number;
}

/**
 * Un segment lu dans la source, transposé, fenêtré.
 *
 * LA FENÊTRE N'EST PAS UN ORNEMENT. Un segment coupé net commence et finit sur une marche, qu'on
 * entend comme un clic — et à cent segments par seconde, cent clics. La fenêtre de Hann les
 * supprime en faisant naître et mourir chaque segment dans le silence ; c'est aussi elle qui rend
 * le recouvrement possible, deux segments fondus l'un dans l'autre au lieu de se succéder.
 */
export function lireSegment(
  source: Float32Array, positionDebut: number, longueur: number, rapportHauteur: number,
): Float32Array {
  const seg = new Float32Array(longueur);
  for (let i = 0; i < longueur; i++) {
    const p = positionDebut + i * rapportHauteur;
    const i0 = Math.floor(p);
    if (i0 < 0 || i0 + 1 >= source.length) continue;
    // Interpolation linéaire : sans elle, une transposition non entière rend un bruit de quantification.
    const f = p - i0;
    const v = source[i0] * (1 - f) + source[i0 + 1] * f;
    seg[i] = v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (longueur - 1 || 1)));
  }
  return seg;
}

export function brasser(source: Float32Array, frequence: number, o: OptionsBrassage): Float32Array {
  const alea = tirage(o.graine);
  const longueurGrain = Math.max(2, Math.round(o.grainSec * frequence));
  const dureeSource = source.length / frequence;
  // LA VITESSE EST BORNÉE, et ce n'est pas un garde-fou de confort. La durée de sortie vaut celle
  // de la source DIVISÉE par la vitesse : à 10⁻⁶, une source de deux dixièmes de seconde
  // demanderait deux cent mille secondes de sortie, soit soixante-dix gigaoctets — le processus
  // meurt avant d'avoir rendu quoi que ce soit. Mesuré : le premier jet le faisait, et c'est le
  // test des bords qui l'a trouvé en tuant le worker. Cent fois plus lent est déjà un étirement
  // que personne ne pousse plus loin.
  const VITESSE_MIN = 0.01, VITESSE_MAX = 100;
  const signe = o.vitesse < 0 ? -1 : 1;
  const vitesse = signe * Math.min(VITESSE_MAX, Math.max(VITESSE_MIN, Math.abs(o.vitesse)));
  const dureeSortie = o.dureeSec ?? dureeSource / Math.abs(vitesse);
  const n = Math.max(1, Math.round(dureeSortie * frequence));
  const sortie = new Float64Array(n);
  const poids = new Float64Array(n);

  const pas = Math.max(1, Math.round(frequence / Math.max(0.01, o.densite)));
  for (let debut = 0; debut < n; debut += pas) {
    // La position dans la source : le temps de sortie, ramené au temps de la source.
    const lecture = debut * vitesse + (alea() * 2 - 1) * o.dispersionSec * frequence;
    const demiTons = o.transposition + (alea() * 2 - 1) * o.dispersionDemiTons;
    const rapport = Math.pow(2, demiTons / 12);
    const seg = lireSegment(source, lecture, longueurGrain, rapport);
    for (let i = 0; i < longueurGrain; i++) {
      const j = debut + i;
      if (j >= n) break;
      sortie[j] += seg[i];
      // Le poids accumulé est celui de la fenêtre, et non 1 : aux endroits où les segments se
      // recouvrent peu, diviser par le nombre de segments creuserait des trous d'amplitude.
      poids[j] += 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (longueurGrain - 1 || 1));
    }
  }
  // On ne normalise que là où les segments se recouvrent vraiment : sous ce seuil, diviser
  // amplifierait le silence entre deux grains d'un nuage clairsemé, ce qui est tout le contraire
  // de ce qu'on veut entendre.
  return Float32Array.from(sortie, (v, i) => (poids[i] > 0.5 ? v / poids[i] : v));
}
