// ui/ReponseFiltre.tsx — Vue « réponse en fréquence » d'un filtre.
// Trace la magnitude (gain en dB) d'un filtre biquadratique (formules RBJ) en
// fonction de la fréquence (axe log). Purement calculée depuis les paramètres :
// s'affiche et se met à jour instantanément, sans exécuter le graphe.
//
// QUAND UN RÉGLAGE EST MODULÉ, LE FILTRE N'A PLUS UNE RÉPONSE MAIS UNE PAR INSTANT, et c'est une
// ENVELOPPE que l'on trace : les deux bornes de ce qu'il traverse, et la bande entre elles. Relevé
// par Fabien. Le calcul et son enveloppe vivent dans `reponse-filtre-calcul.ts`, où des tests les
// atteignent ; il ne reste ici que le dessin.
import { useRef, useEffect, useCallback } from "react";
import { SR, enveloppeReponse, fmtHz, legendePlage, type Plage } from "./reponse-filtre-calcul";

interface Props {
  type: string;      // Passe-bas | Passe-haut | Passe-bande | Coupe-bande
  cutoff: number;    // Hz
  q: number;         // résonance (facteur de qualité)
  /** La plage que la coupure traverse quand une courbe la pilote. Absente : elle ne bouge pas. */
  plageCoupure?: Plage;
  /** De même pour la résonance. */
  plageQ?: Plage;
}

const DB_HAUT = 18, DB_BAS = -48;

export function ReponseFiltre({ type, cutoff, q, plageCoupure, plageQ }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Sans plage donnée, le réglage ne bouge pas : la plage se referme sur lui, et tout ce qui suit
  // retombe exactement sur le tracé d'avant.
  const coupure: Plage = plageCoupure ?? { min: cutoff, max: cutoff };
  const resonance: Plage = plageQ ?? { min: q, max: q };

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

    // LES REPÈRES DE COUPURE : un seul si elle ne bouge pas, les deux bornes si une courbe la
    // balaie. Ce sont eux qui disent d'un coup d'œil OÙ le filtre voyage.
    const repere = (f: number) => {
      const xc = freqToX(Math.max(fMin, Math.min(fMax, f)));
      cx.beginPath(); cx.moveTo(xc, 0); cx.lineTo(xc, hauteur); cx.stroke();
    };
    cx.strokeStyle = "rgba(233,161,59,0.6)";
    cx.setLineDash([4, 3]);
    if (coupure.min === coupure.max) repere(coupure.min);
    else { repere(coupure.min); repere(coupure.max); }
    cx.setLineDash([]);

    /** L'enveloppe de la réponse à chaque abscisse : bornée au cadre, du bas vers le haut. */
    const borne = (db: number) => dbToY(Math.max(DB_BAS, Math.min(DB_HAUT, db)));
    const colonnes: { bas: number; haut: number }[] = [];
    for (let x = 0; x < largeur; x++) {
      const e = enveloppeReponse(type, coupure, resonance, xToFreq(x));
      colonnes.push({ bas: borne(e.min), haut: borne(e.max) });
    }

    // La surface sous la réponse : sous son BORD HAUT, ce qui garde exactement le remplissage
    // d'un filtre non modulé, les deux bords s'y confondant.
    cx.beginPath();
    colonnes.forEach((c, x) => (x === 0 ? cx.moveTo(x, c.haut) : cx.lineTo(x, c.haut)));
    cx.lineTo(largeur, hauteur); cx.lineTo(0, hauteur); cx.closePath();
    cx.fillStyle = "rgba(42,157,143,0.15)"; cx.fill();

    // LA BANDE ENTRE LES DEUX BORDS, quand ils diffèrent : c'est l'étendue de ce que le filtre
    // fait entendre au cours du balayage, et elle ne paraît que s'il y a un balayage.
    const balaie = coupure.min !== coupure.max || resonance.min !== resonance.max;
    if (balaie) {
      cx.beginPath();
      colonnes.forEach((c, x) => (x === 0 ? cx.moveTo(x, c.haut) : cx.lineTo(x, c.haut)));
      for (let x = colonnes.length - 1; x >= 0; x--) cx.lineTo(x, colonnes[x].bas);
      cx.closePath();
      cx.fillStyle = "rgba(42,157,143,0.22)"; cx.fill();
    }

    // Les bords : le haut toujours, le bas seulement s'il se distingue.
    const tracer = (quel: "bas" | "haut", largeurTrait: number) => {
      cx.beginPath();
      colonnes.forEach((c, x) => (x === 0 ? cx.moveTo(x, c[quel]) : cx.lineTo(x, c[quel])));
      cx.strokeStyle = "#2a9d8f"; cx.lineWidth = largeurTrait; cx.stroke();
    };
    if (balaie) tracer("bas", 1);
    tracer("haut", 1.4);
  }, [type, coupure.min, coupure.max, resonance.min, resonance.max]);

  useEffect(() => { dessiner(); }, [dessiner]);

  return (
    <div className="attic-node-onde nodrag" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <canvas ref={canvasRef} className="attic-node-onde-canvas" />
      {/* LA LÉGENDE DIT CE QUE LE TRACÉ MONTRE : une valeur quand le réglage ne bouge pas, les deux
          bornes quand une courbe le balaie. Elle affichait la coupure au repos même sous
          modulation, et annonçait donc un filtre qui n'existait pas. */}
      <div className="attic-node-onde-infos">
        <span>{type}</span>
        <span>{legendePlage(coupure, fmtHz)}Hz · Q{legendePlage(resonance, (v) => String(v))}</span>
      </div>
    </div>
  );
}
