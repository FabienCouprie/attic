// plugins/carte-sonore-decor.ts — Palettes, noms de rues, et placement des points.
//
// Ce module est une part de la carte sonore, decoupee selon ses dependances : la geometrie et
// les types d'un cote, le decor, les plans, le rendu, puis le nœud. Aucune ligne de calcul n'a
// ete retouchee au passage.

// cercles concentriques, avec plusieurs esthétiques (classique, baroque,
// art nouveau, art déco, exotique). Charge un dossier de sons et génère une
// page HTML autonome dans le dossier de sortie.


import { clamp, inWater, pointDistanceToPolyline, randomPointInPolygon } from "./carte-sonore-formes";
import type { DecorationCarte, EauVille, Esthetique, Palette, PointSonore, RouteVille } from "./carte-sonore-formes";

export const MARGE = 24;

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

export function palettePour(esthetique: Esthetique): Palette {
  return PALETTES[esthetique] ?? PALETTES.classique;
}

export const NOMS_RUES = [
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
export const NOMS_AVENUES = [
  "Avenue de la Liberté", "Avenue de la République", "Avenue de la Paix",
  "Avenue de la Gare", "Avenue des Champs", "Avenue de l'Europe",
  "Avenue de la Victoire", "Avenue du Général de Gaulle", "Avenue du Nord",
  "Avenue du Sud", "Avenue de la Plage", "Avenue des Lumières",
  "Avenue de l'Atalante", "Avenue des Astres", "Avenue des Orphées",
  "Avenue des Météores", "Avenue du Crystal", "Avenue de la Lune Rousse",
  "Avenue des Mirages", "Avenue des Échos", "Avenue du Jazz",
  "Avenue des Glycines", "Avenue des Iris",
];
export const NOMS_BOU = [
  "Boulevard de la Liberté", "Boulevard de l'Est", "Boulevard de l'Ouest",
  "Boulevard du Nord", "Boulevard du Sud", "Boulevard du Centre",
  "Boulevard de la République", "Boulevard des Capucines",
  "Boulevard des Mille Étoiles", "Boulevard du Rêve Éveillé",
  "Boulevard des Métamorphoses", "Boulevard de l'Horizon Bleu",
  "Boulevard du Roi Soleil", "Boulevard du Charleston",
];

export function pickNom(rng: () => number, usedNames: Set<string>, list: string[]): string {
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

export function placerPoi(
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

export function placerPoints(
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

