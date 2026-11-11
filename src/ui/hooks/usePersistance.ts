// ui/hooks/usePersistance.ts — Export / import du workflow (JSON) + méta-composants.
// Extrait d'App.tsx à l'identique (comportement inchangé). Le hook reçoit l'état
// et les setters dont il a besoin et renvoie { exporter, importer }.
// Ce qu'un projet écrit, fichier et en-cours, se construit dans `ui/projet-a-ecrire.ts`, et où il
// s'écrit dans `ui/ecriture-projet.ts` ; le journal de session vit dans
// `hooks/useJournalDeSession.ts`, et l'import dans `hooks/useImportProjet.ts`.
import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction, MutableRefObject } from "react";
import type { Edge, Viewport } from "@xyflow/react";
import { projetAEcrire } from "../projet-a-ecrire";
import { ecrireParLePont, telechargerProjet } from "../ecriture-projet";
import { useJournalDeSession } from "./useJournalDeSession";
import { useImportProjet } from "./useImportProjet";
import { useI18n } from "../../i18n";
import { decisionSauvegardeAuto, type DecisionSauvegarde } from "../sauvegarde-auto";
import { ecrireEncours, ecrireEncoursPropre } from "../fenetre";

// Typage volontairement souple (les nœuds portent un `data` à index-signature et
// le code d'import d'origine manipulait déjà tout en `any`) : le hook est extrait
// à l'identique, sans resserrer les types au passage.
type NoeudAtelier = any;
type GrapheRacine = { nodes: NoeudAtelier[]; edges: Edge[] } | null;

export interface OptionsPersistance {
  nodes: NoeudAtelier[];
  edges: Edge[];
  setNodes: Dispatch<SetStateAction<NoeudAtelier[]>>;
  setEdges: Dispatch<SetStateAction<NoeudAtelier[]>>;
  rfInstance: any;
  repertoire: string;
  sauvegarderContexteCourant: () => void;
  grapheRacineRef: MutableRefObject<GrapheRacine>;
  setPile: (p: { metaId: string; nom: string; nomEn?: string }[]) => void;
  /** Où l'import dépose la vue du fichier, pour le recadrage que sa remise à zéro de la pile déclenche. */
  vueAPoserRef: MutableRefObject<Viewport | null>;
  reinitialiserNoeud: (id: string) => void;
  supprimerNoeud: (ids: string | string[]) => void;
  lancerRef: MutableRefObject<any>;
  cacheExec: MutableRefObject<Map<string, any>>;
  currentFilePath: string | null;
  setCurrentFilePath: (path: string | null) => void;
}

