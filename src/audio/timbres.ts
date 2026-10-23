// audio/timbres.ts — Normalisation des paramètres « Timbre ».
//
// Ces paramètres ont longtemps eu pour seule identité leur libellé français
// (« Sinus », « Douce »…), comparé tel quel dans la couche audio. Depuis
// l'ajout des `optionIds`, `paramTexte` renvoie un id stable — mais les projets
// déjà enregistrés contiennent encore les anciens libellés FR ou EN. Ces deux
// fonctions acceptent les trois formes et renvoient l'id canonique, ou
// `undefined` si la valeur est inconnue : c'est à l'appelant de choisir son
// repli, car il diffère d'un nœud à l'autre (triangle ici, sine là).

export type FormeOndeId = "sine" | "square" | "sawtooth" | "triangle";

const FORMES_ONDE: Record<string, FormeOndeId> = {
  // ids canoniques (= valeurs OscillatorType du Web Audio, et mêmes ids que
  // le paramètre « Forme » de l'Oscillateur, déjà migré)
  sine: "sine", square: "square", sawtooth: "sawtooth", triangle: "triangle",
  // anciens libellés français
  sinus: "sine", "carré": "square", carre: "square", scie: "sawtooth",
  "dent de scie": "sawtooth", "dents de scie": "sawtooth", "dents-de-scie": "sawtooth",
  // ancien libellé anglais spécifique (les autres coïncident avec les ids)
  saw: "sawtooth",
};

/**
 * Les quatre formes d'onde offertes, dans l'ordre, avec leurs libellés.
 *
 * ONZE COMPOSANTS LES OFFRAIENT ET CINQ ORTHOGRAPHES COEXISTAIENT : l'identifiant `saw` chez l'un
 * et `sawtooth` chez les autres, le même jeu dans un ORDRE différent chez un troisième, les
 * libellés français capitalisés EN GUISE D'IDENTIFIANTS chez un quatrième — dont « Sawtooth », non
 * traduit, offert en français — et `sinus/carre/dents-de-scie` chez un cinquième, inconnus de la
 * table d'alias ci-dessus. Un composant montrait même ses libellés anglais à un lecteur français.
 *
 * LES LIBELLÉS SONT ICI AUTANT QUE LES IDENTIFIANTS, parce qu'un libellé se voit, et qu'il
 * s'enregistre aussi dès qu'un composant n'a pas d'`optionIds`. Le français de `sawtooth` est
 * « Dent de scie », au singulier comme l'outil.
 *
 * ELLE NE REMPLACE PAS LA TABLE D'ALIAS, qui reconnaît une valeur venue d'un projet ; celle-ci dit
 * ce qui est OFFERT, et dans quel ordre.
 */
export const FORMES_ONDE_CHOIX: { ids: FormeOndeId[]; fr: string[]; en: string[] } = {
  ids: ["sine", "square", "sawtooth", "triangle"],
  fr: ["Sinus", "Carré", "Dent de scie", "Triangle"],
  en: ["Sine", "Square", "Sawtooth", "Triangle"],
};

/**
 * Les libellés que les listes de formes d'onde ont portés avant cette table.
 *
 * Déclarés plutôt que devinés, pour qu'un projet enregistré retrouve sa forme. La tolérance de
 * casse du moteur de choix ne suffit pas ici : « Scie » n'est pas « Dent de scie » à une majuscule
 * près, et « dents-de-scie » non plus.
 */
export const LIBELLES_HERITES_FORMES: Record<string, string> = {
  // Le libellé court, français et anglais, de quatre composants.
  "Scie": "sawtooth", "Saw": "sawtooth", "saw": "sawtooth",
  // Les libellés français capitalisés qui servaient d'identifiants au trémolo.
  "Sinus": "sine", "Carré": "square", "Triangle": "triangle", "Sawtooth": "sawtooth",
  // Le vocabulaire propre du générateur à pulsars.
  "sinus": "sine", "carre": "square", "dents-de-scie": "sawtooth", "Dents de scie": "sawtooth",
};

