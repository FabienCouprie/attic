// ui/flux-arete.ts — Quand une arête doit-elle montrer un point circulant ?
//
// Le point figure une donnée QUI CIRCULE. Il ne doit donc apparaître que
// lorsque quelque chose passe réellement par cette arête-là.
//
// La règle est celle du nœud d'ARRIVÉE : une arête est active quand le nœud
// qu'elle alimente est en train de s'exécuter, puisque c'est à ce moment qu'il
// lit la valeur produite en amont.
//
// La condition d'origine — « la source OU la cible tourne » — animait une
// arête de trop. Sur une chaîne A → B → C dont on exécute B seul, elle
// allumait A→B (juste : B consomme la sortie de A) mais aussi B→C, alors que
// rien ne sort de B tant que C n'a pas démarré. L'animation montrait un flux
// vers un nœud qui n'allait peut-être jamais s'exécuter.

/** Statut d'exécution d'un nœud, tel que le moteur le pose dans `data.statut`. */
export type StatutNoeud = "attente" | "en_cours" | "termine" | "erreur" | undefined;

/**
 * L'arête transporte-t-elle une donnée en ce moment ?
 *
 * @param statutSource statut du nœud d'origine — volontairement ignoré : ce
 *        n'est pas parce qu'un nœud calcule que ses sorties circulent déjà.
 * @param statutCible statut du nœud d'arrivée
 */
export function areteEnFlux(statutSource: StatutNoeud, statutCible: StatutNoeud): boolean {
  void statutSource;
  return statutCible === "en_cours";
}
