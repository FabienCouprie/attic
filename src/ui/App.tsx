// ui/App.tsx — Application principale
import { useRealisateurDemo } from "./demo/useRealisateurDemo";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  type Node, type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { trouverMeta, estFrontiere, type AreteG, type NoeudG } from "../core";

import "../audio/adaptateur";

const tousLesPlugins = () => registreUI().tousLesPlugins();
import { useI18n, defautParametre, defautCanoniqueChoix } from "../i18n";

import { idUnique } from "./ids";
import { usePoseGrapheEngendre } from "./hooks/usePoseGrapheEngendre";
import { trouverDef } from "./ports-canevas";
import { useEnCours } from "./hooks/useEnCours";
import { useRelanceApresReglage } from "./hooks/useRelanceApresReglage";
import { useChargementMedias } from "./hooks/useChargementMedias";
import { useNotesEtCadres } from "./hooks/useNotesEtCadres";
import { useHistorique } from "./hooks/useHistorique";
import { useDicteeCanevas } from "./hooks/useDicteeCanevas";
import { usePreferencesAtelier } from "./hooks/usePreferencesAtelier";
import { useSoundFont } from "./hooks/useSoundFont";
import { useConnexions } from "./hooks/useConnexions";
import { useCommandesBarre } from "./hooks/useCommandesBarre";
import { BarreMeta } from "./BarreMeta";
import { InspecteurDuCanevas } from "./InspecteurDuCanevas";
import type { NoeudAtelier } from "./noeud-atelier";
import { tailleDefaut } from "./tailles-noeuds";
import { usePersistance } from "./hooks/usePersistance";
import { useMetaComposants } from "./hooks/useMetaComposants";
import { useExecutionGraphe } from "./hooks/useExecutionGraphe";
import { useCopierColler } from "./hooks/useCopierColler";
import { resultatDe } from "./resultats";
import { categorieNoeud, COULEURS_CATEGORIE } from "./AtelierNode";
import { BarreOutils } from "./BarreOutils";
import { Palette } from "./Palette";
import { MenuContextuel } from "./MenuContextuel";
import { useMenuContextuel } from "./hooks/useMenuContextuel";
import { useDepot } from "./hooks/useDepot";
import { useSauvegardeAutomatique } from "./hooks/useSauvegardeAutomatique";
import { useFiletGlissement } from "./hooks/useFiletGlissement";
import { useBulles } from "./hooks/useBulles";
import { useRepliBulles } from "./hooks/useRepliBulles";
import { signatureBulles, synchroniserFichesBulles } from "./fichesBulles";
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

