// ui/App.tsx — Application principale
import { useRealisateurDemo } from "./demo/useRealisateurDemo";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  type Node, type Edge, type Connection, type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { trouverMeta,
  estFrontiere, estBulle, estSubstitution, fermeraitUnCycle, ID_ENTREE_FRONTIERE, ID_SORTIE_FRONTIERE,
  traduireConnexion, type AreteG, type NoeudG } from "../core";

import "../audio/adaptateur";

const tousLesPlugins = () => registreUI().tousLesPlugins();
import { chargerSF2Globale, autoChargerSF2, sf2Nom } from "../plugins/soundfontGlobal";
import { useI18n, defautParametre, defautCanoniqueChoix } from "../i18n";

import { idUnique } from "./ids";
import { planDeGrapheEngendre } from "./graphe-engendre";
import { premierLienCompatible } from "./dictee/pose-dictee";
import { couleurArete, couleurFlux, portsDeFiche, trouverDef } from "./ports-canevas";
import { useEnCours } from "./hooks/useEnCours";
import { useRelanceApresReglage } from "./hooks/useRelanceApresReglage";
import { useChargementMedias } from "./hooks/useChargementMedias";
import { useNotesEtCadres } from "./hooks/useNotesEtCadres";
import { useHistorique } from "./hooks/useHistorique";
import { useDicteeCanevas } from "./hooks/useDicteeCanevas";
import { tailleDefaut } from "./tailles-noeuds";
import { positionsEnCascade, sorteDeposee, type SorteDeposee } from "./fichiers-deposes";
import { usePersistance } from "./hooks/usePersistance";
import { useMetaComposants } from "./hooks/useMetaComposants";
import { useExecutionGraphe } from "./hooks/useExecutionGraphe";
import { useCopierColler } from "./hooks/useCopierColler";
import { resultatDe } from "./resultats";
import { CLE_PREFERENCE, lirePreference } from "./sauvegarde-auto";
import { ecrireEconomieMemoire, lireEconomieMemoire } from "./economie-memoire";
import { validerArete } from "./validerGraphe";
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

