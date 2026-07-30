// ui/App.tsx — Application principale
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  type Node, type Edge, type Connection, type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { trouverMeta,
  estFrontiere, ID_ENTREE_FRONTIERE, ID_SORTIE_FRONTIERE,
  surChangementMetas, supprimerMeta } from "../core";
import { registre } from "../audio/adaptateur";
import "../audio/adaptateur";
import type { FicheAudio } from "../audio/types-domaine";

const trouverDef = (id: string) => registre.trouverDef(id);
const tousLesPlugins = () => registre.tousLesPlugins();
const couleurFlux = (id: string) => registre.couleurFlux(id);
const fluxCompatibles = (s: string, t: string) => registre.fluxCompatibles(s, t);
import { chargerSF2Globale, autoChargerSF2, sf2Nom } from "../plugins/soundfontGlobal";
import { useI18n, defautParametre } from "../i18n";

import { idUnique } from "./ids";
import { usePersistance } from "./hooks/usePersistance";
import { useMetaComposants } from "./hooks/useMetaComposants";
import { useExecutionGraphe } from "./hooks/useExecutionGraphe";
import { rechargerFichiersPersistes } from "./rechargerFichiers";
import { filtrerAretesInvalides } from "./validerGraphe";
import { BarreOutils } from "./BarreOutils";
import { Palette } from "./Palette";
import { Inspector } from "./Inspector";
import { nodeTypes as nodeTypesImport, edgeTypes as edgeTypesImport } from "./reactflowTypes";
import "./atelier.css";
import "./clavier.css";

// Forcer l'enregistrement des plugins
import "../audio/adaptateur";

import { chargerMetasLocaux, sauvegarderMetasLocaux } from "./metasLocaux";
import { installerMetasExemples } from "../plugins/meta-exemples";
import { setGrapheRef } from "../audio/graphe-embarque";
import { chargerNodesInstalles } from "../core";
// Restaure les données de backup si on vient d'une mise à jour (synchrone)
const api0 = (window as any).api;
if (api0?.majRestaurerBackupSync) {
  const backup = api0.majRestaurerBackupSync();
  if (backup) {
    console.log("[attic] Restauration backup post-mise-à-jour");
    if (backup.metas) localStorage.setItem("attic-metas", backup.metas);
    if (backup.encours) localStorage.setItem("attic-encours", backup.encours);
    if (backup.lang) localStorage.setItem("attic-lang", backup.lang);
    if (backup.nodesInstalles) localStorage.setItem("attic-nodes-installes", backup.nodesInstalles);
  }
}
const nbPluginsAvant = tousLesPlugins().length;
console.log(`[attic] Plugins avant chargerMetasLocaux: ${nbPluginsAvant}`);
chargerMetasLocaux();
installerMetasExemples();
// Restaure les nodes installés dynamiquement (.zip) avant le premier rendu.
chargerNodesInstalles();

// Diagnostic : vérifier que les plugins sont bien chargés
const nbPlugins = tousLesPlugins().length; console.log("[attic] Plugins charg�s:", nbPlugins);

// ── Types ──

interface DonneesNoeud {
  ficheId: string;
  parametres: Record<string, number | string>;
  statut: string;
  progression?: string;
  audioResultatUrl?: string;
  audioResultatNom?: string;
  audioResultatBuffer?: AudioBuffer;
  audioResultatMessage?: string;
  audioFichier?: File;
  midiFichier?: File;
  midiFichierSortie?: File;
  modeleFichier?: File;
  enregistrementBlob?: Blob;
  visualisationUrl?: string;
  nomFichier?: string;
  prioritaire?: boolean;
  imageResultatUrl?: string;
  imageResultatFile?: File;
  imageFichier?: File;
  imageNom?: string;
  svgFichier?: File;
  svgNom?: string;
  [key: string]: unknown;
}

type NoeudAtelier = Node<DonneesNoeud, "atelier">;

// nodeTypes/edgeTypes sont définis dans reactflowTypes.ts (hors du cycle HMR
// d'App.tsx) pour éviter l'avertissement React Flow #002.

// ── Helpers ──

function couleurArete(nodes: any[], source: string, sourceHandle: string): string {
  const node = nodes.find((n) => n.id === source);
  const ficheId = node?.data?.ficheId;
  const def = ficheId ? trouverDef(ficheId) : undefined;
  const idx = parseInt(sourceHandle.split(":")[1] ?? "0", 10);
  const type = def?.sorties[idx]?.type ?? "audio";
  return couleurFlux(type);
}

