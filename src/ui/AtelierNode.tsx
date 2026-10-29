import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Handle, Position, NodeResizer, useReactFlow, useUpdateNodeInternals, useNodeConnections, type NodeProps, type Node } from "@xyflow/react";
import { estMeta, estFrontiere, estBulle, surChangementMetas } from "../core";

const trouverDef = (id: string) => registreUI().trouverDef(id);
const couleurFlux = (id: string) => registreUI().couleurFlux(id);
import { traduire, useI18n } from "../i18n";
import { champTexte, texteBilingue } from "./texte-bilingue";
import { useTexteEnCours } from "./texte-en-cours";
import { vuesPourNoeud, vueAvantMasqueMessage, vueAvantPorteLecteur } from "./registre-vues";
import { useStatut } from "./statuts";
import { useResultat } from "./resultats";
import { etatPorts } from "./ports-extensibles";
import { ColonnePorts } from "./ColonnePorts";
import { copierTexte } from "./copier";
import { TexteAvecLiens } from "./texteAvecLiens";
import { nomFiche, noticeFiche, resumeFiche } from "./libelles-fiche";
import { stylePort } from "./forme-port";
import { bufferVersWavBlob } from "../audio";
import { tamponPourApercu } from "../audio/multicanal-ecoute";

import { LecteurAudio } from "./lecteur-audio";
import { registreUI, type FicheUI } from "./registre-actif";

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
      <LecteurAudio src={url} />
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
  modeleFichier?: File;
  enregistrementBlob?: Blob; enregistrementUrl?: string;
  imageFichier?: File; imageNom?: string;
  svgFichier?: File; svgNom?: string;
  pdfFichier?: File; pdfNom?: string;
  prioritaire?: boolean;
  tempsExecution?: number;
  /** De combien ce composant a change le niveau de son entree, en decibels. Mesure par le
   *  moteur apres chaque execution ; voir `audio/ecart-niveau.ts`. */
  ecartNiveau?: number;
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
  /** Le texte d'une note ou d'un cadre, et sa version anglaise quand il en a une. */
  nom?: string;
  nomEn?: string;
  [key: string]: unknown;
};

type NoeudAtelier = Node<DonneesNoeud, "atelier">;

// ── Couleurs de port ──
// La couleur d'un port vient désormais du registre de types de flux du domaine
// (core/typesFlux) : type inconnu ⇒ gris neutre. Voir couleurFlux().

/**
 * Les fiches déjà lues, pour ne pas interroger le registre à chaque rendu de chaque nœud.
 *
 * IL FAUT L'OUBLIER QUAND UNE FICHE CHANGE, et rien ne le faisait. Une fiche de composant ne bouge
 * jamais : elle est écrite dans le code. Celle d'un méta-composant, si — elle est refaite à chaque
 * fois qu'on sort de sa vue interne, puisque ses ports se déduisent de son contenu. Le nœud gardait
 * donc la fiche d'avant : on ajoutait une sortie exposée à l'intérieur, on ressortait, et le méta
 * n'avait pas de nouveau port. Relevé par Fabien. Le registre, lui, était juste depuis le début, et
 * c'est pourquoi relancer l'application faisait apparaître le port : le cache repartait vide.
 */
const DEFS_CACHE = new Map<string, FicheUI>();
function getDef(ficheId: string): FicheUI | undefined {
  if (DEFS_CACHE.has(ficheId)) return DEFS_CACHE.get(ficheId);
  const def = trouverDef(ficheId);
  if (def) DEFS_CACHE.set(ficheId, def);
  return def;
}
// ON N'OUBLIE QUE LES MÉTAS, et non tout le cache : les quatre cent trente fiches du catalogue sont
// immuables, et les relire à chaque retour d'une vue interne ne servirait personne.
surChangementMetas(() => {
  for (const id of [...DEFS_CACHE.keys()]) if (estMeta(id)) DEFS_CACHE.delete(id);
});

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

/** Les familles des « Entrées » qui prennent leur matière dehors, plutôt que de la fabriquer. */
const SOURCES = new Set(["Audio", "Image", "Texte", "Text to Speech"]);

