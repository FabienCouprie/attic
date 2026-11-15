// audio/palettes-couleurs.ts — Les palettes d'une image de densité ou d'un spectrogramme, déclarées une fois.
//
// POURQUOI CE MODULE EXISTE. L'attracteur et la visualisation Songsee offraient la même liste de six
// palettes, écrite deux fois à la main, sans identifiants ni libellés français, et Songsee sans liste
// anglaise (passe de complétude, lot 3c, 2026-11-14).
//
// LES IDENTIFIANTS SONT LES NOMS DE SONGSEE, que son binaire reçoit tels quels, et que l'attracteur
// reprend pour ses propres teintes (`audio/attracteurs-image-et-son.ts`). Un projet qui a enregistré
// « magma » se relit donc tel quel.
//
// CE N'EST PAS LA PALETTE DE LA POCHETTE : ses quinze ambiances nomment des couleurs lues par position,
// et son « magma » n'est pas celui-ci. Le registre des nomenclatures l'écarte avec sa raison.

/** Les six palettes, dans l'ordre que les deux composants offraient. */
export const PALETTES_COULEURS: { ids: string[]; fr: string[]; en: string[] } = {
  ids: ["classic", "magma", "inferno", "viridis", "gray", "claw"],
  fr: ["Classique", "Magma", "Inferno", "Viridis", "Gris", "Claw"],
  en: ["Classic", "Magma", "Inferno", "Viridis", "Gray", "Claw"],
};

/** Les listes d'un réglage de palette. */
export function choixPaletteCouleurs(): { options: string[]; optionsEn: string[]; optionIds: string[] } {
  return { options: [...PALETTES_COULEURS.fr], optionsEn: [...PALETTES_COULEURS.en], optionIds: [...PALETTES_COULEURS.ids] };
}
