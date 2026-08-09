// plugins/carte-sonore.ts — Carte sonore procédurale enrichie : ville en grille ou
// cercles concentriques, avec plusieurs esthétiques (classique, baroque,
// art nouveau, art déco, exotique). Charge un dossier de sons et génère une
// page HTML autonome dans le dossier de sortie.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

export type StyleCarte = "ville" | "concentrique" | "organique" | "voronoi";
export type Esthetique = "classique" | "baroque" | "art-nouveau" | "art-deco" | "exotique";

export interface PointSonore {
  x: number;
  y: number;
  nom: string;
  chemin: string;
  couleur: string;
}

export interface RouteVille {
  points: { x: number; y: number }[];
  epaisseur: number;
  nom?: string;
  type: "artere" | "rue" | "boulevard";
  horizontal?: boolean;
  vertical?: boolean;
}

export interface QuartierVille {
  x: number;
  y: number;
  w: number;
  h: number;
  type: string;
  points?: { x: number; y: number }[];
  d?: string;
}

export interface BatimentVille {
  x: number;
  y: number;
  w: number;
  h: number;
  couleur: string;
  type?: string;
  r?: number;
  a?: number;
  d?: string;
}

export interface EspaceVertVille {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  points?: { x: number; y: number }[];
  d?: string;
  arbres?: { x: number; y: number; r: number }[];
}

export interface EauVille {
  points: { x: number; y: number }[];
  type: "riviere" | "lac";
  d?: string;
}

export interface DecorationCarte {
  x: number;
  y: number;
  type: "fontaine" | "tour" | "pavillon" | "phare" | "arbre" | "palais" | "minaret" | "palmier" | "marche" | "bar" | "grotte" | "cinema" | "monument" | "statue" | "ecole" | "eglise" | "bibliotheque" | "theatre" | "jardin" | "marais" | "temple";
  nom?: string;
}

export interface CarteSonore {
  width: number;
  height: number;
  style: StyleCarte;
  esthetique: Esthetique;
  routes: RouteVille[];
  quartiers: QuartierVille[];
  batiments: BatimentVille[];
  espacesVerts: EspaceVertVille[];
  riviere: { x: number; y: number }[];
  eau: EauVille[];
  points: PointSonore[];
  graine: number;
  centre?: { x: number; y: number };
  decorations?: DecorationCarte[];
}

interface Palette {
  quartiers: Record<string, string>;
  bats: Record<string, string[]>;
  points: string[];
  routeCasing: string;
  routeSurface: string;
  routeArtere: string;
  routeBoulevard: string;
  eau: string;
  eauStroke: string;
  arbre: string;
  fond: string;
  gradient?: { center: string; edge: string };
  fontFamily: string;
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pointDistanceToPolyline(px: number, py: number, pts: { x: number; y: number }[]): number {
  if (pts.length === 0) return Infinity;
  let min = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : clamp(((px - a.x) * dx + (py - a.y) * dy) / len2, 0, 1);
    const dxp = px - (a.x + t * dx);
    const dyp = py - (a.y + t * dy);
    const d = Math.hypot(dxp, dyp);
    if (d < min) min = d;
  }
  return min;
}

function pointInPolygon(px: number, py: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function inWater(cx: number, cy: number, eau: EauVille[]): boolean {
  for (const e of eau) {
    if (e.type === "lac" && pointInPolygon(cx, cy, e.points)) return true;
    if (e.type === "riviere" && pointDistanceToPolyline(cx, cy, e.points) < 18) return true;
  }
  return false;
}

function shoelaceArea(poly: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  }
  return Math.abs(a) / 2;
}

function centroidPolygon(poly: { x: number; y: number }[]): { x: number; y: number } {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const cross = poly[j].x * poly[i].y - poly[i].x * poly[j].y;
    cx += (poly[j].x + poly[i].x) * cross;
    cy += (poly[j].y + poly[i].y) * cross;
    a += cross;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) return { x: 0, y: 0 };
  const factor = 6 * a;
  return { x: cx / factor, y: cy / factor };
}

function clipPolygon(
  poly: { x: number; y: number }[],
  mx: number,
  my: number,
  dx: number,
  dy: number,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const n = poly.length;
  if (n === 0) return [];
  for (let i = 0; i < n; i++) {
    const curr = poly[i];
    const next = poly[(i + 1) % n];
    const fc = (curr.x - mx) * dx + (curr.y - my) * dy;
    const fn = (next.x - mx) * dx + (next.y - my) * dy;
    const ic = fc <= 0;
    const ine = fn <= 0;
    if (ic && ine) {
      out.push(next);
    } else if (ic && !ine) {
      const t = fc / (fc - fn);
      out.push({ x: curr.x + t * (next.x - curr.x), y: curr.y + t * (next.y - curr.y) });
    } else if (!ic && ine) {
      const t = fc / (fc - fn);
      out.push({ x: curr.x + t * (next.x - curr.x), y: curr.y + t * (next.y - curr.y) });
      out.push(next);
    }
  }
  return out;
}

function edgeKey(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const ax = Math.round(a.x * 2) / 2;
  const ay = Math.round(a.y * 2) / 2;
  const bx = Math.round(b.x * 2) / 2;
  const by = Math.round(b.y * 2) / 2;
  if (ax < bx || (ax === bx && ay < by)) return `${ax.toFixed(1)},${ay.toFixed(1)};${bx.toFixed(1)},${by.toFixed(1)}`;
  return `${bx.toFixed(1)},${by.toFixed(1)};${ax.toFixed(1)},${ay.toFixed(1)}`;
}

function sampleQuadraticBezier(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  steps = 10,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [a];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const it = 1 - t;
    const x = it * it * a.x + 2 * it * t * c.x + t * t * b.x;
    const y = it * it * a.y + 2 * it * t * c.y + t * t * b.y;
    pts.push({ x, y });
  }
  pts.push(b);
  return pts;
}

function randomPointInPolygon(
  poly: { x: number; y: number }[],
  rng: () => number,
): { x: number; y: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  for (let t = 0; t < 80; t++) {
    const x = minX + rng() * (maxX - minX);
    const y = minY + rng() * (maxY - minY);
    if (pointInPolygon(x, y, poly)) return { x, y };
  }
  return null;
}

function shrinkPolygon(poly: { x: number; y: number }[], factor: number): { x: number; y: number }[] {
  const c = centroidPolygon(poly);
  return poly.map((p) => ({ x: c.x + (p.x - c.x) * factor, y: c.y + (p.y - c.y) * factor }));
}

function batimentPath(x: number, y: number, w: number, h: number, angle: number, toit = false): string {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hw = w / 2;
  const hh = h / 2;
  const c0 = { x: x + (-hw * cos - hh * sin), y: y + (-hw * sin + hh * cos) };
  const c1 = { x: x + (hw * cos - hh * sin), y: y + (hw * sin + hh * cos) };
  const c2 = { x: x + (hw * cos + hh * sin), y: y + (hw * sin - hh * cos) };
  const c3 = { x: x + (-hw * cos + hh * sin), y: y + (-hw * sin - hh * cos) };
  if (toit) {
    const roof = { x: x - h * 0.35 * sin, y: y - h * 0.35 * cos };
    return `M ${c0.x.toFixed(1)} ${c0.y.toFixed(1)} L ${c1.x.toFixed(1)} ${c1.y.toFixed(1)} L ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} L ${roof.x.toFixed(1)} ${roof.y.toFixed(1)} L ${c3.x.toFixed(1)} ${c3.y.toFixed(1)} Z`;
  }
  return `M ${c0.x.toFixed(1)} ${c0.y.toFixed(1)} L ${c1.x.toFixed(1)} ${c1.y.toFixed(1)} L ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} L ${c3.x.toFixed(1)} ${c3.y.toFixed(1)} Z`;
}

function polarToCartesian(cx: number, cy: number, r: number, a: number): { x: number; y: number } {
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
}

function sectorPoints(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number,
  steps = 16,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    pts.push(polarToCartesian(cx, cy, r1, a));
  }
  for (let i = 0; i <= steps; i++) {
    const a = a1 - (a1 - a0) * (i / steps);
    pts.push(polarToCartesian(cx, cy, r0, a));
  }
  return pts;
}

function circlePath(cx: number, cy: number, r: number): string {
  return `M ${(cx + r).toFixed(1)} ${cy.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 1 1 ${(cx - r).toFixed(1)} ${cy.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 1 1 ${(cx + r).toFixed(1)} ${cy.toFixed(1)} Z`;
}

function sectorArcPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  if (r0 <= 0) {
    const p0 = polarToCartesian(cx, cy, r1, a0);
    const p1 = polarToCartesian(cx, cy, r1, a1);
    const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
    return `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} A ${r1.toFixed(1)} ${r1.toFixed(1)} 0 ${large} 1 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L ${cx.toFixed(1)} ${cy.toFixed(1)} Z`;
  }
  const p0o = polarToCartesian(cx, cy, r1, a0);
  const p1o = polarToCartesian(cx, cy, r1, a1);
  const p1i = polarToCartesian(cx, cy, r0, a1);
  const p0i = polarToCartesian(cx, cy, r0, a0);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  return `M ${p0o.x.toFixed(1)} ${p0o.y.toFixed(1)} A ${r1.toFixed(1)} ${r1.toFixed(1)} 0 ${large} 1 ${p1o.x.toFixed(1)} ${p1o.y.toFixed(1)} L ${p1i.x.toFixed(1)} ${p1i.y.toFixed(1)} A ${r0.toFixed(1)} ${r0.toFixed(1)} 0 ${large} 0 ${p0i.x.toFixed(1)} ${p0i.y.toFixed(1)} Z`;
}

function wiggleHorizontalLine(y: number, width: number, rng: () => number, amp: number, marge: number): { x: number; y: number }[] {
  const freq = 0.015 + rng() * 0.02;
  const phase = rng() * Math.PI * 2;
  const step = 28;
  const pts: { x: number; y: number }[] = [];
  for (let x = marge; x <= width - marge; x += step) {
    pts.push({ x, y: y + amp * Math.sin(x * freq + phase) });
  }
  pts.push({ x: width - marge, y: y + amp * Math.sin((width - marge) * freq + phase) });
  return pts;
}

function wiggleVerticalLine(x: number, height: number, rng: () => number, amp: number, marge: number): { x: number; y: number }[] {
  const freq = 0.015 + rng() * 0.02;
  const phase = rng() * Math.PI * 2;
  const step = 28;
  const pts: { x: number; y: number }[] = [];
  for (let y = marge; y <= height - marge; y += step) {
    pts.push({ x: x + amp * Math.sin(y * freq + phase), y });
  }
  pts.push({ x: x + amp * Math.sin((height - marge) * freq + phase), y: height - marge });
  return pts;
}

function wiggleRadialLine(cx: number, cy: number, a: number, maxR: number, rng: () => number, amp: number): { x: number; y: number }[] {
  const freq = 0.04 + rng() * 0.04;
  const phase = rng() * Math.PI * 2;
  const step = 30;
  const pts: { x: number; y: number }[] = [polarToCartesian(cx, cy, 0, a)];
  for (let r = step; r < maxR; r += step) {
    const angle = a + amp * Math.sin(r * freq + phase) / r;
    pts.push(polarToCartesian(cx, cy, r, angle));
  }
  pts.push(polarToCartesian(cx, cy, maxR, a + amp * Math.sin(maxR * freq + phase) / maxR));
  return pts;
}

function wiggleRing(cx: number, cy: number, r: number, rng: () => number, amp: number, steps = 48): { x: number; y: number }[] {
  const freq = 3 + Math.floor(rng() * 5);
  const phase = rng() * Math.PI * 2;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = r + amp * Math.sin(a * freq + phase);
    pts.push(polarToCartesian(cx, cy, rr, a));
  }
  return pts;
}

const MARGE = 24;

