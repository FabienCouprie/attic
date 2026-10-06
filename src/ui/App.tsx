// ui/App.tsx — Application principale
import { useRealisateurDemo } from "./demo/useRealisateurDemo";
import { reglagesApresChangement } from "../core/reglages-lies";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  type Node, type Edge, type Connection, type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { trouverMeta,
  estFrontiere, estBulle, estSubstitution, fermeraitUnCycle, ID_ENTREE_FRONTIERE, ID_SORTIE_FRONTIERE,
  surChangementMetas, supprimerMeta, traduireConnexion, type AreteG, type NoeudG } from "../core";

import "../audio/adaptateur";

const trouverDef = (id: string) => registreUI().trouverDef(id);
/** Le temps qu'on laisse passer après le dernier réglage avant de relancer un nœud qui le demande.
 *  Assez long pour qu'une valeur tapée chiffre par chiffre ne lance qu'une fois, assez court pour
 *  qu'on entende le résultat du geste qu'on vient de faire. */
const DELAI_RELANCE_MS = 350;
const tousLesPlugins = () => registreUI().tousLesPlugins();
const couleurFlux = (id: string) => registreUI().couleurFlux(id);
import { chargerSF2Globale, autoChargerSF2, sf2Nom } from "../plugins/soundfontGlobal";
import { useI18n, defautParametre, defautCanoniqueChoix } from "../i18n";

import { idUnique } from "./ids";
import { planDeGrapheEngendre } from "./graphe-engendre";
import { useDictee } from "./dictee/useDictee";
import type { Commande } from "./dictee/commandes-dictee";
import { dernierDeFiche, noeudCourant, positionSuivante, type NoeudPose } from "./dictee/pose-dictee";
import { tailleDefaut } from "./tailles-noeuds";
import { positionsEnCascade, sorteDeposee, type SorteDeposee } from "./fichiers-deposes";
import { usePersistance } from "./hooks/usePersistance";
import { useMetaComposants } from "./hooks/useMetaComposants";
import { useExecutionGraphe, CHAMPS_UTILISATEUR, CHAMPS_COPIABLES, CHAMPS_RESULTAT } from "./hooks/useExecutionGraphe";
import { CLE_PREFERENCE, PERIODE_SAUVEGARDE_MS, lirePreference } from "./sauvegarde-auto";
import { ecrireEconomieMemoire, lireEconomieMemoire } from "./economie-memoire";
import { ecrireProfondeurExport, lireProfondeurExport } from "./profondeur-export";
import type { ProfondeurExport } from "../audio/io";
import { rechargerFichiersPersistes } from "./rechargerFichiers";
import { empiler, instantane, type ContexteHistorique, type EntreeHistorique } from "./historique";
import { filtrerAretesInvalides, validerArete } from "./validerGraphe";
import { libererGlissement, relachementManque } from "./liberer-glissement";
import { categorieNoeud, COULEURS_CATEGORIE } from "./AtelierNode";
import { BarreOutils } from "./BarreOutils";
import { Palette } from "./Palette";
import { MenuContextuel, type EntreeMenu, type EtatMenu } from "./MenuContextuel";
import { useSauvegardeAutomatique } from "./hooks/useSauvegardeAutomatique";
import { useFiletGlissement } from "./hooks/useFiletGlissement";
import { useBulles } from "./hooks/useBulles";
import { useRepliBulles } from "./hooks/useRepliBulles";
import { signatureBulles, synchroniserFichesBulles } from "./fichesBulles";
import { Inspector } from "./Inspector";
import { EXEMPLES, fichierDExemple } from "./exemples";
import { nodeTypes as nodeTypesImport, edgeTypes as edgeTypesImport } from "./reactflowTypes";
import "./atelier.css";
import "./clavier.css";

// Forcer l'enregistrement des plugins
import "../audio/adaptateur";

