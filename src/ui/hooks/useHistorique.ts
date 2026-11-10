// ui/hooks/useHistorique.ts — Ce que Ctrl+Z rend : l'instantané avant une action annulable, ce que
// Ctrl+Y rend : celui que l'annulation a quitté, et les deux gestes qui en prennent un avec leur
// contexte, vider le canevas et détacher le fichier.
//
// Sorti d'`App.tsx` le 2026-11-01, à l'identique : même pile, même plafond, mêmes instantanés. Les
// piles elles-mêmes et la copie d'un graphe vivent dans `ui/historique.ts` ; ce crochet ne fait que
// les relier à l'état de React. Le presse-papiers de nœuds est celui du système, voir
// `hooks/useCopierColler.ts`.
//
// LE RÉTABLISSEMENT, demandé par Fabien le 2026-11-10 : la seconde pile. Annuler et rétablir posent
// une entrée de la même façon, gestionnaires rattachés, navigation et fichier rendus, cache vidé,
// résultats des nœuds abandonnés oubliés ; ils ne diffèrent que par la pile qu'ils vident.
import { useCallback, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Edge } from "@xyflow/react";

import {
  annuler, instantane, noterAction, pilesVides, retablir,
  type ContexteHistorique, type EntreeHistorique, type PilesHistorique,
} from "../historique";
import { idsDe, oublierNoeuds } from "../oubli-noeuds";
import { urlsDUnFige } from "../urls-medias";
import { useBalayageDesUrls, useRacineDesUrls } from "./useUrlsMedias";

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
  /** Les nœuds de l'état : leur changement déclenche le balayage des URL de médias. */
  nodes: readonly unknown[];
}

export function useHistorique({
  noeudsRef, aretesRef, grapheRacineRef, callbacksNoeudRef, cacheExec,
  setNodes, setEdges, setPile, setSel, setCurrentFilePath, pile, currentFilePath, nodes,
}: OptionsHistorique) {
  const pilesRef = useRef<PilesHistorique<any, any>>(pilesVides());
  const MAX_HISTORIQUE = 50;
  // LES DEUX PILES TIENNENT LES URL DE MÉDIAS DE LEURS INSTANTANÉS : Ctrl+Z et Ctrl+Y doivent rendre
  // des lecteurs qui jouent. Une entrée sortie au-delà du plafond, ou effacée par une action neuve,
  // lâche les siennes. Un instantané ne change plus après sa prise : ses adresses se relèvent une
  // fois, à sa première lecture. Voir `ui/urls-medias.ts`.
  useRacineDesUrls("historique", () =>
    [...pilesRef.current.annulation, ...pilesRef.current.retablissement].map(urlsDUnFige));
  // LA NAVIGATION ET LE FICHIER DE L'INSTANT, que Ctrl+Z photographie pour Ctrl+Y. Ils arrivent
  // en valeurs, et les gestes ci-dessous ne changent pas d'identité à chaque rendu.
  const pileRef = useRef(pile);
  pileRef.current = pile;
  const cheminRef = useRef(currentFilePath);
  cheminRef.current = currentFilePath;
  // LE BALAYAGE VIT ICI, avec ce qu'il lit d'autre : le canevas, le graphe racine et la navigation,
  // que ce crochet photographie déjà. Appelé depuis `App.tsx`, avec son import, il le portait à 401
  // lignes de code, une de plus que la norme.
  useBalayageDesUrls(nodes, grapheRacineRef, pileRef);

  // Instantané avant une action annulable. `contexte` n'est passé que par les actions qui
  // changent aussi la navigation dans les méta-composants ou le fichier ouvert — vider le
  // canevas. La copie garde les fichiers chargés par référence (voir ui/historique.ts).
  const pushHistorique = useCallback((contexte?: ContexteHistorique<any, any>) => {
    noterAction(pilesRef.current, instantane(noeudsRef.current, aretesRef.current, contexte), MAX_HISTORIQUE);
  }, []);

  /** L'état à l'écran, que la pile d'en face rendra. */
  const etatCourant = useCallback((avecContexte: boolean) => instantane(noeudsRef.current, aretesRef.current,
    avecContexte ? { pile: pileRef.current, racine: grapheRacineRef.current, cheminFichier: cheminRef.current } : undefined), []);

  /** Pose une entrée de l'une ou l'autre pile. */
  const poser = useCallback((prev: EntreeHistorique<any, any>, cbs: Record<string, unknown>) => {
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

  // L'historique est sérialisé (JSON.stringify), donc les callbacks des nœuds
  // ont été perdus. On les ré-attache pour que les boutons reset/play/supprimer
  // restent fonctionnels après un Ctrl+Z.
  //
  // LES GESTIONNAIRES SONT DEMANDÉS AVANT DE VIDER UNE PILE : sans eux rien ne se pose. Retirer
  // l'entrée d'abord la perdait quand ils manquaient ; avec deux piles, l'état courant serait en plus
  // passé pour rien sur l'autre.
  const undo = useCallback(() => {
    const cbs = callbacksNoeudRef.current?.();
    if (!cbs) return;
    const prev = annuler(pilesRef.current, etatCourant);
    if (prev) poser(prev, cbs);
  }, [etatCourant, poser]);

  const redo = useCallback(() => {
    const cbs = callbacksNoeudRef.current?.();
    if (!cbs) return;
    const suivant = retablir(pilesRef.current, etatCourant);
    if (suivant) poser(suivant, cbs);
  }, [etatCourant, poser]);

  // Un seul onglet wf-1. Le bouton × vide le canevas — et Ctrl+Z le rend.
  //
  // Il vidait sans confirmation et sans passer par l'historique : un clic à côté de
  // « Sauvegarder » perdait le graphe entier, sans recours. L'instantané emporte aussi la
  // navigation dans les méta-composants et le fichier ouvert, que le ✕ remet à zéro :
  // vidé depuis l'intérieur d'un méta, le canevas revient au même endroit, avec son
  // graphe racine. Un canevas déjà vide n'ajoute rien à l'historique.
  //
  // CE QUE CTRL+Z REND, ET CE QU'IL NE REND PAS. Les nœuds, les arêtes, la navigation et le
  // fichier, et les médias posés sur les nœuds : leurs URL sont tenues par l'entrée
  // d'historique, et le registre de `ui/urls-medias.ts` ne les révoque pas tant qu'elle vit.
  // Les RÉSULTATS, eux, ne sont pas dans l'historique : ils sont oubliés plus bas, leurs URL
  // révoquées, et le run suivant les refait. Ce commentaire disait le contraire, d'avant le
  // magasin des résultats.
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

  return { pushHistorique, undo, redo, fermerOnglet, detacherFichier };
}
