import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Handle, Position, NodeResizer, useReactFlow, useUpdateNodeInternals, type NodeProps, type Node } from "@xyflow/react";
import { estMeta, estFrontiere } from "../core";
import { registre } from "../audio/adaptateur";
import type { FicheAudio } from "../audio/types-domaine";

const trouverDef = (id: string) => registre.trouverDef(id);
const couleurFlux = (id: string) => registre.couleurFlux(id);
import { useI18n } from "../i18n";
import { vuesPourNoeud, vueAvantMasqueMessage } from "./vues";
import { copierTexte } from "./copier";
import { TexteAvecLiens } from "./texteAvecLiens";

export type DonneesNoeud = {
  ficheId: string; parametres: Record<string, number | string>; statut: string;
  progression?: string; audioResultatUrl?: string; audioResultatMessage?: string;
  audioFichier?: File; audioNom?: string; audioUrl?: string;
  audioResultatBuffer?: AudioBuffer;
  midiFichier?: File; midiNom?: string; midiFichierSortie?: File;
  modeleFichier?: File; sf2Data?: unknown; sf2InstrumentIdx?: number;
  enregistrementBlob?: Blob; enregistrementUrl?: string;
  imageFichier?: File; imageNom?: string;
  svgFichier?: File; svgNom?: string;
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
  const statutClasse = data.statut === "en_cours" ? "en-cours" : data.statut === "termine" ? "termine" : data.statut === "erreur" ? "erreur" : "attente";
  const statutLabel = data.statut === "termine" ? t("statut.termine") : data.statut === "en_cours" ? (data.progression ?? t("statut.en_cours")) : data.statut === "erreur" ? t("statut.erreur") : t("statut.attente");
  const nodeClassName = data.statut === "en_cours" ? "running" : data.statut === "termine" ? "termine" : data.statut === "erreur" ? "erreur" : "attente";
  const descriptionTooltip = def ? (lang === "en" && def.resumeEn ? def.resumeEn : def.resume) : undefined;

  // ── Stabilité des handles ──
  const { getEdges, deleteElements, setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const nodeRef = useRef<HTMLDivElement>(null);
  const [survolPort, setSurvolPort] = useState<string | null>(null);
  const [flash, setFlash] = useState<"termine" | "erreur" | null>(null);
  const statutPrecedent = useRef(data.statut);
  useEffect(() => {
    const nouveau = data.statut;
    const ancien = statutPrecedent.current;
    if ((nouveau === "termine" || nouveau === "erreur") && nouveau !== ancien) {
      setFlash(nouveau);
    }
    statutPrecedent.current = nouveau;
  }, [data.statut]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(t);
  }, [flash]);

  const supprimerAretesHandle = useCallback((handleId: string) => {
    const aretes = getEdges().filter(
      (e) => (e.source === id && e.sourceHandle === handleId) || (e.target === id && e.targetHandle === handleId)
    );
    if (aretes.length) { deleteElements({ edges: aretes }); queueMicrotask(() => updateNodeInternals(id)); }
  }, [getEdges, deleteElements, updateNodeInternals, id]);

  useEffect(() => {
    const el = nodeRef.current;
    if (!el) return;
    // ResizeObserver sur tous les nodes : recalcule les handles quand la
    // hauteur change (chargement de fichier, apparition de lecteur, etc.).
    // Le guard sur la hauteur évite les recalculs inutiles.
    let lastH = 0;
    const obs = new ResizeObserver(() => {
      const h = el.offsetHeight;
      if (h === lastH) return;
      lastH = h;
      requestAnimationFrame(() => updateNodeInternals(id));
    });
    lastH = el.offsetHeight;
    obs.observe(el);
    return () => obs.disconnect();
  }, [id, updateNodeInternals]);


  const nodeEstFrontiere = estFrontiere(data.ficheId as string);
  const vuesAvant = vuesPourNoeud(data.ficheId, "avant");
  const vuesApres = vuesPourNoeud(data.ficheId, "apres");

  // ── Progression d'exécution ──
  const texteProgression = data.progression ?? "";
  const matchPourcent = texteProgression.match(/(\d+(?:\.\d+)?)\s*%/);
  const matchEtapes = texteProgression.match(/(\d+)\s*\/\s*(\d+)/);
  const pourcentBarre = matchPourcent
    ? Math.max(0, Math.min(100, parseFloat(matchPourcent[1])))
    : matchEtapes
    ? Math.max(0, Math.min(100, (parseInt(matchEtapes[1], 10) / parseInt(matchEtapes[2], 10)) * 100))
    : null;
  const afficherProgression = data.statut === "en_cours";
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
                ? (lang === "en" && def.noticeEn ? def.noticeEn : def.notice)
                : (lang === "en" && def.resumeEn ? def.resumeEn : def.resume)} />
            </div>
          )}

          {/* Vues spécifiques (avant le lecteur) */}
          {vuesAvant.map((Vue, i) => <Vue key={`av-${i}`} id={id} data={data} def={def} />)}

          {/* Lecteur + message (générique) — masqué si une vue custom gère déjà l'audio */}
          {data.audioResultatUrl && vuesAvant.length === 0 && (
            <div className="attic-node-player nodrag" onPointerDown={(e) => e.stopPropagation()}>
              <IndicateurNiveau buffer={data.audioResultatBuffer} />
              <audio className="attic-node-audio nodrag" controls src={data.audioResultatUrl} onLoadedMetadata={(e) => { (e.currentTarget as HTMLAudioElement).volume = 0.3; }} />
            </div>
          )}
          {!data.audioResultatUrl && data.audioUrl && vuesAvant.length === 0 && (
            <div className="attic-node-player nodrag" onPointerDown={(e) => e.stopPropagation()}>
              <audio className="attic-node-audio nodrag" controls src={data.audioUrl} onLoadedMetadata={(e) => { (e.currentTarget as HTMLAudioElement).volume = 0.3; }} />
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
          {def?.entrees.map((p, i) => {
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
