// ui/hooks/useExecutionGraphe.ts — Le pont entre l'interface et le moteur : le moteur construit une
// fois avec ses questions et son récepteur, et les gestes qui lui envoient des commandes.
//
// LE MOTEUR EST DANS `ui/moteur/`, SANS REACT, depuis la pièce P5a du plan de l'architecture par
// messages : l'ordonnanceur, les deux pilotes de passes, la passe et son ménage. Depuis la pièce P5b,
// il est construit une seule fois, et ce module en est le pont, en deux crochets :
//
//   — `useMoteur` le construit, par une référence paresseuse, avec les questions qu'il pose à
//     l'interface et le récepteur qui pose ce qu'il dit (`ui/recepteur-moteur.ts`). Ils lui sont
//     donnés à la construction, jamais par un effet : `StrictMode` doublerait chaque événement.
//     `App.tsx` l'appelle là où il créait le cache, avant les crochets qui envoient des commandes ;
//   — `useExecutionGraphe` tient la liaison à jour et rend les deux gestes du moteur : lancer et
//     arrêter. Chacun est une commande du protocole, envoyée de façon synchrone. Les remises à zéro
//     vivent dans `useRemiseAZero.ts`, que `App.tsx` appelle lui-même.
//
// LA LIAISON, c'est ce qui change d'un rendu à l'autre : la langue, le dossier de travail, et les deux
// rappels de l'atelier. Elle est récrite à chaque rendu, comme `pileRef` ou `lancerRef` dans
// `App.tsx`. Le moteur en lit la langue et le dossier quand `lancer` est envoyé, et les garde pour la
// passe ; le récepteur en lit la langue et les rappels au début de chaque passe.
//
// L'INTERFACE N'IMPORTE QUE L'INDEX DU DOSSIER DU MOTEUR, et `docs/frontiere-moteur.test.ts` le tient.
import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction, MutableRefObject } from "react";
import { trouverMeta, type NoeudG, type AreteG } from "../../core";
import { prendreInstantane } from "../../core/instantane-de-graphe";
import type { EnvoiAuMoteur } from "../../core/protocole-moteur";
import { copierPourHistorique } from "../historique";
import { noeudPrioritaire } from "../priorite";
import { creerRecepteurDuMoteur, type LiaisonDuRecepteur } from "../recepteur-moteur";
import { creerMoteur, type PerimetreCible } from "../moteur";

import { direValeursInconnues, useI18n, valeurCanoniqueChoix } from "../../i18n";
import { registreUI } from "../registre-actif";

const trouverDef = (id: string) => registreUI().trouverDef(id);

/** Ce que le pont lie au rendu : la langue, le dossier de travail, et les deux rappels de l'atelier. */
export interface Liaison extends LiaisonDuRecepteur {
  repertoire: string;
}

/** Le moteur vu de l'interface : ses commandes, et la liaison que le pont tient à jour. */
export interface Pont {
  envoyer: EnvoiAuMoteur;
  liaison: Liaison;
}

/** Ce que l'interface tient et que le moteur ou son récepteur lisent : des références vivantes et deux setters. */
export interface OptionsDuMoteur {
  noeudsRef: MutableRefObject<any[]>;
  aretesRef: MutableRefObject<any[]>;
  enExecRef: MutableRefObject<boolean>;
  setEnExecution: (b: boolean) => void;
  audioCtxRef: MutableRefObject<AudioContext | null>;
  /** La bascule « économiser la mémoire » de la barre d'outils. Absente : active, le défaut sûr. */
  economieMemoireRef?: MutableRefObject<boolean>;
  /** Pile de navigation des méta-composants : non vide, on regarde le dedans d'un méta. */
  pileMetaRef?: MutableRefObject<{ metaId: string; nom: string }[]>;
  setNodes: Dispatch<SetStateAction<any[]>>;
}

