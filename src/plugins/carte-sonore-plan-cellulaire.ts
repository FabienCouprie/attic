// plugins/carte-sonore-plan-cellulaire.ts — Les plans concentrique, de Voronoi et organique.
//
// Ce module est une part de la carte sonore, decoupee selon ses dependances : la geometrie et
// les types d'un cote, le decor, les plans, le rendu, puis le nœud. Aucune ligne de calcul n'a
// ete retouchee au passage.

// cercles concentriques, avec plusieurs esthétiques (classique, baroque,
// art nouveau, art déco, exotique). Charge un dossier de sons et génère une
// page HTML autonome dans le dossier de sortie.


import { batimentPath, centroidPolygon, circlePath, clamp, clipPolygon, edgeKey, inWater, mulberry32, polarToCartesian, randomPointInPolygon, sampleQuadraticBezier, sectorArcPath, sectorPoints, shoelaceArea, shrinkPolygon, wiggleRadialLine, wiggleRing } from "./carte-sonore-formes";
import type { BatimentVille, CarteSonore, DecorationCarte, EauVille, EspaceVertVille, Esthetique, QuartierVille, RouteVille } from "./carte-sonore-formes";
import { MARGE, NOMS_AVENUES, NOMS_BOU, NOMS_RUES, palettePour, pickNom, placerPoi, placerPoints } from "./carte-sonore-decor";

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

