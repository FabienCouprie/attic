// core/saisies.ts — Ce que la personne pose sur un nœud, déclaré une fois.
//
// POURQUOI CE MODULE EXISTE, demandé par Fabien après le constat qu'une petite modification oblige à
// revoir les composants un à un. Les mêmes noms de champ étaient énumérés à la main dans huit
// endroits, chacun avec un sous-ensemble différent : ce qu'une remise à zéro protège, ce qu'un
// copier-coller emporte, ce qu'un projet enregistre, ce qu'une session reprend, ce qu'un
// méta-composant transporte, ce qu'un export signale comme perdu. Huit énumérations du même savoir
// ne restent pas d'accord, et elles ne l'étaient plus.
//
// CE QUE LA DIVERGENCE AVAIT LAISSÉ DEHORS, et que cette table remet dedans : le chemin d'un fichier
// SFZ et son nom, la mélodie jouée au clavier d'un nœud, le nom du fichier d'origine, le patch Pure
// Data chargé. Tous étaient enregistrés dans le projet et relus à l'ouverture, mais aucun ne
// figurait parmi les saisies : **un nœud copié les perdait en silence**. Le patch Pure Data, lui,
// n'était nommé que dans la liste des fichiers rechargeables, et nulle part ailleurs.
//
// LA TABLE EST PAR GENRE, ET NON PAR COMPOSANT. Un genre de saisie décrit une matière que l'on pose
// sur un nœud : un son, un fichier MIDI, une image, un patch. Les listes se dérivent de là, et un
// genre nouveau se déclare une fois au lieu d'être ajouté à huit endroits.

/** Ce qu'un genre de saisie pose sur un nœud, et ce qu'il advient de chaque champ. */
export interface GenreDeSaisie {
  /** Tous les champs que ce genre pose. */
  champs: readonly string[];
  /**
   * Ce qui se réécrit dans le projet.
   *
   * Le reste ne survit pas à `JSON.stringify` : un `File`, un `Blob`, une URL d'objet. C'est
   * `core/pertes.ts` qui le dit à la personne plutôt que de le perdre en silence.
   */
  conserves: readonly string[];
  /** Le champ que l'ouverture sait refabriquer depuis ce qui a été conservé. */
  rechargeable?: string;
  /**
   * Vrai quand c'est un média chargé sur CE nœud.
   *
   * Un média est gardé par une remise à zéro, et n'est PAS dupliqué par un copier-coller : un nœud
   * collé doit arriver vierge et recevoir son propre fichier, plutôt que d'en recopier un de cent
   * mégaoctets. Une saisie légère, elle, suit la copie : perdre la mélodie jouée au clavier en
   * copiant le nœud qui la porte n'a aucun sens.
   */
  mediaLocal: boolean;
}

/**
 * Ce que tout nœud porte, quelle que soit sa fiche.
 *
 * `bulle` ET `bulleOuverte` N'EN SONT PAS, et c'est délibéré. Ils disent à quelle bulle un nœud
 * appartient, donc une structure du graphe et non une saisie posée sur ce nœud : les recopier à un
 * collage ferait arriver le nœud dans une bulle qui n'existe peut-être pas. Ils sont enregistrés par
 * la persistance, qui les traite comme ce qu'ils sont.
 */
export const SAISIES_UNIVERSELLES = {
  champs: ["ficheId", "nom", "nomEn", "parametres", "zonesSelectionnees", "nomFichier", "couleur"],
  conserves: ["ficheId", "nom", "nomEn", "parametres", "zonesSelectionnees", "nomFichier", "couleur"],
} as const;

/** Les matières qu'on pose sur un nœud, chacune déclarée une fois. */
export const GENRES_DE_SAISIE: Readonly<Record<string, GenreDeSaisie>> = {
  audio: {
    champs: ["audioFichier", "audioNom", "audioUrl", "audioChemin"],
    conserves: ["audioNom"], rechargeable: "audioFichier", mediaLocal: true,
  },
  midi: {
    champs: ["midiFichier", "midiNom", "midiUrl"],
    conserves: ["midiNom"], rechargeable: "midiFichier", mediaLocal: true,
  },
  image: {
    champs: ["imageFichier", "imageNom", "imageUrl"],
    conserves: ["imageNom"], rechargeable: "imageFichier", mediaLocal: true,
  },
  svg: {
    champs: ["svgFichier", "svgNom", "svgUrl"],
    conserves: ["svgNom"], rechargeable: "svgFichier", mediaLocal: true,
  },
  pdf: {
    champs: ["pdfFichier", "pdfNom"], conserves: [], mediaLocal: true,
  },
  reponseImpulsionnelle: {
    champs: ["irFichier", "irNom"], conserves: [], rechargeable: "irFichier", mediaLocal: true,
  },
  enregistrement: {
    champs: ["enregistrementBlob", "enregistrementUrl"],
    conserves: [], rechargeable: "enregistrementBlob", mediaLocal: true,
  },
  modele: {
    champs: ["modeleFichier"], conserves: [], mediaLocal: true,
  },
  pureData: {
    champs: ["pureDataFichier"], conserves: [], rechargeable: "pureDataFichier", mediaLocal: true,
  },
  // UN CHEMIN DE DISQUE, DONC SÉRIALISABLE ET LÉGER : il s'enregistre tel quel et suit une copie.
  sfz: {
    champs: ["sfzChemin", "sfzNom"], conserves: ["sfzChemin", "sfzNom"], mediaLocal: false,
  },
  // CE QUI A ÉTÉ JOUÉ AU CLAVIER D'UN NŒUD : un tableau de notes, léger et sérialisable.
  clavier: {
    champs: ["sequenceNotes"], conserves: ["sequenceNotes"], mediaLocal: false,
  },
  // CE QU'ON A DÉCOUPÉ SUR LA LIGNE DE TEMPS D'UN MONTAGE, et les pistes qu'on y a vidées. Deux
  // tableaux légers et sérialisables, du même genre que la mélodie du clavier : ce que la personne a
  // posé sur ce nœud. Ils n'y figuraient pas, et c'est pourquoi un montage découpé revenait intact
  // de sa sauvegarde. Les pistes vidées sont déclarées à part des morceaux parce qu'une piste sans
  // morceau ne peut pas se dire par un morceau.
  montage: {
    champs: ["morceaux", "pistesVidees"], conserves: ["morceaux", "pistesVidees"], mediaLocal: false,
  },
};

const tous = Object.values(GENRES_DE_SAISIE);
const unir = (listes: readonly (readonly string[])[]) => new Set(listes.flat());

/** Tout ce que la personne pose sur un nœud : rien de cela ne s'efface jamais tout seul. */
export const CHAMPS_DE_SAISIE: ReadonlySet<string> =
  unir([SAISIES_UNIVERSELLES.champs, ...tous.map((g) => g.champs)]);

/** Les médias chargés sur ce nœud : gardés par une remise à zéro, non dupliqués par une copie. */
export const CHAMPS_MEDIA: ReadonlySet<string> =
  unir(tous.filter((g) => g.mediaLocal).map((g) => g.champs));

/** Ce qu'un projet enregistré réécrit ; le reste ne survit pas à JSON. */
export const CHAMPS_ENREGISTRES: ReadonlySet<string> =
  unir([SAISIES_UNIVERSELLES.conserves, ...tous.map((g) => g.conserves)]);

/** Les fichiers que l'ouverture refabrique depuis ce qui a été conservé. */
export const CHAMPS_RECHARGEABLES: ReadonlySet<string> =
  new Set(tous.map((g) => g.rechargeable).filter((c): c is string => !!c));
