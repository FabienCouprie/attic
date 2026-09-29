// core/cycle-de-vie.ts — Ce que les transitions d'un nœud font de son état.
//
// POURQUOI CE MODULE EXISTE. Ces décisions vivaient dans `ui/hooks/useExecutionGraphe.ts`, mille
// trois cents lignes de React que rien n'exerce : le seul test du moteur emploie « une réplique
// minimale de useExecutionGraphe sans React », c'est-à-dire qu'il teste une copie. Les règles qui
// gouvernent les quatre cent quarante-huit composants n'étaient donc vérifiées nulle part, et chaque
// défaut de ce domaine a été trouvé à l'usage plutôt que par la suite. Le dépôt sépare partout
// ailleurs la règle du crochet qui l'applique, `axe-temps.ts` face à `useAxeTemps.ts`,
// `lecture-vive.ts` face à `useLectureVive.ts` ; le moteur, qui est la pièce la plus partagée, ne
// l'avait jamais été.
//
// LES CLASSES ARRIVENT EN ARGUMENT, elles ne sont pas déclarées ici. Elles vivent avec le moteur qui
// les applique ; ce module dit ce qu'on en fait, pas ce qu'elles contiennent. Un banc peut donc les
// lui donner telles quelles et éprouver les transitions sur les quatre cent quarante-huit fiches.
//
// TROIS TRANSITIONS, ET ELLES NE DIFFÈRENT QUE PAR CE QU'ELLES GARDENT. C'est écrit ainsi pour que
// la comparaison soit lisible : une remise à zéro n'épargne rien de ce qu'un run a produit, un
// réglage épargne ce que le run avait désigné de ses entrées, un copier-coller n'emporte que la
// saisie et laisse même le média local.

/** Les classes d'un champ posé sur un nœud, telles que le moteur les tient. */
export interface ClassesDeChamps {
  utilisateur: ReadonlySet<string>;
  resultat: ReadonlySet<string>;
  gardesAuReglage: ReadonlySet<string>;
  mediaLocal: ReadonlySet<string>;
}

/** Un état de nœud, réduit à ce qui nous intéresse ici : des champs et leurs valeurs. */
export type EtatNoeud = Record<string, unknown>;

/**
 * Les URL d'objet qu'une transition rend orphelines, et qu'il faut donc révoquer.
 *
 * ON REGARDE LA VALEUR, ET NON UNE LISTE DE NOMS. Quatre noms étaient énumérés à la main dans le
 * moteur, et quatre films produits ailleurs n'y figuraient pas : un blob par nœud et par run restait
 * en mémoire. Une valeur qui commence par `blob:` est une URL d'objet, quel que soit son champ.
 */
export function urlsARevoquer(etat: EtatNoeud, classes: ClassesDeChamps, garder?: ReadonlySet<string>): string[] {
  const urls: string[] = [];
  for (const champ of classes.resultat) {
    if (garder?.has(champ)) continue;
    const v = etat[champ];
    if (typeof v === "string" && v.startsWith("blob:")) urls.push(v);
  }
  return urls;
}

/**
 * Les deux canaux que l'EXÉCUTEUR déclare, et dont lui seul décide.
 *
 * POURQUOI ILS DOIVENT ÊTRE NOMMÉS À PART. Le moteur reporte sur le nœud vivant les champs préfixés
 * d'un blanc souligné qu'il trouve dans l'INSTANTANÉ pris au début du run : c'est ainsi qu'un
 * composant à affichage autonome fait voir ce qu'il a écrit. Ces deux clés-là, en revanche, ne
 * viennent jamais de l'instantané : elles viennent du retour de l'exécuteur, ou du cache quand
 * l'exécution a été sautée. Les reporter depuis l'instantané écrase ce que le run vient de produire
 * par ce qui était là AVANT lui.
 *
 * CE QUE CELA DONNAIT, MESURÉ. Une remise à zéro pose la clé avec la valeur `undefined` — elle
 * existe donc, et `Object.keys` la voit. Le run suivant produisait bien son affichage, le moteur le
 * posait, puis ce report le remplaçait par l'`undefined` de l'instantané : le cercle pulsant
 * revenait « Terminé », son son était là, et le dessin comme son lecteur avaient disparu. Sans
 * remise à zéro, la clé de l'instantané porte la valeur du run PRÉCÉDENT, et l'écran montre alors
 * une exécution qui n'est plus la bonne, sans que rien ne le dise.
 */
export const CANAUX_DECLARES: ReadonlySet<string> = new Set(["_affichage", "_designe"]);

/**
 * Les champs qu'un run reporte de son instantané vers le nœud vivant.
 *
 * Tout champ préfixé d'un blanc souligné, SAUF les canaux déclarés. Rend `null` quand il n'y a rien
 * à reporter, ce qui évite un rendu pour rien.
 */
export function champsAReporter(etat: EtatNoeud): EtatNoeud | null {
  let champs: EtatNoeud | null = null;
  for (const cle of Object.keys(etat)) {
    if (!cle.startsWith("_")) continue;
    if (CANAUX_DECLARES.has(cle)) continue;
    (champs ??= {})[cle] = etat[cle];
  }
  return champs;
}

/** Ce qu'une transition a tenté d'effacer alors que la personne l'avait saisi. */
export interface Effacement {
  etat: EtatNoeud;
  /** Vide quand tout va bien. Non vide, c'est un défaut du moteur, pas un cas à traiter. */
  saisiesSauvees: string[];
}

/**
 * Ce qu'il reste d'un nœud après une remise à zéro, ou après un changement de réglage.
 *
 * `garder` nomme ce que la transition épargne. Vide, c'est le bouton de remise à zéro : rien de ce
 * qu'un run a produit ne survit. Avec `gardesAuReglage`, c'est un réglage modifié : ce que le run
 * avait désigné de ses entrées reste, parce qu'un réglage ne touche pas à ce que le nœud a reçu.
 *
 * LE GARDE-FOU N'EST PAS UN CAS À TRAITER, C'EST UNE ALARME. Un champ de saisie qui se trouverait
 * aussi dans les résultats serait effacé par une remise à zéro, et la personne perdrait un fichier
 * chargé. Il est donc remis, et son nom rendu pour que l'appelant le dise.
 */
export function apresEffacement(
  etat: EtatNoeud, classes: ClassesDeChamps, garder?: ReadonlySet<string>,
): Effacement {
  const suite: EtatNoeud = { ...etat };
  for (const champ of classes.resultat) {
    if (!garder?.has(champ)) suite[champ] = undefined;
  }
  const saisiesSauvees: string[] = [];
  for (const champ of classes.utilisateur) {
    if (champ in suite && suite[champ] === undefined && etat[champ] !== undefined) {
      suite[champ] = etat[champ];
      saisiesSauvees.push(champ);
    }
  }
  return { etat: suite, saisiesSauvees };
}

/**
 * Ce qu'un copier-coller emporte d'un nœud.
 *
 * LA SAISIE, ET RIEN DE PLUS. Un résultat recopié ferait afficher à un nœud collé le son de
 * l'original avant même qu'il ait tourné. Le média local est exclu en plus : un nœud collé doit
 * arriver vierge et recevoir son propre fichier, plutôt que d'en dupliquer un de cent mégaoctets.
 */
export function apresCopie(etat: EtatNoeud, classes: ClassesDeChamps): EtatNoeud {
  const suite: EtatNoeud = {};
  for (const champ of Object.keys(etat)) {
    if (classes.utilisateur.has(champ) && !classes.mediaLocal.has(champ)) suite[champ] = etat[champ];
  }
  return suite;
}
