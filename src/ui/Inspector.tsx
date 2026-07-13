// ui/Inspector.tsx — Panneau de paramètres du nœud sélectionné
import { useState, useRef, useEffect } from "react";
import type { PluginDef } from "../core";
import { useI18n } from "../i18n";

interface Props {
  noeud: { id: string; data: Record<string, unknown> } | null;
  def: PluginDef | undefined;
  onChangerParametre: (nom: string, val: number | string) => void;
  onChargerFichier: (key: string, fichier: File) => void;
  onSupprimer: () => void;
  onReinitialiser: () => void;
  onEnregistrer?: (id: string, blob: Blob) => void;
}

export function Inspector({ noeud, def, onChangerParametre, onChargerFichier, onSupprimer, onReinitialiser, onEnregistrer }: Props) {
  const { t, lang } = useI18n();
  const [docsOuverts, setDocsOuverts] = useState<Set<string>>(new Set());
  const [noticeOuverte, setNoticeOuverte] = useState(true);
  if (!noeud || !def) {
    return <div className="inspecteur"><div className="inspecteur-vide">{t("inspecteur.vide")}</div></div>;
  }
  const params = noeud.data.parametres as Record<string, number | string>;
  const nomP = (p: any) => lang === "en" && p.nomEn ? p.nomEn : p.nom;

  function toggleDoc(nom: string) {
    setDocsOuverts((prev) => {
      const n = new Set(prev);
      n.has(nom) ? n.delete(nom) : n.add(nom);
      return n;
    });
  }

  return (
    <div className="inspecteur">
      <div className="inspecteur-entete">
        <h2>{lang === "en" && def.nomEn ? def.nomEn : def.nom}</h2>
        <p className="inspecteur-resume">{lang === "en" && def.resumeEn ? def.resumeEn : def.resume}</p>
      </div>

      {def.notice && (
        <div className="inspecteur-notice-bloc">
          <button className="inspecteur-notice-toggle" onClick={() => setNoticeOuverte((v) => !v)}>
            <span>ⓘ {noticeOuverte ? t("inspecteur.savoirMoins") : t("inspecteur.savoirPlus")}</span>
            <span className="chevron">{noticeOuverte ? "▴" : "▾"}</span>
          </button>
          {noticeOuverte && (
            <p className="inspecteur-notice">{lang === "en" && def.noticeEn ? def.noticeEn : def.notice}</p>
          )}
        </div>
      )}

      {def.parametres.map((p) => {
        // Cacher conditionnellement certains paramètres selon la valeur d'un autre
        if (def.id === "gestion-nodes" && p.nom === "Node à exporter" && params["Action"] === "Importer") return null;
        const docP = lang === "en" && p.docEn ? p.docEn : p.doc;
        const isOpen = docsOuverts.has(p.nom);
        return (
        <div key={p.nom} className="inspecteur-param">
          <div className="inspecteur-param-ligne">
            <label>{nomP(p)}</label>
            {docP && <button className="inspecteur-doc-btn" onClick={() => toggleDoc(p.nom)}>?</button>}
          </div>
          {isOpen && docP && <p className="inspecteur-param-doc">{docP}</p>}
          {p.type === "choix" && p.options ? (
            <select value={String(params[p.nom] ?? p.defaut)} onChange={(e) => onChangerParametre(p.nom, e.target.value)}>
              {p.options.map((o, i) => {
                const label = lang === "en" && p.optionsEn?.[i] ? p.optionsEn[i] : o;
                return <option key={o} value={o}>{label}</option>;
              })}
            </select>
          ) : p.type === "texte" ? (
            <input type="text" defaultValue={String(params[p.nom] ?? p.defaut)} key={`${noeud.id}-${p.nom}`}
              onChange={(e) => onChangerParametre(p.nom, e.target.value)} />
          ) : p.type === "dossier" ? (
            <div style={{display:"flex", gap:4}}>
              <input type="text" value={String(params[p.nom] ?? p.defaut)} onChange={(e) => onChangerParametre(p.nom, e.target.value)} style={{flex:1}} />
              <button onClick={async () => {
                const api = (window as any).api;
                if (api?.choisirDossier) {
                  const d = await api.choisirDossier();
                  if (d) onChangerParametre(p.nom, d);
                }
              }} title="Parcourir…" style={{ padding: "2px 6px", cursor: "pointer" }}>…</button>
            </div>
          ) : (
            <div className="inspecteur-range">
              {p.unite === "Hz" ? (
                <input type="range"
                  min={Math.log10(Math.max(1, (p.plage ?? [0,100])[0]))}
                  max={Math.log10((p.plage ?? [0,100])[1])}
                  step={p.pas ? p.pas / 1000 : 0.01}
                  value={Math.log10(Math.max(1, Number(params[p.nom] ?? p.defaut)))}
                  onChange={(e) => onChangerParametre(p.nom, Math.round(Math.pow(10, Number(e.target.value))))} />
              ) : (
                <input type="range" min={(p.plage ?? [0,100])[0]} max={(p.plage ?? [0,100])[1]} step={p.pas ?? 1}
                  value={Number(params[p.nom] ?? p.defaut)} onChange={(e) => onChangerParametre(p.nom, Number(e.target.value))} />
              )}
              <span>{params[p.nom] ?? p.defaut}{p.unite ? ` ${p.unite}` : ""}</span>
            </div>
          )}
        </div>
        );
      })}

      {/* Enregistreur / entrée micro : bouton d'enregistrement dans l'inspecteur */}
      {def.id === "enregistreur-audio" || def.id === "entree-micro" ? (
        <EnregistreurInspecteur noeud={noeud} onEnregistrer={onEnregistrer} />
      ) : null}

      <div className="inspecteur-actions">
        <button onClick={onReinitialiser} title="Réinitialiser">↺</button>
        <button className="danger" onClick={onSupprimer} title="Supprimer">×</button>
      </div>
    </div>
  );
}

