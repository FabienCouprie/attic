// audio/cles.ts — Les douze clés, déclarées une fois, et le réglage tout fait qui les offre.
//
// POURQUOI CE MODULE EXISTE. Le garde de registre a compté **trente-deux réglages** offrant les
// douze clés, sous **quatre formes** : dix-sept qui affichent « C# » MÊME EN FRANÇAIS, six qui
// affichent « Do# » avec un croisillon, neuf qui affichent « Do♯ » avec le signe typographique, et
// deux orthographes d'identifiant, `D#` d'un côté et `Eb` de l'autre.
//
// LE DÉFAUT LE PLUS GRAVE N'ÉTAIT PAS L'IDENTIFIANT MAIS LE LIBELLÉ. `DEMI_TONS_CLE` connaît
// `Mi♭`, `Eb` et `D#`, et j'ai vérifié que sur les trente-deux listes aucun membre n'échoue à
// résoudre : rien n'est cassé. En revanche l'interface française montre « C# » dans dix-sept
// composants et « Do♯ » dans les autres, ce qui se voit à l'œil nu.
//
// CE QUI EST OFFERT EST UN RÉGLAGE TOUT FAIT, ET NON UNE LISTE À RECOPIER. C'est la seule chose qui
// distingue ce domaine de « Synthèse », offert par quarante-six composants sans avoir jamais
// dérivé : personne ne recopie `PARAMETRE_SYNTHESE`, on l'étale. Une liste qu'il faut recopier se
// recopie de travers ; un objet qu'on étale ne le peut pas.
//
// DEUX FORMES RESTENT, ET C'EST VOULU. Un composant qui nomme une TONALITÉ veut un nom de note ;
// un composant qui compte des DEMI-TONS depuis do veut un nombre, dont il fera de l'arithmétique.
// Les réduire à une seule obligerait l'un des deux à traduire à chaque lecture.
//
// LES ORTHOGRAPHES D'AVANT SONT DÉCLARÉES DANS `optionsHeritees`, et il le faut : la valeur d'un
// choix est enregistrée dans le projet, et elle peut y être le libellé comme l'identifiant. Sans
// cette déclaration, un graphe rouvert retomberait sur do.

import type { ParametreDef } from "../core/types";
import type { Alteration } from "./nom-note";

export interface Cle {
  /** Le nombre de demi-tons depuis do, de zéro à onze. */
  demiTon: number;
  /** Le nom français, avec les signes typographiques. */
  fr: string;
  /** Le nom anglais, qui sert aussi d'identifiant à la forme nommée. */
  en: string;
  /**
   * L'altération dans laquelle cette tonalité s'écrit.
   *
   * ELLE EST DÉCLARÉE ET NON DÉDUITE. La règle est simple à dire — une tonalité suit la graphie de
   * sa propre fondamentale, et fa prend des bémols bien que son nom n'en porte pas — mais une
   * déduction la rendrait fragile le jour où une clé changerait de nom. Douze lignes se lisent.
   */
  alteration: Alteration;
}

/**
 * Les douze clés, dans l'ordre chromatique depuis do.
 *
 * L'ORTHOGRAPHE RETENUE EST CELLE DU MUSICIEN : mi bémol et si bémol, non ré dièse et la dièse.
 * Ce sont les noms sous lesquels ces tonalités s'écrivent, et c'est déjà celle de six composants.
 * `DEMI_TONS_CLE` accepte les deux, donc rien en aval n'en dépend.
 */
export const CLES: readonly Cle[] = [
  { demiTon: 0, fr: "Do", en: "C", alteration: "diese" },
  { demiTon: 1, fr: "Do♯", en: "C#", alteration: "diese" },
  { demiTon: 2, fr: "Ré", en: "D", alteration: "diese" },
  { demiTon: 3, fr: "Mi♭", en: "Eb", alteration: "bemol" },
  { demiTon: 4, fr: "Mi", en: "E", alteration: "diese" },
  // FA EST LA SEULE DONT LE NOM NE DIT PAS L'ALTÉRATION : fa majeur porte un si bémol.
  { demiTon: 5, fr: "Fa", en: "F", alteration: "bemol" },
  { demiTon: 6, fr: "Fa♯", en: "F#", alteration: "diese" },
  { demiTon: 7, fr: "Sol", en: "G", alteration: "diese" },
  { demiTon: 8, fr: "Sol♯", en: "G#", alteration: "diese" },
  { demiTon: 9, fr: "La", en: "A", alteration: "diese" },
  { demiTon: 10, fr: "Si♭", en: "Bb", alteration: "bemol" },
  { demiTon: 11, fr: "Si", en: "B", alteration: "diese" },
];

/**
 * L'altération d'une fondamentale donnée en demi-tons.
 *
 * LA RÈGLE, DITE UNE FOIS : un agrégat s'écrit dans la graphie de sa propre fondamentale. Un accord
 * de mi bémol s'écrit donc en bémols, un accord de fa dièse en dièses. Ce n'est pas la théorie
 * complète de l'écriture des altérations, qui demanderait de connaître le mode et la fonction ;
 * c'est la règle qui rend une tonalité bémolisée lisible, et elle suffit à ce que le dépôt affiche.
 */
export const alterationDe = (demiTon: number): Alteration =>
  (CLES[((Math.round(demiTon) % 12) + 12) % 12] ?? CLES[0]).alteration;

