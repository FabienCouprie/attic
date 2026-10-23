// audio/valeurs-note.ts — Les valeurs de note, déclarées une fois.
//
// POURQUOI CE MODULE EXISTE, et ce que le relevé a trouvé. Onze réglages offrent une valeur de
// note, sous sept formes. Les sous-ensembles diffèrent légitimement, chaque composant ayant sa
// grille ; ce qui ne l'était pas, c'est que LE TRIOLET S'ÉCRIVE DE TROIS FAÇONS :
//
//   `1/8t` comme identifiant chez deux composants, `1/8 triplet` chez un troisième ;
//   « 1/8 de triolet » comme libellé français chez l'un, « 1/8 triplet » chez les deux autres.
//
// ET « TRIPLET » EST UN MOT ANGLAIS DANS UNE LISTE FRANÇAISE, ce qui était déjà le défaut d'une
// table de langues où « English » s'affichait en français. Le triolet se dit « de triolet » ;
// l'anglais garde « triplet », qui est son mot.
//
// L'ORDRE N'EST PAS CELUI DE LA TABLE, MAIS CELUI QUE LE COMPOSANT DEMANDE : la valeur d'un
// réglage enregistrée dans un projet se résout par la position, donc réordonner une liste ferait
// qu'un projet rouvert désignerait une autre valeur. Un composant garde sa suite.
//
// CE QUI N'EST PAS ICI : LE NOMBRE DE DIVISIONS. Il n'est pas une propriété de la valeur mais de
// ce qu'on divise : la quantification divise un TEMPS, le « beat repeat » divise une MESURE, et
// « 1/8 » n'y vaut pas le même compte. Chaque composant garde donc le sien, à côté de son calcul.

export interface ValeurNote {
  id: string;
  fr: string;
  en: string;
}

/** Les valeurs de note que le parc emploie, de la plus longue à la plus brève. */
export const VALEURS_NOTE: ValeurNote[] = [
  { id: "1/1", fr: "1/1", en: "1/1" },
  { id: "1/2", fr: "1/2", en: "1/2" },
  { id: "1/4", fr: "1/4", en: "1/4" },
  { id: "1/8", fr: "1/8", en: "1/8" },
  { id: "1/16", fr: "1/16", en: "1/16" },
  { id: "1/32", fr: "1/32", en: "1/32" },
  { id: "1/8t", fr: "1/8 de triolet", en: "1/8 triplet" },
  { id: "1/16t", fr: "1/16 de triolet", en: "1/16 triplet" },
];

const PAR_ID = new Map(VALEURS_NOTE.map((v) => [v.id, v]));

/** La valeur de note d'un identifiant, ou rien s'il n'en nomme aucune. */
export const valeurNote = (id: string): ValeurNote | undefined => PAR_ID.get(id);

/**
 * Les trois listes d'un réglage de valeur de note, dans l'ordre demandé.
 *
 * Un identifiant absent de la table jette, plutôt que de rendre une liste amputée en silence.
 */
export function choixValeurs(ids: readonly string[]): { options: string[]; optionsEn: string[]; optionIds: string[] } {
  const valeurs = ids.map((id) => {
    const v = PAR_ID.get(id);
    if (!v) throw new Error(`valeur de note inconnue : ${id}`);
    return v;
  });
  return {
    options: valeurs.map((v) => v.fr),
    optionsEn: valeurs.map((v) => v.en),
    optionIds: valeurs.map((v) => v.id),
  };
}

/**
 * Les écritures du triolet qu'un projet enregistré peut porter.
 *
 * DEUX COMPOSANTS L'ÉCRIVAIENT EN TOUTES LETTRES, l'un comme identifiant et l'autre comme libellé
 * français. Rien de cela ne se devine : c'est déclaré, pour qu'un projet retrouve sa grille.
 */
export const LIBELLES_HERITES_VALEURS: Record<string, string> = {
  "1/8 triplet": "1/8t",
  "1/16 triplet": "1/16t",
};
