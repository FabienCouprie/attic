// ui/texte-bilingue.ts — Le texte d'une note ou d'un cadre, dans la langue affichée.
//
// POURQUOI CE FICHIER EXISTE, relevé par Fabien : les notes et les cadres n'étaient qu'en français.
// Ils ne portaient qu'un texte, et une application bilingue montrait donc du français à qui l'avait
// mise en anglais. Les graphes livrés en exemple en portent tous un, et c'est par eux qu'on
// comprend ce qu'ils montrent.
//
// UNE NOTE A DEUX VIES, ET LA RÈGLE DOIT SERVIR LES DEUX. Celle qu'un utilisateur écrit sur son
// canevas n'est pas à traduire : c'est son texte, dans sa langue, et lui en réclamer une seconde
// version serait absurde. Celle d'un exemple livré est une documentation, et doit suivre la langue
// de l'interface.
//
// LA RÈGLE TIENT EN UNE PHRASE : on modifie le texte qu'on lit. En anglais, le second texte s'il
// existe, sinon le premier ; en français, toujours le premier. Une note à un seul texte se comporte
// donc exactement comme avant, dans les deux langues, et jamais un volet ne reste vide parce que le
// texte a été écrit dans l'autre.

export interface DonneesTexte {
  nom?: unknown;
  nomEn?: unknown;
}

/** Le champ à lire, qui est aussi celui qu'on écrit : on modifie le texte qu'on a sous les yeux. */
export function champTexte(data: DonneesTexte | undefined, lang: string): "nom" | "nomEn" {
  return lang === "en" && typeof data?.nomEn === "string" ? "nomEn" : "nom";
}

/**
 * Les noms que l'application écrivait elle-même dans la donnée au moment de la création.
 *
 * C'ÉTAIT LA VRAIE CAUSE, relevée par Fabien : une note et un cadre naissaient avec « Ajouter une
 * note » et « Ajouter un cadre » POSÉS DANS LEUR DONNÉE, dans la langue du moment. Ce n'était donc
 * plus une invite que l'interface traduit, mais un texte, figé en français pour toujours. Un cadre
 * créé en français s'intitulait « Ajouter un cadre » en anglais, et rien ne pouvait plus le changer.
 *
 * La création ne pose plus rien. Ces quatre valeurs restent reconnues pour les graphes déjà
 * enregistrés, où elles sont écrites : les y voir, c'est voir un texte qui n'en était pas un. Le
 * texte stocké n'est pas effacé pour autant, il est seulement rendu comme l'invite qu'il aurait dû
 * rester, et la première frappe le remplace.
 */
const DEFAUTS_POSES = new Set([
  "Ajouter une note", "Add a note",
  "Ajouter un cadre", "Add frame",
]);

/** Le texte à afficher, jamais indéfini : un champ absent rend la chaîne vide. */
export function texteBilingue(data: DonneesTexte | undefined, lang: string): string {
  const v = data?.[champTexte(data, lang)];
  if (typeof v !== "string") return "";
  return DEFAUTS_POSES.has(v.trim()) ? "" : v;
}
