// plugins/hors-lot.ts — Répartir des tâches indépendantes sur plusieurs ouvriers.
//
// CE QUE CELUI-CI AJOUTE À `hors-fil.ts`. Le premier socle sort un calcul du fil de l'interface, un
// canal après l'autre : un son stéréo occupe un ouvrier pendant deux tours. Il ne sait rien faire
// d'un composant dont le travail n'est pas découpé par canal — la banque de clavier transpose le
// même son vers dix-neuf racines, et le socle par canal ne voyait là qu'une seule tâche.
//
// DEUX GAINS, ET NON UN SEUL. Le fil ne fige plus, comme avec l'autre socle ; mais surtout les
// tâches tournent EN MÊME TEMPS, ce qui divise l'attente au lieu de la déplacer. C'est le premier
// endroit du dépôt où plusieurs ouvriers travaillent de front.
//
// LE NOMBRE D'OUVRIERS EST BORNÉ, et pas seulement par les cœurs de la machine. Chaque ouvrier
// reçoit une COPIE des réglages, donc du son source : à huit ouvriers, un son de cinq minutes se
// recopie huit fois. Quatre est le compromis retenu, et l'appelant peut le baisser.
//
// LE REPLI N'EST PAS UNE SECONDE ÉCRITURE DU CALCUL, comme pour l'autre socle : l'appelant passe la
// MÊME préparation et le MÊME calcul que les ouvriers exécutent.

import { installerGardeWorker } from "./garde-worker";

/** Ce que l'appelant doit fournir : de quoi fabriquer un ouvrier, et de quoi s'en passer. */
export interface HorsLot<O, C, R> {
  creerWorker: () => Worker;
  /** La mise en place commune à toutes les tâches, faite une fois par ouvrier. */
  preparer: (o: O) => C;
  /** Une tâche, désignée par son indice. */
  calcul: (tache: number, o: O, prepare: C) => R;
  /** Appelé à mesure que les tâches se terminent, tous ouvriers confondus. */
  surProgres?: (faits: number, total: number) => void;
  /** Combien d'ouvriers au plus. Quatre par défaut, pour la raison écrite en tête de fichier. */
  ouvriers?: number;
}

/** Les cœurs annoncés par la machine, quand elle en annonce. */
const coeurs = (): number => {
  const n = (globalThis.navigator as { hardwareConcurrency?: number } | undefined)?.hardwareConcurrency;
  return typeof n === "number" && n > 0 ? n : 4;
};

/** Les tâches découpées en autant de parts qu'il y a d'ouvriers, au plus une part chacun. */
export function repartir(taches: number, ouvriers: number): number[][] {
  const w = Math.max(1, Math.min(ouvriers, taches));
  const parts: number[][] = Array.from({ length: w }, () => []);
  // EN ROND PLUTÔT QU'EN TRANCHES : les tâches voisines coûtent souvent des temps voisins, et des
  // tranches contiguës donneraient à un ouvrier toutes les plus longues. Distribuées une à une,
  // chacun en reçoit de toutes les sortes.
  for (let t = 0; t < taches; t++) parts[t % w].push(t);
  return parts;
}

/** Applique le calcul à chaque tâche, réparties sur plusieurs ouvriers si l'on en a. */
export async function parLot<O, C, R>(
  taches: number, reglages: O, h: HorsLot<O, C, R>,
): Promise<R[]> {
  if (taches <= 0) return [];
  if (typeof Worker === "undefined") {
    const prepare = h.preparer(reglages);
    const out: R[] = [];
    for (let t = 0; t < taches; t++) {
      out.push(h.calcul(t, reglages, prepare));
      h.surProgres?.(t + 1, taches);
    }
    return out;
  }

  const parts = repartir(taches, Math.max(1, Math.min(h.ouvriers ?? 4, coeurs())));
  const resultats = new Array<R>(taches);
  let faits = 0;
  const ouvriers: Worker[] = [];
  try {
    await Promise.all(parts.map((part) => new Promise<void>((resolve, reject) => {
      const w = h.creerWorker();
      ouvriers.push(w);
      // Un ouvrier qui meurt avant de répondre laisserait le nœud « en cours » indéfiniment.
      installerGardeWorker(w as never);
      w.onmessage = (e: MessageEvent<any>) => {
        const d = e.data;
        if (d?.type === "progress") { faits += 1; h.surProgres?.(faits, taches); return; }
        if (d?.type === "done") {
          (d.taches as number[]).forEach((t, i) => { resultats[t] = d.resultats[i] as R; });
          resolve();
        } else if (d?.type === "error") reject(new Error(d.msg));
      };
      w.postMessage({ taches: part, ...reglages });
    })));
    return resultats;
  } finally {
    for (const w of ouvriers) w.terminate();
  }
}

/** Ce qu'un calcul unique demande : de quoi fabriquer un ouvrier, et de quoi s'en passer. */
export interface HorsUneFois<O, R> {
  creerWorker: () => Worker;
  /** Le calcul entier, celui-là même que l'ouvrier exécute. */
  calcul: (o: O) => R;
}

/**
 * Un calcul UNIQUE, hors du fil.
 *
 * POURQUOI CE TROISIÈME VISAGE, et non un troisième socle. Un composant qui GÉNÈRE n'a pas de canal
 * d'entrée à découper, donc rien à donner au socle par canal ; et son calcul ne se coupe pas
 * toujours en tâches indépendantes — la phase d'un glissement s'accumule d'un échantillon au
 * suivant, et deux moitiés calculées séparément ne se recolleraient pas. Il reste une tâche, et une
 * seule. C'est donc `parLot` avec un lot de un : le même dialogue, le même repli, le même garde
 * d'ouvrier mort, et aucune pièce nouvelle à éprouver.
 *
 * LE GAIN EST D'UN SEUL CÔTÉ, ET C'EST ASSUMÉ. Rien ne tourne de front, le temps total ne baisse
 * pas : seul le gel disparaît. C'est précisément ce qui était demandé.
 */
export async function parUneFois<O, R>(reglages: O, h: HorsUneFois<O, R>): Promise<R> {
  const [resultat] = await parLot<O, null, R>(1, reglages, {
    creerWorker: h.creerWorker,
    preparer: () => null,
    calcul: (_tache, o) => h.calcul(o),
  });
  return resultat;
}
