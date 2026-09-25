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
  estFrontiere, estBulle, ID_ENTREE_FRONTIERE, ID_SORTIE_FRONTIERE,
  surChangementMetas, supprimerMeta, traduireConnexion, type AreteG, type NoeudG } from "../core";
import { registre } from "../audio/adaptateur";
import "../audio/adaptateur";
import type { FicheAudio } from "../audio/types-domaine";

const trouverDef = (id: string) => registre.trouverDef(id);
const tousLesPlugins = () => registre.tousLesPlugins();
const couleurFlux = (id: string) => registre.couleurFlux(id);
import { chargerSF2Globale, autoChargerSF2, sf2Nom } from "../plugins/soundfontGlobal";
import { useI18n, defautParametre, defautCanoniqueChoix } from "../i18n";

import { idUnique } from "./ids";
import { tailleDefaut } from "./tailles-noeuds";
import { usePersistance } from "./hooks/usePersistance";
import { useMetaComposants } from "./hooks/useMetaComposants";
import { useExecutionGraphe, CHAMPS_UTILISATEUR, CHAMPS_COPIABLES } from "./hooks/useExecutionGraphe";
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
import { useBulles } from "./hooks/useBulles";
import { useRepliBulles } from "./hooks/useRepliBulles";
import { signatureBulles, synchroniserFichesBulles } from "./fichesBulles";
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
import { PanneauInspecteur } from "./PanneauInspecteur";
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
              nomFichier: n.data.nomFichier,
              nom: n.data.nom,
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

  // ── Exécution du graphe (hook extrait — voir DECOUPAGE-APP.md) ──
  // La boucle `lancer` + la réinitialisation en cascade + les statuts. La logique
  // pure d'ordonnancement/cache vit dans core/graphe.ts (testée).
  const { lancer, arreter, reinitialiserNoeud, reinitialiserAval, reinitialiserTout } = useExecutionGraphe({
    noeudsRef, aretesRef, enExecRef, prioritaireRef, audioCtxRef, cacheExec, economieMemoireRef,
    pileMetaRef: pileRef,
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
          if (def) for (const p of def.parametres) {
            // Tout paramètre « choix » passe par la forme canonique (indépendante de la
// langue), y compris SANS optionIds : la valeur stockée doit correspondre à
// l'`<option value>` du menu, qui reste le terme français. Restreindre ce
// traitement aux seuls optionIds créait, en anglais, des nœuds dont le
// paramètre valait par ex. "Center" — absent du menu (donc affiché comme
// « Left ») et refusé par l'exécution.
parametres[p.nom] = p.type === "choix" ? defautCanoniqueChoix(p) : defautParametre(p, lang);
          }
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
              onChargerPdf: cbs.onChargerPdf,
              onChangerEnregistrement: cbs.onChangerEnregistrement,
              onChangerParametre: cbs.onChangerParametre,
              onChangerZones: cbs.onChangerZones,
              onChargerIR: cbs.onChargerIR,
            },
          };
        });
        // Créer les edges. L'id embarque un horodatage : dérivé seulement de
        // nodeId+i, il collisionnait avec les arêtes d'une génération
        // PRÉCÉDENTE dès que le même nœud source régénérait un graphe
        // (« Prompt → graphe » relancé, ou import répété d'un audio à graphe
        // embarqué) — React signalait des clés dupliquées. Même convention
        // que onConnect ci-dessous (`e-${source}-${target}-${Date.now()}`).
        const horodatage = Date.now();
        const nouveauxEdges = spec.edges.map((e, i) => {
          const srcId = idsNouveaux[e.source];
          return {
            id: `e-prompt-${nodeId}-${horodatage}-${i}`,
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
      cacheExec.current.delete(nid);
      // Les liaisons entre réglages passent par `reglagesApresChangement`, et non par ce point
      // d'appel : il y en a deux dans ce fichier, et une règle écrite ici ne servirait qu'à l'un.
      setNodes((nds2) => nds2.map((n) => n.id === nid
        ? { ...n, data: { ...n.data, parametres: reglagesApresChangement(
            String(n.data.ficheId), n.data.parametres, nom, val) } }
        : n));
      reinitialiserNoeud(nid);
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
        nom: t("btn.commentaire"),
        ...(callbacksNoeudRef.current?.()),
      },
    }]);
  }, [setNodes, t]);

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
          nom: t("btn.cadre"),
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
  // Hook extrait — voir DECOUPAGE-APP.md. La logique pure vit dans core/meta.ts.
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
      registre,
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

  // ── Glisser-déposer ──
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const ficheId = e.dataTransfer.getData("application/attic-fiche-id");
    if (!ficheId || !rfInstance || !wrapperRef.current) return;
    const bounds = wrapperRef.current.getBoundingClientRect();
    ajouterNoeud(ficheId, rfInstance.screenToFlowPosition({ x: e.clientX - bounds.left, y: e.clientY - bounds.top }));
  }, [ajouterNoeud, rfInstance]);

  const onPaneClick = useCallback((e: React.MouseEvent) => {
    const type = pendingAddRef.current;
    if (type && wrapperRef.current && rfInstanceRef.current) {
      const bounds = wrapperRef.current.getBoundingClientRect();
      const position = rfInstanceRef.current.screenToFlowPosition({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });
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
    const source = noeudsRef.current.find((n) => n.id === traduite.source);
    const target = noeudsRef.current.find((n) => n.id === traduite.target);
    return validerArete(source, target, { ...conn, ...traduite });
  }, [nomDeNoeud]);

  const nodeColor = useCallback((node: any) => {
    const cat = categorieNoeud(node.data?.ficheId, registre.trouverDef(node.data?.ficheId));
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
  const { sauvegarder, sauvegarderAuto, exporter, importer, memoriserEncours } = usePersistance({
    nodes, edges, setNodes, setEdges, rfInstance, repertoire,
    sauvegarderContexteCourant, grapheRacineRef, setPile,
    reinitialiserNoeud, supprimerNoeud, setPrioritaire, lancerRef, cacheExec,
    callbacksNoeud,
    currentFilePath, setCurrentFilePath,
  });

  // ── Sauvegarde automatique ──
  //
  // Toutes les 30 secondes, en silence, tant qu'un fichier de projet est ouvert — et
  // seulement si le graphe a changé depuis la dernière écriture.
  //
  // Le minuteur est monté UNE FOIS par fichier. Il dépendait auparavant de `sauvegarder`,
  // dont l'identité change à chaque rendu : chaque modification du graphe démontait
  // l'effet et relançait le compte à zéro, si bien que la sauvegarde n'avait lieu qu'au
  // repos. Mesuré dans l'application avant correction : dix changements de paramètre
  // espacés de dix secondes, cent une secondes de travail, aucune écriture. Elle
  // sauvegardait quand on ne faisait rien, et pas quand on travaillait.
  //
  // La fonction appelée est lue dans une ref, pour que le minuteur garde le graphe à
  // jour sans avoir à se remonter.
  //
  // La bascule est lue dans une ref elle aussi : le minuteur n'a pas à se remonter quand
  // on la change, et `sauvegarderAuto` s'abstient d'écrire si elle est coupée.
  const sauvegardeAutoActiveRef = useRef(sauvegardeAutoActive);
  sauvegardeAutoActiveRef.current = sauvegardeAutoActive;
  const sauvegarderAutoRef = useRef(sauvegarderAuto);
  sauvegarderAutoRef.current = () => sauvegarderAuto(sauvegardeAutoActiveRef.current);
  useEffect(() => {
    if (!currentFilePath) return;
    const id = setInterval(() => {
      sauvegarderAutoRef.current().catch((err) => console.error("[attic] Sauvegarde automatique échouée", err));
    }, PERIODE_SAUVEGARDE_MS);
    return () => clearInterval(id);
  }, [currentFilePath]);

  // Et une dernière fois à la fermeture : entre deux battements, jusqu'à trente secondes
  // de travail ne tiennent qu'en mémoire. Le processus principal interrompt la fermeture,
  // envoie cette demande et attend la réponse — puis ferme, quoi qu'il arrive : une
  // fenêtre qui refuserait de se fermer serait pire que la perte qu'on évite. La réponse
  // part donc dans tous les cas, y compris si la sauvegarde échoue ou n'a pas lieu d'être.
  useEffect(() => {
    const api = (window as any).api;
    if (!api?.fermetureDemandeSauvegarde) return;
    api.fermetureDemandeSauvegarde(async () => {
      try {
        await sauvegarderAutoRef.current();
      } catch (err) {
        console.error("[attic] Sauvegarde à la fermeture échouée", err);
      } finally {
        api.fermeturePrete?.();
      }
    });
  }, []);

  // ── Filet de sécurité anti-curseur collé ──
  //
  // Si le bouton souris est relâché sans que la fenêtre le voie — second écran, Alt-Tab, menu
  // système, fenêtre qui perd le focus pendant le geste —, le nœud reste accroché au curseur : rien
  // ne vient clore le glissement. Le défaut est rare parce qu'il demande ce concours de
  // circonstances, mais il est bien réel.
  //
  // CE FILET A ÉTÉ REFAIT, l'ancien ne pouvant pas fonctionner, pour deux raisons vérifiées dans la
  // source de `d3-drag` — la bibliothèque par laquelle React Flow glisse :
  //
  //  1. il envoyait `pointerup` et `pointercancel`. Or d3-drag ne termine un geste que sur
  //     **mouseup** : `select(event.view).on("mouseup.drag", mouseupped, …)`. On envoyait donc un
  //     événement que personne n'écoutait. Voir `liberer-glissement.ts`, qui envoie le bon, avec le
  //     `view` dont d3 a besoin pour se désabonner.
  //  2. il s'armait sur un `pointerdown` écouté en phase de BULLE. Une quinzaine de vues d'Attic
  //     arrêtent la propagation de cet événement pour ne pas déclencher le glissement du nœud ; le
  //     filet restait donc DÉSARMÉ précisément sur les nœuds à forme d'onde, à séquenceur ou à
  //     lecteur audio — ceux sur lesquels on clique le plus. D'où l'écoute en CAPTURE ci-dessous.
  //
  // Deux déclencheurs valent mieux qu'un : le mouvement sans bouton, qui attrape le retour du
  // curseur dans la fenêtre, et la perte de focus, qui libère sans attendre ce retour.
  useEffect(() => {
    const capture = { capture: true } as const;
    const derniere = { clientX: 0, clientY: 0, pointerId: 1, pointerType: "mouse" };

    const onPointerDown = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      pointerDownRef.current = true;
      derniere.clientX = e.clientX; derniere.clientY = e.clientY;
      derniere.pointerId = e.pointerId; derniere.pointerType = e.pointerType;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.isPrimary) pointerDownRef.current = false;
    };
    const liberer = () => {
      if (!pointerDownRef.current) return;
      pointerDownRef.current = false;
      libererGlissement(rfRef.current ?? window, derniere);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.isPrimary === false) return;
      derniere.clientX = e.clientX; derniere.clientY = e.clientY;
      derniere.pointerId = e.pointerId; derniere.pointerType = e.pointerType;
      if (relachementManque(pointerDownRef.current, e.buttons)) liberer();
    };

    window.addEventListener("pointerdown", onPointerDown, capture);
    window.addEventListener("pointerup", onPointerUp, capture);
    window.addEventListener("pointercancel", onPointerUp, capture);
    window.addEventListener("pointermove", onPointerMove, capture);
    window.addEventListener("blur", liberer);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, capture);
      window.removeEventListener("pointerup", onPointerUp, capture);
      window.removeEventListener("pointercancel", onPointerUp, capture);
      window.removeEventListener("pointermove", onPointerMove, capture);
      window.removeEventListener("blur", liberer);
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
      <div className={`attic-canevas ${pendingAdd ? "attic-canevas-pending" : ""}`} ref={wrapperRef} onDrop={onDrop} onDragOver={(e) => e.preventDefault()} onPointerDownCapture={surPointerDown}>
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
          onSauvegarder={sauvegarder}
          onDetacherFichier={detacherFichier}
          sauvegardeAuto={sauvegardeAutoActive}
          onBasculerSauvegardeAuto={basculerSauvegardeAuto}
          economieMemoire={economieMemoire}
          onBasculerEconomieMemoire={basculerEconomieMemoire}
          profondeurExport={profondeurExport}
          onChangerProfondeurExport={changerProfondeurExport}
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
          cacheExec.current.delete(sel.id);
          // Même règle que l'autre point d'appel, et la même fonction : l'inspecteur doit voir
          // exactement ce que le nœud reçoit, sans quoi un réglage ajusté n'apparaîtrait pas.
          const suite = reglagesApresChangement(String(sel.data.ficheId), sel.data.parametres, nom, val);
          setNodes((nds) => nds.map((n) => {
            if (n.id !== sel.id) return n;
            return { ...n, data: { ...n.data, parametres: suite } };
          }));
          setSel((prev) => prev ? { ...prev, data: { ...prev.data, parametres: suite } } : null);
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
