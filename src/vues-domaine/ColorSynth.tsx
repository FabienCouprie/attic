// ui/ColorSynth.tsx — Vue « ColorSynth » : écoute le signal audio et déduit
// une palette de couleurs en temps réel. Le spectre est mappé vers un espace
// colorimétrique : graves = couleurs chaudes (rouge/orange), médiums = vert,
// aigus = couleurs froides (bleu/violet). L'intensité lumineuse = énergie.
// Pédagogique : « voir » le timbre.
import { useRef, useState, useEffect, useCallback } from "react";
import { fft } from "../audio/fft";

interface Props {
  audioUrl?: string;
}

// Spectre moyen → palette de 6 couleurs
function spectreVersPalette(magnitudes: Float64Array, sampleRate: number, fftSize: number): { hex: string; label: string }[] {
  const nbBins = magnitudes.length;
  // Diviser le spectre en 6 bandes
  const bandes = [
    { label: "Sub", fMin: 20, fMax: 120 },
    { label: "Bass", fMin: 120, fMax: 400 },
    { label: "Low-Mid", fMin: 400, fMax: 1200 },
    { label: "Mid", fMin: 1200, fMax: 4000 },
    { label: "High", fMin: 4000, fMax: 12000 },
    { label: "Air", fMin: 12000, fMax: 20000 },
  ];

  // Calculer l'énergie par bande
  const energies = bandes.map(({ fMin, fMax }) => {
    let sum = 0, count = 0;
    for (let b = 1; b < nbBins; b++) {
      const freq = (b * sampleRate) / fftSize;
      if (freq >= fMin && freq < fMax) { sum += magnitudes[b]; count++; }
    }
    return count > 0 ? sum / count : 0;
  });

  // Normaliser
  const maxE = Math.max(...energies, 1e-10);
  const norm = energies.map((e) => e / maxE);

  // Mapper chaque bande vers une couleur
  // Sub/Bass = chaud (rouge → orange), Low-Mid/Mid = vert, High/Air = froid (bleu → violet)
  const couleurs: { hex: string; label: string }[] = [];

  for (let i = 0; i < bandes.length; i++) {
    const e = norm[i]; // 0-1
    const hue = (i / bandes.length) * 280; // 0=rouge, 280=violet
    const sat = 60 + e * 40; // 60-100%
    const light = 20 + e * 50; // 20-70% (sombre si faible énergie)
    const hex = hslVersHex(hue, sat, light);
    couleurs.push({ hex, label: `${bandes[i].label} ${Math.round(e * 100)}%` });
  }

  return couleurs;
}

function hslVersHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export function ColorSynth({ audioUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [palette, setPalette] = useState<{ hex: string; label: string }[] | null>(null);

  const calculer = useCallback(async () => {
    if (!audioUrl) return;
    try {
      const rep = await fetch(audioUrl);
      const buf = await rep.arrayBuffer();
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(buf);
      ctx.close();

      const sr = decoded.sampleRate;
      const N = 4096;
      const mono = new Float64Array(decoded.length);
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const d = decoded.getChannelData(c);
      for (let i = 0; i < decoded.length; i++) mono[i] += d[i] / decoded.numberOfChannels;
    }

      const half = N >> 1;
      const acc = new Float64Array(half);
      const win = new Float64Array(N);
      for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      const re = new Float64Array(N);
      const im = new Float64Array(N);
      const hop = N >> 1;
      let trames = 0;
      for (let start = 0; start + N <= mono.length; start += hop) {
        for (let i = 0; i < N; i++) { re[i] = mono[start + i] * win[i]; im[i] = 0; }
        fft(re, im, false);
        for (let k = 0; k < half; k++) acc[k] += Math.hypot(re[k], im[k]);
        trames++;
      }
      if (trames > 0) for (let k = 0; k < half; k++) acc[k] /= trames;

      const pal = spectreVersPalette(acc, sr, N);
      setPalette(pal);
    } catch {}
  }, [audioUrl]);

  useEffect(() => { calculer(); }, [calculer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (!palette || palette.length === 0) {
      ctx.fillStyle = "#666";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("—", W / 2, H / 2);
      return;
    }

    // 1. Fond noir
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, W, H);

    // 2. Dessiner les 6 bandes avec dégradés verticaux
    const labelH = 22;
    const barH = H - labelH;
    const barW = W / palette.length;

    for (let i = 0; i < palette.length; i++) {
      const x = i * barW;
      const p = palette[i];
      // Extraire l'énergie du label (ex: "Bass 87%" → 87)
      const match = p.label.match(/(\d+)%/);
      const energie = match ? parseInt(match[1]) / 100 : 0.5;

      // Dégradé vertical : plus intense en bas, plus sombre en haut
      const grad = ctx.createLinearGradient(0, 0, 0, barH);
      grad.addColorStop(0, p.hex + "20"); // transparent en haut
      grad.addColorStop(0.3, p.hex + "80");
      grad.addColorStop(0.7, p.hex);
      grad.addColorStop(1, p.hex);
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, barW, barH);

      // Liseré lumineux au niveau de l'énergie
      const glowY = barH - barH * energie;
      const glowH = 3;
      ctx.fillStyle = p.hex;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(x, glowY - glowH / 2, barW, glowH);
      ctx.globalAlpha = 1.0;

      // Glow effect
      const glowGrad = ctx.createLinearGradient(0, glowY - 20, 0, glowY + 20);
      glowGrad.addColorStop(0, "transparent");
      glowGrad.addColorStop(0.5, p.hex + "40");
      glowGrad.addColorStop(1, "transparent");
      ctx.fillStyle = glowGrad;
      ctx.fillRect(x, glowY - 20, barW, 40);
    }

    // 3. Barre de séparation entre couleurs et labels
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(0, barH - 1, W, 1);

    // 4. Labels
    ctx.textAlign = "center";
    for (let i = 0; i < palette.length; i++) {
      const x = i * barW;
      const p = palette[i];
      // Nom de la bande
      ctx.fillStyle = p.hex;
      ctx.font = "bold 9px sans-serif";
      const nom = p.label.split(" ")[0];
      ctx.fillText(nom, x + barW / 2, barH + 10);
      // Pourcentage
      ctx.fillStyle = "#888";
      ctx.font = "8px sans-serif";
      const pct = p.label.split(" ")[1] ?? "";
      ctx.fillText(pct, x + barW / 2, barH + 20);
    }

    // 5. Couleur dominante (en bas à droite)
    let maxE = 0, maxIdx = 0;
    for (let i = 0; i < palette.length; i++) {
      const m = palette[i].label.match(/(\d+)%/);
      const e = m ? parseInt(m[1]) : 0;
      if (e > maxE) { maxE = e; maxIdx = i; }
    }
    if (maxE > 0) {
      ctx.fillStyle = palette[maxIdx].hex;
      ctx.fillRect(W - 4, 0, 4, barH);
    }
  }, [palette]);

  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px" }}>
      <canvas ref={canvasRef} width={480} height={160} style={{ width: "100%", maxWidth: 280, borderRadius: 4 }} />
    </div>
  );
}
