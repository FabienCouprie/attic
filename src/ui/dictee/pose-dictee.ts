// ui/dictee/pose-dictee.ts — Où la dictée pose, et sur quoi elle enchaîne.
//
// CES DÉCISIONS SONT ICI, ET NON DANS LE CANEVAS, parce qu'elles se trompent silencieusement : un
// composant posé sur un autre, ou enchaîné sur le mauvais nœud, ne lève aucune erreur et ne se voit
// qu'à l'œil. Elles sont donc écrites sans React, et éprouvées une à une.

export interface NoeudPose {
  id: string;
  position: { x: number; y: number };
  data: { ficheId?: unknown };
}

/** L'écart horizontal entre deux composants dictés, et la hauteur d'une rangée parallèle. */
export const PAS_X = 260;
export const PAS_Y = 170;

/**
 * Le composant sur lequel la dictée enchaîne.
 *
 * LA SÉLECTION L'EMPORTE, et c'est ce qui fait coopérer la voix et la souris : on clique sur un
 * nœud déjà posé, et la dictée reprend depuis lui. Sans sélection, c'est le dernier composant que
 * la dictée a posé, de sorte qu'une suite de noms forme une chaîne. Sans l'un ni l'autre, rien : le
 * premier composant d'une dictée ne s'enchaîne sur personne.
 */
export function noeudCourant(
  noeuds: readonly NoeudPose[], selId: string | null, dernierDicte: string | null,
): NoeudPose | undefined {
  return noeuds.find((n) => n.id === selId) ?? noeuds.find((n) => n.id === dernierDicte);
}

/**
 * Où poser le prochain composant.
 *
 * À DROITE DU COURANT, ce qui donne à une chaîne dictée la forme qu'elle aurait à la souris. En
 * parallèle, une rangée plus bas et à la même abscisse : les deux branches partent du même point,
 * ce qui est ce qu'on vient de demander.
 *
 * SANS COURANT, ON NE POSE PAS À L'ORIGINE mais après ce qui existe déjà : poser à l'origine
 * recouvrirait un graphe en cours, et le composant dicté serait invisible sous un autre.
 */
export function positionSuivante(
  courant: NoeudPose | undefined, noeuds: readonly NoeudPose[], parallele: boolean,
): { x: number; y: number } {
  if (courant) {
    return parallele
      ? { x: courant.position.x, y: courant.position.y + PAS_Y }
      : { x: courant.position.x + PAS_X, y: courant.position.y };
  }
  if (noeuds.length === 0) return { x: 120, y: 120 };
  const droite = Math.max(...noeuds.map((n) => n.position.x));
  const haut = Math.min(...noeuds.map((n) => n.position.y));
  return { x: droite + PAS_X, y: haut };
}

/** Une arête, réduite à ce que le positionnement a besoin d'en connaître. */
export interface AreteDeDictee {
  id: string;
  source: string;
  target: string;
}

/**
 * Ce qu'il faut recâbler pour INSÉRER un nœud après un autre, et non simplement en dériver.
 *
 * « AJOUTE UN COMPRESSEUR APRÈS LA RÉVERBÉRATION » VEUT DIRE QUE LE SON Y PASSE. Si la
 * réverbération alimente déjà une sortie, le compresseur se met ENTRE les deux : c'est ce qu'on dit
 * en studio, et c'est ce qui distingue cette grammaire d'un simple lien de plus. Dériver laisserait
 * la sortie branchée où elle était, et le composant demandé pendrait à côté du chemin du son.
 *
 * CE QUI EST RENDU NE TOUCHE À RIEN : les arêtes sortantes de la référence sont nommées, à charge
 * de l'appelant de les faire partir du nouveau nœud, et le lien de la référence vers lui est donné
 * à poser. L'appelant tient déjà sa copie de travail et son contrôle de cycle.
 *
 * `avant` est la même chose prise par l'autre bout : ce qui ENTRE dans la référence entre désormais
 * dans le nouveau nœud, qui alimente la référence.
 */
export function planInsertion(
  aretes: readonly AreteDeDictee[], refId: string, nouveauId: string, ou: "apres" | "avant",
): { aRediriger: string[]; lien: { source: string; target: string } } {
  const aRediriger = aretes
    .filter((a) => (ou === "apres" ? a.source === refId : a.target === refId))
    .map((a) => a.id);
  const lien = ou === "apres"
    ? { source: refId, target: nouveauId }
    : { source: nouveauId, target: refId };
  return { aRediriger, lien };
}

/**
 * Le nœud que « relier X à Y » désigne : le DERNIER posé qui porte cette fiche.
 *
 * LE DERNIER, parce qu'on parle de ce qu'on vient de faire. Dire « relier réverbération à
 * compresseur » après en avoir posé deux désigne les deux derniers, et non ceux d'il y a dix
 * minutes à l'autre bout du canevas.
 */
export function dernierDeFiche(
  noeuds: readonly NoeudPose[], ficheId: string,
): NoeudPose | undefined {
  for (let i = noeuds.length - 1; i >= 0; i--) {
    if (noeuds[i].data?.ficheId === ficheId) return noeuds[i];
  }
  return undefined;
}