const PALETTES: Record<Esthetique, Palette> = {
  classique: {
    quartiers: {
      residentiel: "#f4eadd",
      commercial: "#f7e8b5",
      industriel: "#dedede",
      historique: "#ead9c3",
      parc: "#b5d6a5",
      eau: "#aec9e0",
      defaut: "#e8e2d6",
    },
    bats: {
      residentiel: ["#eaddc8", "#e5d8c1", "#efe4d4", "#dccfb8", "#e8dccb"],
      commercial: ["#f4e3a6", "#f1dc8b", "#e9c46a", "#f6e4b5", "#e3cf8a"],
      industriel: ["#c9c9c9", "#bfbfbf", "#d4d4d4", "#b8b8b8", "#c5c5c5"],
      historique: ["#e4d5c1", "#dcc9b2", "#e8ddc8", "#d3c1a9", "#decbb8"],
      parc: ["#b8d8a8"],
      eau: ["#aec9e0"],
      defaut: ["#d4c4b0"],
    },
    points: ["#e63946", "#f4a261", "#2a9d8f", "#264653", "#e9c46a", "#457b9d", "#a8dadc", "#1d3557", "#f1faee", "#d62828", "#6a4c93", "#8ac926", "#1982c4", "#ffca3a", "#ff595e"],
    routeCasing: "#9ca3af",
    routeSurface: "#ffffff",
    routeArtere: "#fdfbf7",
    routeBoulevard: "#f9f7f2",
    eau: "#aec9e0",
    eauStroke: "#8fb4d4",
    arbre: "#7cb369",
    fond: "#e8e2d6",
    gradient: { center: "#f7f4ef", edge: "#e8e2d6" },
    fontFamily: "system-ui, sans-serif",
  },
  baroque: {
    quartiers: {
      residentiel: "#e8d6c3",
      commercial: "#d4af37",
      industriel: "#8a8a8a",
      historique: "#7b2d3b",
      parc: "#4a7c59",
      eau: "#6b8cae",
      defaut: "#d4c4b0",
    },
    bats: {
      residentiel: ["#c9a87c", "#b8956a", "#d8c0a0", "#e6d2b5"],
      commercial: ["#b8860b", "#d4af37", "#c19a6b", "#f0e68c"],
      industriel: ["#696969", "#808080", "#a9a9a9"],
      historique: ["#722f37", "#8b3a3a", "#a0522d", "#cd853f"],
      parc: ["#556b2f"],
      eau: ["#5f9ea0"],
      defaut: ["#b0a090"],
    },
    points: ["#8b0000", "#d4af37", "#2f4f4f", "#800020", "#b8860b", "#556b2f", "#6b8cae", "#cd853f", "#7b2d3b", "#c9a87c"],
    routeCasing: "#5c4033",
    routeSurface: "#f5e6d3",
    routeArtere: "#f5e6d3",
    routeBoulevard: "#e6d2b5",
    eau: "#6b8cae",
    eauStroke: "#4a6b8a",
    arbre: "#4a7c59",
    fond: "#f5e6d3",
    gradient: { center: "#fff8f0", edge: "#e6d2b5" },
    fontFamily: "'Georgia', 'Times New Roman', serif",
  },
  "art-nouveau": {
    quartiers: {
      residentiel: "#f4e9d7",
      commercial: "#e6b89c",
      industriel: "#a8b5a0",
      historique: "#c9a9c9",
      parc: "#9caf88",
      eau: "#9ec6cf",
      defaut: "#e8e2d6",
    },
    bats: {
      residentiel: ["#eadcc8", "#d8c8b0", "#f0e6d8"],
      commercial: ["#e6b89c", "#d4a373", "#f4a261"],
      industriel: ["#8a9a8a", "#a8b5a0", "#c1d1c1"],
      historique: ["#c9a9c9", "#b89bb8", "#d8b8d8"],
      parc: ["#9caf88"],
      eau: ["#9ec6cf"],
      defaut: ["#d4c4b0"],
    },
    points: ["#9a4d76", "#d67d4a", "#5f8a6b", "#8a6b9a", "#c78d6b", "#6b9a8a", "#9e6b4a", "#7a5f8a", "#b88a9a", "#5f7a6b"],
    routeCasing: "#8a7f6b",
    routeSurface: "#fffcf5",
    routeArtere: "#fffcf5",
    routeBoulevard: "#f7f4ef",
    eau: "#9ec6cf",
    eauStroke: "#7eb6c0",
    arbre: "#7a9a5a",
    fond: "#f7f4ef",
    gradient: { center: "#fffdf8", edge: "#efe8d8" },
    fontFamily: "'Georgia', 'Palatino Linotype', serif",
  },
  "art-deco": {
    quartiers: {
      residentiel: "#f2f0e9",
      commercial: "#f4d03f",
      industriel: "#2c3e50",
      historique: "#1a252f",
      parc: "#58d68d",
      eau: "#48c9b0",
      defaut: "#d5d8dc",
    },
    bats: {
      residentiel: ["#e5e7e9", "#d5d8dc", "#f2f0e9"],
      commercial: ["#f4d03f", "#f7dc6f", "#b7950b"],
      industriel: ["#5d6d7e", "#2c3e50", "#85929e"],
      historique: ["#1a252f", "#2c3e50", "#5d6d7e"],
      parc: ["#58d68d"],
      eau: ["#48c9b0"],
      defaut: ["#bfc9ca"],
    },
    points: ["#1a252f", "#f4d03f", "#e74c3c", "#48c9b0", "#9b59b6", "#3498db", "#e67e22", "#2ecc71", "#34495e", "#f39c12"],
    routeCasing: "#1a252f",
    routeSurface: "#f2f0e9",
    routeArtere: "#f2f0e9",
    routeBoulevard: "#d5d8dc",
    eau: "#48c9b0",
    eauStroke: "#2c9e8d",
    arbre: "#58d68d",
    fond: "#f2f0e9",
    gradient: { center: "#ffffff", edge: "#d5d8dc" },
    fontFamily: "'Impact', 'Arial Black', sans-serif",
  },
  exotique: {
    quartiers: {
      residentiel: "#fdebd0",
      commercial: "#f39c12",
      industriel: "#7f8c8d",
      historique: "#8e44ad",
      parc: "#27ae60",
      eau: "#1abc9c",
      defaut: "#e5e7e9",
    },
    bats: {
      residentiel: ["#f9d7a7", "#f5cba7", "#fdebd0"],
      commercial: ["#f39c12", "#f1c40f", "#e67e22"],
      industriel: ["#7f8c8d", "#95a5a6", "#bdc3c7"],
      historique: ["#8e44ad", "#9b59b6", "#bb8fce"],
      parc: ["#27ae60"],
      eau: ["#1abc9c"],
      defaut: ["#d5d8dc"],
    },
    points: ["#e74c3c", "#f39c12", "#1abc9c", "#8e44ad", "#27ae60", "#d35400", "#3498db", "#c0392b", "#16a085", "#e67e22"],
    routeCasing: "#5d4037",
    routeSurface: "#fff8e7",
    routeArtere: "#fff8e7",
    routeBoulevard: "#f5e6cc",
    eau: "#1abc9c",
    eauStroke: "#16a085",
    arbre: "#27ae60",
    fond: "#fff8e7",
    gradient: { center: "#fffdf5", edge: "#f5e6cc" },
    fontFamily: "'Verdana', 'Geneva', sans-serif",
  },
};

function palettePour(esthetique: Esthetique): Palette {
  return PALETTES[esthetique] ?? PALETTES.classique;
}

const NOMS_RUES = [
  "Rue du Commerce", "Rue des Lilas", "Rue Saint-Martin", "Rue de la Paix",
  "Rue du Marché", "Rue de la République", "Rue du Pont", "Rue des Écoles",
  "Rue du Moulin", "Rue Victor Hugo", "Rue de la Fontaine", "Rue du Port",
  "Rue des Acacias", "Rue du Château", "Rue du Mont", "Rue du 14 Juillet",
  "Rue des Roses", "Rue du Bac", "Rue de l'Horloge",
  "Rue des Mille et Une Nuits", "Allée des Oubliés", "Rue du Val Perdu",
  "Passage du Songe", "Rue de l'Aube Éternelle", "Impasse des Étoiles Filantes",
  "Rue du Pavot Bleu", "Allée des Miroirs", "Rue du Chat qui Rêve",
  "Chemin des Violettes Noires", "Rue des Horloges Féeriques", "Rue du Rêveur",
  "Allée des Élégies", "Rue de la Lanterne", "Rue des Miroirs Vides",
  "Rue des Caravanes", "Rue des Épices", "Rue des Mille et Une Nuits",
];
const NOMS_AVENUES = [
  "Avenue de la Liberté", "Avenue de la République", "Avenue de la Paix",
  "Avenue de la Gare", "Avenue des Champs", "Avenue de l'Europe",
  "Avenue de la Victoire", "Avenue du Général de Gaulle", "Avenue du Nord",
  "Avenue du Sud", "Avenue de la Plage", "Avenue des Lumières",
  "Avenue de l'Atalante", "Avenue des Astres", "Avenue des Orphées",
  "Avenue des Météores", "Avenue du Crystal", "Avenue de la Lune Rousse",
  "Avenue des Mirages", "Avenue des Échos", "Avenue du Jazz",
  "Avenue des Glycines", "Avenue des Iris",
];
const NOMS_BOU = [
  "Boulevard de la Liberté", "Boulevard de l'Est", "Boulevard de l'Ouest",
  "Boulevard du Nord", "Boulevard du Sud", "Boulevard du Centre",
  "Boulevard de la République", "Boulevard des Capucines",
  "Boulevard des Mille Étoiles", "Boulevard du Rêve Éveillé",
  "Boulevard des Métamorphoses", "Boulevard de l'Horizon Bleu",
  "Boulevard du Roi Soleil", "Boulevard du Charleston",
];

function pickNom(rng: () => number, usedNames: Set<string>, list: string[]): string {
  let nom = list[Math.floor(rng() * list.length)];
  if (usedNames.has(nom)) nom = `${nom} ${Math.floor(rng() * 99) + 1}`;
  usedNames.add(nom);
  return nom;
}

const NOMS_POI: Record<string, string[]> = {
  bar: ["Le Café des Oubliés", "La Taverne du Rêveur", "Le Bar des Étoiles", "L'Auberge du Pavot Bleu", "Le Comptoir des Mirages", "Le Bistrot des Mille et Une Nuits", "Le Cabaret du Chat qui Rêve"],
  palais: ["Palais des Mille et Une Nuits", "Palais de l'Aube", "Palais du Roi Soleil", "Palais des Miroirs", "Palais du Val Perdu", "Palais du Songe"],
  grotte: ["Grotte des Chants", "Grotte de l'Écho", "Grotte du Cristal", "Grotte des Mille Lumières", "Grotte du Rêveur", "Grotte de l'Aube"],
  cinema: ["Cinéma Lune Rousse", "Cinéma des Astres", "Cinéma du Val Perdu", "Cinéma des Horloges Féeriques", "Cinéma du Rêveur", "Cinéma des Miroirs"],
  monument: ["Monument aux Rêves", "Obélisque du Sud", "Stèle des Élégies", "Monument du Val Perdu", "Colonne du Songe", "Statue de l'Aube"],
  statue: ["Statue de l'Aube", "Statue du Rêveur", "Statue du Val Perdu", "Statue des Miroirs", "Statue du Pavot Bleu", "Statue du Songe"],
  ecole: ["École des Miroirs", "École du Val Perdu", "École de l'Aube", "École des Étoiles Filantes", "École du Rêveur", "Académie des Mille et Une Nuits"],
  eglise: ["Chapelle des Oubliés", "Église du Pavot Bleu", "Basilique du Songe", "Chapelle de l'Aube Éternelle", "Cathédrale des Miroirs", "Sanctuaire du Val Perdu"],
  bibliotheque: ["Bibliothèque des Mille et Une Nuits", "Bibliothèque du Rêveur", "Bibliothèque des Miroirs", "Bibliothèque du Val Perdu", "Bibliothèque de l'Aube", "Le Grimoire des Étoiles"],
  theatre: ["Théâtre des Astres", "Théâtre du Rêveur", "Théâtre des Miroirs", "Théâtre du Pavot Bleu", "Théâtre de l'Aube", "Opéra des Élégies"],
  jardin: ["Jardin des Élégies", "Jardin du Rêveur", "Jardin des Miroirs", "Jardin du Val Perdu", "Jardin de l'Aube", "Jardin des Étoiles Filantes"],
  marais: ["Marais des Chants", "Marais du Songe", "Marais des Miroirs", "Marais de l'Aube", "Marais du Rêveur", "Marais des Étoiles"],
  temple: ["Temple du Sud", "Temple des Étoiles", "Temple du Rêveur", "Temple de l'Aube Éternelle", "Temple des Miroirs", "Temple du Pavot Bleu"],
};

