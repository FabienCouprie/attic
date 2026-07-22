// audio/attracteurs.ts — Moteur de rendu d'attracteurs étranges / IFS.
// Génère des images (File) et du son (AudioBuffer) à partir d'attracteurs
// classiques : Lorenz, Rössler, Hénon, Ikeda, fougère de Barnsley,
// triangle de Sierpiński.

export type TypeAttracteur = "lorenz" | "rossler" | "henon" | "ikeda" | "barnsley" | "sierpinski";

const TYPES_ATTRACTEURS: TypeAttracteur[] = ["lorenz", "rossler", "henon", "ikeda", "barnsley", "sierpinski"];

export function normaliserTypeAttracteur(nom: string): TypeAttracteur | null {
  const normalise = nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
  return TYPES_ATTRACTEURS.find((t) => t === normalise) ?? null;
}

export interface OptionsAttracteur {
  type: TypeAttracteur;
  iterations: number;
  width: number;
  height: number;
  palette: string;
  exposure: number; // 0.1–5
  gamma: number; // 0.1–3
  projection: "xy" | "xz" | "yz" | "3d-shadow";
  graine?: number;
}

export interface OptionsAudio {
  duree: number; // secondes
  frequenceBase: number; // Hz
  plageDemiTons: number; // ± demi-tons
  decimation: number; // utiliser 1 point sur N
  volume: number; // 0–100
}

export interface ResultatAttracteur {
  image: File;
  audio: AudioBuffer;
}

const SAMPLE_RATE = 44100;

// Générateur congruentiel linéaire simple et déterministe.
function creerRng(graine: number) {
  let s = graine >>> 0;
  if (s === 0) s = 123456789;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const PALETTES: Record<string, string[]> = {
  classic: ["#000033", "#0000ff", "#00ffff", "#ffff00", "#ff0000", "#ffffff"],
  magma: ["#000004", "#3b0f70", "#8c2981", "#de4968", "#fe9f6d", "#fcfdbf"],
  inferno: ["#000004", "#420a68", "#932667", "#dd513a", "#fca50a", "#fcffa4"],
  viridis: ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"],
  gray: ["#000000", "#222222", "#555555", "#888888", "#bbbbbb", "#ffffff"],
  claw: ["#0d1b2a", "#1b3a4b", "#3c6e47", "#d4a373", "#e9c46a", "#f4a261"],
};

function choisirPalette(nom: string): string[] {
  const cle = nom.toLowerCase();
  return PALETTES[cle] ?? PALETTES.classic;
}

function interpolerCouleur(couleurs: string[], t: number): string {
  const idx = t * (couleurs.length - 1);
  const i0 = Math.max(0, Math.min(couleurs.length - 1, Math.floor(idx)));
  const i1 = Math.max(0, Math.min(couleurs.length - 1, Math.ceil(idx)));
  const frac = i0 === i1 ? 0 : idx - i0;

  const parseHex = (hex: string) => {
    const h = hex.replace("#", "");
    return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
  };

  const [r0, g0, b0] = parseHex(couleurs[i0]);
  const [r1, g1, b1] = parseHex(couleurs[i1]);
  const r = Math.round(r0 + (r1 - r0) * frac);
  const g = Math.round(g0 + (g1 - g0) * frac);
  const b = Math.round(b0 + (b1 - b0) * frac);
  return `rgb(${r},${g},${b})`;
}

interface Point3D { x: number; y: number; z: number; }

function* itererAttracteur(type: TypeAttracteur, iterations: number, rng: () => number): Generator<Point3D> {
  switch (type) {
    case "lorenz": {
      let x = 0.1, y = 0, z = 0;
      const sigma = 10, rho = 28, beta = 8 / 3;
      const dt = 0.01;
      for (let i = 0; i < iterations; i++) {
        const dx = sigma * (y - x);
        const dy = x * (rho - z) - y;
        const dz = x * y - beta * z;
        x += dx * dt;
        y += dy * dt;
        z += dz * dt;
        if (i > 100) yield { x, y, z };
      }
      break;
    }
    case "rossler": {
      let x = 0.1, y = 0, z = 0;
      const a = 0.2, b = 0.2, c = 5.7;
      const dt = 0.05;
      for (let i = 0; i < iterations; i++) {
        const dx = -(y + z);
        const dy = x + a * y;
        const dz = b + z * (x - c);
        x += dx * dt;
        y += dy * dt;
        z += dz * dt;
        if (i > 100) yield { x, y, z };
      }
      break;
    }
    case "henon": {
      let x = 0, y = 0;
      const a = 1.4, b = 0.3;
      for (let i = 0; i < iterations; i++) {
        const xn = 1 - a * x * x + y;
        const yn = b * x;
        x = xn; y = yn;
        if (i > 100) yield { x, y, z: 0 };
      }
      break;
    }
    case "ikeda": {
      let x = 0, y = 0;
      const u = 0.918;
      for (let i = 0; i < iterations; i++) {
        const t = 0.4 - 6 / (1 + x * x + y * y);
        const sinT = Math.sin(t), cosT = Math.cos(t);
        const xn = 1 + u * (x * cosT - y * sinT);
        const yn = u * (x * sinT + y * cosT);
        x = xn; y = yn;
        if (i > 100) yield { x, y, z: 0 };
      }
      break;
    }
    case "barnsley": {
      let x = 0, y = 0;
      for (let i = 0; i < iterations; i++) {
        const r = rng();
        let xn = x, yn = y;
        if (r < 0.01) {
          xn = 0; yn = 0.16 * y;
        } else if (r < 0.86) {
          xn = 0.85 * x + 0.04 * y;
          yn = -0.04 * x + 0.85 * y + 1.6;
        } else if (r < 0.93) {
          xn = 0.2 * x - 0.26 * y;
          yn = 0.23 * x + 0.22 * y + 1.6;
        } else {
          xn = -0.15 * x + 0.28 * y;
          yn = 0.26 * x + 0.24 * y + 0.44;
        }
        x = xn; y = yn;
        if (i > 20) yield { x, y, z: 0 };
      }
      break;
    }
    case "sierpinski": {
      // Triangle IFS avec 3 transformations affines.
      const sommets = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0.5, y: Math.sin(Math.PI / 3) },
      ];
      let x = 0.5, y = 0.25;
      for (let i = 0; i < iterations; i++) {
        const sommet = sommets[Math.floor(rng() * sommets.length)];
        x = (x + sommet.x) / 2;
        y = (y + sommet.y) / 2;
        if (i > 20) yield { x, y, z: 0 };
      }
      break;
    }
  }
}

