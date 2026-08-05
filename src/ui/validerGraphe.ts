// ui/validerGraphe.ts — Sanitise un graphe restauré/importé pour éviter les
// arêtes cassées (source/cible manquants, handle inexistant après une évolution
// des fiches). React Flow lève l'erreur #008 quand une arête pointe vers un
// handle qui n'est pas rendu.

import type { Connection, Edge } from "@xyflow/react";
import { estFrontiere } from "../core";
import { registre } from "../audio/adaptateur";

const trouverDef = (ficheId: string) => registre.trouverDef(ficheId);

export function indexHandle(handle: string | null | undefined): number | null {
  if (!handle) return null;
  const m = handle.match(/^[^:]+:(\d+)$/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

export function validerArete(source: any, target: any, edge: Edge | Connection): boolean {
  if (!source || !target || !edge.sourceHandle || !edge.targetHandle) return false;
  const sourceFicheId = source.data?.ficheId;
  const targetFicheId = target.data?.ficheId;
  if (sourceFicheId === "comment" || targetFicheId === "comment") return false;
  if (estFrontiere(sourceFicheId) || estFrontiere(targetFicheId)) return true;
  const defS = trouverDef(sourceFicheId);
  const defT = trouverDef(targetFicheId);
  if (!defS || !defT) return false;
  const si = indexHandle(edge.sourceHandle);
  const ti = indexHandle(edge.targetHandle);
  if (si === null || ti === null) return false;
  const typeS = defS.sorties[si]?.type;
  const typeT = defT.entrees[ti]?.type;
  if (!typeS || !typeT) return false;
  return registre.fluxCompatibles(typeS, typeT);
}

export function filtrerAretesInvalides(nodes: any[], edges: Edge[]): Edge[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const valides: Edge[] = [];
  const rejetees: string[] = [];
  for (const e of edges) {
    const source = nodeMap.get(e.source);
    const target = nodeMap.get(e.target);
    if (!source || !target) {
      rejetees.push(e.id);
      continue;
    }
    if (!e.sourceHandle || !e.targetHandle) {
      rejetees.push(e.id);
      continue;
    }
    const sourceFrontiere = estFrontiere(source.data?.ficheId as string);
    const targetFrontiere = estFrontiere(target.data?.ficheId as string);

    if (!sourceFrontiere) {
      const def = trouverDef(source.data?.ficheId as string);
      const idx = indexHandle(e.sourceHandle);
      if (!def || idx === null || idx < 0 || idx >= def.sorties.length) {
        rejetees.push(e.id);
        continue;
      }
    }

    if (!targetFrontiere) {
      const def = trouverDef(target.data?.ficheId as string);
      const idx = indexHandle(e.targetHandle);
      if (!def || idx === null || idx < 0 || idx >= def.entrees.length) {
        rejetees.push(e.id);
        continue;
      }
    }

    valides.push(e);
  }
  if (rejetees.length) {
    console.warn(`[attic] ${rejetees.length} arête(s) cassée(s) ignorée(s) à la restauration : ${rejetees.join(", ")}`);
  }
  return valides;
}
