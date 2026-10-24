// src/docs/assemblage.ts — VALIDER : relire un graphe ÉCRIT, avant de le lancer.
//
// LA TROISIÈME SÉVÉRITÉ, ET CELLE QUI MANQUAIT. Le dépôt en avait deux :
//
//   lire un graphe enregistré   le transport seul, pour ne retirer aucun câble à qui rouvre
//   poser une arête             le transport ET le contenu, refusé sous la souris
//
// Un graphe ÉCRIT — à la main, par un script, par un agent — n'a jamais rencontré la souris. Rien
// ne lui a refusé le câble qui n'a pas de sens, et la validation de lecture est volontairement
// permissive. Entre les deux, personne ne relisait un graphe AVANT de le lancer.
//
// CE QUE CELA ATTRAPE, ET C'EST LE DÉFAUT QUI A OUVERT CE CHANTIER : une sortie « Plan » posée sur
// une entrée « Notation ». Le câble est licite au transport, les couleurs de ports s'accordent, et
// le résultat vaut zéro note. Ici il se dit avant qu'une seule note soit rendue.
//
// CE MODULE N'EXÉCUTE RIEN, ET C'EST VOULU. Proposer le graphe, savoir s'il tient debout, attendre
// le Lancer : un pilote n'a pas besoin d'actionneur pour être utile.
import { registre } from "../audio/adaptateur";
import { validerAssemblage } from "../core/validation";
import type { AreteG, NoeudG } from "../core/meta";

export interface Probleme {
  /** Le nœud concerné, ou l'arête quand c'est elle qui ne va pas. */
  ou: string;
  quoi: string;
}

export interface RapportAssemblage {
  noeuds: number;
  aretes: number;
  problemes: Probleme[];
  /** Les identifiants de fiche que le registre ne connaît pas. Ils précèdent tout le reste. */
  fichesInconnues: string[];
}

/** Un graphe tel qu'un fichier d'Attic le porte. */
export interface GrapheEcrit {
  nodes?: NoeudG[];
  edges?: AreteG[];
}

/**
 * Relit un graphe écrit et rend ce qui ne va pas.
 *
 * LES FICHES INCONNUES SE DISENT D'ABORD, et à part : un identifiant qui n'existe pas rend tout le
 * reste muet, puisque la validation saute un nœud dont elle ne trouve pas la définition. Les taire
 * dirait « rien à signaler » sur un graphe entièrement faux.
 */
export function validerGrapheEcrit(graphe: GrapheEcrit): RapportAssemblage {
  const noeuds = graphe.nodes ?? [];
  const aretes = graphe.edges ?? [];
  const fichesInconnues = [...new Set(
    noeuds.map((n) => String(n.data?.ficheId ?? ""))
      .filter((id) => id && id !== "comment" && !registre.trouverDef(id)),
  )].sort();

  const res = validerAssemblage(
    noeuds, aretes,
    (ficheId) => registre.trouverDef(ficheId) as never,
    registre.fluxCompatibles,
  );

  const problemes: Probleme[] = [];
  for (const [noeud, msgs] of res.noeudsAffectes) {
    for (const quoi of msgs) problemes.push({ ou: noeud, quoi });
  }
  problemes.sort((a, b) => (a.ou + a.quoi).localeCompare(b.ou + b.quoi));
  return { noeuds: noeuds.length, aretes: aretes.length, problemes, fichesInconnues };
}

/** Le rapport en texte, une ligne par problème, pour une sortie de console ou un journal. */
export function rapportEnTexte(r: RapportAssemblage): string {
  const lignes = [`${r.noeuds} nœuds, ${r.aretes} arêtes`];
  for (const id of r.fichesInconnues) lignes.push(`  fiche inconnue : ${id}`);
  for (const p of r.problemes) lignes.push(`  ${p.ou} : ${p.quoi}`);
  if (r.fichesInconnues.length === 0 && r.problemes.length === 0) lignes.push("  rien à signaler");
  return lignes.join("\n");
}
