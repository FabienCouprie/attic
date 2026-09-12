// audio/theorie-romains.ts — Normalisation des chiffres romains avant Tonal.
//
// Placé ici (et non dans un fichier plugins/*) pour que plusieurs plugins
// puissent l'importer via "../audio/..." sans créer de dépendance croisée
// entre fichiers de plugins — même raison que GAMMES_MELODIE_* dans
// audio/generation.ts.
import { Progression, RomanNumeral } from "tonal";

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

/** Mode dans lequel les chiffres romains sont lus. */
export type ModeProgression = "majeur" | "mineur";

/**
 * Degrés dont la FONDAMENTALE descend d'un demi-ton en mineur naturel.
 *
 * La gamme de la mineur est A B C D E F G : ses degrés III, VI et VII tombent
 * sur do, fa et sol, là où la mineur MAJEURE donnerait do♯, fa♯ et sol♯. Les
 * quatre autres degrés ont la même fondamentale dans les deux modes — seule leur
 * qualité change, et `normaliserRomains` s'en charge depuis la casse.
 */
const DEGRES_ABAISSES_EN_MINEUR = new Set(["III", "VI", "VII"]);

/**
 * Reporte le mode sur les chiffres romains, en bémolisant les degrés qui le
 * demandent.
 *
 * `Progression.fromRomanNumerals` de Tonal résout TOUJOURS les degrés sur la
 * gamme majeure : la casse décide de la qualité de l'accord, jamais de sa
 * fondamentale. En la mineur, « i VI III VII » rendait donc `Am F# C# G#` — la
 * tonique du bon mode, puis trois accords de la mineur majeure. Le défaut était
 * d'autant plus discret que les accords produits sont valides et que la
 * documentation des paramètres recommandait précisément cette écriture.
 *
 * Un degré portant déjà une altération (`bIII`, `#IV`) est laissé tel quel :
 * l'utilisateur a dit ce qu'il voulait, et le bémoliser une seconde fois
 * changerait sa demande.
 */
export function romainsSelonMode(tokens: string[], mode: ModeProgression): string[] {
  if (mode !== "mineur") return tokens;
  return tokens.map((t) => {
    const rn = RomanNumeral.get(t);
    if (rn.empty || rn.acc !== "") return t;
    return DEGRES_ABAISSES_EN_MINEUR.has(rn.roman.toUpperCase()) ? `b${t}` : t;
  });
}

/**
 * Accords d'une progression en chiffres romains, lus dans le mode demandé.
 *
 * Point d'entrée unique des trois nœuds qui développent des chiffres romains
 * (« Progression », « Grille d'accords », « Accords → Notation MIDI ») : ils
 * appelaient chacun Tonal directement, et la correction du mode aurait dû être
 * écrite trois fois.
 */
export function accordsDepuisRomains(
  tonique: string,
  tokens: string[],
  mode: ModeProgression = "majeur",
): string[] {
  return Progression.fromRomanNumerals(tonique, normaliserRomains(romainsSelonMode(tokens, mode)));
}

/**
 * Mode lu dans un libellé de tonalité, tel que « Analyse harmonique » l'émet :
 * `A minor (90%)`, `C major (96%)`.
 *
 * Rend `null` quand le texte ne dit rien du mode — une simple tonique comme « A »
 * n'est ni majeure ni mineure, et deviner à sa place serait pire que laisser le
 * paramètre décider.
 */
/**
 * Tonique lue dans un libellé de tonalité : « A minor (90%) » → « A ».
 *
 * Tonal attend une note seule ; lui passer la chaîne entière ne produit aucun
 * accord, et le nœud rendait alors une grille vide sans dire pourquoi. Extrait
 * ici plutôt que dans un seul plugin : trois nœuds reçoivent ce libellé, et
 * chacun avait ou aurait eu sa copie.
 */
export function toniqueDepuisTonalite(texte: string): string | null {
  const m = /^\s*([A-G][#b]?)/.exec(texte ?? "");
  return m ? m[1] : null;
}

export function modeDepuisTonalite(texte: string): ModeProgression | null {
  const t = (texte ?? "").toLowerCase();
  if (/\b(minor|mineur|min|m)\b/.test(t)) return "mineur";
  if (/\b(major|majeur|maj)\b/.test(t)) return "majeur";
  return null;
}
