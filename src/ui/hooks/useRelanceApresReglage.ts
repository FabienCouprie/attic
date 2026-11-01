// ui/hooks/useRelanceApresReglage.ts — Changer un réglage, et il n'y a qu'une façon de le faire.
//
// Sorti d'`App.tsx` le 2026-11-01, à l'identique : mêmes trois gestes, même minuteur, même délai.
// Le garde de `cycle-de-vie-noeuds.test.ts`, qui exige un seul appelant pour « changer un réglage »,
// lit désormais ce fichier.
//
// UN RÉGLAGE PÉRIME LE RÉSULTAT, et le moteur l'efface : on relance quand on veut. C'est ce qu'il
// faut pour un calcul qui coûte des secondes. Mais un nœud dont le calcul propre est négligeable et
// dont l'amont est en cache se relance pour presque rien, tandis que son résultat effacé coûte très
// cher : la ligne de temps du Montage se règle EN ÉCOUTANT, et déplacer une piste faisait
// disparaître le son qu'on écoutait. La fiche le déclare par `relanceAutomatique`.
//
// LA TEMPORISATION N'EST PAS UN CONFORT. Le champ numérique de l'inspecteur écrit à CHAQUE FRAPPE :
// taper « 12,5 » appellerait trois fois, et un curseur qu'on traîne, cent fois. Le minuteur ne garde
// que la dernière valeur d'une rafale.
import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { reglagesApresChangement } from "../../core/reglages-lies";
import { trouverDef } from "../ports-canevas";

/** Le temps qu'on laisse passer après le dernier réglage avant de relancer un nœud qui le demande.
 *  Assez long pour qu'une valeur tapée chiffre par chiffre ne lance qu'une fois, assez court pour
 *  qu'on entende le résultat du geste qu'on vient de faire. */
const DELAI_RELANCE_MS = 350;

type Noeud = { id: string; data: { ficheId: string; parametres: Record<string, number | string>; [k: string]: unknown } };

export interface OptionsRelanceApresReglage {
  noeudsRef: MutableRefObject<readonly Noeud[]>;
  lancerRef: MutableRefObject<any>;
  cacheExec: MutableRefObject<Map<string, any>>;
  reinitialiserPourReglage: (nid: string) => void;
  setNodes: Dispatch<SetStateAction<any[]>>;
}

export function useRelanceApresReglage({
  noeudsRef, lancerRef, cacheExec, reinitialiserPourReglage, setNodes,
}: OptionsRelanceApresReglage) {
  const minuteursRelance = useRef(new Map<string, number>());
  const relancerApresReglage = useCallback((nid: string) => {
    const fiche = trouverDef(String(noeudsRef.current.find((n) => n.id === nid)?.data.ficheId ?? ""));
    if (!(fiche as { relanceAutomatique?: boolean } | undefined)?.relanceAutomatique) return;
    const enCours = minuteursRelance.current.get(nid);
    if (enCours !== undefined) window.clearTimeout(enCours);
    minuteursRelance.current.set(nid, window.setTimeout(() => {
      minuteursRelance.current.delete(nid);
      // ET LA RELANCE VA VERS L'AVAL, à la différence d'un run ciblé que la personne demande.
      //
      // Relevé par Fabien sur le gain du montage : le nœud se recalculait bien, mais le moteur
      // venait d'EFFACER les résultats de son aval, et un run ciblé n'embrasse que l'amont. Tout ce
      // qui suivait restait donc à « En attente », et depuis l'aval — où l'on écoute et où l'on
      // exporte — le réglage paraissait mort. Voir `PerimetreCible`.
      lancerRef.current?.(nid, { versLAval: true });
    }, DELAI_RELANCE_MS));
  }, [noeudsRef, lancerRef]);

  /**
   * CE QU'IL FAUT FAIRE QUAND CE QUE LE NŒUD DOIT CALCULER A CHANGÉ. Une seule écriture, et deux
   * appelants : un réglage changé, et un découpage posé sur une ligne de temps.
   *
   * LES TROIS GESTES SONT INDISSOCIABLES, et c'est leur séparation qui a fait tous les défauts de
   * cette famille. Purger l'entrée de cache, sans quoi le moteur resservirait le résultat d'avant.
   * Périmer l'aval EN GARDANT ce que le nœud a désigné de ses entrées, sans quoi le graphe vivant du
   * Montage n'a plus rien à jouer. Et relancer vers l'aval, sans quoi le changement n'est entendu
   * qu'au prochain run déclenché par autre chose — c'est-à-dire jamais, du point de vue de qui
   * vient de tirer une barre.
   *
   * LE CONTRAT DE CYCLE DE VIE L'EXIGE, et il m'a reprise : un premier jet recopiait ces trois lignes
   * dans le geste du découpage, et `cycle-de-vie-noeuds.test.ts` est tombé en disant « un seul
   * appelant pour changer un réglage ». Deux implémentations d'une transition finissent toujours par
   * se séparer — c'est écrit juste au-dessus, et je venais de le refaire.
   */
  const perimerEtRelancer = useCallback((nid: string) => {
    cacheExec.current.delete(nid);
    reinitialiserPourReglage(nid);
    relancerApresReglage(nid);
  }, [cacheExec, reinitialiserPourReglage, relancerApresReglage]);

  /**
   * CHANGER UN RÉGLAGE, ET IL N'Y A QU'UNE FAÇON DE LE FAIRE.
   *
   * POURQUOI CETTE FONCTION EXISTE, relevé par Fabien : « toucher le gain du montage pendant la
   * lecture oblige DE NOUVEAU à redémarrer le nœud ». Le même geste avait DEUX points d'appel, l'un
   * sur le nœud et l'autre dans l'inspecteur, et ils avaient divergé : le premier gardait ce que le
   * nœud avait désigné de ses entrées et relançait, le second faisait une remise à zéro complète et
   * ne relançait pas. Régler depuis le nœud marchait donc, et régler depuis l'inspecteur arrêtait
   * l'écoute. Un commentaire disait déjà « il y en a deux dans ce fichier » : le dire ne suffit pas,
   * deux copies d'une règle finissent toujours par se séparer.
   *
   * Rend les réglages obtenus, dont l'inspecteur a besoin pour se mettre à jour lui-même.
   */
  const changerReglage = useCallback((nid: string, nom: string, val: number | string) => {
    const noeud = noeudsRef.current.find((n) => n.id === nid);
    if (!noeud) return null;
    const suite = reglagesApresChangement(String(noeud.data.ficheId), noeud.data.parametres, nom, val);
    setNodes((nds) => nds.map((n) => (n.id === nid ? { ...n, data: { ...n.data, parametres: suite } } : n)));
    perimerEtRelancer(nid);
    return suite;
  }, [noeudsRef, setNodes, perimerEtRelancer]);

  // Les minuteurs en vol meurent avec la fenêtre : sans cela, une relance pourrait partir après le
  // démontage, sur un graphe qui n'existe plus.
  useEffect(() => () => {
    for (const id of minuteursRelance.current.values()) window.clearTimeout(id);
    minuteursRelance.current.clear();
  }, []);

  return { perimerEtRelancer, changerReglage };
}
