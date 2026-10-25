// ui/champ-de-saisie.ts — Reconnaître un champ de saisie, et savoir en sortir.
//
// POURQUOI CE FICHIER EXISTE, ET IL RÉPARE DEUX CHOSES À LA FOIS.
//
// 1. LA MÊME RÈGLE VIVAIT EN TROIS EXEMPLAIRES. `App.tsx`, `BarreOutils.tsx` et `LigneDeTemps.tsx`
//    écrivaient chacun « si la cible est un INPUT, un TEXTAREA, un SELECT ou un contenu éditable,
//    ne pas intercepter ». Les trois étaient encore identiques au mot près — donc pas encore
//    divergentes, mais trois endroits à tenir en phase, ce qui est exactement la forme du défaut
//    que ce dépôt a payé le plus souvent.
//
// 2. ET RIEN NE PERMETTAIT DE SORTIR D'UN CHAMP. C'est le défaut que Fabien a signalé, et il n'est
//    pas neuf : la règle ci-dessus et le champ de recherche de la palette datent tous deux du
//    commit initial. Le piège est donc LATENT depuis l'origine, ce qui explique qu'il « réapparaisse »
//    plutôt qu'il ne soit apparu.
//
// LE PARCOURS QUI LE DÉCLENCHE, MESURÉ DANS L'APPLICATION. Les composants de la palette se
// GLISSENT, ils ne se cliquent pas : on clique le champ de recherche, on tape, on glisse le
// composant sur le canevas — et un glisser ne retire pas le focus du champ. À partir de là, le
// focus reste dans la palette et les quatre raccourcis du canevas sont morts.
//
// Mesuré, focus posé dans `.palette-recherche` : Ctrl+V laisse trois nœuds sur trois, Ctrl+Z en
// laisse trois aussi — le collage précédent n'est pas annulé. Les deux sont bien MORTS, pas lents.
//
// CE QU'IL NE FAUT PAS FAIRE, et c'est pourquoi la règle reste : retirer le garde. Ctrl+C dans un
// champ de texte doit copier le TEXTE, et non les nœuds sélectionnés derrière. Le problème n'est pas
// le garde, c'est qu'on ne puisse pas quitter le champ.

/** Les balises dont le contenu se tape, et dont les raccourcis du canevas doivent se détourner. */
const BALISES = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * Cette cible est-elle un champ de saisie ?
 *
 * ELLE PREND UN `EventTarget` ET NON UN `HTMLElement`, parce que c'est ce qu'un événement porte :
 * les trois exemplaires précédents transtypaient chacun de leur côté, ce qui est une conversion de
 * plus à ne pas se tromper. Un `null`, un document ou une fenêtre ne sont pas des champs.
 */
export function estUnChampDeSaisie(cible: EventTarget | null | undefined): boolean {
  if (!cible || typeof (cible as HTMLElement).tagName !== "string") return false;
  const el = cible as HTMLElement;
  return BALISES.has(el.tagName) || el.isContentEditable === true;
}

/**
 * Quitte le champ qui a le focus, et dit si c'en était un.
 *
 * LE RETOUR SERT À L'APPELANT QUI VEUT ENCHAÎNER : la palette s'en sert pour rendre le focus au
 * canevas au moment où l'on glisse un composant, c'est-à-dire au moment précis où l'utilisateur
 * cesse de taper et recommence à manipuler des nœuds.
 *
 * IL NE DÉPLACE PAS LE FOCUS AILLEURS, il le relâche : viser le canevas demanderait de le connaître
 * d'ici, et un `blur` suffit — le corps du document reprend le focus, et c'est là que les
 * gestionnaires du canevas écoutent.
 */
export function quitterLeChamp(actif: Element | null = typeof document === "undefined" ? null : document.activeElement): boolean {
  if (!estUnChampDeSaisie(actif)) return false;
  (actif as HTMLElement).blur();
  return true;
}
