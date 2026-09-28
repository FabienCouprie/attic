// plugins/carte-sonore-plan-ville.ts — Le plan en damier : rues, quartiers, batiments.
//
// Ce module est une part de la carte sonore, decoupee selon ses dependances : la geometrie et
// les types d'un cote, le decor, les plans, le rendu, puis le nœud. Aucune ligne de calcul n'a
// ete retouchee au passage.

// cercles concentriques, avec plusieurs esthétiques (classique, baroque,
// art nouveau, art déco, exotique). Charge un dossier de sons et génère une
// page HTML autonome dans le dossier de sortie.


import { clamp, inWater, mulberry32, polarToCartesian, wiggleHorizontalLine, wiggleVerticalLine } from "./carte-sonore-formes";
import type { BatimentVille, CarteSonore, DecorationCarte, EauVille, EspaceVertVille, Esthetique, QuartierVille, RouteVille } from "./carte-sonore-formes";
import { MARGE, NOMS_AVENUES, NOMS_BOU, NOMS_RUES, palettePour, pickNom, placerPoi, placerPoints } from "./carte-sonore-decor";

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

