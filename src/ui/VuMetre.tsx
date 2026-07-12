// ui/VuMetre.tsx — Vue VU-mètre / LUFS : affiche les mesures de niveau
// (RMS, peak, true peak, LUFS) sous forme de bargraphes + texte séparé.
// Haute résolution (DPR), texte HTML (pas canvas) pour la lisibilité.
import { useRef, useState, useEffect, useCallback } from "react";
import { mesurerNiveau, type MesuresNiveau } from "../audio";

interface Props {
  audioUrl?: string;
}

export function VuMetre({ audioUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mesures, setMesures] = useState<MesuresNiveau | null>(null);

  const calculer = useCallback(async () => {
    if (!audioUrl) return;
    try {
      const rep = await fetch(audioUrl);
      const buf = await rep.arrayBuffer();
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(buf);
      ctx.close();
      setMesures(mesurerNiveau(decoded));
    } catch {}
  }, [audioUrl]);

  useEffect(() => { calculer(); }, [calculer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mesures) return;
    const container = containerRef.current;
    if (!container) return;

    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const largeurCSS = container.clientWidth - 8;
    const hauteurCSS = 160;
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

    const W = largeurCSS;
    const H = hauteurCSS;

    // Fond
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, W, H);

    const bargraphes = [
      { label: "RMS", db: mesures.rmsDb, min: -60, max: 0, couleur: "#2a9d8f" },
      { label: "Peak", db: mesures.peakDb, min: -60, max: 0, couleur: "#e9a13b" },
      { label: "True Peak", db: mesures.vraiPicDb, min: -60, max: 0, couleur: "#e76f51" },
      { label: "LUFS", db: mesures.lufs, min: -40, max: 0, couleur: "#8e6fce" },
    ];

    const barW = 44;
    const gap = 16;
    const totalW = bargraphes.length * barW + (bargraphes.length - 1) * gap;
    const startX = Math.max(28, (W - totalW) / 2);
    const margeH = 8;
    const margeB = 28;
    const barH = H - margeH - margeB;

    for (let i = 0; i < bargraphes.length; i++) {
      const x = startX + i * (barW + gap);
      const b = bargraphes[i];

      // Fond
      ctx.fillStyle = "#161b22";
      ctx.fillRect(x, margeH, barW, barH);

      // Zone rouge (haut, -6 à 0)
      const redH = barH * (6 / (b.max - b.min));
      ctx.fillStyle = "rgba(231,111,81,0.12)";
      ctx.fillRect(x, margeH, barW, redH);

      // Zone jaune (-12 à -6)
      const yellowH = barH * (6 / (b.max - b.min));
      ctx.fillStyle = "rgba(233,161,59,0.08)";
      ctx.fillRect(x, margeH + redH, barW, yellowH);

      // Niveau
      const ratio = Math.max(0, Math.min(1, (b.db - b.min) / (b.max - b.min)));
      const fillH = barH * ratio;
      const fillY = margeH + barH - fillH;
      const grad = ctx.createLinearGradient(0, margeH + barH, 0, margeH);
      grad.addColorStop(0, b.couleur);
      grad.addColorStop(0.7, b.couleur);
      grad.addColorStop(0.85, "#e9a13b");
      grad.addColorStop(1, "#e76f51");
      ctx.fillStyle = grad;
      ctx.fillRect(x, fillY, barW, fillH);

      // Liseré lumineux au niveau
      ctx.fillStyle = b.couleur;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(x, fillY - 2, barW, 2);
      ctx.globalAlpha = 1;

      // Glow
      const glowGrad = ctx.createLinearGradient(0, fillY - 16, 0, fillY + 16);
      glowGrad.addColorStop(0, "transparent");
      glowGrad.addColorStop(0.5, b.couleur + "30");
      glowGrad.addColorStop(1, "transparent");
      ctx.fillStyle = glowGrad;
      ctx.fillRect(x, fillY - 16, barW, 32);

      // Bordure
      ctx.strokeStyle = "#30363d";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, margeH + 0.5, barW - 1, barH - 1);

      // Graduations (ticks)
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = '9px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let db = b.min; db <= b.max; db += 6) {
        const y = margeH + barH - barH * ((db - b.min) / (b.max - b.min));
        ctx.beginPath();
        ctx.moveTo(x - 3, y);
        ctx.lineTo(x, y);
        ctx.stroke();
        if (db % 12 === 0) ctx.fillText(`${db}`, x - 5, y);
      }

      // Label sous le bargraphe
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = b.couleur;
      ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(b.label, x + barW / 2, margeH + barH + 4);
    }
  }, [mesures]);

  // Format
  const fmt = (v: number, ok: boolean) => ok && v > -119 ? v.toFixed(1) : "—";

  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px" }}>
      <div ref={containerRef} style={{ width: "100%" }}>
        <canvas ref={canvasRef} style={{ display: "block", borderRadius: 4 }} />
      </div>
      {mesures && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 12px", marginTop: 6, fontSize: 11, fontFamily: '"Segoe UI", system-ui, sans-serif' }}>
          <div style={{ color: "var(--text-secondary)" }}>Crest factor</div>
          <div style={{ color: "#e9a13b", textAlign: "right", fontWeight: 600 }}>{fmt(mesures.crestFactorDb, true)} dB</div>
          <div style={{ color: "var(--text-secondary)" }}>Plage dyn. (LRA)</div>
          <div style={{ color: "#8e6fce", textAlign: "right", fontWeight: 600 }}>{fmt(mesures.plageDynamiqueDb, true)} dB</div>
          <div style={{ color: "var(--text-secondary)" }}>LUFS max</div>
          <div style={{ color: "#e76f51", textAlign: "right", fontWeight: 600 }}>{fmt(mesures.lufsMax, mesures.lufsMax > -119)} LUFS</div>
          <div style={{ color: "var(--text-secondary)" }}>LUFS min</div>
          <div style={{ color: "#2a9d8f", textAlign: "right", fontWeight: 600 }}>{fmt(mesures.lufsMin, mesures.lufsMin > -119)} LUFS</div>
        </div>
      )}
    </div>
  );
}