export function categorieNoeud(ficheId: string, def?: FicheUI): string {
  if (ficheId === "comment" || ficheId === "frame") return "autre";
  if (estFrontiere(ficheId)) return "autre";
  if (!def) return "autre";
  if (def.univers === "Entrées") {
    // CE QUI FAIT UNE SOURCE, ET NON LE NOM DE SA FAMILLE. La couleur se lisait sur la seule famille
    // « Génération » : le jour où les générateurs se sont rangés en familles — Synthétiseurs, Rythmes,
    // Xenakis — ils ont tous pris la couleur des entrées sans que rien de leur nature ait changé. On
    // nomme donc les quatre familles qui lisent VRAIMENT quelque chose du dehors ; tout le reste des
    // entrées fabrique son matériau, et garde la couleur des générateurs.
    return SOURCES.has(def.famille) ? "entree" : "generation";
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
    // CE PARCOURS EST DÉCIMÉ, et ce n'est pas une économie de confort. Il lisait TOUS les
    // échantillons de TOUS les canaux, soit 441 000 pour cinq secondes de stéréo, et il tourne à
    // chaque fois que le tampon change. Depuis que le résultat d'un nœud est posé pendant le run et
    // non après, ce parcours tombe DANS le run : mesuré sur douze nœuds, 45 ms chacun, soit 550 ms
    // sur un run de 3,6 s. Un pas d'échantillonnage l'ôte sans rien changer de lisible : un
    // indicateur de niveau se lit au dixième de décibel près.
    const PAS = Math.max(1, Math.floor(buffer.length / 8192));
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i += PAS) {
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
    <div className="attic-node-vu" title={traduire("noeud.indicateurNiveau", dbText, (niveau.rms * 100).toFixed(1))}>
      <div className="attic-node-vu-bar-bg">
        <div className="attic-node-vu-bar" style={{ width: `${pct}%`, background: couleur }} />
      </div>
      <span className="attic-node-vu-text">{dbText}</span>
    </div>
  );
}

/**
 * Le texte d'une note, et le titre d'un cadre.
 *
 * LE TEXTE EST TENU EN LOCAL PENDANT LA FRAPPE, et c'est tout l'objet de ces deux composants. Les
 * deux champs écrivaient dans le graphe à chaque touche et relisaient leur valeur depuis lui : une
 * correction au milieu d'un mot envoyait le curseur à la fin dès la première frappe. La règle, sa
 * raison et ses deux moitiés sont dans `ui/texte-en-cours.ts`.
 */
