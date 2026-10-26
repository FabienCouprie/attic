// audio/frequence-de-travail.ts — La fréquence à laquelle un projet travaille.
//
// ═══ CE QU'IL Y AVAIT AVANT, MESURÉ ═══
//
// Point 5 d'une revue du dépôt, le 2026-10-25 : « aucune fréquence d'échantillonnage commune au
// graphe ». Vérifié, et le mécanisme était pire que l'énoncé. Trois régimes coexistaient :
//
//   · LES GÉNÉRATEURS À 44 100 Hz EN DUR — 107 occurrences dans 68 fichiers hors tests ;
//   · LE DÉCODAGE d'un fichier à SA fréquence, pour qu'une conversion ne se fasse pas sans
//     qu'on l'ait demandée (`audio/frequence-source.ts`) ;
//   · ET ONZE SITES DANS SEPT FICHIERS qui généraient à `ctx.runtime.sampleRate`, c'est-à-dire
//     À LA FRÉQUENCE DE LA CARTE SON. Les trois Risset, les six synthétiseurs de Tone, le crible,
//     les écrans et le GENDYN de Xenakis, les pulsars de Roads.
//
// LE TROISIÈME EST CELUI QUI SE PAIE, et il se mesure. Sur cette machine la carte tourne à
// 48 000 Hz, et DEUX DES CINQ GRAPHES LIVRÉS rendent à deux fréquences à la fois :
//
//     ton-glisse-en-trompette-etiree · ton, gliss à 44 100 · ddsp, stretch, ecoute à 48 000
//     un-son-projete-en-microtonal   · echelle à 44 100 · cloche (metal-synth), etale à 48 000
//
// Le même fichier de projet rend donc un autre son selon la machine qui l'ouvre, et rien ne le
// disait. LE RECENSEMENT DU POINT 5 NE POUVAIT PAS LE VOIR : il guette un nœud qui reçoit DEUX
// fréquences, et ici chaque nœud n'en reçoit qu'une — la conversion a lieu à l'intérieur d'une
// chaîne, par le rééchantillonneur du navigateur, dont personne ne choisit la qualité.
//
// ═══ CE QUE CE MODULE DÉCIDE, ET POURQUOI 44 100 PAR DÉFAUT ═══
//
// Une fréquence de travail est déclarée PAR PROJET, elle voyage dans son fichier, et le moteur la
// donne à tout ce qui génère. Son défaut est 44 100 Hz, et ce n'est pas un goût : c'est la valeur
// que les 107 sites en dur écrivent déjà. Tout projet enregistré rend donc, à la virgule près, ce
// qu'il rendait — et ce sont les douze composants qui lisaient la carte son qui changent, dans le
// sens où ils cessent de dépendre d'elle.
//
// UNE SEULE SOURCE DE VÉRITÉ, et la leçon est payée. La table de montage a porté quatre défauts
// d'affilée parce que les quatre valeurs d'une piste vivaient à DEUX endroits avec une bascule
// invisible entre eux. Ici, UN SEUL module porte la valeur : le fichier de projet la pose au
// chargement, l'interface l'édite, les nœuds la lisent, et la sauvegarde la relit. Un magasin
// d'interface qui en aurait gardé sa copie aurait refait exactement le défaut du montage — c'est
// pourquoi le sélecteur s'ABONNE à celui-ci plutôt que d'en tenir un second.

/** Les quatre fréquences qu'un ingénieur du son emploie, et rien d'autre. */
export const FREQUENCES_DE_TRAVAIL = [
  { valeur: 44100, fr: "44,1 kHz", en: "44.1 kHz",
    note: "Le disque compact, et ce que tous les générateurs de ce logiciel écrivaient en dur. Le défaut.",
    noteEn: "Compact disc, and what every generator in this software hard-coded. The default." },
  { valeur: 48000, fr: "48 kHz", en: "48 kHz",
    note: "La vidéo, la radio, et la fréquence de la plupart des cartes son. Le format de livraison le plus demandé.",
    noteEn: "Video, broadcast, and the rate of most sound cards. The most requested delivery format." },
  { valeur: 88200, fr: "88,2 kHz", en: "88.2 kHz",
    note: "Le double de 44,1 : la conversion vers le disque compact n'est alors qu'une décimation par deux.",
    noteEn: "Twice 44.1: conversion down to compact disc is then a plain decimation by two." },
  { valeur: 96000, fr: "96 kHz", en: "96 kHz",
    note: "L'enregistrement et le traitement fin. Double la mémoire et le temps de calcul de tout le graphe.",
    noteEn: "Fine recording and processing. Doubles the memory and compute of the whole graph." },
] as const;

