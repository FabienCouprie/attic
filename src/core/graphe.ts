// core/graphe.ts — Logique de graphe PURE utilisée par le moteur d'exécution
// (boucle `lancer` d'App.tsx). Extraite ici pour être testable indépendamment
// de React : c'est le FILET DE SÉCURITÉ qui permettra de décomposer App.tsx en
// hooks sans régression (les fonctions ci-dessous sont figées par des tests).
//
// Domaine-neutre : ces fonctions ne connaissent ni l'audio ni React ; elles
// opèrent sur des ids de nœuds, des arêtes et une table de résultats opaque.
import type { AreteG } from "./meta";

// Tri topologique (algorithme de Kahn) d'un DAG. Renvoie les ids de nœuds dans
// un ordre d'exécution valide (une source avant ses cibles). Réplique exacte de
// la logique historiquement inline dans `lancer`.
export function ordreTopologique(ids: string[], aretes: AreteG[]): string[] {
  const indegree = new Map<string, number>();
  for (const id of ids) indegree.set(id, 0);
  for (const a of aretes) indegree.set(a.target, (indegree.get(a.target) ?? 0) + 1);
  const file: string[] = [];
  for (const id of ids) if (indegree.get(id) === 0) file.push(id);
  const ordonnees: string[] = [];
  while (file.length > 0) {
    const id = file.shift()!;
    ordonnees.push(id);
    for (const a of aretes) {
      if (a.source === id) {
        const d = (indegree.get(a.target) ?? 1) - 1;
        indegree.set(a.target, d);
        if (d === 0) file.push(a.target);
      }
    }
  }
  return ordonnees;
}

// Ensemble des ancêtres (amont transitif) d'un nœud, le nœud cible INCLUS.
// Sert au mode « priorité » : n'exécuter que ce dont dépend un nœud donné.
export function ancetres(cible: string, aretes: AreteG[]): Set<string> {
  const set = new Set<string>();
  const collecter = (id: string) => {
    if (set.has(id)) return;
    set.add(id);
    for (const a of aretes) if (a.target === id) collecter(a.source);
  };
  collecter(cible);
  return set;
}

// Empreinte des sources entrantes d'un nœud (clé de cache « entrées »).
// Deux graphes identiques en amont d'un nœud donnent la même empreinte.
export function empreinteEntrees(nodeId: string, aretes: AreteG[]): string {
  return aretes.filter((a) => a.target === nodeId).map((a) => a.source).sort().join(",");
}

// Empreinte des paramètres d'un nœud (clé de cache « paramètres »).
// NB : inclut quelques champs de données audio (sequenceNotes, nom de fichier) —
// c'est la clé actuelle ; à rendre injectable lors de la généralisation (§1 roadmap).
export function empreinteParametres(data: Record<string, unknown>): string {
  const f = data.audioFichier as { name?: string } | undefined;
  return JSON.stringify({ p: data.parametres ?? {}, s: data.sequenceNotes ?? null, f: f ? f.name : null });
}

// Résout la valeur branchée sur l'entrée `index` d'un nœud, depuis les arêtes et
// la table des résultats déjà calculés. Renvoie null si l'entrée n'est pas connectée.
export function resoudreEntree<T = unknown>(
  nodeId: string, index: number, aretes: AreteG[], resultats: Map<string, T[]>,
): T | null {
  const arc = aretes.find((a) => a.target === nodeId && parseInt((a.targetHandle ?? "in:-1").split(":")[1]) === index);
  if (!arc) return null;
  const si = parseInt((arc.sourceHandle ?? "out:0").split(":")[1]);
  return resultats.get(arc.source)?.[si] ?? null;
}

// Toutes les valeurs branchées en entrée d'un nœud (dans l'ordre des arêtes),
// null pour les sources non encore calculées. Base des entrées variadiques.
export function valeursEntrantes<T = unknown>(
  nodeId: string, aretes: AreteG[], resultats: Map<string, T[]>,
): (T | null)[] {
  return aretes.filter((a) => a.target === nodeId).map((a) => {
    const si = parseInt((a.sourceHandle ?? "out:0").split(":")[1]);
    return resultats.get(a.source)?.[si] ?? null;
  });
}
