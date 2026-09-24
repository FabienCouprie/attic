// ui/hooks/useRepliBulles.ts — Un seul endroit qui applique le repli, pour qu'aucun geste ne l'oublie.
//
// POURQUOI UN EFFET ET NON UN APPEL PAR GESTE. Ce qui change l'état d'une bulle est nombreux : replier,
// développer, ouvrir, supprimer un membre, coller, importer, reprendre une session, annuler. Appeler la
// normalisation depuis chacun de ces endroits, c'est autant d'occasions d'en oublier un — et un oubli
// laisse un nœud caché qui ne devrait plus l'être, ou une arête qui pend dans le vide. L'effet observe
// le graphe et corrige ce qui ne correspond pas, quel que soit le geste qui l'a produit.
//
// IL NE PEUT PAS BOUCLER, parce qu'il compare avant d'écrire. `appliquerRepli` est idempotente et rend
// toujours de nouveaux objets : écrire sans comparer relancerait l'effet indéfiniment. On ne compare
// donc que ce que la normalisation décide — les nœuds cachés, et les arêtes de substitution.

import { useEffect } from "react";
import type { Edge, Node } from "@xyflow/react";

import { appliquerRepli, estBulle, estSubstitution, type AreteG, type DefPorts, type NoeudG } from "../../core";

/** La signature de ce que la normalisation décide, et rien d'autre. */
function signature(noeuds: readonly NoeudG[], aretes: readonly AreteG[]): string {
  const n = noeuds.map((x) => `${x.id}:${(x as { hidden?: boolean }).hidden === true ? 1 : 0}`).join(",");
  const a = aretes.map((x) => `${x.id}:${(x as { hidden?: boolean }).hidden === true ? 1 : 0}`).sort().join(",");
  return `${n}|${a}`;
}

export function useRepliBulles(o: {
  nodes: any[];
  edges: Edge[];
  setNodes: (f: (n: any[]) => any[]) => void;
  setEdges: (f: (e: Edge[]) => Edge[]) => void;
  getDef: (ficheId: string) => DefPorts | undefined;
}): void {
  const { nodes, edges, setNodes, setEdges, getDef } = o;
  useEffect(() => {
    // Rien à faire tant qu'aucune bulle n'existe : le cas de très loin le plus fréquent.
    const aDesBulles = nodes.some((n) => estBulle((n.data as { ficheId?: string }).ficheId));
    const aDesSubstituts = edges.some((e) => estSubstitution(e as unknown as AreteG));
    if (!aDesBulles && !aDesSubstituts) return;

    const r = appliquerRepli(nodes as unknown as NoeudG[], edges as unknown as AreteG[], getDef);
    if (signature(r.noeuds, r.aretes) === signature(nodes as unknown as NoeudG[], edges as unknown as AreteG[])) {
      return;
    }
    setNodes(() => r.noeuds as unknown as Node[]);
    setEdges(() => r.aretes as unknown as Edge[]);
  }, [nodes, edges, setNodes, setEdges, getDef]);
}