interface BoundingBox { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number; }

function projecter(point: Point3D, projection: OptionsAttracteur["projection"]): { x: number; y: number } {
  switch (projection) {
    case "xz": return { x: point.x, y: point.z };
    case "yz": return { x: point.y, y: point.z };
    case "3d-shadow": {
      // Projection perspective légère pour donner du relief.
      const echelle = 1 / (1 + point.z * 0.02);
      return { x: point.x * echelle, y: point.y * echelle };
    }
    case "xy":
    default:
      return { x: point.x, y: point.y };
  }
}

function collecterPoints(type: TypeAttracteur, iterations: number, rng: () => number): Point3D[] {
  const points: Point3D[] = [];
  for (const p of itererAttracteur(type, iterations, rng)) {
    if (isFinite(p.x) && isFinite(p.y) && isFinite(p.z)) points.push(p);
  }
  return points;
}

function calculerBoundingBox(points: Point3D[], projection: OptionsAttracteur["projection"]): BoundingBox {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    const proj = projecter(p, projection);
    minX = Math.min(minX, proj.x);
    maxX = Math.max(maxX, proj.x);
    minY = Math.min(minY, proj.y);
    maxY = Math.max(maxY, proj.y);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  if (!isFinite(minX)) { minX = -1; maxX = 1; minY = -1; maxY = 1; minZ = -1; maxZ = 1; }
  const marge = 0.05;
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const dz = maxZ - minZ || 1;
  return {
    minX: minX - dx * marge, maxX: maxX + dx * marge,
    minY: minY - dy * marge, maxY: maxY + dy * marge,
    minZ: minZ - dz * marge, maxZ: maxZ + dz * marge,
  };
}

function calculerHistogramme(
  points: Point3D[],
  width: number,
  height: number,
  projection: OptionsAttracteur["projection"],
  bbox: BoundingBox
): { histogramme: Float32Array; max: number } {
  const histogramme = new Float32Array(width * height);
  let max = 0;
  for (const p of points) {
    const proj = projecter(p, projection);
    const nx = (proj.x - bbox.minX) / (bbox.maxX - bbox.minX);
    const ny = (proj.y - bbox.minY) / (bbox.maxY - bbox.minY);
    const px = Math.floor(nx * (width - 1));
    const py = Math.floor((1 - ny) * (height - 1));
    if (px >= 0 && px < width && py >= 0 && py < height) {
      const idx = py * width + px;
      histogramme[idx] += 1;
      if (histogramme[idx] > max) max = histogramme[idx];
    }
  }
  return { histogramme, max };
}

function fileDepuisCanvas(canvas: HTMLCanvasElement, format: "png" | "jpeg", nom: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const mime = format === "png" ? "image/png" : "image/jpeg";
    const qualite = format === "jpeg" ? 0.92 : undefined;
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas.toBlob a retourné null"));
          return;
        }
        resolve(new File([blob], nom, { type: mime }));
      },
      mime,
      qualite
    );
  });
}

