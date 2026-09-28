// ui/vues-code.tsx — Les editeurs de code, et la gestion des nodes.
//
// Une part des vues de noeud, decoupees par domaine. Le registre qui les associe a un
// identifiant de fiche vit dans `vues.tsx`, avec le type `VueProps` que toutes recoivent.
// Aucune ligne n'a ete retouchee au passage.

import { useState, useEffect } from "react";
import { NodeResizer } from "@xyflow/react";
import { useI18n } from "../i18n";
import { EditeurCode } from "./EditeurCode";
import { tokenizePython } from "../plugins/python-processor";
import { tokenizeJulia } from "../plugins/julia-processor";
import { COULEURS_PYTHON } from "./vues-analyse";
import type { VueProps } from "./vues";

export function VuePythonProcessor({ id, data }: VueProps) {
  const { t } = useI18n();
  const d = data as { onChangerParametre?: (id: string, nom: string, v: string | number) => void };
  const code = String(data.parametres?.["Code"] ?? "");
  const [pyInfo, setPyInfo] = useState<{ disponible: boolean; chemin: string; version: string } | null>(null);

  // Vérifier Python au montage
  useEffect(() => {
    const api = (window as any).api;
    if (api?.pythonInfo) {
      api.pythonInfo().then((info: any) => setPyInfo(info));
    }
  }, []);

  // Configurer le chemin Python
  const configurerPython = async () => {
    const api = (window as any).api;
    if (!api?.pythonChoisirExecutable) return;
    const chemin = await api.pythonChoisirExecutable();
    if (!chemin) return;
    const result = await api.pythonDefinirChemin(chemin);
    if (result?.ok) {
      setPyInfo({ disponible: true, chemin: result.chemin, version: result.version });
    } else {
      alert(`${t("msg.erreur")}: ${result?.erreur || t("msg.cheminInvalide")}`);
    }
  };

  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px", height: "100%", display: "flex", flexDirection: "column" }}>
      <NodeResizer minWidth={350} minHeight={200} />
      {/* Barre de statut Python + bouton configurer */}
      <div style={{ fontSize: 10, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: pyInfo?.disponible ? "#2a9d8f" : "#e76f51",
        }} />
        <span style={{ color: pyInfo?.disponible ? "#2a9d8f" : "#e76f51" }}>
          {pyInfo?.disponible ? `Python: ${pyInfo.version}` : t("python.nonDetecte")}
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={(e) => { e.stopPropagation(); configurerPython(); }}
          style={{
            fontSize: 10, padding: "2px 8px", cursor: "pointer",
            border: "1px solid var(--border, #333)", borderRadius: 4,
            background: "transparent", color: "var(--text-secondary)",
          }}
          title={t("python.configurerChemin")}
        >⚙ {t("btn.configurer")}</button>
      </div>
      {/* Éditeur partagé, NON-CONTRÔLÉ (voir ui/EditeurCode.tsx) */}
      <EditeurCode codeInitial={code} tokenize={tokenizePython} couleurs={COULEURS_PYTHON}
        onSync={(v) => d.onChangerParametre?.(id, "Code", v)}
        suffixePied={t("python.requis")} titre={t("python.titre")} langage="python" />
    </div>
  );
}

// ── Julia Processor (éditeur de code avec coloration syntaxique) ──
const COULEURS_JULIA: Record<string, string> = {
  keyword: "#569cd6", string: "#ce9178", comment: "#6a9955",
  number: "#b5cea8", ident: "#d4d4d4", type: "#4ec9b0", op: "#d4d4d4",
};

export function VueJuliaProcessor({ id, data }: VueProps) {
  const { t } = useI18n();
  const d = data as { onChangerParametre?: (id: string, nom: string, v: string | number) => void };
  const code = String(data.parametres?.["Code"] ?? "");
  const [jlInfo, setJlInfo] = useState<{ disponible: boolean; chemin: string; version: string } | null>(null);

  useEffect(() => {
    const api = (window as any).api;
    if (api?.juliaInfo) {
      api.juliaInfo().then((info: any) => setJlInfo(info));
    }
  }, []);

  const configurerPath = async () => {
    const api = (window as any).api;
    if (!api?.juliaChoisirExecutable) return;
    const chemin = await api.juliaChoisirExecutable();
    if (!chemin) return;
    const result = await api.juliaDefinirChemin(chemin);
    if (result?.ok) {
      setJlInfo({ disponible: true, chemin: result.chemin, version: result.version });
    } else {
      alert(`${t("msg.erreur")}: ${result?.erreur || t("msg.cheminInvalide")}`);
    }
  };

  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px", height: "100%", display: "flex", flexDirection: "column" }}>
      <NodeResizer minWidth={350} minHeight={200} />
      <div style={{ fontSize: 10, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: jlInfo?.disponible ? "#2a9d8f" : "#e76f51",
        }} />
        <span style={{ color: jlInfo?.disponible ? "#2a9d8f" : "#e76f51" }}>
          {jlInfo?.disponible ? `Julia: ${jlInfo.version}` : t("julia.nonDetecte")}
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={(e) => { e.stopPropagation(); configurerPath(); }}
          style={{
            fontSize: 10, padding: "2px 8px", cursor: "pointer",
            border: "1px solid var(--border, #333)", borderRadius: 4,
            background: "transparent", color: "var(--text-secondary)",
          }}
          title={t("julia.configurerChemin")}
        >⚙ {t("btn.configurer")}</button>
      </div>
      {/* Éditeur partagé, NON-CONTRÔLÉ (voir ui/EditeurCode.tsx) */}
      <EditeurCode codeInitial={code} tokenize={tokenizeJulia} couleurs={COULEURS_JULIA}
        onSync={(v) => d.onChangerParametre?.(id, "Code", v)}
        suffixePied={t("julia.requis")} titre={t("julia.titre")} langage="julia" />
    </div>
  );
}

// ── Gestionnaire de nodes (instructions + statut) ──
export function VueGestionNodes({ data }: VueProps) {
  const p = data.parametres ?? {};
  const action = String(p["Action"] ?? "Exporter");
  const message = data.audioResultatMessage ?? "";
  const api = (window as { api?: any }).api;
  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px", fontSize: 11, lineHeight: 1.6 }}>
      {action === "Exporter" ? (
        <div style={{ color: "var(--text-secondary)" }}>
          <p style={{ marginBottom: 6 }}>1. Lancez une 1ère fois pour peupler la liste</p>
          <p style={{ marginBottom: 6 }}>2. Sélectionnez un node dans la liste</p>
          <p style={{ marginBottom: 6 }}>3. Relancez — une boîte de dialogue s'ouvre pour choisir où sauvegarder le .zip</p>
          {!api?.sauvegarderNodeZip && <p style={{ color: "#e76f51" }}>⚠ Nécessite Electron</p>}
        </div>
      ) : (
        <div style={{ color: "var(--text-secondary)" }}>
          <p style={{ marginBottom: 6 }}>1. Sélectionnez un fichier .zip</p>
          <p style={{ marginBottom: 6 }}>2. Lancez — le node est installé et apparaît dans le catalogue</p>
          {!api?.importerNodeZip && <p style={{ color: "#e76f51" }}>⚠ Nécessite Electron</p>}
        </div>
      )}
      {message && (
        <div style={{
          marginTop: 8, padding: "6px 8px", background: "#0d1117", borderRadius: 4,
          whiteSpace: "pre-wrap", color: "var(--texte, #cbd5e1)", fontSize: 10,
        }}>{message}</div>
      )}
    </div>
  );
}

// ── Couleur → Suno IA (carrés de couleur + script généré) ──
