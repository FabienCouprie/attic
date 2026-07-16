// audio/graphe-embarque.ts — Sérialisation du graphe pour embarquement dans
// les métadonnées des fichiers audio exportés (WAV chunk INFO/IGRF).
// Permet de récupérer le graphe qui a produit un fichier audio en l'important
// dans Attic.

export interface GrapheSerialise {
  nodes: { id: string; ficheId: string; parametres: Record<string, number | string>; position: { x: number; y: number } }[];
  edges: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }[];
  metas?: unknown;
  version: string;
  date: string;
}

// Référence globale au graphe courant (mise à jour par l'App via setGrapheRef).
let grapheRef: { nodes: any[]; edges: any[] } | null = null;

export function setGrapheRef(ref: { nodes: any[]; edges: any[] } | null): void {
  grapheRef = ref;
}

export function serialiserGraphe(): string | null {
  if (!grapheRef || !grapheRef.nodes) return null;
  const serialise: GrapheSerialise = {
    version: "1.0",
    date: new Date().toISOString(),
    nodes: grapheRef.nodes.map((n) => ({
      id: n.id,
      ficheId: n.data?.ficheId ?? "",
      parametres: { ...n.data?.parametres },
      position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
    })),
    edges: grapheRef.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    })),
  };
  return JSON.stringify(serialise);
}

export function deserialiserGraphe(json: string): GrapheSerialise | null {
  try {
    const obj = JSON.parse(json);
    if (obj.nodes && obj.edges) return obj as GrapheSerialise;
    return null;
  } catch {
    return null;
  }
}
