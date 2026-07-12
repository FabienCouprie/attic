// ui/EnveloppeADSR.tsx — Dessine la courbe d'enveloppe ADSR depuis les paramètres.
// Schéma pédagogique : A/D/R proportionnels à leurs durées (ms), maintien à
// largeur fixe. Se met à jour instantanément quand on règle les curseurs.
import { useRef, useEffect, useCallback } from "react";

interface Props {
  attaque: number; declin: number; maintien: number; relachement: number; // ms, ms, %, ms
}

const SUSTAIN_VIS = 400; // largeur visuelle (ms) du maintien

export function EnveloppeADSR({ attaque, declin, maintien, relachement }: Props) {
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

    const padL = 6, padR = 6, padT = 12, padB = 18;
    const w = largeur - padL - padR, h = hauteur - padT - padB;
    const S = Math.max(0, Math.min(1, maintien / 100));
    const A = Math.max(0, attaque), De = Math.max(0, declin), R = Math.max(0, relachement);
    const total = A + De + SUSTAIN_VIS + R || 1;
    const X = (ms: number) => padL + (ms / total) * w;
    const Y = (niv: number) => padT + (1 - niv) * h;

    const tA = A, tD = A + De, tS = A + De + SUSTAIN_VIS, tR = tS + R;
    const pts: [number, number][] = [[0, 0], [tA, 1], [tD, S], [tS, S], [tR, 0]];

    // Repères horizontaux (max, sustain, 0)
    cx.font = "9px monospace"; cx.textAlign = "left";
    for (const [niv, lab] of [[1, "max"], [S, "S"], [0, "0"]] as [number, string][]) {
      const y = Y(niv);
      cx.strokeStyle = "rgba(255,255,255,0.07)";
      cx.beginPath(); cx.moveTo(padL, y); cx.lineTo(largeur - padR, y); cx.stroke();
      cx.fillStyle = "rgba(255,255,255,0.3)"; cx.fillText(lab, largeur - padR - 22, y - 2);
    }

    // Aire + courbe
    cx.beginPath(); cx.moveTo(X(pts[0][0]), Y(pts[0][1]));
    for (const [t, v] of pts) cx.lineTo(X(t), Y(v));
    cx.lineTo(X(tR), Y(0)); cx.lineTo(X(0), Y(0)); cx.closePath();
    cx.fillStyle = "rgba(42,157,143,0.18)"; cx.fill();
    cx.beginPath(); cx.moveTo(X(pts[0][0]), Y(pts[0][1]));
    for (const [t, v] of pts) cx.lineTo(X(t), Y(v));
    cx.strokeStyle = "#2a9d8f"; cx.lineWidth = 1.6; cx.stroke();

    // Bornes de phases + libellés A D S R
    cx.textAlign = "center";
    const phases: [number, number, string, string][] = [
      [0, tA, "A", `${Math.round(A)}ms`],
      [tA, tD, "D", `${Math.round(De)}ms`],
      [tD, tS, "S", `${Math.round(S * 100)}%`],
      [tS, tR, "R", `${Math.round(R)}ms`],
    ];
    for (const [t0, t1, lab, val] of phases) {
      const xm = (X(t0) + X(t1)) / 2;
      cx.strokeStyle = "rgba(255,255,255,0.12)"; cx.setLineDash([2, 2]);
      cx.beginPath(); cx.moveTo(X(t1), padT); cx.lineTo(X(t1), hauteur - padB); cx.stroke(); cx.setLineDash([]);
      cx.fillStyle = "#2a9d8f"; cx.font = "bold 10px monospace"; cx.fillText(lab, xm, hauteur - 8);
      cx.fillStyle = "rgba(255,255,255,0.4)"; cx.font = "8px monospace"; cx.fillText(val, xm, hauteur - 0.5);
    }
    cx.textAlign = "left";
  }, [attaque, declin, maintien, relachement]);

  useEffect(() => { dessiner(); }, [dessiner]);

  return (
    <div className="attic-node-onde nodrag" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <canvas ref={canvasRef} className="attic-node-onde-canvas" />
    </div>
  );
}
