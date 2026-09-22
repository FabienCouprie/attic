import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Handle, Position, NodeResizer, useReactFlow, useUpdateNodeInternals, useNodeConnections, type NodeProps, type Node } from "@xyflow/react";
import { estMeta, estFrontiere } from "../core";
import { registre } from "../audio/adaptateur";
import type { FicheAudio } from "../audio/types-domaine";

const trouverDef = (id: string) => registre.trouverDef(id);
const couleurFlux = (id: string) => registre.couleurFlux(id);
import { useI18n } from "../i18n";
import { vuesPourNoeud, vueAvantMasqueMessage } from "./vues";
import { useStatut } from "./statuts";
import { etatPorts } from "./ports-extensibles";
import { copierTexte } from "./copier";
import { TexteAvecLiens } from "./texteAvecLiens";
import { nomFiche, noticeFiche, resumeFiche } from "./libelles-fiche";
import { bufferVersWavBlob } from "../audio";
import { tamponPourApercu } from "../audio/multicanal-ecoute";

/**
 * Le lecteur d'un intermédiaire sur une piste longue, construit au clic.
 *
 * POURQUOI UN BOUTON PLUTÔT QU'UN LECTEUR. Au-delà de dix minutes, le moteur ne fabrique plus
 * l'aperçu des nœuds que personne ne regarde : 635 Mo par heure de son, multipliés par la chaîne
 * (cf. core/memoire.ts). Le résultat n'est pas perdu pour autant — le tampon est là, et c'est lui
 * qu'on convertit ici, au moment où quelqu'un demande à l'entendre.
 */
function LecteurALaDemande({ buffer }: { buffer: AudioBuffer }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  // La conversion se fait sur ce tampon-ci : si le nœud est recalculé, on repart de zéro.
  useEffect(() => {
    setUrl(null);
    return () => setUrl((u) => (u && URL.revokeObjectURL(u), null));
  }, [buffer]);
  if (!url) {
    return (
      <div className="attic-node-player nodrag" onPointerDown={(e) => e.stopPropagation()}>
        <button
          className="attic-node-copy-btn"
          onClick={(e) => { e.stopPropagation(); setUrl(URL.createObjectURL(bufferVersWavBlob(tamponPourApercu(buffer)))); }}
        >
          {t("btn.ecouter")}
        </button>
      </div>
    );
  }
  return (
    <div className="attic-node-player nodrag" onPointerDown={(e) => e.stopPropagation()}>
      <IndicateurNiveau buffer={buffer} />
      <audio key={url} className="attic-node-audio nodrag" controls src={url}
        onLoadedMetadata={(e) => { (e.currentTarget as HTMLAudioElement).volume = 0.3; }} />
    </div>
  );
}

export type DonneesNoeud = {
  ficheId: string; parametres: Record<string, number | string>; statut: string;
  progression?: string;
  /** Vrai quand `progression` vient du NŒUD lui-même (son `onProgress`), et non du moteur. */
  progressionDuNoeud?: boolean;
  audioResultatUrl?: string; audioResultatMessage?: string;
  audioFichier?: File; audioNom?: string; audioUrl?: string; audioChemin?: string;
  audioResultatBuffer?: AudioBuffer;
  midiFichier?: File; midiNom?: string; midiFichierSortie?: File;
  modeleFichier?: File; sf2Data?: unknown; sf2InstrumentIdx?: number;
  enregistrementBlob?: Blob; enregistrementUrl?: string;
  imageFichier?: File; imageNom?: string;
  svgFichier?: File; svgNom?: string;
  pdfFichier?: File; pdfNom?: string;
  prioritaire?: boolean;
  tempsExecution?: number;
  imageResultatUrl?: string;
  imageResultatFile?: File;
  onDefinirPrioritaire?: (id: string) => void;
  onReinitialiser?: (id: string) => void;
  onSupprimerNoeud?: (id: string) => void;
  onChargerAudio?: (id: string, fichier: File) => void;
  onChargerMidi?: (id: string, fichier: File) => void;
  onChargerImage?: (id: string, fichier: File) => void;
  onChargerSvg?: (id: string, fichier: File) => void;
  onChargerPdf?: (id: string, fichier: File) => void;
  onChangerParametre?: (id: string, nom: string, valeur: string | number) => void;
  zonesSelectionnees?: { debut: number; duree: number }[];
  onChangerZones?: (id: string, zones: { debut: number; duree: number }[]) => void;
  onChargerIR?: (id: string, fichier: File) => void;
  [key: string]: unknown;
};

