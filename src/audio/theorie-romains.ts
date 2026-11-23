// audio/theorie-romains.ts — Les chiffres romains et les symboles d'accords, pour les nœuds qui les développent.
//
// Placé ici (et non dans un fichier plugins/*) pour que plusieurs plugins
// puissent l'importer via "../audio/..." sans créer de dépendance croisée
// entre fichiers de plugins ; même raison que GAMMES_MELODIE_* dans
// audio/generation.ts.
import { estChiffreRomain, lireChiffreRomain } from "./lecture-romains";
import { symbolesInconnus } from "./symboles-accords";
import { GAMMES, LIBELLES_HERITES_GAMMES, degresSansPassage, gammeDe } from "./gammes";
import { triadeDuDegre } from "./triades-gamme";

/** Le nom de la triade d'une gamme sur son degré `k`, un degré sur deux, ou null si elle n'en a aucun. */
function triadeNommee(id: string, k: number): "maj" | "min" | "dim" | "aug" | null {
  const d = degresSansPassage(id);
  if (k >= d.length) return null;
  const [, tierce, quinte] = triadeDuDegre(d, d[k]);
  const NOMS: Record<string, "maj" | "min" | "dim" | "aug"> = { "4,7": "maj", "3,7": "min", "3,6": "dim", "4,8": "aug" };
  return NOMS[`${tierce},${quinte}`] ?? null;
}

/**
 * LES GAMMES OÙ LES CHIFFRES ROMAINS SE LISENT : celles dont chaque degré, de I à VII tant que la gamme
 * les a, porte un accord majeur, mineur, diminué ou augmenté, que la casse et les signes d'un chiffre
 * savent écrire. Décision de Fabien du 2026-11-23 : dix-sept gammes de la table, les sept modes, les
 * deux mineures, l'altérée, les deux dominantes, la bebop dominante, la gamme par tons, les deux
 * diminuées et l'augmentée. Les huit autres ont des degrés dont l'accord n'a pas de nom (do, mi, la sur
 * le I de la pentatonique majeure) : aucun chiffre ne l'écrit. CALCULÉ SUR LA TABLE, et non écrit à la
 * main, pour qu'une gamme ajoutée à la table y entre ou en sorte par la même règle.
 */
export const GAMMES_DES_ROMAINS = GAMMES.filter((g) =>
  degresSansPassage(g.id).slice(0, 7).every((_, k) => triadeNommee(g.id, k) !== null));

/**
 * LA PROGRESSION PAR DÉFAUT DU MINEUR, décision de Fabien du 2026-11-21. La casse décide de la
 * qualité, comme la notice le dit : « I V vi IV », écrite pour le majeur, jouait mi bémol majeur sur le
 * i de mi bémol mineur. Celle-ci est le pendant de la progression du majeur, i, ♭VI, ♭III, ♭VII, le
 * mineur abaissant de lui-même III, VI et VII.
 */
export const PROGRESSION_MINEURE = "i VI III VII";

/**
 * La progression par défaut dans une gamme : les degrés I, V, VI et IV, chacun écrit dans la casse et
 * le signe de l'accord de la gamme sur ce degré, « i v vi° IV » en dorien. Décision de Fabien du
 * 2026-11-23, qui étend aux autres gammes celle du mineur ; le mineur garde la sienne.
 */
export function progressionParDefaut(id: string): string {
  if (id === "mineur") return PROGRESSION_MINEURE;
  return [0, 4, 5, 3].map((k) => {
    const c = ["I", "II", "III", "IV", "V", "VI", "VII"][k];
    const q = triadeNommee(id, k);
    return q === "min" ? c.toLowerCase() : q === "dim" ? `${c.toLowerCase()}°` : q === "aug" ? `${c}+` : c;
  }).join(" ");
}

/** Le réglage « Gamme » des nœuds qui lisent des chiffres romains : les gammes où ils se lisent. */
export const CHOIX_GAMME_ROMAINE = {
  type: "choix" as const,
  options: GAMMES_DES_ROMAINS.map((g) => g.fr), optionsEn: GAMMES_DES_ROMAINS.map((g) => g.en),
  optionIds: GAMMES_DES_ROMAINS.map((g) => g.id), optionsHeritees: LIBELLES_HERITES_GAMMES,
  defaut: GAMMES_DES_ROMAINS[0].fr, defautEn: GAMMES_DES_ROMAINS[0].en,
};

/** Les progressions par défaut de chaque gamme offerte, pour le `defautSelon` d'un réglage « Progression ». */
export const PROGRESSIONS_PAR_GAMME: Readonly<Record<string, string>> = Object.fromEntries(
  GAMMES_DES_ROMAINS.filter((g) => g.id !== "majeur").map((g) => [g.id, progressionParDefaut(g.id)]));

/**
 * La gamme dans laquelle lire les chiffres : le mode nommé par un libellé de tonalité d'abord
 * (« A minor (90%) », que « Analyse harmonique » a mesuré), le réglage ensuite, le majeur pour une
 * valeur que la table ignore.
 */
export function gammeDesRomains(tonalite: unknown, reglage: string): ModeProgression {
  const duTexte = typeof tonalite === "string" ? modeDepuisTonalite(tonalite) : null;
  if (duTexte) return duTexte;
  return gammeDe(reglage) && GAMMES_DES_ROMAINS.some((g) => g.id === gammeDe(reglage)!.id) ? gammeDe(reglage)!.id : "majeur";
}

/**
 * Les chiffres qui se lisent mais que cette gamme n'a pas : le VII d'une gamme de six degrés. Ils sont
 * refusés et nommés, comme un chiffre illisible : rien ne se joue à leur place.
 */
export function degresHorsGamme(tokens: readonly string[], gamme: ModeProgression): string[] {
  return tokens.filter((t) => estChiffreRomain(t) && lireChiffreRomain(t, "C", gamme) === null);
}

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

/** Gamme dans laquelle les chiffres romains sont lus : un identifiant de `GAMMES_DES_ROMAINS`. */
export type ModeProgression = string;

/**
 * Accords d'une progression en chiffres romains, lus dans le mode demandé ; un chiffre qui ne se lit
 * pas rend une chaîne vide, que `romainsInconnus` nomme avant.
 *
 * Point d'entrée unique des nœuds qui développent des chiffres romains (« Progression », « Grille
 * d'accords », « Accords → Notation MIDI » et la Grille VexFlow).
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
 * Vrai quand le texte est une progression en chiffres romains : son premier jeton en est un, « V7 »,
 * « ii° », « bVII », « V65 » et « V/V » compris. Les jetons suivants qui ne se lisent pas sont alors
 * des chiffres illisibles, que `romainsInconnus` nomme.
 *
 * UNE SEULE RÉPONSE, revue des notations en texte du 2026-11-22. Trois règles la donnaient : le
 * préfixe du premier jeton (la Grille d'accords), la présence d'un seul (« Accords → Notation »),
 * tous (les graveurs VexFlow). Elles ne s'écartaient que sur un texte mêlé, et le nommaient chacune à
 * sa façon : « I C V » nommait « C » ici, « I V » là. Le premier jeton décide, comme la Grille le
 * faisait, parce que c'est lui que l'on écrit en premier, et que la faute est le plus souvent plus loin.
 */
export function estProgressionRomaine(tokens: readonly string[]): boolean {
  return tokens.length > 0 && estChiffreRomain(tokens[0]);
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
