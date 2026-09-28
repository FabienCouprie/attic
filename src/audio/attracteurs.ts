// audio/attracteurs.ts — Moteur de rendu d'attracteurs étranges / IFS.
// Génère des images (File) et du son (AudioBuffer) à partir d'attracteurs
// classiques : Lorenz, Rössler, Hénon, Ikeda, fougère de Barnsley,
// triangle de Sierpiński.

import { respirer } from "../core/respirer";
// L'image et le son vivent à côté : ce module ne connaît que des points et leurs bornes. Le sens
// inverse n'est qu'un `import type`, effacé à la compilation, donc rien ne circule à l'exécution.
import { fileDepuisCanvas, rendreHistogrammeSurCanvas, sonifierPoints } from "./attracteurs-image-et-son";

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

// Générateur congruentiel linéaire simple et déterministe.
function creerRng(graine: number) {
  let s = graine >>> 0;
  if (s === 0) s = 123456789;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface Point3D { x: number; y: number; z: number; }

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

export interface BoundingBox { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number; }

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

  // UNE IMAGE ENTRE CHAQUE ÉTAPE. Ce nœud calcule deux cent mille points, les range dans un
  // histogramme, colorie une image et la sonifie — tout cela dans le fil de l'interface, qui ne
  // rendait plus aucune image pendant **1073 ms**, mesurés dans l'application. C'était, de loin, le
  // plus gros gel d'un graphe ordinaire : les autres nœuds mesurés restent sous 110 ms.
  //
  // Les pauses sont posées ENTRE les étapes plutôt que dans les boucles : elles n'y coûtent qu'un
  // millième de seconde chacune, ne changent aucune signature, et suffisent à ramener le plus long
  // blocage à la durée d'une seule étape. Si l'une d'elles venait à grossir, c'est elle qu'il
  // faudrait faire respirer à l'intérieur.
  const points = collecterPoints(type, iterations, rng);
  await respirer();
  const bbox = calculerBoundingBox(points, projection);
  const { histogramme, max } = calculerHistogramme(points, width, height, projection, bbox);
  await respirer();

  const canvas = rendreHistogrammeSurCanvas(histogramme, max, width, height, palette, exposure, gamma);
  await respirer();
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
export { calculerHistogramme, itererAttracteur, projecter, creerRng, collecterPoints, calculerBoundingBox };