type NoeudAtelier = Node<DonneesNoeud, "atelier">;

// ── Couleurs de port ──
// La couleur d'un port vient désormais du registre de types de flux du domaine
// (core/typesFlux) : type inconnu ⇒ gris neutre. Voir couleurFlux().

const DEFS_CACHE = new Map<string, FicheAudio>();
function getDef(ficheId: string): FicheAudio | undefined {
  if (DEFS_CACHE.has(ficheId)) return DEFS_CACHE.get(ficheId);
  const def = trouverDef(ficheId);
  if (def) DEFS_CACHE.set(ficheId, def);
  return def;
}

export const COULEURS_CATEGORIE: Record<string, string> = {
  entree: "#4c6ef5",
  generation: "#40c057",
  effet: "#a855f7",
  analyse: "#f59e0b",
  visualisation: "#14b8a6",
  sortie: "#e8590c",
  collection: "#2b8a3e",
  autre: "#64748b",
};

export function categorieNoeud(ficheId: string, def?: FicheAudio): string {
  if (ficheId === "comment" || ficheId === "frame") return "autre";
  if (estFrontiere(ficheId)) return "autre";
  if (!def) return "autre";
  if (def.univers === "Entrées") {
    if (def.famille === "Génération") return "generation";
    return "entree";
  }
  if (def.univers === "Sorties") {
    if (def.famille === "Génération") return "generation";
    return "sortie";
  }
  if (def.univers === "Visualisation") return "visualisation";
  if (def.univers === "Collections") return "collection";
  if (def.univers === "Traitement") {
    if (def.famille === "Analyse") return "analyse";
    if (def.famille === "Génération") return "generation";
    return "effet"; // Effets, Montage, Conversion, etc.
  }
  if (def.univers === "Autres") {
    if (def.famille === "Génération") return "generation";
    if (def.famille === "Magenta") return "generation";
    if (def.famille === "Text to Speech") return "generation";
    if (def.famille === "Speech to Text") return "analyse";
    if (def.famille === "Analyse") return "analyse";
    if (def.famille === "Texte") return "entree";
    if (def.famille === "Théorie") return "analyse";
    if (def.famille === "Csound wrapper") return "generation";
    if (def.famille === "Multicanal") return "effet";
    if (def.famille === "Test zone") return "analyse";
  }
  return "autre";
}

// ── Indicateur de niveau (VU / pic) ──
function IndicateurNiveau({ buffer }: { buffer?: AudioBuffer }) {
  const niveau = useMemo(() => {
    if (!buffer || typeof AudioBuffer === "undefined" || !(buffer instanceof AudioBuffer)) return null;
    let peak = 0;
    let rmsAcc = 0;
    let n = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
        rmsAcc += v * v;
        n++;
      }
    }
    return { peak, rms: n > 0 ? Math.sqrt(rmsAcc / n) : 0 };
  }, [buffer]);
  if (!niveau) return null;
  const db = niveau.peak > 0 ? 20 * Math.log10(niveau.peak) : -Infinity;
  const dbText = Number.isFinite(db) ? `${db.toFixed(1)} dB` : "-∞ dB";
  const pct = Math.min(100, niveau.peak * 100);
  const couleur = niveau.peak >= 0.7 ? "#e8590c" : niveau.peak >= 0.3 ? "#f59e0b" : "#40c057";
  return (
    <div className="attic-node-vu" title={`Pic : ${dbText} | RMS : ${(niveau.rms * 100).toFixed(1)}%`}>
      <div className="attic-node-vu-bar-bg">
        <div className="attic-node-vu-bar" style={{ width: `${pct}%`, background: couleur }} />
      </div>
      <span className="attic-node-vu-text">{dbText}</span>
    </div>
  );
}