import { chargerMetasLocaux } from "./metasLocaux";
import { useFenetresPartagees } from "./hooks/useFenetresPartagees";
import { installerMetasExemples } from "../plugins/meta-exemples";
import { chargerNodesInstalles } from "../core";
// LE BAC SE POSE EN S'IMPORTANT : sans lui, un nœud installé refuse de s'exécuter, et c'est voulu.
import "./bac-a-sable-noeud";
import { PanneauInspecteur } from "./PanneauInspecteur";
import { registreUI } from "./registre-actif";
import { demarrage, noterFichierPropre, ouvrirNouvelleFenetre } from "./fenetre";
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
console.log(`[attic] Plugins avant chargerMetasLocaux: ${tousLesPlugins().length}`);
// Métas dont un sous-nœud référence un plugin introuvable (renommé/supprimé) :
// non réinjectés dans le catalogue par chargerMetasLocaux (qui les garde en
// stockage), mais signalés après le premier rendu (cf. useEffect plus bas) —
// sinon ils disparaissent de la palette sans qu'aucune trace n'explique pourquoi.
const metasNonRestaures = chargerMetasLocaux();
installerMetasExemples();
// Restaure les nodes installés dynamiquement (.zip) avant le premier rendu. Leur CODE, lui, ne
// s'évalue qu'au premier run, dans le cadre isolé que l'import ci-dessus a posé.
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
  // LA PROFONDEUR DES FICHIERS ÉCRITS N'EST PLUS ICI, et ce qui était écrit à sa place disait la
  // limite en la tenant pour voulue : « elle ne prend effet qu'au prochain lancement ». Mesuré,
  // c'était pire — elle ne prenait effet NI au prochain lancement, l'adresse de l'aperçu étant
  // gardée tant que le tampon est le même objet. Le réglage vit dans `ui/profondeur-export.ts`,
  // son sélecteur s'y abonne, et changer de valeur refait les aperçus sans rejouer un seul nœud :
  // voir `ui/SelecteurProfondeurExport.tsx` et `ui/refaire-apercus.ts`.
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

  // LE FICHIER EST À LA FENÊTRE : une fenêtre neuve n'en a pas. Voir `ui/fenetre.ts`.
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(() => demarrage().fichier);

  // Met à jour le titre de la fenêtre et sa copie quand le fichier courant change. L'en-cours
  // partagé ne le reçoit qu'avec le graphe qui va avec, dans `usePersistance`.
  useEffect(() => {
    noterFichierPropre(currentFilePath);
    document.title = currentFilePath ? `[Attic] ${currentFilePath.split(/[\\/]/).pop() || currentFilePath}` : "Attic";
  }, [currentFilePath]);

  const changerRepertoire = useCallback((r: string) => {
    setRepertoire(r);
    localStorage.setItem("attic-repertoire", r);
  }, []);

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
  // ── Historique, Ctrl+Z, vidage du canevas et fichier détaché, dans hooks/useHistorique.ts ──
  const { pushHistorique, undo, fermerOnglet, detacherFichier } = useHistorique({
    noeudsRef, aretesRef, grapheRacineRef, callbacksNoeudRef, cacheExec,
    setNodes, setEdges, setPile, setSel, setCurrentFilePath, pile, currentFilePath,
  });

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

  // ── Chargement automatique de l'en-cours sauvegardé, dans hooks/useEnCours.ts ──
  useEnCours({ pluginsVersion, rfInstance, callbacksNoeudRef, setNodes, setEdges });

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
        const plan = planDeGrapheEngendre(spec, noeudsRef.current, `${nodeId}-${Date.now()}`,
          (s, c) => premierLienCompatible(portsDeFiche(s), portsDeFiche(c),
            (a, b) => registreUI().fluxCompatibles(a.type, b.type, a.sousType, b.sousType)));
        for (const c of plan.cycles) {
          console.warn(`[attic] Prompt → graphe : arête ${c.source} → ${c.target} écartée, elle refermerait un cycle.`);
        }
        // LE MÊME SORT QU'UN CYCLE, ET POUR LA MÊME RAISON : un modèle de langue peut demander un
        // lien que les ports refusent. L'arête est écartée plutôt que posée en rouge, et le nom des
        // deux composants est dit — le reste du graphe reste utilisable.
        for (const x of plan.incompatibles) {
          console.warn(`[attic] Prompt → graphe : arête écartée, « ${spec.nodes[x.source]?.ficheId} » `
            + `et « ${spec.nodes[x.target]?.ficheId} » n'ont aucun couple de ports qui s'accorde.`);
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
              ...cbs,
            },
          };
        });
        const nouveauxEdges: Edge[] = plan.aretes.map(({ sortie, entree, ...a }) => ({
          ...a,
          sourceHandle: `out:${sortie}`,
          targetHandle: `in:${entree}`,
          type: "arete-personnalisee" as const,
          style: { stroke: couleurArete(nouveauxNodes, a.source, `out:${sortie}`), strokeWidth: 2.5 },
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

  // ── Relance après un réglage, dans hooks/useRelanceApresReglage.ts ──
  const { perimerEtRelancer, changerReglage } = useRelanceApresReglage({
    noeudsRef, lancerRef, cacheExec, reinitialiserPourReglage, setNodes,
  });

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
      // CE QU'IL Y A À RÉVOQUER EST DANS LE MAGASIN DES RÉSULTATS, et non dans les données du nœud :
      // un résultat n'y vit plus. La valeur dit d'elle-même si elle est à révoquer. Quatre noms
      // étaient un jour énumérés ici, la même divergence que celle relevée dans la remise à zéro :
      // les films du montage vidéo, de l'extrait, du muet et de la démonstration sont eux aussi des
      // `createObjectURL`, et supprimer un de ces nœuds laissait son film en mémoire. Les fichiers
      // d'entrée, eux, ne sont pas des résultats et restent intacts, ce qui garde l'annulation
      // utilisable. Voir `ui/resultats.ts`.
      for (const v of Object.values(resultatDe(id))) {
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

  // Ce que les fenêtres ouvertes se partagent : métas et nœuds installés, et le refus de supprimer
  // un méta qu'une autre emploie. Voir `hooks/useFenetresPartagees.ts`.
  const { supprimerMetaDuCatalogue } = useFenetresPartagees({
    noeudsRef, grapheRacineRef, pileRef, setNodes, setPluginsVersion, pushHistorique, supprimerNoeud, t, lang });

  const { chargerMedia, changerEnregistrement, chargerIR } = useChargementMedias({ cacheExec, setNodes, reinitialiserNoeud });

  // Callbacks standard attachés à tout nœud (ajout, import, copier/coller).
  const callbacksNoeud = useCallback(() => ({
    onSupprimerNoeud: (nid: string) => {
      pushHistorique();
      supprimerNoeud(nid);
    },
    onReinitialiser: (nid: string) => reinitialiserNoeud(nid),
    onDefinirPrioritaire: (nid: string) => { setPrioritaire(nid); lancerRef.current(nid); },
    // ── Chargement d'un média sur un nœud, dans hooks/useChargementMedias.ts ──
    onChargerAudio: (nid: string, fichier: File) => chargerMedia(nid, "audio", fichier),
    onChargerMidi: (nid: string, fichier: File) => chargerMedia(nid, "midi", fichier),
    onChargerImage: (nid: string, fichier: File) => chargerMedia(nid, "image", fichier),
    onChargerSvg: (nid: string, fichier: File) => chargerMedia(nid, "svg", fichier),
    onChargerPdf: (nid: string, fichier: File) => chargerMedia(nid, "pdf", fichier),
    onChangerEnregistrement: changerEnregistrement,
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
    // UN GESTE SUR UNE LIGNE DE TEMPS PASSE PAR LA MÊME PORTE QU'UN RÉGLAGE, et c'est la correction
    // du 2026-10-26. La vue écrivait son découpage par un `setNodes` nu : rien ne purgeait le cache,
    // rien ne périmait l'aval, rien ne relançait. Le morceau déplacé n'était donc entendu qu'au
    // PROCHAIN run déclenché par autre chose — et comme un réglage de cette piste est éteint par le
    // morceau qu'on vient d'y poser, tirer une barre puis tirer la glissière donnait l'impression
    // que RIEN ne fonctionnait. Relevé par Fabien, trois fois dans cette famille.
    onChangerDecoupe: (nid: string, decoupe: Record<string, unknown>) => { setNodes((nds2) => nds2.map((n) => n.id === nid ? { ...n, data: { ...n.data, ...decoupe } } : n)); perimerEtRelancer(nid); },
    onChargerIR: chargerIR,
  }), [setNodes, setEdges, reinitialiserNoeud, reinitialiserAval, setPrioritaire, supprimerNoeud, pushHistorique, cacheExec, lancerRef, perimerEtRelancer,
    chargerMedia, changerEnregistrement, chargerIR]);
  callbacksNoeudRef.current = callbacksNoeud;

  // ── Ajouter / Supprimer ──
  /**
   * Le nœud que le canevas pose pour cette fiche, à cette place — et il n'y a plus qu'une écriture.
   *
   * ELLE ÉTAIT ÉCRITE DEUX FOIS, et les deux calculaient la même chose dans le même ordre : ici
   * pour la palette et les boutons de frontière, et dans l'application d'une dictée, qui ne
   * l'appelait pas. Le commentaire ci-dessous n'existait que d'un côté ; si cette règle changeait,
   * un seul des deux chemins aurait suivi.
   */
  const fabriquerNoeud = useCallback((
    ficheId: string, position: { x: number; y: number }, noeuds: readonly { id: string }[],
  ) => {
    const def = trouverDef(ficheId);
    if (!def) return null;
    const parametres: Record<string, number | string> = {};
    for (const p of def.parametres) {
      // Tout paramètre « choix » passe par la forme canonique (indépendante de la langue), y
      // compris SANS optionIds : la valeur stockée doit correspondre à l'`<option value>` du menu,
      // qui reste le terme français. Restreindre ce traitement aux seuls optionIds créait, en
      // anglais, des nœuds dont le paramètre valait par ex. "Center" — absent du menu (donc
      // affiché comme « Left ») et refusé par l'exécution.
      parametres[p.nom] = p.type === "choix" ? defautCanoniqueChoix(p) : defautParametre(p, lang);
    }
    const { width, height } = tailleDefaut(def);
    return {
      id: idUnique(noeuds as { id: string }[]), type: "atelier" as const, position, width, height,
      data: { ficheId, parametres, statut: "attente", ...callbacksNoeud() },
    };
  }, [lang, callbacksNoeud]);

  const ajouterNoeud = useCallback((ficheId: string, pos?: { x: number; y: number }) => {
    const position = pos ?? { x: 120 + Math.random() * 200, y: 80 + Math.random() * 240 };
    setNodes((nds) => {
      const noeud = fabriquerNoeud(ficheId, position, nds);
      return noeud ? [...nds, noeud as unknown as (typeof nds)[number]] : nds;
    });
  }, [setNodes, fabriquerNoeud]);

  // ── Notes et cadres, dans hooks/useNotesEtCadres.ts ──
  const { pendingAdd, ajouterCommentaire, ajouterCadre, onPaneClick } = useNotesEtCadres({
    noeudsRef, rfInstanceRef, callbacksNoeudRef, setNodes, setSel,
  });

  // ── Copier / Couper / Coller (Ctrl+C / Ctrl+X / Ctrl+V) et Ctrl+Z, dans hooks/useCopierColler.ts ──
  useCopierColler({ noeudsRef, setNodes, setSel, pushHistorique, supprimerNoeud, callbacksNoeud, undo, t });

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

  // ── Ce qu'une dictée fait au canevas, dans hooks/useDicteeCanevas.ts ──
  const dictee = useDicteeCanevas({
    noeudsRef, aretesRef, sel, fabriquerNoeud, pushHistorique, setNodes, setEdges, undo, lancer, arreter, rfInstance, lang,
  });

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
        onDetacher={ouvrirNouvelleFenetre}
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
        onImporter={importer}
        onOuvrirExemple={ouvrirExemple}
      />
      <Palette
        ouverte={paletteOuverte}
        onToggle={togglePalette}
        plugins={plugins.filter((p) => !estFrontiere(p.id))}
        onSupprimerMeta={supprimerMetaDuCatalogue}
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