/**
 * Tout ce qu'un projet enregistré peut porter à la place d'une clé, et ce que cela désigne.
 *
 * TROIS SOURCES S'Y MÊLENT. Les libellés anglais employés comme libellés FRANÇAIS par dix-sept
 * composants, qui n'avaient pas de traduction ; le croisillon `#` là où le dépôt écrit `♯` ; et
 * les deux orthographes enharmoniques, `D#` pour mi bémol et `A#` pour si bémol.
 *
 * ELLES SONT DÉCLARÉES ET NON DEVINÉES : une correspondance calculée se tromperait le jour où une
 * clé changerait de nom, et personne ne le verrait.
 */
const HERITAGES: Record<string, string> = {};
for (const c of CLES) {
  // Le nom français tel que la table l'écrit, avec ses signes typographiques.
  HERITAGES[c.fr] = c.en;
  // Et sa variante au croisillon et au bémol ASCII, employée par six composants.
  HERITAGES[c.fr.replace("♯", "#").replace("♭", "b")] = c.en;
  // Les noms anglais employés comme libellés français par les composants qui ne traduisaient pas.
  HERITAGES[c.en] = c.en;
}
// Les deux enharmonies, seules orthographes que les libellés ne donnent pas.
HERITAGES["D#"] = "Eb";
HERITAGES["A#"] = "Bb";
HERITAGES["Ré♯"] = "Eb";
HERITAGES["Ré#"] = "Eb";
HERITAGES["La♯"] = "Bb";
HERITAGES["La#"] = "Bb";
// UNE CINQUIÈME ORTHOGRAPHE, trouvée en migrant : des identifiants en minuscules avec le bémol
// typographique, « e♭ » et « b♭ ». Ni `DEMI_TONS_CLE` ni le premier garde ne les voyaient, et ce
// réglage restait donc invisible au relevé des clés tout en étant enregistré dans les projets.
for (const [ancien, en] of Object.entries({ ...HERITAGES })) {
  const bas = ancien.toLowerCase();
  HERITAGES[bas] = en;
  // LE BÉMOL SE REMPLACE EN FIN DE NOM SEULEMENT. Un remplacement global ferait de « Bb » un
  // « ♭b », et surtout de « B » un « ♭ » : un signe seul y désignerait une note.
  if (bas.length > 1 && bas.endsWith("b")) HERITAGES[`${bas.slice(0, -1)}♭`] = en;
}

export const CLES_HERITEES: Readonly<Record<string, string>> = HERITAGES;

/**
 * Les mêmes orthographes, mais désignant le DEMI-TON et non le nom.
 *
 * IL EN FAUT DEUX, ET C'EST LA FAUTE QUE J'AI FAITE EN ÉCRIVANT CE FICHIER. `valeurCanoniqueChoix`
 * n'accepte un héritage QUE s'il figure dans les `optionIds` du réglage : une table qui rend « Eb »
 * ne peut pas servir à un réglage dont les identifiants sont « 0 » à « 11 », elle tomberait dans le
 * vide sans rien dire.
 */
export const TONIQUES_HERITEES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(HERITAGES).map(([ancien, en]) => [
    ancien, String(CLES.find((c) => c.en === en)!.demiTon),
  ]),
);

/** Le demi-ton d'une clé nommée, l'orthographe d'avant comprise. */
export function demiTonDeCle(valeur: string): number | undefined {
  const en = CLES_HERITEES[valeur] ?? valeur;
  return CLES.find((c) => c.en === en)?.demiTon;
}

/**
 * Le réglage tout fait qui offre les douze clés PAR LEUR NOM.
 *
 * Un composant écrit `{ ...PARAMETRE_CLE, doc: "…" }` pour en changer la documentation, comme il le
 * fait déjà pour `PARAMETRE_SYNTHESE`. Ce qu'il ne fait pas, c'est recopier les douze noms.
 */
export const PARAMETRE_CLE: ParametreDef = {
  nom: "Clé",
  nomEn: "Key",
  type: "choix",
  options: CLES.map((c) => c.fr),
  optionsEn: CLES.map((c) => c.en),
  optionIds: CLES.map((c) => c.en),
  optionsHeritees: CLES_HERITEES,
  defaut: CLES[0].fr,
  defautEn: CLES[0].en,
  doc: "La tonalité. Elle déplace tout sans changer les écarts entre les degrés.",
  docEn: "The key. It moves everything without changing the gaps between degrees.",
};

/**
 * Le réglage tout fait qui offre les douze clés PAR LEUR DEMI-TON.
 *
 * POUR CEUX QUI COMPTENT PLUTÔT QUE DE NOMMER. Un composant qui pose une fondamentale et ajoute des
 * intervalles veut un nombre : lui donner un nom l'obligerait à le traduire à chaque lecture, et
 * c'est une traduction de plus à tenir juste.
 */
export const PARAMETRE_TONIQUE: ParametreDef = {
  ...PARAMETRE_CLE,
  nom: "Tonique",
  nomEn: "Tonic",
  optionIds: CLES.map((c) => String(c.demiTon)),
  optionsHeritees: TONIQUES_HERITEES,
  defaut: CLES[0].fr,
  defautEn: CLES[0].en,
  doc: "La tonique, comptée en demi-tons depuis do. Elle déplace tout sans changer les écarts.",
  docEn: "The tonic, counted in semitones from C. It moves everything without changing the gaps.",
};
