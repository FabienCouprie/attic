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
  /**
   * Où en est la construction du lecteur, de 0 à 1, ou `undefined` quand il n'y en a aucune en
   * cours.
   *
   * ELLE SUIT LE CALCUL AU LIEU DE L'ACCOMPAGNER, et c'est pourquoi ce n'est pas `progression`. Le
   * résultat est déjà posé quand elle paraît : le nœud est terminé, son tampon est là, et il
   * s'écoute déjà par le bouton pendant que son lecteur s'écrit.
   */
  apercu?: number;
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
 *
 * UN STATUT NEUF EFFACE LA MENTION DU LECTEUR, et c'est voulu : changer de statut veut dire qu'un
 * autre calcul commence sur ce nœud, et le lecteur qui s'écrivait porte sur le résultat d'avant.
 */
export function poserStatut(id: string, statut: string, progression?: string, progressionDuNoeud = false): void {
  const avant = statutDe(id);
  if (avant.statut === statut && avant.progression === progression
      && avant.progressionDuNoeud === progressionDuNoeud) return;
  etats.set(id, Object.freeze({ statut, progression, progressionDuNoeud }));
  prevenir(id);
}

/**
 * Poser où en est le lecteur d'un nœud, sans toucher à son statut.
 *
 * `undefined` retire la mention. LA FRACTION EST ARRONDIE AU CENTIÈME ICI, et non chez l'appelant :
 * l'écriture d'un WAV appelle ceci à chaque tranche, soit trois mille six cents fois pour une heure
 * de son, et sans cet arrondi le nœud se redessinerait autant de fois pour un chiffre identique.
 */
export function poserApercu(id: string, fraction: number | undefined): void {
  const arrondie = fraction === undefined
    ? undefined
    : Math.round(Math.min(1, Math.max(0, fraction)) * 100) / 100;
  const avant = statutDe(id);
  if (avant.apercu === arrondie) return;
  etats.set(id, Object.freeze({ ...avant, apercu: arrondie }));
  prevenir(id);
}

/**
 * Le nœud visible dont chaque ombre tient lieu.
 *
 * UNE OMBRE EST L'ÉTAT D'UN NŒUD QUE L'ÉCRAN NE MONTRE PAS : un nœud aplati d'un méta-composant, une
 * copie de boucle. Le moteur reporte cet état sur le nœud visible et le perdait aussitôt : un méta ne
 * savait donc pas, au run suivant, lesquels de ses nœuds avaient déjà tourné, et un run ciblé qui
 * n'en touchait que la moitié le disait terminé. Aucun composant ne s'abonne à ces identifiants : ils
 * ne coûtent aucun rendu. Voir `core/conteneurs.ts`.
 */
const proprietaires = new Map<string, string>();

/** Poser l'état d'un nœud invisible sous son propre identifiant, rattaché au nœud visible qu'il sert. */
export function poserStatutOmbre(id: string, visible: string, statut: string): void {
  proprietaires.set(id, visible);
  poserStatut(id, statut);
}

/**
 * Remettre des nœuds en attente. Sans liste, c'est tout le graphe.
 *
 * LES OMBRES D'UN NŒUD REPARTENT AVEC LUI : remettre un méta à zéro remet à zéro ce qu'il contient.
 */
export function reinitialiserStatuts(ids?: Iterable<string>): void {
  const cibles = ids ? [...ids] : [...etats.keys()];
  const visibles = new Set(cibles);
  for (const [ombre, visible] of proprietaires) if (visibles.has(visible)) cibles.push(ombre);
  if (!ids) proprietaires.clear();
  for (const id of cibles) {
    proprietaires.delete(id);
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
