// ui/hooks/useEnCours.ts — Le graphe de la séance précédente, remis sur le canevas au démarrage.
//
// Sorti d'`App.tsx` le 2026-11-01 : même effet, mêmes dépendances, même garde contre un second
// passage, et QUATRE CHAMPS DE PLUS, les noms de fichier, que la sortie a révélés manquants (voir
// le commentaire sur place). C'est la pièce d'`App.tsx` que le plus de cas d'application exercent,
// chacun posant son graphe sous `attic-encours` avant d'ouvrir la page ; c'est pourquoi elle sort
// la première.
//
// L'EFFET NE DÉPEND QUE DE LA VERSION DES PLUGINS, et c'est voulu : il attend que le catalogue soit
// là pour retrouver chaque fiche. Les gestes des nœuds n'y passent plus : ils viennent du contexte
// de `ui/gestes-noeud.ts`, et un nœud restauré n'en porte aucun.
import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Edge } from "@xyflow/react";

import { servicesDomaine } from "../../core/services-domaine";
import { demarrage } from "../fenetre";
import { couleurArete } from "../ports-canevas";
import { noeudsRelus } from "../en-cours-a-relire";
import { rechargerFichiersPersistes } from "../rechargerFichiers";
import { filtrerAretesInvalides } from "../validerGraphe";

export interface OptionsEnCours {
  /** Monte quand le catalogue change ; l'en-cours attend qu'il soit là. */
  pluginsVersion: number;
  rfInstance: any;
  setNodes: Dispatch<SetStateAction<any[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
}

export function useEnCours({ pluginsVersion, rfInstance, setNodes, setEdges }: OptionsEnCours) {
  const enCoursCharge = useRef(false);
  useEffect(() => {
    if (enCoursCharge.current) return;
    enCoursCharge.current = true;
    (async () => {
      try {
        const brut = demarrage().encours;
        if (!brut) return;
        const data = JSON.parse(brut);
        if (!data.nodes || !Array.isArray(data.nodes)) return;
        // Les nœuds remis en forme par `ui/en-cours-a-relire.ts`, qu'un cas éprouve sans ce crochet.
        const nodesRestaures = noeudsRelus(data.nodes);
        const edgesRestaures = (data.edges ?? []).map((e: any) => ({
          ...e, type: "arete-personnalisee",
          style: { stroke: couleurArete(nodesRestaures, e.source, e.sourceHandle), strokeWidth: 2.5 },
        }));
        const edgesValides = filtrerAretesInvalides(nodesRestaures, edgesRestaures);
        // Les nœuds rechargés sont rendus, et non écrits en place : voir `ui/rechargerFichiers.ts`.
        setNodes(await rechargerFichiersPersistes(nodesRestaures));
        setEdges(edgesValides);
        // Les réglages de domaine de l'en-cours, comme le cadrage : une séance reprise rend ce
        // qu'elle rendait. Côté audio, sa fréquence de travail ; un en-cours sans elle vaut 44 100.
        servicesDomaine().appliquerReglagesDeProjet(data);
        if (data.viewport && rfInstance) queueMicrotask(() => rfInstance.setViewport(data.viewport));
      } catch (e) {
        console.warn("[attic] Restauration de l'en-cours échouée", e);
      }
    })();
  }, [pluginsVersion]); // après chargement des plugins
}
