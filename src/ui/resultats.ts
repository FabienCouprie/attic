// ui/resultats.ts — Ce qu'un run a produit, hors du tableau des nœuds.
//
// LE PROBLÈME, MESURÉ, ET C'EST LE MÊME QUE POUR LES STATUTS. Un résultat vivait dans `node.data` :
// le poser voulait dire REMPLACER le tableau `nodes` dans l'état de React, ce qui fait repasser
// React Flow par son pipeline complet — il ré-adopte les N nœuds, les remesure, met à jour son
// magasin — pour un champ qui n'intéresse qu'un seul d'entre eux. Profilé par le dépôt sur les
// statuts : **7 ms par nœud présent, à chaque changement**, d'où un gel en N².
//
// CE QUE CELA COÛTAIT ICI, RELEVÉ PAR FABIEN EN DEUX TEMPS. D'abord « les lecteurs apparaissent
// longtemps après que les nœuds soient notés comme terminés dans les workflows longs » : les
// correctifs étaient collectés et posés en UN SEUL `setNodes` après toute la boucle de calcul, si
// bien qu'un nœud terminé à 180 ms ne montrait rien jusqu'à 4 180 ms sur une chaîne de quatre. Puis,
// une fois la pose faite par paquets de deux cents millisecondes : « est-ce que ce que tu viens de
// faire est susceptible d'allonger le temps d'exécution ? » Oui, et mesuré sur douze nœuds de
// trois cents millisecondes chacun — donc un paquet par nœud — **3 678 ms contre 4 434, soit
// +20,6 %**, les deux distributions ne se recouvrant pas.
//
// LES DEUX COÛTS ONT LA MÊME CAUSE, ET CE MAGASIN LES ÔTE TOUS LES DEUX. Poser un résultat ici ne
// crée aucun tableau, ne rend pas l'application et ne passe pas par React Flow : seul le composant
// concerné se redessine. Il n'y a donc plus à choisir entre la latence et le temps de run.
//
// POURQUOI UN RÉSULTAT N'A JAMAIS EU SA PLACE DANS LE GRAPHE. Il n'est ni sauvegardé, ni exporté, ni
// annulable : `core/pertes.ts` le range déjà parmi les « champs de statut runtime, recréés à
// l'exécution ». Il décrit ce que la DERNIÈRE exécution a produit, pas ce qu'est le graphe.
//
// UN `undefined` POSÉ EFFACE LE CHAMP, et ce n'est pas un détail. Le moteur rend ses correctifs avec
// des champs à `undefined` pour dire « ce composant ne rend plus rien à montrer » : sans cela, un
// nœud garderait à l'écran ce qu'il montrait au run précédent. Le fusionnement le respecte donc.
import { useCallback, useSyncExternalStore } from "react";

/** Ce qu'un run a produit sur un nœud. Les clés sont celles que le moteur pose. */
export type ResultatNoeud = Readonly<Record<string, unknown>>;

/** Le résultat d'un nœud dont aucun run n'a rien dit. Une seule instance, partagée. */
export const RESULTAT_VIDE: ResultatNoeud = Object.freeze({});

const resultats = new Map<string, ResultatNoeud>();
const abonnes = new Map<string, Set<() => void>>();

function prevenir(id: string) {
  const liste = abonnes.get(id);
  if (!liste) return;
  for (const f of [...liste]) f();
}

/**
 * Le résultat d'un nœud, ou le vide par défaut.
 *
 * LA RÉFÉRENCE EST STABLE tant que rien ne change : `useSyncExternalStore` compare les instantanés
 * par identité, et rendre un objet neuf à chaque lecture ferait boucler le rendu à l'infini.
 */
export function resultatDe(id: string): ResultatNoeud {
  return resultats.get(id) ?? RESULTAT_VIDE;
}

/** S'abonner aux changements d'UN nœud. Rend de quoi se désabonner. */
export function surResultat(id: string, rappel: () => void): () => void {
  let liste = abonnes.get(id);
  if (!liste) { liste = new Set(); abonnes.set(id, liste); }
  liste.add(rappel);
  return () => {
    liste!.delete(rappel);
    if (liste!.size === 0) abonnes.delete(id);
  };
}

/**
 * Fusionner un correctif dans le résultat d'un nœud.
 *
 * UN CHAMP À `undefined` EST RETIRÉ, et non posé à `undefined` : c'est ainsi que le moteur dit qu'un
 * composant ne rend plus rien à montrer. La distinction compte pour la lecture, qui demande si la
 * clé est là.
 *
 * RIEN N'EST NOTIFIÉ SI RIEN NE CHANGE. Le moteur repose volontiers le même correctif — un nœud en
 * cache rend deux fois le même tampon — et chacun aurait provoqué un rendu inutile.
 */
export function poserResultat(id: string, correctif: Record<string, unknown>): void {
  const avant = resultatDe(id);
  let change = false;
  const apres: Record<string, unknown> = { ...avant };
  for (const [cle, val] of Object.entries(correctif)) {
    if (val === undefined) {
      if (cle in apres) { delete apres[cle]; change = true; }
      continue;
    }
    if (!(cle in apres) || apres[cle] !== val) { apres[cle] = val; change = true; }
  }
  if (!change) return;
  resultats.set(id, Object.freeze(apres));
  prevenir(id);
}

/**
 * Effacer le résultat de nœuds, en gardant au besoin quelques champs.
 *
 * `garder` EXISTE POUR LE RÉGLAGE D'UN COMPOSANT QUI S'ÉCOUTE. Changer un réglage périme ce que le
 * run a PRODUIT, mais non ce qu'il a DÉSIGNÉ de ses entrées : c'est ce qui permet d'entendre un
 * montage pendant qu'on le règle. Sans liste, tout part.
 */
export function effacerResultats(ids?: Iterable<string>, garder?: ReadonlySet<string>): void {
  const cibles = ids ? [...ids] : [...resultats.keys()];
  for (const id of cibles) {
    const avant = resultats.get(id);
    if (!avant) continue;
    if (!garder || garder.size === 0) {
      resultats.delete(id);
      prevenir(id);
      continue;
    }
    const restant: Record<string, unknown> = {};
    for (const [cle, val] of Object.entries(avant)) if (garder.has(cle)) restant[cle] = val;
    if (Object.keys(restant).length === Object.keys(avant).length) continue;
    if (Object.keys(restant).length === 0) resultats.delete(id);
    else resultats.set(id, Object.freeze(restant));
    prevenir(id);
  }
}

/** Les identifiants qui portent un résultat — pour les tests et le débogage. */
export function resultatsPoses(): string[] {
  return [...resultats.keys()];
}

// ── Le côté React ────────────────────────────────────────────────────────────────

/**
 * Le résultat d'un nœud, abonné à ce seul nœud.
 *
 * `useSyncExternalStore` est fait pour exactement cela : un magasin hors de React, lu par un
 * composant qui ne se redessine que lorsque SA valeur change. Le rappel d'abonnement est stabilisé
 * par `useCallback`, sans quoi React se réabonnerait à chaque rendu.
 */
export function useResultat(id: string): ResultatNoeud {
  const abonner = useCallback((rappel: () => void) => surResultat(id, rappel), [id]);
  const lire = useCallback(() => resultatDe(id), [id]);
  return useSyncExternalStore(abonner, lire, lire);
}
