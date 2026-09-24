// ui/fichesBulles.ts — La fiche d'une bulle, dérivée de ses membres et jamais rangée nulle part.
//
// POURQUOI UNE FICHE. Un nœud ne sait se dessiner ni se câbler sans définition : `AtelierNode` prend
// ses ports dans le registre, et `onConnect` y lit si un port d'entrée est dynamique. Donner à ces
// appels une seconde source aurait demandé de revoir les quarante-deux endroits qui appellent
// `trouverDef`. Les nœuds-frontière ont déjà résolu ce problème : inscrits au registre pour se
// dessiner, écartés de la palette par un prédicat. Une bulle suit le même rail.
//
// ET POURTANT RIEN N'EST STOCKÉ. Le registre vit en mémoire, reconstruit à chaque lancement ; la fiche
// d'une bulle est refabriquée depuis ses membres à l'ouverture du projet. Le fichier ne porte que le
// nœud de bulle et l'appartenance de ses membres. La portée projet est obtenue sans rien inventer :
// il n'y a pas de définition à ranger, donc pas de catalogue à polluer.
//
// L'UNIVERS EST LE SIEN, ET C'EST DÉLIBÉRÉ. Le ranger sous « Méta-composants » aurait rendu une fuite
// invisible : une bulle oubliée par un filtre se serait glissée dans une rubrique existante. Sous son
// propre nom, une fuite crée une rubrique qu'on ne peut pas ne pas voir.

import type { PluginDef, Registre, TypeValeur } from "../core";
import {
  estBulle, ficheDeBulle, noeudDeFicheBulle, portsDeBulle, type NoeudG,
} from "../core";

export const UNIVERS_BULLES = "Bulles";

/** Ce qui décide de refabriquer les fiches : les bulles, leurs membres, et les ports de ceux-ci. */
export function signatureBulles(noeuds: readonly NoeudG[], nomDe: (n: NoeudG) => string): string {
  const parts: string[] = [];
  for (const n of noeuds) {
    const b = (n.data as Record<string, unknown>).bulle;
    if (estBulle(n.data.ficheId)) parts.push(`B:${n.id}:${nomDe(n)}:${b ?? ""}`);
    else if (typeof b === "string" && b) parts.push(`M:${n.id}:${n.data.ficheId}:${b}`);
  }
  return parts.join("|");
}

/**
 * Met le registre à jour : une fiche par bulle présente, et plus aucune pour celles qui ont disparu.
 *
 * Rend la liste des fiches inscrites et celle des fiches retirées, de quoi éprouver la synchronisation
 * sans lire le registre de l'extérieur.
 */
export function synchroniserFichesBulles(
  noeuds: readonly NoeudG[],
  registre: Registre<TypeValeur, AudioContext>,
  nomDe: (n: NoeudG) => string,
): { inscrites: string[]; retirees: string[] } {
  const getDef = (ficheId: string) => registre.trouverDef(ficheId);
  const attendues = new Set<string>();
  const inscrites: string[] = [];

  for (const n of noeuds) {
    if (!estBulle(n.data.ficheId)) continue;
    const ficheId = ficheDeBulle(n.id);
    attendues.add(ficheId);
    const ports = portsDeBulle(noeuds, n.id, getDef, nomDe);
    const nom = nomDe(n);
    const def: PluginDef<TypeValeur, AudioContext> = {
      id: ficheId,
      nom,
      nomEn: nom,
      univers: UNIVERS_BULLES,
      famille: UNIVERS_BULLES,
      resume: `Bulle : ${ports.entrees.length} entrée(s), ${ports.sorties.length} sortie(s).`,
      resumeEn: `Bubble: ${ports.entrees.length} input(s), ${ports.sorties.length} output(s).`,
      notice: "Replie une partie du schéma. Les composants qu'elle contient restent dans le graphe et s'exécutent comme avant ; ses entrées et ses sorties sont celles de ces composants. « Développer » les replace sur le canevas ; « Ouvrir » montre son intérieur seul.",
      noticeEn: "Folds part of the patch. The nodes it contains stay in the graph and run as before; its inputs and outputs are theirs. « Expand » puts them back on the canvas; « Open » shows its inside alone.",
      entrees: ports.entrees,
      sorties: ports.sorties,
      parametres: [],
      // L'APERÇU AUDIO N'EST PAS INTERDIT, IL EST CHOISI AILLEURS. Le lecteur générique joue la
      // PREMIÈRE sortie audio, qui serait ici celle du premier membre venu ; c'est donc l'exécuteur qui
      // ne lui donne que la sortie représentant la bulle, celle qui en sort. Voir `sortieDeBulle`.
      // INSCRITE POUR SE DESSINER, JAMAIS POUR ÊTRE CHOISIE. `tousLesPlugins` ne la rend pas, donc la
      // palette, le quiz, le vocabulaire de génération et le gestionnaire de nodes l'ignorent tous,
      // sans qu'aucun d'eux ait eu à filtrer quoi que ce soit.
      horsCatalogue: true,
      // Jamais appelé : une bulle est décorative, l'exécuteur l'écarte de son ordre de calcul.
      executer: async () => ({ valeurs: ports.sorties.map(() => null), message: "" }),
    };
    registre.enregistrer(def);
    inscrites.push(ficheId);
  }

  const retirees: string[] = [];
  // `tousLesInscrits` et non `tousLesPlugins` : nos propres fiches sont hors catalogue, donc invisibles
  // à la seconde. Sans cette lecture, elles s'accumuleraient sans que rien ne puisse les nommer.
  for (const def of registre.tousLesInscrits()) {
    if (!estBulle(def.id) || attendues.has(def.id)) continue;
    registre.desenregistrer(def.id);
    retirees.push(def.id);
  }
  return { inscrites, retirees };
}

/** L'identifiant du nœud qu'une fiche de bulle décrit, ou la chaîne vide. */
export const noeudDeFiche = noeudDeFicheBulle;
