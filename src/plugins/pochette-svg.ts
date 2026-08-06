// plugins/pochette-svg.ts — Génération procédurale de pochettes d'album en SVG.
// Utilisé à la fois par le plugin (sortie chaînable) et par la vue React.
// 100% offline, sans dépendance Canvas.

export const PALETTES_PRESET: Record<string, string[]> = {
  auto: [],
  chaud: ["#1a1a2e", "#e63946", "#f4a261"],
  froid: ["#0d1b2a", "#1b4965", "#5fa8d3"],
  neon: ["#0a0a0a", "#00f5ff", "#ff00ff"],
  pastel: ["#ffe5ec", "#ffb6c1", "#ff85a1"],
  monochrome: ["#0d0d0d", "#f5f5f5", "#888888"],
  terre: ["#3e2723", "#8b5a2b", "#d4a574"],
  royal: ["#1a0a2e", "#ffd700", "#111111"],
  synthwave: ["#2b003b", "#ff00ff", "#00ffff"],
  sepia: ["#3e2723", "#8d6e63", "#d7ccc8"],
  cyber: ["#000000", "#0ff", "#f0f"],
  foret: ["#1b4332", "#2d6a4f", "#95d5b2"],
  ocean: ["#0d1b2a", "#1b4965", "#5fa8d3"],
  magma: ["#1a0505", "#ff4d00", "#ffcc00"],
  givre: ["#e0f7fa", "#80deea", "#00838f"],
};

export function mulberry32(graine: number): () => number {
  let a = graine | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function paletteDepuisPrompt(prompt: string, rng: () => number): string[] {
  const texte = prompt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const palettes: { mots: string[]; couleurs: string[] }[] = [
    { mots: ["feu", "rouge", "passion", "colere", "rock", "metal", "energie", "chaud", "orange", "magma", "volcan", "lave"], couleurs: ["#1a0505", "#e63946", "#f4a261"] },
    { mots: ["eau", "bleu", "mer", "ocean", "froid", "triste", "melancolie", "ambient", "glacial", "cyan", "hiver", "givre", "ice"], couleurs: ["#0d1b2a", "#1b4965", "#5fa8d3"] },
    { mots: ["nature", "vert", "foret", "jardin", "folk", "acoustic", "plante", "feuille", "mousse", "sapin"], couleurs: ["#1b4332", "#2d6a4f", "#95d5b2"] },
    { mots: ["nuit", "noir", "dark", "sombre", "electro", "techno", "industriel", "gothique", "shadow", "obscur"], couleurs: ["#0a0a0a", "#1a1a2e", "#e94560"] },
    { mots: ["jour", "jaune", "soleil", "lumiere", "pop", "happy", "ete", "gold", "dore", "soleil", "sun"], couleurs: ["#f9c80e", "#f86624", "#ea3546"] },
    { mots: ["violet", "reve", "mystere", "psychedelique", "dream", "magic", "lavande", "mauve", "cosmos", "galaxie", "nebula"], couleurs: ["#2d1b69", "#6c5ce7", "#a29bfe"] },
    { mots: ["rose", "amour", "romance", "doux", "pink", "flower", "fleur", "candy", "coton"], couleurs: ["#ff006e", "#fb5607", "#ffbe0b"] },
    { mots: ["monochrome", "minimal", "blanc", "classique", "gris", "silver", "noir et blanc", "black and white", "ink", "encre"], couleurs: ["#0d0d0d", "#f5f5f5", "#888888"] },
    { mots: ["terre", "marron", "vintage", "retro", "country", "warm", "bois", "wood", "cafe", "chocolate", "cocoa", "cuir"], couleurs: ["#3e2723", "#8b5a2b", "#d4a574"] },
    { mots: ["espace", "cosmos", "etoile", "star", "galaxy", "cosmic", "univers", "noir"], couleurs: ["#000000", "#3a0ca3", "#f72585"] },
    { mots: ["neon", "cyber", "tech", "electric", "digital", "laser", "fluo", "future", "retrowave"], couleurs: ["#0a0a0a", "#00f5ff", "#ff00ff"] },
    { mots: ["pastel", "soft", "candy", "doux", "light", "bebe", "kawaii", "nuage"], couleurs: ["#ffe5ec", "#ffb6c1", "#ff85a1"] },
    { mots: ["synthwave", "80s", "vaporwave", "retro", "arcade", "pixel"], couleurs: ["#2b003b", "#ff00ff", "#00ffff"] },
    { mots: ["royal", "luxury", "gold", "dore", "crown", "opulence", "baroque"], couleurs: ["#1a0a2e", "#ffd700", "#111111"] },
    { mots: ["sepia", "paper", "book", "library", "old", "vintage", "photo", "parchment"], couleurs: ["#3e2723", "#8d6e63", "#d7ccc8"] },
  ];

  for (const p of palettes) {
    for (const mot of p.mots) {
      if (texte.includes(mot)) return p.couleurs;
    }
  }

  const hue = Math.floor(rng() * 360);
  return [
    `hsl(${hue}, 70%, 15%)`,
    `hsl(${(hue + 40) % 360}, 65%, 45%)`,
    `hsl(${(hue + 80) % 360}, 60%, 65%)`,
  ];
}

function cleanPreset(palette: string): string {
  const p = palette.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return Object.keys(PALETTES_PRESET).includes(p) ? p : "auto";
}

function cleanStyle(style: string): string {
  const s = style.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const styles = [
    "minimaliste", "geometrique", "vagues", "grain", "concentrique", "bauhaus",
    "rayures", "mosaique", "etoiles", "brutalisme", "cyber", "pastel",
  ];
  return styles.includes(s) ? s : "bauhaus";
}

function cleanFont(font: string): string {
  const f = font.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const map: Record<string, string> = {
    "sans-serif": "sans-serif", "serif": "Georgia, serif", "mono": "monospace",
    "condense": "'Arial Narrow', sans-serif", "script": "cursive", "gras": "Impact, sans-serif",
  };
  return map[f] ?? "sans-serif";
}

function cleanBorder(border: string): string {
  const b = border.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return ["non", "fine", "epaisse", "arrondie"].includes(b) ? b : "non";
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function shapeOpacity(rng: () => number): number {
  return 0.55 + rng() * 0.4;
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1));
}

function randRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function polygonPoints(cx: number, cy: number, r: number, sides: number, rng: () => number): string {
  const points: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2 + (rng() - 0.5) * 0.15;
    const rad = r * (0.7 + rng() * 0.6);
    points.push(`${cx + Math.cos(angle) * rad},${cy + Math.sin(angle) * rad}`);
  }
  return points.join(" ");
}

function textColorFor(bg: string): string {
  // Heuristic: dark backgrounds -> white text; light backgrounds -> black text.
  // Works for hex and hsl strings. For hsl, hue part is ignored; if lightness is > 55%, treat as light.
  const hslMatch = bg.match(/hsl\([^,]+,\s*[^,]+,\s*(\d+)%\s*(?:\/[^)]+)?\)/);
  if (hslMatch) return Number(hslMatch[1]) > 55 ? "#111111" : "#ffffff";
  const lower = bg.toLowerCase();
  const isLight = lower.includes("fff") || lower.includes("#f5f5f5") || lower.includes("#ffe") || lower.includes("#e0f7fa") || lower.includes("#d7ccc8");
  return isLight ? "#111111" : "#ffffff";
}

function sanitizeSvgText(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" }[c] as string));
}

function buildTitleText(titre: string, artiste: string, W: number, H: number, font: string, textColor: string): string {
  const safeTitre = sanitizeSvgText(titre || "Album");
  const safeArtiste = sanitizeSvgText(artiste);
  if (!safeTitre && !safeArtiste) return "";
  let text = "";
  const fontSize = Math.max(14, Math.min(42, (W / Math.max(safeTitre.length, 5)) * 1.8));
  const hasBoth = safeTitre && safeArtiste;
  const titleY = hasBoth ? H * 0.52 : H * 0.5;
  const isGras = font === "Impact, sans-serif";
  const isSerif = font === "Georgia, serif";
  const fontWeight = isGras ? "900" : "bold";
  const fontStyleAttr = isSerif ? 'font-style="italic"' : "";
  text += `<text x="${W / 2}" y="${titleY}" font-family="${font}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${textColor}" text-anchor="middle" dominant-baseline="middle" ${fontStyleAttr}>${safeTitre}</text>`;
  if (hasBoth) {
    text += `<text x="${W / 2}" y="${titleY + fontSize * 0.9}" font-family="sans-serif" font-size="${Math.max(10, fontSize * 0.42)}" fill="${textColor}" opacity="0.75" text-anchor="middle" dominant-baseline="middle">${safeArtiste}</text>`;
  }
  return text;
}