// Renderer GÉNÉRIQUE : en-tête, documentation, ports typés et statut sont communs
// à tous les nœuds. Les UI spécifiques à certains nœuds sont fournies par le
// registre de vues (ui/vues.tsx) — aucun couplage au domaine ici.
export function AtelierNode({ id, data, selected }: NodeProps<NoeudAtelier>) {
  const def = getDef(data.ficheId);
  const { t, lang } = useI18n();
  const nodeEstMeta = estMeta(data.ficheId as string);
  const nodeEstCommentaire = data.ficheId === "comment";
  const estCadre = data.ficheId === "frame";
  const estVexFlow = data.ficheId.startsWith("vexflow-");
  const paramLargeur = def?.parametres.find((p) => p.nom === "Largeur" || p.nomEn === "Width");
  const paramHauteur = def?.parametres.find((p) => p.nom === "Hauteur" || p.nomEn === "Height");
  const replie = data.replie === true;
  const categorie = categorieNoeud(data.ficheId, def);
  const categorieClass = categorie !== "autre" ? `attic-node-categorie-${categorie}` : "";
  const nom = (nodeEstMeta && typeof data.nom === "string" && data.nom.trim())
    ? data.nom
    : ((lang === "en" && def?.nomEn ? def.nomEn : def?.nom) ?? data.ficheId);
  const [docOpen, setDocOpen] = useState(false);
  // L'ETAT D'EXECUTION NE VIENT PLUS DE `data`. Le poser dans le tableau des nœuds obligeait à
  // remplacer ce tableau à chaque changement, donc à refaire passer React Flow sur les N nœuds —
  // 7 ms par nœud présent, à chaque fois. Ici, seul ce composant-ci est prévenu. Voir `statuts.ts`.
  const etatExec = useStatut(id);
  const statutClasse = etatExec.statut === "en_cours" ? "en-cours" : etatExec.statut === "termine" ? "termine" : etatExec.statut === "erreur" ? "erreur" : "attente";
  const statutLabel = etatExec.statut === "termine" ? t("statut.termine") : etatExec.statut === "en_cours" ? (etatExec.progression ?? t("statut.en_cours")) : etatExec.statut === "erreur" ? t("statut.erreur") : t("statut.attente");
  const nodeClassName = etatExec.statut === "en_cours" ? "running" : etatExec.statut === "termine" ? "termine" : etatExec.statut === "erreur" ? "erreur" : "attente";
  const descriptionTooltip = def ? resumeFiche(def, lang) : undefined;

  // ── Stabilité des handles ──
  const { getEdges, deleteElements, setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const nodeRef = useRef<HTMLDivElement>(null);
  const [survolPort, setSurvolPort] = useState<string | null>(null);
  const [flash, setFlash] = useState<"termine" | "erreur" | null>(null);
  const statutPrecedent = useRef(etatExec.statut);
  useEffect(() => {
    const nouveau = etatExec.statut;
    const ancien = statutPrecedent.current;
    if ((nouveau === "termine" || nouveau === "erreur") && nouveau !== ancien) {
      setFlash(nouveau);
    }
    statutPrecedent.current = nouveau;
  }, [etatExec.statut]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(t);
  }, [flash]);

  // ── Entrées affichées à la demande (cf. ui/ports-extensibles.ts) ──
  //
  // Les câbles branchés sont lus à CHAQUE rendu : c'est ce qui empêche le « − » de cacher une
  // piste câblée, et ce qui rallonge le nœud tout seul quand on rouvre un projet plus fourni.
  const connexionsEntrees = useNodeConnections({ handleType: "target", id });
  const ports = useMemo(() => etatPorts(
    def?.entrees.length ?? 0,
    def?.entreesExtensibles,
    typeof data.portsVisibles === "number" ? data.portsVisibles : undefined,
    connexionsEntrees.map((c) => Number(String(c.targetHandle ?? "in:0").split(":")[1])).filter(Number.isFinite),
  ), [def, data.portsVisibles, connexionsEntrees]);

  // ReactFlow mémorise la position de chaque poignée. Un nœud qui gagne ou perd une entrée change
  // de hauteur ET déplace celles du dessous : sans cette remesure, les câbles resteraient accrochés
  // là où les ports étaient. Même raison que la remesure posée après une exécution.
  useEffect(() => { updateNodeInternals(id); }, [ports.visibles, id, updateNodeInternals]);

  const reglerPortsVisibles = useCallback((n: number) => {
    setNodes((nds) => nds.map((x) => (x.id === id ? { ...x, data: { ...x.data, portsVisibles: n } } : x)));
    // ReactFlow mémorise la position des poignées : sans cela, les câbles restent accrochés là où
    // les ports étaient avant que le nœud ne change de taille.
    queueMicrotask(() => updateNodeInternals(id));
  }, [id, setNodes, updateNodeInternals]);

  const supprimerAretesHandle = useCallback((handleId: string) => {
    const aretes = getEdges().filter(
      (e) => (e.source === id && e.sourceHandle === handleId) || (e.target === id && e.targetHandle === handleId)
    );
    if (aretes.length) { deleteElements({ edges: aretes }); queueMicrotask(() => updateNodeInternals(id)); }
  }, [getEdges, deleteElements, updateNodeInternals, id]);

  // Remesure forcée des ports dès que l'ensemble des connexions du nœud change.
  //
  // ReactFlow ne mémorise la position des ports (`internals.handleBounds`) qu'au
  // prix d'une mesure du DOM, et il ne la refait QUE si la taille extérieure du
  // nœud a changé — cf. @xyflow/system, `updateNodeInternals` :
  //     doUpdate = dimensions.width && dimensions.height
  //                && (dimensionChanged || !handleBounds || force)
  // Or les nœuds redimensionnables ont une largeur/hauteur explicites, figées :
  // leur cadre extérieur ne bouge plus, tandis que leur contenu (forme d'onde,
  // sélecteur multi-zones, zone de texte, image…) se met en place plus tard et
  // décale les rangées de ports À L'INTÉRIEUR de ce cadre. ReactFlow ne voit
  // rien, garde des coordonnées périmées, et quand il ne retrouve pas un port il
  // retombe sur `getHandlePosition(node, null, …)` qui renvoie le milieu de
  // l'arête du nœud — d'où les liaisons collées au milieu des bords.
  //
  // C'est bien pourquoi un redimensionnement manuel, même d'un pixel, corrigeait
  // l'affichage : il change la taille extérieure, donc déclenche la remesure.
  // Plutôt que de simuler ce redimensionnement (qui altérerait la taille choisie
  // par l'utilisateur et provoquerait un sursaut visible), on déclenche
  // directement la remesure : `useUpdateNodeInternals` passe `force: true`, ce
  // qui court-circuite la condition ci-dessus et relit le DOM tel qu'il est.
  //
  // Déclencher sur le CHANGEMENT de connexions couvre les deux cas : la première
  // liaison tirée à la main, et le montage d'un projet rechargé dont les arêtes
  // existent dès la première image.
  const connexions = useNodeConnections({ id });
  const cleConnexions = connexions.map((c) => c.edgeId).sort().join("|");
  useEffect(() => {
    if (!cleConnexions) return;
    updateNodeInternals(id);
  }, [cleConnexions, id, updateNodeInternals]);

  // Même remesure à la fin d'une exécution : c'est le moment où le contenu
  // produit (forme d'onde, image, texte de résultat) se met enfin en place et
  // repousse les rangées de ports, sans que le cadre extérieur ne bouge d'un
  // pixel. Sans cela, un nœud connecté AVANT son exécution verrait ses liaisons
  // se décrocher au premier lancement. L'événement est rare (une fois par
  // exécution et par nœud), donc le coût est négligeable.
  useEffect(() => {
    if (!connexions.length) return;
    if (etatExec.statut !== "termine" && etatExec.statut !== "erreur") return;
    updateNodeInternals(id);
  }, [etatExec.statut, connexions.length, id, updateNodeInternals]);

  // LE CAS QUE LES DEUX REMESURES CI-DESSUS NE COUVRENT PAS : un nœud dont le cadre est figé et
  // dont le contenu grandit APRÈS la fin de l'exécution.
  //
  // Les ports sont collés au bas du nœud (`margin-top: auto`). Tant que le contenu tient dans le
  // cadre, ils ne bougent pas ; dès qu'il déborde, il les pousse VERS LE BAS, hors du cadre. La
  // position que ReactFlow a mémorisée est alors trop HAUTE, et l'arête se branche au-dessus de la
  // prise — c'est le symptôme signalé sur le sélecteur multi-zones, et c'est pourquoi
  // redimensionner d'un pixel le corrigeait : cela change la taille extérieure, la seule chose que
  // ReactFlow surveille de lui-même.
  //
  // Pourquoi la remesure posée sur la fin d'exécution ne suffit pas : elle part au moment où le
  // statut passe à « terminé », c'est-à-dire AVANT que le contenu produit — lecteur, image,
  // sélecteur de zones qui dessine sa forme d'onde — ne soit mis en page. Elle mesure donc un DOM
  // qui n'a pas encore bougé, et conclut à tort que rien n'a changé.
  //
  // Un `ResizeObserver` ne voit rien non plus : les ports ne changent pas de TAILLE, ils se
  // déplacent — et un observateur de taille ignore les translations.
  //
  // D'où cette surveillance-ci : on regarde le DOM du nœud changer, et l'on ne remesure que si la
  // rangée de ports a vraiment bougé. Le garde sur `offsetTop` est ce qui rend la chose gratuite —
  // une vue qui se redessine à chaque image mute son DOM sans déplacer quoi que ce soit, et ne
  // déclenche donc rien.
  useEffect(() => {
    const el = nodeRef.current;
    if (!el) return;
    let dernierHaut = -1;
    let planifie = 0;
    const verifier = () => {
      planifie = 0;
      const ports = el.querySelector<HTMLElement>(".attic-node-ports");
      if (!ports) return;
      const haut = ports.offsetTop;
      if (haut === dernierHaut) return;
      dernierHaut = haut;
      updateNodeInternals(id);
    };
    const planifier = () => {
      if (planifie) return;
      planifie = requestAnimationFrame(verifier);
    };
    planifier();
    const obs = new MutationObserver(planifier);
    obs.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    return () => {
      obs.disconnect();
      if (planifie) cancelAnimationFrame(planifie);
    };
  }, [id, updateNodeInternals]);

  useEffect(() => {
    const el = nodeRef.current;
    if (!el) return;
    // ResizeObserver sur tous les nodes : recalcule les handles quand la
    // hauteur OU la largeur change (chargement de fichier, apparition de
    // lecteur, redimensionnement via NodeResizer, etc.). Le guard évite les
    // recalculs inutiles. Suivre uniquement la hauteur laissait les ports
    // mal positionnés (arête tirée depuis le milieu du nœud plutôt que le
    // port réel) sur les nœuds redimensionnables tant qu'on ne les avait pas
    // explicitement redimensionnés au moins une fois — un changement de
    // largeur seul ne déclenchait jamais updateNodeInternals.
    //
    // Pour les nœuds SANS NodeResizer (la majorité), `updateNodeInternals`
    // seul ne suffit pas : `ajouterNoeud` (App.tsx) fixe explicitement
    // width/height à la création (tailleDefaut) et ReactFlow ne remesure
    // jamais spontanément un nœud aux dimensions explicites — donc si le
    // contenu grandit après coup (ex. lecteur audio qui apparaît une fois un
    // fichier chargé), le cadre ReactFlow reste figé à l'ancienne taille et
    // les ports restent positionnés dessus, décalés par rapport au contenu
    // réellement affiché (qui déborde visuellement en dessous). Les nœuds
    // AVEC NodeResizer (détectés via son marqueur DOM) gèrent déjà eux-mêmes
    // cette synchronisation width/height — ne pas les court-circuiter, sinon
    // un nœud volontairement réduit par l'utilisateur (contenu qui scrolle/
    // clippe dans un cadre plus petit) se ferait regonfler de force.
    //
    // lastH/lastW démarrent à -1 (jamais une vraie taille) plutôt que d'être
    // pré-lus sur `el` avant `observe()` : un ResizeObserver déclenche TOUJOURS
    // son callback une première fois dès l'observation, avec la taille
    // courante — si on pré-remplit lastH/lastW avec cette même valeur avant
    // que ce premier callback n'arrive, la comparaison h===lastH y voit
    // (à tort) « rien n'a changé » et l'avale silencieusement. Résultat : le
    // décalage initial entre la taille estimée à la création (tailleDefaut,
    // une heuristique sur le nombre de ports) et la taille réellement rendue
    // (en-tête + paramètres + statut) n'était jamais corrigé tant qu'aucun
    // changement ultérieur ne survenait — cas des nœuds simples dont le
    // contenu ne varie jamais après le montage (ex. Hard panner : ports
    // décalés dès la création, sans qu'aucun redimensionnement manuel ne
    // puisse s'appliquer puisque le nœud n'est pas redimensionnable).
    let lastH = -1;
    let lastW = -1;
    const obs = new ResizeObserver(() => {
      const h = el.offsetHeight;
      const w = el.offsetWidth;
      if (h === lastH && w === lastW) return;
      lastH = h;
      lastW = w;
      if (!el.querySelector(".react-flow__resize-control")) {
        setNodes((nds) => nds.map((n) => n.id === id && (n.width !== w || n.height !== h) ? { ...n, width: w, height: h } : n));
      }
      requestAnimationFrame(() => updateNodeInternals(id));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [id, updateNodeInternals, setNodes]);


  const nodeEstFrontiere = estFrontiere(data.ficheId as string);
  const vuesAvant = vuesPourNoeud(data.ficheId, "avant");
  const vuesApres = vuesPourNoeud(data.ficheId, "apres");

  // ── Progression d'exécution ──
  //
  // L'ANNEAU NE LIT QUE CE QUE LE NŒUD DIT DE LUI-MÊME. Le moteur pose d'abord « Étape i/total »,
  // qui est la position du nœud DANS LE LOT et non son avancement : la lecture des fractions la
  // prenait pour une progression, si bien qu'un nœud seul affichait un anneau PLEIN dès la première
  // seconde et le gardait plein pendant tout son calcul. Un nœud qui ne dit rien de son avancement
  // mérite un anneau indéterminé — c'est la vérité disponible.
  const texteProgression = etatExec.progressionDuNoeud ? (etatExec.progression ?? "") : "";
  const matchPourcent = texteProgression.match(/(\d+(?:\.\d+)?)\s*%/);
  const matchEtapes = texteProgression.match(/(\d+)\s*\/\s*(\d+)/);
  const pourcentBarre = matchPourcent
    ? Math.max(0, Math.min(100, parseFloat(matchPourcent[1])))
    : matchEtapes
    ? Math.max(0, Math.min(100, (parseInt(matchEtapes[1], 10) / parseInt(matchEtapes[2], 10)) * 100))
    : null;
  const afficherProgression = etatExec.statut === "en_cours";
  const RING_CIRCUMFERENCE = 2 * Math.PI * 10;

  if (nodeEstCommentaire) {
    const texte = typeof data.nom === "string" ? data.nom : "";
    return (
      <div className={`attic-node comment ${selected ? "selected" : ""}`} ref={nodeRef}>
        <NodeResizer minWidth={140} minHeight={80} maxWidth={800} maxHeight={600} lineClassName="attic-node-comment-resize-line" handleClassName="attic-node-comment-resize-handle" />
        <div className="attic-node-comment-entete">
          <span className="attic-node-comment-titre">Note</span>
          <button className="attic-node-btn-del" onClick={(e) => { e.stopPropagation(); data.onSupprimerNoeud?.(id); }}>×</button>
        </div>
        <textarea
          className="attic-node-comment-texte nodrag"
          value={texte}
          onChange={(e) => setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, nom: e.target.value } } : n))}
          placeholder="Ajouter une note..."
          onPointerDown={(e) => e.stopPropagation()}
          spellCheck={false}
        />
      </div>
    );
  }

  if (estCadre) {
    const titre = typeof data.nom === "string" ? data.nom : "";
    const couleur = typeof data.couleur === "string" ? data.couleur : "rgba(120,120,120,0.12)";
    const COULEURS_CADRE = [
      "rgba(120,120,120,0.12)",
      "rgba(233,185,73,0.12)",
      "rgba(59,192,73,0.12)",
      "rgba(76,110,245,0.12)",
      "rgba(168,85,247,0.12)",
      "rgba(238,68,68,0.12)",
    ];
    return (
      <div className={`attic-node frame ${selected ? "selected" : ""}`} style={{ background: couleur, borderColor: couleur }} ref={nodeRef}>
        <NodeResizer minWidth={160} minHeight={100} isVisible={selected} lineClassName="attic-node-frame-resize-line" handleClassName="attic-node-frame-resize-handle" />
        <div className="attic-node-frame-entete">
          <input
            className="attic-node-frame-titre nodrag"
            value={titre}
            onChange={(e) => setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, nom: e.target.value } } : n))}
            placeholder="Cadre"
            onPointerDown={(e) => e.stopPropagation()}
          />
          <button className="attic-node-btn-del" onClick={(e) => { e.stopPropagation(); data.onSupprimerNoeud?.(id); }}>×</button>
        </div>
        <div className="attic-node-frame-couleurs nodrag" onPointerDown={(e) => e.stopPropagation()}>
          {COULEURS_CADRE.map((c) => (
            <button
              key={c}
              className={`attic-node-frame-couleur ${c === couleur ? "active" : ""}`}
              style={{ background: c, borderColor: c }}
              onClick={(e) => { e.stopPropagation(); setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, couleur: c } } : n)); }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
      <div className={`attic-node ${selected ? "selected" : ""} ${nodeEstMeta ? "meta" : ""} ${nodeEstFrontiere ? "frontiere" : ""} ${categorieClass} ${nodeClassName} ${replie ? "replie" : ""}`} ref={nodeRef}>
      {afficherProgression && (
        <svg className="attic-node-progress-ring" viewBox="0 0 24 24">
          <circle className="attic-node-progress-ring-bg" cx="12" cy="12" r="10" />
          <circle
            className={`attic-node-progress-ring-bar ${pourcentBarre === null ? "indeterminate" : ""}`}
            cx="12" cy="12" r="10"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={pourcentBarre === null ? undefined : RING_CIRCUMFERENCE - (pourcentBarre / 100) * RING_CIRCUMFERENCE}
          />
        </svg>
      )}
      {flash && <div className={`attic-node-flash ${flash}`} />}
      {estVexFlow && (
        <NodeResizer
          minWidth={Math.max(200, paramLargeur?.plage?.[0] ?? 200)}
          maxWidth={Math.min(2000, paramLargeur?.plage?.[1] ?? 2000)}
          minHeight={Math.max(100, paramHauteur?.plage?.[0] ?? 100)}
          maxHeight={Math.min(1000, paramHauteur?.plage?.[1] ?? 1000)}
          isVisible={selected}
          lineClassName="attic-node-vexflow-resize-line"
          handleClassName="attic-node-vexflow-resize-handle"
          onResizeEnd={(_, { width, height }) => {
            const w = Math.round(width);
            const h = Math.round(height);
            data.onChangerParametre?.(id, "Largeur", w);
            data.onChangerParametre?.(id, "Hauteur", h);
            // Persister explicitement les nouvelles dimensions du nœud,
            // sinon ReactFlow le réinitialise à sa taille initiale après le setNodes.
            setNodes((nds) => nds.map((n) => n.id === id ? { ...n, width, height } : n));
          }}
        />
      )}
      {/* En-tête */}
      <div className="attic-node-entete" title={descriptionTooltip}>
        <span className="attic-node-nom">
          {nodeEstMeta && <span className="attic-node-badge-meta" title={t("meta.badgeTitle")}>⤢</span>}
          {nom}
        </span>
        <span className="attic-node-actions">
          <button className="attic-node-btn-prio" onClick={(e) => { e.stopPropagation(); data.onDefinirPrioritaire?.(id); }}
            title={t("btn.executer")} style={{ color: data.prioritaire ? "#2a9d8f" : undefined }}>▶</button>
          <button className="attic-node-btn-reset" onClick={(e) => { e.stopPropagation(); data.onReinitialiser?.(id); }} title={t("btn.reinitialiser")}>↺</button>
          {(def?.notice || def?.resume) && <button className="attic-node-btn-doc" onClick={(e) => { e.stopPropagation(); setDocOpen((v) => !v); }} title={t("btn.doc")}>?</button>}
          <button className="attic-node-btn-collapse" onClick={(e) => { e.stopPropagation(); setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, replie: !replie } } : n)); }} title={replie ? t("btn.deplier") : t("btn.replier")}>{replie ? "+" : "−"}</button>
          <button className="attic-node-btn-del" onClick={(e) => { e.stopPropagation(); data.onSupprimerNoeud?.(id); }}>×</button>
        </span>
      </div>
      {!replie && (
        <>
          {docOpen && (def?.notice || def?.resume) && (
            <div className="attic-node-doc">
              <TexteAvecLiens texte={def.notice
                ? noticeFiche(def, lang)
                : resumeFiche(def, lang)} />
            </div>
          )}

          {/* Vues spécifiques (avant le lecteur) */}
          {vuesAvant.map((Vue, i) => <Vue key={`av-${i}`} id={id} data={data} def={def} />)}

          {/* Lecteur + message (générique) — masqué si une vue custom gère déjà l'audio */}
          {data.audioResultatUrl && vuesAvant.length === 0 && (
            <div className="attic-node-player nodrag" onPointerDown={(e) => e.stopPropagation()}>
              <IndicateurNiveau buffer={data.audioResultatBuffer} />
              <audio key={data.audioResultatUrl} className="attic-node-audio nodrag" controls src={data.audioResultatUrl} onLoadedMetadata={(e) => { (e.currentTarget as HTMLAudioElement).volume = 0.3; console.log("[audio player] loadedmetadata", e.currentTarget.duration, e.currentTarget.src); }} onError={(e) => console.error("[audio player] error", e.currentTarget.error, e.currentTarget.src)} onPlay={(e) => console.log("[audio player] play", e.currentTarget.src)} />
            </div>
          )}
          {/* Un tampon sans aperçu : piste longue, nœud intermédiaire. Le lecteur se construit au clic. */}
          {!data.audioResultatUrl && data.audioResultatBuffer && vuesAvant.length === 0 && (
            <LecteurALaDemande buffer={data.audioResultatBuffer} />
          )}
          {!data.audioResultatUrl && !data.audioResultatBuffer && data.audioUrl && vuesAvant.length === 0 && (
            <div className="attic-node-player nodrag" onPointerDown={(e) => e.stopPropagation()}>
              <audio key={data.audioUrl} className="attic-node-audio nodrag" controls src={data.audioUrl} onLoadedMetadata={(e) => { (e.currentTarget as HTMLAudioElement).volume = 0.3; console.log("[audio player] loadedmetadata", e.currentTarget.duration, e.currentTarget.src); }} onError={(e) => console.error("[audio player] error", e.currentTarget.error, e.currentTarget.src)} onPlay={(e) => console.log("[audio player] play", e.currentTarget.src)} />
            </div>
          )}
          {data.audioResultatMessage && !vueAvantMasqueMessage(data.ficheId) && (
            <div className="attic-node-message">
              <button
                className="attic-node-copy-btn"
                title={t("btn.copier")}
                onClick={(e) => {
                  e.stopPropagation();
                  copierTexte(data.audioResultatMessage || "");
                }}
              >⧉</button>
              {data.audioResultatMessage}
            </div>
          )}

          {/* Vues spécifiques (après le lecteur) */}
          {vuesApres.map((Vue, i) => <Vue key={`ap-${i}`} id={id} data={data} def={def} />)}
        </>
      )}

      {/* ── Ports — zone réservée en bas du nœud ── */}
      <div className="attic-node-ports">
        <div className="attic-node-ports-col">
          {(!def?.entrees.length) && <div className="attic-node-port-vide">—</div>}
          {def?.entrees.slice(0, ports.visibles).map((p, i) => {
            const hid = `in:${i}`;
            const c = couleurFlux(p.type);
            const libelleType = registre.typeFlux(p.type)?.libelle ?? p.type;
            return (
              <div key={hid} className="attic-node-port" onMouseEnter={() => setSurvolPort(hid)} onMouseLeave={() => setSurvolPort(null)}>
                <Handle type="target" position={Position.Left} id={hid}
                  title={libelleType}
                  style={{ background: c, width: 10, height: 10, border: "2px solid var(--bg-node)" }} />
                <span className="attic-node-port-label">{lang === "en" && p.nomEn ? p.nomEn : p.nom}</span>
                {survolPort === hid && (
                  <button className="attic-node-port-del" onClick={(e) => { e.stopPropagation(); supprimerAretesHandle(hid); }}>×</button>
                )}
              </div>
            );
          })}
          {def?.entreesExtensibles && (
            <div className="attic-node-ports-plus nodrag">
              <button disabled={!ports.peutRetirer} title={t("ports.retirer")}
                onClick={(e) => { e.stopPropagation(); reglerPortsVisibles(ports.visibles - 1); }}>−</button>
              <span>{ports.visibles}</span>
              <button disabled={!ports.peutAjouter} title={t("ports.ajouter")}
                onClick={(e) => { e.stopPropagation(); reglerPortsVisibles(ports.visibles + 1); }}>+</button>
            </div>
          )}
        </div>
        <div className="attic-node-ports-col right">
          {(!def?.sorties.length) && <div className="attic-node-port-vide">—</div>}
          {def?.sorties.map((p, i) => {
            const hid = `out:${i}`;
            const c = couleurFlux(p.type);
            const libelleType = registre.typeFlux(p.type)?.libelle ?? p.type;
            return (
              <div key={hid} className="attic-node-port sortie" onMouseEnter={() => setSurvolPort(hid)} onMouseLeave={() => setSurvolPort(null)}>
                <span className="attic-node-port-label">{lang === "en" && p.nomEn ? p.nomEn : p.nom}</span>
                {survolPort === hid && (
                  <button className="attic-node-port-del" onClick={(e) => { e.stopPropagation(); supprimerAretesHandle(hid); }}>×</button>
                )}
                <Handle type="source" position={Position.Right} id={hid}
                  title={libelleType}
                  style={{ background: c, width: 10, height: 10, border: "2px solid var(--bg-node)" }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Statut */}
      <div className="attic-node-statut">
        <span className={`attic-node-statut-puce ${statutClasse}`} />
        <span className="attic-node-statut-label">{statutLabel}</span>
        {typeof data.tempsExecution === "number" && (
          <span className="attic-node-temps" title={t("execution.temps")}>
            {data.tempsExecution < 1000 ? `${Math.round(data.tempsExecution)} ms` : `${(data.tempsExecution / 1000).toFixed(2)} s`}
          </span>
        )}
      </div>
    </div>
  );
}
