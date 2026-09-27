// ui/exemples.ts — Les graphes d'exemple livrés avec l'application.
//
// POURQUOI ILS SONT COMPILÉS DANS L'APPLICATION, ET NON LUS SUR LE DISQUE. Demandé par Fabien : un
// exemple ne doit pas être modifiable, sauf à le recopier dans le dossier de travail où il le
// devient. Un drapeau « lecture seule » posé sur un fichier ouvert aurait demandé de le vérifier
// partout où l'on écrit, et il aurait suffi d'un chemin oublié pour qu'un exemple soit écrasé.
//
// ICI, IL N'Y A RIEN À VÉRIFIER : un exemple n'a pas de fichier. Le graphe vient du paquet, la
// session s'ouvre sans chemin courant, et les deux chemins d'écriture s'en accommodent d'eux-mêmes.
// La sauvegarde automatique s'abstient faute de fichier, et l'enregistrement manuel passe par le
// dialogue, qui propose le dossier de travail. Recopier pour modifier n'est donc pas une règle à
// faire respecter, c'est la seule chose qui puisse arriver.
//
// LE NOM VIENT DU FICHIER, et rien n'est à tenir à jour à côté : déposer un graphe dans `exemples/`
// suffit à le faire paraître dans la liste, sous un nom lisible.

const FICHIERS = import.meta.glob("/exemples/*.json", { eager: true, import: "default" }) as Record<string, unknown>;

export interface Exemple {
  /** Le nom du fichier, sans dossier ni extension. Sert de clé, et de nom au fichier recopié. */
  id: string;
  /** Ce qui s'affiche dans la liste, dans chaque langue. */
  nom: string;
  nomEn: string;
  /** Le graphe lui-même, tel qu'un import l'attend. */
  graphe: unknown;
}

/** Le titre d'un exemple dans la langue affichée. La liste ne peut pas rester française en anglais. */
export const nomDeLExemple = (ex: Exemple, lang: string): string =>
  (lang === "en" && ex.nomEn) || ex.nom;

/** « /exemples/un-effet-sur-un-passage.json » donne « un-effet-sur-un-passage ». */
export function identifiantDepuisChemin(chemin: string): string {
  return chemin.replace(/\\/g, "/").split("/").pop()!.replace(/\.json$/i, "");
}

/**
 * Le nom lisible d'un exemple, tiré de son identifiant.
 *
 * Les tirets deviennent des espaces et la première lettre est une majuscule : le nom de fichier est
 * déjà une phrase, il suffit de la rendre. Une table de noms tenue à côté aurait vieilli au premier
 * exemple ajouté.
 */
export function nomDepuisIdentifiant(id: string): string {
  const phrase = id.replace(/-+/g, " ").trim();
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/** Au-delà, ce n'est plus un titre mais une phrase, et la liste deviendrait illisible. */
const TITRE_MAX = 60;

/**
 * Le titre écrit en tête de la note du graphe, s'il y en a une.
 *
 * POURQUOI PAS SEULEMENT LE NOM DU FICHIER, relevé en regardant la liste et non le code : un nom de
 * fichier ne porte pas d'accents, et « Une reverberation qui deborde » s'affichait ainsi dans une
 * application française. La note, elle, les porte, et elle survit aux réenregistrements puisque
 * c'est un nœud du graphe, là où une clé ajoutée au fichier serait perdue à la première sauvegarde.
 *
 * LA PREMIÈRE LIGNE EST ÉCRITE EN CAPITALES dans les exemples livrés, parce qu'elle sert de titre
 * sur le canevas ; elle est ramenée à une capitale initiale pour la liste. Une note sans titre, une
 * première ligne trop longue, ou pas de note du tout : on retombe sur le nom du fichier, qui existe
 * toujours.
 */
export function titreDepuisNote(graphe: unknown, defaut: string, champ: "nom" | "nomEn" = "nom"): string {
  const noeuds = (graphe as { nodes?: { data?: { ficheId?: string; nom?: unknown; nomEn?: unknown } }[] })?.nodes;
  if (!Array.isArray(noeuds)) return defaut;
  const note = noeuds.find((n) => n?.data?.ficheId === "comment" && typeof n.data?.[champ] === "string");
  const premiere = String(note?.data?.[champ] ?? "").split("\n").map((l) => l.trim()).find((l) => l.length > 0);
  if (!premiere || premiere.length > TITRE_MAX) return defaut;
  const capitales = premiere === premiere.toLocaleUpperCase("fr");
  return capitales
    ? premiere.charAt(0) + premiere.slice(1).toLocaleLowerCase("fr")
    : premiere;
}

/** Un graphe se reconnaît à ses deux tableaux, comme partout ailleurs dans le dépôt. */
const estGraphe = (v: unknown): boolean =>
  !!v && typeof v === "object"
  && Array.isArray((v as { nodes?: unknown }).nodes)
  && Array.isArray((v as { edges?: unknown }).edges);

/** Les exemples livrés, par ordre alphabétique de nom. */
export const EXEMPLES: Exemple[] = Object.entries(FICHIERS)
  .filter(([, graphe]) => estGraphe(graphe))
  .map(([chemin, graphe]) => {
    const id = identifiantDepuisChemin(chemin);
    const nom = titreDepuisNote(graphe, nomDepuisIdentifiant(id));
    return { id, nom, nomEn: titreDepuisNote(graphe, nom, "nomEn"), graphe };
  })
  .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

/** Un exemple sous la forme qu'attend l'import : un fichier, mais qui n'est sur aucun disque. */
export function fichierDExemple(ex: Exemple): File {
  return new File([JSON.stringify(ex.graphe)], `${ex.id}.json`, { type: "application/json" });
}