function EnregistreurInspecteur({ noeud, onEnregistrer }: { noeud: { id: string; data: Record<string, unknown> }; onEnregistrer?: (id: string, blob: Blob) => void }) {
  const { t } = useI18n();
  const [enRegistrant, setEnRegistrant] = useState(false);
  const [duree, setDuree] = useState(0);
  const [peripheriques, setPeripheriques] = useState<MediaDeviceInfo[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const params = noeud.data.parametres as Record<string, string | number> | undefined;

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then((d) => setPeripheriques(d.filter((x) => x.kind === "audioinput")));
  }, []);

  const demarrer = async () => {
    const deviceId = params?.["Périphérique"] as string | undefined;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
    const mr = new MediaRecorder(stream);
    mediaRecorderRef.current = mr;
    const morceaux: Blob[] = [];
    mr.ondataavailable = (e) => { if (e.data.size > 0) morceaux.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(morceaux, { type: "audio/webm" });
      onEnregistrer?.(noeud.id, blob);
      stream.getTracks().forEach((tk) => tk.stop());
      setEnRegistrant(false);
    };
    mr.start();
    setEnRegistrant(true);
    setDuree(0);
    timerRef.current = setInterval(() => setDuree((d) => d + 1), 1000);
  };

  const arreter = () => {
    mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const enregistrementUrl = noeud.data.enregistrementUrl as string | undefined;

  return (
    <div className="inspecteur-param">
      <div className="inspecteur-param-ligne"><label>{t("btn.record")}</label></div>
      {!enRegistrant && <button className="attic-node-btn-record" onClick={demarrer}>● {t("btn.record")}</button>}
      {enRegistrant && (
        <>
          <div className="attic-node-rec-indicator"><span className="attic-node-rec-pulse" /> {duree}s</div>
          <button className="attic-node-btn-stop" onClick={arreter}>■ {t("btn.stop")}</button>
        </>
      )}
      {enregistrementUrl && !enRegistrant && (
        <>
          <audio className="attic-node-audio" controls src={enregistrementUrl} style={{ marginTop: 8 }} />
          <button className="attic-node-btn-record" onClick={demarrer} style={{ marginTop: 4 }}>● {t("btn.rerecord")}</button>
        </>
      )}
      {peripheriques.length > 0 && !enRegistrant && (
        <div style={{ marginTop: 8 }}>
          <div className="inspecteur-param-ligne"><label>{t("btn.device")}</label></div>
          <select className="attic-node-select" value={String(params?.["Périphérique"] ?? "")}
            onChange={(e) => { if (params) params["Périphérique"] = e.target.value; }}>
            {peripheriques.map((p) => <option key={p.deviceId} value={p.deviceId}>{p.label || p.deviceId.slice(0, 8)}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
