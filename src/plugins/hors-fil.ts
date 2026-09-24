// plugins/hors-fil.ts — Faire calculer un composant ailleurs que dans le fil de l'interface.
//
// LE PROBLÈME, MESURÉ. Un composant qui calcule dans le fil de l'interface l'arrête tout entière.
// Sur `phase-pghi` et trois secondes de stéréo, la sonde n'a pas reçu UN SEUL message pendant les
// 3,5 secondes de l'appel : le gel n'était pas long, il était total, et ni la progression ni le
// bouton « Arrêter » n'étaient atteignables.
//
// POURQUOI UN WORKER PLUTÔT QUE DES PAUSES. Rendre la main périodiquement borne le gel à cinquante
// millièmes, ce qui est déjà bien, mais demande de faire respirer chaque boucle, donc de rendre
// asynchrones les fonctions de calcul et tous leurs appelants, tests compris. Un worker obtient
// mieux pour moins : le fil n'est pas ralenti du tout, et aucune signature de calcul ne change.
//
// OÙ C'EST POSSIBLE. Seulement quand le module de calcul ne touche pas au Web Audio : `AudioBuffer`
// n'existe pas dans un worker. Le relevé donne **110 modules purs sur 196**, et c'est ce critère,
// et non l'intuition, qui décide quel composant peut passer.
//
// LE REPLI N'EST PAS UNE SECONDE ÉCRITURE DU CALCUL. L'appelant lui passe la MÊME fonction que le
// worker exécute. Là où il n'y a pas de worker — en test notamment —, le calcul a lieu dans le fil
// et fige comme avant : c'est assumé, mieux vaut un calcul lent qu'un composant qui ne calcule pas.

import { installerGardeWorker } from "./garde-worker";

/** Ce que l'appelant doit fournir : de quoi fabriquer le worker, et de quoi s'en passer. */
export interface Hors<O, R> {
  /** Fabrique le worker. Une fonction, pour que le module ne soit chargé que si l'on s'en sert. */
  creerWorker: () => Worker;
  /**
   * Le calcul d'un canal, celui-là même que le worker exécute.
   *
   * L'INDICE DU CANAL EST PASSÉ, et il ne l'était pas d'abord : un composant tire une graine par
   * canal pour que les deux côtés partagent des statistiques sans partager un échantillon, et sans
   * cet indice les deux canaux auraient rendu le même bruit.
   */
  calcul: (voie: Float32Array, o: O, canal: number) => R;
  /** Appelé à chaque canal entamé, pour la progression du nœud. */
  surProgres?: (canal: number, canaux: number) => void;
}

/**
 * Applique le calcul à chaque canal, dans un worker si l'on en a un, sinon dans le fil.
 *
 * Les voies sont COPIÉES et non transférées : les transférer détacherait les tableaux du tampon
 * d'entrée, qui appartient au nœud amont et peut encore servir, au mélange par exemple.
 */
export async function parCanal<O, R>(
  voies: Float32Array[], reglages: O, h: Hors<O, R>,
): Promise<R[]> {
  if (typeof Worker === "undefined") {
    const out: R[] = [];
    for (let c = 0; c < voies.length; c++) {
      h.surProgres?.(c + 1, voies.length);
      out.push(h.calcul(voies[c], reglages, c));
    }
    return out;
  }

  const worker = h.creerWorker();
  // Un worker qui meurt avant de répondre laisserait le nœud « en cours » indéfiniment.
  installerGardeWorker(worker as never);
  try {
    return await new Promise<R[]>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<any>) => {
        const d = e.data;
        if (d?.type === "progress") { h.surProgres?.(d.canal, d.canaux); return; }
        if (d?.type === "done") resolve(d.resultats as R[]);
        else if (d?.type === "error") reject(new Error(d.msg));
      };
      worker.postMessage({ voies, ...reglages });
    });
  } finally {
    worker.terminate();
  }
}
