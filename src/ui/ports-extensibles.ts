// ui/ports-extensibles.ts — Combien de ports un nœud extensible montre-t-il ?
//
// LE PROBLÈME. Le montage avait huit pistes parce qu'il fallait bien un nombre, et ce nombre était
// arbitraire : trop pour deux sons, trop peu pour douze. Les ports, eux, sont déclarés par la
// FICHE, commune à tous les nœuds d'un même type : ils ne peuvent pas varier d'un nœud à l'autre.
//
// ET LA RÈGLE VAUT DES DEUX CÔTÉS DU NŒUD. Elle n'a d'abord servi qu'aux entrées ; un séparateur
// de canaux pose exactement la même question en sortie, puisqu'il déclare les seize canaux de la
// plus grande disposition et qu'un stéréo n'en emploie deux. Le calcul ci-dessous ne nomme donc
// aucun côté : il prend un total, un plancher, une demande et les index branchés.
//
// CE QU'ON FAIT. La fiche déclare le maximum une fois pour toutes, et chaque nœud n'en DESSINE que
// ce qu'il utilise, plus une piste libre. Le moteur, la validation, les méta-composants et les
// fichiers de projet déjà enregistrés ne voient aucune différence : les ports existent toujours
// tous, seul leur affichage est réglable. Le prix est une limite haute, choisie par la fiche.
//
// LA RÈGLE DU BAS. Le nombre affiché ne descend jamais sous le dernier port branché : un câble ne
// doit pas disparaître parce qu'on a raccourci le nœud. C'est pourquoi le « − » se refuse tant
// qu'on n'a pas débranché.

/** Ce qu'une fiche déclare quand ses ports d'un côté s'affichent à la demande. */
export interface PortsExtensibles {
  /** Jamais moins que ceci, même vide. */
  min: number;
  /** Ce qu'un nœud neuf montre. */
  defaut: number;
}

export interface EtatPorts {
  /** Nombre de ports à dessiner, de ce côté-là. */
  visibles: number;
  /** Le « + » a-t-il encore quelque chose à montrer ? */
  peutAjouter: boolean;
  /** Le « − » peut-il retirer un port sans cacher un câble ? */
  peutRetirer: boolean;
}

/**
 * @param total         ports déclarés par la fiche, de ce côté-là
 * @param ext           ce que la fiche déclare, ou `undefined` si le nœud n'est pas extensible
 * @param demande       ce que le nœud a retenu (`undefined` : jamais réglé)
 * @param branchees     index des ports qui ont un câble
 */
export function etatPorts(
  total: number,
  ext: PortsExtensibles | undefined,
  demande: number | undefined,
  branchees: Iterable<number>,
): EtatPorts {
  if (!ext) return { visibles: total, peutAjouter: false, peutRetirer: false };
  let derniere = -1;
  for (const i of branchees) if (i > derniere && i < total) derniere = i;
  const plancher = Math.max(ext.min, derniere + 1);
  const voulu = Number.isFinite(demande) ? Math.round(demande as number) : ext.defaut;
  const visibles = Math.max(plancher, Math.min(total, voulu));
  return { visibles, peutAjouter: visibles < total, peutRetirer: visibles > plancher };
}
