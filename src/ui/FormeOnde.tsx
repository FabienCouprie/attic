// ui/FormeOnde.tsx — Visualiseur de forme d'onde basé sur WaveSurfer.js.
// Conserve la grille temporelle, la sélection de zones et les contrôles de lecture.
import { useRef, useState, useEffect, useCallback } from "react";
import { NodeResizer } from "@xyflow/react";
import WaveSurfer from "wavesurfer.js";
import { useI18n } from "../i18n";

export type Zone = { debut: number; duree: number };

interface Props {
  audioUrl?: string;
  multi: boolean;
  zones: Zone[];
  onZonesChange?: (zones: Zone[]) => void;
}

function formatTemps(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

export function FormeOnde({ audioUrl, multi, zones, onZonesChange }: Props) {
  const { t } = useI18n();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  const [chargement, setChargement] = useState(false);
  const [dureeTotale, setDureeTotale] = useState(0);
  const [zoomPct, setZoomPct] = useState(100);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playPos, setPlayPos] = useState(0);
  const [selAffichee, setSelAffichee] = useState<Zone>({ debut: 0, duree: 0 });

  const visibleRef = useRef({ start: 0, end: 0 });
  const selectionRef = useRef<Zone>({ debut: 0, duree: 0 });
  const dragRef = useRef<{ type: "selectionner" | "deplacer"; debutSec: number } | null>(null);
  const [, forceRedraw] = useState(0);

  const hauteur = multi ? 140 : 100;

  // ── Création du WaveSurfer ──
  useEffect(() => {
    if (!waveRef.current) return;
    const ws = WaveSurfer.create({
      container: waveRef.current,
      waveColor: multi ? "#2a9d8f" : "#4c6ef5",
      progressColor: multi ? "#2a9d8f" : "#4c6ef5",
      cursorColor: "#e76f51",
      cursorWidth: 2,
      height: hauteur,
      normalize: true,
      fillParent: true,
      minPxPerSec: 0,
      interact: true,
      autoScroll: true,
      autoCenter: true,
    });
    wavesurferRef.current = ws;

    const onReady = (duration: number) => {
      setDureeTotale(duration);
      setChargement(false);
      setZoomPct(100);
      setPlayPos(0);
      visibleRef.current = { start: 0, end: duration };
      forceRedraw((v) => v + 1);
      // Zoom fit initial
      const wrapper = wrapperRef.current;
      if (wrapper && duration > 0) {
        const fit = (wrapper.clientWidth - 4) / duration;
        ws.zoom(fit);
      }
    };
    const onLoad = () => setChargement(true);
    const onError = () => setChargement(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onFinish = () => { setIsPlaying(false); setPlayPos(0); };
    const onTimeUpdate = (time: number) => setPlayPos(time);
    const onScroll = (start: number, end: number) => {
      visibleRef.current = { start, end };
      forceRedraw((v) => v + 1);
    };
    const onZoom = () => forceRedraw((v) => v + 1);

    ws.on("ready", onReady);
    ws.on("load", onLoad);
    ws.on("error", onError);
    ws.on("play", onPlay);
    ws.on("pause", onPause);
    ws.on("finish", onFinish);
    ws.on("timeupdate", onTimeUpdate);
    ws.on("scroll", onScroll);
    ws.on("zoom", onZoom);

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
    };
  }, [multi, hauteur]);

  // ── Chargement / déchargement d'un audio ──
  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    if (!audioUrl) {
      setDureeTotale(0);
      setChargement(false);
      ws.empty();
      return;
    }
    ws.load(audioUrl);
  }, [audioUrl]);

  // ── Zoom ──
  useEffect(() => {
    const ws = wavesurferRef.current;
    const wrapper = wrapperRef.current;
    if (!ws || !wrapper || dureeTotale <= 0) return;
    const fit = (wrapper.clientWidth - 4) / dureeTotale;
    ws.zoom(fit * (zoomPct / 100));
  }, [zoomPct, dureeTotale]);

  // ── Dessin de l'overlay (grille, zones, sélection) ──
  const dessiner = useCallback(() => {
    const canvas = overlayRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const largeurCSS = wrapper.clientWidth;
    const wpx = Math.round(largeurCSS * dpr);
    const hpx = Math.round(hauteur * dpr);
    if (canvas.width !== wpx || canvas.height !== hpx) {
      canvas.width = wpx;
      canvas.height = hpx;
      canvas.style.width = `${largeurCSS}px`;
      canvas.style.height = `${hauteur}px`;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { start, end } = visibleRef.current;
    const visible = end - start;
    ctx.clearRect(0, 0, largeurCSS, hauteur);
    if (visible <= 0) return;

    const zoom = largeurCSS / visible;
    const debutVisible = start;
    const finVisible = end;

    // Grille temporelle adaptative
    const dureeVisible = visible;
    let pasGrille: number;
    if (dureeVisible > 60) pasGrille = 10;
    else if (dureeVisible > 30) pasGrille = 5;
    else if (dureeVisible > 10) pasGrille = 2;
    else if (dureeVisible > 2) pasGrille = 1;
    else if (dureeVisible > 1) pasGrille = 0.5;
    else if (dureeVisible > 0.2) pasGrille = 0.1;
    else pasGrille = 0.05;

    const premierMarqueur = Math.ceil(debutVisible / pasGrille) * pasGrille;
    ctx.font = '11px "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = "top";
    for (let tt = premierMarqueur; tt <= finVisible; tt += pasGrille) {
      const x = Math.round((tt - debutVisible) * zoom);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, hauteur); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      const label = pasGrille >= 1 ? `${tt.toFixed(0)}s` : `${tt.toFixed(pasGrille < 0.1 ? 2 : 1)}s`;
      ctx.fillText(label, x + 4, 3);
    }

    // Ligne centrale
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, hauteur / 2); ctx.lineTo(largeurCSS, hauteur / 2); ctx.stroke();

    // Zones mémorisées
    for (const z of zones) {
      const zx = (z.debut - debutVisible) * zoom;
      const zw = z.duree * zoom;
      if (zx >= largeurCSS || zx + zw <= 0) continue;
      const vx = Math.max(0, zx);
      const vw = Math.min(largeurCSS, zx + zw) - vx;
      ctx.fillStyle = "rgba(63,185,80,0.18)";
      ctx.fillRect(vx, 0, vw, hauteur);
      ctx.strokeStyle = "rgba(63,185,80,0.75)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(vx + 0.5, 0.5, vw - 1, hauteur - 1);
      const cx = (z.debut + z.duree / 2 - debutVisible) * zoom;
      if (cx >= 0 && cx <= largeurCSS) {
        ctx.strokeStyle = "rgba(63,185,80,0.9)";
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, hauteur); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Sélection en cours (mode multi)
    if (multi) {
      const sel = selectionRef.current;
      const sx = (sel.debut - debutVisible) * zoom;
      const sw = sel.duree * zoom;
      if (sx < largeurCSS && sx + sw > 0 && sel.duree > 0) {
        const vx = Math.max(0, sx);
        const vw = Math.min(largeurCSS, sx + sw) - vx;
        ctx.fillStyle = "rgba(88,166,255,0.22)";
        ctx.fillRect(vx, 0, vw, hauteur);
        ctx.strokeStyle = "rgba(88,166,255,0.8)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(vx + 0.5, 0.5, vw - 1, hauteur - 1);
      }
    }
  }, [multi, hauteur, zones]);

  useEffect(() => { dessiner(); }, [dessiner]);

  // ── Redessiner au redimensionnement ──
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const ws = wavesurferRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver(() => {
      if (ws && dureeTotale > 0) {
        const fit = (wrapper.clientWidth - 4) / dureeTotale;
        ws.zoom(fit * (zoomPct / 100));
      }
      forceRedraw((v) => v + 1);
    });
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [dureeTotale, zoomPct]);

  const tempsDepuisX = useCallback((offsetX: number) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return 0;
    const { start, end } = visibleRef.current;
    const visible = end - start;
    if (visible <= 0) return 0;
    const t = start + (offsetX / wrapper.clientWidth) * visible;
    return Math.max(0, Math.min(t, dureeTotale));
  }, [dureeTotale]);

  const surPointeurBas = useCallback((e: React.PointerEvent) => {
    if (!multi || dureeTotale <= 0) return;
    const t = tempsDepuisX(e.nativeEvent.offsetX);
    const sel = selectionRef.current;
    if (sel.duree > 0 && t >= sel.debut && t <= sel.debut + sel.duree) {
      dragRef.current = { type: "deplacer", debutSec: t - sel.debut };
    } else {
      dragRef.current = { type: "selectionner", debutSec: t };
      selectionRef.current = { debut: t, duree: 0 };
    }
    overlayRef.current?.setPointerCapture(e.pointerId);
  }, [multi, dureeTotale, tempsDepuisX]);

  const surPointeurDeplacer = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || dureeTotale <= 0) return;
    const t = tempsDepuisX(e.nativeEvent.offsetX);
    if (dragRef.current.type === "selectionner") {
      const debut = Math.min(dragRef.current.debutSec, t);
      const fin = Math.max(dragRef.current.debutSec, t);
      selectionRef.current = { debut, duree: fin - debut };
    } else {
      selectionRef.current = { debut: Math.max(0, t - dragRef.current.debutSec), duree: selectionRef.current.duree };
    }
    setSelAffichee({ ...selectionRef.current });
    dessiner();
  }, [dureeTotale, tempsDepuisX, dessiner]);

  const surPointeurLeve = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setSelAffichee({ ...selectionRef.current });
    overlayRef.current?.releasePointerCapture(e.pointerId);
    dessiner();
  }, [dessiner]);

  const ajouterZone = useCallback(() => {
    const sel = selectionRef.current;
    if (sel.duree <= 0.001) return;
    const nouvelles = [...zones, { debut: Number(sel.debut.toFixed(6)), duree: Number(sel.duree.toFixed(6)) }]
      .sort((a, b) => a.debut - b.debut);
    onZonesChange?.(nouvelles);
    selectionRef.current = { debut: 0, duree: 0 };
    setSelAffichee({ debut: 0, duree: 0 });
    dessiner();
  }, [zones, onZonesChange, dessiner]);

  const retirerZone = useCallback((index: number) => {
    onZonesChange?.(zones.filter((_, i) => i !== index));
    dessiner();
  }, [zones, onZonesChange, dessiner]);

  // ── Scrollbar custom ──
  const visibleDuration = visibleRef.current.end - visibleRef.current.start;
  const maxScroll = Math.max(0, dureeTotale - visibleDuration);
  const scrollPct = maxScroll > 0 ? (visibleRef.current.start / maxScroll) * 100 : 0;
  const thumbPct = dureeTotale > 0 ? Math.max(10, (visibleDuration / dureeTotale) * 100) : 100;

  return (
    <div className="attic-node-onde nodrag" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <NodeResizer minWidth={300} minHeight={multi ? 200 : 120} />
      {chargement && <div className="attic-node-onde-attente">{t("onde.chargement")}</div>}
      {!audioUrl && !chargement && (
        <div className="attic-node-onde-attente">{t("onde.connecterAudio")}</div>
      )}
      <div ref={wrapperRef} style={{ position: "relative", width: "100%" }}>
        <div
          ref={waveRef}
          style={{ width: "100%", height: hauteur, borderRadius: 4, overflow: "hidden", background: "#0d1117" }}
        />
        <canvas
          ref={overlayRef}
          onPointerDown={surPointeurBas}
          onPointerMove={surPointeurDeplacer}
          onPointerUp={surPointeurLeve}
          onWheel={(e) => {
            e.preventDefault();
            const facteur = e.deltaY > 0 ? 1 / 1.3 : 1.3;
            setZoomPct((z) => Math.max(100, Math.min(50000, Math.round(z * facteur))));
          }}
          onClick={(e) => {
            if (dragRef.current) return;
            const t = tempsDepuisX(e.nativeEvent.offsetX);
            wavesurferRef.current?.setTime(t);
            setPlayPos(t);
          }}
          style={{
            position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
            cursor: multi ? "crosshair" : "pointer", borderRadius: 4,
            pointerEvents: "auto", touchAction: "none",
          }}
        />
        {dureeTotale > 0 && maxScroll > 0 && (
          <div
            className="attic-waveform-scrollbar"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              const targetStart = Math.max(0, Math.min(maxScroll, pct * maxScroll));
              wavesurferRef.current?.setScrollTime(targetStart);
            }}
            style={{
              position: "relative", height: 6, background: "rgba(255,255,255,0.06)",
              borderRadius: 3, marginTop: 2, cursor: "pointer",
            }}
          >
            <div style={{
              position: "absolute", height: "100%",
              left: `${scrollPct}%`, width: `${thumbPct}%`,
              background: "rgba(42,157,143,0.5)", borderRadius: 3,
            }} />
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            wavesurferRef.current?.playPause();
          }}
          style={{
            width: 28, height: 28, borderRadius: "50%", border: "none",
            background: isPlaying ? "#e76f51" : "#2a9d8f", color: "#fff",
            cursor: "pointer", fontSize: 14, display: "flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >{isPlaying ? "❚❚" : "▶"}</button>
        <span style={{ fontSize: 10, color: "var(--text-muted)", flex: 1, fontFamily: "monospace" }}>
          {formatTemps(playPos)} / {formatTemps(dureeTotale)}
        </span>
      </div>
      <div className="attic-node-onde-infos">
        {multi ? (
          <span>{selAffichee.duree > 0
            ? `${selAffichee.debut.toFixed(2)}s → ${(selAffichee.debut + selAffichee.duree).toFixed(2)}s (${selAffichee.duree.toFixed(2)}s)`
            : t("zones.glisser")}</span>
        ) : <span />}
        <span>{dureeTotale.toFixed(1)}s · {zoomPct}% zoom</span>
      </div>
      {dureeTotale > 0 && (
        <input type="range" min={100} max={5000} step={10} value={zoomPct}
          onChange={(e) => { setZoomPct(Number(e.target.value)); }}
          style={{ width: "100%", marginTop: 4, accentColor: "#2a9d8f" }}
        />
      )}
      {multi && dureeTotale > 0 && (
        <div className="attic-node-zones">
          <button
            className="attic-node-zones-ajouter"
            onClick={(e) => { e.stopPropagation(); ajouterZone(); }}
            disabled={selAffichee.duree <= 0.001}
            title={t("zones.memoriser")}
          >➕ {t("zones.ajouter")}</button>
          <div className="attic-node-zones-liste">
            {zones.length === 0 && <span className="attic-node-zones-vide">{t("zones.aucune")}</span>}
            {zones.map((z, i) => (
              <span key={i} className="attic-node-zones-item">
                {z.debut.toFixed(2)}s → {(z.debut + z.duree).toFixed(2)}s
                <button className="attic-node-zones-retirer" onClick={(e) => { e.stopPropagation(); retirerZone(i); }} title={t("zones.retirer")}>×</button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
