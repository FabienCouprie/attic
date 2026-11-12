// plugins/fiche.ts — Une fiche dont l'exécuteur ne lit que les réglages qu'elle déclare.
//
// POURQUOI CE MODULE, et c'est la pièce 1 de `work/plan-reglages-par-nom-2026-11-11.md`. Un
// exécuteur lit ses réglages par leur libellé, `ctx.paramNombre("Gain", 1)`, et rien ne tenait ce
// libellé à ceux que la fiche déclare : `fiches: FicheAudio[]` élargit leurs noms à `string`. Un nom
// mal écrit, ou un réglage renommé dans sa fiche, retombait sans un mot sur le défaut de l'appel, et
// le garde du repli le laissait passer, faute de savoir distinguer une faute d'une migration.
//
// `fiche({...})` DÉDUIT LES NOMS DE `parametres`, et type l'exécuteur avec eux. Une lecture d'un nom
// que la fiche ne déclare pas fait désormais tomber `tsc`, à l'endroit de la lecture. Un réglage que
// la fiche ne montre plus et que l'exécuteur lit encore se nomme dans `anciensReglages`.
//
// UNE FICHE DONT LES NOMS NE SE DÉDUISENT PAS EST REFUSÉE, et non laissée libre en silence. C'est le
// cas d'une liste qu'une fonction construit, ou qui mêle des réglages partagés à ceux écrits sur
// place : ses noms s'élargissent à `string`. Elle passe alors par `ficheSansNomsVerifies`, qui dit ce
// qu'elle est, et que le garde `plugins/fiche.test.ts` tient dans une liste qui ne fait que rétrécir.
//
// LES DEUX FONCTIONS RENDENT LEUR ARGUMENT TEL QUEL : elles ne servent qu'au compilateur.
import type { FonctionPlugin, ParametreDef } from "../core";
import type { FicheAudio, RuntimeAudio, ValeurAudio } from "../audio/types-domaine";

/**
 * Les noms de réglage qu'un contexte accepte : `NomDeReglage<typeof ctx>`.
 *
 * POUR UNE FERMETURE QUI LIT UN RÉGLAGE PAR UNE VARIABLE, `(nom) => ctx.paramTexte(nom, "")` : écrite
 * `nom: string`, elle rouvrait la porte que la fiche ferme, et le compilateur la refuse.
 */
export type NomDeReglage<C extends { paramTexte(nom: never, defaut: string): string }> = Parameters<C["paramTexte"]>[0];

/** Refuse une fiche dont les noms de réglage se sont élargis à `string`, en le disant. */
type NomsLitteraux<N extends string> = [string] extends [N]
  ? { "les noms de reglage ne se deduisent pas : ecrivez-les sur place, ou passez par ficheSansNomsVerifies": true }
  : unknown;

/**
 * Une fiche audio dont l'exécuteur ne peut lire que ses réglages déclarés et ses anciens réglages.
 *
 * `N` vaut `never` quand la fiche ne déclare aucun réglage : son exécuteur n'en lit alors aucun.
 */
export function fiche<N extends string = never, A extends string = never>(
  f: Omit<FicheAudio, "parametres" | "anciensReglages" | "executer"> & {
    parametres: (ParametreDef & { nom: N })[] & NomsLitteraux<N>;
    anciensReglages?: readonly A[];
    executer: FonctionPlugin<ValeurAudio, RuntimeAudio, N | A>;
  },
): FicheAudio {
  return f;
}

/**
 * Un réglage déclaré une fois et repris par plusieurs fiches, dont le nom reste littéral.
 *
 * POURQUOI CETTE FONCTION, et c'est la pièce 2 du plan. Un réglage partagé écrit
 * `const X: ParametreDef = { nom: "Instrument", ... }` élargit son nom à `string`, et chaque fiche
 * qui le reprend perd tous les siens : `fiche()` ne peut plus les déduire. Écrit
 * `const X = reglagePartage({ ... })`, il garde son nom, et les fiches qui l'étalent ou le
 * reprennent se vérifient comme les autres. Elle rend le réglage tel quel.
 */
export function reglagePartage<N extends string>(p: ParametreDef & { nom: N }): ParametreDef & { nom: N } {
  return p;
}

/**
 * Une fiche dont les noms de réglage ne se déduisent pas encore, et dont l'exécuteur lit donc tout
 * nom sans vérification, comme avant ce module. Chacune est nommée dans `plugins/fiche.test.ts`.
 */
export function ficheSansNomsVerifies(f: FicheAudio): FicheAudio {
  return f;
}