function buildBorder(border: string, W: number, H: number, color: string): string {
  if (border === "non") return "";
  const width = border === "epaisse" ? 18 : border === "arrondie" ? 8 : 4;
  const radius = border === "arrondie" ? 24 : 0;
  return `<rect x="${width / 2}" y="${width / 2}" width="${W - width}" height="${H - width}" rx="${radius}" ry="${radius}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
}

function buildBackground(style: string, palette: string[], W: number, H: number, rng: () => number, defs: string[]): string {
  const [c1, c2, c3] = palette;
  switch (style) {
    case "minimaliste": {
      const id = `gradMin-${randInt(rng, 0, 999999)}`;
      defs.push(`<linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="50%" stop-color="${c2}"/><stop offset="100%" stop-color="${c1}"/></linearGradient>`);
      return `<rect width="${W}" height="${H}" fill="url(#${id})"/>`;
    }
    case "vagues": {
      const id = `gradVagues-${randInt(rng, 0, 999999)}`;
      defs.push(`<linearGradient id="${id}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient>`);
      return `<rect width="${W}" height="${H}" fill="url(#${id})"/>`;
    }
    case "pastel": {
      const id = `gradPastel-${randInt(rng, 0, 999999)}`;
      const col1 = palette[0];
      const col2 = palette[1];
      const col3 = palette[2];
      defs.push(`<radialGradient id="${id}" cx="30%" cy="30%" r="90%"><stop offset="0%" stop-color="${col3}"/><stop offset="50%" stop-color="${col2}"/><stop offset="100%" stop-color="${col1}"/></radialGradient>`);
      return `<rect width="${W}" height="${H}" fill="url(#${id})"/>`;
    }
    case "grain": {
      const id = `gradGrain-${randInt(rng, 0, 999999)}`;
      defs.push(`<radialGradient id="${id}" cx="50%" cy="50%" r="75%"><stop offset="0%" stop-color="${c2}"/><stop offset="100%" stop-color="${c1}"/></radialGradient>`);
      return `<rect width="${W}" height="${H}" fill="url(#${id})"/>`;
    }
    default:
      return `<rect width="${W}" height="${H}" fill="${c1}"/>`;
  }
}

