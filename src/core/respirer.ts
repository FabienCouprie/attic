// core/respirer.ts — Rendre la main à l'interface, et savoir quand il le faut.
//
// LE PROBLÈME, MESURÉ. Les nœuds s'exécutent dans le fil de l'interface. Un nœud qui calcule en
// JavaScript sans jamais rendre la main empêche toute image d'être rendue : pendant ce temps, aucun
// bouton ne répond, le statut des nœuds ne s'affiche pas, « Arrêter » ne s'atteint pas, et l'on ne
// voit même pas QUEL nœud travaille — l'affichage est resté sur l'état d'avant. Mesuré sur un
// graphe de cinq nœuds ordinaires : **1,4 seconde sans une seule image sur 1,6 seconde
// d'exécution**, soit 87 % du temps passé figé.
//
// CE QU'UNE PAUSE COÛTE, ET CE QU'ELLE RAPPORTE. `setTimeout(…, 0)` laisse le navigateur rendre une
// image avant de reprendre : environ un millième de seconde, à comparer aux centaines de
// millisecondes d'un gel. La règle est donc de respirer souvent plutôt que longtemps.
//
// POURQUOI UN MODULE, ET NON UN `await` posé au hasard. Parce que la décision — au bout de combien
// de temps faut-il rendre la main ? — mérite d'être écrite une fois, mesurable et vérifiable, au
// lieu d'être devinée à chaque boucle. `Respiration` retient QUAND elle a rendu la main pour la
// dernière fois : une boucle l'appelle à chaque tour, et elle ne cède qu'au-delà du délai.

/** Au-delà de ce délai sans rendre la main, l'interface est perçue comme figée. */
export const DELAI_RESPIRATION_MS = 50;

/** Rend la main au navigateur, le temps d'une image. */
export function respirer(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Le compteur d'une boucle : elle l'appelle à chaque tour, il ne cède que s'il le faut.
 *
 * ```ts
 * const souffle = new Respiration();
 * for (const image of images) {
 *   traiter(image);
 *   await souffle.tour();          // rend la main toutes les 50 ms, pas à chaque image
 * }
 * ```
 */
export class Respiration {
  private dernier: number;
  private readonly delai: number;
  private readonly maintenant: () => number;

  // Champs déclarés puis assignés, et non des propriétés de paramètre : le projet compile en
  // `erasableSyntaxOnly`, où `constructor(private x)` n'est pas permis — cette forme-là n'est pas
  // effaçable, elle engendre du code.
  constructor(delai = DELAI_RESPIRATION_MS, maintenant: () => number = () => Date.now()) {
    this.delai = delai;
    this.maintenant = maintenant;
    this.dernier = maintenant();
  }

  /** Faut-il rendre la main maintenant ? Sans effet de bord, pour être testable. */
  doitRespirer(): boolean {
    return this.maintenant() - this.dernier >= this.delai;
  }

  /** Un tour de boucle : rend la main si le délai est passé, et repart. */
  async tour(): Promise<boolean> {
    if (!this.doitRespirer()) return false;
    await respirer();
    this.dernier = this.maintenant();
    return true;
  }
}
