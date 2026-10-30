// core/conteneurs.ts — Ce que contient une bulle ou un méta-composant, et ce que son statut en dit.
//
// DEUX CONTENEURS, UNE MÊME QUESTION. Une bulle replie des nœuds sans les renommer ; un méta les
// aplatit sous `monMeta::`. Ni l'un ni l'autre ne calcule : ce sont leurs nœuds qui tournent. Deux
// gestes dépendent donc de ce qu'ils contiennent, et chacun le lisait mal.
//
//   LE ▶ D'UN CONTENEUR. Le périmètre d'un run ciblé est l'amont du nœud visé. Une bulle n'a aucune
//   arête réelle — ses câbles sont des substituts d'affichage, écartés du calcul —, son amont se
//   réduisait donc à elle-même, que le moteur écarte comme décorative : rien ne tournait, et elle
//   restait « En attente ». Relevé par Fabien sur son graphe, mesuré dans l'application :
//   `ordreFiltre=n15(bulle::n15)`. Un méta visait les seuls nœuds qui alimentent ses sorties : sans
//   sortie exposée, il ne lançait rien non plus, mesuré de même.
//
//   SON STATUT FINAL. Il était pris sur le contenu QUE CE RUN AVAIT TOUCHÉ. Un ▶ posé en aval d'une
//   seule branche faisait tourner deux membres sur huit, et la bulle se déclarait « Terminée » :
//   mesuré sur le même graphe, six membres en attente sous une bulle terminée. Un méta faisait
//   pareil, une sortie produite lui suffisant.
//
// LE CONTENU SE LIT SUR LE GRAPHE EXÉCUTÉ, à travers le nœud visible dont chacun tient lieu : un nœud
// ordinaire tient lieu de lui-même, un nœud aplati de son méta, une copie de boucle de son original.
// C'est ce qui fait entrer dans une bulle le méta ou la boucle qu'elle contient.

import { ancetresBulle, estBulle } from "./bulles";
import type { NoeudG } from "./meta";

export interface Conteneurs {
  /** Les bulles et les méta-composants du graphe visible. */
  ids: string[];
  /** Ce que contient ce conteneur parmi ces nœuds exécutés, dans leur ordre ; vide pour tout autre nœud. */
  contenu: (conteneurId: string, executes: readonly string[]) => string[];
}

/**
 * Les conteneurs d'un graphe, et de quoi lire leur contenu.
 *
 * `visible` rend le nœud visible dont un nœud exécuté tient lieu : c'est la table d'expansion de
 * l'aplatissement et du dépliage des boucles.
 */
export function conteneurs(
  noeuds: readonly NoeudG[],
  visible: (id: string) => string,
  estMeta: (ficheId: string) => boolean,
): Conteneurs {
  const ids = noeuds.filter((n) => estBulle(n.data.ficheId) || estMeta(n.data.ficheId)).map((n) => n.id);
  // Les bulles d'un nœud visible, calculées une fois : `ancetresBulle` reparcourt tout le graphe.
  const bulles = new Map<string, string[]>();
  const bullesDe = (v: string): string[] => {
    let b = bulles.get(v);
    if (!b) { b = ancetresBulle(noeuds, v); bulles.set(v, b); }
    return b;
  };
  return {
    ids,
    contenu: (c, executes) => executes.filter((x) => {
      const v = visible(x);
      return (v === c && x !== c) || bullesDe(v).includes(c);
    }),
  };
}

export interface BilanContenu {
  statut: "attente" | "termine" | "erreur";
  /** Combien de nœuds du contenu sont terminés, et sur combien. */
  faits: number;
  total: number;
}

/**
 * Le statut d'un conteneur d'après TOUT son contenu, et non d'après ce qu'un run en a touché.
 *
 * En erreur si l'un a échoué, terminé si tous ont fini, en attente sinon : un conteneur dont une
 * partie seulement a tourné n'a pas fini. Un contenu vide n'est pas terminé pour autant : il n'a
 * rien produit.
 */
export function statutDuContenu(statuts: readonly string[]): BilanContenu {
  const faits = statuts.filter((s) => s === "termine").length;
  const total = statuts.length;
  if (statuts.includes("erreur")) return { statut: "erreur", faits, total };
  return { statut: total > 0 && faits === total ? "termine" : "attente", faits, total };
}

/**
 * Ces nœuds, et les bulles qui les contiennent à toute profondeur.
 *
 * UNE BULLE N'EST PLUS ENTIÈRE QUAND L'UN DE SES MEMBRES REPART EN ATTENTE. Remettre un membre à zéro
 * dit que ce qu'il avait rendu ne vaut plus ; la bulle qui se disait terminée le dirait encore, sur
 * un contenu qui ne l'est plus. Elle repart donc avec lui, et l'aperçu qu'elle tirait de lui aussi.
 */
export function avecLeursBulles(noeuds: readonly NoeudG[], ids: Iterable<string>): Set<string> {
  const out = new Set(ids);
  for (const id of [...out]) for (const b of ancetresBulle(noeuds, id)) out.add(b);
  return out;
}