export type FrequenceDeTravail = (typeof FREQUENCES_DE_TRAVAIL)[number]["valeur"];

/** 44 100 Hz : la valeur que les générateurs écrivaient déjà en dur. Voir l'en-tête. */
export const FREQUENCE_DEFAUT: FrequenceDeTravail = 44100;

export function estFrequenceDeTravail(v: unknown): v is FrequenceDeTravail {
  return FREQUENCES_DE_TRAVAIL.some((f) => f.valeur === v);
}

/**
 * La fréquence déclarée par un fichier de projet, ou le défaut.
 *
 * ON NE DEVINE RIEN SUR LE CONTENU. Un fichier antérieur à ce réglage n'en porte pas, et il vaut
 * 44 100 — ce que ses générateurs écrivaient. Déduire une fréquence de ce qu'on trouve dans le
 * graphe serait une heuristique qui vieillirait mal, exactement comme pour le numéro de format.
 */
export function frequenceDuProjet(json: unknown): FrequenceDeTravail {
  const v = (json as { frequenceDeTravail?: unknown } | null)?.frequenceDeTravail;
  return estFrequenceDeTravail(v) ? v : FREQUENCE_DEFAUT;
}

// ── L'état ambiant du domaine ──
//
// POURQUOI UN GLOBAL PLUTÔT QUE LE CONTRAT D'EXÉCUTION. `ContexteExecution` (core/types.ts) est
// agnostique de domaine : une fréquence d'échantillonnage n'y a pas sa place, et l'y mettre
// obligerait le domaine des nombres à en déclarer une. Le `TRuntime` du domaine audio est
// l'`AudioContext`, employé à vingt-neuf endroits pour décoder ; en faire un objet composite les
// toucherait tous pour rien.
//
// C'est donc le motif déjà en place dans `plugins/grapheGlobal.ts` et `soundfontGlobal.ts` : un état
// ambiant du domaine, posé par l'interface, lu par les nœuds qui le veulent. Avec une différence qui
// compte : le graphe courant ne vaut QUE pendant un run, celle-ci vaut tout le temps — c'est une
// propriété du projet ouvert, pas de l'exécution.
//
// HORS PROJET ELLE VAUT LE DÉFAUT, ce qui est la bonne réponse et non un pis-aller : le banc du
// catalogue et les cas unitaires n'ouvrent aucun projet, et 44 100 est ce que le catalogue écrivait.

type GlobalFrequence = typeof globalThis & { __attic_frequence_travail__?: number };

const g = globalThis as GlobalFrequence;
const ecoutes = new Set<() => void>();

/**
 * Posée au chargement d'un projet et par le sélecteur. Une valeur hors liste vaut le défaut.
 *
 * ELLE NE PRÉVIENT QUE SI ELLE CHANGE : un abonné qui se redessinerait à chaque pose ferait
 * repasser React Flow sur tous les nœuds pour rien, et c'est exactement le défaut en N² que
 * `ui/statuts.ts` a été écrit pour tuer.
 */
export function publierFrequenceDeTravail(frequence: unknown): void {
  const valeur = estFrequenceDeTravail(frequence) ? frequence : FREQUENCE_DEFAUT;
  if (g.__attic_frequence_travail__ === valeur) return;
  g.__attic_frequence_travail__ = valeur;
  for (const e of [...ecoutes]) e();
}

/**
 * La fréquence de travail du projet ouvert, ou 44 100 hors projet.
 *
 * ELLE REND UN `number`, ET NON L'UNION DES QUATRE VALEURS. L'union est juste pour VALIDER — elle
 * dit ce qu'on accepte d'un fichier ou d'un menu — et nuisible comme valeur : un paramètre dont le
 * défaut vaut `frequenceDeTravail()` prendrait ce type étroit, et refuserait ensuite la fréquence
 * d'un tampon quelconque. Relevé par le compilateur sur deux sites, `midi-sequence.ts` et
 * `synthese-features.ts`, qui reçoivent la fréquence d'un son venu d'ailleurs.
 */
export function frequenceDeTravail(): number {
  const v = g.__attic_frequence_travail__;
  return estFrequenceDeTravail(v) ? v : FREQUENCE_DEFAUT;
}

/** S'abonner aux changements. Rend de quoi se désabonner — la forme qu'attend `useSyncExternalStore`. */
export function sAbonnerALaFrequence(ecoute: () => void): () => void {
  ecoutes.add(ecoute);
  return () => { ecoutes.delete(ecoute); };
}
