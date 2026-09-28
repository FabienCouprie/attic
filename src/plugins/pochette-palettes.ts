// plugins/pochette-palettes.ts — Les palettes, et le tirage qui les choisit.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.


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

export function cleanPreset(palette: string): string {
  const p = palette.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return Object.keys(PALETTES_PRESET).includes(p) ? p : "auto";
}

export function cleanStyle(style: string): string {
  const s = style.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const styles = [
    "minimaliste", "geometrique", "vagues", "grain", "concentrique", "bauhaus",
    "rayures", "mosaique", "etoiles", "brutalisme", "cyber", "pastel",
  ];
  return styles.includes(s) ? s : "bauhaus";
}

export function cleanFont(font: string): string {
  const f = font.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const map: Record<string, string> = {
    "sans-serif": "sans-serif", "serif": "Georgia, serif", "mono": "monospace",
    "condense": "'Arial Narrow', sans-serif", "script": "cursive", "gras": "Impact, sans-serif",
  };
  return map[f] ?? "sans-serif";
}

export function cleanBorder(border: string): string {
  const b = border.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return ["non", "fine", "epaisse", "arrondie"].includes(b) ? b : "non";
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function shapeOpacity(rng: () => number): number {
  return 0.55 + rng() * 0.4;
}

export function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1));
}

export function randRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