// Le type d'un nœud du canevas vit dans `ui/noeud-atelier.ts` ; nodeTypes/edgeTypes dans
// `reactflowTypes.ts` (hors du cycle HMR d'App.tsx) pour éviter l'avertissement React Flow #002.

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
  // ── Les réglages retenus d'une session à l'autre, dans hooks/usePreferencesAtelier.ts ──
  const {
    paletteOuverte, togglePalette, sauvegardeAutoActive, basculerSauvegardeAuto,
    economieMemoire, basculerEconomieMemoire, economieMemoireRef, theme, setTheme, repertoire, changerRepertoire,
  } = usePreferencesAtelier();
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

  // LE FICHIER EST À LA FENÊTRE : une fenêtre neuve n'en a pas. Voir `ui/fenetre.ts`.
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(() => demarrage().fichier);

  // Met à jour le titre de la fenêtre et sa copie quand le fichier courant change. L'en-cours
  // partagé ne le reçoit qu'avec le graphe qui va avec, dans `usePersistance`.
  useEffect(() => {
    noterFichierPropre(currentFilePath);
    document.title = currentFilePath ? `[Attic] ${currentFilePath.split(/[\\/]/).pop() || currentFilePath}` : "Attic";
  }, [currentFilePath]);

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

  const [prioritaire, setPrioritaire] = useState<string | null>(null);
  const prioritaireRef = useRef<string | null>(null);
  prioritaireRef.current = prioritaire;
  // ── Le SoundFont global, dans hooks/useSoundFont.ts ──
  const { sf2Nom: sf2NomState, chargerSF2 } = useSoundFont({ repertoire, cacheExec, enExecution });
  // ── Historique, Ctrl+Z, vidage du canevas et fichier détaché, dans hooks/useHistorique.ts ──
  const { pushHistorique, undo, fermerOnglet, detacherFichier } = useHistorique({
    noeudsRef, aretesRef, grapheRacineRef, callbacksNoeudRef, cacheExec,
    setNodes, setEdges, setPile, setSel, setCurrentFilePath, pile, currentFilePath,
  });

  // Mettre à jour prioritaire sur les nœuds
  useEffect(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, prioritaire: n.id === prioritaire } })));
  }, [prioritaire, setNodes]);

  // Recadre la vue à chaque navigation dans/hors d'un méta-composant.
  useEffect(() => {
    const t = setTimeout(() => rfInstance?.fitView?.({ duration: 200, padding: 0.2 }), 60);
    return () => clearTimeout(t);
  }, [pile, rfInstance]);

  const [pluginsVersion, setPluginsVersion] = useState(0);
  const plugins = useMemo(() => tousLesPlugins(), [pluginsVersion]);

  // ── Chargement automatique de l'en-cours sauvegardé, dans hooks/useEnCours.ts ──
  useEnCours({ pluginsVersion, rfInstance, callbacksNoeudRef, setNodes, setEdges });

  // ── Exécution du graphe, dans hooks/useExecutionGraphe.ts ──
  // La boucle `lancer` + la réinitialisation en cascade + les statuts. La logique
  // pure d'ordonnancement/cache vit dans core/graphe.ts (testée).
  const poserGrapheEngendre = usePoseGrapheEngendre({ noeudsRef, callbacksNoeudRef, setNodes, setEdges, lang });
  const { lancer, arreter, reinitialiserNoeud, reinitialiserAval, reinitialiserPourReglage, reinitialiserTout } = useExecutionGraphe({
    noeudsRef, aretesRef, enExecRef, prioritaireRef, audioCtxRef, cacheExec, economieMemoireRef,
    pileMetaRef: pileRef,
    edges, setNodes, setEnExecution, prioritaire, setPrioritaire, repertoire,
    // La pose d'un graphe demandé par un composant, dans hooks/usePoseGrapheEngendre.ts.
    onGrapheGenere: poserGrapheEngendre,
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

  // ── Clic droit, dans hooks/useMenuContextuel.ts ; glisser-déposer, dans hooks/useDepot.ts ──
  const { menu, fermerMenu, surPointerDown, surClicDroit, surClicDroitSelection, surClicDroitFond } = useMenuContextuel({
    noeudsRef, basculerRepli, developper, clarifier,
  });
  const { onDrop } = useDepot({ rfInstance, ajouterNoeud, setNodes, callbacksNoeud, pushHistorique, lang });

  // ── Poser une arête à la souris, dans hooks/useConnexions.ts ──
  const { isValidConnection, onConnect } = useConnexions({ noeudsRef, aretesRef, setEdges, pushHistorique, lang });

  const nodeColor = useCallback((node: any) => {
    const cat = categorieNoeud(node.data?.ficheId, registreUI().trouverDef(node.data?.ficheId));
    return COULEURS_CATEGORIE[cat] ?? "var(--text-muted)";
  }, []);

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

  // ── Trois commandes de la barre qui ont besoin de l'atelier, dans hooks/useCommandesBarre.ts ──
  const { choisirDossier, lancerEtRecadrer, recharger } = useCommandesBarre({
    changerRepertoire, lancer, rfInstance, enExecution, memoriserEncours,
  });

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
        onChoisirDossier={choisirDossier}
        onLancer={lancerEtRecadrer}
        onArreter={arreter}
        onReinitialiser={reinitialiserTout}
        onRecharger={recharger}
        onResumeAudio={resumeAudio}
        nbPlugins={nbPlugins}
        sf2Nom={sf2NomState}
        currentFilePath={currentFilePath}
        onChargerSF2={chargerSF2}
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
      <div className={`attic-canevas ${pendingAdd ? "attic-canevas-pending" : ""}`} ref={wrapperRef} onDrop={onDrop} onDragOver={(e) => e.preventDefault()} onPointerDownCapture={surPointerDown} onContextMenu={surClicDroitFond}>
        <BarreMeta
          pile={pile} ajouterNoeud={ajouterNoeud} grouperAvecBulles={grouperAvecBulles}
          degrouper={degrouper} renommer={renommer} remonterA={remonterA} fermerOnglet={fermerOnglet}
        />
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
          onNodeContextMenu={(e, n) => surClicDroit(e, n as Node)}
          onSelectionContextMenu={(e, sel) => surClicDroitSelection(e, sel as Node[])}
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
        <MenuContextuel etat={menu} onFermer={fermerMenu} />
      </div>
      <InspecteurDuCanevas
        nodes={nodes} edges={edges} sel={sel} setSel={setSel} setNodes={setNodes} cacheExec={cacheExec}
        changerReglage={changerReglage} pushHistorique={pushHistorique}
        supprimerNoeud={supprimerNoeud} reinitialiserNoeud={reinitialiserNoeud}
      />
      {calqueDemo}
    </div>
  );
}
