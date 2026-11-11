// ui/gestes-noeud.ts — Les gestes qu'App.tsx offre à chaque nœud, lus par le nœud et ses vues.
//
// POURQUOI UN CONTEXTE, et c'est la pièce 4 du plan `work/plan-donnees-noeud-2026-11-11.md`. Les
// treize gestes étaient posés dans le `data` de chaque nœud, recopiés en quatorze endroits : à la
// création, à l'import, au collage, à la reprise de séance, à l'annulation… Un nœud gardait donc les
// fermetures du moment où il avait été posé, et un chemin qui oubliait de les recopier donnait un nœud
// sourd. Ici, ils sont fournis une fois par `App.tsx`, et le nœud comme ses vues les lisent par
// `useGestes()`.
//
// LA VALEUR DU CONTEXTE NE CHANGE JAMAIS, et c'est voulu. Si elle suivait chaque nouvelle fermeture
// d'`App.tsx`, chaque changement redessinerait tous les nœuds. Chaque geste lit donc, au moment où on
// l'appelle, la version courante des gestes d'`App.tsx` : aucune fermeture n'est jamais périmée, et
// aucun nœud n'est redessiné pour cela. Chaque geste garde aussi la même identité d'un rendu à
// l'autre, de sorte qu'un effet qui en dépend ne repart pas.
//
// DEUX TEMPS. Dans celui-ci, les lecteurs passent au contexte ; les gestes restent recopiés dans
// `data`, sans plus personne pour les y lire. Le suivant retire les recopies.
import { createContext, useContext, useMemo, type MutableRefObject } from "react";
import type { RappelsDuNoeud } from "./noeud-atelier";

/** Les treize gestes d'un nœud, tous présents. */
export type GestesNoeud = Required<RappelsDuNoeud>;

/**
 * Des gestes qui délèguent, à chaque appel, à la version courante de ce que `lire` rend.
 *
 * AUCUNE LISTE DE NOMS ICI : un geste se crée à la première lecture de son nom, puis se garde. La
 * liste est celle de ce qu'`App.tsx` fournit, et `ui/gestes-noeud.test.ts` la tient au type.
 */
export function gestesDelegues(lire: () => Partial<GestesNoeud> | null | undefined): GestesNoeud {
  const crees = new Map<string, (...args: unknown[]) => unknown>();
  return new Proxy({} as GestesNoeud, {
    get: (_cible, nom) => {
      if (typeof nom !== "string") return undefined;
      let geste = crees.get(nom);
      if (!geste) {
        geste = (...args: unknown[]) => (lire()?.[nom as keyof GestesNoeud] as ((...a: unknown[]) => unknown) | undefined)?.(...args);
        crees.set(nom, geste);
      }
      return geste;
    },
  });
}

/**
 * HORS D'UN ATELIER, UN GESTE NE FAIT RIEN : c'est ce que rendait un nœud dont le `data` ne portait
 * pas de gestes, et c'est le cas d'une vue montée seule dans un test.
 */
const SANS_ATELIER = gestesDelegues(() => null);

const ContexteGestes = createContext<GestesNoeud>(SANS_ATELIER);

/** Le fournisseur des gestes, posé une fois par `App.tsx` autour du canevas et de l'inspecteur. */
export const FournisseurDeGestes = ContexteGestes.Provider;

/** Les gestes d'un nœud, pour le nœud lui-même et ses vues. */
export function useGestes(): GestesNoeud {
  return useContext(ContexteGestes);
}

/**
 * La valeur à fournir : des gestes stables, qui lisent à chaque appel ce que `source` désigne alors.
 *
 * `source` est la référence qu'`App.tsx` tient déjà à jour sur sa fonction `callbacksNoeud`.
 */
export function useGestesStables(source: MutableRefObject<(() => Partial<GestesNoeud>) | null>): GestesNoeud {
  return useMemo(() => gestesDelegues(() => source.current?.()), [source]);
}
