// ui/PochetteGen.tsx — Générateur procédural de pochettes d'album.
// Synthèse par canvas : dégradés, formes géométriques, motifs, grain,
// typographie du titre. Le style et les couleurs sont déduits du prompt.
// Fonctionne hors-ligne, instantané, sans GPU.
import { useRef, useState, useEffect, useCallback } from "react";

interface Props {
  prompt: string;
  titre: string;
  artiste: string;
  style: string;
  graine: number;
  onImageGeneree?: (dataUrl: string) => void;
}

// PRNG déterministe (mulberry32)
function mulberry32(graine: number): () => number {
  let a = graine | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Déduire une palette de couleurs depuis le prompt
function paletteDepuisPrompt(prompt: string, rng: () => number): string[] {
  const texte = prompt.toLowerCase();
  const palettes: { mots: string[]; couleurs: string[] }[] = [
    { mots: ["feu", "rouge", "passion", "colere", "rock", "metal", "energie"], couleurs: ["#e63946", "#f4a261", "#1a1a2e"] },
    { mots: ["eau", "bleu", "mer", "ocean", "froid", "triste", "melancolie", "ambient", "blues"], couleurs: ["#0d1b2a", "#1b4965", "#5fa8d3"] },
    { mots: ["nature", "vert", "foret", "jardin", "folk", "acoustic"], couleurs: ["#1b4332", "#2d6a4f", "#95d5b2"] },
    { mots: ["nuit", "noir", "dark", "sombre", "electro", "techno", "industriel"], couleurs: ["#0a0a0a", "#1a1a2e", "#e94560"] },
    { mots: ["jour", "jaune", "soleil", "lumiere", "pop", "happy", "ete"], couleurs: ["#f9c80e", "#f86624", "#ea3546"] },
    { mots: ["violet", "reve", "mystere", "psychedelique", "ambient", "dream"], couleurs: ["#2d1b69", "#6c5ce7", "#a29bfe"] },
    { mots: ["rose", "amour", "romance", "doux", "pop"], couleurs: ["#ff006e", "#fb5607", "#ffbe0b"] },
    { mots: ["monochrome", "minimal", "blanc", "noir", "classique"], couleurs: ["#0d0d0d", "#f5f5f5", "#888888"] },
    { mots: ["terre", "marron", "vintage", "retro", "country", "warm"], couleurs: ["#8b5a2b", "#d4a574", "#3e2723"] },
  ];

  for (const p of palettes) {
    for (const mot of p.mots) {
      if (texte.includes(mot)) return p.couleurs;
    }
  }

  // Palette aléatoire si rien reconnu
  const hue = Math.floor(rng() * 360);
  return [
    `hsl(${hue}, 70%, 15%)`,
    `hsl(${(hue + 40) % 360}, 65%, 45%)`,
    `hsl(${(hue + 80) % 360}, 60%, 65%)`,
  ];
}

type StylePochette = "minimaliste" | "geometrique" | "vagues" | "grain" | "concentrique" | "bauhaus";

function genererPochette(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  prompt: string, titre: string, artiste: string,
  style: string, graine: number,
): void {
  const rng = mulberry32(graine > 0 ? graine : Math.floor(Math.random() * 99999) + 1);
  const palette = paletteDepuisPrompt(prompt, rng);
  const [c1, c2, c3] = palette;
  const styleType = style as StylePochette;

  // 1. Fond
  if (styleType === "grain") {
    // Fond uni + grain
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, W, H);
    // Grain
    const grainDensity = 0.08;
    for (let i = 0; i < W * H * grainDensity; i++) {
      const x = Math.floor(rng() * W);
      const y = Math.floor(rng() * H);
      const a = rng() * 0.15;
      ctx.fillStyle = rng() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      ctx.fillRect(x, y, 1, 1);
    }
  } else if (styleType === "concentrique") {
    // Cercles concentriques
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const maxR = Math.sqrt(cx * cx + cy * cy);
    const nbCercles = 12 + Math.floor(rng() * 8);
    for (let i = nbCercles; i >= 0; i--) {
      const r = (i / nbCercles) * maxR;
      const t = i / nbCercles;
      ctx.fillStyle = t < 0.5 ? c1 : (t < 0.8 ? c2 : c3);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (styleType === "vagues") {
    // Vagues horizontales
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    for (let v = 0; v < 5; v++) {
      ctx.fillStyle = `rgba(${hexVersRgb(c3)},${0.1 + v * 0.05})`;
      ctx.beginPath();
      const baseY = H * (0.3 + v * 0.15);
      const amp = 20 + rng() * 40;
      ctx.moveTo(0, baseY);
      for (let x = 0; x <= W; x += 5) {
        ctx.lineTo(x, baseY + Math.sin(x * 0.02 + v + rng()) * amp);
      }
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.fill();
    }
  } else if (styleType === "bauhaus") {
    // Formes géométriques bauhaus
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, W, H);
    const nbFormes = 4 + Math.floor(rng() * 3);
    for (let i = 0; i < nbFormes; i++) {
      const couleur = [c2, c3, c1][Math.floor(rng() * 3)];
      ctx.fillStyle = couleur;
      const type = Math.floor(rng() * 3);
      const cx = rng() * W;
      const cy = rng() * H;
      const taille = 80 + rng() * 200;
      if (type === 0) {
        // Cercle
        ctx.beginPath();
        ctx.arc(cx, cy, taille / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (type === 1) {
        // Rectangle
        ctx.fillRect(cx - taille / 2, cy - taille / 2, taille, taille * (0.5 + rng()));
      } else {
        // Triangle
        ctx.beginPath();
        ctx.moveTo(cx, cy - taille / 2);
        ctx.lineTo(cx - taille / 2, cy + taille / 2);
        ctx.lineTo(cx + taille / 2, cy + taille / 2);
        ctx.fill();
      }
    }
  } else if (styleType === "geometrique") {
    // Grille de formes
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, W, H);
    const cellW = W / (4 + Math.floor(rng() * 3));
    const cellH = H / (4 + Math.floor(rng() * 3));
    for (let gy = 0; gy * cellH < H; gy++) {
      for (let gx = 0; gx * cellW < W; gx++) {
        if (rng() < 0.4) {
          ctx.fillStyle = rng() < 0.5 ? c2 : c3;
          ctx.fillRect(gx * cellW, gy * cellH, cellW, cellH);
        }
      }
    }
  } else {
    // minimaliste : dégradé diagonal simple
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, c1);
    grad.addColorStop(0.5, c2);
    grad.addColorStop(1, c1);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // 2. Grain subtil (tous les styles sauf "grain" qui l'a déjà)
  if (styleType !== "grain") {
    for (let i = 0; i < W * H * 0.03; i++) {
      const x = Math.floor(rng() * W);
      const y = Math.floor(rng() * H);
      ctx.fillStyle = `rgba(255,255,255,${rng() * 0.04})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // 3. Vignette
  const vignette = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
  vignette.addColorStop(0, "transparent");
  vignette.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // 4. Titre + artiste
  if (titre) {
    const titreY = artiste ? H * 0.55 : H * 0.5;
    // Ombre
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    // Titre
    const fontSize = Math.max(24, Math.min(48, W / titre.length * 1.8));
    ctx.font = `bold ${fontSize}px Georgia, serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Retour à la ligne si titre long
    if (titre.length > 20) {
      const mots = titre.split(" ");
      const mid = Math.ceil(mots.length / 2);
      ctx.fillText(mots.slice(0, mid).join(" "), W / 2, titreY - fontSize * 0.6);
      ctx.fillText(mots.slice(mid).join(" "), W / 2, titreY + fontSize * 0.6);
    } else {
      ctx.fillText(titre, W / 2, titreY);
    }
    // Artiste
    if (artiste) {
      ctx.font = `${Math.max(14, fontSize * 0.4)}px sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(artiste, W / 2, titreY + fontSize * 0.9);
    }
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
}

function hexVersRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}

export function PochetteGen({ prompt, titre, artiste, style, graine, onImageGeneree }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  const generer = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    genererPochette(ctx, W, H, prompt, titre, artiste, style, graine);
    const url = canvas.toDataURL("image/png");
    setDataUrl(url);
    onImageGeneree?.(url);
  }, [prompt, titre, artiste, style, graine, onImageGeneree]);

  useEffect(() => { generer(); }, [generer]);

  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px" }}>
      <canvas ref={canvasRef} width={512} height={512} style={{ width: "100%", maxWidth: 240, borderRadius: 4, display: "block" }} />
      {dataUrl && (
        <a href={dataUrl} download="pochette.png"
          style={{ display: "block", textAlign: "center", fontSize: 11, marginTop: 4, color: "var(--text-secondary)", textDecoration: "none" }}>
          ⬇ PNG
        </a>
      )}
    </div>
  );
}
