// ui/statuts.ts — L'état d'exécution des nœuds, hors du tableau des nœuds.
//
// LE PROBLÈME, MESURÉ. `statut` et `progression` vivaient dans `node.data`. Les modifier voulait
// dire REMPLACER le tableau `nodes` dans l'état de React, ce qui fait repasser React Flow par son
// pipeline complet — il ré-adopte les N nœuds, les remesure, met à jour son magasin — pour un
// changement de chaîne de caractères sur un seul d'entre eux. Profilé : **7 ms par nœud présent, à
// chaque changement de statut**. Avec deux changements par nœud exécuté, le gel croît en N² :
//
//     5 nœuds  : 0,6 s de gel sur 0,8 s d'exécution
//     20 nœuds : 4,9 s de gel sur 5,1 s    ← quatre fois plus de nœuds, huit fois plus de gel
//
// Un graphe de cinquante nœuds passerait une demi-minute figé. Ce n'était pas une lenteur, c'était
// une limite d'échelle.
//
// POURQUOI CET ÉTAT N'A JAMAIS EU SA PLACE DANS LE GRAPHE. Un statut n'est ni sauvegardé, ni
// exporté, ni annulable : il est déjà exclu de toutes les listes de persistance, et `pertes.ts` le
// range parmi les « champs de statut runtime ». Il décrit ce qui se passe MAINTENANT, pas ce qu'est
// le graphe. Le mettre dans `node.data` revenait à faire payer à tout le graphe la nouvelle d'un
// seul nœud.
//
// CE QUE CE MAGASIN CHANGE. Le moteur écrit ici ; chaque nœud s'abonne à SON identifiant. Aucun
// nouveau tableau, aucun rendu de l'application, aucun passage par le pipeline de React Flow :
// seul le composant concerné se redessine, pour une demi-milliseconde.

import { useCallback, useSyncExternalStore } from "react";

export interface EtatNoeud {
  statut: string;
  progression?: string;
  /** Vrai quand `progression` vient du nœud lui-même, et non du moteur. */
  progressionDuNoeud: boolean;
}

/** L'état d'un nœud dont personne n'a encore rien dit. Une seule instance, partagée. */
export const ETAT_ATTENTE: EtatNoeud = Object.freeze({ statut: "attente", progressionDuNoeud: false });

const etats = new Map<string, EtatNoeud>();
const abonnes = new Map<string, Set<() => void>>();

function prevenir(id: string) {
  const liste = abonnes.get(id);
  if (!liste) return;
  for (const f of [...liste]) f();
}

/**
 * L'état d'un nœud, ou l'attente par défaut.
 *
 * LA RÉFÉRENCE EST STABLE tant que rien ne change : `useSyncExternalStore` compare les instantanés
 * par identité, et rendre un objet neuf à chaque lecture ferait boucler le rendu à l'infini.
 */
export function statutDe(id: string): EtatNoeud {
  return etats.get(id) ?? ETAT_ATTENTE;
}

/** S'abonner aux changements d'UN nœud. Rend de quoi se désabonner. */
export function surStatut(id: string, rappel: () => void): () => void {
  let liste = abonnes.get(id);
  if (!liste) { liste = new Set(); abonnes.set(id, liste); }
  liste.add(rappel);
  return () => {
    liste!.delete(rappel);
    if (liste!.size === 0) abonnes.delete(id);
  };
}

/**
 * Poser l'état d'un nœud.
 *
 * Rien n'est notifié si rien ne change : un moteur qui repose le même statut — ce qu'il fait à
 * chaque message de progression identique — ne doit pas provoquer de rendu.
 */
export function poserStatut(id: string, statut: string, progression?: string, progressionDuNoeud = false): void {
  const avant = statutDe(id);
  if (avant.statut === statut && avant.progression === progression
      && avant.progressionDuNoeud === progressionDuNoeud) return;
  etats.set(id, Object.freeze({ statut, progression, progressionDuNoeud }));
  prevenir(id);
}

/** Remettre des nœuds en attente. Sans liste, c'est tout le graphe. */
export function reinitialiserStatuts(ids?: Iterable<string>): void {
  const cibles = ids ? [...ids] : [...etats.keys()];
  for (const id of cibles) {
    if (!etats.has(id)) continue;
    etats.delete(id);
    prevenir(id);
  }
}

/** Les identifiants dont l'état n'est pas « attente » — pour les tests et le débogage. */
export function statutsPoses(): string[] {
  return [...etats.keys()];
}

// ── Le côté React ────────────────────────────────────────────────────────────────

/**
 * L'état d'exécution d'un nœud, abonné à ce seul nœud.
 *
 * `useSyncExternalStore` est fait pour exactement cela : un magasin hors de React, lu par un
 * composant qui ne se redessine que lorsque SA valeur change. Le rappel d'abonnement est stabilisé
 * par `useCallback`, sans quoi React se réabonnerait à chaque rendu.
 */
export function useStatut(id: string): EtatNoeud {
  const abonner = useCallback((rappel: () => void) => surStatut(id, rappel), [id]);
  const lire = useCallback(() => statutDe(id), [id]);
  return useSyncExternalStore(abonner, lire, lire);
}