function buildDecorations(style: string, palette: string[], W: number, H: number, complexite: number, rng: () => number, defs: string[]): string {
  const [c1, c2, c3] = palette;
  let body = "";

  const count = Math.floor(2 + complexite / 10); // 2 to ~12 base shapes

  switch (style) {
    case "vagues": {
      const vagues = Math.floor(3 + complexite / 20);
      for (let v = 0; v < vagues; v++) {
        const baseY = H * (0.25 + v * 0.15);
        const amp = 20 + rng() * 60;
        const color = v % 2 === 0 ? c3 : c2;
        const d: string[] = [];
        d.push(`M 0 ${H}`);
        for (let x = 0; x <= W; x += 8) {
          const y = baseY + Math.sin(x * 0.02 + v + rng()) * amp;
          d.push(`L ${x} ${y}`);
        }
        d.push(`L ${W} ${H} Z`);
        body += `<path d="${d.join(" ")}" fill="${color}" opacity="${0.1 + v * 0.05}"/>`;
      }
      break;
    }
    case "grain": {
      const n = Math.min(20000, Math.floor(W * H * 0.015 * (complexite / 50)));
      for (let i = 0; i < n; i++) {
        const col = rng() < 0.5 ? "#ffffff" : "#000000";
        body += `<rect x="${rng() * W}" y="${rng() * H}" width="1.5" height="1.5" fill="${col}" opacity="${rng() * 0.15}"/>`;
      }
      break;
    }
    case "concentrique": {
      const cx = W / 2;
      const cy = H / 2;
      const maxR = Math.sqrt(cx * cx + cy * cy);
      const nb = Math.floor(8 + complexite / 10);
      for (let i = nb; i >= 0; i--) {
        const r = (i / nb) * maxR;
        const col = i < nb * 0.35 ? c1 : i < nb * 0.75 ? c2 : c3;
        body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${2 + rng() * 6}" opacity="${shapeOpacity(rng)}"/>`;
      }
      break;
    }
    case "geometrique": {
      const cols = Math.floor(4 + complexite / 20);
      const rows = Math.floor(4 + complexite / 20);
      const cw = W / cols;
      const ch = H / rows;
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          if (rng() < 0.45) {
            const color = rng() < 0.5 ? c2 : c3;
            const rot = rng() * 90;
            body += `<rect x="${gx * cw + cw * 0.05}" y="${gy * ch + ch * 0.05}" width="${cw * 0.9}" height="${ch * 0.9}" fill="${color}" opacity="${shapeOpacity(rng)}" transform="rotate(${rot.toFixed(1)} ${gx * cw + cw / 2} ${gy * ch + ch / 2})"/>`;
          }
        }
      }
      break;
    }
    case "bauhaus": {
      const nb = count;
      for (let i = 0; i < nb; i++) {
        const col = pick(rng, [c2, c3, c1]);
        const cx = rng() * W;
        const cy = rng() * H;
        const size = randRange(rng, 60, Math.min(W, H) * 0.35);
        const type = randInt(rng, 0, 2);
        const opacity = shapeOpacity(rng);
        if (type === 0) {
          body += `<circle cx="${cx}" cy="${cy}" r="${size / 2}" fill="${col}" opacity="${opacity}"/>`;
        } else if (type === 1) {
          const rot = rng() * 90;
          body += `<rect x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size * (0.5 + rng())}" fill="${col}" opacity="${opacity}" transform="rotate(${rot.toFixed(1)} ${cx} ${cy})"/>`;
        } else {
          const sides = randInt(rng, 3, 6);
          body += `<polygon points="${polygonPoints(cx, cy, size / 2, sides, rng)}" fill="${col}" opacity="${opacity}"/>`;
        }
      }
      break;
    }
    case "rayures": {
      const nb = Math.floor(4 + complexite / 8);
      const angle = rng() < 0.5 ? 0 : 45; // vertical or diagonal
      const thickness = W / nb;
      for (let i = 0; i < nb; i++) {
        const color = i % 2 === 0 ? c2 : c3;
        if (angle === 0) {
          body += `<rect x="${i * thickness}" y="0" width="${thickness * 0.8}" height="${H}" fill="${color}" opacity="${shapeOpacity(rng)}"/>`;
        } else {
          const x = i * thickness - H;
          body += `<rect x="${x}" y="0" width="${thickness * 0.8}" height="${H * 2}" fill="${color}" opacity="${shapeOpacity(rng)}" transform="rotate(45 ${x + thickness / 2} ${H / 2})"/>`;
        }
      }
      break;
    }
    case "mosaique": {
      const cols = Math.floor(3 + complexite / 15);
      const rows = Math.floor(3 + complexite / 15);
      const cw = W / cols;
      const ch = H / rows;
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const color = pick(rng, palette);
          const gap = Math.min(cw, ch) * 0.05;
          body += `<rect x="${gx * cw + gap}" y="${gy * ch + gap}" width="${cw - gap * 2}" height="${ch - gap * 2}" rx="${cw * 0.08}" fill="${color}" opacity="${shapeOpacity(rng)}"/>`;
          if (rng() < 0.3) {
            const col2 = pick(rng, palette);
            const s = Math.min(cw, ch) * 0.3;
            body += `<circle cx="${gx * cw + cw / 2}" cy="${gy * ch + ch / 2}" r="${s / 2}" fill="${col2}" opacity="${shapeOpacity(rng)}"/>`;
          }
        }
      }
      break;
    }
    case "etoiles": {
      const nb = Math.floor(20 + complexite * 1.5);
      for (let i = 0; i < nb; i++) {
        const cx = rng() * W;
        const cy = rng() * H;
        const r = randRange(rng, 1, 4);
        const color = rng() < 0.7 ? "#ffffff" : c3;
        body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${randRange(rng, 0.3, 0.95)}"/>`;
      }
      // Big star bursts
      const bursts = Math.floor(1 + complexite / 25);
      for (let i = 0; i < bursts; i++) {
        const cx = rng() * W;
        const cy = rng() * H;
        const r = randRange(rng, 30, 90);
        const points = polygonPoints(cx, cy, r, randInt(rng, 5, 9), rng);
        body += `<polygon points="${points}" fill="${c2}" opacity="${shapeOpacity(rng)}"/>`;
      }
      break;
    }
    case "brutalisme": {
      const nb = count;
      for (let i = 0; i < nb; i++) {
        const col = pick(rng, [c2, c3, c1]);
        const cx = rng() * W;
        const cy = rng() * H;
        const w = randRange(rng, W * 0.1, W * 0.5);
        const h = randRange(rng, H * 0.05, H * 0.4);
        const rot = randRange(rng, -20, 20);
        body += `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="${col}" opacity="${shapeOpacity(rng)}" transform="rotate(${rot.toFixed(1)} ${cx} ${cy})"/>`;
        // heavy shadow line
        body += `<rect x="${cx - w / 2 + 8}" y="${cy - h / 2 + 8}" width="${w}" height="${h}" fill="none" stroke="${c1}" stroke-width="${4 + rng() * 4}" opacity="0.4" transform="rotate(${rot.toFixed(1)} ${cx} ${cy})"/>`;
      }
      break;
    }
    case "cyber": {
      // grid lines
      const spacing = Math.max(12, 40 - complexite / 3);
      for (let x = 0; x <= W; x += spacing) {
        body += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${c2}" stroke-width="0.5" opacity="0.25"/>`;
      }
      for (let y = 0; y <= H; y += spacing) {
        body += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${c2}" stroke-width="0.5" opacity="0.25"/>`;
      }
      // glitches
      const glitches = Math.floor(1 + complexite / 15);
      for (let i = 0; i < glitches; i++) {
        const y = rng() * H;
        const h = randRange(rng, 2, 12);
        const col = pick(rng, [c2, c3, "#ffffff"]);
        body += `<rect x="0" y="${y}" width="${W}" height="${h}" fill="${col}" opacity="${randRange(rng, 0.2, 0.6)}"/>`;
      }
      // floating blocks
      const nb = count;
      for (let i = 0; i < nb; i++) {
        const x = rng() * W;
        const y = rng() * H;
        const s = randRange(rng, 20, 80);
        body += `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${c2}" opacity="${shapeOpacity(rng)}"/>`;
      }
      break;
    }
    case "pastel": {
      // soft blobs
      const nb = Math.floor(2 + complexite / 15);
      for (let i = 0; i < nb; i++) {
        const cx = rng() * W;
        const cy = rng() * H;
        const r = randRange(rng, 60, 180);
        const col = pick(rng, palette);
        const filter = `blur(${randRange(rng, 8, 24)}px)`;
        body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}" opacity="${shapeOpacity(rng)}" style="filter:${filter}"/>`;
      }
      break;
    }
    case "minimaliste":
    default: {
      // subtle floating shapes
      const nb = Math.floor(1 + complexite / 25);
      for (let i = 0; i < nb; i++) {
        const cx = rng() * W;
        const cy = rng() * H;
        const r = randRange(rng, 40, 120);
        body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c2}" opacity="${0.15 + rng() * 0.2}"/>`;
      }
    }
  }

  // Vignette + fine grain overlay for all styles except grain
  if (style !== "grain") {
    const vignetteId = `vignette-${randInt(rng, 0, 999999)}`;
    defs.push(`<radialGradient id="${vignetteId}" cx="50%" cy="50%" r="75%"><stop offset="0%" stop-color="rgb(0,0,0)" stop-opacity="0"/><stop offset="100%" stop-color="rgb(0,0,0)" stop-opacity="0.35"/></radialGradient>`);
    body += `<rect width="${W}" height="${H}" fill="url(#${vignetteId})"/>`;
  }

  return body;
}

