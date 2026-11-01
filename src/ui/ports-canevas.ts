// ui/ports-canevas.ts — Ce qu'une arête du canevas lit sur le registre : la fiche, ses ports, sa couleur.
//
// Sorti d'`App.tsx` le 2026-11-01, sans qu'une ligne de calcul change. Ces quatre fonctions ne
// touchent à aucun état de React : elles lisent le tableau de nœuds qu'on leur passe et la fiche
// que le REGISTRE livre. Elles vivaient en tête du plus gros fichier du dépôt, où rien d'autre
// qu'`App.tsx` ne pouvait les appeler ; la restauration de l'en-cours, qui en a besoin, sort du même
// fichier le même jour.
import { premierLienCompatible, type PortsDictes } from "./dictee/pose-dictee";
import { registreUI } from "./registre-actif";

export const trouverDef = (id: string) => registreUI().trouverDef(id);
export const couleurFlux = (id: string) => registreUI().couleurFlux(id);

/** La couleur d'une arête : celle du type de la sortie dont elle part, `audio` si la fiche se tait. */
export function couleurArete(nodes: any[], source: string, sourceHandle: string): string {
  const node = nodes.find((n) => n.id === source);
  const ficheId = node?.data?.ficheId;
  const def = ficheId ? trouverDef(ficheId) : undefined;
  const idx = parseInt(sourceHandle.split(":")[1] ?? "0", 10);
  const type = def?.sorties[idx]?.type ?? "audio";
  return couleurFlux(type);
}

/**
 * Les ports d'une fiche, lus sur la définition que le REGISTRE livre — celle qu'il augmente.
 *
 * `plugins/sortie-audio.ts` ajoute une sortie « Audio » en dernier à toute fiche qui rend une
 * séquence : lire la fiche telle qu'elle est écrite dans son plugin ferait croire qu'il n'y a
 * qu'un port là où il y en a deux, et ferait choisir le mauvais.
 */
export function portsDeFiche(ficheId: string | undefined): PortsDictes | undefined {
  const def = ficheId ? trouverDef(ficheId) : undefined;
  return def ? { sorties: def.sorties ?? [], entrees: def.entrees ?? [] } : undefined;
}

/** Les ports d'un nœud du canevas, par la fiche qu'il porte. */
export function portsDe(nodes: any[], id: string): PortsDictes | undefined {
  return portsDeFiche(nodes.find((n) => n.id === id)?.data?.ficheId);
}

/**
 * L'arête que la dictée peut vraiment poser entre deux nœuds, ou `null` si aucun port ne s'accorde.
 *
 * ELLE REMPLACE QUATRE `out:0 → in:0` ÉCRITS EN DUR. La souris passe par `isValidConnection` et
 * refuse une liaison dont les types ne vont pas ensemble ; la voix ne passait par rien, et était
 * donc le seul chemin par lequel une arête impossible entrait dans un graphe.
 */
export function lienDicte(nodes: any[], source: string, target: string):
{ sourceHandle: string; targetHandle: string; type: "arete-personnalisee"; style: { stroke: string; strokeWidth: number } } | null {
  const paire = premierLienCompatible(
    portsDe(nodes, source), portsDe(nodes, target),
    (s, e) => registreUI().fluxCompatibles(s.type, e.type, s.sousType, e.sousType),
  );
  if (!paire) return null;
  const sourceHandle = `out:${paire.sortie}`;
  return {
    sourceHandle, targetHandle: `in:${paire.entree}`, type: "arete-personnalisee",
    style: { stroke: couleurArete(nodes, source, sourceHandle), strokeWidth: 2.5 },
  };
}
