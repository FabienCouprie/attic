// ui/graphe-engendre.ts — Ce qu'un composant qui ENGENDRE un graphe demande au canevas de poser.
//
// POURQUOI CE MODULE EXISTE. Le calcul tenait dans la fonction de rappel d'`App.tsx`, et il y
// tenait DANS L'UPDATER de `setNodes` : les arêtes y étaient créées par un `setEdges` appelé au
// milieu du calcul du nouvel état. Un updater de React doit être pur, et celui-ci ne l'était pas ;
// sous `StrictMode`, qui l'appelle deux fois pour débusquer exactement cela, les trois arêtes
// engendrées étaient posées DEUX FOIS avec les mêmes identifiants. React s'en plaignait par
// « Encountered two children with the same key », et le graphe enregistré portait les doublons.
//
// Les nœuds, eux, ne doublaient pas : l'updater RENDAIT le tableau des nœuds, dont React ne garde
// que le dernier. C'est ce qui rendait le défaut difficile à voir, la moitié visible du résultat
// étant juste.
//
// LE PLAN EST DONC CALCULÉ ICI, SANS REACT, et la fonction de rappel ne fait plus qu'en construire
// les objets et appeler les deux poseurs, chacun avec un updater qui ne fait qu'ajouter.
import { fermeraitUnCycle } from "../core/graphe";
import type { AreteG } from "../core/meta";
import { idUnique } from "./ids";

export interface SpecGrapheEngendre {
  nodes: { ficheId: string; label: string }[];
  edges: { source: number; target: number }[];
}

export interface PlanGrapheEngendre {
  /** L'identifiant attribué à chaque nœud de la spécification, dans son ordre. */
  ids: string[];
  aretes: { id: string; source: string; target: string }[];
  /** Les arêtes écartées parce qu'elles refermaient un cycle, pour qu'on puisse le dire. */
  cycles: { source: number; target: number }[];
}

/**
 * Les identifiants à attribuer et les arêtes à poser, sans rien de React.
 *
 * UN GRAPHE ÉCRIT PAR UN MODÈLE DE LANGUE PEUT BOUCLER, et rien dans la demande ne l'en empêche.
 * Les arêtes sont donc éprouvées UNE À UNE contre celles déjà acceptées : celle qui refermerait un
 * cycle est écartée et nommée, le reste du graphe restant utilisable. Poser le lot d'un coup aurait
 * rendu muettes toutes les branches prises dans la boucle.
 *
 * `marque` distingue une pose de la suivante. Dérivé du seul identifiant du nœud, l'identifiant
 * d'arête entrait en collision avec celui d'une pose PRÉCÉDENTE dès que le même composant
 * engendrait deux fois.
 */
export function planDeGrapheEngendre(
  spec: SpecGrapheEngendre, existants: readonly { id: string }[], marque: string,
): PlanGrapheEngendre {
  const ids: string[] = [];
  for (let i = 0; i < spec.nodes.length; i++) {
    ids.push(idUnique([...existants, ...ids.map((id) => ({ id }))]));
  }
  const aretes: PlanGrapheEngendre["aretes"] = [];
  const cycles: PlanGrapheEngendre["cycles"] = [];
  spec.edges.forEach((e, i) => {
    const source = ids[e.source];
    const target = ids[e.target];
    if (!source || !target) return;
    if (fermeraitUnCycle(source, target, aretes as unknown as AreteG[])) {
      cycles.push({ source: e.source, target: e.target });
      return;
    }
    aretes.push({ id: `e-prompt-${marque}-${i}`, source, target });
  });
  return { ids, aretes, cycles };
}
