// ui/vues.tsx — Vues de nœud spécifiques + registre (extension UI).
// Découple le renderer générique (AtelierNode) des UI propres à certains nœuds.
// Une vue reçoit { id, data, def } et se rend sous l'en-tête du nœud. Le registre
// associe un id (ou un prédicat) à une ou plusieurs vues, avec une position
// « avant » ou « après » le lecteur audio générique.
//
// Point d'extension multi-domaines (cf. ARCHITECTURE.md §11) : un autre domaine
// enregistre ici ses propres vues (aperçu image, grille de données, éditeur…)
// sans toucher au renderer.
import { useState, useRef, useEffect, useMemo } from "react";
import type { ReactNode, CSSProperties } from "react";
import { useReactFlow, NodeResizer } from "@xyflow/react";
import { useI18n } from "../i18n";
import { FormeOnde } from "./FormeOnde";
import { SpectreFFT } from "./Spectre";
import { Spectrogramme } from "./Spectrogramme";
import { OscilloVue } from "./OscilloVue";
import { ReponseFiltre } from "./ReponseFiltre";
import { SequenceurBatterie } from "./SequenceurBatterie";
import { SequenceurMelodique } from "./SequenceurMelodique";
import { EnveloppeADSR } from "./EnveloppeADSR";
import { VuMetre } from "./VuMetre";
import { ColorSynth } from "./ColorSynth";
import { PochetteGen } from "./PochetteGen";
import { construireListeInstruments } from "../plugins/instruments";
import { construireListeStyles } from "../plugins/styles-musicaux";
import { construireListeEmotions } from "../plugins/emotions";
import { construireListeTessitures } from "../plugins/tessitures";
import { tokenizePython } from "../plugins/python-processor";
import { COULEURS } from "../audio";
import type { PluginDef } from "../core";
import type { DonneesNoeud } from "./AtelierNode";

export interface VueProps {
  id: string;
  data: DonneesNoeud;
  def?: PluginDef;
}

// ── Enregistreur micro ──
function VueEnregistreur({ id, data }: VueProps) {
  const { t } = useI18n();
  const [enRegistrant, setEnRegistrant] = useState(false);
  const [dureeEnreg, setDureeEnreg] = useState(0);
  const [peripheriques, setPeripheriques] = useState<MediaDeviceInfo[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { navigator.mediaDevices?.enumerateDevices().then((d) => setPeripheriques(d.filter((x) => x.kind === "audioinput"))); }, []);
  const demarrer = async () => {
    const deviceId = data.parametres?.["Périphérique"] as string | undefined;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
    const mr = new MediaRecorder(stream);
    mediaRecorderRef.current = mr;
    const morceaux: Blob[] = [];
    mr.ondataavailable = (e) => { if (e.data.size > 0) morceaux.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(morceaux, { type: "audio/webm" });
      data.enregistrementBlob = blob;
      data.enregistrementUrl = URL.createObjectURL(blob);
      (data as { onChangerEnregistrement?: (id: string, b: Blob) => void }).onChangerEnregistrement?.(id, blob);
      stream.getTracks().forEach((tk) => tk.stop());
      setEnRegistrant(false);
    };
    mr.start();
    setEnRegistrant(true);
    setDureeEnreg(0);
    timerRef.current = setInterval(() => setDureeEnreg((d) => d + 1), 1000);
  };
  const arreter = () => { mediaRecorderRef.current?.stop(); if (timerRef.current) clearInterval(timerRef.current); };
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {!enRegistrant && <button className="attic-node-btn-record" onClick={demarrer}>● {t("btn.record")}</button>}
      {enRegistrant && <><div className="attic-node-rec-indicator"><span className="attic-node-rec-pulse" /> {dureeEnreg}s</div><button className="attic-node-btn-stop" onClick={arreter}>■ {t("btn.stop")}</button></>}
      {data.enregistrementUrl && !enRegistrant && <><audio className="attic-node-audio" controls src={data.enregistrementUrl} /><button className="attic-node-btn-record" onClick={demarrer}>● {t("btn.rerecord")}</button></>}
      {!enRegistrant && peripheriques.length > 1 && (
        <select className="attic-node-select" value={String(data.parametres?.["Périphérique"] ?? "")}
          onChange={(e) => { data.parametres!["Périphérique"] = e.target.value; }}>
          {peripheriques.map((p) => <option key={p.deviceId} value={p.deviceId}>{p.label || p.deviceId.slice(0, 8)}</option>)}
        </select>
      )}
    </div>
  );
}

// ── Forme d'onde / sélecteur multi-zones ──
function VueFormeOnde({ id, data }: VueProps) {
  return (
    <FormeOnde
      audioUrl={data.audioResultatUrl}
      multi={data.ficheId === "selecteur-multi-zones"}
      zones={data.zonesSelectionnees ?? []}
      onZonesChange={(z) => data.onChangerZones?.(id, z)}
    />
  );
}

// ── Chargement d'un fichier audio ──
function VueUploadAudio({ id, data }: VueProps) {
  const { t } = useI18n();
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <label className="attic-node-fichier-btn">
        {data.audioNom ? t("btn.changer.audio") : t("btn.charger.audio")}
        <input type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) data.onChargerAudio?.(id, f); }} />
      </label>
      {data.audioNom && <div className="attic-node-fichier-nom">{data.audioNom}</div>}
    </div>
  );
}