function distanceToRoutes(px: number, py: number, routes: RouteVille[]): number {
  let min = Infinity;
  for (const r of routes) {
    min = Math.min(min, pointDistanceToPolyline(px, py, r.points));
  }
  return min;
}

function typePoiPour(typeDistrict: string, esthetique: Esthetique, rng: () => number): DecorationCarte["type"] {
  const pools: Record<string, DecorationCarte["type"][]> = {
    commercial: ["bar", "cinema", "marche", "theatre"],
    historique: ["palais", "monument", "statue", "eglise", "temple"],
    residentiel: ["ecole", "bibliotheque", "jardin", "statue"],
    industriel: ["grotte", "phare", "tour"],
    parc: ["jardin", "grotte", "statue", "fontaine"],
    eau: ["phare", "grotte"],
  };
  const pool = pools[typeDistrict] ?? pools["residentiel"];
  if (esthetique === "exotique") {
    const exotiquePool: DecorationCarte["type"][] = ["palais", "temple", "palmier", "bar", "marche", "minaret", "statue"];
    return exotiquePool[Math.floor(rng() * exotiquePool.length)];
  }
  return pool[Math.floor(rng() * pool.length)];
}

function placerPoi(
  poly: { x: number; y: number }[],
  typeDistrict: string,
  esthetique: Esthetique,
  rng: () => number,
  routes: RouteVille[],
  eau: EauVille[],
  usedNames: Set<string>,
  usedPositions: { x: number; y: number }[],
): DecorationCarte | null {
  for (let t = 0; t < 30; t++) {
    const p = randomPointInPolygon(poly, rng);
    if (!p || inWater(p.x, p.y, eau)) continue;
    const dRoutes = distanceToRoutes(p.x, p.y, routes);
    if (dRoutes < 12) continue;
    const tooClose = usedPositions.some((pos) => Math.hypot(pos.x - p.x, pos.y - p.y) < 24);
    if (tooClose) continue;
    const typePoi = typePoiPour(typeDistrict, esthetique, rng);
    const noms = NOMS_POI[typePoi] ?? NOMS_POI["monument"];
    const nom = pickNom(rng, usedNames, noms);
    usedPositions.push({ x: p.x, y: p.y });
    return { x: p.x, y: p.y, type: typePoi, nom };
  }
  return null;
}

function placerPoints(
  width: number,
  height: number,
  points: { nom: string; chemin: string }[],
  rng: () => number,
  routes: RouteVille[],
  eau: EauVille[],
  pointColors: string[],
): PointSonore[] {
  const pointsResult: PointSonore[] = [];
  const minDist = Math.max(18, Math.min(36, Math.sqrt((width * height) / (points.length * 12))));
  const maxTentatives = Math.max(500, points.length * 5);
  for (let i = 0; i < points.length; i++) {
    const nom = points[i].nom.replace(/\.[^.]+$/, "");
    const couleur = pointColors[i % pointColors.length];
    let placed = false;
    for (let t = 0; t < maxTentatives; t++) {
      let x: number;
      let y: number;
      if (rng() < 0.6 && routes.length > 0) {
        const r = routes[Math.floor(rng() * routes.length)];
        const segCount = r.points.length - 1;
        if (segCount > 0) {
          const idx = Math.floor(rng() * segCount);
          const p0 = r.points[idx];
          const p1 = r.points[idx + 1];
          const k = rng();
          x = p0.x + k * (p1.x - p0.x) + (rng() - 0.5) * 12;
          y = p0.y + k * (p1.y - p0.y) + (rng() - 0.5) * 12;
        } else {
          x = MARGE + rng() * (width - 2 * MARGE);
          y = MARGE + rng() * (height - 2 * MARGE);
        }
      } else {
        x = MARGE + rng() * (width - 2 * MARGE);
        y = MARGE + rng() * (height - 2 * MARGE);
      }
      x = clamp(x, MARGE, width - MARGE);
      y = clamp(y, MARGE, height - MARGE);
      if (inWater(x, y, eau)) continue;
      const tooClose = pointsResult.some((p) => Math.hypot(p.x - x, p.y - y) < minDist);
      if (!tooClose) {
        pointsResult.push({ x, y, nom, chemin: points[i].chemin, couleur });
        placed = true;
        break;
      }
    }
    if (!placed) {
      const x = MARGE + ((i * 47) % (width - 2 * MARGE));
      const y = MARGE + ((i * 61) % (height - 2 * MARGE));
      pointsResult.push({ x, y, nom, chemin: points[i].chemin, couleur });
    }
  }
  return pointsResult;
}

export function genererCarteVille(
  seed: number,
  width = 1920,
  height = 1080,
  points: { nom: string; chemin: string }[] = [],
  esthetique: Esthetique = "classique",
): CarteSonore {
  const rng = mulberry32(seed);
  const palette = palettePour(esthetique);
  const routes: RouteVille[] = [];
  const quartiers: QuartierVille[] = [];
  const batiments: BatimentVille[] = [];
  const espacesVerts: EspaceVertVille[] = [];
  const eau: EauVille[] = [];
  const decorations: DecorationCarte[] = [];
  const usedNames = new Set<string>();

  // ─── Eau : rivière et lac ───
  const riviere: { x: number; y: number }[] = [];
  const riverY = MARGE + rng() * (height - 2 * MARGE);
  const riverAmp = 18 + rng() * 35;
  const riverSteps = 40;
  for (let i = 0; i <= riverSteps; i++) {
    const x = MARGE + (i / riverSteps) * (width - 2 * MARGE);
    const y = riverY + Math.sin(i * 0.5 + rng() * 10) * riverAmp + (rng() - 0.5) * 14;
    riviere.push({ x, y });
  }
  eau.push({ points: riviere, type: "riviere" });

  if (rng() > 0.35) {
    const cx = MARGE + rng() * (width - 2 * MARGE);
    const cy = MARGE + rng() * (height - 2 * MARGE);
    const r = 22 + rng() * 36;
    const lakePoints: { x: number; y: number }[] = [];
    const lakeSteps = 18;
    for (let i = 0; i < lakeSteps; i++) {
      const a = (i / lakeSteps) * Math.PI * 2;
      const rr = r * (0.75 + 0.5 * rng());
      lakePoints.push(polarToCartesian(cx, cy, rr, a));
    }
    eau.push({ points: lakePoints, type: "lac" });
  }

  // ─── Routes : grille + boulevards courbes ───
  const nbH = Math.floor(6 + (height - 2 * MARGE) / 150) + Math.floor(rng() * 2);
  const nbV = Math.floor(6 + (width - 2 * MARGE) / 150) + Math.floor(rng() * 2);
  const yRoutes: number[] = [];
  const xRoutes: number[] = [];
  for (let i = 0; i < nbH; i++) yRoutes.push(MARGE + rng() * (height - 2 * MARGE));
  yRoutes.sort((a, b) => a - b);
  for (const y of yRoutes) {
    const isArtere = rng() < 0.3;
    const amp = isArtere ? 2 + rng() * 2 : 3 + rng() * 3;
    routes.push({
      points: wiggleHorizontalLine(y, width, rng, amp, MARGE),
      epaisseur: isArtere ? 7 : 3 + rng() * 2,
      nom: pickNom(rng, usedNames, isArtere ? NOMS_AVENUES : NOMS_RUES),
      type: isArtere ? "artere" : "rue",
      horizontal: true,
    });
  }
  for (let i = 0; i < nbV; i++) xRoutes.push(MARGE + rng() * (width - 2 * MARGE));
  xRoutes.sort((a, b) => a - b);
  for (const x of xRoutes) {
    const isArtere = rng() < 0.3;
    const amp = isArtere ? 2 + rng() * 2 : 3 + rng() * 3;
    routes.push({
      points: wiggleVerticalLine(x, height, rng, amp, MARGE),
      epaisseur: isArtere ? 7 : 3 + rng() * 2,
      nom: pickNom(rng, usedNames, isArtere ? NOMS_AVENUES : NOMS_RUES),
      type: isArtere ? "artere" : "rue",
      vertical: true,
    });
  }

  const nbBou = 1 + Math.floor(rng() * 2);
  for (let b = 0; b < nbBou; b++) {
    const pts: { x: number; y: number }[] = [];
    const steps = 5 + Math.floor(rng() * 3);
    let yBase = MARGE + rng() * (height - 2 * MARGE);
    const direction = rng() < 0.5 ? 1 : -1;
    for (let i = 0; i <= steps; i++) {
      const x = MARGE + (i / steps) * (width - 2 * MARGE);
      yBase += direction * (rng() - 0.45) * (height / steps) * 0.8;
      yBase = clamp(yBase, MARGE + 20, height - MARGE - 20);
      pts.push({ x, y: yBase });
    }
    routes.push({
      points: pts,
      epaisseur: 5 + rng() * 2,
      nom: pickNom(rng, usedNames, NOMS_BOU),
      type: "boulevard",
    });
  }

  // ─── Quartiers et bâtiments ───
  let centralDistrict: QuartierVille | null = null;
  let centralDist = Infinity;
  for (let i = 0; i < yRoutes.length - 1; i++) {
    for (let j = 0; j < xRoutes.length - 1; j++) {
      const x0 = xRoutes[j];
      const y0 = yRoutes[i];
      const x1 = xRoutes[j + 1];
      const y1 = yRoutes[i + 1];
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const dx = cx - width / 2;
      const dy = cy - height / 2;
      const dist = Math.hypot(dx, dy);
      const maxDist = Math.hypot(width / 2, height / 2);
      const t = rng();
      let type = "residentiel";
      if (dist < 0.2 * maxDist) type = t > 0.35 ? "commercial" : "historique";
      else if (dist > 0.65 * maxDist) type = t > 0.45 ? "industriel" : "residentiel";
      if (t > 0.88) type = "parc";
      if (inWater(cx, cy, eau)) type = "eau";

      const q: QuartierVille = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, type };
      quartiers.push(q);
      if (type !== "eau" && dist < centralDist) {
        centralDist = dist;
        centralDistrict = q;
      }

      if (type === "parc") {
        const rx = Math.max(6, (x1 - x0) / 2 - 8);
        const ry = Math.max(6, (y1 - y0) / 2 - 8);
        const arbres: { x: number; y: number; r: number }[] = [];
        const treeCount = 2 + Math.floor(rng() * 5);
        for (let k = 0; k < treeCount; k++) {
          const tx = cx + (rng() - 0.5) * rx * 1.4;
          const ty = cy + (rng() - 0.5) * ry * 1.4;
          arbres.push({ x: tx, y: ty, r: 2 + rng() * 2.5 });
        }
        espacesVerts.push({ cx, cy, rx, ry, arbres });
        if (esthetique === "exotique" && rng() < 0.6) {
          decorations.push({ x: cx, y: cy, type: "palmier" });
        }
      } else if (type !== "eau") {
        const pad = 4;
        const bx = x0 + pad;
        const by = y0 + pad;
        const bw = Math.max(0, x1 - x0 - 2 * pad);
        const bh = Math.max(0, y1 - y0 - 2 * pad);
        if (bw < 16 || bh < 16) continue;
        const colors = palette.bats[type] ?? palette.bats.defaut;
        const baseW = type === "commercial" ? 24 : type === "industriel" ? 32 : 11 + rng() * 8;
        const baseH = type === "commercial" ? 20 : type === "industriel" ? 22 : 10 + rng() * 7;
        const gap = 2;
        const alley = 5 + rng() * 4;
        let y = by;
        while (y + baseH + gap < by + bh) {
          let x = bx;
          while (x + 8 < bx + bw) {
            const w = Math.min(baseW + rng() * 10, bx + bw - x - gap);
            const h = Math.min(baseH + rng() * 8, by + bh - y - gap);
            if (w > 8 && h > 8) {
              batiments.push({
                x: x + gap,
                y: y + gap,
                w: Math.max(5, w - gap),
                h: Math.max(5, h - gap),
                couleur: colors[Math.floor(rng() * colors.length)],
                type,
              });
            }
            x += w + gap + (rng() < 0.15 ? 4 + rng() * 6 : 0);
          }
          y += baseH + gap + alley;
        }
      }
    }
  }

  // Monument central sur la ville en grille
  if (centralDistrict) {
    const cx = centralDistrict.x + centralDistrict.w / 2;
    const cy = centralDistrict.y + centralDistrict.h / 2;
    let type: DecorationCarte["type"] = rng() < 0.5 ? "fontaine" : "pavillon";
    if (esthetique === "exotique") type = "palais";
    else if (esthetique === "baroque" && rng() < 0.4) type = "tour";
    decorations.push({ x: cx, y: cy, type });
  }

  // Couche de dessins / lieux poétiques dans les quartiers
  const usedPoiPositions = decorations.map((d) => ({ x: d.x, y: d.y }));
  for (const q of quartiers) {
    if (q.type === "eau") continue;
    const count = Math.max(1, Math.floor((q.w * q.h) / 12000));
    const poly = [
      { x: q.x, y: q.y },
      { x: q.x + q.w, y: q.y },
      { x: q.x + q.w, y: q.y + q.h },
      { x: q.x, y: q.y + q.h },
    ];
    for (let k = 0; k < count; k++) {
      if (rng() > 0.7) continue;
      const poi = placerPoi(poly, q.type, esthetique, rng, routes, eau, usedNames, usedPoiPositions);
      if (poi) {
        decorations.push(poi);
        usedPoiPositions.push({ x: poi.x, y: poi.y });
      }
    }
  }

  const pointsResult = placerPoints(width, height, points, rng, routes, eau, palette.points);

  return {
    width, height, style: "ville", esthetique, routes, quartiers, batiments,
    espacesVerts, riviere, eau, points: pointsResult, graine: seed, decorations,
  };
}

