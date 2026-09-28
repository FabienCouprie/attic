// audio/attracteurs-image-et-son.ts — Ce qu'on tire d'un nuage de points : une image, ou un son.
//
// POURQUOI CE MODULE EXISTE. `attracteurs.ts` portait quatre sujets à la fois : les équations des
// six attracteurs, la géométrie qui les projette et les compte, la palette et le canevas qui en
// font une image, et l'oscillateur qui en fait un son. Le fichier dépassait la taille où l'on
// retrouve encore quelque chose. La ligne de partage retenue est celle de la SORTIE : d'un côté le
// modèle, qui ne connaît que des points et leurs bornes ; de l'autre ce qui les rend perceptibles.
//
// CE QUE CE DÉCOUPAGE NE CHANGE PAS, et qui se vérifie : aucune ligne de calcul n'est retouchée, les
// blocs sont déplacés tels quels. Les inventaires engendrés depuis le registre en font la preuve,
// `COMPONENTS.md` et `MODULABLES.md` restant identiques à l'octet.
import type { BoundingBox, OptionsAudio, Point3D } from "./attracteurs";

const SAMPLE_RATE = 44100;

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

/**
 * La palette, précalculée en 256 teintes — trois octets par entrée.
 *
 * POURQUOI. La boucle de coloriage appelait `interpolerCouleur` PAR PIXEL : deux `parseInt`
 * hexadécimaux par couleur, la fabrication d'une chaîne « rgb(r,g,b) », puis, chez l'appelant, une
 * expression régulière et trois `parseInt` pour la relire. Sur une image de six cent quarante mille
 * pixels, cela faisait **720 ms de gel** mesurés dans l'application — de loin le plus long blocage
 * d'un graphe ordinaire, et il ne venait pas des mathématiques de l'attracteur (31 ms) mais de la
 * manipulation de chaînes de caractères.
 *
 * Une table de 256 teintes suffit : la palette n'a que six arrêts, et l'œil ne distingue pas deux
 * cent cinquante-six niveaux d'un dégradé continu. Le coût passe d'un travail par pixel à un
 * travail par teinte, fait une seule fois.
 */
function tablePalette(couleurs: string[], taille = 256): Uint8ClampedArray {
  const table = new Uint8ClampedArray(taille * 3);
  for (let i = 0; i < taille; i++) {
    const [r, g, b] = composantesCouleur(couleurs, i / (taille - 1));
    table[i * 3] = r;
    table[i * 3 + 1] = g;
    table[i * 3 + 2] = b;
  }
  return table;
}

/** L'interpolation elle-même, en nombres : c'est la forme dont la table a besoin. */
function composantesCouleur(couleurs: string[], t: number): [number, number, number] {
  const idx = t * (couleurs.length - 1);
  const i0 = Math.max(0, Math.min(couleurs.length - 1, Math.floor(idx)));
  const i1 = Math.max(0, Math.min(couleurs.length - 1, Math.ceil(idx)));
  const frac = i0 === i1 ? 0 : idx - i0;
  const hex = (h: string, d: number) => parseInt(h.replace("#", "").substring(d, d + 2), 16);
  const r = Math.round(hex(couleurs[i0], 0) + (hex(couleurs[i1], 0) - hex(couleurs[i0], 0)) * frac);
  const g = Math.round(hex(couleurs[i0], 2) + (hex(couleurs[i1], 2) - hex(couleurs[i0], 2)) * frac);
  const b = Math.round(hex(couleurs[i0], 4) + (hex(couleurs[i1], 4) - hex(couleurs[i0], 4)) * frac);
  return [r, g, b];
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

  const table = tablePalette(choisirPalette(palette));
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
      // Une lecture dans la table, là où l'on fabriquait et relisait une chaîne par pixel.
      const teinte = (tGamma * 255) | 0;
      const offset = idx * 4;
      data[offset] = table[teinte * 3];
      data[offset + 1] = table[teinte * 3 + 1];
      data[offset + 2] = table[teinte * 3 + 2];
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

export function canvasDisponible(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("2d");
  } catch {
    return false;
  }
}

export { fileDepuisCanvas, interpolerCouleur, PALETTES, rendreHistogrammeSurCanvas };
