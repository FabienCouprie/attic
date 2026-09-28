// plugins/carte-sonore-formes.ts — Les types de la carte, et la geometrie qui les manipule.
//
// Ce module est une part de la carte sonore, decoupee selon ses dependances : la geometrie et
// les types d'un cote, le decor, les plans, le rendu, puis le nœud. Aucune ligne de calcul n'a
// ete retouchee au passage.

// cercles concentriques, avec plusieurs esthétiques (classique, baroque,
// art nouveau, art déco, exotique). Charge un dossier de sons et génère une
// page HTML autonome dans le dossier de sortie.



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

export interface Palette {
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

export function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function pointDistanceToPolyline(px: number, py: number, pts: { x: number; y: number }[]): number {
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

export function inWater(cx: number, cy: number, eau: EauVille[]): boolean {
  for (const e of eau) {
    if (e.type === "lac" && pointInPolygon(cx, cy, e.points)) return true;
    if (e.type === "riviere" && pointDistanceToPolyline(cx, cy, e.points) < 18) return true;
  }
  return false;
}

export function shoelaceArea(poly: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  }
  return Math.abs(a) / 2;
}

export function centroidPolygon(poly: { x: number; y: number }[]): { x: number; y: number } {
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

export function clipPolygon(
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

export function edgeKey(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const ax = Math.round(a.x * 2) / 2;
  const ay = Math.round(a.y * 2) / 2;
  const bx = Math.round(b.x * 2) / 2;
  const by = Math.round(b.y * 2) / 2;
  if (ax < bx || (ax === bx && ay < by)) return `${ax.toFixed(1)},${ay.toFixed(1)};${bx.toFixed(1)},${by.toFixed(1)}`;
  return `${bx.toFixed(1)},${by.toFixed(1)};${ax.toFixed(1)},${ay.toFixed(1)}`;
}

export function sampleQuadraticBezier(
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

export function randomPointInPolygon(
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

export function shrinkPolygon(poly: { x: number; y: number }[], factor: number): { x: number; y: number }[] {
  const c = centroidPolygon(poly);
  return poly.map((p) => ({ x: c.x + (p.x - c.x) * factor, y: c.y + (p.y - c.y) * factor }));
}

export function batimentPath(x: number, y: number, w: number, h: number, angle: number, toit = false): string {
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

export function polarToCartesian(cx: number, cy: number, r: number, a: number): { x: number; y: number } {
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
}

export function sectorPoints(
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

export function circlePath(cx: number, cy: number, r: number): string {
  return `M ${(cx + r).toFixed(1)} ${cy.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 1 1 ${(cx - r).toFixed(1)} ${cy.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 1 1 ${(cx + r).toFixed(1)} ${cy.toFixed(1)} Z`;
}

export function sectorArcPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
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

export function wiggleHorizontalLine(y: number, width: number, rng: () => number, amp: number, marge: number): { x: number; y: number }[] {
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

export function wiggleVerticalLine(x: number, height: number, rng: () => number, amp: number, marge: number): { x: number; y: number }[] {
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

export function wiggleRadialLine(cx: number, cy: number, a: number, maxR: number, rng: () => number, amp: number): { x: number; y: number }[] {
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

export function wiggleRing(cx: number, cy: number, r: number, rng: () => number, amp: number, steps = 48): { x: number; y: number }[] {
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