// ── Explorateur de musique (Electron) ──
function VueExplorateur({ id, data }: VueProps) {
  const [fichiersMusique, setFichiersMusique] = useState<{ nom: string; chemin: string }[] | null>(null);
  const [chargementMusique, setChargementMusique] = useState(false);
  const [audioLocale, setAudioLocale] = useState<string | null>(null);
  const api = (window as { api?: any }).api;
  return (
    <div className="attic-node-fichier nodrag" onClick={(e) => e.stopPropagation()}>
      {!api ? (
        <div className="attic-node-fichier-nom" style={{ opacity: 0.5 }}>Electron uniquement.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="attic-node-fichier-btn" style={{ flex: 1 }} disabled={chargementMusique} onClick={async () => {
              setChargementMusique(true);
              const rel = (data.parametres?.["Chemin"] as string) || "music collection";
              const fichiers = (await api?.lireDossier(rel.replace(/^[/\\]+|[/\\]+$/g, ""))) ?? null;
              setFichiersMusique(fichiers);
              setChargementMusique(false);
            }}>
              ⟳ /{String(data.parametres?.["Chemin"] || "music collection")}
            </button>
            <button className="attic-node-fichier-btn" title="Choisir un dossier" onClick={async () => {
              const dossier = await api?.choisirDossier();
              if (dossier) { data.parametres!["Chemin"] = dossier; data.onChangerParametre?.(id, "Chemin", dossier); }
            }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4a1 1 0 011-1h3l2 2h5a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" /></svg>
            </button>
          </div>
          {fichiersMusique && fichiersMusique.length > 0 && (
            <select className="attic-node-select" size={Math.min(fichiersMusique.length, 6)}
              onChange={async (e) => {
                const f = fichiersMusique[parseInt(e.target.value)];
                if (!f) return;
                const resultat = await api?.lireFichierAudio(f.chemin);
                if (!resultat) return;
                const blob = new Blob([resultat.donnees], { type: "audio/mpeg" });
                const fichier = new File([blob], resultat.nom, { type: "audio/mpeg" });
                setAudioLocale(URL.createObjectURL(fichier));
                data.onChargerAudio?.(id, fichier);
              }}>
              {fichiersMusique.map((f, i) => <option key={f.chemin} value={i}>{f.nom}</option>)}
            </select>
          )}
          {fichiersMusique && fichiersMusique.length === 0 && (
            <div className="attic-node-fichier-nom" style={{ opacity: 0.5 }}>Aucun fichier audio.</div>
          )}
          {audioLocale && !data.audioUrl && <audio className="attic-node-audio" controls src={audioLocale} />}
          {data.audioResultatUrl && <audio className="attic-node-audio" controls src={data.audioResultatUrl} />}
        </>
      )}
    </div>
  );
}

// ── Chargement d'un fichier MIDI ──
function VueUploadMidi({ id, data }: VueProps) {
  const { t } = useI18n();
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <label className="attic-node-fichier-btn">
        {data.midiNom ? t("btn.changer.midi") : t("btn.charger.midi")}
        <input type="file" accept=".mid,.midi" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) data.onChargerMidi?.(id, f); }} />
      </label>
      {data.midiNom && <div className="attic-node-fichier-nom">{data.midiNom}</div>}
    </div>
  );
}

// ── Sélecteur d'instrument SoundFont ──
function VueSoundFont({ data }: VueProps) {
  if (!data.sf2Data) return null;
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()}>
      <select className="attic-node-select" value={data.sf2InstrumentIdx ?? 0}
        onChange={(e) => { data.sf2InstrumentIdx = parseInt(e.target.value); }}>
        {(data.sf2Data as { instruments?: { nom: string }[] }).instruments?.map((inst, i) => (
          <option key={i} value={i}>{i} — {inst.nom}</option>
        ))}
      </select>
    </div>
  );
}

// ── Téléchargement du MIDI transcrit ──
function VueTranscription({ data }: VueProps) {
  const { t } = useI18n();
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {data.midiFichierSortie ? (
        <a href="#" className="attic-node-fichier-btn" onClick={(e) => {
          e.preventDefault();
          const u = URL.createObjectURL(data.midiFichierSortie! as File);
          const a = document.createElement("a"); a.href = u; a.download = "transcription.mid"; a.click(); URL.revokeObjectURL(u);
        }}>⬇ MIDI ({(data.midiFichierSortie as unknown as File).size.toLocaleString()} o)</a>
      ) : (
        <div className="attic-node-fichier-nom" style={{ opacity: .5 }}>{t("msg.connecter.audio")}</div>
      )}
    </div>
  );
}

// ── Chargement d'un modèle ONNX ──
function VueUploadOnnx({ data }: VueProps) {
  const { t } = useI18n();
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <label className="attic-node-fichier-btn">
        {data.modeleFichier?.name || t("btn.charger.onnx")}
        <input type="file" accept=".onnx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) data.modeleFichier = f; }} />
      </label>
    </div>
  );
}

// ── Chargement d'une réponse impulsionnelle (IR) ──
function VueUploadIR({ id, data }: VueProps) {
  const { t } = useI18n();
  const d = data as { irFichier?: File; irNom?: string; onChargerIR?: (id: string, f: File) => void };
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <label className="attic-node-fichier-btn">
        {d.irNom ? t("btn.changer.audio") : t("btn.charger.ir")}
        <input type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { d.irFichier = f; d.irNom = f.name; d.onChargerIR?.(id, f); } }} />
      </label>
      {d.irNom && <div className="attic-node-fichier-nom">{d.irNom}</div>}
    </div>
  );
}