function tailleDefaut(def: FicheAudio): { width: number; height: number } {
  const nbPorts = Math.max(def.entrees.length, def.sorties.length, 1);
  const nbParams = def.parametres.length;
  let w = 260;
  if (def.id === "clavier-melodie") return { width: 500, height: 260 };
  if (def.id === "visualiseur-forme-onde") return { width: 420, height: 240 };
  if (def.id === "analyseur-spectre") return { width: 420, height: 300 };
  if (def.id === "spectrogramme") return { width: 420, height: 300 };
  if (def.id === "oscillateur") return { width: 420, height: 340 };
  if (def.id === "reponse-filtre") return { width: 420, height: 300 };
  if (def.id === "noms-instruments") return { width: 300, height: 320 };
  if (def.id === "styles-musicaux") return { width: 300, height: 320 };
  if (def.id === "emotions") return { width: 300, height: 320 };
  if (def.id === "tessitures-voix") return { width: 300, height: 320 };
  if (def.id === "generateur-script-ia") return { width: 380, height: 400 };
  if (def.id === "detecteur-accords") return { width: 320, height: 340 };
  if (def.id === "vu-metre") return { width: 300, height: 260 };
  if (def.id === "colorsynth") return { width: 280, height: 220 };
  if (def.id === "generateur-pochette") return { width: 280, height: 340 };
  if (def.id === "attracteur-ifs") return { width: 320, height: 320 };
  if (def.id === "rendu-image") return { width: 320, height: 320 };
  if (def.id === "entree-image") return { width: 320, height: 320 };
  if (def.id === "lecteur-svg") return { width: 320, height: 320 };
  if (def.id === "galerie-exposition") return { width: 280, height: 280 };
  if (def.id === "gestion-nodes") return { width: 280, height: 220 };
  if (def.id === "couleur-suno-ia") return { width: 300, height: 260 };
  if (def.id === "source-texte") return { width: 280, height: 200 };
  if (def.id === "sortie-texte") return { width: 280, height: 250 };
  if (def.id === "python-processor") return { width: 380, height: 300 };
  if (def.id === "sequenceur-batterie") return { width: 460, height: 320 };
  if (def.id === "sequenceur-batterie-avance") return { width: 480, height: 360 };
  if (def.id === "sequenceur-melodique") return { width: 460, height: 400 };
  if (def.id === "enveloppe-adsr") return { width: 420, height: 300 };
  if (def.id === "selecteur-multi-zones") return { width: 460, height: 340 };
  if (def.id.startsWith("collection-")) return { width: 380, height: 280 };
  if (def.id === "lecteur-analyse") return { width: 380, height: 300 };
  if (def.id === "classificateur-genre") return { width: 380, height: 300 };
  if (def.id === "multi-reservoirs") return { width: 280, height: 540 };
  // Nodes standard : largeur fixe, hauteur = contenu réel (en-tête + ports + statut)
  void nbParams; void w;
  return { width: 240, height: nbPorts * 22 + 96 };
}

// ── Application ──

export default function App() {
  return (
    <ReactFlowProvider>
      <Atelier />
    </ReactFlowProvider>
  );
}

