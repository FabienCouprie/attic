// audio/note.ts — Une note, déclarée une fois.
//
// POURQUOI CE MODULE EXISTE. Le même enregistrement était déclaré dix-neuf fois sous dix-neuf noms,
// `NoteCanon`, `NoteJouee`, `NoteL`, `NoteMarkov`, `Frappe`, `NoteSimple`, et ainsi de suite, en
// trois orthographes : avec `canal` et sans, `velocite` bien écrit et la même en faute. TypeScript étant
// structurel, rien ne s'en plaignait : deux types de mêmes champs sont interchangeables, et la
// division ne se voit qu'au moment où l'on ajoute un champ quelque part et qu'il n'arrive jamais
// ailleurs.
//
// CE QUE CELA A COÛTÉ, MESURÉ. Renommer le champ du type canonique pour compter ses appelants n'a
// fait sortir que trente erreurs, quand `.note` est lu trois cent quarante-six fois : le type ne
// gouvernait pas le code. La faute d'orthographe y était pour beaucoup, puisqu'elle empêchait le
// type canonique de se confondre avec les dix-sept autres, qui écrivaient `velocite` correctement.
//
// AUCUN IMPORT ICI, ET C'EST VOULU. Le type vivait dans `midi.ts`, qui tire la SoundFont, les
// traductions et la bibliothèque MIDI derrière lui. Un module de types n'a rien à faire porter :
// `midi-ordre.ts` existe pour la même raison, afin que le worker Magenta ne tire pas `i18n`.
//
// `audio/formes-note.test.ts` lit les sources et refuse qu'une forme nouvelle paraisse sans
// décision, ou qu'une note soit redéclarée au lieu d'être aliasée.

/**
 * Une note, telle qu'elle circule dans le graphe.
 *
 * Les temps sont en secondes depuis le début, et non en tics : une note ne sait rien du tempo qui
 * l'a produite. La nuance va de zéro à cent vingt-sept, comme en MIDI.
 *
 * LA HAUTEUR EST UN DEMI-TON ENTIER PAR CONVENTION, ET RIEN NE L'IMPOSE. Le champ est un nombre :
 * une fraction y entre sans obstacle, et la conversion en fréquence comme la lecture d'un
 * échantillon la portent jusqu'au son. `audio/microtons.test.ts` sonde ce que chaque chemin en
 * fait, et tient les endroits qui arrondissent. Voir `COMPOSITION-ASSISTEE.md` pour ce que
 * coûterait le passage aux midicents, et pourquoi il se fera dans un type de flux séparé plutôt
 * qu'en changeant celui-ci.
 */
export interface Note {
  /** Le numéro de note MIDI, do central à 60. */
  note: number;
  /** La nuance, de 0 à 127. */
  velocite: number;
  /** Le début, en secondes. */
  debut: number;
  /** La fin, en secondes. */
  fin: number;
  /**
   * Le canal MIDI, de 0 à 15, le dix étant la batterie.
   *
   * FACULTATIF ICI, ET EXIGÉ PAR `NoteMidi`. Le canal n'a de sens qu'au bord, là où l'on écrit un
   * fichier ou l'on choisit un instrument ; une note qui circule entre deux traitements n'en a
   * pas. Les deux cas existaient déjà dans le dépôt, sept types l'exigeaient et cinq le laissaient
   * facultatif : le rendre facultatif ici réunit les douze sans rien casser, et `NoteMidi` reste
   * là pour les fonctions qui ne sauraient pas quoi faire d'une note sans canal.
   */
  canal?: number;
}

/** Une note dont le canal est connu : ce qui part vers un fichier MIDI ou un instrument. */
export interface NoteMidi extends Note {
  canal: number;
}

/** Une note réduite à sa place : ce que la théorie manipule quand la nuance ne l'intéresse pas. */
export type NotePlacee = Omit<Note, "velocite" | "canal">;