export function genererCarteConcentrique(
  seed: number,
  width = 1920,
  height = 1080,
  points: { nom: string; chemin: string }[] = [],
  esthetique: Esthetique = "classique",
): CarteSonore {
  const rng = mulberry32(seed);
  const palette = palettePour(esthetique);
  const routes: RouteVille[] = [];
  const quartiers: QuartierVille[] = [];
  const batiments: BatimentVille[] = [];
  const espacesVerts: EspaceVertVille[] = [];
  const eau: EauVille[] = [];
  const decorations: DecorationCarte[] = [];
  const usedNames = new Set<string>();

  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(cx, cy) - MARGE;
  const innerR = 55 + rng() * 30;
  const ringCount = 5 + Math.floor(rng() * 3);
  const radii: number[] = [innerR];
  for (let i = 1; i < ringCount; i++) {
    const t = i / (ringCount - 1);
    const base = innerR + (maxR - innerR) * t;
    const r = base * (0.92 + 0.16 * rng());
    radii.push(clamp(r, radii[i - 1] + 30, maxR - 10));
  }

  const sectorCount = 8 + Math.floor(rng() * 5);
  const angles: number[] = [0];
  for (let i = 1; i < sectorCount; i++) {
    const base = (i / sectorCount) * Math.PI * 2;
    angles.push(base + (rng() - 0.5) * 0.1);
  }
  angles.push(Math.PI * 2);

  // Centre historique/commercial
  const centreType = rng() < 0.7 ? "historique" : "commercial";
  quartiers.push({ x: cx, y: cy, w: 0, h: 0, type: centreType, d: circlePath(cx, cy, innerR) });

  // Anneaux et secteurs
  const sectorsForPois: { r0: number; r1: number; a0: number; a1: number; type: string }[] = [];
  for (let i = 0; i < radii.length - 1; i++) {
    const r0 = radii[i];
    const r1 = radii[i + 1];
    for (let j = 0; j < angles.length - 1; j++) {
      const a0 = angles[j];
      const a1 = angles[j + 1];
      let type = "residentiel";
      if (i === 0) type = rng() < 0.6 ? "commercial" : "historique";
      else if (i === radii.length - 2) type = rng() < 0.5 ? "industriel" : "residentiel";
      else {
        const t = rng();
        if (t < 0.2) type = "commercial";
        else if (t < 0.35) type = "historique";
        else if (t < 0.5) type = "parc";
        else if (t < 0.6) type = "eau";
        else type = "residentiel";
      }
      const d = sectorArcPath(cx, cy, r0, r1, a0, a1);
      quartiers.push({ x: cx, y: cy, w: 0, h: 0, type, d });
      sectorsForPois.push({ r0, r1, a0, a1, type });

      if (type === "parc") {
        const arbres: { x: number; y: number; r: number }[] = [];
        const n = 2 + Math.floor(rng() * 4);
        for (let k = 0; k < n; k++) {
          const rr = r0 + 6 + rng() * (r1 - r0 - 12);
          const aa = a0 + 0.1 + rng() * (a1 - a0 - 0.2);
          arbres.push({ x: cx + Math.cos(aa) * rr, y: cy + Math.sin(aa) * rr, r: 2 + rng() * 3 });
        }
        espacesVerts.push({ cx, cy, rx: 0, ry: 0, d, arbres });
        if (esthetique === "exotique" && rng() < 0.5) {
          const aa = a0 + (a1 - a0) * rng();
          const rr = r0 + (r1 - r0) * 0.5;
          decorations.push({ x: cx + Math.cos(aa) * rr, y: cy + Math.sin(aa) * rr, type: "palmier" });
        }
      } else if (type === "eau") {
        eau.push({ type: "lac", points: sectorPoints(cx, cy, r0, r1, a0, a1, 8), d });
      } else {
        const colors = palette.bats[type] ?? palette.bats.defaut;
        const area = (r1 * r1 - r0 * r0) * (a1 - a0) / 2;
        const count = Math.max(2, Math.floor(area / 700));
        for (let k = 0; k < count; k++) {
          const rr = r0 + 8 + rng() * (r1 - r0 - 16);
          const aa = a0 + 0.1 + rng() * (a1 - a0 - 0.2);
          const w = 4 + rng() * 8;
          const h = 4 + rng() * 8;
          const x = cx + Math.cos(aa) * rr;
          const y = cy + Math.sin(aa) * rr;
          batiments.push({ x, y, w, h, couleur: colors[Math.floor(rng() * colors.length)], type, r: rr, a: aa });
        }
      }
    }
  }

  // Routes : anneaux + radiales
  for (let i = 0; i < radii.length; i++) {
    const r = radii[i];
    const amp = i === 0 ? 1 : 2 + rng() * 2;
    routes.push({
      points: wiggleRing(cx, cy, r, rng, amp, 48),
      epaisseur: i === 0 ? 7 : 3 + rng() * 2,
      nom: pickNom(rng, usedNames, i === 0 ? NOMS_BOU : NOMS_RUES),
      type: i === 0 ? "boulevard" : "rue",
    });
  }
  for (let j = 0; j < sectorCount; j++) {
    const a = angles[j] + (angles[j + 1] - angles[j]) * rng();
    routes.push({
      points: wiggleRadialLine(cx, cy, a, maxR, rng, 6 + rng() * 6),
      epaisseur: 3 + rng() * 2,
      nom: pickNom(rng, usedNames, NOMS_AVENUES),
      type: "rue",
    });
  }

  // Monument central
  let decoType: DecorationCarte["type"];
  if (esthetique === "exotique") {
    decoType = "palais";
  } else {
    const decoRoll = rng();
    decoType = decoRoll < 0.25 ? "fontaine" : decoRoll < 0.5 ? "tour" : decoRoll < 0.75 ? "pavillon" : "phare";
  }
  decorations.push({ x: cx, y: cy, type: decoType });

  // Couche de dessins / lieux poétiques dans les secteurs
  const usedPoiPositions = decorations.map((d) => ({ x: d.x, y: d.y }));
  for (const s of sectorsForPois) {
    if (s.type === "eau") continue;
    const sectorPoly = sectorPoints(cx, cy, s.r0, s.r1, s.a0, s.a1, 12);
    const area = (s.r1 * s.r1 - s.r0 * s.r0) * (s.a1 - s.a0) / 2;
    const poiCount = Math.max(1, Math.floor(area / 8000));
    for (let k = 0; k < poiCount; k++) {
      if (rng() > 0.7) continue;
      const poi = placerPoi(sectorPoly, s.type, esthetique, rng, routes, eau, usedNames, usedPoiPositions);
      if (poi) {
        decorations.push(poi);
        usedPoiPositions.push({ x: poi.x, y: poi.y });
      }
    }
  }

  const pointsResult = placerPoints(width, height, points, rng, routes, eau, palette.points);

  return {
    width, height, style: "concentrique", esthetique, routes, quartiers, batiments,
    espacesVerts, riviere: [], eau, points: pointsResult, graine: seed,
    centre: { x: cx, y: cy }, decorations,
  };
}