export interface PochetteOptions {
  prompt?: string;
  titre?: string;
  artiste?: string;
  style?: string;
  palette?: string;
  complexite?: number;
  bordure?: string;
  typographie?: string;
  largeur?: number;
  hauteur?: number;
  graine?: number;
}

export function genererPochetteSVG(options: PochetteOptions): string {
  const {
    prompt = "dark ambient night mysterious",
    titre = "Album",
    artiste = "",
    style = "bauhaus",
    palette = "auto",
    complexite = 50,
    bordure = "non",
    typographie = "sans-serif",
    largeur = 512,
    hauteur = 512,
    graine = 0,
  } = options;

  const seed = graine === 0 ? Math.floor(Math.random() * 99999) + 1 : graine;
  const rng = mulberry32(seed);

  const W = clamp(largeur, 128, 2048);
  const H = clamp(hauteur, 128, 2048);
  const preset = cleanPreset(palette);
  const paletteColors = preset === "auto" ? paletteDepuisPrompt(prompt, rng) : PALETTES_PRESET[preset];
  const sty = cleanStyle(style);
  const font = cleanFont(typographie);
  const border = cleanBorder(bordure);

  const defs: string[] = [];
  const bg = buildBackground(sty, paletteColors, W, H, rng, defs);
  const decorations = buildDecorations(sty, paletteColors, W, H, clamp(complexite, 1, 100), rng, defs);
  const text = buildTitleText(titre, artiste, W, H, font, textColorFor(paletteColors[0]));
  const borderEl = buildBorder(border, W, H, paletteColors[2]);

  const defsStr = defs.length ? `<defs>${defs.join("")}</defs>` : "";
  const body = `${bg}${decorations}${text}${borderEl}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defsStr}${body}</svg>`;
}

export function genererPochetteFile(options: PochetteOptions): File {
  const seed = options.graine ?? 0;
  const seedNum = seed === 0 ? Math.floor(Math.random() * 99999) + 1 : seed;
  const svg = genererPochetteSVG(options);
  return new File([svg], `pochette-${seedNum}.svg`, { type: "image/svg+xml" });
}
