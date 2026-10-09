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

/** Un port, réduit à ce que l'appariement a besoin d'en connaître. */
export interface PortDicte { type: string }

/**
 * Les ports d'un nœud, tels que l'appelant les lit dans sa fiche.
 *
 * C'EST LA FICHE AUGMENTÉE QU'IL FAUT LIRE, et non celle qui est écrite dans le plugin : le
 * registre ajoute une sortie « Audio » à la fin de toute fiche qui rend une séquence
 * (`plugins/sortie-audio.ts`). Sur un rendu de cercles, `out:0` est la séquence et `out:1` l'audio
 * — lire la fiche littérale ferait croire qu'il n'y a qu'un port, et ferait choisir le mauvais.
 */
export interface PortsDictes {
  sorties: readonly PortDicte[];
  entrees: readonly PortDicte[];
}

/**
 * Le premier couple de ports qui s'accordent entre deux nœuds, ou `null` si aucun ne va.
 *
 * POURQUOI CETTE FONCTION EXISTE. La dictée câblait `out:0 → in:0` en dur, aux quatre endroits où
 * elle pose une arête. La souris, elle, passe par `isValidConnection` et refuse une liaison dont
 * les types ne s'accordent pas : la voix était donc le seul chemin par lequel une arête impossible
 * entrait dans un graphe. Relevé par Fabien sur un fichier où une sortie « Cercle » arrivait dans
 * l'entrée audio d'une réverbération, et où l'arête s'affichait en rouge sans rien exécuter.
 *
 * ET LE DÉFAUT NE GUETTAIT PAS UN CAS RARE : tout composant qui rend une séquence porte son audio
 * en DERNIER, de sorte que « rendu de cercles, point d'écoute » dicté à la voix branchait la
 * séquence sur une entrée audio. La chaîne la plus naturelle d'un graphe de cercles était
 * précisément celle qu'on ne pouvait pas dicter.
 *
 * L'ORDRE DE RECHERCHE EST CELUI DES PORTS, sortie d'abord : le premier couple qui s'accorde
 * gagne. `out:0 → in:0` reste donc choisi chaque fois qu'il convient, et le comportement d'avant
 * est conservé partout où il était juste.
 *
 * `compatibles` est INJECTÉE plutôt qu'importée : la langue des commandes ne connaît pas le
 * domaine, et `src/docs/frontiere-domaine.test.ts` compte les fichiers du shell qui s'y couplent.
 */
export function premierLienCompatible(
  depart: PortsDictes | undefined,
  arrivee: PortsDictes | undefined,
  compatibles: (sortie: string, entree: string) => boolean,
): { sortie: number; entree: number } | null {
  const sorties = depart?.sorties ?? [];
  const entrees = arrivee?.entrees ?? [];
  for (let s = 0; s < sorties.length; s++) {
    for (let e = 0; e < entrees.length; e++) {
      if (compatibles(sorties[s].type, entrees[e].type)) return { sortie: s, entree: e };
    }
  }
  return null;
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
