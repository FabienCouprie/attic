// plugins/carte-sonore.ts — Carte sonore procédurale d'une ville fictive.
// Charge un dossier de sons, génère une carte interactive et crée un fichier
// HTML autonome dans le dossier de sortie, prêt à être ouvert dans le
// navigateur par défaut.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

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
}

export interface BatimentVille {
  x: number;
  y: number;
  w: number;
  h: number;
  couleur: string;
}

export interface EspaceVertVille {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  arbres?: { x: number; y: number; r: number }[];
}

export interface EauVille {
  points: { x: number; y: number }[];
  type: "riviere" | "lac";
}

export interface CarteSonore {
  width: number;
  height: number;
  routes: RouteVille[];
  quartiers: QuartierVille[];
  batiments: BatimentVille[];
  espacesVerts: EspaceVertVille[];
  riviere: { x: number; y: number }[];
  eau: EauVille[];
  points: PointSonore[];
  graine: number;
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

const MARGE = 24;

const PALETTE_POINTS = [
  "#e63946", "#f4a261", "#2a9d8f", "#264653", "#e9c46a",
  "#457b9d", "#a8dadc", "#1d3557", "#f1faee", "#d62828",
  "#6a4c93", "#8ac926", "#1982c4", "#ffca3a", "#ff595e",
];

const COULEURS_BATS: Record<string, string[]> = {
  residentiel: ["#eaddc8", "#e5d8c1", "#efe4d4", "#dccfb8", "#e8dccb"],
  commercial: ["#f4e3a6", "#f1dc8b", "#e9c46a", "#f6e4b5", "#e3cf8a"],
  industriel: ["#c9c9c9", "#bfbfbf", "#d4d4d4", "#b8b8b8", "#c5c5c5"],
  historique: ["#e4d5c1", "#dcc9b2", "#e8ddc8", "#d3c1a9", "#decbb8"],
  parc: ["#b8d8a8"],
  eau: ["#aec9e0"],
  defaut: ["#d4c4b0"],
};

const COULEURS_QUARTIER: Record<string, string> = {
  residentiel: "#f4eadd",
  commercial: "#f7e8b5",
  industriel: "#dedede",
  historique: "#ead9c3",
  parc: "#b5d6a5",
  eau: "#aec9e0",
  defaut: "#e8e2d6",
};

const NOMS_RUES = [
  "Rue du Commerce", "Rue de la Gare", "Rue des Lilas", "Rue Saint-Martin",
  "Rue de la Paix", "Rue du Marché", "Rue de la République", "Rue du Pont",
  "Rue des Écoles", "Rue du Moulin", "Rue Victor Hugo", "Rue de la Fontaine",
  "Rue du Port", "Rue des Acacias", "Rue du Château", "Rue du Mont",
  "Rue du 14 Juillet", "Rue des Roses", "Rue du Bac", "Rue de l'Horloge",
];
const NOMS_AVENUES = [
  "Avenue de la Liberté", "Avenue de la République", "Avenue de la Paix",
  "Avenue de la Gare", "Avenue des Champs", "Avenue de l'Europe",
  "Avenue de la Victoire", "Avenue du Général de Gaulle", "Avenue du Nord",
  "Avenue du Sud", "Avenue de la Plage", "Avenue des Lumières",
];
const NOMS_BOU = [
  "Boulevard de la Liberté", "Boulevard de l'Est", "Boulevard de l'Ouest",
  "Boulevard du Nord", "Boulevard du Sud", "Boulevard du Centre",
  "Boulevard de la République", "Boulevard des Capucines",
];

export function genererCarteVille(
  seed: number,
  width = 1400,
  height = 900,
  points: { nom: string; chemin: string }[] = [],
): CarteSonore {
  const rng = mulberry32(seed);
  const routes: RouteVille[] = [];
  const quartiers: QuartierVille[] = [];
  const batiments: BatimentVille[] = [];
  const espacesVerts: EspaceVertVille[] = [];
  const eau: EauVille[] = [];
  const usedNames = new Set<string>();

  function pickNom(list: string[]): string {
    let nom = list[Math.floor(rng() * list.length)];
    if (usedNames.has(nom)) nom = `${nom} ${Math.floor(rng() * 99) + 1}`;
    usedNames.add(nom);
    return nom;
  }

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
      lakePoints.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    }
    eau.push({ points: lakePoints, type: "lac" });
  }

  function inWater(cx: number, cy: number): boolean {
    for (const e of eau) {
      if (e.type === "lac" && pointInPolygon(cx, cy, e.points)) return true;
      if (e.type === "riviere" && pointDistanceToPolyline(cx, cy, e.points) < 18) return true;
    }
    return false;
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
    routes.push({
      points: [{ x: MARGE, y }, { x: width - MARGE, y }],
      epaisseur: isArtere ? 7 : 3 + rng() * 2,
      nom: pickNom(isArtere ? NOMS_AVENUES : NOMS_RUES),
      type: isArtere ? "artere" : "rue",
      horizontal: true,
    });
  }
  for (let i = 0; i < nbV; i++) xRoutes.push(MARGE + rng() * (width - 2 * MARGE));
  xRoutes.sort((a, b) => a - b);
  for (const x of xRoutes) {
    const isArtere = rng() < 0.3;
    routes.push({
      points: [{ x, y: MARGE }, { x, y: height - MARGE }],
      epaisseur: isArtere ? 7 : 3 + rng() * 2,
      nom: pickNom(isArtere ? NOMS_AVENUES : NOMS_RUES),
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
      nom: pickNom(NOMS_BOU),
      type: "boulevard",
    });
  }

  // ─── Quartiers et bâtiments ───
  let quartierIndex = 0;
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
      if (inWater(cx, cy)) type = "eau";

      quartiers.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, type });
      quartierIndex++;

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
      } else if (type !== "eau") {
        const pad = 4;
        const bx = x0 + pad;
        const by = y0 + pad;
        const bw = Math.max(0, x1 - x0 - 2 * pad);
        const bh = Math.max(0, y1 - y0 - 2 * pad);
        if (bw < 16 || bh < 16) continue;
        const colors = COULEURS_BATS[type] ?? COULEURS_BATS.defaut;
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
              });
            }
            x += w + gap + (rng() < 0.15 ? 4 + rng() * 6 : 0);
          }
          y += baseH + gap + alley;
        }
      }
    }
  }

  // ─── Points sonores ───
  const pointsResult: PointSonore[] = [];
  const minDist = Math.max(18, Math.min(36, Math.sqrt((width * height) / (points.length * 12))));
  const maxTentatives = Math.max(500, points.length * 5);
  for (let i = 0; i < points.length; i++) {
    const nom = points[i].nom.replace(/\.[^.]+$/, "");
    const couleur = PALETTE_POINTS[i % PALETTE_POINTS.length];
    let placed = false;
    for (let t = 0; t < maxTentatives; t++) {
      let x: number;
      let y: number;
      if (rng() < 0.6 && routes.length > 0) {
        const r = routes[Math.floor(rng() * routes.length)];
        const p0 = r.points[0];
        const p1 = r.points[r.points.length - 1];
        const k = rng();
        x = p0.x + k * (p1.x - p0.x) + (rng() - 0.5) * 12;
        y = p0.y + k * (p1.y - p0.y) + (rng() - 0.5) * 12;
      } else {
        x = MARGE + rng() * (width - 2 * MARGE);
        y = MARGE + rng() * (height - 2 * MARGE);
      }
      x = clamp(x, MARGE, width - MARGE);
      y = clamp(y, MARGE, height - MARGE);
      if (inWater(x, y)) continue;
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

  return { width, height, routes, quartiers, batiments, espacesVerts, riviere, eau, points: pointsResult, graine: seed };
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

export function genererHtmlCarte(carte: CarteSonore, titre: string, fichiers: { nom: string; chemin: string }[]): string {
  const quartiersHtml = carte.quartiers.map((q) => {
    const fill = COULEURS_QUARTIER[q.type] ?? COULEURS_QUARTIER.defaut;
    return `<rect x="${q.x.toFixed(1)}" y="${q.y.toFixed(1)}" width="${q.w.toFixed(1)}" height="${q.h.toFixed(1)}" fill="${fill}" stroke="none" />`;
  }).join("");

  const eauHtml = carte.eau.map((e) => {
    if (e.type === "lac") {
      return `<path d="${polygonPath(e.points)}" fill="#aec9e0" stroke="#8fb4d4" stroke-width="1" />`;
    }
    return `<path d="${pathString(e.points)}" fill="none" stroke="#aec9e0" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />`;
  }).join("");

  const espacesVerts = carte.espacesVerts.map((e) => {
    const arbres = e.arbres?.map((a) => `<circle cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="${a.r.toFixed(1)}" fill="#7cb369" />`).join("") ?? "";
    return `<ellipse cx="${e.cx.toFixed(1)}" cy="${e.cy.toFixed(1)}" rx="${e.rx.toFixed(1)}" ry="${e.ry.toFixed(1)}" fill="#b5d6a5" stroke="#8cb87a" stroke-width="1" />${arbres}`;
  }).join("");

  const batiments = carte.batiments.map((b) =>
    `<rect x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" fill="${b.couleur}" stroke="#a39a8f" stroke-width="0.5" />`
  ).join("");

  // Routes en deux passes : fond gris puis surface blanche
  const routeDefs: string[] = [];
  const routeCasings = carte.routes.map((r, _i) => {
    const d = pathString(r.points);
    return `<path d="${d}" fill="none" stroke="#9ca3af" stroke-width="${(r.epaisseur + 2).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" />`;
  }).join("");

  const routeSurfaces = carte.routes.map((r, _i) => {
    const d = pathString(r.points);
    const color = r.type === "artere" ? "#fdfbf7" : r.type === "boulevard" ? "#f9f7f2" : "#ffffff";
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${r.epaisseur.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" />`;
  }).join("");

  const routeLabels = carte.routes.map((r, i) => {
    if (!r.nom) return "";
    const id = `route-label-${i}`;
    routeDefs.push(`<path id="${id}" d="${pathString(r.points)}" fill="none" />`);
    return `<text font-size="9" fill="#5c5c5c" font-weight="600" font-family="system-ui, sans-serif" paint-order="stroke" stroke="#f0ece3" stroke-width="2.5" stroke-linejoin="round"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${escapeHtml(r.nom)}</textPath></text>`;
  }).join("");

  const pointsHtml = carte.points.map((p, i) => {
    const f = fichiers[i];
    const audioUrl = f ? "audio/" + safeFileName(f.nom) : "";
    const label = escapeHtml(p.nom.length > 22 ? p.nom.slice(0, 20) + "…" : p.nom);
    return `
      <g class="point" data-url="${escapeHtml(audioUrl)}" data-nom="${escapeHtml(p.nom)}" onclick="jouer(this)" transform="translate(${p.x.toFixed(1)}, ${p.y.toFixed(1)})">
        <path class="pin-body" d="M 0,0 C -2,-4 -6,-12 -6,-16 C -6,-21 -3,-23 0,-23 C 3,-23 6,-21 6,-16 C 6,-12 2,-4 0,0 Z" fill="${p.couleur}" stroke="#fff" stroke-width="2" />
        <circle cx="0" cy="-16" r="2.5" fill="#fff" />
        <text class="point-label" x="0" y="-32" text-anchor="middle" font-size="10" fill="#333" font-weight="700" font-family="system-ui, sans-serif">${label}</text>
      </g>`;
  }).join("");

  const legendHtml = `
    <g transform="translate(${carte.width - 180}, ${carte.height - 110})">
      <rect x="0" y="0" width="170" height="100" rx="6" fill="rgba(255,255,255,0.92)" stroke="#ccc" stroke-width="1" />
      <text x="10" y="16" font-size="11" font-weight="700" fill="#333" font-family="system-ui, sans-serif">Légende</text>
      <rect x="10" y="24" width="12" height="12" fill="#f4eadd" stroke="#999" stroke-width="0.5" />
      <text x="28" y="34" font-size="9" fill="#555" font-family="system-ui, sans-serif">Résidentiel</text>
      <rect x="10" y="40" width="12" height="12" fill="#f7e8b5" stroke="#999" stroke-width="0.5" />
      <text x="28" y="50" font-size="9" fill="#555" font-family="system-ui, sans-serif">Commercial</text>
      <rect x="10" y="56" width="12" height="12" fill="#dedede" stroke="#999" stroke-width="0.5" />
      <text x="28" y="66" font-size="9" fill="#555" font-family="system-ui, sans-serif">Industriel</text>
      <rect x="10" y="72" width="12" height="12" fill="#b5d6a5" stroke="#999" stroke-width="0.5" />
      <text x="28" y="82" font-size="9" fill="#555" font-family="system-ui, sans-serif">Espace vert</text>
      <circle cx="90" cy="80" r="5" fill="#e63946" stroke="#fff" stroke-width="1.5" />
      <text x="102" y="83" font-size="9" fill="#555" font-family="system-ui, sans-serif">Son</text>
    </g>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(titre)}</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #222; color: #eee; display: flex; flex-direction: column; align-items: center; min-height: 100vh; }
    h1 { margin: 16px 0 6px; font-size: 1.2rem; }
    .info { font-size: 0.85rem; opacity: 0.7; margin-bottom: 12px; }
    #carte { width: min(95vw, 1400px); height: auto; background: #e8e2d6; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); }
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
  <div class="info">${carte.points.length} points · ${carte.batiments.length} bâtiments · ${carte.routes.length} rues · graine ${carte.graine}</div>
  <svg id="carte" viewBox="0 0 ${carte.width} ${carte.height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.15" />
      </filter>
      ${routeDefs.join("\n")}
    </defs>
    <rect x="0" y="0" width="${carte.width}" height="${carte.height}" fill="#e8e2d6" />
    ${quartiersHtml}
    ${eauHtml}
    ${espacesVerts}
    ${routeCasings}
    ${routeSurfaces}
    ${routeLabels}
    ${batiments}
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
    resume: "Charge un dossier audio et génère une carte HTML interactive d'une ville fictive, ouvrable dans le navigateur.",
    resumeEn: "Loads an audio folder and generates an interactive HTML map of a fictional city, openable in a browser.",
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
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [0, 9999], pas: 1, defaut: 0,
        doc: "Graine de la ville (0 = carte différente à chaque exécution).", docEn: "City seed (0 = new city each run)." },
      { nom: "Points", nomEn: "Points", type: "curseur", plage: [1, 200], pas: 1, defaut: 20,
        doc: "Nombre maximum de points/sons sur la carte.", docEn: "Maximum number of sound points on the map." },
    ],
    async executer(ctx: any) {
      const api = (window as any).api;
      if (!api?.lireDossier || !api?.ecrireFichier) return { valeurs: [], message: traduire("msg.n_cessite_electron") };

      const chemin = ctx.paramTexte("Chemin", "music collection").replace(/^[/\\]+|[/\\]+$/g, "");
      const sortie = ctx.paramTexte("Dossier sortie", "").replace(/^[/\\]+|[/\\]+$/g, "");
      const titre = ctx.paramTexte("Titre", "Carte sonore");
      const graineParam = ctx.paramNombre("Graine", 0);
      const graine = graineParam > 0 ? graineParam : Math.floor(Math.random() * 99999) + 1;
      const maxPoints = Math.max(1, Math.min(200, Math.round(ctx.paramNombre("Points", 20))));

      if (!chemin) return { valeurs: [], message: traduire("msg.aucun_r_pertoire_sp_cifi") };
      if (!sortie) return { valeurs: [], message: traduire("msg.aucun_r_pertoire_de_sortie_sp_cifi") };

      ctx.onProgress(traduire("progress.lecture_du_r_pertoire"));
      let fichiers: { nom: string; chemin: string }[] = (await api.lireDossier(chemin)) ?? [];
      fichiers = fichiers.filter((f: any) => {
        const ext = f.nom.slice(f.nom.lastIndexOf(".")).toLowerCase();
        return EXTENSIONS_AUDIO.includes(ext);
      });
      if (fichiers.length === 0) return { valeurs: [], message: traduire("msg.aucun_fichier_audio_dans_var_0", chemin) };

      const selection = shuffle(fichiers, mulberry32(graine)).slice(0, maxPoints);
      const carte = genererCarteVille(graine, 1400, 900, selection.map((f) => ({ nom: f.nom, chemin: f.chemin })));

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

      // Stocker pour la vue (lien d'ouverture)
      (ctx.noeud.data as any)._carteHtmlPath = htmlPath;
      (ctx.noeud.data as any)._carteHtmlUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      (ctx.noeud.data as any)._carteSonore = carte;
      (ctx.noeud.data as any)._carteSonoreGraine = graine;

      return { valeurs: [], message: traduire("msg.carte_sonore_g_n_r_e_var_0_index_html_var_1_points_var_2_audio_copi", htmlPath, carte.points.length, copies, htmlOk ? "HTML écrit ✓" : "HTML échec ✗") };
    },
  },
] as FicheAudio[]).map(avecDoc);
