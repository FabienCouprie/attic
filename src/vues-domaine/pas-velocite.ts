// ui/pas-velocite.ts — Ce qu'un clic fait à un pas du séquenceur de batterie avancé.
//
// Le geste était le suivant : un clic montait la vélocité d'un cran, Maj+clic la
// descendait. Cliquer sur une case allumée ne l'éteignait donc jamais — et une case
// arrivée à 9 ne répondait plus du tout —, alors que les trois autres séquenceurs de
// l'application (batterie simple, mélodique, accords) basculent la case au clic. On ne
// pouvait pas défaire un motif de départ sans deviner le Maj+clic et le répéter neuf fois.
//
// Le clic bascule désormais, comme ailleurs, et la vélocité — ce que ce séquenceur a de
// plus que les autres — passe sur les modificateurs.
export type GestePas = "bascule" | "monter" | "descendre";

/** Vélocité donnée à une case qu'on allume sans en avoir réglé la nuance. */
export const VELOCITE_PAR_DEFAUT = 6;

const VELOCITE_MAX = 9;

/** Maj monte la vélocité, Alt la descend, le clic nu bascule la case. */
export function gestePas(e: { shiftKey?: boolean; altKey?: boolean }): GestePas {
  if (e.shiftKey) return "monter";
  if (e.altKey) return "descendre";
  return "bascule";
}

/**
 * Vélocité du pas après le geste.
 *
 * `velocitePrecedente` est la dernière nuance connue de CETTE case : rallumer un pas lui
 * rend la vélocité qu'il avait avant qu'on l'éteigne, plutôt que de la remettre au
 * défaut — éteindre puis rallumer ne doit pas effacer un accent.
 */
export function velociteApresGeste(
  velocite: number,
  geste: GestePas,
  velocitePrecedente?: number,
): number {
  const borne = (v: number) => Math.max(0, Math.min(VELOCITE_MAX, Math.round(v)));
  switch (geste) {
    case "monter":
      return borne(velocite + 1);
    case "descendre":
      return borne(velocite - 1);
    case "bascule":
      if (velocite > 0) return 0;
      return borne(velocitePrecedente && velocitePrecedente > 0 ? velocitePrecedente : VELOCITE_PAR_DEFAUT);
  }
}
