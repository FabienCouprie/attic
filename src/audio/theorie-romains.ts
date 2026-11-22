// audio/theorie-romains.ts — Les chiffres romains et les symboles d'accords, pour les nœuds qui les développent.
//
// Placé ici (et non dans un fichier plugins/*) pour que plusieurs plugins
// puissent l'importer via "../audio/..." sans créer de dépendance croisée
// entre fichiers de plugins ; même raison que GAMMES_MELODIE_* dans
// audio/generation.ts.
import { estChiffreRomain, lireChiffreRomain } from "./lecture-romains";
import { symbolesInconnus } from "./symboles-accords";

/**
 * Les symboles qu'aucun accord ne reconnaît.
 *
 * POURQUOI ICI, ET NON DANS LE FICHIER QUI S'EN SERT. Trois composants de gravure et trois
 * composants de théorie posent la même question, et deux lecteurs d'un même symbole ne doivent pas
 * se répondre différemment. Ce module est déjà le domicile partagé des chiffres romains, pour la
 * raison écrite ci-dessus.
 *
 * ET LA RÉPONSE VIENT DE TONAL, qui la donnait déjà sans que personne ne la lise. Le code écrivait
 * `Chord.get(a).symbol ?? a` : Tonal rend la CHAÎNE VIDE pour un symbole inconnu, et `??` ne se
 * déclenche pas dessus, seulement sur `null`. MESURÉ : `Chord.get("Tempo")` rend
 * `{ symbol: "", empty: true }`. Le refus était à un champ de distance.
 */
export function accordsInconnus(accords: readonly string[]): string[] {
  // Par le seul lecteur des symboles depuis le 2026-11-22 : « Bø7 », « CΔ7 » et « B♭ » sont lus,
  // « N.C. » aussi, comme un accord silencieux.
  return symbolesInconnus(accords);
}

/** Mode dans lequel les chiffres romains sont lus. */
export type ModeProgression = "majeur" | "mineur";

/**
 * Accords d'une progression en chiffres romains, lus dans le mode demandé ; un chiffre qui ne se lit
 * pas rend une chaîne vide, que `romainsInconnus` nomme avant.
 *
 * Point d'entrée unique des nœuds qui développent des chiffres romains (« Progression », « Grille
 * d'accords », « Accords → Notation MIDI », la Grille et la Partition VexFlow).
 *
 * LA LECTURE EST CELLE D'ATTIC DEPUIS LE 2026-11-22 (`lecture-romains.ts`), revue des notations en
 * texte. Elle passait par Tonal, que deux fonctions d'ici préparaient : `normaliserRomains`
 * ajoutait le « m » d'une minuscule, `romainsSelonMode` bémolisait III, VI et VII en mineur. La
 * première laissait « vi7 » intact, au motif qu'il portait sa propre qualité, et Tonal y lisait une
 * septième de dominante ; la seconde bémolisait aussi « vii° », l'accord de la sensible. Les deux
 * corrections qu'elles portaient, la casse qui dit la qualité et la mineure naturelle, vivent dans
 * la nouvelle lecture.
 */
export function accordsDepuisRomains(tonique: string, tokens: string[], mode: ModeProgression = "majeur"): string[] {
  return tokens.map((t) => lireChiffreRomain(t, tonique, mode) ?? "");
}

/**
 * Vrai quand chaque jeton est un chiffre romain que la lecture sait lire : « V7 », « ii° », « bVII »,
 * « V65 » et « V/V » compris.
 *
 * LES GRAVEURS VEXFLOW NE REGARDAIENT QUE LE PREMIER JETON, et n'y voulaient que des I et des V. La
 * Grille d'accords regardait le préfixe du premier jeton, « Accords → Notation » s'il y en avait un :
 * trois réponses à une seule question, que ce prédicat donne désormais à tous, revue des notations
 * en texte du 2026-11-22. Une progression mêlée de romains et de symboles se lit comme des symboles,
 * et ses romains y sont nommés inconnus.
 */
export function estProgressionRomaine(tokens: readonly string[]): boolean {
  return tokens.length > 0 && tokens.every(estChiffreRomain);
}

/**
 * Les jetons qui ne sont pas un chiffre romain que la lecture sait lire : « X », « V/V/V ».
 *
 * La lecture rendait une chaîne vide pour un tel jeton, et le nœud écrivait « C  G » pour « I X V » :
 * le X disparaissait, et l'espace double disparaissait à son tour chez le lecteur suivant. Mesuré le
 * 2026-11-22, revue des notations en texte ; ces jetons sont refusés et nommés.
 */
export function romainsInconnus(tokens: readonly string[]): string[] {
  return tokens.filter((t) => !estChiffreRomain(t));
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
