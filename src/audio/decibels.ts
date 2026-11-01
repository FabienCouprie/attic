// audio/decibels.ts — Le décibel d'amplitude, dans les deux sens, écrit une fois.
//
// POURQUOI CE MODULE EXISTE. Le dépôt n'avait aucun canonique pour `20 · log10(x)` : la formule
// était écrite quatre-vingt-une fois dans trente-six fichiers (relevé du 2026-10-31, lot 4 de la
// revue), et sept fichiers tenaient chacun leur lambda `enDb` ou `dB`, avec chacun son plancher
// (`-120`, `-180`, `-240`, `-Infinity`, `1e-9`, `1e-12`, `PLANCHER_DB`). Les planchers ne sont pas
// ici, et c'est voulu : ils disent ce que CE site tient pour le silence, et les unifier changerait
// ce que chaque nœud affiche ou décide. Chaque appelant garde le sien, autour de ce seul calcul.
//
// C'EST L'AMPLITUDE, NON LA PUISSANCE : `10 · log10(x)`, qu'une trentaine de sites écrivent pour une
// énergie ou une puissance, n'est pas ce module.

/** Un rapport d'amplitude en décibels : `20 · log10(x)`. Zéro rend `-Infinity`, comme le logarithme. */
export const versDb = (x: number): number => 20 * Math.log10(x);

/** L'inverse : le rapport d'amplitude que vaut `db` décibels. */
export const depuisDb = (db: number): number => Math.pow(10, db / 20);
