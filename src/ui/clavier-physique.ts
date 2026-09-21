// ui/clavier-physique.ts — Quand le clavier de l'ordinateur doit-il faire sonner un nœud ?
//
// LE DÉFAUT QU'IL CORRIGE. Les nœuds à clavier jouable — « Clavier mélodie », « Clavier SFZ » —
// installaient leur écoute du clavier physique sur `window`, sans condition, dès que leur vue était
// montée. Or React Flow monte la vue de TOUS les nœuds du graphe, visibles à l'écran ou non. Trois
// conséquences, toutes constatées :
//
//   - un clavier posé quelque part dans le graphe sonnait alors qu'on travaillait ailleurs ;
//   - deux claviers dans le même graphe sonnaient ENSEMBLE à chaque touche ;
//   - taper du texte dans un paramètre — un motif, un nom de fichier — jouait des notes, la lettre
//     « z » devenant un do.
//
// LA RÈGLE EST DONC DOUBLE, et les deux moitiés comptent : le nœud doit être SÉLECTIONNÉ, et la
// frappe ne doit pas être destinée à un champ de saisie. La sélection est ce que l'utilisateur voit
// et décide — un nœud entouré est le nœud dont on s'occupe —, là où « la vue est montée » ne se
// voit pas et ne se décide pas.

/**
 * La frappe est-elle destinée à un champ où l'on écrit ?
 *
 * Un `<input>`, un `<textarea>`, un `<select>`, ou n'importe quel élément rendu modifiable par
 * `contenteditable` — l'inspecteur en emploie pour les motifs. On regarde aussi les ascendants :
 * la cible d'un événement dans un champ riche peut être un nœud interne.
 */
export function estChampDeSaisie(cible: unknown): boolean {
  let el = cible as { tagName?: string; isContentEditable?: boolean; parentElement?: unknown } | null;
  for (let profondeur = 0; el && profondeur < 8; profondeur++) {
    const balise = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
    if (balise === "INPUT" || balise === "TEXTAREA" || balise === "SELECT") return true;
    if (el.isContentEditable === true) return true;
    el = (el.parentElement ?? null) as typeof el;
  }
  return false;
}

/**
 * Le clavier physique doit-il jouer cette frappe ?
 *
 * Écrit comme une fonction plutôt qu'en ligne dans le composant parce que c'est la DÉCISION, et
 * qu'elle ne s'observe pas facilement dans une interface : un poste de développement n'a
 * généralement qu'un seul clavier posé sur le graphe, et le défaut ne se voit qu'à deux.
 */
export function clavierDoitJouer(o: { selectionne: boolean; cible?: unknown }): boolean {
  if (!o.selectionne) return false;
  return !estChampDeSaisie(o.cible);
}
