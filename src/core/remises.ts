// core/remises.ts — Ce qui a été remis à zéro ou oublié, et à quel numéro.
//
// POURQUOI CE MODULE. Pièce P6 du plan de l'architecture par messages entre l'interface et le moteur.
// Une passe calcule sur l'instantané du graphe pris à son départ. Ce qu'elle dit d'un nœud remis à
// zéro, ou d'un graphe abandonné, après ce départ est périmé : le relevé du 2026-11-16 l'avait lu dans
// le code (D1, D2), et `tests-e2e/evenements-perimes-dans-application.spec.ts` l'a vu dans
// l'application, sept écritures reposées après un ↺ et soixante-quatorze après un import.
//
// LE NUMÉRO EST UN COMPTEUR DU MOTEUR, qui croît à chaque remise à zéro et à chaque oubli. Une passe
// retient celui de son départ ; ce qu'elle dit d'un nœud noté depuis est à écarter. Le moteur s'en
// sert pour ne pas réécrire son cache, le récepteur pour ne pas réécrire ce qui est montré. Ce module
// est le registre que les deux tiennent, chacun le sien.
//
// LA RÈGLE DU `::` EST CELLE DU CACHE (`ui/moteur/cache.ts`) : remettre un méta à zéro remet aussi les
// nœuds de son contenu, rangés sous `monMeta::…` à toute profondeur. Un oubli simple ne touche que
// les identifiants qu'il nomme, comme `oublier` dans le cache.

export interface Remises {
  /**
   * Note ces nœuds, ou tous, à ce numéro. `avecLeurContenu` étend la note aux internes de leurs métas.
   * Un numéro plus petit qu'une note déjà prise ne l'efface pas.
   */
  noter(numero: number, ids: readonly string[] | "tout", avecLeurContenu: boolean): void;
  /** Ce nœud a-t-il été noté après ce numéro, lui, tous, ou un méta qui le contient ? */
  depuis(id: string, numero: number): boolean;
}

export function creerRemises(): Remises {
  /** Pour chaque nœud noté : la dernière note qui le nomme, et la dernière qui nomme son contenu. */
  const notes = new Map<string, { lui: number; contenu: number }>();
  let tout = Number.NEGATIVE_INFINITY;
  return {
    noter(numero, ids, avecLeurContenu) {
      if (ids === "tout") { tout = Math.max(tout, numero); return; }
      for (const id of ids) {
        const n = notes.get(id) ?? { lui: Number.NEGATIVE_INFINITY, contenu: Number.NEGATIVE_INFINITY };
        n.lui = Math.max(n.lui, numero);
        if (avecLeurContenu) n.contenu = Math.max(n.contenu, numero);
        notes.set(id, n);
      }
    },
    depuis(id, numero) {
      if (tout > numero) return true;
      if ((notes.get(id)?.lui ?? Number.NEGATIVE_INFINITY) > numero) return true;
      // LES MÉTAS QUI LE CONTIENNENT : chaque préfixe qui finit avant un `::`.
      for (let i = id.indexOf("::"); i >= 0; i = id.indexOf("::", i + 2)) {
        if ((notes.get(id.slice(0, i))?.contenu ?? Number.NEGATIVE_INFINITY) > numero) return true;
      }
      return false;
    },
  };
}
