// ui/etat-de-passe.ts — Les tables d'une passe, nommées une fois.
//
// POURQUOI UN TYPE À PART. Le moteur d'exécution tenait ses tables dans la fermeture de
// `lancerUnePasse`, et chaque fonction qui en sortait devait les recevoir une à une : la pose d'un
// correctif en lisait seize. Les nommer ici, c'est les nommer une fois, et c'est ce qui permet au
// ménage d'après passe de les recevoir à son tour, par le même objet. Rien n'y est copié : ce sont
// les tables du moteur elles-mêmes, qu'il remplit pendant la boucle et que la pose lit après.
//
// LES TROIS RÉFÉRENCES SONT PASSÉES TELLES QUELLES, et non leur valeur du moment. Le moteur lisait
// `aretesRef.current` au moment de POSER un nœud, pas au début de la passe ; un câble tiré pendant
// un run long compte donc pour dire si un nœud est regardé. Donner la valeur figerait ce que le
// moteur lisait vivant. Même raison pour l'économie de mémoire et la pile des métas ouverts.
import type { Edge } from "@xyflow/react";
import type { Respiration } from "../core/respirer";
import type { NoeudG, AreteG } from "../core";
import type { RegistreUI } from "./registre-actif";

/** Une référence lue au moment de la pose, comme le moteur la lisait. */
export interface Lecture<T> { readonly current: T }

export interface EtatDePasse {
  /** Les valeurs rendues, par nœud du graphe aplati. */
  resultats: Map<string, unknown[]>;
  /** Le message de chaque nœud, quand il en a rendu un. */
  messages: Map<string, string>;
  /** Les deux canaux déclarés, posés sous des clés réservées. */
  affichageParNoeud: Map<string, Record<string, unknown>>;
  designeParNoeud: Map<string, Record<string, unknown>>;
  /** Les nœuds visibles, bulles comprises. */
  tousNoeudsG: NoeudG[];
  /** Les arêtes sans les substitutions, celles d'un graphe qu'on lit. */
  aretesReelles: AreteG[];
  /** L'ordre réellement exécuté, sur le graphe aplati. */
  ordreFiltre: string[];
  /** Les nœuds du graphe aplati, où un membre de méta s'appelle « outil1::cd ». */
  noeudsPlats: NoeudG[];
  /** Un méta est-il dans le périmètre de ce run ? */
  estMetaEnScope: (id: string) => boolean;
  trouverDef: RegistreUI["trouverDef"];
  /** Les lecteurs promis, écrits après que tout est posé. */
  lecteursAEcrire: Map<string, () => Promise<string | undefined>>;
  souffle: Respiration;
  aretesRef: Lecture<Edge[]>;
  economieMemoireRef?: Lecture<boolean>;
  pileMetaRef?: Lecture<{ metaId: string; nom: string }[]>;
  t: (cle: string) => string;
}
