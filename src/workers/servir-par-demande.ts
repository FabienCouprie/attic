// src/workers/servir-par-demande.ts — Le dialogue des workers dont le calcul est ASYNCHRONE.
//
// POURQUOI UN TROISIÈME DIALOGUE, à côté de `servir-par-canal` et `servir-par-lot`. Ces deux-là
// appliquent une fonction synchrone et rendent la main aussitôt. Une inférence d'onnxruntime-web ne
// l'est pas : `InferenceSession.create` et `session.run` rendent des promesses, et la boucle de
// trames de GTCRN en attend une par trame. Il faut donc attendre avant de répondre, et ne pas
// laisser deux demandes se croiser sur une même session.
//
// LES DEMANDES SONT SERVIES UNE À UNE, dans l'ordre d'arrivée. Une session onnxruntime ne se lance
// pas deux fois de front, et le moteur n'exécute de toute façon qu'un nœud à la fois.
//
// LE WORKER VIT ENTRE DEUX DEMANDES, et c'est ce qui le sépare des deux autres usages : il garde ses
// sessions prêtes, comme la page les gardait. C'est le client, `plugins/onnx-hors-fil.ts`, qui le
// termine quand on l'arrête ou quand il meurt.
//
// `docs/couverture-empreintes.test.ts` reconnaît les workers de ce dialogue à cet import, comme ceux
// des deux autres : un calcul sorti du fil par ici doit être réclamé par un composant surveillé.
import { listeDeTransfert } from "./liste-de-transfert";

/**
 * Installe le dialogue sur `self`.
 *
 * La demande porte `requestId` et ce que `traiter` attend ; la réponse porte `resultat`, dont les
 * tableaux typés sont TRANSFÉRÉS. L'avancement part en `{ type: "progress", avancement }`, avec le
 * même `requestId`, et c'est le client qui le traduit : la langue de l'interface est dans la page.
 */
export function servirParDemande<D, R>(
  traiter: (demande: D, avancement: (valeur: number) => void) => Promise<R>,
): void {
  let file: Promise<void> = Promise.resolve();
  self.onmessage = (e: MessageEvent<{ requestId?: string } & D>) => {
    const { requestId, ...demande } = e.data as { requestId?: string } & Record<string, unknown>;
    file = file.then(async () => {
      try {
        const resultat = await traiter(demande as D, (avancement) => {
          self.postMessage({ type: "progress", requestId, avancement });
        });
        self.postMessage({ type: "done", requestId, resultat },
          listeDeTransfert([resultat]) as unknown as WindowPostMessageOptions);
      } catch (err) {
        self.postMessage({ type: "error", requestId, msg: String((err as Error)?.message ?? err) });
      }
    });
  };
}
