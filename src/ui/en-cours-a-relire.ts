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
 * Chaque nœud d'un en-cours, tel que le canevas le reçoit : sa taille par défaut quand l'en-cours n'en
 * porte pas, et des réglages vides s'il n'en a pas. Son statut n'y est pas : il vit dans
 * `ui/statuts.ts`, et un nœud qui n'y figure pas est en attente. Ses gestes non plus : ils viennent du
 * contexte de `ui/gestes-noeud.ts`, de sorte qu'un nœud restauré ne peut plus en manquer.
 */
export function noeudsRelus(noeuds: readonly any[]): any[] {
  return noeuds.map((n: any) => {
    const def = trouverDef(n.data.ficheId);
    const { width, height } = def ? tailleDefaut(def) : { width: 230, height: 200 };
    return {
      id: n.id, type: "atelier", position: n.position, width: n.width ?? width, height: n.height ?? height,
      data: {
        ...Object.fromEntries([...CHAMPS_DU_PROJET].map((c) => [c, n.data[c]])),
        parametres: n.data.parametres ?? {},
      },
    };
  });
}