function genererCarteCellulaire(
  seed: number,
  width: number,
  height: number,
  points: { nom: string; chemin: string }[],
  esthetique: Esthetique,
  style: "organique" | "voronoi",
): CarteSonore {
  const rng = mulberry32(seed);
  const palette = palettePour(esthetique);
  const routes: RouteVille[] = [];
  const quartiers: QuartierVille[] = [];
  const batiments: BatimentVille[] = [];
  const espacesVerts: EspaceVertVille[] = [];
  const eau: EauVille[] = [];
  const decorations: DecorationCarte[] = [];
  const usedNames = new Set<string>();

  // Graines de cellules (générateur Voronoï maison par demi-plans)
  const seedCount = Math.max(10, Math.floor(12 + (width * height) / 100000 + rng() * 8));
  const seeds: { x: number; y: number }[] = [];
  const minDist = 60;
  for (let t = 0; t < seedCount * 10 && seeds.length < seedCount; t++) {
    const x = MARGE + rng() * (width - 2 * MARGE);
    const y = MARGE + rng() * (height - 2 * MARGE);
    const tooClose = seeds.some((s) => Math.hypot(s.x - x, s.y - y) < minDist);
    if (!tooClose) seeds.push({ x, y });
  }

  const bbox = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];

  interface Cellule {
    seed: { x: number; y: number };
    poly: { x: number; y: number }[];
    area: number;
    centroid: { x: number; y: number };
    type?: string;
  }
  const cells: Cellule[] = [];
  for (let i = 0; i < seeds.length; i++) {
    let poly = bbox;
    const sx = seeds[i].x;
    const sy = seeds[i].y;
    for (let j = 0; j < seeds.length; j++) {
      if (i === j) continue;
      const dx = seeds[j].x - sx;
      const dy = seeds[j].y - sy;
      const mx = (sx + seeds[j].x) / 2;
      const my = (sy + seeds[j].y) / 2;
      poly = clipPolygon(poly, mx, my, dx, dy);
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    const area = shoelaceArea(poly);
    if (area > 100) {
      cells.push({ seed: seeds[i], poly, area, centroid: centroidPolygon(poly) });
    }
  }

  interface CellEdge {
    a: { x: number; y: number };
    b: { x: number; y: number };
    curve?: { x: number; y: number };
  }
  const edgeMap = new Map<string, CellEdge>();
  for (const c of cells) {
    for (let i = 0; i < c.poly.length; i++) {
      const a = c.poly[i];
      const b = c.poly[(i + 1) % c.poly.length];
      const key = edgeKey(a, b);
      if (!edgeMap.has(key)) edgeMap.set(key, { a, b });
    }
  }

  const isOrganic = style === "organique";
  if (isOrganic) {
    for (const edge of edgeMap.values()) {
      const dx = edge.b.x - edge.a.x;
      const dy = edge.b.y - edge.a.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      const mx = (edge.a.x + edge.b.x) / 2;
      const my = (edge.a.y + edge.b.y) / 2;
      const nx = -dy / len;
      const ny = dx / len;
      const hash = mulberry32(Math.floor(mx * 1000) + Math.floor(my * 1000) * 137 + Math.floor(len));
      const sign = hash() < 0.5 ? -1 : 1;
      const amp = (0.03 + hash() * 0.06) * len;
      edge.curve = { x: clamp(mx + nx * amp * sign, 2, width - 2), y: clamp(my + ny * amp * sign, 2, height - 2) };
    }
  }

  function cellPathString(poly: { x: number; y: number }[]): string {
    let d = "";
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const edge = edgeMap.get(edgeKey(a, b))!;
      if (i === 0) d += `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} `;
      if (isOrganic && edge?.curve) {
        d += `Q ${edge.curve.x.toFixed(1)} ${edge.curve.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)} `;
      } else {
        d += `L ${b.x.toFixed(1)} ${b.y.toFixed(1)} `;
      }
    }
    return d + "Z";
  }

  // Eau : rivière sinueuse et lac
  const riviere: { x: number; y: number }[] = [];
  const riverY = MARGE + rng() * (height - 2 * MARGE);
  const riverAmp = 18 + rng() * 35;
  const riverSteps = 40;
  for (let i = 0; i <= riverSteps; i++) {
    const x = MARGE + (i / riverSteps) * (width - 2 * MARGE);
    const y = riverY + Math.sin(i * 0.5 + rng() * 10) * riverAmp + (rng() - 0.5) * 14;
    riviere.push({ x, y });
  }
  eau.push({ points: riviere, type: "riviere" });

  if (rng() > 0.4) {
    const cx = MARGE + rng() * (width - 2 * MARGE);
    const cy = MARGE + rng() * (height - 2 * MARGE);
    const r = 22 + rng() * 36;
    const lakePoints: { x: number; y: number }[] = [];
    const lakeSteps = 18;
    for (let i = 0; i < lakeSteps; i++) {
      const a = (i / lakeSteps) * Math.PI * 2;
      const rr = r * (0.75 + 0.5 * rng());
      lakePoints.push(polarToCartesian(cx, cy, rr, a));
    }
    eau.push({ points: lakePoints, type: "lac" });
  }

  // Classification des cellules, quartiers, bâtiments, espaces verts
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.hypot(cx, cy);
  let centralCell = cells[0];
  let centralDist = Infinity;
  for (const c of cells) {
    const dist = Math.hypot(c.centroid.x - cx, c.centroid.y - cy);
    let type = "residentiel";
    if (inWater(c.centroid.x, c.centroid.y, eau)) type = "eau";
    else if (dist < 0.25 * maxDist) type = rng() < 0.6 ? "commercial" : "historique";
    else if (dist > 0.7 * maxDist) type = rng() < 0.5 ? "industriel" : "residentiel";
    else if (rng() < 0.2) type = "parc";

    if (type !== "eau" && dist < centralDist) {
      centralDist = dist;
      centralCell = c;
    }
    const d = cellPathString(c.poly);
    quartiers.push({ x: c.centroid.x, y: c.centroid.y, w: 0, h: 0, type, d });
    c.type = type;

    if (type === "parc") {
      const arbres: { x: number; y: number; r: number }[] = [];
      const n = 2 + Math.floor(rng() * 4);
      for (let k = 0; k < n; k++) {
        const p = randomPointInPolygon(c.poly, rng);
        if (p) arbres.push({ x: p.x, y: p.y, r: 2 + rng() * 3 });
      }
      espacesVerts.push({ cx: c.centroid.x, cy: c.centroid.y, rx: 0, ry: 0, d, arbres });
      if (esthetique === "exotique" && rng() < 0.5) {
        decorations.push({ x: c.centroid.x, y: c.centroid.y, type: "palmier" });
      }
    } else if (type === "eau") {
      eau.push({ type: "lac", points: c.poly, d });
    } else {
      const colors = palette.bats[type] ?? palette.bats.defaut;
      const shrink = isOrganic ? 0.78 : 0.85;
      const shrunk = shrinkPolygon(c.poly, shrink);
      const count = Math.max(1, Math.floor(c.area / 900));
      for (let k = 0; k < count; k++) {
        const p = randomPointInPolygon(shrunk, rng);
        if (!p || inWater(p.x, p.y, eau)) continue;
        const w = 5 + rng() * 8;
        const h = 4 + rng() * 7;
        const angle = rng() * Math.PI * 2;
        const d = batimentPath(p.x, p.y, w, h, angle, isOrganic);
        batiments.push({ x: p.x, y: p.y, w, h, couleur: colors[Math.floor(rng() * colors.length)], type, d });
      }
      if (type === "commercial" && rng() < 0.25) {
        decorations.push({ x: c.centroid.x, y: c.centroid.y, type: "marche" });
      } else if (type === "industriel" && rng() < 0.15) {
        decorations.push({ x: c.centroid.x, y: c.centroid.y, type: "tour" });
      }
    }
  }

  // Monument central
  if (centralCell) {
    const type: DecorationCarte["type"] = esthetique === "exotique" ? "palais" : rng() < 0.5 ? "fontaine" : "pavillon";
    decorations.push({ x: centralCell.centroid.x, y: centralCell.centroid.y, type });
  }

  // Routes : une par arête de cellule
  for (const edge of edgeMap.values()) {
    const len = Math.hypot(edge.b.x - edge.a.x, edge.b.y - edge.a.y);
    const steps = Math.max(2, Math.floor(len / 35));
    const pts = edge.curve ? sampleQuadraticBezier(edge.a, edge.b, edge.curve, steps) : [edge.a, edge.b];
    const mid = { x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 };
    const distCenter = Math.hypot(mid.x - cx, mid.y - cy);
    let type: "artere" | "rue" | "boulevard" = "rue";
    if (distCenter < 0.25 * maxDist && len > 60) type = "boulevard";
    else if (len > 100) type = "artere";
    routes.push({
      points: pts,
      epaisseur: type === "boulevard" ? 6 : type === "artere" ? 5 : 3 + rng() * 2,
      nom: pickNom(rng, usedNames, type === "boulevard" ? NOMS_BOU : type === "artere" ? NOMS_AVENUES : NOMS_RUES),
      type,
    });
  }

  // Couche de dessins / lieux poétiques dans les cellules
  const usedPoiPositions = decorations.map((d) => ({ x: d.x, y: d.y }));
  for (const c of cells) {
    if (c.type === "eau" || !c.type) continue;
    const poiCount = Math.max(1, Math.floor(c.area / 10000));
    for (let k = 0; k < poiCount; k++) {
      if (rng() > 0.7) continue;
      const poi = placerPoi(c.poly, c.type, esthetique, rng, routes, eau, usedNames, usedPoiPositions);
      if (poi) {
        decorations.push(poi);
        usedPoiPositions.push({ x: poi.x, y: poi.y });
      }
    }
  }

  const pointsResult = placerPoints(width, height, points, rng, routes, eau, palette.points);

  return {
    width, height, style, esthetique, routes, quartiers, batiments,
    espacesVerts, riviere, eau, points: pointsResult, graine: seed,
    centre: { x: cx, y: cy }, decorations,
  };
}

export function genererCarteVoronoi(
  seed: number,
  width = 1920,
  height = 1080,
  points: { nom: string; chemin: string }[] = [],
  esthetique: Esthetique = "classique",
): CarteSonore {
  return genererCarteCellulaire(seed, width, height, points, esthetique, "voronoi");
}

export function genererCarteOrganique(
  seed: number,
  width = 1920,
  height = 1080,
  points: { nom: string; chemin: string }[] = [],
  esthetique: Esthetique = "classique",
): CarteSonore {
  return genererCarteCellulaire(seed, width, height, points, esthetique, "organique");
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
}