/** Construit le moteur, ses questions et son récepteur. Une fois par composant : voir `useMoteur`. */
function construireLePont(o: OptionsDuMoteur): Pont {
  const { noeudsRef, aretesRef, enExecRef, setEnExecution, audioCtxRef, economieMemoireRef, pileMetaRef, setNodes } = o;
  const liaison: Liaison = { t: (cle) => cle, repertoire: "" };
  const recepteur = creerRecepteurDuMoteur({
    affichage: { trouverDef, aretesRef, economieMemoireRef, pileMetaRef },
    noeudsVisibles: () => noeudsRef.current,
    setNodes,
    // Mise à jour immédiate de la référence pour bloquer les doubles clics, avant que React ne
    // déclenche l'effet qui la synchronise sur l'état.
    enExecution: (tourne) => { enExecRef.current = tourne; setEnExecution(tourne); },
    liaison: () => liaison,
  });
  const obtenirAudio = async () => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    if (audioCtxRef.current.state === "suspended") {
      try { await audioCtxRef.current.resume(); } catch { /* ignore */ }
    }
    return audioCtxRef.current;
  };
  const moteur = creerMoteur({
    questions: {
      // LE GRAPHE QU'UNE PASSE LIRA, copié à l'instant où on la pose. Voir `core/instantane-de-graphe.ts`.
      graphe: () => prendreInstantane({
        noeuds: noeudsRef.current as unknown as NoeudG[], aretes: aretesRef.current as unknown as AreteG[],
        trouverMeta, copier: copierPourHistorique,
      }),
      priorite: noeudPrioritaire,
      noeudVisible: (id) => noeudsRef.current.find((x) => x.id === id),
      noeudsVisibles: () => noeudsRef.current,
      economieMemoire: () => economieMemoireRef?.current ?? true,
      demande: () => ({ t: liaison.t, repertoire: liaison.repertoire }),
    },
    recepteur: recepteur.recevoir,
    audio: obtenirAudio,
    canoniser: valeurCanoniqueChoix,
    direValeursInconnues,
  });
  return { envoyer: moteur.envoyer, liaison };
}

/**
 * Le moteur de ce composant, construit au premier rendu et gardé pour sa vie, comme l'ordonnanceur
 * l'était. Ses commandes sont prêtes dès le rendu : les crochets qui le suivent peuvent les recevoir.
 */
export function useMoteur(o: OptionsDuMoteur): Pont {
  const ref = useRef<Pont | null>(null);
  if (!ref.current) ref.current = construireLePont(o);
  return ref.current;
}

export interface OptionsExecution {
  pont: Pont;
  repertoire: string;
  onGrapheGenere?: LiaisonDuRecepteur["onGrapheGenere"];
  onNodeInstalle?: () => void;
}

export function useExecutionGraphe(o: OptionsExecution) {
  const { t } = useI18n();
  const { pont, repertoire, onGrapheGenere, onNodeInstalle } = o;
  // LA LIAISON EST CELLE DE CE RENDU : une demande envoyée ensuite la lira.
  Object.assign(pont.liaison, { t, repertoire, onGrapheGenere, onNodeInstalle });
  const { envoyer } = pont;

  // LES REMISES À ZÉRO NE PASSENT PLUS PAR CE PONT : `App.tsx` appelle `useRemiseAZero.ts` lui-même,
  // depuis le 2026-11-19. Le point 3 du diagnostic d'`ARCHITECTURE.md` reprochait à ce crochet de
  // concentrer l'exécution et la réinitialisation ; il ne rend plus que les deux commandes du moteur.

  /**
   * LA SEULE PORTE D'ENTRÉE, et elle passe par l'ordonnanceur du moteur.
   *
   * Une demande faite pendant qu'une exécution tourne ATTEND SON TOUR au lieu de tourner en même
   * temps, ou d'être jetée sans un mot ; deux demandes de même cible se fondent ; « Arrêter » vide la
   * file. Le périmètre voyage tel que l'appelant l'a donné, champ pour champ. Voir `ui/moteur/moteur.ts`.
   */
  const lancer = useCallback((p?: string, perimetre?: PerimetreCible) =>
    envoyer({ genre: "lancer", ...(p !== undefined ? { cible: p } : {}), ...perimetre }), [envoyer]);

  /**
   * Arrêter l'exécution en cours, sans rien effacer : arrêter n'est pas réinitialiser. Le lot s'arrête
   * au fichier en cours, la file se vide, et la passe en cours reçoit son signal.
   */
  const arreter = useCallback(() => envoyer({ genre: "arreter" }), [envoyer]);

  return { lancer, arreter };
}
