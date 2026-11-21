// core/boucles-essai.ts — Des fiches de boucle d'essai, pour éprouver le dépliage sans le domaine.
//
// POURQUOI CE MODULE, depuis la pièce P2 du plan des identifiants, le 2026-11-21. Le dépliage lit le
// rôle d'un nœud sur sa fiche (`debutDeBoucle`, `finDeBoucle`, `boucleParPasses`), et ne nomme plus
// aucun identifiant. Les cas du cœur qui l'éprouvent posaient leurs nœuds sous les identifiants
// audio que le module nommait ; ils les posent sous ces identifiants d'essai, et lisent les rôles
// que leurs fiches déclareraient. Aucun n'est une fiche du catalogue, et seuls des tests importent
// ce module.
//
// LES SORTES SONT CELLES DU DOMAINE AUDIO, une par une, pour que chaque cas garde son sens : un début
// qui reboucle et un qui repète, trois fins, un début et une fin menés par passes.
import type { LireRoleDeBoucle, RoleDeBoucle } from "./boucle-graphe";

/** Un début qui reboucle : chaque tour part du résultat du précédent. */
export const FICHE_DEBUT = "essai:debut-reboucle";
/** Un début qui répète : chaque tour repart de l'entrée du début. */
export const FICHE_DEBUT_PLAN = "essai:debut-repete";
export const FICHE_FIN = "essai:fin-a";
export const FICHE_FIN_B = "essai:fin-b";
export const FICHE_FIN_C = "essai:fin-c";

export const FICHES_DEBUT: readonly string[] = [FICHE_DEBUT, FICHE_DEBUT_PLAN];
export const FICHES_FIN: readonly string[] = [FICHE_FIN, FICHE_FIN_B, FICHE_FIN_C];
/** Un début et une fin d'une boucle menée par passes. */
export const FICHES_BOUCLE_PAR_PASSE: readonly string[] = ["essai:passes-debut", "essai:passes-fin"];

const ROLES = new Map<string, RoleDeBoucle>([
  [FICHE_DEBUT, { debutDeBoucle: "reboucle" }],
  [FICHE_DEBUT_PLAN, { debutDeBoucle: "repete" }],
  ...FICHES_FIN.map((id): [string, RoleDeBoucle] => [id, { finDeBoucle: true }]),
  ...FICHES_BOUCLE_PAR_PASSE.map((id): [string, RoleDeBoucle] => [id, { boucleParPasses: true }]),
]);

/** Le rôle que déclarerait la fiche d'essai de cet identifiant ; aucun pour une autre. */
export const rolesDEssai: LireRoleDeBoucle = (ficheId) => ROLES.get(ficheId);
