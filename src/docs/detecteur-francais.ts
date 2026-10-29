// docs/detecteur-francais.ts — Ce qui, dans un texte destiné à l'anglais, trahit du français.
//
// UNE SEULE RÈGLE POUR TROIS RELEVÉS. Elle vivait dans `anglais-registre.test.ts`, qui lit le
// registre et le dictionnaire ; le balayage des messages d'exécution (`tests-e2e/messages-anglais
// .spec.ts`) et le garde des vues (`vues-anglais.test.ts`) en ont besoin aussi. Recopiée, une
// tolérance ajoutée d'un côté manquerait de l'autre, et l'un des trois crierait sur un nom propre
// que les deux autres laissent passer.
//
// La détection est triple :
//  1. toute lettre accentuée du français — d'une précision remarquable en
//     pratique, l'anglais technique de ces fiches n'en employant pas, hormis
//     quelques noms propres explicitement tolérés ;
//  2. une liste de mots français SANS accent, que ce relevé a effectivement
//     trouvés (« temps », « tous », « garder »…). Elle n'a pas à être complète :
//     elle grandit le jour où un mot passe à travers ;
//  3. un nombre écrit à la française, la virgule tenant lieu de point décimal.

/**
 * Noms propres : leur accent n'est pas du français. « Möbius » et « Rössler » s'écrivent
 * ainsi dans les deux langues ; « bembé », le rythme d'Afrique de l'Ouest, aussi — c'est
 * son nom, et l'écrire « bembe » en anglais ne serait pas une traduction. « de Cheveigné »,
 * auteur de YIN, relève du même cas : c'est ainsi qu'il signe ses articles en anglais.
 */
// La limite finale est une négation et non un `\b` : en JavaScript, « é » n'est pas un
// caractère de mot, si bien que `\bbembé\b` ne reconnaît pas « bembé, ».
//
// ET LA LIMITE INITIALE A DÛ LE DEVENIR AUSSI, pour la même raison prise par l'autre bout : le
// tréma de Möbius est au milieu, mais celui d'« Über » ouvre le mot. Entre une espace et un « Ü »,
// il n'y a AUCUNE frontière de mot, les deux n'étant pas des caractères de mot : `\büber` ne
// reconnaissait donc rien, et le titre de Cantor était relevé comme du français.
// ET LE TITRE D'UN ARTICLE CITÉ RELÈVE DU MÊME CAS. « Über unendliche, lineare
// Punktmannigfaltigkeiten » est le titre sous lequel l'article de Cantor de 1883 se cite dans
// toutes les langues : le traduire dans une notice anglaise le rendrait introuvable, ce qui est
// l'inverse de ce qu'une référence sert à faire.
// ET LES AUTEURS DE L'ABSORBEUR EN ARC-EN-CIEL RELÈVENT DU MÊME CAS QUE « de Cheveigné » : Noé
// Jiménez et Vicent Romero-García signent ainsi leurs articles en anglais, et retirer leurs accents
// ne serait pas une traduction mais une faute sur un nom.
// ET LE « TRAITÉ DES OBJETS MUSICAUX » RELÈVE DU MÊME CAS QUE LE TITRE DE CANTOR. L'ouvrage de
// Schaeffer de 1966 se cite sous son titre français dans la littérature anglophone, faute de
// traduction établie ; le franciser à moitié ou le traduire le rendrait introuvable.
// ET « HEIKKILÄ » RELÈVE DU MÊME CAS QUE « de Cheveigné » : Ville-Matias Heikkilä signe ainsi son
// article d'arXiv, en anglais, et retirer son tréma ne serait pas une traduction mais une faute sur
// un nom.
const TOLERES = /(?<![a-zà-ÿ])(?:möbius|rössler|bembé|cheveigné|välimäki|knöferle|über|noé|jiménez|garcía|françois|hörsamkeit|traité|heikkilä)(?![a-zà-ÿ])/gi;

/**
 * Une affectation de script, « gamme=majeur » : du code cité, que l'anglais recopie tel quel.
 *
 * Le langage du « Générateur musical » lit des clés et des valeurs françaises, et sa notice anglaise
 * montre une ligne que le composant accepte : la traduire la rendrait illisible pour lui. Relevé
 * quand « majeur » est entré dans la liste des mots, le 2026-10-29.
 */
