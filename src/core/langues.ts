// core/langues.ts — Les noms de langue, à un seul endroit.
//
// SIX TABLES LES ÉCRIVAIENT À LA MAIN, et le relevé des 503 composants a compté six formes du
// concept « langue » sur huit réglages. La divergence des LISTES est légitime, et c'est ce qui rend
// ce cas différent des autres : chaque composant est borné par les langues que SON modèle tient, et
// chacun l'écrit en commentaire à côté de sa liste. Ce qui ne l'est pas, c'est que les NOMS soient
// recopiés six fois : ajouter une langue demande alors de l'orthographier à l'identique dans six
// endroits, et une orthographe peut y dériver sans que rien ne le dise.
//
// LES IDENTIFIANTS SONT CEUX D'ISO 639, deux lettres quand elles existent et trois sinon, parce que
// c'est ce que les moteurs attendent sur leur ligne de commande et ce que les projets ont déjà
// enregistré. Les libellés, eux, se sont trouvés identiques partout où deux tables se recoupaient :
// cette table ne fait que les réunir, sans en changer un seul.

/** Une langue : son identifiant, et son nom dans les deux langues de l'interface. */
export interface Langue {
  id: string;
  fr: string;
  en: string;
}

/**
 * L'identifiant de la langue choisie seule par le moteur.
 *
 * LA CHAÎNE VIDE EST LA CONVENTION DU DÉPÔT pour « le moteur décide » : c'est elle qu'un réglage
 * enregistre, et c'est elle que les ponts savent ne pas passer sur la ligne de commande.
 */
export const LANGUE_AUTO = "";

/** Les langues que le dépôt sait nommer, dans l'ordre où elles se présentent le plus souvent. */
export const LANGUES: readonly Langue[] = [
  { id: LANGUE_AUTO, fr: "Automatique", en: "Automatic" },
  { id: "fr", fr: "Français", en: "French" },
  { id: "en", fr: "Anglais", en: "English" },
  { id: "es", fr: "Espagnol", en: "Spanish" },
  { id: "de", fr: "Allemand", en: "German" },
  { id: "it", fr: "Italien", en: "Italian" },
  { id: "pt", fr: "Portugais", en: "Portuguese" },
  { id: "nl", fr: "Néerlandais", en: "Dutch" },
  { id: "ro", fr: "Roumain", en: "Romanian" },
  { id: "ru", fr: "Russe", en: "Russian" },
  { id: "ja", fr: "Japonais", en: "Japanese" },
  { id: "zh", fr: "Chinois", en: "Chinese" },
  { id: "yue", fr: "Cantonais", en: "Cantonese" },
  { id: "ko", fr: "Coréen", en: "Korean" },
  { id: "ar", fr: "Arabe", en: "Arabic" },
  { id: "hi", fr: "Hindi", en: "Hindi" },
];

const PAR_ID = new Map(LANGUES.map((l) => [l.id, l]));
const PAR_LIBELLE = new Map(
  LANGUES.flatMap((l) => [[l.fr.toLowerCase(), l], [l.en.toLowerCase(), l]] as [string, Langue][]),
);

/**
 * La langue d'une valeur enregistrée, ou `undefined`.
 *
 * ELLE ACCEPTE L'IDENTIFIANT ET LES DEUX LIBELLÉS, parce qu'un composant qui n'a pas d'`optionIds`
 * enregistre son libellé : c'était le cas de la reconnaissance Sherpa, dont la table était écrite à
 * l'envers, du nom vers le code.
 */
export function langue(valeur: string): Langue | undefined {
  const v = String(valeur ?? "").trim();
  return PAR_ID.get(v) ?? PAR_LIBELLE.get(v.toLowerCase());
}

/** L'identifiant canonique d'une valeur enregistrée, ou la langue automatique si elle est inconnue. */
export function codeLangue(valeur: string): string {
  return langue(valeur)?.id ?? LANGUE_AUTO;
}

/** Le nom d'une langue, dans la langue demandée, ou la valeur telle quelle si elle est inconnue. */
export function libelleLangue(valeur: string, en = false): string {
  const l = langue(valeur);
  return l ? (en ? l.en : l.fr) : valeur;
}

/**
 * Le réglage d'un composant, pour les langues que SON moteur tient, dans l'ordre demandé.
 *
 * L'ORDRE EST CELUI DU COMPOSANT, parce qu'il décide du défaut affiché et qu'il s'enregistre quand
 * le composant n'a pas d'`optionIds`. Un identifiant que cette table ne connaît pas fait échouer la
 * construction du réglage au chargement, plutôt que d'offrir une option sans nom.
 */
export function choixLangues(ids: readonly string[]): {
  options: string[]; optionsEn: string[]; optionIds: string[]; optionsHeritees: Record<string, string>;
} {
  const retenues = ids.map((id) => {
    const l = PAR_ID.get(id);
    if (!l) throw new Error(`langue inconnue : « ${id} »`);
    return l;
  });
  return {
    options: retenues.map((l) => l.fr),
    optionsEn: retenues.map((l) => l.en),
    optionIds: retenues.map((l) => l.id),
    optionsHeritees: LIBELLES_HERITES_LANGUES,
  };
}

/**
 * Les libellés que ces listes ont portés avant cette table, et ce qu'ils désignaient.
 *
 * « AUTO » ÉTAIT LE SEUL NOM QUI CHANGE : la reconnaissance Sherpa l'écrivait ainsi, là où les
 * composants plus récents écrivent « Automatique ». Les autres libellés étaient déjà identiques
 * partout, ce que le garde de cette table tient.
 */
export const LIBELLES_HERITES_LANGUES: Record<string, string> = {
  Auto: LANGUE_AUTO,
  auto: LANGUE_AUTO,
};
