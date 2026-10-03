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

/** Les tampons à transférer plutôt qu'à recopier : tout tableau typé que porte un résultat. */
function tamponsDe(resultat: unknown): ArrayBuffer[] {
  if (!resultat || typeof resultat !== "object") return [];
  // UN RÉSULTAT QUI EST LUI-MÊME UN TABLEAU TYPÉ, et c'était un piège : `Object.values` sur un
  // `Float32Array` de quatre cent mille échantillons en fabrique un tableau de quatre cent mille
  // nombres, pour ne rien trouver à transférer ensuite. Ici il n'y a qu'un tampon, et c'est lui.
  if (ArrayBuffer.isView(resultat)) return [resultat.buffer as ArrayBuffer];
  const out: ArrayBuffer[] = [];
  for (const v of Object.values(resultat as Record<string, unknown>)) {
    if (ArrayBuffer.isView(v)) out.push(v.buffer as ArrayBuffer);
    else if (Array.isArray(v)) for (const e of v) if (ArrayBuffer.isView(e)) out.push(e.buffer as ArrayBuffer);
  }
  return out;
}

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
        resultats.flatMap(tamponsDe) as unknown as WindowPostMessageOptions);
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