const AFFECTATIONS = /(?<![a-zà-ÿ])[a-z_]+=[a-zà-ÿ0-9_-]+/gi;

const ACCENTS = /[àâäçéèêëîïôöùûüÿœæ]/i;

/**
 * Mots français sans accent relevés dans la projection anglaise. Volontairement
 * restreint aux mots dont AUCUN emploi anglais n'est plausible ici : « note »,
 * « mode », « plus », « son » sont anglais autant que français, les mettre
 * ferait crier le test sur des fiches correctes.
 */
// « GRAINE », « NEURONES », « MAJEUR » ET « MINEUR » SONT PASSÉS À TRAVERS LE 2026-10-29, dans le
// message de la Groove Box filmé pour la présentation anglaise : « C majeur · 15 neurones · graine
// 4242 ». Aucun ne porte d'accent, et aucun n'était dans la liste.
// « PLAGE », « AJOUTER » ET « UNE » LE MÊME JOUR, dans le texte en dur des vues : « Plage dyn.
// (LRA) » du VU-mètre, et « Ajouter une couleur ». C'est la faute plantée dans le garde des vues qui
// les a montrés, restée verte faute de ces trois mots.
// ET QUATORZE DE PLUS LE MÊME JOUR, que la liste laissait passer dans les messages d'exécution. Ils
// ont été trouvés en lançant les 510 fiches dans les deux langues : un message identique en anglais
// et en français, ou un mot resté le même au milieu d'un message traduit, est un message qui ne se
// traduit pas. « Branchez deux pistes audio », « 4 couleurs », « heuristique », « Tresillo cubain ».
// « Accords », « grille », « blanc » et « pistes » en ont été écartés : ils sont aussi anglais.
const MOTS_FR = /\b(?:ajouter|aucun|aucune|automatique|avec|basse|branchez|cellule|cellules|chaque|couleurs|croisement|cubain|dans|demi-ton|demi-tons|deux|dossier|droite|entre|formes|garder|gauche|graine|harmonie|heuristique|les|majeur|mesures|mineur|montant|neurones|niveau|niveaux|pas|perte|plage|pour|rythme|selon|sortie|sorties|temps|tous|toutes|tout|toute|trames|une|vers|violon|voix)\b/i;

/**
 * Un nombre écrit à la française : « 71,9 s », « 0,25 », « 8,0 × ».
 *
 * L'ANGLAIS MET AUSSI UNE VIRGULE ENTRE DEUX CHIFFRES, pour séparer les milliers : « 1,234 ». Elle
 * y est toujours suivie de trois chiffres, et jamais précédée d'un zéro seul. Ce qui n'a pas cette
 * forme est une virgule décimale ; ce qui l'a reste ambigu, et n'est pas relevé. Une suite de
 * plusieurs virgules (« 1,2,3 ») est une liste, et ne l'est pas davantage.
 *
 * ET UN COUPLE ENTRE PARENTHÈSES EST UNE NOTATION, celle des rythmes euclidiens : « E(3,8) » se
 * lit trois frappes sur huit pas, dans les deux langues. Relevé le 2026-10-29 sur le message de
 * « Rythme euclidien », que la règle prenait pour un nombre français.
 */
export function virguleDecimale(texte: string | undefined | null): boolean {
  const t = String(texte ?? "");
  for (const m of t.matchAll(/(?<![\d,.])(\d+),(\d+)(?![\d,])/g)) {
    const couple = t[m.index - 1] === "(" && t[m.index + m[0].length] === ")";
    if (!couple && (m[2].length !== 3 || m[1] === "0")) return true;
  }
  return false;
}

/** Ce qui, dans un texte destiné à l'anglais, trahit du français par ses mots. */
export function francais(texte: string | undefined | null): boolean {
  const t = String(texte ?? "").replace(TOLERES, "").replace(AFFECTATIONS, "");
  return ACCENTS.test(t) || MOTS_FR.test(t);
}