export function formeOndeDepuisTimbre(valeur: string): FormeOndeId | undefined {
  return FORMES_ONDE[String(valeur).trim().toLowerCase()];
}

export type CaractereTimbreId = "douce" | "brillante" | "percutante";

const CARACTERES: Record<string, CaractereTimbreId> = {
  douce: "douce", brillante: "brillante", percutante: "percutante",
  soft: "douce", bright: "brillante", percussive: "percutante",
};

export function caractereTimbre(valeur: string): CaractereTimbreId {
  return CARACTERES[String(valeur).trim().toLowerCase()] ?? "douce";
}

/**
 * Le caractère d'un timbre de synthèse locale, le sinus pur compris.
 *
 * POURQUOI UNE SECONDE FONCTION, ET NON UNE QUATRIÈME ENTRÉE DANS LA PREMIÈRE. `caractereTimbre`
 * rend un `CaractereTimbreId`, c'est-à-dire l'un des trois caractères qui MODULENT, et plusieurs
 * appelants s'appuient sur ce type. Le sinus pur n'en est pas un : il ne module rien, il ne rend
 * que la hauteur demandée, et le moteur de rendu le traite à part depuis toujours.
 *
 * ET LE REPLI SILENCIEUX ÉTAIT LE DÉFAUT. Deux composants passaient leur réglage par
 * `caractereTimbre` avant de le donner au moteur, qui accepte pourtant « pur » : la valeur tombait
 * donc sur « douce » sans que rien ne le dise. Ils ne pouvaient pas offrir le sinus, non par une
 * borne de leur moteur, mais par le type de la fonction qu'ils appelaient.
 */
export function caractereOuSinus(valeur: string): CaractereTimbreId | "pur" {
  const v = String(valeur).trim().toLowerCase();
  if (v === "pur" || v === "sinus" || v === "sine") return "pur";
  return CARACTERES[v] ?? "douce";
}

/**
 * Les caractères de timbre offerts par la synthèse locale, avec leurs libellés.
 *
 * LE SINUS PUR EST EN TÊTE, comme dans le composant qui l'offrait déjà seul, et c'est son ordre qui
 * est reprise ici pour que les trois listes n'en fassent qu'une.
 */
export const CARACTERES_CHOIX: { ids: (CaractereTimbreId | "pur")[]; fr: string[]; en: string[] } = {
  ids: ["pur", "douce", "brillante", "percutante"],
  fr: ["Sinus", "Douce", "Brillante", "Percutante"],
  en: ["Sine", "Soft", "Bright", "Percussive"],
};

/** Le libellé d'un caractère, dans la langue demandée, ou la valeur telle quelle si elle est inconnue. */
export function libelleCaractere(valeur: string, en = false): string {
  const rang = CARACTERES_CHOIX.ids.indexOf(caractereOuSinus(valeur));
  if (rang < 0) return valeur;
  return en ? CARACTERES_CHOIX.en[rang] : CARACTERES_CHOIX.fr[rang];
}

/**
 * Les trois caractères qui MODULENT, sans le sinus pur.
 *
 * POUR UN MOTEUR QUI N'A PAS DE BRANCHE SINUSOÏDALE. La musique fractale associe chaque caractère à
 * un type d'oscillateur, triangle, dent de scie ou carré, et n'en a pas pour une sinusoïde : lui
 * offrir le sinus rendrait un triangle, c'est-à-dire le défaut, sans que rien ne le dise. Le
 * sous-ensemble est DÉRIVÉ de la table ci-dessus et non réécrit, de sorte qu'un caractère ajoutée
 * là arrive ici.
 */
export const CARACTERES_MODULANTS: { ids: CaractereTimbreId[]; fr: string[]; en: string[] } = {
  ids: CARACTERES_CHOIX.ids.filter((x): x is CaractereTimbreId => x !== "pur"),
  fr: CARACTERES_CHOIX.fr.filter((_, i) => CARACTERES_CHOIX.ids[i] !== "pur"),
  en: CARACTERES_CHOIX.en.filter((_, i) => CARACTERES_CHOIX.ids[i] !== "pur"),
};