// ── Paramètres inline des collections (sélecteurs de dossier) ──
function VueCollections({ id, data, def }: VueProps) {
  const { lang } = useI18n();
  if (!def || def.parametres.length === 0) return null;
  return (
    <div className="attic-node-params" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {def.parametres.map((p) => (
        <div key={p.nom} className="attic-node-param">
          <label>{lang === "en" && p.nomEn ? p.nomEn : p.nom}</label>
          {p.type === "dossier" ? (
            <div style={{ display: "flex", gap: 4 }}>
              <input type="text" value={String(data.parametres?.[p.nom] ?? p.defaut)} onChange={(e) => data.onChangerParametre?.(id, p.nom, e.target.value)}
                style={{ flex: 1, fontSize: 11, background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 3, padding: "2px 4px", color: "var(--text-title)" }} />
              <button onClick={async () => {
                const api = (window as { api?: any }).api;
                if (api?.choisirDossier) {
                  const d = await api.choisirDossier();
                  if (d) data.onChangerParametre?.(id, p.nom, d);
                } else {
                  const inp = document.createElement("input");
                  inp.type = "file"; (inp as { webkitdirectory?: boolean }).webkitdirectory = true;
                  inp.onchange = () => { const f = inp.files?.[0]; if (f) data.onChangerParametre?.(id, p.nom, (f as { path?: string }).path ?? f.name); };
                  inp.click();
                }
              }} className="attic-node-fichier-btn" title="Parcourir…">…</button>
            </div>
          ) : (
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{data.parametres?.[p.nom] ?? p.defaut}{p.unite ? ` ${p.unite}` : ""}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Export / téléchargement (sorties, convertisseurs) ──
function VueExport({ data }: VueProps) {
  const { t } = useI18n();
  const [nomFichierLocal, setNomFichierLocal] = useState(String(data.nomFichier ?? ""));
  const api = (window as { api?: any }).api;
  const mp3Url = (data as { mp3Url?: string }).mp3Url;
  const nomOu = (defaut: string) => (data.nomFichier as string)?.toString().trim() || defaut;
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <input className="attic-node-export-nom" type="text" placeholder={t("export.nomFichier")}
        value={nomFichierLocal}
        onChange={(e) => { setNomFichierLocal(e.target.value); (data as { nomFichier?: string }).nomFichier = e.target.value; }} />
      {data.audioResultatUrl ? (
        <>
          {data.ficheId === "convertisseur-audio" && mp3Url ? (
            <a className="attic-node-fichier-btn" href={mp3Url} download={nomOu("sortie.mp3")}>⬇ MP3</a>
          ) : (
            <a className="attic-node-fichier-btn" href={data.audioResultatUrl}
              download={nomOu((data.audioResultatNom as string) || "sortie.wav")}>
              ⬇ {data.ficheId === "convertisseur-mp3-wav" ? "WAV" : t("export.telecharger").replace("⬇ ", "") + " (.wav)"}
            </a>
          )}
          {data.midiFichierSortie && (
            <a className="attic-node-fichier-btn" href="#" onClick={(e) => {
              e.preventDefault();
              const u = URL.createObjectURL(data.midiFichierSortie! as File);
              const a = document.createElement("a"); a.href = u; a.download = nomOu("sortie") + ".mid"; a.click(); URL.revokeObjectURL(u);
            }}>⬇ MIDI ({(data.midiFichierSortie as unknown as File).size.toLocaleString()} o)</a>
          )}
          {api && (
            <button className="attic-node-fichier-btn" onClick={async () => {
              const rep = await fetch(data.ficheId === "convertisseur-audio" && mp3Url ? mp3Url : data.audioResultatUrl!);
              const buf = await rep.arrayBuffer();
              const ext = data.ficheId === "convertisseur-audio" ? "mp3" : "wav";
              await api.sauvegarderBinaire({
                defaultPath: nomOu(`sortie.${ext}`),
                filters: [{ name: "Audio", extensions: [ext] }],
                buffer: buf,
              });
            }}>💾 {t("export.sauvegarder").replace("💾 ", "")}</button>
          )}
        </>
      ) : (
        <div className="attic-node-fichier-nom" style={{ opacity: 0.5 }}>{t("export.avantLancer")}</div>
      )}
    </div>
  );
}

// ── Clavier mélodie (instrument jouable + enregistrement de séquence) ──
function ClavierMelodie({ id, data }: VueProps) {
  const OCTAVE_DEPART = 3, NB_OCTAVES = 5, BLANCHES_PAR_OCT = 7;
  const totalBlanches = NB_OCTAVES * BLANCHES_PAR_OCT;
  const contRef = useRef<HTMLDivElement>(null), touchesRef = useRef<HTMLDivElement>(null);
  const [larg, setLarg] = useState(0);
  useEffect(() => {
    const el = contRef.current; if (!el) return;
    const ro = new ResizeObserver(([entry]) => setLarg(entry.contentRect.width));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const NOTES = useMemo(() => {
    const arr: { note: number; noir: boolean }[] = [];
    for (let o = OCTAVE_DEPART; o < OCTAVE_DEPART + NB_OCTAVES; o++) {
      for (const [n, noir] of [[0, false], [1, true], [2, false], [3, true], [4, false], [5, false], [6, true], [7, false], [8, true], [9, false], [10, true], [11, false]] as const)
        arr.push({ note: o * 12 + n, noir });
    }
    return arr;
  }, []);
  const blanches = useMemo(() => NOTES.filter((k) => !k.noir), [NOTES]);
  const noires = useMemo(() => NOTES.filter((k) => k.noir).map((k) => ({
    ...k, idxBlanche: blanches.findIndex((b) => b.note === k.note - 1),
  })).filter((k) => k.idxBlanche >= 0), [NOTES, blanches]);
  const NB = Math.max(22, larg > 0 ? larg / totalBlanches : 22), totalWidth = NB * totalBlanches;
  const ctxRef = useRef<AudioContext | null>(null), activesRef = useRef<Map<number, OscillatorNode>>(new Map());
  const debutRef = useRef(0), enRegRef = useRef(false), dernierePresseRef = useRef(0);
  const seqRef = useRef<{ note: number; velocite: number; debut: number; fin: number }[]>([]);
  const [enReg, setEnReg] = useState(false), [touches, setTouches] = useState<Set<number>>(new Set());
  const [, setVersion] = useState(0), { setNodes } = useReactFlow();
  const seq = seqRef.current;
  const pointerEnfonce = useRef(false);
  function getCtx() { if (!ctxRef.current) ctxRef.current = new AudioContext(); return ctxRef.current; }
  function nomNote(n: number) { return ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][n % 12] + Math.floor(n / 12 - 1); }
  function calculerVelocite(): number { const now = performance.now(), delta = now - dernierePresseRef.current; dernierePresseRef.current = now; if (delta < 80) return 120; if (delta < 150) return 100; if (delta < 300) return 80; return 60; }
  function jouer(note: number) { const ctx = getCtx(), osc = ctx.createOscillator(), gain = ctx.createGain(); osc.type = "triangle"; osc.frequency.value = 440 * 2 ** ((note - 69) / 12); gain.gain.setValueAtTime(0.12, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3); osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.5); activesRef.current.set(note, osc); }
  function arreter(note: number) { const o = activesRef.current.get(note); if (o) { try { o.stop(); } catch {} activesRef.current.delete(note); } }
  function presser(note: number) { setTouches((p) => new Set(p).add(note)); jouer(note); if (enRegRef.current) { seqRef.current.push({ note, velocite: calculerVelocite(), debut: (performance.now() - debutRef.current) / 1000, fin: 0 }); setVersion((v) => v + 1); } }
  function relacher(note: number) { setTouches((p) => { const n = new Set(p); n.delete(note); return n; }); arreter(note); if (enRegRef.current) { for (const s of seqRef.current) if (s.note === note && s.fin === 0) { s.fin = (performance.now() - debutRef.current) / 1000; break; } setVersion((v) => v + 1); } }
  function trouverNoteDepuisPointer(e: React.PointerEvent): number | null { const el = touchesRef.current; if (!el) return null; const rect = el.getBoundingClientRect(), x = e.clientX - rect.left + el.scrollLeft, idx = Math.floor(x / NB); if (idx < 0 || idx >= blanches.length) return null; return blanches[idx].note; }
  function onPointerDown(e: React.PointerEvent) { if (e.button !== 0) return; e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); pointerEnfonce.current = true; const note = trouverNoteDepuisPointer(e); if (note !== null) presser(note); }
  function onPointerMove(e: React.PointerEvent) { if (!pointerEnfonce.current) return; const note = trouverNoteDepuisPointer(e); if (note !== null && !touches.has(note)) presser(note); }
  function onPointerUp() { pointerEnfonce.current = false; for (const note of activesRef.current.keys()) relacher(note); }
  function demarrerEnreg() { seqRef.current = []; setVersion((v) => v + 1); enRegRef.current = true; debutRef.current = performance.now(); setEnReg(true); }
  function arreterEnreg() { enRegRef.current = false; setEnReg(false); const now = performance.now(); for (const s of seqRef.current) if (s.fin === 0) s.fin = (now - debutRef.current) / 1000; setNodes((nds) => nds.map((nd) => nd.id === id ? { ...nd, data: { ...nd.data, sequenceNotes: [...seqRef.current] } } : nd)); setVersion((v) => v + 1); }
  function effacer() { seqRef.current = []; setVersion((v) => v + 1); for (const [n] of activesRef.current) arreter(n); setTouches(new Set()); setNodes((nds) => nds.map((nd) => nd.id === id ? { ...nd, data: { ...nd.data, sequenceNotes: [] } } : nd)); }
  function jouerNoteSynthetisee(ctx: AudioContext, note: number, debut: number, duree: number, velocite: number) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = "triangle"; osc.frequency.value = 440 * 2 ** ((note - 69) / 12);
    const vol = 0.12 * (velocite / 127);
    const t = ctx.currentTime + debut + 0.05;
    g.gain.setValueAtTime(0, t - 0.02);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol, t + duree - 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + duree);
    osc.connect(g).connect(ctx.destination);
    osc.start(t); osc.stop(t + duree + 0.05);
  }
  function rejouer() {
    const ctx = getCtx();
    for (const s of seqRef.current) {
      if (s.fin <= s.debut) continue;
      jouerNoteSynthetisee(ctx, s.note, s.debut, s.fin - s.debut, s.velocite);
    }
  }
  const [octaveClavier, setOctaveClavier] = useState(4);
  const keyMap = useMemo(() => { const m = new Map<string, number>(), blancs = "zxcvbnm", noirs = "sdghj", notesBlanches = [0, 2, 4, 5, 7, 9, 11], notesNoires = [1, 3, 6, 8, 10], base = octaveClavier * 12; for (let i = 0; i < blancs.length; i++) m.set(blancs[i].toUpperCase(), base + notesBlanches[i]); for (let i = 0; i < noirs.length; i++) m.set(noirs[i].toUpperCase(), base + notesNoires[i]); return m; }, [octaveClavier]);
  useEffect(() => { function onKD(e: KeyboardEvent) { if (e.repeat) return; if (e.key === "ArrowUp" || e.key === "=") { setOctaveClavier((o) => Math.min(o + 1, 7)); return; } if (e.key === "ArrowDown" || e.key === "-") { setOctaveClavier((o) => Math.max(o - 1, 2)); return; } const note = keyMap.get(e.key.toUpperCase()); if (note !== undefined && !activesRef.current.has(note)) presser(note); } function onKU(e: KeyboardEvent) { const note = keyMap.get(e.key.toUpperCase()); if (note !== undefined) relacher(note); } window.addEventListener("keydown", onKD); window.addEventListener("keyup", onKU); return () => { window.removeEventListener("keydown", onKD); window.removeEventListener("keyup", onKU); ctxRef.current?.close(); ctxRef.current = null; }; }, [keyMap]);
  return (
    <div className="clavier" ref={contRef} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <NodeResizer minWidth={350} minHeight={220} />
      <div className="clavier-controles">
        <button className={enReg ? "actif" : ""} onClick={demarrerEnreg} disabled={enReg}>⏺ Enreg.</button>
        <button onClick={arreterEnreg} disabled={!enReg}>⏹ Arrêter</button>
        <button onClick={rejouer} disabled={seq.length === 0 || enReg}>▶ Rejouer</button>
        <button onClick={effacer}>🗑 Effacer</button>
        <span className="clavier-nb">{seq.length} note{seq.length > 1 ? "s" : ""}</span>
        <span className="clavier-octave">←↑→ {nomNote(octaveClavier * 12)}–{nomNote(octaveClavier * 12 + 11)}</span>
      </div>
      <div className={"clavier-touches" + (larg > 0 && totalWidth > larg ? " avec-scroll" : "")}
        ref={touchesRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        style={{ width: "100%", minHeight: 70 }}>
        <div className="clavier-interieure" style={{ width: totalWidth, position: "relative", height: "100%" }}>
          {blanches.map((b, i) => (
            <div key={b.note} className={"clavier-blanche" + (touches.has(b.note) ? " enfoncee" : "")}
              style={{ position: "absolute", left: i * NB, width: NB - 1, height: "100%", top: 0 }} />
          ))}
          {noires.map((k) => (
            <div key={k.note} className={"clavier-noire" + (touches.has(k.note) ? " enfoncee" : "")}
              style={{ position: "absolute", left: (k.idxBlanche + 1) * NB - NB * 0.3, width: NB * 0.55, height: "60%", top: 0 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Analyseur de spectre (FFT) ──
function VueSpectre({ data }: VueProps) {
  const p = data.parametres ?? {};
  return (
    <SpectreFFT
      audioUrl={data.audioResultatUrl}
      tailleFFT={parseInt(String(p["Fenêtre"] ?? "4096")) || 4096}
      log={String(p["Échelle"] ?? "Logarithmique") === "Logarithmique"}
    />
  );
}

// ── Spectrogramme (STFT) ──
function VueSpectrogramme({ data }: VueProps) {
  const p = data.parametres ?? {};
  return (
    <Spectrogramme
      audioUrl={data.audioResultatUrl}
      tailleFFT={parseInt(String(p["Fenêtre"] ?? "1024")) || 1024}
      log={String(p["Échelle"] ?? "Logarithmique") === "Logarithmique"}
    />
  );
}

// ── Oscillateur pédagogique (onde + harmoniques) ──
function VueOscillo({ data }: VueProps) {
  const p = data.parametres ?? {};
  return <OscilloVue audioUrl={data.audioResultatUrl} frequence={Number(p["Fréquence"] ?? 220) || 220} />;
}

// ── Réponse en fréquence d'un filtre (courbe théorique depuis les paramètres) ──
function VueReponseFiltre({ data }: VueProps) {
  const p = data.parametres ?? {};
  return (
    <ReponseFiltre
      type={String(p["Type"] ?? "Passe-bas")}
      cutoff={Number(p["Fréquence de coupure"] ?? 1000) || 1000}
      q={Number(p["Résonance"] ?? 0.7) || 0.7}
    />
  );
}

// ── Séquenceur de batterie (grille pas-à-pas) ──
function VueSequenceurBatterie({ id, data }: VueProps) {
  const p = data.parametres ?? {};
  const nbPas = parseInt(String(p["Nombre de pas"] ?? "16"), 10) || 16;
  const motif = String(p["Motif"] ?? "");
  const d = data as { onChangerParametre?: (id: string, nom: string, v: string | number) => void };
  return (
    <SequenceurBatterie
      motif={motif}
      nbPas={nbPas}
      onChange={(m) => d.onChangerParametre?.(id, "Motif", m)}
    />
  );
}

// ── Séquenceur mélodique (grille piano-roll pas-à-pas) ──
function VueSequenceurMelodique({ id, data }: VueProps) {
  const p = data.parametres ?? {};
  const nbPas = parseInt(String(p["Nombre de pas"] ?? "16"), 10) || 16;
  const motif = String(p["Motif"] ?? "");
  const cle = String(p["Clé"] ?? "C");
  const gamme = String(p["Gamme"] ?? "majeur");
  const octave = Number(p["Octave"] ?? 3);
  const d = data as { onChangerParametre?: (id: string, nom: string, v: string | number) => void };
  return (
    <SequenceurMelodique
      motif={motif}
      nbPas={nbPas}
      cle={cle}
      gamme={gamme}
      octave={octave}
      onChange={(m) => d.onChangerParametre?.(id, "Motif", m)}
    />
  );
}

// ── Enveloppe ADSR (courbe depuis les paramètres) ──
function VueADSR({ data }: VueProps) {
  const p = data.parametres ?? {};
  return (
    <EnveloppeADSR
      attaque={Number(p["Attaque"] ?? 10)}
      declin={Number(p["Déclin"] ?? 100)}
      maintien={Number(p["Maintien"] ?? 70)}
      relachement={Number(p["Relâchement"] ?? 200)}
    />
  );
}

// ── Noms d'instruments (aperçu texte de la liste, depuis les paramètres) ──
function VueNomsInstruments({ data }: VueProps) {
  const { lang } = useI18n();
  const p = data.parametres ?? {};
  const { texte, total } = construireListeInstruments(String(p["Famille"] ?? "Toutes"), String(p["Format"] ?? "Virgule"), lang);
  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      <div style={{
        maxHeight: 150, overflowY: "auto", fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap",
        background: "#0d1117", borderRadius: 4, padding: "6px 8px", color: "var(--texte, #cbd5e1)",
      }}>{texte}</div>
      <div style={{ fontSize: 10, opacity: 0.55, marginTop: 3 }}>{total} {lang === "en" ? "instruments" : "instruments"}</div>
    </div>
  );
}

// ── Styles musicaux (aperçu texte de la liste, depuis les paramètres) ──
function VueStylesMusicaux({ data }: VueProps) {
  const { lang } = useI18n();
  const p = data.parametres ?? {};
  const { texte, total } = construireListeStyles(String(p["Catégorie"] ?? "Toutes"), String(p["Format"] ?? "Virgule"), lang);
  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      <div style={{
        maxHeight: 150, overflowY: "auto", fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap",
        background: "#0d1117", borderRadius: 4, padding: "6px 8px", color: "var(--texte, #cbd5e1)",
      }}>{texte}</div>
      <div style={{ fontSize: 10, opacity: 0.55, marginTop: 3 }}>{total} {lang === "en" ? "styles" : "styles"}</div>
    </div>
  );
}

// ── Émotions (aperçu texte de la liste, depuis les paramètres) ──
function VueEmotions({ data }: VueProps) {
  const { lang } = useI18n();
  const p = data.parametres ?? {};
  const { texte, total } = construireListeEmotions(String(p["Catégorie"] ?? "Toutes"), String(p["Format"] ?? "Virgule"), lang);
  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      <div style={{
        maxHeight: 150, overflowY: "auto", fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap",
        background: "#0d1117", borderRadius: 4, padding: "6px 8px", color: "var(--texte, #cbd5e1)",
      }}>{texte}</div>
      <div style={{ fontSize: 10, opacity: 0.55, marginTop: 3 }}>{total} {lang === "en" ? "emotions" : "émotions"}</div>
    </div>
  );
}

// ── Tessitures de voix (aperçu texte de la liste, depuis les paramètres) ──
function VueTessituresVoix({ data }: VueProps) {
  const { lang } = useI18n();
  const p = data.parametres ?? {};
  const { texte, total } = construireListeTessitures(String(p["Groupe"] ?? "Toutes"), String(p["Format"] ?? "Virgule"), lang);
  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      <div style={{
        maxHeight: 150, overflowY: "auto", fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap",
        background: "#0d1117", borderRadius: 4, padding: "6px 8px", color: "var(--texte, #cbd5e1)",
      }}>{texte}</div>
      <div style={{ fontSize: 10, opacity: 0.55, marginTop: 3 }}>{total} {lang === "en" ? "ranges" : "tessitures"}</div>
    </div>
  );
}

// ── Générateur de script IA (aperçu du script généré) ──
function VueGenerateurScriptIA({ data }: VueProps) {
  const { t } = useI18n();
  const script = data.audioResultatMessage ?? "";
  const texte = (data as { scriptGenere?: string }).scriptGenere ?? "";
  const affiche = texte || script;
  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      {affiche ? (
        <div style={{
          maxHeight: 180, overflowY: "auto", fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap",
          background: "#0d1117", borderRadius: 4, padding: "6px 8px", color: "var(--texte, #cbd5e1)",
        }}>{affiche}</div>
      ) : (
        <div style={{ fontSize: 11, opacity: 0.5, padding: "4px" }}>{t("export.avantLancer")}</div>
      )}
    </div>
  );
}

// ── Comparateur A/B (boutons de bascule + relance) ──
function VueComparateurAB({ id, data }: VueProps) {
  const sel = String(data.parametres?.["Écoute"] ?? "A");
  const d = data as {
    onChangerParametre?: (id: string, nom: string, v: string | number) => void;
    onDefinirPrioritaire?: (id: string) => void;
  };
  const choisir = (v: string) => {
    d.onChangerParametre?.(id, "Écoute", v);
    // Laisse l'état se propager (noeudsRef) avant de relancer ce nœud.
    setTimeout(() => d.onDefinirPrioritaire?.(id), 60);
  };
  const btn = (v: string): CSSProperties => ({
    flex: 1, padding: "6px 0", cursor: "pointer", fontWeight: 700, borderRadius: 4,
    border: "1px solid var(--bordure, #333)",
    background: sel === v ? "#2a9d8f" : "transparent",
    color: sel === v ? "#0d1117" : "var(--texte, #ccc)",
  });
  return (
    <div className="nodrag" style={{ display: "flex", gap: 6, padding: "4px 0" }} onPointerDown={(e) => e.stopPropagation()}>
      <button style={btn("A")} onClick={(e) => { e.stopPropagation(); choisir("A"); }}>A</button>
      <button style={btn("B")} onClick={(e) => { e.stopPropagation(); choisir("B"); }}>B</button>
    </div>
  );
}

// ── Détecteur d'accords (progression d'accords) ──
function VueDetecteurAccords({ data }: VueProps) {
  const { t } = useI18n();
  const message = data.audioResultatMessage ?? "";
  const affiche = message && !message.startsWith("Aucune") && !message.startsWith("No chords");
  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      {affiche ? (
        <div style={{
          maxHeight: 160, overflowY: "auto", fontSize: 11, lineHeight: 1.6, whiteSpace: "pre-wrap",
          background: "#0d1117", borderRadius: 4, padding: "6px 8px", color: "var(--texte, #cbd5e1)",
        }}>{message}</div>
      ) : (
        <div style={{ fontSize: 11, opacity: 0.5, padding: "4px" }}>{t("export.avantLancer")}</div>
      )}
    </div>
  );
}

// ── Python Processor (éditeur de code avec coloration syntaxique) ──
function VuePythonProcessor({ id, data }: VueProps) {
  const d = data as { onChangerParametre?: (id: string, nom: string, v: string | number) => void };
  const code = String(data.parametres?.["Code"] ?? "");
  const [editCode, setEditCode] = useState(code);
  const [pyInfo, setPyInfo] = useState<{ disponible: boolean; chemin: string; version: string } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

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
      alert(`Erreur: ${result?.erreur || "chemin invalide"}`);
    }
  };

  const gutterRef = useRef<HTMLPreElement>(null);

  // Sync scroll textarea → pre + gutter
  const onScroll = () => {
    if (taRef.current && preRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
      preRef.current.scrollLeft = taRef.current.scrollLeft;
    }
    if (taRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = taRef.current.scrollTop;
    }
  };

  // Coloration
  const tokens = editCode ? tokenizePython(editCode) : [];
  const colorMap: Record<string, string> = {
    keyword: "#569cd6",
    string: "#ce9178",
    comment: "#6a9955",
    number: "#b5cea8",
    ident: "#d4d4d4",
    plain: "#d4d4d4",
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
          {pyInfo?.disponible ? `Python: ${pyInfo.version}` : "Python non détecté"}
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={(e) => { e.stopPropagation(); configurerPython(); }}
          style={{
            fontSize: 10, padding: "2px 8px", cursor: "pointer",
            border: "1px solid var(--border, #333)", borderRadius: 4,
            background: "transparent", color: "var(--text-secondary)",
          }}
          title="Configurer le chemin de l'exécutable Python"
        >⚙ Configurer</button>
      </div>
      {/* Éditeur de code avec numérotation de lignes */}
      <div style={{ position: "relative", fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace", fontSize: 12, lineHeight: 1.5, display: "flex", flex: 1, minHeight: 0 }}>
        {/* Numéros de ligne */}
        <pre
          ref={gutterRef}
          aria-hidden="true"
          style={{
            margin: 0, padding: "8px 4px 8px 8px", overflow: "hidden",
            background: "#1a1a1e", borderRadius: "4px 0 0 4px", textAlign: "right",
            color: "#555", userSelect: "none", minWidth: 36, flexShrink: 0,
            minHeight: 0,
            whiteSpace: "pre", tabSize: 4,
          }}
        >
          {editCode.split("\n").map((_, i) => `${i + 1}\n`).join("").trimEnd()}
        </pre>
        {/* Zone de code (coloration + textarea) */}
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <pre
            ref={preRef}
            aria-hidden="true"
            style={{
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              margin: 0, padding: "8px", overflow: "auto",
              background: "#1e1e1e", borderRadius: "0 4px 4px 0", pointerEvents: "none",
              whiteSpace: "pre-wrap", wordBreak: "break-word", tabSize: 4,
            }}
          >
            {tokens.map((t: { text: string; type: string }, i: number) => (
              <span key={i} style={{ color: colorMap[t.type] || "#d4d4d4" }}>{t.text}</span>
            ))}
          </pre>
          <textarea
            ref={taRef}
            value={editCode}
            onChange={(e) => {
              setEditCode(e.target.value);
              d.onChangerParametre?.(id, "Code", e.target.value);
            }}
            onScroll={onScroll}
            spellCheck={false}
            style={{
              position: "relative", width: "100%", height: "100%",
              margin: 0, padding: "8px", border: "1px solid #333", borderLeft: "none", borderRadius: "0 4px 4px 0",
              background: "transparent", color: "transparent",
              caretColor: "#fff", resize: "none", outline: "none",
              fontFamily: "inherit", fontSize: "inherit", lineHeight: "inherit",
              whiteSpace: "pre-wrap", wordBreak: "break-word", tabSize: 4,
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                e.preventDefault();
                const ta = e.currentTarget;
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                const newCode = editCode.slice(0, start) + "    " + editCode.slice(end);
                setEditCode(newCode);
                d.onChangerParametre?.(id, "Code", newCode);
                requestAnimationFrame(() => {
                  ta.selectionStart = ta.selectionEnd = start + 4;
                });
              }
            }}
          />
        </div>
      </div>
      <div style={{ fontSize: 10, marginTop: 4, color: "var(--text-muted)", background: "var(--bg-surface)", padding: "2px 4px", borderRadius: "0 0 6px 6px" }}>
        {editCode.split("\n").length} lignes · numpy + wave requis
      </div>
    </div>
  );
}

// ── Gestionnaire de nodes (instructions + statut) ──
function VueGestionNodes({ data }: VueProps) {
  const { t } = useI18n();
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
function VueCouleurSunoIA({ data }: VueProps) {
  const { t, lang } = useI18n();
  const p = data.parametres ?? {};
  const c1 = String(p["Couleur 1"] ?? "Bleu");
  const c2 = String(p["Couleur 2"] ?? "(aucune)");
  const obj1 = COULEURS[c1];
  const obj2 = COULEURS[c2];
  const hex1 = obj1?.hex ?? "#999";
  const hex2 = obj2?.hex ?? "#333";
  const nom1 = obj1 ? obj1[lang] : c1;
  const nom2 = obj2 ? obj2[lang] : c2;
  const texte = (data as { scriptGenere?: string }).scriptGenere ?? "";
  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <div style={{ width: 24, height: 24, borderRadius: 4, background: hex1, boxShadow: `0 0 6px ${hex1}` }} />
        {c2 && c2 !== "(aucune)" && obj2 ? (
          <>
            <span style={{ fontSize: 14, opacity: 0.5 }}>+</span>
            <div style={{ width: 24, height: 24, borderRadius: 4, background: hex2, boxShadow: `0 0 6px ${hex2}` }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>{nom1} + {nom2}</span>
          </>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 600, color: hex1 }}>{nom1}</span>
        )}
      </div>
      {texte ? (
        <div style={{
          maxHeight: 160, overflowY: "auto", fontSize: 10, lineHeight: 1.5, whiteSpace: "pre-wrap",
          background: "#0d1117", borderRadius: 4, padding: "6px 8px", color: "var(--texte, #cbd5e1)",
        }}>{texte}</div>
      ) : (
        <div style={{ fontSize: 11, opacity: 0.5, padding: "4px" }}>{t("export.avantLancer")}</div>
      )}
    </div>
  );
}

// ── Galerie d'exposition (aperçu + téléchargement HTML) ──
function VueGalerieExposition({ data }: VueProps) {
  const { t } = useI18n();
  const html = (data as any)._galerieHTML as string | undefined;
  const pistes = (data as any)._galeriePistes as { nom: string; url: string }[] | undefined;
  const htmlUrl = useMemo(() => html ? URL.createObjectURL(new Blob([html], { type: "text/html" })) : null, [html]);
  useEffect(() => () => { if (htmlUrl) URL.revokeObjectURL(htmlUrl); }, [htmlUrl]);
  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      {html ? (
        <>
          {pistes && pistes.length > 0 && (
            <div style={{ maxHeight: 120, overflowY: "auto", fontSize: 11, marginBottom: 6 }}>
              {pistes.slice(0, 10).map((p, i) => (
                <div key={i} style={{ padding: "3px 0", color: "var(--text-secondary)", display: "flex", gap: 6 }}>
                  <span style={{ color: "#2a9d8f", fontWeight: 700, minWidth: 20 }}>{(i + 1).toString().padStart(2, "0")}</span>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nom}</span>
                </div>
              ))}
              {pistes.length > 10 && <div style={{ opacity: 0.5, padding: "3px 0" }}>… +{pistes.length - 10} autres</div>}
            </div>
          )}
          <a href={htmlUrl ?? "#"}
            download="index.html"
            className="attic-node-fichier-btn"
            style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
            ⬇ index.html ({Math.round(html.length / 1024)} KB)
          </a>
        </>
      ) : (
        <div style={{ fontSize: 11, opacity: 0.5, padding: "4px" }}>{t("export.avantLancer")}</div>
      )}
    </div>
  );
}

// ── Générateur de pochette (canvas procédural) ──
function VuePochette({ data }: VueProps) {
  const p = data.parametres ?? {};
  return (
    <PochetteGen
      prompt={String(p["Prompt"] ?? "dark ambient night mysterious")}
      titre={String(p["Titre"] ?? "Album")}
      artiste={String(p["Artiste"] ?? "")}
      style={String(p["Style"] ?? "bauhaus")}
      graine={Number(p["Graine"] ?? 0)}
    />
  );
}

// ── ColorSynth (spectre → palette de couleurs) ──
function VueColorSynth({ data }: VueProps) {
  return <ColorSynth audioUrl={data.audioResultatUrl} />;
}

// ── VU-mètre / LUFS (bargraphes de niveau) ──
function VueVuMetre({ data }: VueProps) {
  return <VuMetre audioUrl={data.audioResultatUrl} />;
}

// ── Source de texte (zone de texte éditable et redimensionnable) ──
function VueSourceTexte({ id, data }: VueProps) {
  const d = data as { onChangerParametre?: (id: string, nom: string, v: string | number) => void };
  const texte = String(data.parametres?.["Texte"] ?? "");
  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      <NodeResizer minWidth={220} minHeight={120} />
      <textarea
        defaultValue={texte}
        key={`${id}-texte`}
        onChange={(e) => d.onChangerParametre?.(id, "Texte", e.target.value)}
        style={{
          width: "100%", minHeight: 80, resize: "none",
          fontSize: 12, lineHeight: 1.5, fontFamily: "inherit",
          background: "var(--bg-input, #0d1117)", color: "var(--texte, #cbd5e1)",
          border: "1px solid var(--border, #333)",
          borderRadius: 4, padding: "6px 8px", outline: "none",
          boxSizing: "border-box",
        }}
        placeholder="Saisissez votre texte ici…"
        onClick={(e) => e.stopPropagation()}
      />
      <div style={{ fontSize: 10, marginTop: 3, color: "var(--text-muted, #666)" }}>
        {texte.length} caractères
      </div>
    </div>
  );
}

