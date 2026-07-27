// ui/validerGraphe.ts — Sanitise un graphe restauré/importé pour éviter les
// arêtes cassées (source/cible manquants, handle inexistant après une évolution
// des fiches). React Flow lève l'erreur #008 quand une arête pointe vers un
// handle qui n'est pas rendu.

import type { Edge } from "@xyflow/react";
import { estFrontiere } from "../core";
import { registre } from "../audio/adaptateur";

const trouverDef = (ficheId: string) => registre.trouverDef(ficheId);

function indexHandle(handle: string | null | undefined): number | null {
  if (!handle) return null;
  const m = handle.match(/^[^:]+:(\d+)$/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

export function filtrerAretesInvalides(nodes: any[], edges: Edge[]): Edge[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const valides: Edge[] = [];
  for (const e of edges) {
    const source = nodeMap.get(e.source);
    const target = nodeMap.get(e.target);
    if (!source || !target) {
      console.warn(`[attic] Arête ignorée (nœud manquant) : ${e.id}`);
      continue;
    }
    if (!e.sourceHandle || !e.targetHandle) {
      console.warn(`[attic] Arête ignorée (handle absent) : ${e.id}`);
      continue;
    }
    const sourceFrontiere = estFrontiere(source.data?.ficheId as string);
    const targetFrontiere = estFrontiere(target.data?.ficheId as string);

    if (!sourceFrontiere) {
      const def = trouverDef(source.data?.ficheId as string);
      const idx = indexHandle(e.sourceHandle);
      if (!def || idx === null || idx < 0 || idx >= def.sorties.length) {
        console.warn(`[attic] Arête ignorée (handle source invalide) : ${e.id} → ${e.sourceHandle}`);
        continue;
      }
    }

    if (!targetFrontiere) {
      const def = trouverDef(target.data?.ficheId as string);
      const idx = indexHandle(e.targetHandle);
      if (!def || idx === null || idx < 0 || idx >= def.entrees.length) {
        console.warn(`[attic] Arête ignorée (handle cible invalide) : ${e.id} → ${e.targetHandle}`);
        continue;
      }
    }

    valides.push(e);
  }
  return valides;
}
