// ui/Spectrogramme.tsx — Vue spectrogramme : STFT (FFT glissée) affichée en
// carte 2D temps × fréquence × intensité. Réutilise audio/fft.ts et le patron
// de décodage de FormeOnde.
import { useRef, useState, useEffect, useCallback } from "react";
import { fft } from "../audio/fft";

interface Props {
  audioUrl?: string;
  tailleFFT: number;
  log: boolean;
}

const DB_PLANCHER = -80;

// Couleur pour une intensité normalisée t ∈ [0,1] (noir → teal → jaune clair).
function couleur(t: number): [number, number, number] {
  if (t < 0.5) { const u = t / 0.5; return [13 + u * 29, 17 + u * 140, 23 + u * 120]; } // #0d1117 → #2a9d8f
  const u = (t - 0.5) / 0.5; return [42 + u * 213, 157 + u * 80, 143 - u * 40];         // #2a9d8f → #ffed6f
}

export function Spectrogramme({ audioUrl, tailleFFT, log }: Props) {
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

    const N = tailleFFT, half = N >> 1;
    const sr = buffer.sampleRate, total = buffer.length;
    // Mixage mono
    const mono = new Float64Array(total);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const dc = buffer.getChannelData(c);
      for (let i = 0; i < total; i++) mono[i] += dc[i] / buffer.numberOfChannels;
    }
    const win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    const hop = Math.max(1, Math.floor((total - N) / Math.max(1, largeur))); // ~1 trame/colonne
    const re = new Float64Array(N), im = new Float64Array(N);

    // Pré-calcul des trames (magnitudes en dB, normalisées au pic global)
    const trames: Float32Array[] = [];
    let dbMax = -Infinity;
    for (let start = 0; start + N <= total; start += hop) {
      for (let i = 0; i < N; i++) { re[i] = mono[start + i] * win[i]; im[i] = 0; }
      fft(re, im, false);
      const col = new Float32Array(half);
      for (let k = 0; k < half; k++) {
        const db = 20 * Math.log10(Math.hypot(re[k], im[k]) + 1e-12);
        col[k] = db; if (db > dbMax) dbMax = db;
      }
      trames.push(col);
    }
    if (!trames.length) return;

    const img = cx.createImageData(largeur, hauteur);
    const nyquist = sr / 2, fMin = log ? 20 : 0;
    for (let x = 0; x < largeur; x++) {
      const col = trames[Math.min(trames.length - 1, Math.floor((x / largeur) * trames.length))];
      for (let y = 0; y < hauteur; y++) {
        // y=0 en haut = hautes fréquences
        const frac = 1 - y / hauteur;
        const f = log ? fMin * Math.pow(nyquist / fMin, frac) : fMin + frac * (nyquist - fMin);
        const bin = Math.min(half - 1, Math.max(0, Math.round((f / nyquist) * (half - 1))));
        const db = col[bin] - dbMax; // 0 dB au pic
        const t = Math.max(0, Math.min(1, (db - DB_PLANCHER) / -DB_PLANCHER));
        const [r, g, b] = couleur(t);
        const o = (y * largeur + x) * 4;
        img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
      }
    }
    // ImageData est en pixels CSS ici (on a scale(dpr)), donc on la peint via un
    // canvas intermédiaire à la bonne échelle.
    const tmp = document.createElement("canvas");
    tmp.width = largeur; tmp.height = hauteur;
    tmp.getContext("2d")!.putImageData(img, 0, 0);
    cx.drawImage(tmp, 0, 0, largeur, hauteur);
  }, [buffer, tailleFFT, log]);

  useEffect(() => { dessiner(); }, [dessiner]);

  return (
    <div className="attic-node-onde nodrag" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {chargement && <div className="attic-node-onde-attente">Analyse…</div>}
      {!buffer && !chargement && (
        <div className="attic-node-onde-attente">Connectez une source audio et lancez l'exécution.</div>
      )}
      <canvas ref={canvasRef} className="attic-node-onde-canvas" />
      {buffer && (
        <div className="attic-node-onde-infos">
          <span>FFT {tailleFFT} · {log ? "log" : "lin"}</span>
          <span>{buffer.duration.toFixed(1)}s</span>
        </div>
      )}
    </div>
  );
}
