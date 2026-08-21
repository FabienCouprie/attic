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
  const graine = graineParam > 0 ? Math.floor(graineParam) : Math.floor(Math.random() * 999999) + 1;
  return { graine, aleatoire: creerAleatoire(graine) };
}
