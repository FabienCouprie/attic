// ui/ReponseFiltre.tsx — Vue « réponse en fréquence » d'un filtre.
// Trace la magnitude (gain en dB) d'un filtre biquadratique (formules RBJ) en
// fonction de la fréquence (axe log). Purement calculée depuis les paramètres :
// s'affiche et se met à jour instantanément, sans exécuter le graphe.
import { useRef, useEffect, useCallback } from "react";

interface Props {
  type: string;      // Passe-bas | Passe-haut | Passe-bande | Coupe-bande
  cutoff: number;    // Hz
  q: number;         // résonance (facteur de qualité)
}

const SR = 44100;
const DB_HAUT = 18, DB_BAS = -48;

// Gain (dB) d'un biquad RBJ à la fréquence f. a0 normalisé à 1.
function reponseDb(type: string, f0: number, Q: number, f: number): number {
  const w0 = (2 * Math.PI * f0) / SR, cw = Math.cos(w0), sw = Math.sin(w0), alpha = sw / (2 * Q);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (type === "Passe-haut") { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  else if (type === "Passe-bande") { b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  else if (type === "Coupe-bande") { b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  else { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; } // Passe-bas
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  const w = (2 * Math.PI * f) / SR, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nRe = b0 + b1 * c1 + b2 * c2, nIm = -(b1 * s1 + b2 * s2);
  const dRe = 1 + a1 * c1 + a2 * c2, dIm = -(a1 * s1 + a2 * s2);
  return 20 * Math.log10(Math.hypot(nRe, nIm) / Math.hypot(dRe, dIm) + 1e-9);
}

function fmtHz(f: number): string {
  return f >= 1000 ? `${(f / 1000).toFixed(f % 1000 === 0 ? 0 : 1)}k` : `${Math.round(f)}`;
}

export function ReponseFiltre({ type, cutoff, q }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const dessiner = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const largeur = canvas.clientWidth, hauteur = canvas.clientHeight;
    if (largeur === 0 || hauteur === 0) return;
    canvas.width = largeur * dpr; canvas.height = hauteur * dpr;
    const cx = canvas.getContext("2d")!;
    cx.scale(dpr, dpr);
    cx.clearRect(0, 0, largeur, hauteur);
    cx.fillStyle = "#0d1117"; cx.fillRect(0, 0, largeur, hauteur);

    const fMin = 20, fMax = SR / 2;
    const freqToX = (f: number) => ((Math.log10(f) - Math.log10(fMin)) / (Math.log10(fMax) - Math.log10(fMin))) * largeur;
    const xToFreq = (x: number) => Math.pow(10, Math.log10(fMin) + (x / largeur) * (Math.log10(fMax) - Math.log10(fMin)));
    const dbToY = (db: number) => hauteur - ((db - DB_BAS) / (DB_HAUT - DB_BAS)) * hauteur;

    // Grille dB
    cx.font = "9px monospace";
    for (let db = DB_HAUT - 6; db > DB_BAS; db -= 12) {
      const y = dbToY(db);
      cx.strokeStyle = db === 0 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.06)";
      cx.beginPath(); cx.moveTo(0, y); cx.lineTo(largeur, y); cx.stroke();
      cx.fillStyle = "rgba(255,255,255,0.3)"; cx.fillText(`${db > 0 ? "+" : ""}${db}`, 2, y - 2);
    }
    // Grille fréquences
    cx.textAlign = "center";
    for (const f of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) {
      const x = freqToX(f);
      cx.strokeStyle = "rgba(255,255,255,0.06)";
      cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, hauteur); cx.stroke();
      cx.fillStyle = "rgba(255,255,255,0.32)"; cx.fillText(fmtHz(f), x, hauteur - 2);
    }
    cx.textAlign = "left";

    // Repère de la fréquence de coupure
    const xc = freqToX(Math.max(fMin, Math.min(fMax, cutoff)));
    cx.strokeStyle = "rgba(233,161,59,0.6)";
    cx.setLineDash([4, 3]);
    cx.beginPath(); cx.moveTo(xc, 0); cx.lineTo(xc, hauteur); cx.stroke();
    cx.setLineDash([]);

    // Courbe de réponse
    cx.beginPath();
    for (let x = 0; x < largeur; x++) {
      const f = xToFreq(x);
      const db = Math.max(DB_BAS, Math.min(DB_HAUT, reponseDb(type, cutoff, q, f)));
      const y = dbToY(db);
      if (x === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
    }
    cx.lineTo(largeur, hauteur); cx.lineTo(0, hauteur); cx.closePath();
    cx.fillStyle = "rgba(42,157,143,0.15)"; cx.fill();
    cx.beginPath();
    for (let x = 0; x < largeur; x++) {
      const f = xToFreq(x);
      const db = Math.max(DB_BAS, Math.min(DB_HAUT, reponseDb(type, cutoff, q, f)));
      const y = dbToY(db);
      if (x === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
    }
    cx.strokeStyle = "#2a9d8f"; cx.lineWidth = 1.4; cx.stroke();
  }, [type, cutoff, q]);

  useEffect(() => { dessiner(); }, [dessiner]);

  return (
    <div className="attic-node-onde nodrag" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <canvas ref={canvasRef} className="attic-node-onde-canvas" />
      <div className="attic-node-onde-infos">
        <span>{type}</span>
        <span>{fmtHz(cutoff)}Hz · Q{q}</span>
      </div>
    </div>
  );
}
