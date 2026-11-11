// ui/priorite.ts — Le nœud prioritaire, hors du tableau des nœuds, avec un abonnement par nœud.
//
// POURQUOI CE MAGASIN, et c'est la pièce 3 du plan `work/plan-donnees-noeud-2026-11-11.md`. La
// priorité vivait dans un état d'`App.tsx`, qu'un effet recopiait dans le `data` de CHAQUE nœud :
// un ▶ réécrivait tous les nœuds en posant la priorité, puis tous encore en la retirant à la fin du
// run. Chaque nœud du canevas se redessinait deux fois, les effets qui suivent les nœuds repartaient,
// et le journal de séance réécrivait l'en-cours, tout cela pour colorer un seul bouton.
//
// ICI, CHANGER DE NŒUD PRIORITAIRE NE PRÉVIENT QUE DEUX NŒUDS : celui qui l'était et celui qui le
// devient. Le moteur lit la valeur vive par `noeudPrioritaire()`, comme il lisait la référence que
// l'effet tenait à jour, sans attendre un rendu.
import { useCallback, useSyncExternalStore } from "react";

let prioritaire: string | null = null;
const abonnes = new Map<string, Set<() => void>>();

function prevenir(id: string | null) {
  if (id === null) return;
  const liste = abonnes.get(id);
  if (!liste) return;
  for (const f of [...liste]) f();
}

/** Le nœud prioritaire, ou `null` quand aucun ne l'est. */
export function noeudPrioritaire(): string | null {
  return prioritaire;
}

/** Désigne le nœud prioritaire, ou n'en désigne aucun ; seuls l'ancien et le nouveau sont prévenus. */
export function definirPrioritaire(id: string | null): void {
  if (id === prioritaire) return;
  const avant = prioritaire;
  prioritaire = id;
  prevenir(avant);
  prevenir(id);
}

/** S'abonne aux changements de priorité de CE nœud ; rend de quoi se désabonner. */
export function surPriorite(id: string, rappel: () => void): () => void {
  let liste = abonnes.get(id);
  if (!liste) { liste = new Set(); abonnes.set(id, liste); }
  liste.add(rappel);
  return () => {
    liste!.delete(rappel);
    if (liste!.size === 0) abonnes.delete(id);
  };
}

/** Vrai quand ce nœud est le prioritaire ; ne fait redessiner que lui quand cela change. */
export function useEstPrioritaire(id: string): boolean {
  const abonner = useCallback((rappel: () => void) => surPriorite(id, rappel), [id]);
  const lire = useCallback(() => prioritaire === id, [id]);
  return useSyncExternalStore(abonner, lire, lire);
}
