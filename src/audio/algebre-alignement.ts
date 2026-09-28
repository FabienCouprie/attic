// audio/algebre-alignement.ts — L'alignement temporel dynamique.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.


export interface PointAlignement {
  i: number;
  j: number;
}

export interface ResultatDTW {
  /** Un point par pas du chemin optimal, dans l'ordre (i croissant), chaque
   *  point associant l'indice de trame `i` de la séquence A à l'indice `j` de
   *  la séquence B. */
  chemin: PointAlignement[];
  /** Coût cumulé du chemin optimal divisé par sa longueur : indépendant de la
   *  durée des séquences (contrairement au coût DTW brut). Dans [0, 1] car le
   *  coût local (distance cosinus) l'est aussi pour des vecteurs non négatifs
   *  (ex. chroma). */
  distanceNormalisee: number;
  /** 1 - distanceNormalisee : 1 = séquences identiques, 0 = complètement différentes. */
  similarite: number;
}

// Distance cosinus (1 - similarité cosinus) plutôt qu'euclidienne : bornée
// dans [0, 1] pour des vecteurs non négatifs (chroma), donc comparable d'une
// paire de pistes à l'autre indépendamment de l'échelle des features — une
// distance euclidienne brute ne l'est pas. Un vecteur nul (trame de silence)
// est traité comme maximalement dissemblable à tout, plutôt que de diviser
// par une norme nulle.
function distanceCosinus(a: number[], b: number[], normeA: number, normeB: number): number {
  if (normeA < 1e-12 || normeB < 1e-12) return 1;
  let dot = 0;
  for (let k = 0; k < a.length; k++) dot += a[k] * b[k];
  const cos = dot / (normeA * normeB);
  return 1 - Math.min(1, Math.max(-1, cos));
}

export interface OptionsDTW {
  /** Rappelé régulièrement (pas à chaque ligne) avec une fraction 0..1. */
  onProgress?: (fraction: number) => void;
  /** Vérifié aux mêmes points de cession que onProgress — voir useExecutionGraphe.ts. */
  signal?: AbortSignal;
}

