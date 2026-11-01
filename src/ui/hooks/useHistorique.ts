// ui/hooks/useHistorique.ts — Ce que Ctrl+Z rend : l'instantané avant une action annulable, et les
// deux gestes qui en prennent un avec leur contexte, vider le canevas et détacher le fichier.
//
// Sorti d'`App.tsx` le 2026-11-01, à l'identique : même pile, même plafond, mêmes instantanés. La
// pile elle-même et la copie d'un graphe vivent dans `ui/historique.ts` ; ce crochet ne fait que
// les relier à l'état de React. Le presse-papiers de nœuds est celui du système, voir
// `hooks/useCopierColler.ts`.
import { useCallback, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Edge } from "@xyflow/react";

import { empiler, instantane, type ContexteHistorique, type EntreeHistorique } from "../historique";
import { idsDe, oublierNoeuds } from "../oubli-noeuds";

type Niveau = { metaId: string; nom: string; nomEn?: string };
type GrapheRacine = { nodes: any[]; edges: Edge[] } | null;

export interface OptionsHistorique {
  noeudsRef: MutableRefObject<any[]>;
  aretesRef: MutableRefObject<Edge[]>;
  grapheRacineRef: MutableRefObject<GrapheRacine>;
  /** Les gestionnaires attachés au `data` de chaque nœud, définis une seule fois dans App. */
  callbacksNoeudRef: MutableRefObject<(() => Record<string, unknown>) | null>;
  cacheExec: MutableRefObject<Map<string, any>>;
  setNodes: Dispatch<SetStateAction<any[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setPile: Dispatch<SetStateAction<Niveau[]>>;
  setSel: (n: null) => void;
  setCurrentFilePath: Dispatch<SetStateAction<string | null>>;
  pile: Niveau[];
  currentFilePath: string | null;
}

export function useHistorique({
  noeudsRef, aretesRef, grapheRacineRef, callbacksNoeudRef, cacheExec,
  setNodes, setEdges, setPile, setSel, setCurrentFilePath, pile, currentFilePath,
}: OptionsHistorique) {
  const historiqueRef = useRef<EntreeHistorique<any, any>[]>([]);
  const MAX_HISTORIQUE = 50;

  // Instantané avant une action annulable. `contexte` n'est passé que par les actions qui
  // changent aussi la navigation dans les méta-composants ou le fichier ouvert — vider le
  // canevas. La copie garde les fichiers chargés par référence (voir ui/historique.ts).
  const pushHistorique = useCallback((contexte?: ContexteHistorique<any, any>) => {
    empiler(historiqueRef.current, instantane(noeudsRef.current, aretesRef.current, contexte), MAX_HISTORIQUE);
  }, []);

  const undo = useCallback(() => {
    const prev = historiqueRef.current.pop();
    if (!prev) return;
    // L'historique est sérialisé (JSON.stringify), donc les callbacks des nœuds
    // ont été perdus. On les ré-attache pour que les boutons reset/play/supprimer
    // restent fonctionnels après un Ctrl+Z.
    const cbs = callbacksNoeudRef.current?.();
    if (!cbs) return;
    setNodes(prev.nodes.map((n: any) => ({ ...n, data: { ...n.data, ...cbs } })));
    setEdges(prev.edges);
    if (prev.contexte) {
      // Le graphe racine mis de côté porte, lui aussi, des nœuds sans gestionnaires.
      grapheRacineRef.current = prev.contexte.racine
        ? { nodes: prev.contexte.racine.nodes.map((n: any) => ({ ...n, data: { ...n.data, ...cbs } })), edges: prev.contexte.racine.edges }
        : null;
      setPile(prev.contexte.pile);
      setCurrentFilePath(prev.contexte.cheminFichier);
    }
    setSel(null);
    cacheExec.current.clear();
    // CE QUE L'ANNULATION ABANDONNE S'OUBLIE AUSSI. Les résultats et les statuts vivent hors du
    // tableau des nœuds, et remettre un graphe d'avant les laissait en place : un nœud du graphe
    // annulé gardait son entrée, qu'un nœud neuf portant le même identifiant retrouvait ensuite.
    // Voir `ui/oubli-noeuds.ts`.
    oublierNoeuds([...idsDe(prev.nodes), ...idsDe(prev.contexte?.racine?.nodes)]);
  }, [setNodes, setEdges]);

  // Un seul onglet wf-1. Le bouton × vide le canevas — et Ctrl+Z le rend.
  //
  // Il vidait sans confirmation et sans passer par l'historique : un clic à côté de
  // « Sauvegarder » perdait le graphe entier, sans recours. L'instantané emporte aussi la
  // navigation dans les méta-composants et le fichier ouvert, que le ✕ remet à zéro :
  // vidé depuis l'intérieur d'un méta, le canevas revient au même endroit, avec son
  // graphe racine. Un canevas déjà vide n'ajoute rien à l'historique.
  //
  // Les URL de résultats ne sont PAS révoquées ici, contrairement à une suppression de
  // nœud : ce sont elles que Ctrl+Z doit rendre, lecteurs compris. Elles restent tenues
  // par l'historique, qui en garde au plus MAX_HISTORIQUE.
  const fermerOnglet = useCallback((id: string) => {
    void id;
    if (noeudsRef.current.length === 0 && pile.length === 0) return;
    pushHistorique({ pile, racine: grapheRacineRef.current, cheminFichier: currentFilePath });
    setNodes([]);
    setEdges([]);
    cacheExec.current.clear();
    setSel(null);
    setPile([]);
    grapheRacineRef.current = null;
    setCurrentFilePath(null);
    // LE GRAPHE EST ABANDONNÉ, DONC SES RÉSULTATS AUSSI. Sans cette ligne, un composant posé
    // ensuite sur le canevas vide reprenait l'identifiant « noeud-1 » et, avec lui, le lecteur, le
    // niveau et le message du workflow effacé, marqué « terminé » sans avoir tourné. Relevé par
    // Fabien, reproduit, et explique dans `ui/oubli-noeuds.ts`.
    oublierNoeuds([]);
  }, [setNodes, setEdges, pushHistorique, pile, currentFilePath]);

  // Détacher le projet de son fichier SANS toucher au canevas : l'équivalent d'un
  // « nouveau projet » qui garde le graphe. Le nom disparaît de la barre d'outils,
  // l'auto-save toutes les 30 s s'arrête — c'est le but : plus rien n'est écrit dans
  // l'ancien fichier — et le prochain Ctrl+S redemande où enregistrer. Annulable, comme
  // le vidage : l'instantané ne garde que le chemin, les nœuds ne bougeant pas.
  const detacherFichier = useCallback(() => {
    if (!currentFilePath) return;
    pushHistorique({ pile, racine: grapheRacineRef.current, cheminFichier: currentFilePath });
    setCurrentFilePath(null);
  }, [currentFilePath, pushHistorique, pile]);

  return { pushHistorique, undo, fermerOnglet, detacherFichier };
}