// ── Registre : id (ou prédicat) → vue(s), position relative au lecteur ──
type Vue = (props: VueProps) => ReactNode;
interface EntreeRegistre { correspond: (ficheId: string) => boolean; vue: Vue; position: "avant" | "apres"; }
const parId = (...ids: string[]) => (f: string) => ids.includes(f);

const REGISTRE: EntreeRegistre[] = [
  { correspond: parId("enregistreur-audio", "entree-micro"), vue: VueEnregistreur, position: "avant" },
  { correspond: parId("visualiseur-forme-onde", "selecteur-multi-zones"), vue: VueFormeOnde, position: "avant" },
  { correspond: parId("analyseur-spectre"), vue: VueSpectre, position: "avant" },
  { correspond: parId("spectrogramme"), vue: VueSpectrogramme, position: "avant" },
  { correspond: parId("oscillateur"), vue: VueOscillo, position: "avant" },
  { correspond: parId("reponse-filtre"), vue: VueReponseFiltre, position: "avant" },
  { correspond: parId("comparateur-ab"), vue: VueComparateurAB, position: "avant" },
  { correspond: parId("sequenceur-batterie"), vue: VueSequenceurBatterie, position: "avant" },
  { correspond: parId("sequenceur-melodique"), vue: VueSequenceurMelodique, position: "avant" },
  { correspond: parId("enveloppe-adsr"), vue: VueADSR, position: "avant" },
  { correspond: parId("noms-instruments"), vue: VueNomsInstruments, position: "avant" },
  { correspond: parId("styles-musicaux"), vue: VueStylesMusicaux, position: "avant" },
  { correspond: parId("emotions"), vue: VueEmotions, position: "avant" },
  { correspond: parId("tessitures-voix"), vue: VueTessituresVoix, position: "avant" },
  { correspond: parId("generateur-script-ia"), vue: VueGenerateurScriptIA, position: "avant" },
  { correspond: parId("couleur-suno-ia"), vue: VueCouleurSunoIA, position: "avant" },
  { correspond: parId("detecteur-accords"), vue: VueDetecteurAccords, position: "avant" },
  { correspond: parId("vu-metre"), vue: VueVuMetre, position: "avant" },
  { correspond: parId("colorsynth"), vue: VueColorSynth, position: "avant" },
  { correspond: parId("generateur-pochette"), vue: VuePochette, position: "avant" },
  { correspond: parId("galerie-exposition"), vue: VueGalerieExposition, position: "avant" },
  { correspond: parId("gestion-nodes"), vue: VueGestionNodes, position: "avant" },
  { correspond: parId("python-processor"), vue: VuePythonProcessor, position: "avant" },
  { correspond: parId("source-texte"), vue: VueSourceTexte, position: "avant" },
  { correspond: parId("entree-audio", "sampler-personnalise"), vue: VueUploadAudio, position: "avant" },
  { correspond: parId("explorateur-musique"), vue: VueExplorateur, position: "avant" },
  { correspond: parId("lecteur-midi", "chargeur-soundfont"), vue: VueUploadMidi, position: "avant" },
  { correspond: parId("chargeur-soundfont"), vue: VueSoundFont, position: "avant" },
  { correspond: parId("transcripteur-midi"), vue: VueTranscription, position: "avant" },
  { correspond: parId("classificateur-genre", "separateur-ia"), vue: VueUploadOnnx, position: "avant" },
  { correspond: parId("reverbe-convolution"), vue: VueUploadIR, position: "avant" },
  { correspond: parId("couleur-suno-ia"), vue: VueCouleurSunoIA, position: "avant" },
  { correspond: (f) => f.startsWith("collection-"), vue: VueCollections, position: "apres" },
  { correspond: parId("sortie-audio", "sortie-midi", "convertisseur-audio", "convertisseur-mp3-wav"), vue: VueExport, position: "apres" },
  { correspond: parId("clavier-melodie"), vue: ClavierMelodie, position: "apres" },
];

export function vuesPourNoeud(ficheId: string, position: "avant" | "apres"): Vue[] {
  return REGISTRE.filter((e) => e.position === position && e.correspond(ficheId)).map((e) => e.vue);
}
