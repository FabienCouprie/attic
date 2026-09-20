// plugins/grapheGlobal.ts — Le graphe en cours d'exécution, mis à disposition des nœuds.
//
// POURQUOI CE DÉTOUR. Le contrat d'exécution du cœur (`ContexteExecution`, core/types.ts) ne
// donne à un nœud ni les arêtes ni les résultats des autres, et c'est écrit noir sur blanc :
// « ce sont des détails internes du moteur », les valeurs passant par `entree()` et
// `entrees()`. Cette frontière est bonne — elle empêche un nœud de dépendre du câblage de son
// voisin — et elle n'est pas à ouvrir pour un nœud.
//
// Or un nœud a besoin du graphe lui-même : celui qui le DOCUMENTE. Il ne demande aucune
// valeur, il demande la structure, et c'est la seule chose que le contrat ne puisse pas
// exprimer. Plutôt que d'élargir le cœur pour un cas de domaine — chaque domaine devrait alors
// fournir un graphe —, on emploie le motif déjà en place dans `soundfontGlobal.ts` : un état
// ambiant du domaine, posé par l'interface, lu par les nœuds qui le veulent.
//
// CE QU'IL FAUT SAVOIR DE SES LIMITES, puisqu'un global en a toujours :
//  - il est écrit au lancement d'un run, avant l'exécution du premier nœud ;
//  - c'est le graphe TEL QU'IL EST COMPOSÉ, méta-nœuds non dépliés et boucles non déroulées —
//    autrement dit ce que l'utilisateur voit et ce qu'un fichier de projet contient, et non la
//    forme aplatie que le moteur exécute. Pour documenter, c'est la bonne : personne ne
//    reconnaîtrait son graphe dans ses copies de boucle numérotées ;
//  - il ne vaut que pour une exécution à la fois. L'interface n'en mène qu'une, et deux runs
//    concurrents se marcheraient dessus — c'est le prix du motif, et il est assumé ici.

import type { AreteG, NoeudG } from "../core/meta";

export interface GrapheCourant {
  noeuds: NoeudG[];
  aretes: AreteG[];
}

type GlobalAttic = typeof globalThis & { __attic_graphe__?: GrapheCourant | null };

const g = globalThis as GlobalAttic;

/** Posé par le moteur au lancement. `null` efface — utile dans un test. */
export function publierGrapheCourant(graphe: GrapheCourant | null): void {
  g.__attic_graphe__ = graphe;
}

/** Le graphe en cours, ou `null` hors exécution. */
export function grapheCourant(): GrapheCourant | null {
  return g.__attic_graphe__ ?? null;
}
