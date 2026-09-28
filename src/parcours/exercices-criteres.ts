// parcours/exercices-criteres.ts — Les critères que plusieurs exercices réemploient.
//
// Écrits une fois : un exercice qui redéfinirait « un générateur de fréquence » à sa façon finirait
// par le nommer autrement dans la liste de contrôle, et l'élève croirait qu'on lui parle d'autre
// chose.
//
// POURQUOI DANS LEUR PROPRE MODULE. Les exercices tiennent maintenant dans deux fichiers, et les deux
// s'en servent. Les laisser dans l'un créerait un cycle à l'exécution : le premier importe la suite
// pour la concaténer, la suite importerait les critères du premier, et l'ordre d'évaluation des
// modules laisserait l'un des deux indéfini. La banque des notions vient de le montrer, avec une
// erreur nette, « notion is not a function ».

export const GENERATEUR = { fiches: ["generateur-frequence"], quoi: "un générateur de fréquence", quoiEn: "a Frequency Generator" };
export const GENERATEUR_LANCE = { ...GENERATEUR, rendu: true, quoi: "le générateur de fréquence", quoiEn: "the Frequency Generator" };
export const REGARD = { univers: "Visualisation", famille: "Analyse", rendu: true, quoi: "un composant de visualisation lancé", quoiEn: "a visualization node that has run" };
export const EFFET = { famille: "Effets", quoi: "un effet", quoiEn: "an effect" };
