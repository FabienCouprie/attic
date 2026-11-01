// ui/hooks/useDicteeCanevas.ts — Ce qu'une dictée fait au canevas.
//
// Sorti d'`App.tsx` le 2026-11-01, à l'identique : mêmes outils prêtés à l'applicateur, même
// versement, même boucle d'annulation. Le calcul est dans `dictee/appliquer-commandes.ts`, et il
// est pur ; ce qui reste ici est ce qu'il ne peut pas faire : verser dans React, défaire, et
// commander la séance.
//
// LES GESTES S'APPLIQUENT SUR UNE COPIE DE TRAVAIL, et les deux poseurs ne sont appelés qu'une
// fois à la fin. `noeudsRef` ne se remplit qu'au rendu suivant : poser trois composants en
// enchaînant les appels leur donnerait le même identifiant et la même place, et chacun
// s'enchaînerait sur le même courant.
//
// LES DÉCISIONS, ELLES, SONT DANS `ui/dictee/pose-dictee.ts` : sur quoi on enchaîne, où l'on pose,
// et quel nœud un nom désigne. Elles se trompent sans rien lever, et sont éprouvées là-bas.
import { useCallback, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Edge } from "@xyflow/react";

import { estSubstitution, fermeraitUnCycle, type AreteG } from "../../core";
import { traduire } from "../../i18n";
import { appliquerCommandes, type LotDicte, type OutilsDeDictee } from "../dictee/appliquer-commandes";
import type { Commande } from "../dictee/commandes-dictee";
import type { AreteDeDictee, NoeudPose } from "../dictee/pose-dictee";
import { useDictee } from "../dictee/useDictee";
import { lienDicte, trouverDef } from "../ports-canevas";

export interface OptionsDicteeCanevas {
  noeudsRef: MutableRefObject<any[]>;
  aretesRef: MutableRefObject<Edge[]>;
  /** Le nœud sélectionné, sur lequel une dictée enchaîne. */
  sel: { id: string } | null;
  fabriquerNoeud: (ficheId: string, position: { x: number; y: number }, noeuds: readonly { id: string }[]) => unknown;
  pushHistorique: () => void;
  setNodes: Dispatch<SetStateAction<any[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  undo: () => void;
  lancer: () => Promise<unknown>;
  arreter: () => void;
  rfInstance: any;
  lang: string;
}

export function useDicteeCanevas({
  noeudsRef, aretesRef, sel, fabriquerNoeud, pushHistorique, setNodes, setEdges, undo, lancer, arreter, rfInstance, lang,
}: OptionsDicteeCanevas) {
  const dernierDicteRef = useRef<string | null>(null);

  /** Ce que l'applicateur ne sait pas faire seul, et que le canevas lui prête. */
  const outilsDeDictee = useCallback((): OutilsDeDictee<NoeudPose> => ({
    nomDeFiche: (ficheId) => trouverDef(ficheId)?.nom ?? ficheId,
    existe: (ficheId) => !!trouverDef(ficheId),
    fabriquerNoeud: (ficheId, position, noeuds) =>
      fabriquerNoeud(ficheId, position, noeuds) as unknown as NoeudPose | null,
    lienDicte: (noeuds, source, target) => lienDicte(noeuds as unknown as any[], source, target),
    fermeraitUnCycle: (de, vers, aretes) =>
      fermeraitUnCycle(de, vers, (aretes as unknown as AreteG[]).filter((a) => !estSubstitution(a))),
    traduire,
  }), [trouverDef, fabriquerNoeud]);

  /**
   * Verse un lot dicté sur le canevas, et c'est le seul geste de React de tout ce chemin.
   *
   * LES ARÊTES DÉTOURNÉES NE SONT NI AJOUTÉES NI RETIRÉES : elles changent de bout. C'est ce qui
   * fait qu'une insertion ALLONGE une chaîne au lieu d'en dériver une branche.
   */
  const verserLotDicte = useCallback((lot: LotDicte<NoeudPose>) => {
    if (!lot.nouveaux.length && !lot.aretes.length && !lot.aDetourner.length) return;
    pushHistorique();
    setNodes((nds) => [...nds, ...(lot.nouveaux as unknown as (typeof nds))]);
    setEdges((eds) => [
      ...eds.map((e) => {
        const det = lot.aDetourner.find((x) => x.id === e.id);
        if (!det) return e;
        return det.ou === "apres" ? { ...e, source: det.vers } : { ...e, target: det.vers };
      }),
      ...(lot.aretes as unknown as Edge[]),
    ]);
  }, [pushHistorique, setNodes, setEdges]);

  const appliquerDictee = useCallback((commandes: Commande[]) => {
    // LA BOUCLE EXISTE A CAUSE D'« ANNULER », seule commande qui ne se calcule pas d'avance :
    // elle verse ce qui attend, DEFAIT, puis repart de l'etat obtenu, que l'applicateur ne peut
    // pas prevoir puisque l'historique ne lui appartient pas. Il s'arrete donc la en disant ce
    // qu'il reste a faire, et l'on redemande.
    const outils = outilsDeDictee();
    let reste: Commande[] = commandes;
    const seance = { lancer: false, arreter: false, recentrer: false };
    let avis: string | undefined;
    for (let garde = 0; reste.length && garde < 64; garde++) {
      const suite = appliquerCommandes(reste, {
        noeuds: noeudsRef.current as unknown as NoeudPose[],
        aretes: aretesRef.current as unknown as AreteDeDictee[],
        selectionId: sel?.id ?? null, dernier: dernierDicteRef.current,
      }, outils);
      verserLotDicte(suite.lot);
      dernierDicteRef.current = suite.lot.dernier;
      avis = suite.lot.avis ?? avis;
      seance.lancer ||= suite.seance.lancer;
      seance.arreter ||= suite.seance.arreter;
      seance.recentrer ||= suite.seance.recentrer;
      reste = suite.reste;
      if (suite.annulerEnsuite) { undo(); dernierDicteRef.current = null; }
    }

    // L'ARRET PASSE DEVANT : si les deux sont dits, c'est le dernier etat voulu qui compte, et
    // relancer apres avoir arrete est ce que la phrase demande dans cet ordre.
    if (seance.arreter) arreter();
    if (seance.lancer) {
      // LE LANCEMENT ATTEND LE RENDU. Les noeuds viennent d'etre poses par un `setNodes`, et le
      // moteur lit le graphe rendu : lancer dans le meme tour executerait celui d'avant.
      setTimeout(() => { void lancer().then(() => rfInstance?.fitView?.({ duration: 200, padding: 0.2 })); }, 80);
    } else if (seance.recentrer) {
      rfInstance?.fitView?.({ duration: 200, padding: 0.2 });
    }
    return avis;
  }, [sel, outilsDeDictee, verserLotDicte, undo, lancer, arreter, rfInstance]);

  return useDictee(lang === "en" ? "en" : "fr", appliquerDictee);
}
