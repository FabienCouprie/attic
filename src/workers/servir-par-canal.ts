// src/workers/servir-par-canal.ts — Le dialogue commun des workers de calcul audio.
//
// POURQUOI CE MODULE. Plusieurs composants ont le même besoin : appliquer une fonction pure à chaque
// canal d'une prise, hors du fil de l'interface. Le calcul diffère, le dialogue non — recevoir une
// demande, annoncer le canal en cours, rendre les résultats, transformer une exception en message
// d'erreur. Écrit une fois par worker, ce dialogue aurait été recopié cinq fois, et une correction
// sur l'un des cinq n'aurait pas profité aux autres.
//
// CE QUE CE MODULE NE FAIT PAS. Il n'agrège rien. Un composant fait la moyenne d'une mesure sur ses
// canaux, un autre en prend le maximum : la règle appartient au composant, et la deviner ici
// donnerait un chiffre faux sans que rien ne le signale. Le worker rend les résultats canal par
// canal, tels quels.

/** Les tampons à transférer plutôt qu'à recopier : tout tableau typé que porte un résultat. */
function tamponsDe(resultat: unknown): ArrayBuffer[] {
  if (!resultat || typeof resultat !== "object") return [];
  const out: ArrayBuffer[] = [];
  for (const v of Object.values(resultat as Record<string, unknown>)) {
    if (ArrayBuffer.isView(v)) out.push(v.buffer as ArrayBuffer);
  }
  return out;
}

/**
 * Installe le dialogue sur `self`, en déléguant le calcul d'un canal à `calcul`.
 *
 * La demande porte `voies`, `requestId` et les réglages ; la réponse porte `resultats`, un par
 * canal, dans l'ordre. Les tableaux typés sont TRANSFÉRÉS et non recopiés : un canal de trois
 * minutes pèse trente mégaoctets, et les recopier annulerait une part du gain cherché.
 */
export function servirParCanal<O, R>(
  calcul: (voie: Float32Array, o: O, canal: number) => R,
): void {
  self.onmessage = (e: MessageEvent<{ requestId?: unknown; voies: Float32Array[] } & O>) => {
    const { requestId, voies, ...reglages } = e.data as any;
    try {
      const resultats: R[] = [];
      for (let c = 0; c < voies.length; c++) {
        self.postMessage({ type: "progress", requestId, canal: c + 1, canaux: voies.length });
        resultats.push(calcul(voies[c], reglages as O, c));
      }
      const transfert = resultats.flatMap(tamponsDe);
      self.postMessage({ type: "done", requestId, resultats },
        transfert as unknown as WindowPostMessageOptions);
    } catch (err) {
      self.postMessage({ type: "error", requestId, msg: String((err as Error)?.message ?? err) });
    }
  };
}
