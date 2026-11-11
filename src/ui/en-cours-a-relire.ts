// ui/en-cours-a-relire.ts — Les nœuds d'un en-cours, remis en forme pour le canevas.
//
// SORTI DE `ui/hooks/useEnCours.ts` le 2026-11-11, pour qu'un cas puisse faire l'aller-retour
// complet sans monter le crochet : `ui/projet-a-ecrire.ts` écrit l'en-cours, ce module le relit, et
// rien de ce que le fichier de projet garde ne doit se perdre entre les deux. Le crochet garde ses
// effets : lire l'en-cours, poser les nœuds et les arêtes, appliquer les réglages et le cadrage.
//
// CE QU'IL RELIT EST CE QUE LE FICHIER GARDE, `CHAMPS_DU_PROJET` de `core/saisies.ts`, et non plus
// une liste à lui. La sienne oubliait les ports ouverts à la main, que l'en-cours écrivait : une
// séance reprise les refermait, là où le même projet importé les gardait. Relevé le 2026-11-11, en
// même temps que l'oubli inverse, du côté qui écrit. Voir `ui/en-cours-a-relire.test.ts`.
import { CHAMPS_DU_PROJET } from "../core/saisies";
import { trouverDef } from "./ports-canevas";
import { tailleDefaut } from "./tailles-noeuds";

/**
 * Chaque nœud d'un en-cours, tel que le canevas le reçoit : « en attente », sa taille par défaut
 * quand l'en-cours n'en porte pas, des réglages vides s'il n'en a pas, et les gestes d'`App.tsx`
 * posés sur son `data`.
 */
export function noeudsRelus(noeuds: readonly any[], gestes: Record<string, unknown>): any[] {
  return noeuds.map((n: any) => {
    const def = trouverDef(n.data.ficheId);
    const { width, height } = def ? tailleDefaut(def) : { width: 230, height: 200 };
    return {
      id: n.id, type: "atelier", position: n.position, width: n.width ?? width, height: n.height ?? height,
      data: {
        ...Object.fromEntries([...CHAMPS_DU_PROJET].map((c) => [c, n.data[c]])),
        parametres: n.data.parametres ?? {},
        statut: "attente",
        // TOUS LES GESTES, ET NON UNE LISTE RECOPIÉE. Douze noms étaient énumérés ici, et douze
        // autres à la génération d'un graphe : trois écritures du même savoir, dont deux
        // silencieuses. Un geste neuf ajouté au seul `callbacksNoeud` manquait donc aux nœuds
        // RESTAURÉS — le même geste marchait sur un nœud posé à la main et pas sur le même nœud
        // rouvert depuis un fichier, ce qui est la pire panne à chercher.
        ...gestes,
      },
    };
  });
}
