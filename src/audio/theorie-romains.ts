// audio/theorie-romains.ts — Normalisation des chiffres romains avant Tonal.
//
// Placé ici (et non dans un fichier plugins/*) pour que plusieurs plugins
// puissent l'importer via "../audio/..." sans créer de dépendance croisée
// entre fichiers de plugins — même raison que GAMMES_MELODIE_* dans
// audio/generation.ts.
import { RomanNumeral } from "tonal";

/**
 * Tonal LIT la casse d'un chiffre romain (`RomanNumeral.get("vi").major` vaut
 * bien `false`) mais ne la reporte PAS sur le type d'accord : `chordType` reste
 * vide et `Progression.fromRomanNumerals` construit alors une triade MAJEURE.
 * « vi » en do majeur donnait ainsi La majeur (A C# E) au lieu du relatif
 * mineur (A C E) — une faute d'harmonie silencieuse, puisque aucun message
 * n'est émis et que l'accord produit reste parfaitement valide.
 *
 * On explicite donc le « m » quand le chiffre est en minuscules ET qu'aucun
 * type n'est déjà précisé : « vi7 » ou « vii° » portent leur propre qualité et
 * sont laissés intacts.
 */
export function normaliserRomains(tokens: string[]): string[] {
  return tokens.map((t) => {
    const rn = RomanNumeral.get(t);
    if (rn.empty || rn.major || rn.chordType) return t;
    return t + "m";
  });
}
