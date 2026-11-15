// audio/mono-stereo.ts — Le choix entre mono et stéréo, déclaré une fois.
//
// POURQUOI CE MODULE EXISTE. Douze réglages du parc offrent « Mono » ou « Stéréo », et chacun écrivait
// sa paire à la main. Huit enregistraient `mono` et `stereo` ; les quatre « Canaux » de Csound
// enregistraient `1` et `2`, sous les mêmes libellés. Deux vocabulaires pour deux valeurs : c'est ce
// qu'un registre de nomenclatures existe pour signaler (passe de complétude, lot 3c, 2026-11-14).
//
// LES ANCIENNES ÉCRITURES SE RELISENT, par `optionsHeritees` : un projet qui a enregistré `2` sur un
// nœud Csound rouvre en stéréo.

export type MonoStereo = "mono" | "stereo";

/** La paire, mono d'abord, comme chacun des douze réglages l'offrait. */
export const MONO_STEREO: { ids: MonoStereo[]; fr: string[]; en: string[] } = {
  ids: ["mono", "stereo"],
  fr: ["Mono", "Stéréo"],
  en: ["Mono", "Stereo"],
};

/**
 * Les écritures qu'un projet enregistré peut porter : les identifiants, les libellés, et le nombre
 * de canaux que Csound enregistrait.
 */
export const LIBELLES_HERITES_MONO_STEREO: Record<string, MonoStereo> = {
  "mono": "mono", "stereo": "stereo",
  "Mono": "mono", "Stéréo": "stereo", "Stereo": "stereo",
  "1": "mono", "2": "stereo",
};

/** Les listes d'un réglage mono ou stéréo, avec ses écritures d'avant. */
export function choixMonoStereo(): { options: string[]; optionsEn: string[]; optionIds: MonoStereo[]; optionsHeritees: Record<string, string> } {
  return {
    options: [...MONO_STEREO.fr],
    optionsEn: [...MONO_STEREO.en],
    optionIds: [...MONO_STEREO.ids],
    optionsHeritees: { ...LIBELLES_HERITES_MONO_STEREO },
  };
}

/**
 * Le nombre de canaux d'une valeur reçue, une ou deux.
 *
 * UNE FONCTION, ET NON UNE COMPARAISON À LA MAIN : Csound lisait `parseInt` d'un identifiant qui est
 * désormais `stereo`, et un `parseInt("stereo")` vaut `NaN`, ce qui aurait rendu chaque nœud Csound
 * mono en silence. Une valeur inconnue vaut `siInconnue`, ce que chaque exécuteur lisait déjà : mono
 * pour Csound, stéréo pour les sonifications d'image.
 */
export function canauxDe(valeur: unknown, siInconnue: 1 | 2 = 1): 1 | 2 {
  const lue = LIBELLES_HERITES_MONO_STEREO[String(valeur).trim()];
  return lue === "stereo" ? 2 : lue === "mono" ? 1 : siInconnue;
}
