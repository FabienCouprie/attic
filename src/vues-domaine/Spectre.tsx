// ui/Spectre.tsx — Canvas d'analyseur de spectre (FFT).
// Haute résolution (DPR), gradient de remplissage, grille nette, police système.
import { useRef, useState, useEffect, useCallback } from "react";
import { fft } from "../audio/fft";
import { useI18n } from "../i18n";

interface Props {
  audioUrl?: string;
  tailleFFT: number;
  log: boolean;
}

const DB_PLANCHER = -90;

function calculerSpectre(buffer: AudioBuffer, N: number): Float32Array {
  const total = buffer.length;
  const nCh = buffer.numberOfChannels;
  const mono = new Float64Array(total);
  for (let c = 0; c < nCh; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < total; i++) mono[i] += d[i] / nCh;
  }
  const half = N >> 1;
  const acc = new Float64Array(half);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const hop = N >> 1;
  let trames = 0;
  for (let start = 0; start + N <= total; start += hop) {
    for (let i = 0; i < N; i++) { re[i] = mono[start + i] * win[i]; im[i] = 0; }
    fft(re, im, false);
    for (let k = 0; k < half; k++) acc[k] += Math.hypot(re[k], im[k]);
    trames++;
  }
  if (trames === 0) {
    for (let i = 0; i < N; i++) { re[i] = (i < total ? mono[i] : 0) * win[i]; im[i] = 0; }
    fft(re, im, false);
    for (let k = 0; k < half; k++) acc[k] = Math.hypot(re[k], im[k]);
    trames = 1;
  }
  const mags = new Float32Array(half);
  for (let k = 0; k < half; k++) mags[k] = acc[k] / trames;
  return mags;
}

function fmtHz(f: number): string {
  return f >= 1000 ? `${(f / 1000).toFixed(f % 1000 === 0 ? 0 : 1)}k` : `${Math.round(f)}`;
}

export function SpectreFFT({ audioUrl, tailleFFT, log }: Props) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [chargement, setChargement] = useState(false);

  useEffect(() => {
    if (!audioUrl) { setBuffer(null); return; }
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

  const dessiner = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !buffer || !container) return;

    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const largeurCSS = Math.max(1, container.clientWidth - 8);
    const hauteurCSS = 180;
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
    const N = tailleFFT;
    const sr = buffer.sampleRate;
    const mags = calculerSpectre(buffer, N);
    const half = mags.length;
    const nyquist = sr / 2;
    const binHz = sr / N;

    let magMax = 1e-12;
    for (let k = 1; k < half; k++) if (mags[k] > magMax) magMax = mags[k];
    const magToY = (mag: number) => {
      const db = 20 * Math.log10(mag / magMax);
      const clamp = Math.max(DB_PLANCHER, Math.min(0, db));
      return H - ((clamp - DB_PLANCHER) / -DB_PLANCHER) * H;
    };

    const fMin = log ? 20 : 0;
    const fMax = nyquist;
    const freqToX = (f: number) => {
      if (log) {
        const lf = Math.log10(Math.max(fMin, f));
        return ((lf - Math.log10(fMin)) / (Math.log10(fMax) - Math.log10(fMin))) * W;
      }
      return ((f - fMin) / (fMax - fMin)) * W;
    };
    const xToFreq = (x: number) => {
      if (log) {
        const lf = Math.log10(fMin) + (x / W) * (Math.log10(fMax) - Math.log10(fMin));
        return Math.pow(10, lf);
      }
      return fMin + (x / W) * (fMax - fMin);
    };

    // Fond
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, W, H);

    // Grille dB (horizontale) — labels à gauche
    ctx.font = '9px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (let db = 0; db >= DB_PLANCHER; db -= 10) {
      const y = H - ((db - DB_PLANCHER) / -DB_PLANCHER) * H;
      ctx.strokeStyle = db === 0 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
      if (db % 20 === 0 && db < 0) {
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillText(`${db}`, 3, y);
      }
    }

    // Grille fréquences (verticale) — labels en bas
    const reperes = log
      ? [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
      : [1000, 2000, 5000, 10000, 15000, 20000];
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    for (const f of reperes) {
      if (f < fMin || f > fMax) continue;
      const x = freqToX(f);
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillText(fmtHz(f), x, H - 2);
    }

    // Calculer les points du spectre une seule fois
    const points: number[] = [];
    for (let x = 0; x < W; x++) {
      const f0 = xToFreq(x);
      const f1 = xToFreq(x + 1);
      let b0 = Math.max(1, Math.floor(f0 / binHz));
      let b1 = Math.min(half - 1, Math.ceil(f1 / binHz));
      if (b1 < b0) b1 = b0;
      let m = 0;
      for (let b = b0; b <= b1; b++) if (mags[b] > m) m = mags[b];
      points.push(magToY(m || 1e-12));
    }

    // Remplissage sous la courbe avec gradient vertical
    const fillGrad = ctx.createLinearGradient(0, 0, 0, H);
    fillGrad.addColorStop(0, "rgba(42,157,143,0.4)");
    fillGrad.addColorStop(0.5, "rgba(42,157,143,0.15)");
    fillGrad.addColorStop(1, "rgba(42,157,143,0.02)");
    ctx.fillStyle = fillGrad;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x < W; x++) ctx.lineTo(x, points[x]);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    // Courbe de spectre — trait avec anti-aliasing
    ctx.strokeStyle = "#2a9d8f";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      if (x === 0) ctx.moveTo(x, points[x]);
      else ctx.lineTo(x, points[x]);
    }
    ctx.stroke();

    // Glow sous la courbe (deuxième passage, plus épais et transparent)
    ctx.strokeStyle = "rgba(42,157,143,0.25)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      if (x === 0) ctx.moveTo(x, points[x]);
      else ctx.lineTo(x, points[x]);
    }
    ctx.stroke();

  }, [buffer, tailleFFT, log]);

  useEffect(() => { dessiner(); }, [dessiner]);

  // Redessiner au resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => dessiner());
    ro.observe(container);
    return () => ro.disconnect();
  }, [dessiner]);

  return (
    <div className="attic-node-onde nodrag" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {chargement && <div className="attic-node-onde-attente">{t("onde.analyse")}</div>}
      {!buffer && !chargement && (
        <div className="attic-node-onde-attente">{t("onde.connecterAudio")}</div>
      )}
      <div ref={containerRef} style={{ width: "100%" }}>
        <canvas ref={canvasRef} style={{ display: "block", borderRadius: 4 }} />
      </div>
      {buffer && (
        <div className="attic-node-onde-infos">
          <span>FFT {tailleFFT} · {log ? "log" : "lin"}</span>
          <span>{Math.round(buffer.sampleRate / 2 / 1000)} kHz</span>
        </div>
      )}
    </div>
  );
}
