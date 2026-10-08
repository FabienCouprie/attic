// plugins/lexique-vosk.ts — Les mots que le moteur ne sait pas prononcer, et pourquoi il faut
// les retirer de la grammaire plutôt que de les y laisser.
//
// LE DÉFAUT, relevé par Fabien : « la réverbération à convolution ne doit pas être dans le
// vocabulaire, elle ne ressort pas à l'oral ». Elle ne ressort pas, et c'est le moteur qui le
// dit : à la construction de la grammaire, Vosk écrit « Ignoring word missing in vocabulary:
// 'convolution' ». Le mot n'est pas dans le lexique du modèle français, et il est JETÉ.
//
// CE QUI RESTE EST PIRE QUE RIEN. La phrase n'est pas retirée, elle est MUTILÉE : il reste
// « réverbération à » dans la grammaire, qui concurrence « réverbération », un composant bien
// réel. Un nom qu'on ne peut pas dire ne se contente donc pas d'être inatteignable, il abîme
// la reconnaissance des noms qui, eux, marchent.
//
// ET LA GRAMMAIRE SE PAIE. Relevé auparavant sur le même chemin : porter la liste de 472 à 864
// entrées fait passer la reconnaissance de 1,8 à 5,0 secondes, la machine d'états se
// construisant à chaque exécution. Retirer ce qui ne peut pas servir n'est donc pas seulement
// plus juste, c'est plus rapide.
//
// COMMENT CETTE LISTE A ÉTÉ MESURÉE, et comment la refaire. Démarrer la dictée dans
// l'application, puis lire la console : le moteur y écrit une ligne « Ignoring word missing in
// vocabulary: 'xxx' » par mot jeté, à chaque occurrence. Les avertissements viennent du worker
// de `vosk-browser` et non du fil principal, de sorte qu'un `console.warn` posé dans la page ne
// les voit pas ; il faut lire la console du navigateur elle-même.
//
// UNE LISTE INCOMPLÈTE NE CASSE RIEN, et c'est ce qui rend cette forme tenable. Un mot oublié
// ici laisse simplement son nom dans la grammaire, c'est-à-dire l'état d'avant. La liste est
// une dette qui se rembourse, jamais un garde dont dépend la justesse.

/**
 * Les mots du catalogue absents du lexique du modèle VOSK FRANÇAIS.
 *
 * Noms propres, sigles, mots anglais et termes techniques que le français courant n'a pas.
 */
const HORS_LEXIQUE_FR: ReadonlySet<string> = new Set([
  // Noms propres et auteurs
  "mandelbrot", "schillinger", "scipio", "xenakis", "risset", "lucier", "wishart", "gendyn",
  "nancarrow", "nørgård", "möbius", "tonnetz", "meyda", "songsee", "pixeltone", "colorsynth",
  "kokoro", "musicgen", "ollama", "vexflow", "soundtouch", "paulstretch", "csound", "vosk",
  "quadrafuzz", "bitcrusher", "speecht5", "distilgpt", "qwen2", "wavesets", "pulsars",
  // Sigles
  "zcr", "stn", "pghi", "fdn", "sfz", "lufs", "adsr", "dtw", "lstm", "ddsp", "fof", "mp3",
  "musicxml", "nodes",
  // Mots anglais
  "rolloff", "ducking", "morphing", "shimmer", "looper", "panner", "pluck", "vocoder",
  "resonance", "processor", "granular", "harmonizer", "octaver", "flanger", "tremolo",
  "stutter", "transient", "esser", "modulator", "enhancer", "aural", "scanning", "voicings",
  "palindrome", "percussive",
  // Termes techniques que le lexique courant n'a pas
  "transcripteur", "débruitage", "glissando", "mappeur", "arpège", "spectrogramme",
  "attracteur", "euclidien", "décaleur", "sinusoïdes", "ambisonique", "pulsant", "multipiste",
  "permuter", "micromontage", "binauraux", "binaurale", "ubiquité", "ondelettes",
  "spatialiseur", "convolution", "résonateurs", "réordonner", "écrêtage", "tessitures",
  "soustractif", "multibande", "expandeur", "normaliseur", "déréverbération", "transposeur",
  "quantiseur", "arpégiateur", "aligneur", "formants", "goniomètre", "centroïde",
  "mosaïquage", "secoueurs", "sérielles", "interpoler",
  // Chiffres isolés, laissés par la normalisation des noms qui en portent
  "0", "2", "3", "5", "5b",
]);

/**
 * LE MODÈLE ANGLAIS N'A PAS ÉTÉ MESURÉ, et sa liste est donc vide.
 *
 * La dire vide plutôt que de recopier la française est la seule chose honnête : les deux
 * lexiques n'ont pas les mêmes manques, et « flanger » ou « vocoder », absents du français,
 * sont des mots anglais ordinaires. L'anglais garde donc le comportement d'avant, et ce qui
 * s'y passe reste à relever.
 */
const HORS_LEXIQUE_EN: ReadonlySet<string> = new Set();

export const horsLexique = (en: boolean): ReadonlySet<string> =>
  (en ? HORS_LEXIQUE_EN : HORS_LEXIQUE_FR);

/**
 * Ce nom peut-il être rendu par le moteur ?
 *
 * Le nom est attendu DÉJÀ NORMALISÉ, en minuscules et sans ponctuation, tel que la liste de
 * dictée le fabrique : comparer autre chose ferait passer « MP3 → WAV » pour dicible.
 */
export function estDicible(nom: string, en = false): boolean {
  const absents = horsLexique(en);
  if (absents.size === 0) return true;
  return !nom.split(" ").some((mot) => absents.has(mot));
}
