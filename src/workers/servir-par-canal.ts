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

// LA LISTE DE TRANSFERT EST PARTAGÉE AVEC `servir-par-lot`. Ce module en tenait une copie, qui ne
// connaissait pas un résultat qui EST un tableau typé : `Object.values` en énumérait les
// échantillons sans rien y trouver, et le résultat repartait recopié.
import { listeDeTransfert } from "./liste-de-transfert";

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
      self.postMessage({ type: "done", requestId, resultats },
        listeDeTransfert(resultats) as unknown as WindowPostMessageOptions);
    } catch (err) {
      self.postMessage({ type: "error", requestId, msg: String((err as Error)?.message ?? err) });
    }
  };
}
