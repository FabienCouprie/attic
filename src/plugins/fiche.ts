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
// cas d'une liste qu'une fonction construit, ou qui reprend un réglage partagé annoté `ParametreDef` :
// ses noms s'élargissent à `string`. Il n'y a pas de porte de sortie. Le réglage partagé passe par
// `reglagePartage`, la fabrique prend son nom en paramètre générique, et des noms tirés d'un rang
// viennent d'un tuple de numéros `as const`.
//
// LES FONCTIONS DE CE MODULE RENDENT LEUR ARGUMENT TEL QUEL : elles ne servent qu'au compilateur.
import type { ContexteExecution, FonctionPlugin, ParametreDef } from "../core";
import type { FicheAudio, RuntimeAudio, ValeurAudio } from "../audio/types-domaine";

/**
 * Les noms de réglage qu'un contexte accepte : `NomDeReglage<typeof ctx>`.
 *
 * POUR UNE FERMETURE QUI LIT UN RÉGLAGE PAR UNE VARIABLE, `(nom) => ctx.paramTexte(nom, "")` : écrite
 * `nom: string`, elle rouvrait la porte que la fiche ferme, et le compilateur la refuse.
 */
export type NomDeReglage<C extends { paramTexte(nom: never, defaut: string): string }> = Parameters<C["paramTexte"]>[0];

/**
 * Refuse le contexte d'une fiche qui ne déclare pas tous les réglages `M` qu'une aide lit.
 *
 * POURQUOI UN TYPE ET NON LE CONTEXTE DE L'AIDE ÉCRIT AVEC SES NOMS. Les deux lecteurs du contexte
 * sont des méthodes, donc bivariants : une fiche qui ne déclarerait qu'une partie des noms de l'aide
 * passerait. L'aide prend donc le contexte de la fiche tel quel, `ContexteExecution<…, N>`, et ce
 * type le refuse quand `M` n'est pas tout entier dans `N`. Un contexte aux noms libres, `N = string`,
 * passe comme avant : c'est celui de l'exécuteur que `effet()` construit.
 */
export type ExigeReglages<N extends string, M extends string> = [M] extends [N]
  ? unknown
  : { "reglages lus par l'aide et absents de la fiche": Exclude<M, N> };

/**
 * Le contexte qu'une aide reçoit d'une fiche qui déclare au moins les réglages `M` :
 * `function aide<N extends string>(ctx: ContexteQuiDeclare<N, "Gamme">)`.
 */
export type ContexteQuiDeclare<N extends string, M extends string> =
  ContexteExecution<ValeurAudio, RuntimeAudio, N> & ExigeReglages<N, M>;

/**
 * Le même contexte, lu par l'aide sous ses seuls noms `M` : ses propres lectures sont ainsi
 * vérifiées à leur tour, et une faute de frappe dans l'aide tombe comme dans une fiche.
 */
export function lecteurDe<M extends string>(
  ctx: ContexteExecution<ValeurAudio, RuntimeAudio, string>,
): ContexteExecution<ValeurAudio, RuntimeAudio, M> {
  return ctx;
}

/** Refuse une fiche dont les noms de réglage se sont élargis à `string`, en le disant. */
type NomsLitteraux<N extends string> = [string] extends [N]
  ? { "les noms de reglage ne se deduisent pas : ecrivez-les sur place, ou declarez le reglage partage par reglagePartage": true }
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