import { chargerMetasLocaux, sauvegarderMetasLocaux } from "./metasLocaux";
import { installerMetasExemples } from "../plugins/meta-exemples";
import { setGrapheRef } from "../audio/graphe-embarque";
import { chargerNodesInstalles } from "../core";
import { PanneauInspecteur } from "./PanneauInspecteur";
import { registreUI } from "./registre-actif";
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
// Métas dont un sous-nœud référence un plugin introuvable (renommé/supprimé) :
// non réinjectés dans le catalogue par chargerMetasLocaux (qui les garde en
// stockage), mais signalés après le premier rendu (cf. useEffect plus bas) —
// sinon ils disparaissent de la palette sans qu'aucune trace n'explique pourquoi.
const metasNonRestaures = chargerMetasLocaux();
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
  pdfFichier?: File;
  pdfNom?: string;
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
  // Placement des éléments décoratifs (note / cadre) : après un clic sur la barre
  // d'outils, le prochain clic sur le canevas pose l'élément à l'endroit cliqué.
  const [pendingAdd, setPendingAdd] = useState<null | "comment" | "frame">(null);
  const pendingAddRef = useRef(pendingAdd);
  pendingAddRef.current = pendingAdd;
  // Navigation dans les méta-composants : pile de contextes (fil d'Ariane).
  // Vide = graphe racine. Chaque niveau = { metaId, nom } du méta ouvert.
  const [pile, setPile] = useState<{ metaId: string; nom: string; nomEn?: string }[]>([]);
  const pileRef = useRef(pile);
  pileRef.current = pile;
  const grapheRacineRef = useRef<{ nodes: NoeudAtelier[]; edges: Edge[] } | null>(null);
  const [enExecution, setEnExecution] = useState(false);
  const enExecRef = useRef(false);
  const [paletteOuverte, setPaletteOuverte] = useState(() => localStorage.getItem("attic-palette-ouverte") !== "false");
  // Sauvegarde automatique : bascule du groupe Fichier, retenue d'une session à l'autre.
  // Coupée, elle l'est pour de bon — ni au battement des 30 s, ni à la fermeture.
  const [sauvegardeAutoActive, setSauvegardeAutoActive] = useState(() => lirePreference());
  const basculerSauvegardeAuto = useCallback(() => {
    setSauvegardeAutoActive((prev) => {
      const suivant = !prev;
      try { localStorage.setItem(CLE_PREFERENCE, suivant ? "1" : "0"); } catch {}
      return suivant;
    });
  }, []);
  // Économie de mémoire sur les pistes longues : bascule voisine, même groupe. Elle ne change
  // rien en deçà de dix minutes ; au-delà, elle décide si les nœuds intermédiaires reçoivent
  // leur aperçu écoutable ou le bouton qui le construit à la demande.
  const [economieMemoire, setEconomieMemoire] = useState(() => lireEconomieMemoire());
  // La profondeur des fichiers ecrits. Elle ne prend effet qu au prochain lancement : le blob
  // est construit pendant l execution, et les apercus deja en memoire gardent la leur.
  const [profondeurExport, setProfondeurExport] = useState<ProfondeurExport>(() => lireProfondeurExport());
  const changerProfondeurExport = useCallback((bits: ProfondeurExport) => {
    ecrireProfondeurExport(bits);
    setProfondeurExport(bits);
  }, []);
  const basculerEconomieMemoire = useCallback(() => {
    setEconomieMemoire((prev) => {
      const suivant = !prev;
      ecrireEconomieMemoire(suivant);
      return suivant;
    });
  }, []);
  // Le moteur la lit au moment où il écrit les résultats, et non à la construction de `lancer` :
  // une bascule pendant un rendu d'une heure doit valoir pour la suite de ce rendu-là.
  const economieMemoireRef = useRef(economieMemoire);
  economieMemoireRef.current = economieMemoire;
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
  const rfInstanceRef = useRef(rfInstance);
  rfInstanceRef.current = rfInstance;

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
  const callbacksNoeudRef = useRef<(() => Record<string, (...args: any[]) => any>) | null>(null);
  const [repertoire, setRepertoire] = useState(() => localStorage.getItem("attic-repertoire") || "");

  const [currentFilePath, setCurrentFilePath] = useState<string | null>(() => {
    try {
      return localStorage.getItem("attic-current-file-path");
    } catch {
      return null;
    }
  });

  // Met à jour le titre de la fenêtre et le localStorage quand le fichier courant change.
  useEffect(() => {
    if (currentFilePath) {
      localStorage.setItem("attic-current-file-path", currentFilePath);
      document.title = `[Attic] ${currentFilePath.split(/[\\/]/).pop() || currentFilePath}`;
    } else {
      localStorage.removeItem("attic-current-file-path");
      document.title = "Attic";
    }
  }, [currentFilePath]);

  const changerRepertoire = useCallback((r: string) => {
    setRepertoire(r);
    localStorage.setItem("attic-repertoire", r);
  }, []);

  // Persistance des méta-composants : sauvegarde locale à chaque changement
  // (création, édition interne, import). Le chargement se fait au niveau module.
  useEffect(() => surChangementMetas(() => {
    sauvegarderMetasLocaux();
    setPluginsVersion((v) => v + 1);
  }), []);

  // Avertit (une fois, après le premier rendu) si des méta-composants n'ont pas
  // pu être réinjectés dans le catalogue — sinon leur disparition silencieuse
  // (cf. metasNonRestaures, calculé au chargement du module) passe pour une
  // perte de données côté sauvegarde alors que la cause est un plugin renommé
  // ou supprimé depuis. Toujours en stockage (metasLocaux.ts) : rien n'est perdu.
  useEffect(() => {
    if (metasNonRestaures.length === 0) return;
    const detail = metasNonRestaures
      .map((m) => `• ${m.nom} (${m.manquants.join(", ")})`)
      .join("\n");
    if (typeof alert !== "undefined") {
      alert(t("persistance.metasNonRestaures").replace("{nb}", String(metasNonRestaures.length)) + "\n\n" + detail);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  type PressePapierItem = {
    ficheId: string;
    parametres: Record<string, number | string>;
    width: number;
    height: number;
    data: Record<string, unknown>;
    dx: number;
    dy: number;
  };
  const pressePapierRef = useRef<PressePapierItem[] | null>(null);
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
  const [theme, setTheme] = useState<"violet" | "black">("black");

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
  const [menu, setMenu] = useState<EtatMenu | null>(null);
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
              audioChemin: n.data.audioChemin,
              sfzChemin: n.data.sfzChemin,
              sfzNom: n.data.sfzNom,
              sequenceNotes: n.data.sequenceNotes,
              // Le découpage d'un montage et les pistes qu'on y a vidées : une session reprise
              // rendait sinon un montage que personne n'avait découpé.
              morceaux: n.data.morceaux,
              pistesVidees: n.data.pistesVidees,
              nomFichier: n.data.nomFichier,
              nom: n.data.nom,
              nomEn: n.data.nomEn,
              couleur: n.data.couleur,
              // Les deux champs d'une bulle. Sans eux, une session reprise rendrait un nœud de bulle
              // sans ports et ses arêtes perdues : la panne silencieuse relevée au relevé des risques.
              bulle: n.data.bulle,
              bulleOuverte: n.data.bulleOuverte,
              onSupprimerNoeud: cbs.onSupprimerNoeud,
              onReinitialiser: cbs.onReinitialiser,
              onDefinirPrioritaire: cbs.onDefinirPrioritaire,
              onChargerAudio: cbs.onChargerAudio,
              onChargerMidi: cbs.onChargerMidi,
              onChargerImage: cbs.onChargerImage,
              onChargerSvg: cbs.onChargerSvg,
              onChargerPdf: cbs.onChargerPdf,
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

  // ── Exécution du graphe, dans hooks/useExecutionGraphe.ts ──
  // La boucle `lancer` + la réinitialisation en cascade + les statuts. La logique
  // pure d'ordonnancement/cache vit dans core/graphe.ts (testée).
  const { lancer, arreter, reinitialiserNoeud, reinitialiserAval, reinitialiserPourReglage, reinitialiserTout } = useExecutionGraphe({
    noeudsRef, aretesRef, enExecRef, prioritaireRef, audioCtxRef, cacheExec, economieMemoireRef,
    pileMetaRef: pileRef,
    edges, setNodes, setEnExecution, prioritaire, setPrioritaire, repertoire,
    onGrapheGenere: (nodeId, spec) => {
      // LE PLAN SE CALCULE HORS DES POSEURS, et les deux updaters qui suivent ne font qu'ajouter.
      // Créer les arêtes DANS l'updater de `setNodes` les posait deux fois sous `StrictMode`, qui
      // appelle un updater deux fois pour débusquer exactement cet effet de bord ; voir
      // `ui/graphe-engendre.ts`, qui porte le calcul et son histoire.
      {
        const baseX = noeudsRef.current.find((n) => n.id === nodeId)?.position?.x ?? 200;
        const baseY = noeudsRef.current.find((n) => n.id === nodeId)?.position?.y ?? 200;
        const cbs = callbacksNoeud();
        const plan = planDeGrapheEngendre(spec, noeudsRef.current, `${nodeId}-${Date.now()}`);
        for (const c of plan.cycles) {
          console.warn(`[attic] Prompt → graphe : arête ${c.source} → ${c.target} écartée, elle refermerait un cycle.`);
        }
        const idsNouveaux: string[] = plan.ids;
        const nouveauxNodes = spec.nodes.map((specNode, i) => {
          const def = trouverDef(specNode.ficheId);
          const { width, height } = def ? tailleDefaut(def) : { width: 230, height: 200 };
          const parametres: Record<string, number | string> = {};
          if (def) for (const p of def.parametres) {
            // Tout paramètre « choix » passe par la forme canonique (indépendante de la
// langue), y compris SANS optionIds : la valeur stockée doit correspondre à
// l'`<option value>` du menu, qui reste le terme français. Restreindre ce
// traitement aux seuls optionIds créait, en anglais, des nœuds dont le
// paramètre valait par ex. "Center" — absent du menu (donc affiché comme
// « Left ») et refusé par l'exécution.
parametres[p.nom] = p.type === "choix" ? defautCanoniqueChoix(p) : defautParametre(p, lang);
          }
          return {
            id: idsNouveaux[i], type: "atelier" as const,
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
              onChargerPdf: cbs.onChargerPdf,
              onChangerEnregistrement: cbs.onChangerEnregistrement,
              onChangerParametre: cbs.onChangerParametre,
              onChangerZones: cbs.onChangerZones,
              onChargerIR: cbs.onChargerIR,
            },
          };
        });
        const nouveauxEdges: Edge[] = plan.aretes.map((a) => ({
          ...a,
          sourceHandle: "out:0",
          targetHandle: "in:0",
          type: "arete-personnalisee" as const,
          style: { stroke: couleurArete(nouveauxNodes, a.source, "out:0"), strokeWidth: 2.5 },
        }));
        setNodes((nds) => [...nds, ...nouveauxNodes]);
        setEdges((eds) => [...eds, ...nouveauxEdges]);
      }
    },
    onNodeInstalle: () => {
      setPluginsVersion((v) => v + 1);
    },
  });
  lancerRef.current = lancer;

  // ── Relance après un réglage, pour les nœuds qui la demandent ──
  //
  // UN RÉGLAGE PÉRIME LE RÉSULTAT, et le moteur l'efface : on relance quand on veut. C'est ce qu'il
  // faut pour un calcul qui coûte des secondes. Mais un nœud dont le calcul propre est négligeable et
  // dont l'amont est en cache se relance pour presque rien, tandis que son résultat effacé coûte très
  // cher : la ligne de temps du Montage se règle EN ÉCOUTANT, et déplacer une piste faisait
  // disparaître le son qu'on écoutait. La fiche le déclare par `relanceAutomatique`.
  //
  // LA TEMPORISATION N'EST PAS UN CONFORT. Le champ numérique de l'inspecteur écrit à CHAQUE FRAPPE :
  // taper « 12,5 » appellerait trois fois, et un curseur qu'on traîne, cent fois. Le minuteur ne garde
  // que la dernière valeur d'une rafale.
  const minuteursRelance = useRef(new Map<string, number>());
  const relancerApresReglage = useCallback((nid: string) => {
    const fiche = trouverDef(String(noeudsRef.current.find((n) => n.id === nid)?.data.ficheId ?? ""));
    if (!(fiche as { relanceAutomatique?: boolean } | undefined)?.relanceAutomatique) return;
    const enCours = minuteursRelance.current.get(nid);
    if (enCours !== undefined) window.clearTimeout(enCours);
    minuteursRelance.current.set(nid, window.setTimeout(() => {
      minuteursRelance.current.delete(nid);
      lancerRef.current?.(nid);
    }, DELAI_RELANCE_MS));
  }, [noeudsRef, lancerRef]);

  // Les minuteurs en vol meurent avec la fenêtre : sans cela, une relance pourrait partir après le
  // démontage, sur un graphe qui n'existe plus.
  /**
   * CHANGER UN RÉGLAGE, ET IL N'Y A QU'UNE FAÇON DE LE FAIRE.
   *
   * POURQUOI CETTE FONCTION EXISTE, relevé par Fabien : « toucher le gain du montage pendant la
   * lecture oblige DE NOUVEAU à redémarrer le nœud ». Le même geste avait DEUX points d'appel, l'un
   * sur le nœud et l'autre dans l'inspecteur, et ils avaient divergé : le premier gardait ce que le
   * nœud avait désigné de ses entrées et relançait, le second faisait une remise à zéro complète et
   * ne relançait pas. Régler depuis le nœud marchait donc, et régler depuis l'inspecteur arrêtait
   * l'écoute. Un commentaire disait déjà « il y en a deux dans ce fichier » : le dire ne suffit pas,
   * deux copies d'une règle finissent toujours par se séparer.
   *
   * Rend les réglages obtenus, dont l'inspecteur a besoin pour se mettre à jour lui-même.
   */
  const changerReglage = useCallback((nid: string, nom: string, val: number | string) => {
    const noeud = noeudsRef.current.find((n) => n.id === nid);
    if (!noeud) return null;
    cacheExec.current.delete(nid);
    const suite = reglagesApresChangement(String(noeud.data.ficheId), noeud.data.parametres, nom, val);
    setNodes((nds) => nds.map((n) => (n.id === nid ? { ...n, data: { ...n.data, parametres: suite } } : n)));
    // UN RÉGLAGE N'EFFACE PAS CE QUE LE NŒUD A DÉSIGNÉ DE SES ENTRÉES : sans quoi le graphe vivant
    // du Montage n'a plus rien à jouer et s'arrête. L'aval, lui, est effacé entièrement.
    reinitialiserPourReglage(nid);
    relancerApresReglage(nid);
    return suite;
  }, [noeudsRef, cacheExec, setNodes, reinitialiserPourReglage, relancerApresReglage]);

  useEffect(() => () => {
    for (const id of minuteursRelance.current.values()) window.clearTimeout(id);
    minuteursRelance.current.clear();
  }, []);

  // La démonstration filmée : le scénario joué dans la vraie interface (cf. ui/demo/).
  const { calque: calqueDemo } = useRealisateurDemo({
    noeudsRef, aretesRef, setNodes, setEdges, rfInstanceRef, setSel, lancerRef, audioCtxRef, resumeAudio,
  });

  // ── Suppression d'un nœud : nettoyage des URLs de résultat, du cache et cascade aval ──
  const supprimerNoeud = useCallback((ids: string | string[], opts: { filterNodes?: boolean } = {}) => {
    const idArr = Array.isArray(ids) ? ids : [ids];
    if (idArr.length === 0) return;
    // Révoquer les object URLs de résultats générés par le nœud (pas les fichiers
    // d'entrée audioUrl/enregistrementUrl, conservés pour que l'undo reste fonctionnel).
    for (const id of idArr) {
      const n = noeudsRef.current.find((nn) => nn.id === id);
      if (!n) continue;
      // LA LISTE QUI DÉCIDE EST `CHAMPS_RESULTAT`, et la valeur dit d'elle-même si elle est à
      // révoquer. Quatre noms étaient énumérés ici, la même divergence que celle relevée dans la
      // remise à zéro : les films du montage vidéo, de l'extrait, du muet et de la démonstration
      // sont eux aussi des `createObjectURL`, et supprimer un de ces nœuds laissait son film en
      // mémoire. Les fichiers d'entrée, eux, ne sont pas des résultats et restent intacts, ce qui
      // garde l'annulation utilisable.
      for (const champ of CHAMPS_RESULTAT) {
        const v = (n.data as any)[champ];
        if (typeof v === "string" && v.startsWith("blob:")) URL.revokeObjectURL(v);
      }
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
    // ── Chargement d'un média sur un nœud ──
    // Chacun se termine par `reinitialiserNoeud`, comme `onChangerParametre` :
    // choisir un autre fichier est le changement d'entrée le plus lourd qui
    // soit, et sans cette cascade l'aval gardait son résultat d'avant, marqué
    // « Terminé ». Sur un sélecteur multi-zones, cela voulait dire dessiner des
    // zones sur la forme d'onde de l'ancien fichier pour les appliquer au
    // nouveau. L'incohérence tenait en une ligne : ces gestionnaires écrivent
    // aussi le paramètre « Chemin », or le même changement passé par
    // l'inspecteur réinitialisait, lui. Les zones et les fichiers chargés
    // survivent à la cascade (CHAMPS_UTILISATEUR).
    onChargerAudio: (nid: string, fichier: File) => {
      cacheExec.current.delete(nid);
      const api = (window as any).api;
      const chemin = api?.cheminFichier ? api.cheminFichier(fichier) : "";
      setNodes((nds2) => nds2.map((n) => n.id === nid ? { ...n, data: { ...n.data, audioFichier: fichier, audioNom: fichier.name, audioUrl: URL.createObjectURL(fichier), parametres: { ...n.data.parametres, Chemin: chemin } } } : n));
      reinitialiserNoeud(nid);
    },
    onChargerMidi: (nid: string, fichier: File) => {
      cacheExec.current.delete(nid);
      const api = (window as any).api;
      const chemin = api?.cheminFichier ? api.cheminFichier(fichier) : "";
      setNodes((nds2) => nds2.map((n) => n.id === nid ? { ...n, data: { ...n.data, midiFichier: fichier, midiNom: fichier.name, parametres: { ...n.data.parametres, Chemin: chemin } } } : n));
      reinitialiserNoeud(nid);
    },
    onChargerImage: (nid: string, fichier: File) => {
      cacheExec.current.delete(nid);
      const api = (window as any).api;
      const chemin = api?.cheminFichier ? api.cheminFichier(fichier) : "";
      setNodes((nds2) => nds2.map((n) => n.id === nid ? { ...n, data: { ...n.data, imageFichier: fichier, imageNom: fichier.name, parametres: { ...n.data.parametres, Chemin: chemin } } } : n));
      reinitialiserNoeud(nid);
    },
    onChargerSvg: (nid: string, fichier: File) => {
      cacheExec.current.delete(nid);
      const api = (window as any).api;
      const chemin = api?.cheminFichier ? api.cheminFichier(fichier) : "";
      setNodes((nds2) => nds2.map((n) => n.id === nid ? { ...n, data: { ...n.data, svgFichier: fichier, svgNom: fichier.name, parametres: { ...n.data.parametres, Chemin: chemin } } } : n));
      reinitialiserNoeud(nid);
    },
    onChargerPdf: (nid: string, fichier: File) => {
      cacheExec.current.delete(nid);
      const api = (window as any).api;
      const chemin = api?.cheminFichier ? api.cheminFichier(fichier) : "";
      setNodes((nds2) => nds2.map((n) => n.id === nid ? { ...n, data: { ...n.data, pdfFichier: fichier, pdfNom: fichier.name, parametres: { ...n.data.parametres, Chemin: chemin } } } : n));
      reinitialiserNoeud(nid);
    },
    onChangerEnregistrement: (nid: string, blob: Blob) => { cacheExec.current.delete(nid); const url = URL.createObjectURL(blob); setNodes((nds2) => nds2.map((n) => n.id === nid ? { ...n, data: { ...n.data, enregistrementBlob: blob, enregistrementUrl: url } } : n)); reinitialiserNoeud(nid); },
    onChangerParametre: (nid: string, nom: string, val: number | string) => {
      changerReglage(nid, nom, val);
    },
    // Cascade sur l'AVAL SEUL, et c'est la seule à l'être. Le nœud garde son
    // résultat : sa sortie audio est l'entrée transmise telle quelle, que les
    // zones ne changent pas — et l'effacer ferait disparaître sa forme d'onde et
    // son lecteur à chaque zone ajoutée, alors qu'on les pose justement les unes
    // après les autres en regardant l'onde. Son aval, lui, est bien périmé : un
    // « Masque de zones » restait affiché « Terminé » avec le trou de l'ancienne
    // zone dans son WAV, alors que le sélecteur n'en montrait plus aucune.
    // Le `cacheExec.delete` reste nécessaire pour le nœud lui-même :
    // `zonesSelectionnees` ne figure pas dans `empreinteParametres`.
    onChangerZones: (nid: string, zones: { debut: number; duree: number }[]) => { cacheExec.current.delete(nid); setNodes((nds2) => nds2.map((n) => n.id === nid ? { ...n, data: { ...n.data, zonesSelectionnees: zones } } : n)); reinitialiserAval(nid); },
    onChargerIR: (nid: string, fichier: File) => { cacheExec.current.delete(nid); setNodes((nds2) => nds2.map((n) => n.id === nid ? { ...n, data: { ...n.data, irFichier: fichier, irNom: fichier.name } } : n)); reinitialiserNoeud(nid); },
  }), [setNodes, setEdges, reinitialiserNoeud, reinitialiserAval, setPrioritaire, supprimerNoeud, pushHistorique, cacheExec, lancerRef]);
  callbacksNoeudRef.current = callbacksNoeud;

  // ── Ajouter / Supprimer ──
  const ajouterNoeud = useCallback((ficheId: string, pos?: { x: number; y: number }) => {
    const def = trouverDef(ficheId);
    if (!def) return;
    const position = pos ?? { x: 120 + Math.random() * 200, y: 80 + Math.random() * 240 };
    const parametres: Record<string, number | string> = {};
    for (const p of def.parametres) {
      // Tout paramètre « choix » passe par la forme canonique (indépendante de la
// langue), y compris SANS optionIds : la valeur stockée doit correspondre à
// l'`<option value>` du menu, qui reste le terme français. Restreindre ce
// traitement aux seuls optionIds créait, en anglais, des nœuds dont le
// paramètre valait par ex. "Center" — absent du menu (donc affiché comme
// « Left ») et refusé par l'exécution.
parametres[p.nom] = p.type === "choix" ? defautCanoniqueChoix(p) : defautParametre(p, lang);
    }
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

  const ajouterCommentaire = useCallback(() => {
    setPendingAdd("comment");
  }, []);

  const ajouterCadre = useCallback(() => {
    setPendingAdd("frame");
  }, []);

  const creerCommentaire = useCallback((position: { x: number; y: number }) => {
    setNodes((nds) => [...nds, {
      id: idUnique(noeudsRef.current),
      type: "atelier",
      position,
      width: 180,
      height: 100,
      data: {
        ficheId: "comment",
        parametres: {},
        statut: "attente",
        // AUCUN TEXTE POSÉ DANS LA DONNÉE : « Ajouter une note » y était écrit à la création, donc
        // figé dans la langue du moment. L'invite du champ, elle, suit la langue.
        ...(callbacksNoeudRef.current?.()),
      },
    }]);
  }, [setNodes]);

  const creerCadre = useCallback((position: { x: number; y: number }) => {
    setNodes((nds) => {
      const nouveau = {
        id: idUnique(noeudsRef.current),
        type: "atelier" as const,
        position,
        width: 320,
        height: 200,
        data: {
          ficheId: "frame",
          parametres: {},
          statut: "attente",
          // AUCUN NOM POSÉ DANS LA DONNÉE : « Ajouter un cadre » y était écrit à la création, donc
          // figé dans la langue du moment. L'invite du champ, elle, suit la langue.
          couleur: "rgba(120,120,120,0.12)",
          ...(callbacksNoeudRef.current?.()),
        },
      };
      return [nouveau, ...nds];
    });
  }, [setNodes, t]);

  // ── Copier / Coller (Ctrl+C / Ctrl+V) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ne pas intercepter si on tape dans un champ (textarea, input, select)
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        const selection = noeudsRef.current.filter((n) => (n as { selected?: boolean }).selected);
        if (selection.length === 0) return;
        e.preventDefault();
        const origineX = Math.min(...selection.map((n) => n.position?.x ?? 0));
        const origineY = Math.min(...selection.map((n) => n.position?.y ?? 0));
        pressePapierRef.current = selection.map((n) => {
          const d = n.data as Record<string, unknown>;
          // Allowlist de COPIE : les champs saisis par l'utilisateur (ficheId,
          // paramètres…), jamais les résultats calculés (buffer audio, URL blob,
          // message…) — sinon le nœud dupliqué affiche ou joue le résultat de
          // l'original avant d'avoir tourné lui-même — et jamais non plus le média
          // chargé sur l'original (CHAMPS_MEDIA_LOCAL) : un « Entrée audio » collé
          // arrivait avec un lecteur affichant déjà une durée de piste alors qu'il
          // n'avait rien reçu. Le couper-coller, lui, conserve le média (voir Ctrl+X).
          const data: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(d)) {
            if (typeof v === "function") continue;
            if (!CHAMPS_COPIABLES.has(k)) continue;
            data[k] = v;
          }
          return {
            ficheId: d.ficheId as string,
            parametres: { ...(d.parametres as Record<string, number | string>) },
            width: n.width ?? 230,
            height: n.height ?? 200,
            data,
            dx: (n.position?.x ?? 0) - origineX,
            dy: (n.position?.y ?? 0) - origineY,
          };
        });
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "x") {
        const selection = noeudsRef.current.filter((n) => (n as { selected?: boolean }).selected);
        if (selection.length === 0) return;
        e.preventDefault();
        const origineX = Math.min(...selection.map((n) => n.position?.x ?? 0));
        const origineY = Math.min(...selection.map((n) => n.position?.y ?? 0));
        pressePapierRef.current = selection.map((n) => {
          const d = n.data as Record<string, unknown>;
          // Allowlist de COUPE : identique à la copie pour les résultats calculés,
          // mais le média chargé (fichier audio/image/MIDI…) est ici CONSERVÉ. Un
          // couper-coller est un déplacement, pas une duplication : l'original est
          // supprimé juste après, donc laisser le média derrière reviendrait à le
          // détruire.
          const data: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(d)) {
            if (typeof v === "function") continue;
            if (!CHAMPS_UTILISATEUR.has(k)) continue;
            data[k] = v;
          }
          return {
            ficheId: d.ficheId as string,
            parametres: { ...(d.parametres as Record<string, number | string>) },
            width: n.width ?? 230,
            height: n.height ?? 200,
            data,
            dx: (n.position?.x ?? 0) - origineX,
            dy: (n.position?.y ?? 0) - origineY,
          };
        });
        // Sauvegarder pour undo puis supprimer
        pushHistorique();
        supprimerNoeud(selection.map((n) => n.id));
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "v" && pressePapierRef.current && pressePapierRef.current.length > 0) {
        e.preventDefault();
        const clip = pressePapierRef.current;
        pushHistorique();
        const cbs = callbacksNoeud();
        const ajoutesRef: any[] = [];
        setNodes((nds) => {
          const selectionCourante = nds.filter((n) => (n as { selected?: boolean }).selected);
          const origine = (() => {
            if (selectionCourante.length === 0) return { x: 120, y: 80 };
            const cx = selectionCourante.reduce((s, n) => s + (n.position?.x ?? 0), 0) / selectionCourante.length;
            const cy = selectionCourante.reduce((s, n) => s + (n.position?.y ?? 0), 0) / selectionCourante.length;
            return { x: cx + 40, y: cy + 40 };
          })();
          const deselected = nds.map((n) => n.selected ? { ...n, selected: false } : n);
          let current = deselected;
          for (const item of clip) {
            const nouvelId = idUnique(current);
            const def = trouverDef(item.ficheId);
            const { width, height } = def ? tailleDefaut(def) : { width: item.width, height: item.height };
            const n: any = {
              id: nouvelId,
              type: "atelier",
              position: { x: origine.x + item.dx, y: origine.y + item.dy },
              width,
              height,
              selected: true,
              data: {
                ficheId: item.ficheId,
                parametres: { ...item.parametres },
                ...item.data,
                statut: "attente",
                ...cbs,
              },
            };
            current = [...current, n];
            ajoutesRef.push(n);
          }
          return current;
        });
        setSel(ajoutesRef[0] ?? null);
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [callbacksNoeud, supprimerNoeud, pushHistorique, setNodes, undo]);

  // ── Méta-composants (§3.8) : grouper / dégrouper + navigation ──
  // Dans hooks/useMetaComposants.ts ; la logique pure vit dans core/meta.ts.
  const { grouper, degrouper, renommer, sauvegarderContexteCourant, ouvrirMeta, remonterA } = useMetaComposants({
    noeudsRef, aretesRef, pileRef, grapheRacineRef, cacheExec,
    setNodes, setEdges, setPile, setSel, callbacksNoeud,
  });

  // ── Bulles : clarifier / développer / ouvrir ──
  // Rien de commun avec « grouper » : une bulle replie le schéma pour le lire, elle ne range aucun
  // outil au catalogue. La logique pure vit dans core/bulles.ts.
  const { clarifier, developper, basculerRepli, retirerBullesVides, developperAvantMeta } = useBulles({
    noeudsRef, aretesRef, setNodes, setEdges, setSel, pushHistorique, callbacksNoeud,
  });

  /**
   * GROUPER DÉVELOPPE D'ABORD LES BULLES DE LA SÉLECTION, et le dit.
   *
   * Un méta-composant part au catalogue et voyage entre projets ; une bulle reste dans le sien. Un méta
   * bâti sur une sélection contenant une bulle serait irrécupérable ailleurs, et la cause ne serait pas
   * lisible. Un seul instantané d'historique pour l'opération entière : Ctrl+Z ne doit pas laisser le
   * canevas à moitié développé, sans méta.
   */
  const grouperAvecBulles = useCallback(() => {
    pushHistorique();
    const { bulles, membres } = developperAvantMeta();
    if (bulles > 0) {
      window.alert(t("bulle.developpeeAvantMeta")
        .replace("{bulles}", String(bulles)).replace("{membres}", String(membres)));
    }
    grouper();
  }, [developperAvantMeta, grouper, pushHistorique, t]);

  // Le repli appliqué en un seul endroit, quel que soit le geste qui l'a provoqué.
  const nomDeNoeud = useCallback((n: NoeudG): string => {
    const propre = typeof n.data.nom === "string" && n.data.nom.trim() ? n.data.nom.trim() : "";
    if (propre) return propre;
    const def = trouverDef(n.data.ficheId);
    return (lang === "en" && def?.nomEn ? def.nomEn : def?.nom) ?? n.data.ficheId;
  }, [lang]);
  useRepliBulles({ nodes, edges, setNodes, setEdges, getDef: trouverDef });

  // La fiche d'une bulle est DÉRIVÉE de ses membres, donc refaite dès qu'ils changent — et retirée du
  // registre quand la bulle disparaît. Rien n'est stocké : le projet ne porte que le nœud et
  // l'appartenance de ses membres.
  const signatureDesBulles = signatureBulles(
    nodes as unknown as NoeudG[], edges as unknown as AreteG[],
  );
  useEffect(() => {
    const { inscrites, retirees } = synchroniserFichesBulles(
      noeudsRef.current as unknown as NoeudG[], aretesRef.current as unknown as AreteG[],
      registreUI(),
    );
    if (inscrites.length || retirees.length) setPluginsVersion((v) => v + 1);
  }, [signatureDesBulles, nomDeNoeud]);

  // Une bulle vidée de son dernier membre se supprime d'elle-même.
  useEffect(() => { retirerBullesVides(); }, [nodes, retirerBullesVides]);

  // LE CLIC DROIT DÉPLACE DÉJÀ LE CANEVAS (`panOnDrag={[2]}`), et l'événement de menu arrive aussi au
  // relâchement d'un glissement : sans ce garde-fou, déplacer la vue ouvrirait un menu à l'arrivée.
  // On note où le bouton est descendu, et on n'ouvre que si rien n'a bougé.
  const origineClicDroit = useRef<{ x: number; y: number } | null>(null);
  const surPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 2) origineClicDroit.current = { x: e.clientX, y: e.clientY };
  }, []);

  const surClicDroit = useCallback((e: React.MouseEvent, noeud?: Node) => {
    e.preventDefault();
    const o0 = origineClicDroit.current;
    origineClicDroit.current = null;
    if (o0 && Math.hypot(e.clientX - o0.x, e.clientY - o0.y) > 4) { setMenu(null); return; }
    const entrees: EntreeMenu[] = [];
    const bulle = noeud && estBulle((noeud.data as { ficheId?: string }).ficheId) ? noeud : undefined;
    if (bulle) {
      const replie = (bulle.data as { bulleOuverte?: boolean }).bulleOuverte !== true;
      entrees.push({
        cle: "ouvrir", libelle: t(replie ? "bulle.ouvrir" : "bulle.refermer"),
        titre: t("bulle.ouvrirTitle"), action: () => basculerRepli(bulle.id),
      });
      entrees.push({
        cle: "developper", libelle: t("bulle.developper"),
        titre: t("bulle.developperTitle"), action: () => developper(bulle.id),
      });
    } else if (noeudsRef.current.filter((n) => n.selected).length >= 2) {
      entrees.push({
        cle: "clarifier", libelle: t("bulle.clarifier"),
        titre: t("bulle.clarifierTitle"), action: clarifier,
      });
    }
    setMenu(entrees.length ? { x: e.clientX, y: e.clientY, entrees } : null);
  }, [t, basculerRepli, developper, clarifier]);

  /**
   * Un son lâché sur le canevas devient une entrée audio, déjà remplie.
   *
   * LE NŒUD NAÎT AVEC SON FICHIER, en une seule écriture. Le poser puis le remplir demanderait de
   * connaître son identifiant entre les deux, or il est tiré à l'intérieur de la mise à jour ; et
   * deux écritures de suite laisseraient un nœud vide le temps d'un rendu.
   *
   * Le chemin disque est relevé au passage, comme le fait le chargement par le sélecteur : c'est
   * lui qui permettra de retrouver le fichier à la réouverture du projet.
   */
  const deposerSons = useCallback((fichiers: { fichier: File; sorte: SorteDeposee }[], depart: { x: number; y: number }) => {
    const reconnus = fichiers.filter((f) => trouverDef(f.sorte === "midi" ? "lecteur-midi" : "entree-audio"));
    if (reconnus.length === 0) return;
    pushHistorique();
    const api = (window as any).api;
    const positions = positionsEnCascade(depart, reconnus.length);
    setNodes((nds) => {
      const ajoutes: NoeudAtelier[] = [];
      for (const [i, { fichier, sorte }] of reconnus.entries()) {
        const ficheId = sorte === "midi" ? "lecteur-midi" : "entree-audio";
        const def = trouverDef(ficheId)!;
        const parametres: Record<string, number | string> = {};
        for (const p of def.parametres) {
          parametres[p.nom] = p.type === "choix" ? defautCanoniqueChoix(p) : defautParametre(p, lang);
        }
        parametres.Chemin = api?.cheminFichier ? api.cheminFichier(fichier) : "";
        // Chaque sorte a ses champs, et ce sont ceux que les vues et le rechargement de session
        // attendent : les inventer ici ferait un nœud qui paraît rempli et ne lit rien.
        const media = sorte === "midi"
          ? { midiFichier: fichier, midiNom: fichier.name }
          : { audioFichier: fichier, audioNom: fichier.name, audioUrl: URL.createObjectURL(fichier) };
        const { width, height } = tailleDefaut(def);
        ajoutes.push({
          id: idUnique([...nds, ...ajoutes]),
          type: "atelier",
          position: positions[i],
          width, height,
          data: { ficheId, parametres, statut: "attente", ...media, ...callbacksNoeud() },
        } as unknown as NoeudAtelier);
      }
      return [...nds, ...ajoutes];
    });
  }, [setNodes, callbacksNoeud, pushHistorique, lang]);

  // ── Glisser-déposer ──
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!rfInstance) return;
    // `screenToFlowPosition` ATTEND DES COORDONNÉES CLIENT : elle retire elle-même la position du
    // canevas à l'écran. Lui retirer d'avance le rectangle de l'enveloppe le comptait donc deux
    // fois, et le nœud tombait à 240 px à gauche et 118 px au-dessus du pointeur — mesuré à 1600 px
    // en visant le milieu du canevas. Le correctif enlève la soustraction ; il rend aussi le dépôt
    // INDÉPENDANT de la mise en page, ce qui compte depuis que la barre d'outils n'est plus dans
    // l'enveloppe du canevas et que son rectangle ne commence plus au même endroit.
    const position = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const ficheId = e.dataTransfer.getData("application/attic-fiche-id");
    if (ficheId) { ajouterNoeud(ficheId, position); return; }
    // Pas de composant tiré de la palette : peut-être des fichiers venus du système. Ceux dont
    // aucun composant ne sait quoi faire sont laissés de côté, comme avant — le canevas ne les
    // refuse pas, il ne sait simplement pas encore les lire.
    const connus = [...(e.dataTransfer.files ?? [])]
      .map((fichier) => ({ fichier, sorte: sorteDeposee(fichier.name, fichier.type) }))
      .filter((f): f is { fichier: File; sorte: SorteDeposee } => f.sorte !== null);
    if (connus.length > 0) deposerSons(connus, position);
  }, [ajouterNoeud, deposerSons, rfInstance]);

  const onPaneClick = useCallback((e: React.MouseEvent) => {
    const type = pendingAddRef.current;
    if (type && rfInstanceRef.current) {
      // Même correctif qu'au dépôt : des coordonnées client, sans retirer l'enveloppe.
      const position = rfInstanceRef.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setPendingAdd(null);
      if (type === "comment") {
        creerCommentaire(position);
      } else {
        creerCadre(position);
      }
      return;
    }
    setSel(null);
  }, [creerCommentaire, creerCadre]);

  // Échap annule un placement de note/cadre en attente.
  useEffect(() => {
    if (!pendingAdd) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingAdd(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingAdd]);

  const isValidConnection = useCallback((conn: Connection | Edge) => {
    // La validité se juge sur la connexion TRADUITE : sur une poignée de bulle, ce sont les types du
    // port réel qui comptent, jamais ceux d'un port de façade.
    const traduite = traduireConnexion(
      noeudsRef.current as unknown as NoeudG[], aretesRef.current as unknown as AreteG[],
      conn as any, trouverDef,
    );
    if (!traduite) return false;
    // AUCUNE ARÊTE NE SE POSE SANS QUE LE CYCLE SOIT CHERCHÉ. Le moteur n'exécute qu'un graphe
    // acyclique : un cycle n'a pas d'ordre topologique, et les nœuds qu'il contient ne seraient
    // jamais lancés — sans erreur, sans message, une branche entière qui ne calcule rien. Le refus
    // se fait ici, où il ne coûte rien à personne : la connexion ne se dépose simplement pas.
    //
    // SUR LES ARÊTES RÉELLES, ET NON SUR LES SUBSTITUTIONS. Une bulle repliée porte des arêtes de
    // remplacement qui ramènent à elle celles de ses membres : deux membres sans rapport y
    // paraissent reliés par elle, et une arête licite se ferait refuser. Les vraies arêtes sont
    // gardées sous ces substituts, seulement cachées, et ce sont elles qui disent la topologie.
    const reelles = (aretesRef.current as unknown as AreteG[]).filter((a) => !estSubstitution(a));
    if (fermeraitUnCycle(traduite.source, traduite.target, reelles)) return false;
    const source = noeudsRef.current.find((n) => n.id === traduite.source);
    const target = noeudsRef.current.find((n) => n.id === traduite.target);
    return validerArete(source, target, { ...conn, ...traduite });
  }, [nomDeNoeud]);

  const nodeColor = useCallback((node: any) => {
    const cat = categorieNoeud(node.data?.ficheId, registreUI().trouverDef(node.data?.ficheId));
    return COULEURS_CATEGORIE[cat] ?? "var(--text-muted)";
  }, []);

  const onConnect: OnConnect = useCallback((connBrute) => {
    if (!connBrute.sourceHandle || !connBrute.targetHandle) return;
    // UNE POIGNÉE DE BULLE EST CONNECTABLE, et la vraie arête va au membre qu'elle représente : c'est
    // lui qui calcule. Traduite d'abord, la connexion suit ensuite le chemin ordinaire — même
    // remplacement d'un port non dynamique, même couleur, même historique. Refusée si la poignée ne
    // désigne rien, plutôt que devinée.
    const traduite = traduireConnexion(
      noeudsRef.current as unknown as NoeudG[], aretesRef.current as unknown as AreteG[],
      connBrute as any, trouverDef,
    );
    if (!traduite) return;
    const conn = { ...connBrute, ...traduite };
    const ficheSource = noeudsRef.current.find((n) => n.id === conn.source)?.data.ficheId;
    const ficheTarget = noeudsRef.current.find((n) => n.id === conn.target)?.data.ficheId;
    if (ficheSource === "comment" || ficheTarget === "comment") return;
    // LE MÊME REFUS QU'AU SURVOL, ET CE N'EST PAS UN DOUBLON. `isValidConnection` garde le geste à
    // la souris ; celui-ci garde la pose elle-même, quel que soit le chemin qui y mène. Une seule
    // arête qui referme un cycle suffit à rendre muette une branche entière.
    if (fermeraitUnCycle(conn.source, conn.target,
      (aretesRef.current as unknown as AreteG[]).filter((a) => !estSubstitution(a)))) {
      console.warn(`[attic] Arête refusée : ${conn.source} → ${conn.target} refermerait un cycle.`);
      return;
    }
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

  /**
   * CE QU'UNE DICTÉE FAIT AU CANEVAS.
   *
   * LES GESTES S'APPLIQUENT SUR UNE COPIE DE TRAVAIL, et les deux poseurs ne sont appelés qu'une
   * fois à la fin. `noeudsRef` ne se remplit qu'au rendu suivant : poser trois composants en
   * enchaînant les appels leur donnerait le même identifiant et la même place, et chacun
   * s'enchaînerait sur le même courant.
   *
   * LES DÉCISIONS, ELLES, SONT DANS `ui/dictee/pose-dictee.ts` : sur quoi on enchaîne, où l'on pose,
   * et quel nœud un nom désigne. Elles se trompent sans rien lever, et sont éprouvées là-bas.
   */
  const dernierDicteRef = useRef<string | null>(null);
  const appliquerDictee = useCallback((commandes: Commande[]) => {
    let noeuds = [...noeudsRef.current];
    const nouveaux: typeof noeuds = [];
    const aretes: Edge[] = [];
    let dernier = dernierDicteRef.current;

    const poser = (ficheId: string, parallele: boolean) => {
      const def = trouverDef(ficheId);
      if (!def) return;
      const courant = noeudCourant(noeuds as unknown as NoeudPose[], sel?.id ?? null, dernier);
      const position = positionSuivante(courant, noeuds as unknown as NoeudPose[], parallele);
      const parametres: Record<string, number | string> = {};
      for (const p of def.parametres) {
        parametres[p.nom] = p.type === "choix" ? defautCanoniqueChoix(p) : defautParametre(p, lang);
      }
      const { width, height } = tailleDefaut(def);
      const id = idUnique(noeuds);
      const noeud = {
        id, type: "atelier" as const, position, width, height,
        data: { ficheId, parametres, statut: "attente", ...callbacksNoeud() },
      } as unknown as (typeof noeuds)[number];
      noeuds = [...noeuds, noeud];
      nouveaux.push(noeud);
      // ENCHAÎNÉ SUR LE COURANT, sauf « en parallèle » : c'est ce qui dispense de dire le lien.
      if (courant && !parallele) {
        aretes.push({
          id: `e-dictee-${id}-${Date.now()}`, source: courant.id, target: id,
          sourceHandle: "out:0", targetHandle: "in:0", type: "arete-personnalisee",
          style: { stroke: couleurArete(noeuds, courant.id, "out:0"), strokeWidth: 2.5 },
        });
      }
      dernier = id;
    };

    const relier = (deFiche: string, versFiche: string) => {
      const de = dernierDeFiche(noeuds as unknown as NoeudPose[], deFiche);
      const vers = dernierDeFiche(noeuds as unknown as NoeudPose[], versFiche);
      if (!de || !vers || de.id === vers.id) return;
      // Le même refus qu'à la souris : une arête qui referme un cycle rend muette une branche.
      const deja = [...aretesRef.current, ...aretes] as unknown as AreteG[];
      if (fermeraitUnCycle(de.id, vers.id, deja.filter((a) => !estSubstitution(a)))) {
        console.warn(`[attic] Dictée : ${de.id} → ${vers.id} refermerait un cycle.`);
        return;
      }
      aretes.push({
        id: `e-dictee-${de.id}-${vers.id}-${Date.now()}`, source: de.id, target: vers.id,
        sourceHandle: "out:0", targetHandle: "in:0", type: "arete-personnalisee",
        style: { stroke: couleurArete(noeuds, de.id, "out:0"), strokeWidth: 2.5 },
      });
    };

    const verser = () => {
      if (nouveaux.length === 0 && aretes.length === 0) return;
      pushHistorique();
      const n = [...nouveaux]; const a = [...aretes];
      nouveaux.length = 0; aretes.length = 0;
      setNodes((nds) => [...nds, ...n]);
      setEdges((eds) => [...eds, ...a]);
    };

    for (const c of commandes) {
      if (c.quoi === "poser") poser(c.ficheId, c.parallele);
      else if (c.quoi === "relier") relier(c.de, c.vers);
      else if (c.quoi === "annuler") {
        // Ce qui est en attente part d'abord : annuler doit défaire l'état visible, pas un autre.
        verser();
        undo();
        noeuds = [...noeudsRef.current];
        dernier = null;
      }
    }
    verser();
    dernierDicteRef.current = dernier;
  }, [sel, lang, trouverDef, callbacksNoeud, pushHistorique, setNodes, setEdges, undo]);

  const dictee = useDictee(lang === "en" ? "en" : "fr", appliquerDictee);

  // Export / import du workflow, dans hooks/usePersistance.ts.
  const { sauvegarder, sauvegarderAuto, exporter, importer, memoriserEncours } = usePersistance({
    nodes, edges, setNodes, setEdges, rfInstance, repertoire,
    sauvegarderContexteCourant, grapheRacineRef, setPile,
    reinitialiserNoeud, supprimerNoeud, setPrioritaire, lancerRef, cacheExec,
    callbacksNoeud,
    currentFilePath, setCurrentFilePath,
  });

  /**
   * Ouvre un exemple livré avec l'application.
   *
   * IL N'A PAS DE FICHIER, ET C'EST CE QUI LE REND NON MODIFIABLE. Le graphe vient du paquet ;
   * l'import reçoit donc un fichier qui n'est sur aucun disque, et le chemin courant est remis à
   * rien. La sauvegarde automatique s'abstient alors faute de fichier, et l'enregistrement manuel
   * passe par le dialogue, qui propose le dossier de travail. Recopier pour modifier n'est pas une
   * règle à faire respecter, c'est la seule chose qui puisse arriver.
   *
   * LA REMISE À RIEN EST ÉCRITE ICI, EXPRÈS, plutôt que déduite de ce que l'import fait d'un
   * fichier sans chemin : ouvrir un exemple alors qu'un projet est ouvert ne doit en aucun cas
   * laisser l'ancien chemin en place, sans quoi le premier Ctrl+S écraserait ce projet par
   * l'exemple.
   */
  const ouvrirExemple = useCallback(async (id?: string) => {
    const api = (window as any).api;
    // LE CLASSEUR PLUTÔT QU'UNE LISTE, demandé par Fabien : une liste déroulante devient illisible
    // dès que les exemples se multiplient, et un dossier se range en sous-dossiers. Le dialogue
    // s'ouvre sur le dossier livré ; hors d'Electron, il n'y a pas de dialogue et la liste compilée
    // sert de repli.
    if (!id && api?.dossierExemples && api?.ouvrirFichier) {
      const dossier: string | null = await api.dossierExemples();
      const choisi = await api.ouvrirFichier({
        defaultPath: dossier || undefined,
        filters: [{ name: "Workflow Attic", extensions: ["json"] }],
      });
      if (!choisi) return;
      await importer(new File([choisi.contenu], choisi.nom, { type: "application/json" }));
      // CE N'EST UN EXEMPLE QUE SI C'EN EST UN. Le dialogue s'ouvre sur le dossier des exemples,
      // mais rien n'empêche d'en sortir et de prendre son propre projet : celui-là garde son
      // fichier courant, et le Ctrl+S suivant doit l'écrire là où il est.
      const normaliser = (c: string) => c.replace(/\\/g, "/").toLowerCase();
      if (dossier && normaliser(choisi.chemin).startsWith(normaliser(dossier) + "/")) setCurrentFilePath(null);
      return;
    }
    const ex = EXEMPLES.find((e) => e.id === id);
    if (!ex) return;
    await importer(fichierDExemple(ex));
    setCurrentFilePath(null);
  }, [importer, setCurrentFilePath]);

  // ── Sauvegarde automatique, et filet anti-curseur collé ──
  //
  // Les deux sujets vivent dans leurs crochets : le minuteur qui écrit le projet et l'écriture
  // de dernière minute à la fermeture d'un côté, le décrochage d'un nœud resté collé au curseur
  // de l'autre. Aucun ne dépend de l'atelier au-delà de ce qui leur est passé ici.
  useSauvegardeAutomatique({ currentFilePath, sauvegardeAutoActive, sauvegarderAuto });
  useFiletGlissement({ pointerDownRef, rfRef });

  return (
    <div className="attic-app" style={{ gridTemplateColumns: paletteOuverte ? "260px 1fr 280px" : "40px 1fr 280px" }}>
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
        onArreter={arreter}
        onReinitialiser={reinitialiserTout}
        onRecharger={() => {
          // Le graphe d'abord, le rechargement ensuite : l'en-cours n'est autrement écrit qu'à
          // l'enregistrement, et recharger rendrait le graphe du dernier enregistrement.
          //
          // PAS DÉSACTIVÉ PENDANT UNE EXÉCUTION, contrairement à la réinitialisation. Recharger
          // est justement le recours quand une exécution ne rend plus la main, ou quand
          // l'application s'est mise dans un état qu'aucun autre bouton ne répare ; le griser à
          // ce moment-là le rendrait inutilisable précisément quand on en a besoin. On demande
          // seulement confirmation, puisque le calcul en cours sera perdu.
          if (enExecution && !window.confirm(t("barre.recharger.confirmer"))) return;
          memoriserEncours();
          window.location.reload();
        }}
        onResumeAudio={resumeAudio}
        nbPlugins={nbPlugins}
        sf2Nom={sf2NomState}
        currentFilePath={currentFilePath}
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
        onAjouterCommentaire={ajouterCommentaire}
        onAjouterCadre={ajouterCadre}
        dictee={dictee}
        onSauvegarder={sauvegarder}
        onDetacherFichier={detacherFichier}
        sauvegardeAuto={sauvegardeAutoActive}
        onBasculerSauvegardeAuto={basculerSauvegardeAuto}
        economieMemoire={economieMemoire}
        onBasculerEconomieMemoire={basculerEconomieMemoire}
        profondeurExport={profondeurExport}
        onChangerProfondeurExport={changerProfondeurExport}
        onImporter={importer}
        onOuvrirExemple={ouvrirExemple}
      />
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
      <div className={`attic-canevas ${pendingAdd ? "attic-canevas-pending" : ""}`} ref={wrapperRef} onDrop={onDrop} onDragOver={(e) => e.preventDefault()} onPointerDownCapture={surPointerDown}>
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
              <button onClick={grouperAvecBulles} title={t("meta.grouperTitle")}>⊟ {t("meta.grouper")}</button>
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
          onPaneClick={onPaneClick}
          onPaneContextMenu={(e) => surClicDroit(e as React.MouseEvent)}
          onNodeContextMenu={(e, n) => surClicDroit(e, n as Node)}
          onInit={setRfInstance}
          fitView deleteKeyCode={["Delete"]}
          panOnDrag={[2]}
          selectionOnDrag={true}
          selectNodesOnDrag={false}
          onNodesDelete={(deletedNodes) => {
            pushHistorique();
            supprimerNoeud(deletedNodes.map((n) => n.id), { filterNodes: false });
          }}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable nodeColor={nodeColor} />
        </ReactFlow>
        <MenuContextuel etat={menu} onFermer={() => setMenu(null)} />
      </div>
      <PanneauInspecteur>
      <Inspector
        noeud={nodes.find((n) => n.id === sel?.id) ?? null}
        def={sel ? trouverDef(sel.data.ficheId) : undefined}
        // Calculé ici et non dans l'inspecteur : retrouver quels ports sont de type courbe demande
        // de connaître le domaine, et l'inspecteur doit rester générique. Chaque port de modulation
        // nomme sa cible ; on ne garde que celles dont le port est effectivement branché — un
        // réglage n'est « piloté » que quand une courbe y arrive vraiment.
        parametresModules={(() => {
          if (!sel) return [];
          const d = trouverDef(sel.data.ficheId);
          if (!d) return [];
          return d.entrees.flatMap((port, rang) =>
            port.module
            && edges.some((a) => a.target === sel.id && (a.targetHandle ?? `in:${rang}`) === `in:${rang}`)
              ? [port.module] : []);
        })()}
        portsBranches={sel ? edges.filter((a) => a.target === sel.id)
          .map((a) => parseInt(String(a.targetHandle ?? "in:0").split(":")[1], 10)).filter(Number.isFinite) : []}
        onChangerParametre={(nom, val) => {
          if (!sel) return;
          // LE MÊME CHEMIN QUE DEPUIS LE NŒUD, et c'est tout ce qui reste ici : l'inspecteur n'a
          // plus à refaire la règle, seulement à se remettre à jour sur ce qu'elle a produit.
          const suite = changerReglage(sel.id, nom, val);
          if (suite) setSel((prev) => (prev ? { ...prev, data: { ...prev.data, parametres: suite } } : null));
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
        onEnregistrerMidi={(id, fichier) => {
          // Même contrat que onChargerMidi (AtelierNode) : vider le cache
          // AVANT de poser le nouveau fichier, sinon un ré-enregistrement
          // sans toucher aucun paramètre rejoue le résultat de la prise
          // précédente (empreinteParametres/empreinteEntrees ne voient pas
          // midiFichier, qui n'est pas dans `parametres`).
          cacheExec.current.delete(id);
          setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, midiFichier: fichier, midiNom: fichier.name } } : n));
        }}
      />
      </PanneauInspecteur>
      {calqueDemo}
    </div>
  );
}
