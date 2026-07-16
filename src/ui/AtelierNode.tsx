import { useState, useRef, useEffect, useCallback } from "react";
import { Handle, Position, useReactFlow, useUpdateNodeInternals, type NodeProps, type Node } from "@xyflow/react";
import { estMeta, estFrontiere } from "../core";
import { registre } from "../audio/adaptateur";
import type { PluginDef } from "../core";

const trouverDef = (id: string) => registre.trouverDef(id);
const couleurFlux = (id: string) => registre.couleurFlux(id);
import { useI18n } from "../i18n";
import { vuesPourNoeud } from "./vues";
import { copierTexte } from "./copier";

export type DonneesNoeud = {
  ficheId: string; parametres: Record<string, number | string>; statut: string;
  progression?: string; audioResultatUrl?: string; audioResultatMessage?: string;
  audioFichier?: File; audioNom?: string; audioUrl?: string;
  midiFichier?: File; midiNom?: string; midiFichierSortie?: File;
  modeleFichier?: File; sf2Data?: unknown; sf2InstrumentIdx?: number;
  enregistrementBlob?: Blob; enregistrementUrl?: string;
  prioritaire?: boolean;
  onDefinirPrioritaire?: (id: string) => void;
  onReinitialiser?: (id: string) => void;
  onSupprimerNoeud?: (id: string) => void;
  onChargerAudio?: (id: string, fichier: File) => void;
  onChargerMidi?: (id: string, fichier: File) => void;
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

const DEFS_CACHE = new Map<string, PluginDef>();
function getDef(ficheId: string): PluginDef | undefined {
  if (DEFS_CACHE.has(ficheId)) return DEFS_CACHE.get(ficheId);
  const def = trouverDef(ficheId);
  if (def) DEFS_CACHE.set(ficheId, def);
  return def;
}

// Renderer GÉNÉRIQUE : en-tête, documentation, ports typés et statut sont communs
// à tous les nœuds. Les UI spécifiques à certains nœuds sont fournies par le
// registre de vues (ui/vues.tsx) — aucun couplage au domaine ici.
export function AtelierNode({ id, data, selected }: NodeProps<NoeudAtelier>) {
  const def = getDef(data.ficheId);
  const { t, lang } = useI18n();
  const nom = (lang === "en" && def?.nomEn ? def.nomEn : def?.nom) ?? data.ficheId;
  const [docOpen, setDocOpen] = useState(false);
  const statutClasse = data.statut === "en_cours" ? "en-cours" : data.statut === "termine" ? "termine" : data.statut === "erreur" ? "erreur" : "attente";
  const statutLabel = data.statut === "termine" ? t("statut.termine") : data.statut === "en_cours" ? (data.progression ?? t("statut.en_cours")) : data.statut === "erreur" ? t("statut.erreur") : t("statut.attente");

  // ── Stabilité des handles ──
  const { getEdges, deleteElements } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const nodeRef = useRef<HTMLDivElement>(null);
  const [survolPort, setSurvolPort] = useState<string | null>(null);

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

  const nodeEstMeta = estMeta(data.ficheId as string);
  const nodeEstFrontiere = estFrontiere(data.ficheId as string);
  const vuesAvant = vuesPourNoeud(data.ficheId, "avant");
  const vuesApres = vuesPourNoeud(data.ficheId, "apres");

  return (
    <div className={`attic-node ${selected ? "selected" : ""} ${nodeEstMeta ? "meta" : ""} ${nodeEstFrontiere ? "frontiere" : ""}`} ref={nodeRef}>
      {/* En-tête */}
      <div className="attic-node-entete">
        <span className="attic-node-nom">
          {nodeEstMeta && <span className="attic-node-badge-meta" title="Méta-composant — double-cliquez pour ouvrir l'intérieur">⤢</span>}
          {nom}
        </span>
        <span className="attic-node-actions">
          <button className="attic-node-btn-prio" onClick={(e) => { e.stopPropagation(); data.onDefinirPrioritaire?.(id); }}
            title={t("btn.executer")} style={{ color: data.prioritaire ? "#2a9d8f" : undefined }}>▶</button>
          <button className="attic-node-btn-reset" onClick={(e) => { e.stopPropagation(); data.onReinitialiser?.(id); }} title={t("btn.reinitialiser")}>↺</button>
          {(def?.notice || def?.resume) && <button className="attic-node-btn-doc" onClick={(e) => { e.stopPropagation(); setDocOpen((v) => !v); }} title={t("btn.doc")}>?</button>}
          <button className="attic-node-btn-del" onClick={(e) => { e.stopPropagation(); data.onSupprimerNoeud?.(id); }}>×</button>
        </span>
      </div>
      {docOpen && (def?.notice || def?.resume) && (
        <div className="attic-node-doc">
          {def.notice
            ? (lang === "en" && def.noticeEn ? def.noticeEn : def.notice)
            : (lang === "en" && def.resumeEn ? def.resumeEn : def.resume)}
        </div>
      )}

      {/* Vues spécifiques (avant le lecteur) */}
      {vuesAvant.map((Vue, i) => <Vue key={`av-${i}`} id={id} data={data} def={def} />)}

      {/* Lecteur + message (générique) — masqué si une vue custom gère déjà l'audio */}
      {data.audioResultatUrl && vuesAvant.length === 0 && <div className="attic-node-player"><audio className="attic-node-audio" controls src={data.audioResultatUrl} /></div>}
      {!data.audioResultatUrl && data.audioUrl && vuesAvant.length === 0 && <div className="attic-node-player"><audio className="attic-node-audio" controls src={data.audioUrl} /></div>}
      {data.audioResultatMessage && (
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

      {/* ── Ports — zone réservée en bas du nœud ── */}
      <div className="attic-node-ports">
        <div className="attic-node-ports-col">
          {(!def?.entrees.length) && <div className="attic-node-port-vide">—</div>}
          {def?.entrees.map((p, i) => {
            const hid = `in:${i}`;
            const c = couleurFlux(p.type);
            return (
              <div key={hid} className="attic-node-port" onMouseEnter={() => setSurvolPort(hid)} onMouseLeave={() => setSurvolPort(null)}>
                <Handle type="target" position={Position.Left} id={hid}
                  style={{ background: c, width: 10, height: 10, border: "2px solid var(--bg-surface)" }} />
                <span className="attic-node-port-label">{p.nom}</span>
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
            return (
              <div key={hid} className="attic-node-port sortie" onMouseEnter={() => setSurvolPort(hid)} onMouseLeave={() => setSurvolPort(null)}>
                <span className="attic-node-port-label">{p.nom}</span>
                {survolPort === hid && (
                  <button className="attic-node-port-del" onClick={(e) => { e.stopPropagation(); supprimerAretesHandle(hid); }}>×</button>
                )}
                <Handle type="source" position={Position.Right} id={hid}
                  style={{ background: c, width: 10, height: 10, border: "2px solid var(--bg-surface)" }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Statut */}
      <div className="attic-node-statut">
        <span className={`attic-node-statut-puce ${statutClasse}`} />
        {statutLabel}
      </div>
    </div>
  );
}