function Atelier() {
  const { t, lang } = useI18n();
  // Références stables pour React Flow : évite l'avertissement #002 lors des
  // re-rendus / hot-reload, même si le module importé est ré-évalué.
  const nodeTypes = useMemo(() => nodeTypesImport, []);
  const edgeTypes = useMemo(() => edgeTypesImport, []);
  const [nodes, setNodes, onNodesChange] = useNodesState<NoeudAtelier>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const rfRef = useRef<HTMLDivElement>(null);
  const pointerDownRef = useRef(false);
  const [sel, setSel] = useState<NoeudAtelier | null>(null);
  // Navigation dans les méta-composants : pile de contextes (fil d'Ariane).
  // Vide = graphe racine. Chaque niveau = { metaId, nom } du méta ouvert.
  const [pile, setPile] = useState<{ metaId: string; nom: string; nomEn?: string }[]>([]);
  const pileRef = useRef(pile);
  pileRef.current = pile;
  const grapheRacineRef = useRef<{ nodes: NoeudAtelier[]; edges: Edge[] } | null>(null);
  const [enExecution, setEnExecution] = useState(false);
  const enExecRef = useRef(false);
  const [paletteOuverte, setPaletteOuverte] = useState(() => localStorage.getItem("attic-palette-ouverte") !== "false");
  const togglePalette = useCallback(() => {
    setPaletteOuverte((prev) => {
      const next = !prev;
      localStorage.setItem("attic-palette-ouverte", String(next));
      return next;
    });
  }, []);
  const noeudsRef = useRef(nodes);
  const aretesRef = useRef(edges);
  useEffect(() => {
    noeudsRef.current = nodes;
    aretesRef.current = edges;
    enExecRef.current = enExecution;
    setGrapheRef({ nodes, edges });
  }, [nodes, edges, enExecution]);
  const [rfInstance, setRfInstance] = useState<any>(null);

  // Un seul onglet wf-1. Le bouton × vide le canevas.
  const fermerOnglet = useCallback((id: string) => {
    void id;
    setNodes([]);
    setEdges([]);
    cacheExec.current.clear();
    setSel(null);
    setPile([]);
    grapheRacineRef.current = null;
  }, [setNodes, setEdges]);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const resumeAudio = useCallback(async () => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
  }, []);
  const lancerRef = useRef<any>(null);
  const cacheExec = useRef<Map<string, any>>(new Map());
  const [repertoire, setRepertoire] = useState(() => localStorage.getItem("attic-repertoire") || "");

  const changerRepertoire = useCallback((r: string) => {
    setRepertoire(r);
    localStorage.setItem("attic-repertoire", r);
  }, []);

  // Persistance des méta-composants : sauvegarde locale à chaque changement
  // (création, édition interne, import). Le chargement se fait au niveau module.
  useEffect(() => surChangementMetas(sauvegarderMetasLocaux), []);

  // Répertoire de travail par défaut (Electron) : le dossier « work » du projet.
  // Sert de dossier initial aux dialogues d'export/import tant que l'utilisateur
  // n'a pas choisi le sien (via l'icône « dossier » de la barre d'outils).
  useEffect(() => {
    if (repertoire) return;
    (async () => {
      const w = await (window as any).api?.obtenirRepertoireTravail?.();
      if (w) setRepertoire(w);
    })();
    // Exécuté une seule fois au montage ; le garde interne évite d'écraser un choix.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [prioritaire, setPrioritaire] = useState<string | null>(null);
  const prioritaireRef = useRef<string | null>(null);
  prioritaireRef.current = prioritaire;
  const [sf2NomState, setSf2NomState] = useState<string>(sf2Nom());
  // Presse-papier pour copier/coller de nœuds (Ctrl+C / Ctrl+V).
  // Historique pour undo (Ctrl+Z).
  const pressePapierRef = useRef<{ ficheId: string; parametres: Record<string, number | string>; width: number; height: number; data: Record<string, unknown> } | null>(null);
  const historiqueRef = useRef<{ nodes: any[]; edges: any[] }[]>([]);
  const MAX_HISTORIQUE = 50;

  const pushHistorique = useCallback(() => {
    historiqueRef.current.push({
      nodes: JSON.parse(JSON.stringify(noeudsRef.current.map((n) => ({ ...n, data: { ...n.data } })))),
      edges: JSON.parse(JSON.stringify(aretesRef.current)),
    });
    if (historiqueRef.current.length > MAX_HISTORIQUE) historiqueRef.current.shift();
  }, []);

  const undo = useCallback(() => {
    const prev = historiqueRef.current.pop();
    if (!prev) return;
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setSel(null);
    cacheExec.current.clear();
  }, [setNodes, setEdges]);

  // Auto-load SF2 au démarrage
  useEffect(() => {
    (async () => {
      const sf2 = await autoChargerSF2(repertoire);
      if (sf2) {
        setSf2NomState(sf2Nom());
        cacheExec.current.clear();
      }
    })();
  }, [repertoire]);

  // Mettre à jour prioritaire sur les nœuds
  useEffect(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, prioritaire: n.id === prioritaire } })));
  }, [prioritaire, setNodes]);
  const [theme, setTheme] = useState<"violet" | "black">("violet");

  useEffect(() => {
    if (theme === "violet") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Recadre la vue à chaque navigation dans/hors d'un méta-composant.
  useEffect(() => {
    const t = setTimeout(() => rfInstance?.fitView?.({ duration: 200, padding: 0.2 }), 60);
    return () => clearTimeout(t);
  }, [pile, rfInstance]);

  const [pluginsVersion, setPluginsVersion] = useState(0);
  const plugins = useMemo(() => tousLesPlugins(), [pluginsVersion]);

  // ── Chargement automatique de l'en-cours sauvegardé ──
  const enCoursCharge = useRef(false);
  useEffect(() => {
    if (enCoursCharge.current) return;
    enCoursCharge.current = true;
    (async () => {
      try {
        const brut = localStorage.getItem("attic-encours");
        if (!brut) return;
        const data = JSON.parse(brut);
        if (!data.nodes || !Array.isArray(data.nodes)) return;
        const cbs = callbacksNoeud();
        const nodesRestaures = data.nodes.map((n: any) => {
          const def = trouverDef(n.data.ficheId);
          const { width, height } = def ? tailleDefaut(def) : { width: 230, height: 200 };
          return {
            id: n.id, type: "atelier", position: n.position, width: n.width ?? width, height: n.height ?? height,
            data: {
              ficheId: n.data.ficheId,
              parametres: n.data.parametres ?? {},
              statut: "attente",
              zonesSelectionnees: n.data.zonesSelectionnees,
              nomFichier: n.data.nomFichier,
              onSupprimerNoeud: cbs.onSupprimerNoeud,
              onReinitialiser: cbs.onReinitialiser,
              onDefinirPrioritaire: cbs.onDefinirPrioritaire,
              onChargerAudio: cbs.onChargerAudio,
              onChargerMidi: cbs.onChargerMidi,
              onChargerImage: cbs.onChargerImage,
              onChargerSvg: cbs.onChargerSvg,
              onChangerEnregistrement: cbs.onChangerEnregistrement,
              onChangerParametre: cbs.onChangerParametre,
              onChangerZones: cbs.onChangerZones,
              onChargerIR: cbs.onChargerIR,
            },
          };
        });
        const edgesRestaures = (data.edges ?? []).map((e: any) => ({
          ...e, type: "arete-personnalisee",
          style: { stroke: couleurArete(nodesRestaures, e.source, e.sourceHandle), strokeWidth: 2.5 },
        }));
        const edgesValides = filtrerAretesInvalides(nodesRestaures, edgesRestaures);
        await rechargerFichiersPersistes(nodesRestaures);
        setNodes(nodesRestaures);
        setEdges(edgesValides);
        if (data.viewport && rfInstance) {
          queueMicrotask(() => rfInstance.setViewport(data.viewport));
        }
    } catch (e) {
      console.warn("[attic] Restauration de l'en-cours échouée", e);
    }
  })();
}, [pluginsVersion]); // après chargement des plugins

  // ── Exécution du graphe (hook extrait — voir DECOUPAGE-APP.md) ──
  // La boucle `lancer` + la réinitialisation en cascade + les statuts. La logique
  // pure d'ordonnancement/cache vit dans core/graphe.ts (testée).
  const { lancer, reinitialiserNoeud } = useExecutionGraphe({
    noeudsRef, aretesRef, enExecRef, prioritaireRef, audioCtxRef, cacheExec,
    edges, setNodes, setEnExecution, prioritaire, setPrioritaire, repertoire,
    onGrapheGenere: (nodeId, spec) => {
      setNodes((nds) => {
        const baseX = noeudsRef.current.find((n) => n.id === nodeId)?.position?.x ?? 200;
        const baseY = noeudsRef.current.find((n) => n.id === nodeId)?.position?.y ?? 200;
        const cbs = callbacksNoeud();
        const idsNouveaux: string[] = [];
        const nouveauxNodes = spec.nodes.map((specNode, i) => {
          const def = trouverDef(specNode.ficheId);
          const { width, height } = def ? tailleDefaut(def) : { width: 230, height: 200 };
          const parametres: Record<string, number | string> = {};
          if (def) for (const p of def.parametres) parametres[p.nom] = defautParametre(p, lang);
          const id = idUnique([...nds, ...idsNouveaux.map((nid) => ({ id: nid }))]);
          idsNouveaux.push(id);
          return {
            id, type: "atelier" as const,
            position: { x: baseX + 250 + i * 260, y: baseY + 40 },
            width, height,
            data: {
              ficheId: specNode.ficheId, parametres, statut: "attente",
              onSupprimerNoeud: cbs.onSupprimerNoeud,
              onReinitialiser: cbs.onReinitialiser,
              onDefinirPrioritaire: cbs.onDefinirPrioritaire,
              onChargerAudio: cbs.onChargerAudio,
              onChargerMidi: cbs.onChargerMidi,
              onChargerImage: cbs.onChargerImage,
              onChargerSvg: cbs.onChargerSvg,
              onChangerEnregistrement: cbs.onChangerEnregistrement,
              onChangerParametre: cbs.onChangerParametre,
              onChangerZones: cbs.onChangerZones,
              onChargerIR: cbs.onChargerIR,
            },
          };
        });
        // Créer les edges
        const nouveauxEdges = spec.edges.map((e, i) => {
          const srcId = idsNouveaux[e.source];
          return {
            id: `e-prompt-${nodeId}-${i}`,
            source: srcId,
            target: idsNouveaux[e.target],
            sourceHandle: "out:0",
            targetHandle: "in:0",
            type: "arete-personnalisee" as const,
            style: { stroke: couleurArete(nouveauxNodes, srcId, "out:0"), strokeWidth: 2.5 },
          };
        });
        setEdges((eds) => [...eds, ...nouveauxEdges]);
        return [...nds, ...nouveauxNodes];
      });
    },
    onNodeInstalle: () => {
      setPluginsVersion((v) => v + 1);
    },
  });
  lancerRef.current = lancer;

  // ── Suppression d'un nœud : nettoyage des URLs de résultat, du cache et cascade aval ──
  const supprimerNoeud = useCallback((ids: string | string[], opts: { filterNodes?: boolean } = {}) => {
    const idArr = Array.isArray(ids) ? ids : [ids];
    if (idArr.length === 0) return;
    // Révoquer les object URLs de résultats générés par le nœud (pas les fichiers
    // d'entrée audioUrl/enregistrementUrl, conservés pour que l'undo reste fonctionnel).
    for (const id of idArr) {
      const n = noeudsRef.current.find((nn) => nn.id === id);
      if (!n) continue;
      const d = n.data;
      if (d.audioResultatUrl) URL.revokeObjectURL(d.audioResultatUrl);
      if (d.imageResultatUrl) URL.revokeObjectURL(d.imageResultatUrl);
      if (d.visualisationUrl) URL.revokeObjectURL(d.visualisationUrl);
      if ((d as any).mp3Url) URL.revokeObjectURL((d as any).mp3Url);
    }
    // Réinitialiser les nœuds en aval et vider leurs entrées du cache d'exécution.
    for (const id of idArr) {
      reinitialiserNoeud(id);
    }
    // Retirer les nœuds et les arêtes du graphe (sauf si React Flow l'a déjà fait,
    // par exemple via la touche Delete).
    if (opts.filterNodes !== false) {
      setNodes((nds) => nds.filter((n) => !idArr.includes(n.id)));
    }
    setEdges((eds) => eds.filter((e) => !idArr.includes(e.source) && !idArr.includes(e.target)));
    setSel((prev) => prev && idArr.includes(prev.id) ? null : prev);
  }, [reinitialiserNoeud, setNodes, setEdges]);


  // Callbacks standard attachés à tout nœud (ajout, import, copier/coller).
  const callbacksNoeud = useCallback(() => ({
    onSupprimerNoeud: (nid: string) => {
      pushHistorique();
      supprimerNoeud(nid);
    },
    onReinitialiser: (nid: string) => reinitialiserNoeud(nid),
    onDefinirPrioritaire: (nid: string) => { setPrioritaire(nid); lancerRef.current(nid); },
    onChargerAudio: (nid: string, fichier: File) => {
      cacheExec.current.delete(nid);
      const api = (window as any).api;
      const chemin = api?.cheminFichier ? api.cheminFichier(fichier) : "";
      setNodes((nds2) => nds2.map((n) => n.id === nid ? { ...n, data: { ...n.data, audioFichier: fichier, audioNom: fichier.name, audioUrl: URL.createObjectURL(fichier), parametres: { ...n.data.parametres, Chemin: chemin } } } : n));
    },
    onChargerMidi: (nid: string, fichier: File) => {
      cacheExec.current.delete(nid);
      const api = (window as any).api;
      const chemin = api?.cheminFichier ? api.cheminFichier(fichier) : "";
      setNodes((nds2) => nds2.map((n) => n.id === nid ? { ...n, data: { ...n.data, midiFichier: fichier, midiNom: fichier.name, parametres: { ...n.data.parametres, Chemin: chemin } } } : n));
    },
    onChargerImage: (nid: string, fichier: File) => {
      cacheExec.current.delete(nid);
      const api = (window as any).api;
      const chemin = api?.cheminFichier ? api.cheminFichier(fichier) : "";
      setNodes((nds2) => nds2.map((n) => n.id === nid ? { ...n, data: { ...n.data, imageFichier: fichier, imageNom: fichier.name, parametres: { ...n.data.parametres, Chemin: chemin } } } : n));
    },
    onChargerSvg: (nid: string, fichier: File) => {
      cacheExec.current.delete(nid);
      const api = (window as any).api;
      const chemin = api?.cheminFichier ? api.cheminFichier(fichier) : "";
      setNodes((nds2) => nds2.map((n) => n.id === nid ? { ...n, data: { ...n.data, svgFichier: fichier, svgNom: fichier.name, parametres: { ...n.data.parametres, Chemin: chemin } } } : n));
    },
    onChangerEnregistrement: (nid: string, blob: Blob) => { const url = URL.createObjectURL(blob); setNodes((nds2) => nds2.map((n) => n.id === nid ? { ...n, data: { ...n.data, enregistrementBlob: blob, enregistrementUrl: url } } : n)); },
    onChangerParametre: (nid: string, nom: string, val: number | string) => {
      cacheExec.current.delete(nid);
      setNodes((nds2) => nds2.map((n) => n.id === nid ? { ...n, data: { ...n.data, parametres: { ...n.data.parametres, [nom]: val } } } : n));
      reinitialiserNoeud(nid);
    },
    onChangerZones: (nid: string, zones: { debut: number; duree: number }[]) => { cacheExec.current.delete(nid); setNodes((nds2) => nds2.map((n) => n.id === nid ? { ...n, data: { ...n.data, zonesSelectionnees: zones } } : n)); },
    onChargerIR: (nid: string, fichier: File) => { cacheExec.current.delete(nid); setNodes((nds2) => nds2.map((n) => n.id === nid ? { ...n, data: { ...n.data, irFichier: fichier, irNom: fichier.name } } : n)); },
  }), [setNodes, setEdges, reinitialiserNoeud, setPrioritaire, supprimerNoeud, pushHistorique, cacheExec, lancerRef]);

  // ── Ajouter / Supprimer ──
  const ajouterNoeud = useCallback((ficheId: string, pos?: { x: number; y: number }) => {
    const def = trouverDef(ficheId);
    if (!def) return;
    const position = pos ?? { x: 120 + Math.random() * 200, y: 80 + Math.random() * 240 };
    const parametres: Record<string, number | string> = {};
    for (const p of def.parametres) parametres[p.nom] = defautParametre(p, lang);
    const { width, height } = tailleDefaut(def);
    setNodes((nds) => [...nds, {
      id: idUnique(nds),
      type: "atelier",
      position,
      width,
      height,
      data: {
        ficheId, parametres, statut: "attente",
        ...callbacksNoeud(),
      },
    }]);
  }, [setNodes, setEdges, reinitialiserNoeud, setPrioritaire, callbacksNoeud]);

  // ── Copier / Coller (Ctrl+C / Ctrl+V) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ne pas intercepter si on tape dans un champ (textarea, input, select)
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "c" && sel) {
        e.preventDefault();
        const def = trouverDef(sel.data.ficheId as string);
        const { width, height } = def ? tailleDefaut(def) : { width: 230, height: 200 };
        pressePapierRef.current = {
          ficheId: sel.data.ficheId as string,
          parametres: { ...(sel.data.parametres as Record<string, number | string>) },
          width, height,
          data: {},
        };
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "x" && sel) {
        e.preventDefault();
        const def = trouverDef(sel.data.ficheId as string);
        const { width, height } = def ? tailleDefaut(def) : { width: 230, height: 200 };
        pressePapierRef.current = {
          ficheId: sel.data.ficheId as string,
          parametres: { ...(sel.data.parametres as Record<string, number | string>) },
          width, height,
          data: {},
        };
        // Sauvegarder pour undo puis supprimer
        pushHistorique();
        supprimerNoeud(sel.id);
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "v" && pressePapierRef.current) {
        e.preventDefault();
        const clip = pressePapierRef.current;
        const def = trouverDef(clip.ficheId);
        if (!def) return;
        const cbs = callbacksNoeud();
        setNodes((nds) => {
          const nouvelId = idUnique(nds);
          const position = {
            x: (sel?.position?.x ?? 120) + 40 + Math.random() * 30,
            y: (sel?.position?.y ?? 80) + 40 + Math.random() * 30,
          };
          return [...nds, {
            id: nouvelId,
            type: "atelier",
            position,
            width: clip.width,
            height: clip.height,
            data: {
              ficheId: clip.ficheId,
              parametres: { ...clip.parametres },
              statut: "attente",
              onSupprimerNoeud: cbs.onSupprimerNoeud,
              onReinitialiser: cbs.onReinitialiser,
              onDefinirPrioritaire: cbs.onDefinirPrioritaire,
              onChargerAudio: cbs.onChargerAudio,
              onChargerMidi: cbs.onChargerMidi,
              onChargerImage: cbs.onChargerImage,
              onChangerEnregistrement: cbs.onChangerEnregistrement,
              onChangerParametre: cbs.onChangerParametre,
              onChangerZones: cbs.onChangerZones,
              onChargerIR: cbs.onChargerIR,
            },
          }];
        });
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, callbacksNoeud, supprimerNoeud, pushHistorique, setNodes, undo]);

  // ── Méta-composants (§3.8) : grouper / dégrouper + navigation ──
  // Hook extrait — voir DECOUPAGE-APP.md. La logique pure vit dans core/meta.ts.
  const { grouper, degrouper, renommer, sauvegarderContexteCourant, ouvrirMeta, remonterA } = useMetaComposants({
    noeudsRef, aretesRef, pileRef, grapheRacineRef, cacheExec,
    setNodes, setEdges, setPile, setSel, callbacksNoeud,
  });

  // ── Glisser-déposer ──
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const ficheId = e.dataTransfer.getData("application/attic-fiche-id");
    if (!ficheId || !rfInstance || !wrapperRef.current) return;
    const bounds = wrapperRef.current.getBoundingClientRect();
    ajouterNoeud(ficheId, rfInstance.screenToFlowPosition({ x: e.clientX - bounds.left, y: e.clientY - bounds.top }));
  }, [ajouterNoeud, rfInstance]);

  const isValidConnection = useCallback((conn: Connection | Edge) => {
    const source = noeudsRef.current.find((n) => n.id === conn.source);
    const target = noeudsRef.current.find((n) => n.id === conn.target);
    if (!source || !target || !conn.sourceHandle || !conn.targetHandle) return false;
    // Un nœud-frontière accepte n'importe quel type (le port exposé hérite du
    // type interne relié).
    if (estFrontiere(source.data.ficheId as string) || estFrontiere(target.data.ficheId as string)) return true;
    const defS = trouverDef(source.data.ficheId);
    const defT = trouverDef(target.data.ficheId);
    if (!defS || !defT) return false;
    const si = parseInt(conn.sourceHandle.split(":")[1]);
    const ti = parseInt(conn.targetHandle.split(":")[1]);
    const typeS = defS.sorties[si]?.type;
    const typeT = defT.entrees[ti]?.type;
    if (!typeS || !typeT || !fluxCompatibles(typeS, typeT)) return false;
    return true;
  }, [trouverDef, fluxCompatibles]);

  const onConnect: OnConnect = useCallback((conn) => {
    if (!conn.sourceHandle || !conn.targetHandle) return;
    pushHistorique();
    const defT = trouverDef(noeudsRef.current.find((n) => n.id === conn.target)?.data.ficheId ?? "");
    const ti = parseInt(conn.targetHandle.split(":")[1]);
    const portTarget = defT?.entrees[ti];
    const c = couleurArete(noeudsRef.current, conn.source, conn.sourceHandle);
    setEdges((eds) => {
      // Remplacer une connexion existante sur un port d'entrée non dynamique.
      const nettoyees = portTarget && !portTarget.dynamique
        ? eds.filter((e) => !(e.target === conn.target && e.targetHandle === conn.targetHandle))
        : eds;
      return [...nettoyees, { ...conn, id: `e-${conn.source}-${conn.target}-${Date.now()}`, type: "arete-personnalisee", style: { stroke: c, strokeWidth: 2.5 } }];
    });
  }, [setEdges, pushHistorique, trouverDef, couleurFlux]);

  // Export / import du workflow (hook extrait — voir DECOUPAGE-APP.md).
  const { exporter, importer } = usePersistance({
    nodes, edges, setNodes, setEdges, rfInstance, repertoire,
    sauvegarderContexteCourant, grapheRacineRef, setPile,
    reinitialiserNoeud, supprimerNoeud, setPrioritaire, lancerRef, cacheExec,
  });

  // ── Filet de sécurité anti-curseur collé ──
  // Si le bouton souris est relâché hors de la fenêtre (second écran, Alt-Tab,
  // menu système…), React Flow peut rester en état "drag" quand le curseur
  // revient. On détecte un pointermove avec buttons===0 alors qu'on pensait le
  // bouton enfoncé, et on envoie pointerup/pointercancel au canevas pour forcer
  // la libération.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.isPrimary) pointerDownRef.current = true;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.isPrimary) pointerDownRef.current = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!pointerDownRef.current || e.isPrimary === false) return;
      if (e.buttons === 0 && rfRef.current) {
        pointerDownRef.current = false;
        const target = rfRef.current;
        const init = {
          bubbles: true,
          cancelable: true,
          pointerId: e.pointerId,
          pointerType: e.pointerType,
          button: 0,
          buttons: 0,
          clientX: e.clientX,
          clientY: e.clientY,
        };
        target.dispatchEvent(new PointerEvent("pointerup", init));
        target.dispatchEvent(new PointerEvent("pointercancel", init));
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return (
    <div className="attic-app" style={{ gridTemplateColumns: paletteOuverte ? "260px 1fr 280px" : "40px 1fr 280px" }}>
      <Palette
        ouverte={paletteOuverte}
        onToggle={togglePalette}
        plugins={plugins.filter((p) => !estFrontiere(p.id))}
        onSupprimerMeta={(id) => {
          const meta = trouverMeta(id);
          const nom = (lang === "en" && meta?.nomEn ? meta.nomEn : meta?.nom) ?? id;
          if (!window.confirm(t("meta.confirmSupprimerCatalogue").replace("{nom}", nom))) return;
          // Retire aussi ses instances éventuelles du graphe courant (sinon nœuds orphelins).
          const aRetirer = noeudsRef.current.filter((n) => n.data.ficheId === id).map((n) => n.id);
          supprimerMeta(id);
          pushHistorique();
          supprimerNoeud(aRetirer);
        }}
      />
      <div className="attic-canevas" ref={wrapperRef} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
        <BarreOutils
          theme={theme} setTheme={setTheme}
          enExecution={enExecution}
          repertoire={repertoire}
          onChoisirDossier={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.webkitdirectory = true;
            input.onchange = (e: any) => {
              const files = e.target.files;
              if (files?.length) changerRepertoire(files[0].webkitRelativePath.split("/")[0]);
            };
            input.click();
          }}            
          onLancer={async () => {
            await lancer();
            rfInstance?.fitView?.({ duration: 200, padding: 0.2 });
          }}
          onResumeAudio={resumeAudio}
          nbPlugins={nbPlugins}
          sf2Nom={sf2NomState}
          onChargerSF2={async (f) => {
            try {
              await chargerSF2Globale(await f.arrayBuffer(), f.name);
              setSf2NomState(f.name);
              localStorage.setItem("attic-sf2-nom", f.name);
              cacheExec.current.clear();
            } catch (e: any) {
              console.error("[attic] Échec chargement SF2 :", e);
              window.alert(`Échec du chargement du SoundFont : ${e?.message ?? e}`);
            }
          }}
          onDetacher={() => {
            if ((window as any).api) { (window as any).api.nouvelleFenetre?.(); }
            else { window.open(location.href, '_blank', 'width=1400,height=900'); }
          }}
          onExporter={exporter}
          onSauvegarder={() => {
            try {
              // Sauver le contexte courant : grapheRacineRef contient alors le graphe
              // RACINE même si l'on est descendu dans un méta-composant. Sinon on
              // écrasait la sauvegarde du canevas avec l'intérieur du méta affiché.
              sauvegarderContexteCourant();
              const racine = grapheRacineRef.current ?? { nodes, edges };
              // Garde anti-perte : ne pas écraser une sauvegarde non-vide par un
              // canevas vide (crash/restauration laissant la racine vide).
              if (racine.nodes.length === 0) {
                let ancienNonVide = false;
                try {
                  const a = localStorage.getItem("attic-encours");
                  ancienNonVide = !!a && Array.isArray(JSON.parse(a).nodes) && JSON.parse(a).nodes.length > 0;
                } catch { /* sauvegarde illisible : on laisse écraser */ }
                if (ancienNonVide && !window.confirm(t("msg.confirmEcraserSauvegarde"))) return;
              }
              const data = {
                nodes: racine.nodes.map((n: any) => ({
                  id: n.id, type: n.type, position: n.position, width: n.width, height: n.height,
                  data: {
                    ficheId: n.data.ficheId,
                    parametres: n.data.parametres,
                    zonesSelectionnees: n.data.zonesSelectionnees,
                    nomFichier: n.data.nomFichier,
                  },
                })),
                edges: racine.edges.map((e: any) => ({
                  id: e.id, source: e.source, target: e.target,
                  sourceHandle: e.sourceHandle, targetHandle: e.targetHandle,
                })),
                viewport: rfInstance?.getViewport(),
                date: new Date().toISOString(),
              };
              localStorage.setItem("attic-encours", JSON.stringify(data));
              setSel((prev) => prev ? { ...prev, data: { ...prev.data, audioResultatMessage: t("msg.enCoursSauvegarde") } } : null);
              setTimeout(() => setSel((prev) => prev ? { ...prev, data: { ...prev.data, audioResultatMessage: undefined } } : null), 2000);
            } catch (e) {
              console.error("[attic] Sauvegarde échouée", e);
            }
          }}
          onImporter={importer}
        />
        <div className="attic-onglets">
          <span className="attic-onglet actif">
            <button className="attic-onglet-fermer" onClick={(e) => { e.stopPropagation(); fermerOnglet("wf-1"); }} title={t("workflow.nouveauTitre")}>✕</button>
          </span>
        </div>
        <div className="attic-meta-actions">
          {pile.length > 0 ? (
            <>
              <button onClick={() => ajouterNoeud(ID_ENTREE_FRONTIERE)} title={t("meta.ajoutEntree")}>➕ {t("meta.entree")}</button>
              <button onClick={() => ajouterNoeud(ID_SORTIE_FRONTIERE)} title={t("meta.ajoutSortie")}>➕ {t("meta.sortie")}</button>
            </>
          ) : (
            <>
              <button onClick={grouper} title={t("meta.grouperTitle")}>⊟ {t("meta.grouper")}</button>
              <button onClick={degrouper} title={t("meta.degrouperTitle")}>⊞ {t("meta.degrouper")}</button>
              <button onClick={renommer} title={t("meta.renommerTitle")}>✎ {t("meta.renommer")}</button>
            </>
          )}
        </div>
        {pile.length > 0 && (
          <div className="attic-filariane">
            <button onClick={() => remonterA(-1)}>{t("meta.atelier")}</button>            {pile.map((niv, i) => (
              <span key={i}>
                <span className="sep">›</span>
                <button onClick={() => remonterA(i)} disabled={i === pile.length - 1}>{lang === "en" && niv.nomEn ? niv.nomEn : niv.nom}</button>
              </span>
            ))}
          </div>
        )}
        <ReactFlow<NoeudAtelier>
          ref={rfRef}
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          onNodeClick={(_, n) => setSel(n)}
          onNodeDoubleClick={(_, n) => { if (trouverMeta(n.data.ficheId as string)) ouvrirMeta(n.data.ficheId as string); }}
          onPaneClick={() => setSel(null)}
          onInit={setRfInstance}
          fitView deleteKeyCode={["Delete"]}
          panOnDrag={true}
          selectionOnDrag={false}
          selectNodesOnDrag={false}
          onNodesDelete={(deletedNodes) => {
            pushHistorique();
            supprimerNoeud(deletedNodes.map((n) => n.id), { filterNodes: false });
          }}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
      <Inspector
        noeud={nodes.find((n) => n.id === sel?.id) ?? null}
        def={sel ? trouverDef(sel.data.ficheId) : undefined}
        onChangerParametre={(nom, val) => {
          if (!sel) return;
          cacheExec.current.delete(sel.id);
          setNodes((nds) => nds.map((n) => {
            if (n.id !== sel.id) return n;
            return { ...n, data: { ...n.data, parametres: { ...n.data.parametres, [nom]: val } } };
          }));
          setSel((prev) => prev ? { ...prev, data: { ...prev.data, parametres: { ...prev.data.parametres, [nom]: val } } } : null);
          reinitialiserNoeud(sel.id);
        }}
        onChargerFichier={(key, fichier) => {
          if (!sel) return;
          setNodes((nds) => nds.map((n) => n.id === sel.id ? { ...n, data: { ...n.data, [key]: fichier, audioNom: fichier.name } } : n));
        }}
        onSupprimer={() => {
          if (sel) {
            pushHistorique();
            supprimerNoeud(sel.id);
          }
        }}
        onReinitialiser={() => {
          if (sel) reinitialiserNoeud(sel.id);
        }}
        onEnregistrer={(id, blob) => {
          const url = URL.createObjectURL(blob);
          setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, enregistrementBlob: blob, enregistrementUrl: url } } : n));
        }}
      />
    </div>
  );
}
