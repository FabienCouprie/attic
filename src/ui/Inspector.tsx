// ui/Inspector.tsx — Panneau de paramètres du nœud sélectionné
import { useState, useRef, useEffect } from "react";
import type { FicheAudio } from "../audio/types-domaine";
import { useI18n, defautParametre } from "../i18n";

interface Props {
  noeud: { id: string; data: Record<string, unknown> } | null;
  def: FicheAudio | undefined;
  onChangerParametre: (nom: string, val: number | string) => void;
  onChargerFichier: (key: string, fichier: File) => void;
  onSupprimer: () => void;
  onReinitialiser: () => void;
  onEnregistrer?: (id: string, blob: Blob) => void;
}

// Borne à la plage du paramètre et cale sur son pas. Utilisé par le champ
// numérique (au blur) ET le curseur Hz logarithmique (dont 10^x n'est jamais
// naturellement un multiple du pas).
function calerParametre(p: { plage?: [number, number]; pas?: number }, v: number): number {
  const [mn, mx] = p.plage ?? [0, 100];
  const pas = p.pas ?? 1;
  return Math.min(mx, Math.max(mn, Math.round((v - mn) / pas) * pas + mn));
}

// Champ de saisie numérique directe. La frappe vit dans un état LOCAL : un
// clamp « live » sur un champ contrôlé rendait impossible la saisie chiffre à
// chiffre de toute valeur dont le préfixe est sous le minimum (taper « 1200 »
// dans une plage [30,1800] snapait à 30 dès le « 1 »). On ne propage en cours
// de frappe que les valeurs déjà dans la plage ; le blur borne, cale et vide
// l'état local.
function ChampNombre({ p, valeur, onChanger }: {
  p: { plage?: [number, number]; pas?: number };
  valeur: number;
  onChanger: (v: number) => void;
}) {
  const [saisie, setSaisie] = useState<string | null>(null);
  const [mn, mx] = p.plage ?? [0, 100];
  const ref = useRef<HTMLInputElement>(null);
  return (
    <input ref={ref} type="number" className="inspecteur-num" style={{ width: 62 }}
      min={mn} max={mx} step={p.pas ?? 1}
      value={saisie ?? String(valeur)}
      onChange={(e) => {
        setSaisie(e.target.value);
        const v = Number(e.target.value);
        if (e.target.value !== "" && !Number.isNaN(v) && v >= mn && v <= mx) onChanger(v);
      }}
      onBlur={(e) => {
        const v = Number(e.target.value);
        setSaisie(null);
        if (e.target.value === "" || Number.isNaN(v)) return;
        onChanger(calerParametre(p, v));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          ref.current?.blur();
        }
      }} />
  );
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
        const defautP = defautParametre(p, lang);
        const isOpen = docsOuverts.has(p.nom);
        return (
        <div key={p.nom} className="inspecteur-param">
          <div className="inspecteur-param-ligne">
            <label>{nomP(p)}</label>
            {docP && <button className="inspecteur-doc-btn" onClick={() => toggleDoc(p.nom)}>?</button>}
          </div>
          {isOpen && docP && <p className="inspecteur-param-doc">{docP}</p>}
          {p.type === "choix" && p.options ? (
            (() => {
              const raw = String(params[p.nom] ?? defautP);
              const valeur = p.options.includes(raw)
                ? raw
                : (p.optionsEn?.indexOf(raw) ?? -1) >= 0
                ? p.options[p.optionsEn!.indexOf(raw)]
                : p.options[0] ?? raw;
              return (
                <select value={valeur} onChange={(e) => onChangerParametre(p.nom, e.target.value)}>
                  {p.options.map((o, i) => {
                    const label = lang === "en" && p.optionsEn?.[i] ? p.optionsEn[i] : o;
                    return <option key={o} value={o}>{label}</option>;
                  })}
                </select>
              );
            })()
          ) : p.type === "texte" ? (
            <textarea
              value={String(params[p.nom] ?? defautP)}
              rows={2}
              onChange={(e) => onChangerParametre(p.nom, e.target.value)}
            />
          ) : p.type === "dossier" ? (
            <div style={{display:"flex", gap:4}}>
              <input type="text" value={String(params[p.nom] ?? defautP)} onChange={(e) => onChangerParametre(p.nom, e.target.value)} style={{flex:1}} />
              <button onClick={async () => {
                const api = (window as any).api;
                if (api?.choisirDossier) {
                  const d = await api.choisirDossier();
                  if (d) onChangerParametre(p.nom, d);
                }
              }} title={t("btn.parcourir")} style={{ padding: "2px 6px", cursor: "pointer" }}>…</button>
            </div>
          ) : (
            <div className="inspecteur-range">
              {p.unite === "Hz" ? (
                <input type="range"
                  min={Math.log10(Math.max(1, (p.plage ?? [0,100])[0]))}
                  max={Math.log10((p.plage ?? [0,100])[1])}
                  step={p.pas ? p.pas / 1000 : 0.01}
                  value={Math.log10(Math.max(1, Number(params[p.nom] ?? defautP)))}
                  onChange={(e) => onChangerParametre(p.nom, calerParametre(p, Math.pow(10, Number(e.target.value))))} />
              ) : (
                <input type="range" min={(p.plage ?? [0,100])[0]} max={(p.plage ?? [0,100])[1]} step={p.pas ?? 1}
                  value={Number(params[p.nom] ?? defautP)} onChange={(e) => onChangerParametre(p.nom, Number(e.target.value))} />
              )}
              {/* Saisie numérique directe : permet une valeur exacte (ex. 0, 3.0 s)
                  que le curseur seul rend difficile à atteindre sur une large plage. */}
              <ChampNombre p={p} valeur={Number(params[p.nom] ?? defautP)}
                onChanger={(v) => onChangerParametre(p.nom, v)} />
              {p.unite ? <span className="inspecteur-unite">{p.unite}</span> : null}
            </div>
          )}
        </div>
        );
      })}

      {/* Enregistreur / entrée micro : bouton d'enregistrement dans l'inspecteur */}
      {def.id === "enregistreur-audio" ? (
        <EnregistreurInspecteur noeud={noeud} onEnregistrer={onEnregistrer} onChangerParametre={onChangerParametre} />
      ) : null}

      {def.id === "capture-systeme-audio" ? (
        <CaptureSystemeInspecteur noeud={noeud} onEnregistrer={onEnregistrer} />
      ) : null}

      {/* Sampler MIDI : chargement de l'échantillon audio */}
      {def.id === "sampler-midi" ? (
        <div className="inspecteur-param">
          <div className="inspecteur-param-ligne"><label>{t("inspecteur.echantillon")}</label></div>
          <label className="attic-node-fichier-btn" style={{ cursor: "pointer", display: "inline-flex" }}>
            {noeud.data.audioNom ? `🎵 ${String(noeud.data.audioNom)}` : t("btn.chargerEchantillon")}
            <input type="file" accept=".wav,.mp3,.ogg,.flac,.m4a" hidden onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onChargerFichier("audioFichier", f);
              e.target.value = "";
            }} />
          </label>
        </div>
      ) : null}

      <div className="inspecteur-actions">
        <button onClick={onReinitialiser} title={t("btn.reinitialiser")}>↺</button>
        <button className="danger" onClick={onSupprimer} title={t("btn.supprimer")}>×</button>
      </div>
    </div>
  );
}