function safeFileName(nom: string): string {
  return nom.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function pathString(pts: { x: number; y: number }[]): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

function polygonPath(poly: { x: number; y: number }[]): string {
  return pathString(poly) + " Z";
}

function buildingVariant(x: number, y: number, max: number): number {
  return Math.floor(mulberry32(Math.floor(x * 1000) + Math.floor(y * 1000) * 137 + max * 7)() * max);
}

function renderBatimentGrid(b: BatimentVille, esthetique: Esthetique): string {
  const x = b.x, y = b.y, w = b.w, h = b.h;
  const color = b.couleur;
  const stroke = "#00000025";
  if (b.d) {
    const detail = buildingVariant(x, y, 2) === 0
      ? `<rect x="${(x - w * 0.1).toFixed(1)}" y="${(y + h / 2 - h * 0.25).toFixed(1)}" width="${(w * 0.2).toFixed(1)}" height="${(h * 0.25).toFixed(1)}" fill="#5d4037" opacity="0.5" />`
      : "";
    return `<path d="${b.d}" fill="${color}" stroke="${stroke}" stroke-width="0.5" />${detail}`;
  }
  switch (esthetique) {
    case "art-deco": {
      const v = buildingVariant(x, y, 3);
      const step = Math.min(w, h) * 0.2;
      if (v === 0) return `<polygon points="${x},${y + h} ${x + w},${y + h} ${x + w},${y + step} ${x + w - step},${y} ${x + step},${y} ${x},${y + step}" fill="${color}" stroke="${stroke}" stroke-width="0.5" />`;
      if (v === 1) {
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" stroke="${stroke}" stroke-width="0.5" rx="${Math.min(w, h) * 0.2}" /><line x1="${x + w * 0.25}" y1="${y}" x2="${x + w * 0.25}" y2="${y + h}" stroke="${stroke}" stroke-width="1.2" /><line x1="${x + w * 0.5}" y1="${y}" x2="${x + w * 0.5}" y2="${y + h}" stroke="${stroke}" stroke-width="1.2" /><line x1="${x + w * 0.75}" y1="${y}" x2="${x + w * 0.75}" y2="${y + h}" stroke="${stroke}" stroke-width="1.2" />`;
      }
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" fill="none" stroke="${stroke}" stroke-width="1" />`;
    }
    case "baroque": {
      const v = buildingVariant(x, y, 3);
      const r = w / 2;
      if (v === 0) return `<rect x="${x}" y="${y + r}" width="${w}" height="${h - r}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><path d="M ${x} ${y + r} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${x + w} ${y + r}" fill="${color}" stroke="${stroke}" stroke-width="0.5" />`;
      if (v === 1) {
        const step = h / 4;
        return `<path d="M ${x} ${y + h} L ${x + w} ${y + h} L ${x + w} ${y + step} L ${x + w * 0.75} ${y + step} L ${x + w * 0.75} ${y} L ${x + w * 0.25} ${y} L ${x + w * 0.25} ${y + step} L ${x} ${y + step} Z" fill="${color}" stroke="${stroke}" stroke-width="0.5" />`;
      }
      return `<rect x="${x}" y="${y + h * 0.3}" width="${w}" height="${h * 0.7}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><path d="M ${x + w / 2} ${y} L ${x + w} ${y + h * 0.3} L ${x} ${y + h * 0.3} Z" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><circle cx="${x + w / 2}" cy="${y + h * 0.3}" r="${Math.min(w, h) * 0.08}" fill="${color}" stroke="${stroke}" stroke-width="0.5" />`;
    }
    case "art-nouveau": {
      const v = buildingVariant(x, y, 2);
      const cy = y + h * 0.25;
      if (v === 0) return `<path d="M ${x} ${y + h} L ${x + w} ${y + h} L ${x + w} ${cy} Q ${x + w * 0.75} ${y} ${x + w * 0.5} ${cy} Q ${x + w * 0.25} ${y + h * 0.5} ${x} ${cy} Z" fill="${color}" stroke="${stroke}" stroke-width="0.5" />`;
      return `<rect x="${x}" y="${y + h * 0.4}" width="${w}" height="${h * 0.6}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><circle cx="${x + w / 2}" cy="${y + h * 0.4}" r="${Math.min(w, h) * 0.35}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><path d="M ${x} ${y + h * 0.4} Q ${x + w / 2} ${y - h * 0.1} ${x + w} ${y + h * 0.4}" fill="none" stroke="${stroke}" stroke-width="0.5" />`;
    }
    case "exotique": {
      const v = buildingVariant(x, y, 3);
      const r = w / 2;
      const doorW = Math.min(w * 0.3, 10);
      const doorH = h * 0.35;
      const door = `<path d="M ${x + r - doorW / 2} ${y + h} L ${x + r - doorW / 2} ${y + h - doorH} A ${(doorW / 2).toFixed(1)} ${(doorW / 2).toFixed(1)} 0 0 1 ${x + r + doorW / 2} ${y + h - doorH} L ${x + r + doorW / 2} ${y + h}" fill="#5d4037" opacity="0.6" />`;
      if (v === 0) {
        const domeR = Math.min(r * 0.55, h * 0.18);
        return `<rect x="${x}" y="${y + r}" width="${w}" height="${h - r}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><path d="M ${x} ${y + r} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${x + w} ${y + r}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><circle cx="${x + r}" cy="${y + r}" r="${domeR.toFixed(1)}" fill="${color}" stroke="${stroke}" stroke-width="0.5" />${door}`;
      }
      if (v === 1) {
        return `<rect x="${x}" y="${y + r}" width="${w}" height="${h - r}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><path d="M ${x} ${y + r} Q ${x + r} ${y - r} ${x + w} ${y + r}" fill="${color}" stroke="${stroke}" stroke-width="0.5" />${door}`;
      }
      return `<rect x="${x}" y="${y + h * 0.4}" width="${w}" height="${h * 0.6}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><rect x="${x + r - 1.5}" y="${y - h * 0.2}" width="3" height="${h * 0.6}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><circle cx="${x + r}" cy="${y - h * 0.2}" r="3" fill="${color}" stroke="${stroke}" stroke-width="0.5" />${door}`;
    }
    case "classique":
    default: {
      const v = buildingVariant(x, y, 4);
      if (v === 0) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" stroke="${stroke}" stroke-width="0.5" />`;
      if (v === 1) return `<path d="M ${x} ${y + h} L ${x + w} ${y + h} L ${x + w} ${y + h * 0.35} L ${x + w / 2} ${y} L ${x} ${y + h * 0.35} Z" fill="${color}" stroke="${stroke}" stroke-width="0.5" />`;
      if (v === 2) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><rect x="${x + w - 4}" y="${y - 6}" width="3" height="8" fill="${color}" stroke="${stroke}" stroke-width="0.5" />`;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><rect x="${x + 3}" y="${y + 3}" width="${w * 0.25}" height="${h * 0.2}" fill="#ffffff" opacity="0.45" /><rect x="${x + w - 3 - w * 0.25}" y="${y + 3}" width="${w * 0.25}" height="${h * 0.2}" fill="#ffffff" opacity="0.45" />`;
    }
  }
}

function renderBatimentConcentrique(b: BatimentVille, centre: { x: number; y: number }, esthetique: Esthetique): string {
  const cx = centre.x, cy = centre.y;
  const r = b.r ?? Math.hypot(b.x - cx, b.y - cy);
  const a = b.a ?? Math.atan2(b.y - cy, b.x - cx);
  if (r <= 0) return "";
  const da = Math.min(Math.PI / 4, (b.w / 2) / r);
  const dr = b.h / 2;
  const r0 = Math.max(0, r - dr);
  const r1 = r + dr;
  const a0 = a - da, a1 = a + da;
  const p0o = polarToCartesian(cx, cy, r1, a0);
  const p1o = polarToCartesian(cx, cy, r1, a1);
  const p1i = polarToCartesian(cx, cy, r0, a1);
  const p0i = polarToCartesian(cx, cy, r0, a0);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  const d = `M ${p0o.x.toFixed(1)} ${p0o.y.toFixed(1)} A ${r1.toFixed(1)} ${r1.toFixed(1)} 0 ${large} 1 ${p1o.x.toFixed(1)} ${p1o.y.toFixed(1)} L ${p1i.x.toFixed(1)} ${p1i.y.toFixed(1)} A ${r0.toFixed(1)} ${r0.toFixed(1)} 0 ${large} 0 ${p0i.x.toFixed(1)} ${p0i.y.toFixed(1)} Z`;
  const stroke = esthetique === "art-deco" ? "#1a252f" : "#00000025";
  const center = polarToCartesian(cx, cy, r1, a);
  const v = buildingVariant(center.x, center.y, 3);
  if (esthetique === "exotique") {
    const domeR = Math.min(da * r * 0.6, dr * 0.8);
    return `<g><path d="${d}" fill="${b.couleur}" stroke="${stroke}" stroke-width="0.5" /><circle cx="${center.x.toFixed(1)}" cy="${center.y.toFixed(1)}" r="${domeR.toFixed(1)}" fill="${b.couleur}" stroke="${stroke}" stroke-width="0.5" /></g>`;
  }
  if (v === 0) return `<path d="${d}" fill="${b.couleur}" stroke="${stroke}" stroke-width="0.5" />`;
  if (v === 1) return `<g><path d="${d}" fill="${b.couleur}" stroke="${stroke}" stroke-width="0.5" /><circle cx="${center.x.toFixed(1)}" cy="${center.y.toFixed(1)}" r="${Math.min(dr, da * r * 0.3).toFixed(1)}" fill="#ffffff" opacity="0.5" /></g>`;
  return `<g><path d="${d}" fill="${b.couleur}" stroke="${stroke}" stroke-width="0.5" /><line x1="${center.x.toFixed(1)}" y1="${center.y.toFixed(1)}" x2="${center.x.toFixed(1)}" y2="${(center.y - 10).toFixed(1)}" stroke="#333333" stroke-width="0.8" /></g>`;
}

function renderDecoration(d: DecorationCarte, palette: Palette, esthetique: Esthetique): string {
  const t = `transform="translate(${d.x.toFixed(1)}, ${d.y.toFixed(1)})"`;
  const accent =
    esthetique === "baroque" ? "#d4af37" :
    esthetique === "art-deco" ? "#f4d03f" :
    esthetique === "exotique" ? "#f39c12" :
    esthetique === "art-nouveau" ? "#c9a9c9" : "#fff";
  const c1 = palette.bats.historique[0] ?? palette.bats.defaut[0];
  const c2 = palette.bats.commercial[0] ?? palette.bats.defaut[0];
  let icon = "";
  switch (d.type) {
    case "fontaine":
      icon = `<circle r="16" fill="${palette.eau}" opacity="0.8" /><circle r="8" fill="${palette.eauStroke}" /><path d="M-6,-12 Q0,-24 6,-12" stroke="#fff" stroke-width="1.5" fill="none" /><path d="M-9,-8 Q0,-26 9,-8" stroke="#fff" stroke-width="1" fill="none" opacity="0.7" />`;
      break;
    case "tour":
      icon = `<rect x="-6" y="-38" width="12" height="38" fill="${palette.bats.historique[0]}" stroke="#5c4033" stroke-width="1" /><polygon points="-7,-38 0,-48 7,-38" fill="${accent}" /><rect x="-2" y="-30" width="4" height="6" fill="#4a3b2a" />`;
      break;
    case "pavillon":
      icon = `<polygon points="-18,0 0,-24 18,0" fill="${palette.bats.commercial[0]}" stroke="#333" stroke-width="1" /><rect x="-10" y="0" width="20" height="12" fill="${palette.bats.residentiel[0]}" stroke="#333" stroke-width="1" /><rect x="-3" y="4" width="6" height="8" fill="#6c757d" />`;
      break;
    case "phare":
      icon = `<rect x="-5" y="-32" width="10" height="32" fill="#fff" stroke="#999" stroke-width="1" /><circle r="6" cy="-34" fill="${accent}" stroke="#e9c46a" stroke-width="1" /><path d="M6,-34 L32,-42 L32,-26 Z" fill="${accent}" opacity="0.25" />`;
      break;
    case "arbre":
      icon = `<circle r="9" fill="${palette.arbre}" opacity="0.8" /><circle r="5" cy="-6" fill="${palette.arbre}" /><circle r="4" cx="5" cy="-2" fill="${palette.arbre}" />`;
      break;
    case "palais":
      icon = `<rect x="-22" y="-10" width="44" height="24" fill="${c2}" stroke="#3e2723" stroke-width="1" /><path d="M-22,-10 Q0,-34 22,-10" fill="${c1}" stroke="#3e2723" stroke-width="1" /><circle cx="0" cy="-10" r="10" fill="${c1}" stroke="#3e2723" stroke-width="1" /><rect x="-26" y="-22" width="4" height="24" fill="${c2}" stroke="#3e2723" stroke-width="1" /><rect x="22" y="-22" width="4" height="24" fill="${c2}" stroke="#3e2723" stroke-width="1" /><rect x="-28" y="-24" width="8" height="3" fill="${accent}" /><rect x="20" y="-24" width="8" height="3" fill="${accent}" />`;
      break;
    case "minaret":
      icon = `<rect x="-4" y="-34" width="8" height="34" fill="${palette.bats.historique[0]}" stroke="#3e2723" stroke-width="1" /><rect x="-5" y="-36" width="10" height="4" fill="${accent}" stroke="#3e2723" stroke-width="1" /><rect x="-3" y="-30" width="6" height="2" fill="#3e2723" opacity="0.3" /><rect x="-3" y="-22" width="6" height="2" fill="#3e2723" opacity="0.3" />`;
      break;
    case "palmier":
      icon = `<path d="M0,10 Q2,0 0,-10" stroke="#8B5A2B" stroke-width="2" fill="none" /><path d="M0,-10 Q-8,-22 -18,-14 M0,-10 Q-3,-20 -8,-26 M0,-10 Q8,-22 18,-14 M0,-10 Q3,-20 8,-26 M0,-10 Q0,-28 0,-34" stroke="${palette.arbre}" stroke-width="1.5" fill="none" />`;
      break;
    case "marche":
      icon = `<rect x="-16" y="-8" width="32" height="16" fill="${palette.bats.commercial[0]}" stroke="#3e2723" stroke-width="1" /><line x1="-16" y1="0" x2="16" y2="0" stroke="#3e2723" stroke-width="1" /><path d="M-16,-8 L-10,-14 L-4,-8 L2,-14 L8,-8 L14,-14 L20,-8" fill="${accent}" stroke="#3e2723" stroke-width="1" />`;
      break;
    case "bar":
      icon = `<rect x="-8" y="0" width="16" height="8" rx="2" fill="#5d4037" /><rect x="-5" y="-10" width="4" height="10" fill="#8B5A2B" /><circle cx="3" cy="-8" r="3" fill="#fff" opacity="0.9" />`;
      break;
    case "grotte":
      icon = `<path d="M-14,8 Q-14,-12 0,-12 Q14,-12 14,8 Z" fill="#6d5a44" stroke="#3e2723" stroke-width="1" /><path d="M-8,8 Q-8,-4 0,-4 Q8,-4 8,8 Z" fill="#3e2723" />`;
      break;
    case "cinema":
      icon = `<rect x="-10" y="-8" width="20" height="14" fill="#333" stroke="#fff" stroke-width="1" /><circle cx="-6" cy="-12" r="2" fill="#fff" /><circle cx="0" cy="-12" r="2" fill="#fff" /><circle cx="6" cy="-12" r="2" fill="#fff" />`;
      break;
    case "monument":
      icon = `<polygon points="-3,8 0,-20 3,8" fill="#555" stroke="#333" stroke-width="1" /><rect x="-4" y="8" width="8" height="2" fill="#333" />`;
      break;
    case "statue": {
      const stone1 = "#7a6a5a";
      const stone2 = "#9e8e7a";
      const figure = "#a89880";
      const shadow = "#4a3b2a";
      icon = `<rect x="-7" y="4" width="14" height="5" fill="${stone1}" stroke="${shadow}" stroke-width="1" /><rect x="-5" y="0" width="10" height="4" fill="${stone2}" stroke="${shadow}" stroke-width="1" /><path d="M0,-4 C-3,-4 -4,-8 -3,-11 C-5,-13 -3,-17 0,-17 C3,-17 5,-13 3,-11 C4,-8 3,-4 0,-4 Z" fill="${figure}" stroke="${shadow}" stroke-width="1" /><path d="M-3,-10 C-7,-8 -8,-3 -5,0 M3,-10 C7,-8 8,-3 5,0" fill="none" stroke="${figure}" stroke-width="2" stroke-linecap="round" />`;
      break;
    }
    case "ecole":
      icon = `<rect x="-8" y="-8" width="16" height="16" fill="#c9a87c" stroke="#5c4033" stroke-width="1" /><rect x="-3" y="-16" width="6" height="8" fill="#8B5A2B" /><circle cx="0" cy="-18" r="2" fill="#fff" />`;
      break;
    case "eglise":
      icon = `<rect x="-6" y="0" width="12" height="10" fill="#d4c4b0" stroke="#5c4033" stroke-width="1" /><path d="M-8,0 L8,0 L0,-14 Z" fill="#8B5A2B" /><path d="M0,-16 L0,-8 M-3,-12 L3,-12" stroke="#fff" stroke-width="1" />`;
      break;
    case "bibliotheque":
      icon = `<rect x="-8" y="-2" width="16" height="4" fill="#8B5A2B" stroke="#5c4033" stroke-width="0.5" /><rect x="-8" y="2" width="16" height="4" fill="#5d4037" stroke="#5c4033" stroke-width="0.5" /><rect x="-8" y="6" width="16" height="4" fill="#8B5A2B" stroke="#5c4033" stroke-width="0.5" />`;
      break;
    case "theatre":
      icon = `<path d="M-10,0 Q-5,-10 0,0 Q5,-10 10,0 Q5,10 0,0 Q-5,10 -10,0 Z" fill="#fff" stroke="#333" stroke-width="1" />`;
      break;
    case "jardin":
      icon = `<path d="M0,8 L0,-8" stroke="#5d4037" stroke-width="1" /><circle cx="0" cy="-6" r="5" fill="${palette.arbre}" /><circle cx="-4" cy="-4" r="4" fill="${palette.arbre}" /><circle cx="4" cy="-4" r="4" fill="${palette.arbre}" />`;
      break;
    case "marais":
      icon = `<path d="M-8,8 L-8,-4 M-4,8 L-4,-8 M0,8 L0,-6 M4,8 L4,-4 M8,8 L8,-8" stroke="#7cb369" stroke-width="1" /><ellipse cx="0" cy="8" rx="12" ry="3" fill="${palette.eau}" opacity="0.8" />`;
      break;
    case "temple":
      icon = `<rect x="-12" y="-4" width="4" height="12" fill="#c9a87c" stroke="#5c4033" stroke-width="0.5" /><rect x="-2" y="-4" width="4" height="12" fill="#c9a87c" stroke="#5c4033" stroke-width="0.5" /><rect x="8" y="-4" width="4" height="12" fill="#c9a87c" stroke="#5c4033" stroke-width="0.5" /><path d="M-16,-4 L16,-4 L0,-14 Z" fill="#8B5A2B" />`;
      break;
    default:
      return "";
  }
  if (d.nom) {
    const label = escapeHtml(d.nom.length > 26 ? d.nom.slice(0, 24) + "…" : d.nom);
    icon += `<text y="24" x="0" text-anchor="middle" font-size="8" fill="${palette.routeCasing}" font-family="${palette.fontFamily}" font-weight="600" paint-order="stroke" stroke="${palette.fond}" stroke-width="2.5" stroke-linejoin="round">${label}</text>`;
  }
  return `<g ${t}>${icon}</g>`;
}

function artDecoMotifs(w: number, h: number, c: string): string {
  const s = 70, rays = 7;
  function sunburst(x: number, y: number, rot: number): string {
    let lines = "";
    for (let i = 0; i < rays; i++) {
      const a = rot + (i / (rays - 1)) * Math.PI / 2;
      const x2 = x + Math.cos(a) * s;
      const y2 = y + Math.sin(a) * s;
      lines += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-width="2" />`;
    }
    return lines;
  }
  return `
    ${sunburst(0, 0, 0)}
    ${sunburst(w, 0, Math.PI / 2)}
    ${sunburst(0, h, Math.PI * 1.5)}
    ${sunburst(w, h, Math.PI)}
    <rect x="2" y="2" width="${w - 4}" height="${h - 4}" fill="none" stroke="${c}" stroke-width="3" />
    <rect x="8" y="8" width="${w - 16}" height="${h - 16}" fill="none" stroke="${c}" stroke-width="1" />
  `;
}

function baroqueMotifs(w: number, h: number, c: string): string {
  const corner = `<path d="M0,0 C20,0 40,20 40,40 C40,55 30,70 15,75 C5,78 -5,70 -5,60 C-5,50 5,45 15,50 C25,55 30,45 25,35 C20,25 10,20 0,20" fill="none" stroke="${c}" stroke-width="2" />`;
  return `
    <g transform="translate(10,10) scale(0.8)">${corner}</g>
    <g transform="translate(${w - 10},10) rotate(90) scale(0.8)">${corner}</g>
    <g transform="translate(${w - 10},${h - 10}) rotate(180) scale(0.8)">${corner}</g>
    <g transform="translate(10,${h - 10}) rotate(270) scale(0.8)">${corner}</g>
    <rect x="6" y="6" width="${w - 12}" height="${h - 12}" fill="none" stroke="${c}" stroke-width="3" rx="12" />
  `;
}

function artNouveauMotifs(w: number, h: number, c: string): string {
  const corner = `<path d="M0,0 Q30,10 40,40 T80,80" fill="none" stroke="${c}" stroke-width="2" /><circle cx="40" cy="40" r="4" fill="${c}" />`;
  return `
    <g transform="translate(5,5) scale(0.6)">${corner}</g>
    <g transform="translate(${w - 5},5) rotate(90) scale(0.6)">${corner}</g>
    <g transform="translate(${w - 5},${h - 5}) rotate(180) scale(0.6)">${corner}</g>
    <g transform="translate(5,${h - 5}) rotate(270) scale(0.6)">${corner}</g>
    <path d="M0,40 Q${w / 2},0 ${w},40" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.4" />
    <path d="M0,${h - 40} Q${w / 2},${h} ${w},${h - 40}" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.4" />
  `;
}

function exotiqueMotifs(w: number, h: number, c: string): string {
  const palm = `<path d="M0,45 Q2,20 0,-5 M0,-5 Q-10,-18 -22,-12 M0,-5 Q-3,-20 -8,-26 M0,-5 Q10,-18 22,-12 M0,-5 Q3,-20 8,-26" stroke="${c}" stroke-width="2" fill="none" />`;
  return `
    <g transform="translate(12,12) scale(0.5)">${palm}</g>
    <g transform="translate(${w - 12},12) rotate(90) scale(0.5)">${palm}</g>
    <g transform="translate(${w - 12},${h - 12}) rotate(180) scale(0.5)">${palm}</g>
    <g transform="translate(12,${h - 12}) rotate(270) scale(0.5)">${palm}</g>
    <rect x="6" y="6" width="${w - 12}" height="${h - 12}" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="8 4" />
  `;
}

function renderMotifs(carte: CarteSonore, palette: Palette): string {
  const { width, height, esthetique } = carte;
  switch (esthetique) {
    case "art-deco":
      return artDecoMotifs(width, height, palette.routeCasing);
    case "baroque":
      return baroqueMotifs(width, height, palette.routeCasing);
    case "art-nouveau":
      return artNouveauMotifs(width, height, palette.routeCasing);
    case "exotique":
      return exotiqueMotifs(width, height, palette.routeCasing);
    default:
      return "";
  }
}

export function genererHtmlCarte(carte: CarteSonore, titre: string, fichiers: { nom: string; chemin: string }[]): string {
  const palette = palettePour(carte.esthetique);
  const isConcentrique = carte.style === "concentrique";
  const hasGradient = !!palette.gradient && isConcentrique;

  const quartiersHtml = carte.quartiers.map((q) => {
    const fill = palette.quartiers[q.type] ?? palette.quartiers.defaut;
    if (q.d) return `<path d="${q.d}" fill="${fill}" stroke="none" />`;
    return `<rect x="${q.x.toFixed(1)}" y="${q.y.toFixed(1)}" width="${q.w.toFixed(1)}" height="${q.h.toFixed(1)}" fill="${fill}" stroke="none" />`;
  }).join("");

  const eauHtml = carte.eau.map((e) => {
    if (e.d) {
      return `<path d="${e.d}" fill="${palette.eau}" stroke="${palette.eauStroke}" stroke-width="1" />`;
    }
    if (e.type === "lac") {
      return `<path d="${polygonPath(e.points)}" fill="${palette.eau}" stroke="${palette.eauStroke}" stroke-width="1" />`;
    }
    return `<path d="${pathString(e.points)}" fill="none" stroke="${palette.eau}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />`;
  }).join("");

  const espacesVertsHtml = carte.espacesVerts.map((e) => {
    const fill = palette.quartiers.parc;
    const arbres = e.arbres?.map((a) => `<circle cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="${a.r.toFixed(1)}" fill="${palette.arbre}" />`).join("") ?? "";
    if (e.d) return `<path d="${e.d}" fill="${fill}" stroke="none" />${arbres}`;
    return `<ellipse cx="${e.cx.toFixed(1)}" cy="${e.cy.toFixed(1)}" rx="${e.rx.toFixed(1)}" ry="${e.ry.toFixed(1)}" fill="${fill}" stroke="none" />${arbres}`;
  }).join("");

  const batimentsHtml = isConcentrique
    ? carte.batiments.map((b) => renderBatimentConcentrique(b, carte.centre!, carte.esthetique)).join("")
    : carte.batiments.map((b) => renderBatimentGrid(b, carte.esthetique)).join("");

  const routeDefs: string[] = [];
  const routeCasings = carte.routes.map((r) => {
    const d = pathString(r.points);
    return `<path d="${d}" fill="none" stroke="${palette.routeCasing}" stroke-width="${(r.epaisseur + 2).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" />`;
  }).join("");

  const routeSurfaces = carte.routes.map((r) => {
    const d = pathString(r.points);
    const color = r.type === "artere" ? palette.routeArtere : r.type === "boulevard" ? palette.routeBoulevard : palette.routeSurface;
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${r.epaisseur.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" />`;
  }).join("");

  const routeLabels = carte.routes.map((r, i) => {
    if (!r.nom) return "";
    const id = `route-label-${i}`;
    routeDefs.push(`<path id="${id}" d="${pathString(r.points)}" fill="none" />`);
    return `<text font-size="9" fill="${palette.routeCasing}" font-weight="600" font-family="${palette.fontFamily}" paint-order="stroke" stroke="${palette.fond}" stroke-width="2.5" stroke-linejoin="round"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${escapeHtml(r.nom)}</textPath></text>`;
  }).join("");

  const decorationsHtml = (carte.decorations ?? []).map((d) => renderDecoration(d, palette, carte.esthetique)).join("");
  const motifsHtml = renderMotifs(carte, palette);

  const pointsHtml = carte.points.map((p, i) => {
    const f = fichiers[i];
    const audioUrl = f ? "audio/" + safeFileName(f.nom) : "";
    const label = escapeHtml(p.nom.length > 22 ? p.nom.slice(0, 20) + "…" : p.nom);
    return `
      <g class="point" data-url="${escapeHtml(audioUrl)}" data-nom="${escapeHtml(p.nom)}" onclick="jouer(this)" transform="translate(${p.x.toFixed(1)}, ${p.y.toFixed(1)})">
        <path class="pin-body" d="M 0,0 C -2,-4 -6,-12 -6,-16 C -6,-21 -3,-23 0,-23 C 3,-23 6,-21 6,-16 C 6,-12 2,-4 0,0 Z" fill="${p.couleur}" stroke="#fff" stroke-width="2" />
        <circle cx="0" cy="-16" r="2.5" fill="#fff" />
        <text class="point-label" x="0" y="-32" text-anchor="middle" font-size="10" fill="#333" font-weight="700" font-family="${palette.fontFamily}">${label}</text>
      </g>`;
  }).join("");

  const legendHtml = `
    <g transform="translate(${carte.width - 180}, ${carte.height - 110})">
      <rect x="0" y="0" width="170" height="100" rx="6" fill="rgba(255,255,255,0.92)" stroke="${palette.routeCasing}" stroke-width="1" />
      <text x="10" y="16" font-size="11" font-weight="700" fill="#333" font-family="${palette.fontFamily}">Légende</text>
      <rect x="10" y="24" width="12" height="12" fill="${palette.quartiers.residentiel}" stroke="#999" stroke-width="0.5" />
      <text x="28" y="34" font-size="9" fill="#555" font-family="${palette.fontFamily}">Résidentiel</text>
      <rect x="10" y="40" width="12" height="12" fill="${palette.quartiers.commercial}" stroke="#999" stroke-width="0.5" />
      <text x="28" y="50" font-size="9" fill="#555" font-family="${palette.fontFamily}">Commercial</text>
      <rect x="10" y="56" width="12" height="12" fill="${palette.quartiers.industriel}" stroke="#999" stroke-width="0.5" />
      <text x="28" y="66" font-size="9" fill="#555" font-family="${palette.fontFamily}">Industriel</text>
      <rect x="10" y="72" width="12" height="12" fill="${palette.quartiers.parc}" stroke="#999" stroke-width="0.5" />
      <text x="28" y="82" font-size="9" fill="#555" font-family="${palette.fontFamily}">Espace vert</text>
      <circle cx="90" cy="80" r="5" fill="#e63946" stroke="#fff" stroke-width="1.5" />
      <text x="102" y="83" font-size="9" fill="#555" font-family="${palette.fontFamily}">Son</text>
    </g>`;

  const bgGradient = hasGradient
    ? `<radialGradient id="bgGrad" cx="50%" cy="50%" r="75%" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${palette.gradient!.center}" /><stop offset="100%" stop-color="${palette.gradient!.edge}" /></radialGradient>`
    : "";
  const background = hasGradient
    ? `<rect x="0" y="0" width="${carte.width}" height="${carte.height}" fill="url(#bgGrad)" />`
    : `<rect x="0" y="0" width="${carte.width}" height="${carte.height}" fill="${palette.fond}" />`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(titre)}</title>
  <style>
    body { margin: 0; font-family: ${palette.fontFamily}; background: #222; color: #eee; display: flex; flex-direction: column; align-items: center; min-height: 100vh; }
    h1 { margin: 16px 0 6px; font-size: 1.2rem; }
    .info { font-size: 0.85rem; opacity: 0.7; margin-bottom: 12px; }
    #carte { width: min(95vw, 1920px); height: auto; background: ${palette.fond}; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); }
    .point { cursor: pointer; }
    .point:hover .pin-body { stroke: #222; stroke-width: 2.5; }
    .point.active .pin-body { stroke: #ffd700; stroke-width: 3; }
    .point-label { opacity: 0; transition: opacity 0.15s ease; pointer-events: none; }
    .point:hover .point-label { opacity: 1; }
    #controls { margin: 12px 0 24px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: center; }
    #titre { font-size: 0.9rem; opacity: 0.8; }
    audio { height: 36px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(titre)}</h1>
  <div class="info">${carte.points.length} points · ${carte.batiments.length} bâtiments · ${carte.routes.length} rues · ${carte.style} · ${carte.esthetique} · graine ${carte.graine}</div>
  <svg id="carte" viewBox="0 0 ${carte.width} ${carte.height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.15" />
      </filter>
      ${bgGradient}
      ${routeDefs.join("\n")}
    </defs>
    ${background}
    ${quartiersHtml}
    ${eauHtml}
    ${espacesVertsHtml}
    ${routeCasings}
    ${routeSurfaces}
    ${routeLabels}
    ${batimentsHtml}
    ${decorationsHtml}
    ${motifsHtml}
    ${legendHtml}
    ${pointsHtml}
  </svg>
  <div id="controls">
    <span id="titre">Aucun son sélectionné</span>
    <audio id="player" controls></audio>
  </div>
  <script>
    function jouer(el) {
      const url = el.getAttribute("data-url");
      const nom = el.getAttribute("data-nom");
      if (!url) return;
      document.querySelectorAll(".point").forEach(p => p.classList.remove("active"));
      el.classList.add("active");
      const player = document.getElementById("player");
      const titre = document.getElementById("titre");
      player.src = url;
      titre.textContent = nom;
      player.play().catch(() => {});
    }
  </script>
</body>
</html>`;
}

const EXTENSIONS_AUDIO = [".wav", "wave", ".mp3", ".ogg", ".flac", ".m4a", ".aac", ".webm"];


export const fiches: FicheAudio[] = ([
  {
    id: "carte-sonore", nom: "Carte sonore", nomEn: "Sound Map", univers: "Collections", famille: "Export",
    resume: "Charge un dossier audio et génère une carte HTML interactive d'une ville fictive ou d'une carte concentrique, avec plusieurs esthétiques, ouvrable dans le navigateur.",
    resumeEn: "Loads an audio folder and generates an interactive HTML map of a fictional city or a concentric map with several aesthetics, openable in a browser.",
    affichageAutonome: true,
    entrees: [],
    sorties: [],
    parametres: [
      { nom: "Chemin", nomEn: "Path", type: "dossier", defaut: "music collection", defautEn: "music collection",
        doc: "Dossier audio source.", docEn: "Source audio folder." },
      { nom: "Dossier sortie", nomEn: "Output folder", type: "dossier", defaut: "", defautEn: "",
        doc: "Dossier où générer index.html et copier les sons.", docEn: "Folder where index.html and the sounds will be generated." },
      { nom: "Titre", nomEn: "Title", type: "texte", defaut: "Carte sonore", defautEn: "Sound Map",
        doc: "Titre de la page HTML.", docEn: "Title of the HTML page." },
      { nom: "Style", nomEn: "Style", type: "choix", options: ["Ville en grille", "Cercles concentriques", "Organique", "Voronoi"], optionsEn: ["Grid city", "Concentric circles", "Organic", "Voronoi"], optionIds: ["ville", "concentrique", "organique", "voronoi"], defaut: "Ville en grille", defautEn: "Grid city",
        doc: "Style de la carte.", docEn: "Map style." },
      { nom: "Esthétique", nomEn: "Aesthetic", type: "choix", options: ["Classique", "Baroque", "Art nouveau", "Art déco", "Exotique"], optionsEn: ["Classic", "Baroque", "Art Nouveau", "Art Deco", "Exotic"], optionIds: ["classique", "baroque", "art-nouveau", "art-deco", "exotique"], defaut: "Classique", defautEn: "Classic",
        doc: "Ambiance visuelle de la carte.", docEn: "Visual mood of the map." },
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [0, 9999], pas: 1, defaut: 0,
        doc: "Graine de la carte (0 = carte différente à chaque exécution).", docEn: "Map seed (0 = new map each run)." },
    ],
    async executer(ctx: any) {
      const api = (window as any).api;
      if (!api?.lireDossier || !api?.ecrireFichier) return { valeurs: [], message: traduire("msg.n_cessite_electron") };

      const chemin = ctx.paramTexte("Chemin", "music collection").replace(/^[/\\]+|[/\\]+$/g, "");
      const sortie = ctx.paramTexte("Dossier sortie", "").replace(/^[/\\]+|[/\\]+$/g, "");
      const titre = ctx.paramTexte("Titre", "Carte sonore");
      const styleId = ctx.paramTexte("Style", "ville");
      const style = (["ville", "concentrique", "organique", "voronoi"] as StyleCarte[]).includes(styleId as StyleCarte)
        ? (styleId as StyleCarte)
        : "ville";
      const esthetiqueId = ctx.paramTexte("Esthétique", "classique");
      const esthetique = (["classique", "baroque", "art-nouveau", "art-deco", "exotique"] as Esthetique[]).includes(esthetiqueId as Esthetique)
        ? (esthetiqueId as Esthetique)
        : "classique";
      const graineParam = ctx.paramNombre("Graine", 0);
      const graine = graineParam > 0 ? graineParam : Math.floor(Math.random() * 99999) + 1;

      if (!chemin) return { valeurs: [], message: traduire("msg.aucun_r_pertoire_sp_cifi") };
      if (!sortie) return { valeurs: [], message: traduire("msg.aucun_r_pertoire_de_sortie_sp_cifi") };

      ctx.onProgress(traduire("progress.lecture_du_r_pertoire"));
      let fichiers: { nom: string; chemin: string }[] = (await api.lireDossier(chemin)) ?? [];
      fichiers = fichiers.filter((f: any) => {
        const ext = f.nom.slice(f.nom.lastIndexOf(".")).toLowerCase();
        return EXTENSIONS_AUDIO.includes(ext);
      });
      if (fichiers.length === 0) return { valeurs: [], message: traduire("msg.aucun_fichier_audio_dans_var_0", chemin) };

      const maxPoints = Math.min(400, fichiers.length);
      const selection = shuffle(fichiers, mulberry32(graine)).slice(0, maxPoints);
      const pointInputs = selection.map((f) => ({ nom: f.nom, chemin: f.chemin }));
      const carte = style === "concentrique"
        ? genererCarteConcentrique(graine, 1920, 1080, pointInputs, esthetique)
        : style === "organique"
        ? genererCarteOrganique(graine, 1920, 1080, pointInputs, esthetique)
        : style === "voronoi"
        ? genererCarteVoronoi(graine, 1920, 1080, pointInputs, esthetique)
        : genererCarteVille(graine, 1920, 1080, pointInputs, esthetique);

      ctx.onProgress(traduire("progress.g_n_ration_de_la_carte"));
      const html = genererHtmlCarte(carte, titre, selection);

      const dossierSortie = sortie.replace(/\\/g, "/");
      const htmlPath = `${dossierSortie}/index.html`;
      const htmlOk = await api.ecrireFichier(htmlPath, html);

      let copies = 0;
      if (api.copierFichier) {
        for (const f of selection) {
          ctx.onProgress(traduire("progress.copie_audio_var_0", f.nom));
          const cible = `${dossierSortie}/audio/${safeFileName(f.nom)}`;
          const res = await api.copierFichier(f.chemin, cible);
          if (res) copies++;
        }
      }

      // Pas de blob téléchargeable : le HTML référence ses fichiers audio en
      // chemins relatifs (`audio/xxx.mp3`, copiés à côté d'index.html sur
      // disque) — un téléchargement isolé du blob romprait ces liens. Seul
      // « Ouvrir dans le navigateur » (le vrai fichier sur disque, aux côtés
      // de son dossier audio/) donne un résultat qui fonctionne.
      (ctx.noeud.data as any)._carteHtmlPath = htmlPath;
      (ctx.noeud.data as any)._carteSonore = carte;
      (ctx.noeud.data as any)._carteSonoreGraine = graine;

      return { valeurs: [], message: traduire("msg.carte_sonore_g_n_r_e_var_0_index_html_var_1_points_var_2_audio_copi", htmlPath, carte.points.length, copies, htmlOk ? "HTML écrit ✓" : "HTML échec ✗") };
    },
  },
] as FicheAudio[]).map(avecDoc);