function rendreHistogrammeSurCanvas(
  histogramme: Float32Array,
  max: number,
  width: number,
  height: number,
  palette: string,
  exposure: number,
  gamma: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) throw new Error("Impossible d'obtenir le contexte 2D du canvas");

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  const couleurs = choisirPalette(palette);
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  const maxLog = max > 0 ? Math.log1p(max) : 1;
  const exposureFactor = Math.max(0.01, exposure);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const count = histogramme[idx];
      const t = maxLog > 0 ? Math.log1p(count * exposureFactor) / maxLog : 0;
      const tGamma = Math.max(0, Math.min(1, t ** (1 / Math.max(0.1, gamma))));
      const rgbStr = interpolerCouleur(couleurs, tGamma);
      const match = rgbStr.match(/(\d+),(\d+),(\d+)/);
      const r = match ? parseInt(match[1], 10) : 0;
      const g = match ? parseInt(match[2], 10) : 0;
      const b = match ? parseInt(match[3], 10) : 0;
      const offset = idx * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function sonifierPoints(
  points: Point3D[],
  bbox: BoundingBox,
  options: OptionsAudio
): AudioBuffer {
  const {
    duree,
    frequenceBase,
    plageDemiTons,
    decimation,
    volume,
  } = options;

  const nbEchantillons = Math.max(1, Math.floor(duree * SAMPLE_RATE));
  const ctx = new OfflineAudioContext(2, nbEchantillons, SAMPLE_RATE);
  const buffer = ctx.createBuffer(2, nbEchantillons, SAMPLE_RATE);
  const gauche = buffer.getChannelData(0);
  const droite = buffer.getChannelData(1);

  const vol = Math.max(0, Math.min(1, volume / 100)) * 0.25;
  const pointsUtilisables = points.filter((p) => isFinite(p.x) && isFinite(p.y) && isFinite(p.z));
  if (pointsUtilisables.length === 0) return buffer;

  const dx = bbox.maxX - bbox.minX || 1;
  const dy = bbox.maxY - bbox.minY || 1;
  const dz = bbox.maxZ - bbox.minZ || 1;

  const ratio = Math.max(1, Math.floor(pointsUtilisables.length / (nbEchantillons * decimation)));
  let phaseG = 0, phaseD = 0;

  for (let i = 0; i < nbEchantillons; i++) {
    const idx = Math.min(pointsUtilisables.length - 1, Math.floor(i * ratio * decimation));
    const p = pointsUtilisables[idx];
    const nx = (p.x - bbox.minX) / dx;
    const ny = (p.y - bbox.minY) / dy;
    const nz = (p.z - bbox.minZ) / dz;

    // x contrôle la fréquence du canal gauche, y du canal droit, z l'amplitude.
    const freqG = frequenceBase * 2 ** ((nx - 0.5) * plageDemiTons / 12);
    const freqD = frequenceBase * 2 ** ((ny - 0.5) * plageDemiTons / 12);
    const amp = vol * (0.3 + 0.7 * nz);

    const incG = (freqG / SAMPLE_RATE) * 2 * Math.PI;
    const incD = (freqD / SAMPLE_RATE) * 2 * Math.PI;
    phaseG += incG;
    phaseD += incD;
    gauche[i] = Math.sin(phaseG) * amp;
    droite[i] = Math.sin(phaseD) * amp;
  }

  // Petit fondu d'entrée/sortie pour éviter les clics.
  const fade = Math.min(nbEchantillons, Math.floor(SAMPLE_RATE * 0.01));
  for (let i = 0; i < fade; i++) {
    const f = i / fade;
    gauche[i] *= f;
    droite[i] *= f;
    gauche[nbEchantillons - 1 - i] *= f;
    droite[nbEchantillons - 1 - i] *= f;
  }

  return buffer;
}

export async function rendreAttracteurImageEtAudio(
  options: OptionsAttracteur,
  audioOptions: OptionsAudio,
  format: "png" | "jpeg" = "png"
): Promise<ResultatAttracteur> {
  const {
    type,
    iterations: iterationsBrut,
    width,
    height,
    palette,
    exposure,
    gamma,
    projection,
    graine = 42,
  } = options;

  const iterations = Math.max(1000, Math.min(2_000_000, Math.round(iterationsBrut)));
  const rng = creerRng(graine);
  const points = collecterPoints(type, iterations, rng);
  const bbox = calculerBoundingBox(points, projection);
  const { histogramme, max } = calculerHistogramme(points, width, height, projection, bbox);

  const canvas = rendreHistogrammeSurCanvas(histogramme, max, width, height, palette, exposure, gamma);
  const ext = format === "png" ? "png" : "jpg";
  const nom = `attracteur-${type}-${palette}.${ext}`;
  const image = await fileDepuisCanvas(canvas, format, nom);
  const audio = sonifierPoints(points, bbox, audioOptions);

  return { image, audio };
}

export async function rendreAttracteurImage(
  options: OptionsAttracteur,
  format: "png" | "jpeg" = "png"
): Promise<File> {
  const { image } = await rendreAttracteurImageEtAudio(
    options,
    { duree: 1, frequenceBase: 220, plageDemiTons: 24, decimation: 100, volume: 0 },
    format
  );
  return image;
}

// Exposé pour les tests et les sonifications futures.
export { calculerHistogramme, itererAttracteur, projecter, creerRng, PALETTES, interpolerCouleur, collecterPoints, calculerBoundingBox };

export function canvasDisponible(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("2d");
  } catch {
    return false;
  }
}
