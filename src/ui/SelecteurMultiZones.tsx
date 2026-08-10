// ui/SelecteurMultiZones.tsx — Canvas de forme d'onde + sélection de zones.
// Haute résolution (DPR), barre de défilement, redimensionnable (NodeResizer),
// zoom fluide (molette + slider). Utilisé uniquement par « selecteur-multi-zones ».
import { useRef, useState, useEffect, useCallback } from "react";
import { NodeResizer } from "@xyflow/react";
import { useI18n } from "../i18n";

export type Zone = { debut: number; duree: number };

interface Props {
  audioUrl?: string;
  zones: Zone[];
  onZonesChange?: (zones: Zone[]) => void;
}

function formatTemps(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

export function SelecteurMultiZones({ audioUrl, zones, onZonesChange }: Props) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);  const containerRef = useRef<HTMLDivElement>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [chargement, setChargement] = useState(false);
  const [zoomPct, setZoomPct] = useState(100); // 100% = fit total
  const [isPlaying, setIsPlaying] = useState(false);
  const [playPos, setPlayPos] = useState(0); // position de lecture en secondes
  const zoomRef = useRef(0); // pixels par seconde
  const scrollRef = useRef(0); // secondes
  const selectionRef = useRef<Zone>({ debut: 0, duree: 0 });
  const [selAffichee, setSelAffichee] = useState<Zone>({ debut: 0, duree: 0 });
  const dragRef = useRef<{ type: "selectionner" | "deplacer"; debutSec: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [, forceRedraw] = useState(0);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Décodage
  useEffect(() => {
    if (!audioUrl) {
      setBuffer(null);
      selectionRef.current = { debut: 0, duree: 0 };
      setSelAffichee({ debut: 0, duree: 0 });
      setZoomPct(100);
      scrollRef.current = 0;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d", { alpha: false });
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }
    let annule = false;
    setChargement(true);
    (async () => {
      try {
        const rep = await fetch(audioUrl);
        const ab = await rep.arrayBuffer();
        const ctx = new AudioContext();
        const buf = await ctx.decodeAudioData(ab);
        ctx.close();
        if (!annule) setBuffer(buf);
      } catch {
        if (!annule) setBuffer(null);
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => { annule = true; };
  }, [audioUrl]);

  // Calculer zoomRef depuis zoomPct
  const calculerZoom = useCallback(() => {
    if (!buffer || !containerRef.current) return 1;
    const largeur = containerRef.current.clientWidth - 4; // padding
    const zoomFit = largeur / buffer.duration;
    return zoomFit * (zoomPct / 100);
  }, [buffer, zoomPct]);

  const dessiner = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !buffer || !container) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const largeurCSS = Math.max(1, container.clientWidth - 4);
    const hauteurCSS = 140;
    // Ne redimensionner que si la taille a changé (évite le flou de re-création)
    const wpx = Math.round(largeurCSS * dpr);
    const hpx = Math.round(hauteurCSS * dpr);
    if (canvas.width !== wpx || canvas.height !== hpx) {
      canvas.width = wpx;
      canvas.height = hpx;
      canvas.style.width = `${largeurCSS}px`;
      canvas.style.height = `${hauteurCSS}px`;
    }
    const ctx = canvas.getContext("2d", { alpha: false })!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const zoom = calculerZoom();
    zoomRef.current = zoom;
    const sampleRate = buffer.sampleRate;
    const dureeTotale = buffer.duration;
    const largeurVisible = largeurCSS / zoom;
    const maxScroll = Math.max(0, dureeTotale - largeurVisible);
    scrollRef.current = Math.max(0, Math.min(scrollRef.current, maxScroll));
    const debutVisible = scrollRef.current;
    const finVisible = Math.min(dureeTotale, debutVisible + largeurVisible);

    // Fond
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, largeurCSS, hauteurCSS);

    // Grille temporelle adaptative
    const dureeVisible = finVisible - debutVisible;
    let pasGrille: number;
    if (dureeVisible > 60) pasGrille = 10;
    else if (dureeVisible > 30) pasGrille = 5;
    else if (dureeVisible > 10) pasGrille = 2;
    else if (dureeVisible > 2) pasGrille = 1;
    else if (dureeVisible > 1) pasGrille = 0.5;
    else if (dureeVisible > 0.2) pasGrille = 0.1;
    else pasGrille = 0.05;

    const premierMarqueur = Math.ceil(debutVisible / pasGrille) * pasGrille;
    ctx.font = "10px monospace";
    ctx.textBaseline = "top";
    ctx.font = '11px "Segoe UI", system-ui, sans-serif';
    for (let tt = premierMarqueur; tt <= finVisible; tt += pasGrille) {
      const x = Math.round((tt - debutVisible) * zoom);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, hauteurCSS); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      const label = pasGrille >= 1 ? `${tt.toFixed(0)}s` : `${tt.toFixed(pasGrille < 0.1 ? 2 : 1)}s`;
      ctx.fillText(label, x + 4, 3);
    }

    // Ligne centrale
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, hauteurCSS / 2); ctx.lineTo(largeurCSS, hauteurCSS / 2); ctx.stroke();

    // Forme d'onde — min/max par pixel
    const debutEch = Math.max(0, Math.floor(debutVisible * sampleRate));
    const echParPixel = Math.max(1, (finVisible - debutVisible) * sampleRate / largeurCSS);
    const canaux = buffer.numberOfChannels;
    const couleurOnde = "#2a9d8f";
    ctx.strokeStyle = couleurOnde;
    ctx.lineWidth = 1;

    // Pour meilleure qualité, dessiner avec fill pour les zones denses
    const centre = hauteurCSS / 2;
    const amplitude = (hauteurCSS - 6) / 2;
    const barWidth = Math.max(1, echParPixel > 4 ? 1 : echParPixel > 1 ? 2 : 3);

    for (let x = 0; x < largeurCSS; x += barWidth) {
      const dPixel = debutEch + Math.floor(x * echParPixel);
      const fPixel = Math.min(buffer.length, debutEch + Math.floor((x + barWidth) * echParPixel));
      if (dPixel >= buffer.length) break;
      let min = 0, max = 0;
      for (let c = 0; c < canaux; c++) {
        const canal = buffer.getChannelData(c);
        for (let e = dPixel; e < fPixel && e < canal.length; e++) {
          const v = canal[e];
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      const yMin = centre + min * amplitude;
      const yMax = centre + max * amplitude;
      ctx.fillStyle = couleurOnde;
      ctx.fillRect(x, yMin, barWidth, Math.max(1, yMax - yMin));
    }

    // Zones mémorisées
    for (const z of zones) {
      const zx = (z.debut - debutVisible) * zoom;
      const zw = z.duree * zoom;
      if (zx >= largeurCSS || zx + zw <= 0) continue;
      const vx = Math.max(0, zx);
      const vw = Math.min(largeurCSS, zx + zw) - vx;
      ctx.fillStyle = "rgba(63,185,80,0.15)";
      ctx.fillRect(vx, 0, vw, hauteurCSS);
      ctx.strokeStyle = "rgba(63,185,80,0.7)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(vx + 0.5, 0.5, vw - 1, hauteurCSS - 1);
      // Centre
      const cx = (z.debut + z.duree / 2 - debutVisible) * zoom;
      if (cx >= 0 && cx <= largeurCSS) {
        ctx.strokeStyle = "rgba(63,185,80,1)";
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, hauteurCSS); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Sélection en cours
    const sel = selectionRef.current;
    const sx = (sel.debut - debutVisible) * zoom;
    const sw = sel.duree * zoom;
    if (sx < largeurCSS && sx + sw > 0 && sel.duree > 0) {
      const vx = Math.max(0, sx);
      const vw = Math.min(largeurCSS, sx + sw) - vx;
      ctx.fillStyle = "rgba(88,166,255,0.18)";
      ctx.fillRect(vx, 0, vw, hauteurCSS);
      ctx.strokeStyle = "rgba(88,166,255,0.7)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(vx + 0.5, 0.5, vw - 1, hauteurCSS - 1);
    }

    // Barre de progression de lecture (ligne rouge verticale)
    if (isPlaying || playPos > 0) {
      const px = (playPos - debutVisible) * zoom;
      if (px >= 0 && px <= largeurCSS) {
        // Glow
        ctx.shadowColor = "#e76f51";
        ctx.shadowBlur = 6;
        ctx.strokeStyle = "#e76f51";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, hauteurCSS);
        ctx.stroke();
        ctx.shadowBlur = 0;
        // Point en haut
        ctx.fillStyle = "#e76f51";
        ctx.beginPath();
        ctx.arc(px, 6, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  }, [buffer, zones, calculerZoom, isPlaying, playPos]);

  // Fit au chargement
  useEffect(() => {
    if (buffer) {
      setZoomPct(100);
      scrollRef.current = 0;
    }
  }, [buffer]);

  useEffect(() => { dessiner(); }, [dessiner]);

  // Boucle d'animation pour la barre de progression
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      if (audioElRef.current && buffer) {
        const pos = audioElRef.current.currentTime;
        setPlayPos(pos);
        // Auto-scroll si la barre sort de la zone visible
        const zoom = zoomRef.current;
        const largeur = containerRef.current?.clientWidth ?? 0;
        const largeurVisible = largeur / zoom;
        const debutVisible = scrollRef.current;
        const finVisible = debutVisible + largeurVisible;
        if (pos > finVisible - 0.5 || pos < debutVisible) {
          const maxScroll = Math.max(0, buffer.duration - largeurVisible);
          scrollRef.current = Math.max(0, Math.min(maxScroll, pos - largeurVisible * 0.3));
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, buffer, dessiner]);

  // Redessiner au resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => { dessiner(); forceRedraw((v) => v + 1); });
    ro.observe(container);
    return () => ro.disconnect();
  }, [dessiner]);

  // Molette : zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;
    const surMolette = (e: WheelEvent) => {
      e.preventDefault();
      const facteur = e.deltaY > 0 ? 1 / 1.3 : 1.3;
      setZoomPct((z) => Math.max(100, Math.min(50000, Math.round(z * facteur))));
    };
    canvas.addEventListener("wheel", surMolette, { passive: false });
    return () => canvas.removeEventListener("wheel", surMolette);
  }, [buffer]);

  const tempsDepuisX = useCallback((offsetX: number) => {
    if (!buffer) return 0;
    const t = scrollRef.current + offsetX / zoomRef.current;
    return Math.max(0, Math.min(t, buffer.duration));
  }, [buffer]);

  const surPointeurBas = useCallback((e: React.PointerEvent) => {
    if (!buffer) return;
    const t = tempsDepuisX(e.nativeEvent.offsetX);
    const sel = selectionRef.current;
    if (sel.duree > 0 && t >= sel.debut && t <= sel.debut + sel.duree) {
      dragRef.current = { type: "deplacer", debutSec: t - sel.debut };
    } else {
      dragRef.current = { type: "selectionner", debutSec: t };
      selectionRef.current = { debut: t, duree: 0 };
    }
    canvasRef.current?.setPointerCapture(e.pointerId);
    pointerIdRef.current = e.pointerId;
  }, [buffer, tempsDepuisX]);

  const finirPointer = useCallback(() => {
    if (pointerIdRef.current !== null && canvasRef.current) {
      try {
        canvasRef.current.releasePointerCapture(pointerIdRef.current);
      } catch {}
      pointerIdRef.current = null;
    }
    dragRef.current = null;
    setSelAffichee({ ...selectionRef.current });
    dessiner();
  }, [dessiner]);

  const surPointeurDeplacer = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !buffer) return;
    if (e.buttons === 0) {
      finirPointer();
      return;
    }
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
  }, [buffer, tempsDepuisX, dessiner, finirPointer]);

  const surPointeurLeve = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    finirPointer();
  }, [finirPointer]);

  // ── Libération défensive du pointer capture si la fenêtre perd le focus ou
  //    si le navigateur annule le pointer (curseur collé au canvas).
  useEffect(() => {
    const onBlur = () => finirPointer();
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [finirPointer]);

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

  // Barre de défilement
  const zoom = calculerZoom();
  const largeurVisible = buffer ? (containerRef.current?.clientWidth ?? 0) / zoom : 0;
  const dureeTotale = buffer?.duration ?? 0;
  const maxScroll = Math.max(0, dureeTotale - largeurVisible);
  const scrollPct = maxScroll > 0 ? (scrollRef.current / maxScroll) * 100 : 0;
  const thumbPct = maxScroll > 0 ? Math.max(10, (largeurVisible / dureeTotale) * 100) : 100;

  return (
    <div className="attic-node-onde nodrag" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <NodeResizer minWidth={300} minHeight={200} />
      {chargement && <div className="attic-node-onde-attente">{t("onde.chargement")}</div>}
      {!buffer && !chargement && (
        <div className="attic-node-onde-attente">{t("onde.connecterAudio")}</div>
      )}
      <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
        <canvas
          ref={canvasRef}
          onPointerDown={surPointeurBas}
          onPointerMove={surPointeurDeplacer}
          onPointerUp={surPointeurLeve}
          onPointerCancel={surPointeurLeve}
          onLostPointerCapture={surPointeurLeve}
          onClick={(e) => {
            // Clic simple (sans drag) = seek
            if (!buffer || !audioElRef.current) return;
            if (dragRef.current) return; // ne pas seek si on vient de draguer
            const t = tempsDepuisX(e.nativeEvent.offsetX);
            audioElRef.current.currentTime = t;
            setPlayPos(t);
            dessiner();
          }}
          style={{ cursor: "crosshair", display: "block", borderRadius: 4 }}
        />
        {/* Barre de défilement */}
        {buffer && maxScroll > 0 && (
          <div
            className="attic-waveform-scrollbar"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              scrollRef.current = Math.max(0, Math.min(maxScroll, pct * maxScroll));
              dessiner();
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
      {/* Lecteur audio + contrôles */}
      {buffer && audioUrl && (
        <>
          <audio
            ref={audioElRef}
            src={audioUrl}
            onPlay={() => { setIsPlaying(true); }}
            onPause={() => { setIsPlaying(false); dessiner(); }}
            onEnded={() => { setIsPlaying(false); setPlayPos(0); dessiner(); }}
            onLoadedMetadata={() => { if (audioElRef.current) audioElRef.current.currentTime = playPos; }}
            style={{ display: "none" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!audioElRef.current) return;
                if (isPlaying) { audioElRef.current.pause(); }
                else { audioElRef.current.play(); }
              }}
              style={{
                width: 28, height: 28, borderRadius: "50%", border: "none",
                background: isPlaying ? "#e76f51" : "#2a9d8f", color: "#fff",
                cursor: "pointer", fontSize: 14, display: "flex",
                alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
            >{isPlaying ? "❚❚" : "▶"}</button>
            <span style={{ fontSize: 10, color: "var(--text-muted)", flex: 1, fontFamily: "monospace" }}>
              {formatTemps(playPos)} / {formatTemps(buffer.duration)}
            </span>
          </div>
        </>
      )}
      {buffer && (
        <div className="attic-node-onde-infos">
          <span>{selAffichee.duree > 0
            ? `${selAffichee.debut.toFixed(2)}s → ${(selAffichee.debut + selAffichee.duree).toFixed(2)}s (${selAffichee.duree.toFixed(2)}s)`
            : t("zones.glisser")}</span>
          <span>{buffer.duration.toFixed(1)}s · {zoomPct}% zoom</span>
        </div>
      )}
      {/* Slider de zoom */}
      {buffer && (
        <input type="range" min={100} max={5000} step={10} value={zoomPct}
          onChange={(e) => { setZoomPct(Number(e.target.value)); }}
          className="attic-node-zoom-slider"
        />
      )}
      <div className="attic-node-zones">
        <button
          className="attic-node-zones-ajouter"
          onClick={(e) => { e.stopPropagation(); ajouterZone(); }}
          disabled={!buffer || selAffichee.duree <= 0.001}
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
    </div>
  );
}