function EnregistreurInspecteur({ noeud, onEnregistrer, onChangerParametre }: { noeud: { id: string; data: Record<string, unknown> }; onEnregistrer?: (id: string, blob: Blob) => void; onChangerParametre?: (nom: string, val: number | string) => void }) {
  const { t } = useI18n();
  const [enRegistrant, setEnRegistrant] = useState(false);
  const [duree, setDuree] = useState(0);
  const [peripheriques, setPeripheriques] = useState<MediaDeviceInfo[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const params = noeud.data.parametres as Record<string, string | number> | undefined;

  useEffect(() => {
    // Demander la permission d'abord, puis lister les périphériques
    // (les labels ne sont disponibles qu'après autorisation)
    navigator.mediaDevices?.getUserMedia({ audio: true }).then((stream) => {
      stream.getTracks().forEach((t) => t.stop());
      return navigator.mediaDevices?.enumerateDevices();
    }).then((d) => {
      if (d) setPeripheriques(d.filter((x) => x.kind === "audioinput"));
    }).catch(() => {
      // Permission refusée : lister quand même (labels vides)
      navigator.mediaDevices?.enumerateDevices().then((d) => {
        if (d) setPeripheriques(d.filter((x) => x.kind === "audioinput"));
      });
    });
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
            onChange={(e) => onChangerParametre?.("Périphérique", e.target.value)}>
            {peripheriques.map((p) => <option key={p.deviceId} value={p.deviceId}>{p.label || p.deviceId.slice(0, 8)}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

function CaptureSystemeInspecteur({ noeud, onEnregistrer }: { noeud: { id: string; data: Record<string, unknown> }; onEnregistrer?: (id: string, blob: Blob) => void }) {
  const { t } = useI18n();
  const [enRegistrant, setEnRegistrant] = useState(false);
  const [duree, setDuree] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const demarrer = async () => {
    try {
      const api = (window as any).api;
      // En Electron : utiliser desktopCapturer via IPC
      if (api?.captureSources) {
        const sources = await api.captureSources();
        if (!sources || sources.length === 0) {
          alert(t("msg.captureAucuneSource"));
          return;
        }
        // Utiliser getDisplayMedia avec l'ID de la première source (écran)
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: "desktop",
            },
          } as any,
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: sources[0].id,
              minWidth: 1, maxWidth: 1, minHeight: 1, maxHeight: 1,
            },
          } as any,
        });
        stream.getVideoTracks().forEach((t) => t.stop());
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          alert(t("msg.captureAucunFlux"));
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const audioStream = new MediaStream(audioTracks);
        const mr = new MediaRecorder(audioStream);
        mediaRecorderRef.current = mr;
        const morceaux: Blob[] = [];
        mr.ondataavailable = (e) => { if (e.data.size > 0) morceaux.push(e.data); };
        mr.onstop = () => {
          const blob = new Blob(morceaux, { type: "audio/webm" });
          onEnregistrer?.(noeud.id, blob);
          audioStream.getTracks().forEach((t) => t.stop());
          setEnRegistrant(false);
        };
        mr.start();
        setEnRegistrant(true);
        setDuree(0);
        timerRef.current = setInterval(() => setDuree((d) => d + 1), 1000);
        return;
      }
      // Mode navigateur : getDisplayMedia standard
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,
      });
      stream.getVideoTracks().forEach((t) => t.stop());
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
          alert(t("msg.captureSelectionnerAudio"));
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const audioStream = new MediaStream(audioTracks);
      const mr = new MediaRecorder(audioStream);
      mediaRecorderRef.current = mr;
      const morceaux: Blob[] = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) morceaux.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(morceaux, { type: "audio/webm" });
        onEnregistrer?.(noeud.id, blob);
        audioStream.getTracks().forEach((t) => t.stop());
        setEnRegistrant(false);
      };
      mr.start();
      setEnRegistrant(true);
      setDuree(0);
      timerRef.current = setInterval(() => setDuree((d) => d + 1), 1000);
    } catch {
      alert(t("msg.captureAnnulee"));
    }
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
    </div>
  );
}
