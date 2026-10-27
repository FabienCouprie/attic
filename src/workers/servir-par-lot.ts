// src/workers/servir-par-lot.ts — Le dialogue des workers qui traitent un LOT DE TÂCHES.
//
// POURQUOI UN SECOND DIALOGUE, à côté de `servir-par-canal`. Celui-là applique une fonction à chaque
// CANAL d'une prise : un son stéréo, deux tâches, et le gain s'arrête là. Certains composants ne
// travaillent pas par canal mais par TÂCHE INDÉPENDANTE, et il y en a beaucoup : la banque de
// clavier transpose le même son vers dix-neuf racines, et ces dix-neuf transpositions ne se
// connaissent pas. Elles peuvent donc se répartir sur plusieurs ouvriers au lieu d'attendre leur
// tour, ce que `servir-par-canal` ne sait pas faire.
//
// LA PRÉPARATION A LIEU UNE FOIS PAR LOT, et c'est ce qui sépare ce dialogue d'une simple boucle.
// Une méthode de transposition décompose le son source avant de transposer quoi que ce soit : la
// refaire à chaque tâche la paierait dix-neuf fois.

import { listeDeTransfert } from "./liste-de-transfert";

/**
 * Installe le dialogue sur `self` : une préparation par lot, puis une tâche après l'autre.
 *
 * La demande porte `taches`, les indices à traiter, et les réglages. La réponse porte `resultats`,
 * un par tâche, dans le même ordre : c'est l'appelant qui recolle les lots.
 */
export function servirParLot<O, C, R>(
  preparer: (o: O) => C,
  calcul: (tache: number, o: O, prepare: C) => R,
): void {
  self.onmessage = (e: MessageEvent<{ taches: number[] } & O>) => {
    const { taches, ...reglages } = e.data as any;
    try {
      const prepare = preparer(reglages as O);
      const resultats: R[] = [];
      for (const t of taches as number[]) {
        resultats.push(calcul(t, reglages as O, prepare));
        self.postMessage({ type: "progress", faits: resultats.length, total: taches.length });
      }
      self.postMessage({ type: "done", taches, resultats },
        listeDeTransfert(resultats) as unknown as WindowPostMessageOptions);
    } catch (err) {
      self.postMessage({ type: "error", msg: String((err as Error)?.message ?? err) });
    }
  };
}

/**
 * Le même dialogue pour un calcul UNIQUE : un lot d'une tâche, sans préparation.
 *
 * POURQUOI CE TROISIÈME VISAGE, et non un troisième dialogue. Un composant qui GÉNÈRE n'a pas de
 * canal d'entrée à découper, et son calcul ne se coupe pas toujours en tâches indépendantes : la
 * phase d'un glissement s'accumule d'un échantillon au suivant, et deux moitiés calculées séparément
 * ne se recolleraient pas. Il reste une tâche, et une seule — donc le dialogue d'ici, avec un lot de
 * un, et aucune pièce nouvelle à éprouver.
 */
export function servirUneFois<O, R>(calcul: (o: O) => R): void {
  servirParLot<O, null, R>(() => null, (_tache, o) => calcul(o));
}
