// core/hasard.ts — Aléatoire reproductible, à l'échelle du NŒUD.
//
// Un nœud qui tire au sort rend un résultat différent à chaque exécution, et le
// rendu qu'on voulait garder est perdu. La réponse retenue dans ce projet — et
// déjà en place sur une dizaine de nœuds — est un paramètre « Graine » posé sur
// le nœud, là où l'effet a lieu : il se règle dans l'inspecteur, se sauvegarde
// avec le workflow comme n'importe quel paramètre, et n'engage que ce nœud.
//
// Ce module ne fournit donc pas de graine « de projet » : il fournit le
// générateur, jusqu'ici recopié à l'identique dans random-slice, reservoir,
// textgen, generateur-paroles et galerie-exposition (deux fois).
//
// Générique par construction : aucune notion audio ici, seulement des nombres.

/**
 * mulberry32 — générateur à état 32 bits, une dizaine d'opérations par tirage.
 * Période 2^32, qualité largement suffisante pour du bruit, des perturbations
 * ou des choix pondérés ; ce n'est pas un générateur cryptographique.
 *
 * Bit à bit identique aux copies qu'il remplace (vérifié sur 10 000 tirages
 * pour cinq graines) : un projet portant déjà une graine rend le même son.
 */
export function creerAleatoire(graine: number): () => number {
  let etat = graine >>> 0;
  return function aleatoire() {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = Math.imul(etat ^ (etat >>> 15), 1 | etat);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Convention de graine d'un nœud, telle que la pratiquent déjà `carte-sonore`,
 * `galerie-exposition`, `textgen` ou `generateur-paroles` : le paramètre vaut
 * 0 (ou moins) tant que l'utilisateur n'a rien choisi, et le nœud tire alors
 * une graine au sort.
 *
 * La graine RETENUE est rendue avec le générateur, et non gardée pour soi :
 * c'est elle que le nœud doit afficher dans son message, faute de quoi un
 * rendu tiré au sort qu'on voudrait garder resterait introuvable — le
 * paramètre à 0 ne dit pas ce qui a été joué.
 *
 * Seul endroit du dispositif où `Math.random` est appelé volontairement,
 * puisqu'il s'agit précisément de tirer au sort. Graine bornée à six chiffres
 * pour rester lisible et recopiable à la main dans le champ du nœud.
 */
export function hasardDuNoeud(graineParam: number): { graine: number; aleatoire: () => number } {
  const graine = resoudreGraine(graineParam);
  return { graine, aleatoire: creerAleatoire(graine) };
}

/** La borne des graines tirées : six chiffres, pour rester lisible et recopiable à la main. */
export const GRAINE_MAX = 999999;

/**
 * Ce qu'une valeur de graine VEUT DIRE, en un seul endroit.
 *
 * POURQUOI CETTE FONCTION EXISTE SÉPARÉMENT. La convention était écrite dans `hasardDuNoeud`, donc
 * n'existait que pour les composants qui l'appellent : relevé, treize sur soixante-cinq. Les autres
 * lisaient leur paramètre et le passaient tel quel, si bien qu'une graine à zéro y était une graine
 * FIXE valant zéro — et rendait toujours la même chose, quand leur propre documentation annonçait
 * « 0 = nouvel ordre à chaque exécution ». Relevé par Fabien : « il y a un excès de décentralisation,
 * le fonctionnement sur les graines doit être homogène ».
 *
 * ELLE EST IDEMPOTENTE, et c'est ce qui permet de la poser au centre sans toucher aux composants :
 * une graine déjà résolue est strictement positive, donc se rend elle-même. Un composant qui appelle
 * encore `hasardDuNoeud` sur une valeur que le moteur a déjà résolue obtient donc la même.
 */
export function resoudreGraine(graineParam: number): number {
  return graineParam > 0 ? Math.floor(graineParam) : Math.floor(Math.random() * GRAINE_MAX) + 1;
}

/**
 * La graine d'un tour de boucle, dérivée de celle du nœud.
 *
 * POURQUOI MÉLANGER PLUTÔT QU'AJOUTER, et ce n'est PAS pour la raison qu'on croit. On dit souvent
 * que deux graines voisines donneraient des suites voisines ; mesuré sur `creerAleatoire`, c'est
 * faux — l'écart moyen entre les premiers tirages de trente-deux graines consécutives vaut 0,3368
 * quand des valeurs indépendantes en donnent 0,3333, et la corrélation de rang entre la graine et
 * son premier tirage vaut 0,11. Additionner aurait donc suffi de ce point de vue.
 *
 * LA VRAIE RAISON EST LA COLLISION ENTRE NŒUDS. En additionnant, le tour 1 d'un nœud de graine 42
 * et le tour 0 d'un nœud de graine 43 tomberaient tous deux sur 43 : deux composants différents
 * tireraient exactement la même suite, au même moment, dans la même boucle. C'est audible, et
 * d'autant plus que les graines à la main sont voisines — 1, 2, 3, 42, 43. Un brassage d'entier
 * disperse les bits des DEUX nombres, et ces rencontres cessent d'être systématiques. Celui-ci est
 * le mélangeur de splitmix64 ramené à trente-deux bits.
 *
 * ET C'EST UNE FONCTION, NON UN TIRAGE : la même graine et le même tour rendent toujours la même
 * chose. C'est ce qui garde la reproductibilité, qui est tout l'objet d'une graine.
 */
export function graineDuTour(graine: number, tour: number): number {
  let x = (Math.floor(graine) ^ Math.imul(tour + 1, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  return (x % GRAINE_MAX) + 1;
}
