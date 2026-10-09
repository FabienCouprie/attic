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
  /** Les arêtes à poser, AVEC LE RANG DES PORTS : `out:0 → in:0` n'est pas toujours celui qui va. */
  aretes: { id: string; source: string; target: string; sortie: number; entree: number }[];
  /** Les arêtes écartées parce qu'elles refermaient un cycle, pour qu'on puisse le dire. */
  cycles: { source: number; target: number }[];
  /** Celles écartées parce qu'aucun couple de ports ne s'accorde, pour la même raison. */
  incompatibles: { source: number; target: number }[];
}

/**
 * Le couple de ports qui relie deux fiches, ou `null` si aucun ne va.
 *
 * INJECTÉE, et non calculée ici : ce module ne connaît pas le domaine, et `frontiere-domaine.test.ts`
 * compte les fichiers du shell qui s'y couplent. L'appelant la bâtit sur le registre.
 */
export type LienEntreFiches = (ficheIdSource: string, ficheIdCible: string)
=> { sortie: number; entree: number } | null;

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
 *
 * ET LE MODÈLE PEUT AUSSI DEMANDER UN LIEN QUE LES PORTS REFUSENT, ce qui est le même genre de
 * demande impossible qu'une boucle. `out:0 → in:0` était écrit en dur par l'appelant : une sortie
 * « Cercle » arrivait donc dans une entrée audio, l'arête s'affichait en rouge, et rien ne
 * l'exécutait. Le port se cherche désormais comme le cycle se cherchait, et l'arête qui n'a aucun
 * couple possible est écartée ET NOMMÉE — le reste du graphe restant utilisable, comme pour les
 * cycles. Relevé par Fabien sur la dictée, qui portait le même défaut.
 */
export function planDeGrapheEngendre(
  spec: SpecGrapheEngendre, existants: readonly { id: string }[], marque: string,
  lien: LienEntreFiches,
): PlanGrapheEngendre {
  const ids: string[] = [];
  for (let i = 0; i < spec.nodes.length; i++) {
    ids.push(idUnique([...existants, ...ids.map((id) => ({ id }))]));
  }
  const aretes: PlanGrapheEngendre["aretes"] = [];
  const cycles: PlanGrapheEngendre["cycles"] = [];
  const incompatibles: PlanGrapheEngendre["incompatibles"] = [];
  spec.edges.forEach((e, i) => {
    const source = ids[e.source];
    const target = ids[e.target];
    if (!source || !target) return;
    if (fermeraitUnCycle(source, target, aretes as unknown as AreteG[])) {
      cycles.push({ source: e.source, target: e.target });
      return;
    }
    const ports = lien(spec.nodes[e.source].ficheId, spec.nodes[e.target].ficheId);
    if (!ports) {
      incompatibles.push({ source: e.source, target: e.target });
      return;
    }
    aretes.push({ id: `e-prompt-${marque}-${i}`, source, target, ...ports });
  });
  return { ids, aretes, cycles, incompatibles };
}