function cederAuNavigateur(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Dynamic Time Warping entre deux séquences de vecteurs (ex. chroma trame par
 * trame — voir `chromagrammeParTrame`) de longueurs différentes : trouve le
 * chemin de correspondance qui minimise le coût cumulé, pour aligner deux
 * pistes qui diffèrent en tempo/durée. Formulation stricte (le chemin DOIT
 * démarrer en (0,0) et finir en (n-1,m-1), les bords latéraux sont interdits
 * — coût infini) : sans ça, le chemin optimal pourrait "sauter" le début ou
 * la fin d'une des deux séquences plutôt que les aligner réellement.
 *
 * DTW coûte O(n·m) EN TEMPS, c'est inhérent à l'algorithme — mais la mémoire
 * est ramenée de O(n·m) à O(√n·m) par damiers ("checkpoints") : la passe
 * avant ne garde que des lignes de contrôle espacées de √n lignes (pas la
 * matrice complète), et le rétro-chemin recalcule à la demande, bande par
 * bande, la portion dense entre deux damiers consécutifs à partir de la
 * dernière ligne connue — jamais plus d'une bande bornée en mémoire à la
 * fois. Même principe que le traitement piste par piste de Classification de
 * pistes (décoder → utiliser → relâcher avant de passer à la suite) : sans
 * lui, deux pistes de 3-5 min (~15-26k trames chacune) demanderaient plusieurs
 * Go pour la seule matrice de coût — avec, quelques dizaines de Mo.
 *
 * Fonction ASYNCHRONE (pas juste par convention) : sur des pistes de
 * plusieurs minutes, ce calcul peut prendre plusieurs dizaines de secondes ;
 * sans jamais rendre la main au navigateur, ni l'anneau de progression du
 * nœud ni son état "en cours" ne peuvent se repeindre pendant tout ce temps
 * (React programme la mise à jour mais elle ne s'affiche qu'au prochain
 * repaint, qui n'arrive jamais tant que le thread JS ne cède pas) — même
 * cause que le gel d'interface déjà corrigé sur Classification de pistes.
 * Cède donc régulièrement (~60 fois/s) pendant la passe avant ET pendant la
 * reconstruction du rétro-chemin, en rapportant la progression et en
 * vérifiant `signal` à chaque cession (un reset pendant le calcul l'arrête
 * au prochain point de cession plutôt que de tourner jusqu'au bout en pure
 * perte).
 */
export async function calculerDTW(
  sequenceA: number[][],
  sequenceB: number[][],
  options: OptionsDTW = {},
): Promise<ResultatDTW> {
  const { onProgress, signal } = options;
  const n = sequenceA.length;
  const m = sequenceB.length;
  if (n === 0 || m === 0) {
    throw new Error("calculerDTW : les deux séquences doivent être non vides");
  }

  const normeA = sequenceA.map((v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0)));
  const normeB = sequenceB.map((v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0)));
  const cout = (i: number, j: number) => distanceCosinus(sequenceA[i], sequenceB[j], normeA[i], normeB[j]);
  const largeur = m + 1;

  // Passe avant + reconstruction du rétro-chemin recalculent chacune environ
  // n·m cellules (voir doc ci-dessus) : volume de travail total ≈ 2·n·m,
  // utilisé pour une progression continue sur l'ensemble du calcul plutôt que
  // deux barres séparées qui repartiraient de 0.
  const travailTotal = 2 * n * m;
  let travailFait = 0;
  let dernierCession = performance.now();
  const verifierEtCeder = async (): Promise<void> => {
    if (signal?.aborted) throw new Error("calculerDTW : annulé");
    const maintenant = performance.now();
    if (maintenant - dernierCession < 16) return; // ~60 fois/s au plus
    onProgress?.(Math.min(1, travailFait / travailTotal));
    await cederAuNavigateur();
    dernierCession = performance.now();
  };

  // ── Passe avant : ne conserve que des damiers espacés de `pas` lignes ──
  const pas = Math.max(1, Math.ceil(Math.sqrt(n)));
  const damiers: Float64Array[] = [];
  const damiersIndices: number[] = [];

  let precedente = new Float64Array(largeur).fill(Infinity);
  precedente[0] = 0;
  damiers.push(precedente.slice());
  damiersIndices.push(0);

  let courante = new Float64Array(largeur);
  for (let i = 1; i <= n; i++) {
    courante[0] = Infinity;
    for (let j = 1; j <= m; j++) {
      const diag = precedente[j - 1];
      const haut = precedente[j];
      const gauche = courante[j - 1];
      courante[j] = cout(i - 1, j - 1) + Math.min(diag, haut, gauche);
    }
    const tmp = precedente; precedente = courante; courante = tmp;
    if (i % pas === 0 || i === n) {
      damiers.push(precedente.slice());
      damiersIndices.push(i);
    }
    travailFait += m;
    await verifierEtCeder();
  }
  const distanceTotale = precedente[m];

  // ── Rétro-chemin bande par bande, du dernier damier vers le premier ──
  // Chaque bande est reconstruite en dense (au plus `pas` lignes) à partir du
  // damier de départ — la MÊME récurrence que ci-dessus, jamais une matrice
  // globale : aucune ambiguïté de bord, on ne fait que rejouer un morceau
  // borné du même calcul déjà validé, pas une décomposition indépendante.
  const chemin: PointAlignement[] = [];
  let jCourant = m;
  for (let b = damiers.length - 1; b > 0; b--) {
    const iFinBande = damiersIndices[b];
    const iDebutBande = damiersIndices[b - 1];
    const tailleBande = iFinBande - iDebutBande;

    const bande: Float64Array[] = [damiers[b - 1]];
    let prec = damiers[b - 1];
    for (let k = 1; k <= tailleBande; k++) {
      const ligne = new Float64Array(largeur);
      ligne[0] = Infinity;
      const iAbs = iDebutBande + k;
      for (let j = 1; j <= m; j++) {
        const diag = prec[j - 1];
        const haut = prec[j];
        const gauche = ligne[j - 1];
        ligne[j] = cout(iAbs - 1, j - 1) + Math.min(diag, haut, gauche);
      }
      bande.push(ligne);
      prec = ligne;
      travailFait += m;
      await verifierEtCeder();
    }

    let iLocal = tailleBande, j = jCourant;
    while (iLocal > 0) {
      chemin.push({ i: iDebutBande + iLocal - 1, j: j - 1 });
      const diag = bande[iLocal - 1][j - 1];
      const haut = bande[iLocal - 1][j];
      const gauche = bande[iLocal][j - 1];
      if (diag <= haut && diag <= gauche) { iLocal--; j--; }
      else if (haut <= gauche) { iLocal--; }
      else { j--; }
    }
    jCourant = j;
  }
  chemin.reverse();

  onProgress?.(1);
  const distanceNormalisee = distanceTotale / chemin.length;
  const similarite = Math.max(0, Math.min(1, 1 - distanceNormalisee));
  return { chemin, distanceNormalisee, similarite };
}

