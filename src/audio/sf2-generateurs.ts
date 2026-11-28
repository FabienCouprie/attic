// audio/sf2-generateurs.ts — Lire, résoudre et additionner une famille de générateurs SoundFont.
//
// Les générateurs d'une voix se lisent tous de la même façon, quelle que soit leur famille
// (l'enveloppe de volume de `sf2-enveloppe.ts`, le filtre et l'enveloppe de modulation de
// `sf2-filtre.ts`) : signés sur seize bits ; dans une zone, le générateur local REMPLACE celui de la
// zone globale du même niveau, comme la norme le dit ; une zone de preset DÉCALE la zone
// d'instrument, générateur par générateur. Une famille ne se distingue que par ses numéros et ses
// défauts. Ces trois gestes s'écrivent donc une fois.

/** Une famille : à chaque numéro de générateur, le champ qu'il remplit. */
export type Champs<T> = Readonly<Record<number, keyof T>>;

/** Range un générateur lu dans `cible` s'il est de la famille, signé sur seize bits, et dit s'il l'était. */
export function lireDans<T extends { [K in keyof T]: number }>(
  champs: Champs<T>, cible: Partial<T>, type: number, brut: number,
): boolean {
  const champ = champs[type];
  if (champ === undefined) return false;
  cible[champ] = (brut & 0x8000 ? brut - 65536 : brut) as T[keyof T];
  return true;
}

/** Les générateurs d'une zone : les siens, sinon ceux de la zone globale, sinon `defaut`. */
export function deZone<T>(globale: Partial<T>, locale: Partial<T>, defaut: Readonly<T>): T {
  return { ...defaut, ...globale, ...locale };
}

/** Ce que joue une zone d'instrument sous une zone de preset : la somme, générateur par générateur. */
export function additionner<T extends { [K in keyof T]: number }>(
  champs: Champs<T>, instrument: Readonly<T>, preset: Readonly<T> | undefined,
): T {
  const somme = { ...instrument } as T;
  if (!preset) return somme;
  for (const champ of Object.values(champs) as (keyof T)[]) somme[champ] = (somme[champ] + preset[champ]) as T[keyof T];
  return somme;
}

export const borne = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

/** Des timecents absolus en secondes, bornés à la plage de la norme : 2^(tc / 1200). */
export const secondes = (tc: number, min: number, max: number) => 2 ** (borne(tc, min, max) / 1200);
