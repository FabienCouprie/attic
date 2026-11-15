// core/formats-liste.ts — La façon de séparer une liste de noms, déclarée une fois.
//
// POURQUOI CE MODULE EXISTE. Quatre composants rendent une liste de noms en texte, instruments,
// émotions, styles et tessitures, et chacun portait sa copie du réglage « Format » ET de la jointure
// qui l'applique, à la ligne près (passe de complétude, lot 3c, 2026-11-14). Une cinquième copie
// aurait pu diverger sans que rien ne le dise.

export type FormatListe = "virgule" | "retour-ligne" | "puces";

/** Les trois formats, dans l'ordre que les quatre composants offraient. */
export const FORMATS_LISTE: { ids: FormatListe[]; fr: string[]; en: string[] } = {
  ids: ["virgule", "retour-ligne", "puces"],
  fr: ["Virgule", "Retour ligne", "Puces"],
  en: ["Comma", "Newline", "Bullets"],
};

/** Les listes du réglage. */
export function choixFormatListe(): { options: string[]; optionsEn: string[]; optionIds: FormatListe[] } {
  return { options: [...FORMATS_LISTE.fr], optionsEn: [...FORMATS_LISTE.en], optionIds: [...FORMATS_LISTE.ids] };
}

/**
 * Les noms joints selon le format reçu.
 *
 * TOUTES LES ÉCRITURES SE LISENT, l'identifiant comme les libellés d'avant, en français et en
 * anglais, sans égard à la casse : les projets enregistrés avant les identifiants portent encore
 * « Retour ligne » ou « Bullets ». Un format inconnu joint par des virgules, le défaut.
 */
export function joindreListe(noms: readonly string[], format: string): string {
  const fmt = format.trim().toLowerCase();
  if (fmt === "retour-ligne" || fmt === "retour ligne" || fmt === "newline") return noms.join("\n");
  if (fmt === "puces" || fmt === "bullets") return noms.map((n) => `• ${n}`).join("\n");
  return noms.join(", ");
}
