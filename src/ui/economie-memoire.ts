// ui/economie-memoire.ts — La bascule qui commande le régime des pistes longues.
//
// CE QUE LA BASCULE COMMANDE. Au-delà de dix minutes de piste, le moteur cesse de construire
// l'aperçu écoutable des nœuds intermédiaires : 109 Mo par nœud et par dix minutes de stéréo,
// retenus en mémoire vive par le processus navigateur (cf. core/memoire.ts). À la place, un bouton
// « Écouter » construit l'aperçu au moment où on le demande.
//
// POURQUOI ELLE EXISTE, ALORS QUE LE RÉGIME EST LE BON. Parce que ce n'est pas toujours vrai. Sur
// une machine largement pourvue, quelqu'un qui compare trois étages d'une chaîne d'une heure
// préfère les trois lecteurs tout de suite, et peut se le permettre. Le seuil est un défaut sûr,
// pas un verdict : il se coupe d'un clic, à côté de la sauvegarde automatique.
//
// ACTIVÉE PAR DÉFAUT — à l'inverse de la sauvegarde automatique, dont le défaut reproduit le
// comportement historique. Ici le comportement historique est celui qui fait tomber l'application
// sur une piste d'une heure ; le défaut sûr est donc le nouveau.

/** Clé de préférence : la bascule de la barre d'outils, groupe Fichier. */
export const CLE_ECONOMIE_MEMOIRE = "attic-economie-memoire";

/** Activée par défaut : le régime économe est le comportement sûr sur une piste longue. */
export function lireEconomieMemoire(stockage?: Pick<Storage, "getItem">): boolean {
  try {
    const s = stockage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    return s?.getItem(CLE_ECONOMIE_MEMOIRE) !== "0";
  } catch {
    return true;
  }
}

/** Écrit la préférence. Un stockage indisponible ne doit pas empêcher la bascule d'agir. */
export function ecrireEconomieMemoire(active: boolean, stockage?: Pick<Storage, "setItem">): void {
  try {
    const s = stockage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    s?.setItem(CLE_ECONOMIE_MEMOIRE, active ? "1" : "0");
  } catch {
    // Mode privé, stockage bloqué : la bascule vaut pour la session, et c'est tout.
  }
}
