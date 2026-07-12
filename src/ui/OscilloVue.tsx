// ui/OscilloVue.tsx — Vue de l'oscillateur pédagogique : deux panneaux.
// Haut : quelques périodes de la forme d'onde (le « geste »). Bas : barres des
// harmoniques (le « timbre »). Montre le lien onde ↔ spectre. Réutilise fft.ts.
import { useRef, useState, useEffect, useCallback } from "react";
import { fft } from "../audio/fft";

interface Props {
  audioUrl?: string;
  frequence: number; // fondamentale (Hz) — cadre l'onde et l'espacement des harmoniques
}

const N_HARMONIQUES = 20;

export function OscilloVue({ audioUrl, frequence }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
      } catch { if (!annule) setBuffer(null); }
      finally { if (!annule) setChargement(false); }
    })();
    return () => { annule = true; };
  }, [audioUrl]);

  const dessiner = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;
    const dpr = window.devicePixelRatio || 1;
    const largeur = canvas.clientWidth, hauteur = canvas.clientHeight;
    if (largeur === 0 || hauteur === 0) return;
    canvas.width = largeur * dpr; canvas.height = hauteur * dpr;
    const cx = canvas.getContext("2d")!;
    cx.scale(dpr, dpr);
    cx.clearRect(0, 0, largeur, hauteur);
    cx.fillStyle = "#0d1117"; cx.fillRect(0, 0, largeur, hauteur);

    const sr = buffer.sampleRate;
    const data = buffer.getChannelData(0);
    const hautOnde = Math.floor(hauteur * 0.5);
    const hautSpectre = hauteur - hautOnde;

    // ── Panneau haut : ~4 périodes de l'onde ──
    const periodes = 4;
    const ech = Math.min(data.length, Math.max(8, Math.floor((periodes * sr) / Math.max(1, frequence))));
    const debut = Math.floor((data.length - ech) / 2); // milieu (après le fondu)
    cx.strokeStyle = "rgba(255,255,255,0.1)";
    cx.beginPath(); cx.moveTo(0, hautOnde / 2); cx.lineTo(largeur, hautOnde / 2); cx.stroke();
    cx.strokeStyle = "#2a9d8f"; cx.lineWidth = 1.4;
    cx.beginPath();
    for (let x = 0; x < largeur; x++) {
      const idx = debut + Math.floor((x / largeur) * ech);
      const v = data[Math.min(data.length - 1, Math.max(0, idx))];
      const y = hautOnde / 2 - v * (hautOnde / 2 - 4);
      if (x === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
    }
    cx.stroke();

    // Séparateur
    cx.strokeStyle = "rgba(255,255,255,0.12)";
    cx.beginPath(); cx.moveTo(0, hautOnde); cx.lineTo(largeur, hautOnde); cx.stroke();

    // ── Panneau bas : barres d'harmoniques ──
    // Une FFT sur une fenêtre puissance de 2 ; magnitude au bin de chaque harmonique.
    let N = 8192; while (N > data.length && N > 256) N >>= 1;
    const N2 = N;
    const re = new Float64Array(N2), im = new Float64Array(N2);
    const off = Math.floor((data.length - N2) / 2);
    for (let i = 0; i < N2; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N2 - 1));
      re[i] = (data[off + i] ?? 0) * w; im[i] = 0;
    }
    fft(re, im, false);
    const binHz = sr / N2;
    const mags: number[] = [];
    let magMax = 1e-12;
    for (let h = 1; h <= N_HARMONIQUES; h++) {
      const bin = Math.round((h * frequence) / binHz);
      let m = 0;
      for (let b = bin - 1; b <= bin + 1; b++) if (b > 0 && b < N2 / 2) m = Math.max(m, Math.hypot(re[b], im[b]));
      mags.push(m); if (m > magMax) magMax = m;
    }
    const bas = hauteur - 12;
    const hSpec = hautSpectre - 20;
    const larBarre = largeur / N_HARMONIQUES;
    cx.font = "8px monospace";
    cx.textAlign = "center";
    for (let h = 1; h <= N_HARMONIQUES; h++) {
      const t = mags[h - 1] / magMax; // 0..1 (fondamentale ou pic = pleine hauteur)
      const hb = Math.max(0, t) * hSpec;
      const x = (h - 0.5) * larBarre;
      cx.fillStyle = h === 1 ? "#e9a13b" : "#2a9d8f";
      cx.fillRect(x - larBarre * 0.32, bas - hb, larBarre * 0.64, hb);
      if (h === 1 || h % 2 === 0 || N_HARMONIQUES <= 12) {
        cx.fillStyle = "rgba(255,255,255,0.35)";
        cx.fillText(`${h}`, x, bas + 9);
      }
    }
    cx.textAlign = "left";
  }, [buffer, frequence]);

  useEffect(() => { dessiner(); }, [dessiner]);

  return (
    <div className="attic-node-onde nodrag" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {chargement && <div className="attic-node-onde-attente">Analyse…</div>}
      {!buffer && !chargement && (
        <div className="attic-node-onde-attente">Lancez l'exécution pour générer et visualiser le son.</div>
      )}
      <canvas ref={canvasRef} className="attic-node-onde-canvas" />
      {buffer && (
        <div className="attic-node-onde-infos">
          <span>onde (haut) · harmoniques (bas)</span>
          <span>{Math.round(frequence)} Hz</span>
        </div>
      )}
    </div>
  );
}