export function usePersistance(o: OptionsPersistance) {
  const { t } = useI18n();
  // Référence stable vers le fichier courant pour éviter les stale closures
  // dans les raccourcis clavier / callbacks de la barre d'outils.
  const currentFilePathRef = useRef(o.currentFilePath);
  // Le dernier contenu écrit : la sauvegarde automatique s'abstient quand rien n'a bougé,
  // pour ne pas réécrire le même fichier toutes les trente secondes.
  const dernierJsonRef = useRef<string | null>(null);
  /** Le fichier dont la sauvegarde automatique a déjà signalé un refus : on ne le redit pas. */
  const echecSignaleRef = useRef<string | null>(null);
  useEffect(() => {
    currentFilePathRef.current = o.currentFilePath;
  }, [o.currentFilePath]);

  const buildExportData = useCallback(() => {
    o.sauvegarderContexteCourant();
    const racine = o.grapheRacineRef.current ?? { nodes: o.nodes, edges: o.edges };
    return projetAEcrire(racine, () => o.rfInstance?.getViewport());
  }, [o]);

  /** Sauvegarde "classique" : écrit dans le fichier courant si connu, sinon demande. */
  const sauvegarder = useCallback(async (forceDialog = false) => {
    const currentFilePath = currentFilePathRef.current;
    console.log("[persistance] sauvegarder called forceDialog=", forceDialog, "currentFilePath=", currentFilePath);
    const { json, encours } = buildExportData();
    const defaultName = currentFilePath ? undefined : `attic-${new Date().toISOString().slice(0, 10)}.json`;

    if ((window as any).api?.sauvegarderFichier) {
      const api = (window as any).api;
      // LA CASCADE QUI CHOISIT OÙ ÉCRIRE vit dans `ui/ecriture-projet.ts` : le dialogue, l'écriture
      // directe, le dialogue prérempli d'un refus, l'alerte d'un refus annulé et le repli. Un refus
      // annulé sort ici, avant l'en-cours et le dernier contenu écrit, comme avant.
      const issue = await ecrireParLePont(api, { json, currentFilePath, forceDialog, defaultName, repertoire: o.repertoire, t });
      if (issue.abandon) return;
      const filePath = issue.chemin;
      if (filePath) {
        o.setCurrentFilePath(filePath);
        // Tout de suite, et non à l'effet du prochain rendu : l'en-cours écrit ci-dessous emporte
        // son fichier, et ce doit être celui qu'on vient de choisir.
        currentFilePathRef.current = filePath;
        console.log(`[attic] Sauvegardé : ${filePath}`);
      }
    } else {
      // Mode web : téléchargement (aucun vrai "fichier courant" possible).
      telechargerProjet(json, defaultName);
    }

    // Toujours mettre à jour l'en-cours, avec le fichier de cette fenêtre : voir `ui/fenetre.ts`.
    try {
      ecrireEncours(encours, currentFilePathRef.current);
    } catch {}
    dernierJsonRef.current = json;
  }, [o, buildExportData]);

  /**
   * Sauvegarde automatique : écrit le fichier courant, sans dialogue et sans rien
   * afficher, et seulement s'il y a du nouveau.
   *
   * Elle est séparée de `sauvegarder` parce qu'elle n'a pas le droit d'ouvrir quoi que ce
   * soit : sans fichier courant ou sans écriture directe, `sauvegarder` ouvre un dialogue
   * — en mode web, il déclenche même un téléchargement —, ce qu'un minuteur ne doit
   * jamais provoquer dans le dos de l'utilisateur. Renvoie ce qu'elle a décidé, ce qui
   * rend le comportement observable.
   */
  const sauvegarderAuto = useCallback(async (active = true): Promise<DecisionSauvegarde> => {
    const api = (window as any).api;
    // Coupée : on ne construit même pas l'export, qui parcourt tout le graphe.
    if (!active) return "desactivee";
    const { json, encours } = buildExportData();
    const decision = decisionSauvegardeAuto({
      active,
      cheminFichier: currentFilePathRef.current,
      ecritureDirecte: !!api?.ecrireFichier,
      json,
      dernierJson: dernierJsonRef.current,
    });
    if (decision !== "a-ecrire") return decision;
    const chemin = currentFilePathRef.current;
    const ecrit = await api.ecrireFichier(chemin, json);
    // UN REFUS N'EST PAS UNE ÉCRITURE : le contenu reste « à écrire », et le battement suivant
    // réessaie. La personne l'apprend une fois par fichier — une alerte toutes les trente
    // secondes rendrait l'application inutilisable, et le silence lui ferait perdre son travail.
    if (!ecrit) {
      if (echecSignaleRef.current !== chemin && typeof alert !== "undefined") {
        echecSignaleRef.current = chemin;
        alert(t("persistance.sauvegardeAutoRefusee").replace("{chemin}", String(chemin)));
      }
      return "echec";
    }
    echecSignaleRef.current = null;
    dernierJsonRef.current = json;
    // L'en-cours suit, avec son fichier : c'est lui qui est relu au démarrage.
    try {
      ecrireEncours(encours, chemin);
    } catch {}
    return decision;
  }, [buildExportData]);

  /**
   * Mémorise le graphe tel qu'il est, dans l'en-cours relu au démarrage — sans fichier ni dialogue.
   *
   * C'EST LA CONDITION D'UN RECHARGEMENT SANS PERTE. L'en-cours n'était écrit qu'à l'enregistrement
   * manuel, ou par la sauvegarde automatique quand un fichier est ouvert : recharger la fenêtre
   * aurait donc rendu le graphe du dernier enregistrement, et perdu en silence tout ce qui a été
   * modifié depuis. Rien n'est écrit sur le disque ici, et aucun fichier courant n'est touché.
   */
  const memoriserEncours = useCallback((partage = true): boolean => {
    try {
      const { encours } = buildExportData();
      // `partage` faux : seule la copie de la fenêtre, l'en-cours partagé étant à une autre.
      (partage ? ecrireEncours : ecrireEncoursPropre)(encours, currentFilePathRef.current);
      return true;
    } catch {
      return false;
    }
  }, [buildExportData]);

  // LE JOURNAL DE SESSION, qui fait survivre le travail en cours à une fermeture, vit dans
  // `hooks/useJournalDeSession.ts`. Il est appelé ici, à la place exacte de son ancien bloc :
  // l'ordre des crochets ne change pas.
  useJournalDeSession(memoriserEncours, o);

  const exporter = useCallback(() => sauvegarder(true), [sauvegarder]);

  // L'IMPORT D'UN PROJET, du fichier lu au graphe posé et au rapport de ce qui s'est perdu, vit dans
  // `hooks/useImportProjet.ts`. Il est appelé ici, à la place exacte de son ancien bloc : l'ordre des
  // crochets ne change pas.
  const importer = useImportProjet(o, t);

  return { sauvegarder, sauvegarderAuto, exporter, importer, memoriserEncours };
}