function TexteDeNote({ valeur, invite, onChanger }: { valeur: string; invite: string; onChanger: (v: string) => void }) {
  const { texte, changer, onFocus, onBlur } = useTexteEnCours(valeur, onChanger);
  return (
    <textarea
      className="attic-node-comment-texte nodrag"
      value={texte}
      onChange={(e) => changer(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={invite}
      onPointerDown={(e) => e.stopPropagation()}
      spellCheck={false}
    />
  );
}

function TitreDeCadre({ valeur, invite, onChanger }: { valeur: string; invite: string; onChanger: (v: string) => void }) {
  const { texte, changer, onFocus, onBlur } = useTexteEnCours(valeur, onChanger);
  return (
    <input
      className="attic-node-frame-titre nodrag"
      value={texte}
      onChange={(e) => changer(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={invite}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

// Renderer GÉNÉRIQUE : en-tête, documentation, ports typés et statut sont communs
// à tous les nœuds. Les UI spécifiques à certains nœuds sont fournies par le
// registre de vues (ui/registre-vues.ts) — aucun couplage au domaine ici.
export function AtelierNode({ id, data: donneesDuGraphe, selected }: NodeProps<NoeudAtelier>) {
  // LE RÉSULTAT DU RUN NE VIENT PLUS DU TABLEAU DES NŒUDS, pour la même raison que le statut : le
  // poser là obligeait à remplacer ce tableau, donc à refaire passer React Flow sur les N nœuds, à
  // 7 ms par nœud présent. Relevé sur douze nœuds de trois cents millisecondes, le run passait de
  // 3 678 à 4 434 ms, soit +20,6 %. Ici, seul ce composant-ci est prévenu. Voir `ui/resultats.ts`.
  //
  // ET IL EST FUSIONNÉ DANS `data`, de sorte que le reste de ce composant et les treize vues du
  // domaine ne changent pas d'une ligne : elles continuent de lire `data.audioResultatUrl`. Le
  // graphe passe en premier et le résultat par-dessus, puisque c'est lui qui décrit le dernier run.
  const resultat = useResultat(id);
  const data = useMemo(
    () => (Object.keys(resultat).length === 0 ? donneesDuGraphe : { ...donneesDuGraphe, ...resultat }),
    [donneesDuGraphe, resultat],
  ) as typeof donneesDuGraphe;
  const def = getDef(data.ficheId);
  const { t, lang } = useI18n();
  const nodeEstMeta = estMeta(data.ficheId as string);
  // Une bulle se dessine comme un nœud ordinaire, avec les ports de ses membres, mais dans la couleur
  // du canevas : elle se lit comme un creux, non comme un composant de plus.
  const nodeEstBulle = estBulle(data.ficheId as string);
  const nodeEstCommentaire = data.ficheId === "comment";
  const estCadre = data.ficheId === "frame";
  const estVexFlow = data.ficheId.startsWith("vexflow-");
  const paramLargeur = def?.parametres.find((p) => p.nom === "Largeur" || p.nomEn === "Width");
  const paramHauteur = def?.parametres.find((p) => p.nom === "Hauteur" || p.nomEn === "Height");
  const replie = data.replie === true;
  const categorie = categorieNoeud(data.ficheId, def);
  const categorieClass = categorie !== "autre" ? `attic-node-categorie-${categorie}` : "";
  // LE LECTEUR GENERIQUE NE DISPARAIT QUE SI UNE VUE DIT LE PORTER. Il se retirait devant TOUTE
  // vue « avant », au motif qu'une vue custom gere l'audio : c'etait faux pour la plupart, et huit
  // generateurs rendaient un son que rien ne permettait d'ecouter dans le composant.
  const lecteurPorteParUneVue = vueAvantPorteLecteur(data.ficheId);
  const nom = (nodeEstMeta && typeof data.nom === "string" && data.nom.trim())
    ? data.nom
    : ((lang === "en" && def?.nomEn ? def.nomEn : def?.nom) ?? data.ficheId);
  const [docOpen, setDocOpen] = useState(false);
  // L'ETAT D'EXECUTION NE VIENT PLUS DE `data`. Le poser dans le tableau des nœuds obligeait à
  // remplacer ce tableau à chaque changement, donc à refaire passer React Flow sur les N nœuds —
  // 7 ms par nœud présent, à chaque fois. Ici, seul ce composant-ci est prévenu. Voir `statuts.ts`.
  const etatExec = useStatut(id);
  const statutClasse = etatExec.statut === "en_cours" ? "en-cours" : etatExec.statut === "termine" ? "termine" : etatExec.statut === "erreur" ? "erreur" : "attente";
  // UN NŒUD EN ATTENTE PEUT AVOIR QUELQUE CHOSE À DIRE, et il ne pouvait pas le dire. Un « Début de
  // boucle » est retiré du graphe exécuté au profit des copies qui tournent à sa place : il n'est ni
  // en cours, ni terminé, ni en erreur, et « En attente » ne racontait rien de ce qui lui est
  // arrivé. Le moteur y pose désormais « Dépliée en 32 tours ». La règle vaut pour tous : quand une
  // progression accompagne l'attente, c'est elle qu'on lit.
  const statutLabel = etatExec.statut === "termine" ? t("statut.termine") : etatExec.statut === "en_cours" ? (etatExec.progression ?? t("statut.en_cours")) : etatExec.statut === "erreur" ? t("statut.erreur") : (etatExec.progression ?? t("statut.attente"));
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

  // MÊME REMESURE QUAND C'EST LA FICHE QUI CHANGE DE PORTS, et non le nœud. Un méta-composant que
  // l'on vient d'éditer revient avec une entrée ou une sortie de plus : le nœud se redessine avec
  // la bonne rangée, mais ReactFlow garde les coordonnées de poignées d'avant, et un câble tiré
  // ensuite se collerait au milieu du bord. Le compte de ports suffit à déclencher la relecture.
  const compteDePorts = `${def?.entrees.length ?? 0}/${def?.sorties.length ?? 0}`;
  useEffect(() => { updateNodeInternals(id); }, [compteDePorts, id, updateNodeInternals]);

  // LES SORTIES SUIVENT LA MÊME RÈGLE, et c'est le séparateur de canaux qui l'a demandée : il
  // déclare les seize canaux de la plus grande disposition de ce dépôt, et un stéréo n'en emploie
  // deux. Sans cela le nœud naîtrait haut de quatre cent quarante-huit pixels pour en montrer
  // quatorze vides. La règle du bas vaut des deux côtés : un câble ne disparaît jamais.
  const connexionsSorties = useNodeConnections({ handleType: "source", id });
  const portsSortie = useMemo(() => etatPorts(
    def?.sorties.length ?? 0,
    def?.sortiesExtensibles,
    typeof data.portsVisiblesSortie === "number" ? data.portsVisiblesSortie : undefined,
    connexionsSorties.map((c) => Number(String(c.sourceHandle ?? "out:0").split(":")[1])).filter(Number.isFinite),
  ), [def, data.portsVisiblesSortie, connexionsSorties]);
  useEffect(() => { updateNodeInternals(id); }, [portsSortie.visibles, id, updateNodeInternals]);

  const reglerVisibles = useCallback((champ: string, n: number) => {
    setNodes((nds) => nds.map((x) => (x.id === id ? { ...x, data: { ...x.data, [champ]: n } } : x)));
    // ReactFlow mémorise la position des poignées : sans cela, les câbles restent accrochés là où
    // les ports étaient avant que le nœud ne change de taille.
    queueMicrotask(() => updateNodeInternals(id));
  }, [id, setNodes, updateNodeInternals]);
  const reglerPortsVisibles = useCallback((n: number) => reglerVisibles("portsVisibles", n), [reglerVisibles]);
  const reglerPortsVisiblesSortie = useCallback((n: number) => reglerVisibles("portsVisiblesSortie", n), [reglerVisibles]);


  const supprimerAretesHandle = useCallback((handleId: string) => {
    const aretes = getEdges().filter(
      (e) => (e.source === id && e.sourceHandle === handleId) || (e.target === id && e.targetHandle === handleId)
    );
    if (aretes.length) { deleteElements({ edges: aretes }); queueMicrotask(() => updateNodeInternals(id)); }
  }, [getEdges, deleteElements, updateNodeInternals, id]);

  /** Ce que les deux colonnes de ports partagent : tout sauf le côté, les ports et leur compte. */
  const communPorts = { lang, survolPort, setSurvolPort, supprimerAretesHandle, couleurFlux, stylePort, t };

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
    const champ = champTexte(data, lang);
    const texte = texteBilingue(data, lang);
    return (
      <div className={`attic-node comment ${selected ? "selected" : ""}`} ref={nodeRef}>
        <NodeResizer minWidth={140} minHeight={80} maxWidth={800} maxHeight={600} lineClassName="attic-node-comment-resize-line" handleClassName="attic-node-comment-resize-handle" />
        <div className="attic-node-comment-entete">
          <span className="attic-node-comment-titre">Note</span>
          <button className="attic-node-btn-del" onClick={(e) => { e.stopPropagation(); data.onSupprimerNoeud?.(id); }}>×</button>
        </div>
        <TexteDeNote
          valeur={texte}
          invite={t("note.ajouter")}
          onChanger={(v) => setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, [champ]: v } } : n))}
        />
      </div>
    );
  }

  if (estCadre) {
    const champCadre = champTexte(data, lang);
    const titre = texteBilingue(data, lang);
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
          <TitreDeCadre
            valeur={titre}
            invite={t("cadre.titre")}
            onChanger={(v) => setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, [champCadre]: v } } : n))}
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
      <div className={`attic-node ${selected ? "selected" : ""} ${nodeEstMeta ? "meta" : ""} ${nodeEstBulle ? "bulle" : ""} ${nodeEstFrontiere ? "frontiere" : ""} ${categorieClass} ${nodeClassName} ${replie ? "replie" : ""}`} ref={nodeRef}>
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
          {data.audioResultatUrl && !lecteurPorteParUneVue && (
            <div className="attic-node-player nodrag" onPointerDown={(e) => e.stopPropagation()}>
              <IndicateurNiveau buffer={data.audioResultatBuffer} />
              <LecteurAudio src={data.audioResultatUrl} trace />
            </div>
          )}
          {/* Un tampon sans aperçu : piste longue, nœud intermédiaire. Le lecteur se construit au clic. */}
          {!data.audioResultatUrl && data.audioResultatBuffer && !lecteurPorteParUneVue && (
            <LecteurALaDemande buffer={data.audioResultatBuffer} />
          )}
          {!data.audioResultatUrl && !data.audioResultatBuffer && data.audioUrl && !lecteurPorteParUneVue && (
            <div className="attic-node-player nodrag" onPointerDown={(e) => e.stopPropagation()}>
              <LecteurAudio src={data.audioUrl} trace />
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
        {/* LES DEUX COLONNES SONT LE MÊME COMPOSANT, employé deux fois. Elles étaient écrites en
            entier ici et ne différaient que par le côté, le sens de la poignée et l'ordre du
            libellé : une correction faite sur l'une ne valait que pour elle. Voir `ColonnePorts`. */}
        <ColonnePorts cote="entree" ports={def?.entrees ?? []} etat={ports}
          extensible={!!def?.entreesExtensibles} reglerVisibles={reglerPortsVisibles}
          {...communPorts} />
        <ColonnePorts cote="sortie" ports={def?.sorties ?? []} etat={portsSortie}
          extensible={!!def?.sortiesExtensibles} reglerVisibles={reglerPortsVisiblesSortie}
          {...communPorts} />
      </div>

      {/* Statut */}
      <div className="attic-node-statut">
        <span className={`attic-node-statut-puce ${statutClasse}`} />
        {/* LA CAUSE D'UNE ERREUR EST AU SURVOL, et elle n'était nulle part. Le moteur pose un message
            avec le statut — connexion illégale, entrée obligatoire absente, boucle de câblage —, et
            l'affichage ne gardait que le mot « Erreur » : on voyait le nœud rouge sans jamais savoir
            pourquoi. Le message va dans l'infobulle plutôt que dans le libellé, qui doit rester
            court : une phrase entière dans un nœud de deux cent soixante pixels le déformerait. */}
        <span className="attic-node-statut-label"
          title={etatExec.statut === "erreur" ? etatExec.progression : undefined}>{statutLabel}</span>
        {/* LE LECTEUR QUI SE FABRIQUE, DIT À CÔTÉ DU STATUT ET NON À SA PLACE. Le nœud est terminé,
            son résultat est posé et il s'écoute déjà par le bouton ; ce qui reste à faire est
            l'encodage du lecteur, qui dure quarante-six secondes pour une heure de son. Sans cette
            mention l'attente était muette, et c'est ce silence qui faisait croire à un lecteur
            perdu. */}
        {etatExec.apercu !== undefined && (
          <span className="attic-node-apercu" title={t("execution.lecteurEnCours")}>
            {t("execution.lecteur")} {Math.round(etatExec.apercu * 100)} %
          </span>
        )}
        {typeof data.tempsExecution === "number" && (
          <span className="attic-node-temps" title={t("execution.temps")}>
            {data.tempsExecution < 1000 ? `${Math.round(data.tempsExecution)} ms` : `${(data.tempsExecution / 1000).toFixed(2)} s`}
          </span>
        )}
        {/* L'ECART DE NIVEAU, ET SEULEMENT QUAND IL COMPTE. Sous un decibel, l'ecart n'est pas
            audible et l'afficher sur tous les composants noierait celui qui merite un regard. */}
        {typeof data.ecartNiveau === "number" && Math.abs(data.ecartNiveau) >= 1 && (
          <span
            className={`attic-node-ecart ${data.ecartNiveau <= -3 ? "baisse" : ""}`}
            title={t("execution.ecartNiveau")}
          >
            {data.ecartNiveau > 0 ? "+" : ""}{data.ecartNiveau.toFixed(1)} dB
          </span>
        )}
      </div>
    </div>
  );
}
