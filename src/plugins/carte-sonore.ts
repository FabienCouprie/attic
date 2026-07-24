// plugins/carte-sonore.ts — Carte sonore procédurale d'une ville fictive.
// Charge un dossier de sons, génère une carte avec des points cliquables et
// stocke le résultat pour la vue interactive.

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

export interface RouteVille { x1: number; y1: number; x2: number; y2: number; epaisseur: number; }
export interface BatimentVille { x: number; y: number; w: number; h: number; couleur: string; }
export interface EspaceVertVille { cx: number; cy: number; rx: number; ry: number; }

export interface CarteSonore {
  width: number;
  height: number;
  routes: RouteVille[];
  batiments: BatimentVille[];
  espacesVerts: EspaceVertVille[];
  riviere: { x: number; y: number }[];
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

const PALETTE_POINTS = [
  "#e63946", "#f4a261", "#2a9d8f", "#264653", "#e9c46a",
  "#457b9d", "#a8dadc", "#1d3557", "#f1faee", "#d62828",
  "#6a4c93", "#8ac926", "#1982c4", "#ffca3a", "#ff595e",
];

const COULEURS_BATS = ["#d4c4b0", "#c9b8a4", "#e0d6c8", "#b8b5b1", "#c8d6e5"];

export function genererCarteVille(
  seed: number,
  width = 640,
  height = 420,
  points: { nom: string; chemin: string }[] = [],
): CarteSonore {
  const rng = mulberry32(seed);
  const routes: RouteVille[] = [];
  const batiments: BatimentVille[] = [];
  const espacesVerts: EspaceVertVille[] = [];

  const marge = 24;

  // Routes horizontales
  const nbHoriz = 4 + Math.floor(rng() * 3);
  const yRoutes: number[] = [];
  for (let i = 0; i < nbHoriz; i++) {
    const y = marge + (rng() * (height - 2 * marge));
    yRoutes.push(y);
  }
  yRoutes.sort((a, b) => a - b);
  for (const y of yRoutes) {
    routes.push({ x1: marge, y1: y, x2: width - marge, y2: y, epaisseur: 2 + rng() * 4 });
  }

  // Routes verticales
  const nbVert = 4 + Math.floor(rng() * 3);
  const xRoutes: number[] = [];
  for (let i = 0; i < nbVert; i++) {
    const x = marge + (rng() * (width - 2 * marge));
    xRoutes.push(x);
  }
  xRoutes.sort((a, b) => a - b);
  for (const x of xRoutes) {
    routes.push({ x1: x, y1: marge, x2: x, y2: height - marge, epaisseur: 2 + rng() * 4 });
  }

  // Bâtiments dans les blocs
  for (let i = 0; i < yRoutes.length - 1; i++) {
    for (let j = 0; j < xRoutes.length - 1; j++) {
      if (rng() > 0.25) {
        const pad = 8;
        const bx = xRoutes[j] + pad;
        const by = yRoutes[i] + pad;
        const bw = Math.max(10, xRoutes[j + 1] - xRoutes[j] - 2 * pad);
        const bh = Math.max(10, yRoutes[i + 1] - yRoutes[i] - 2 * pad);
        const inset = 2 + rng() * 6;
        batiments.push({
          x: bx + inset,
          y: by + inset,
          w: Math.max(4, bw - 2 * inset),
          h: Math.max(4, bh - 2 * inset),
          couleur: COULEURS_BATS[Math.floor(rng() * COULEURS_BATS.length)],
        });
      } else if (rng() > 0.5) {
        const cx = (xRoutes[j] + xRoutes[j + 1]) / 2;
        const cy = (yRoutes[i] + yRoutes[i + 1]) / 2;
        const rx = (xRoutes[j + 1] - xRoutes[j]) / 2 - 4;
        const ry = (yRoutes[i + 1] - yRoutes[i]) / 2 - 4;
        espacesVerts.push({ cx, cy, rx: Math.max(4, rx), ry: Math.max(4, ry) });
      }
    }
  }

  // Rivière sinusoïdale
  const riviere: { x: number; y: number }[] = [];
  const riverY = marge + rng() * (height - 2 * marge);
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const x = marge + (i / steps) * (width - 2 * marge);
    const y = riverY + Math.sin(i * 0.7 + rng() * 10) * (20 + rng() * 40);
    riviere.push({ x, y });
  }

  // Points : positions aléatoires sans chevauchement
  const pointsResult: PointSonore[] = [];
  const minDist = 24;
  const maxTentatives = 200;
  for (let i = 0; i < points.length; i++) {
    const nom = points[i].nom.replace(/\.[^.]+$/, "");
    const couleur = PALETTE_POINTS[i % PALETTE_POINTS.length];
    let placed = false;
    for (let t = 0; t < maxTentatives; t++) {
      const x = marge + rng() * (width - 2 * marge);
      const y = marge + rng() * (height - 2 * marge);
      const tooClose = pointsResult.some((p) => Math.hypot(p.x - x, p.y - y) < minDist);
      if (!tooClose) {
        pointsResult.push({ x, y, nom, chemin: points[i].chemin, couleur });
        placed = true;
        break;
      }
    }
    if (!placed) {
      // fallback en grille
      const x = marge + ((i * 37) % (width - 2 * marge));
      const y = marge + ((i * 53) % (height - 2 * marge));
      pointsResult.push({ x, y, nom, chemin: points[i].chemin, couleur });
    }
  }

  return { width, height, routes, batiments, espacesVerts, riviere, points: pointsResult, graine: seed };
}

const EXTENSIONS_AUDIO = [".wav", "wave", ".mp3", ".ogg", ".flac", ".m4a", ".aac", ".webm"];

export const fiches: FicheAudio[] = ([
  {
    id: "carte-sonore", nom: "Carte sonore", nomEn: "Sound Map", univers: "Autres", famille: "Carte sonore",
    resume: "Charge un dossier audio et génère une carte de ville fictive avec des points cliquables.",
    resumeEn: "Loads an audio folder and generates a fictional city map with clickable sound points.",
    affichageAutonome: true,
    entrees: [],
    sorties: [],
    parametres: [
      { nom: "Chemin", nomEn: "Path", type: "dossier", defaut: "music collection", defautEn: "music collection",
        doc: "Dossier à scanner, relatif au projet.", docEn: "Folder to scan, relative to project root." },
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [0, 9999], pas: 1, defaut: 0,
        doc: "Graine de la ville (0 = carte différente à chaque exécution).", docEn: "City seed (0 = new city each run)." },
      { nom: "Points", nomEn: "Points", type: "curseur", plage: [1, 50], pas: 1, defaut: 20,
        doc: "Nombre maximum de points/sons sur la carte.", docEn: "Maximum number of sound points on the map." },
    ],
    async executer(ctx: any) {
      const api = (window as any).api;
      if (!api?.lireDossier) return { valeurs: [], message: traduire("msg.n_cessite_electron") };

      const chemin = ctx.paramTexte("Chemin", "music collection").replace(/^[/\\]+|[/\\]+$/g, "");
      const graineParam = ctx.paramNombre("Graine", 0);
      const graine = graineParam > 0 ? graineParam : Math.floor(Math.random() * 99999) + 1;
      const maxPoints = Math.max(1, Math.min(50, Math.round(ctx.paramNombre("Points", 20))));

      if (!chemin) return { valeurs: [], message: traduire("msg.aucun_r_pertoire_sp_cifi") };

      ctx.onProgress(traduire("progress.lecture_du_r_pertoire"));
      let fichiers: { nom: string; chemin: string }[] = (await api.lireDossier(chemin)) ?? [];
      fichiers = fichiers.filter((f: any) => {
        const ext = f.nom.slice(f.nom.lastIndexOf(".")).toLowerCase();
        return EXTENSIONS_AUDIO.includes(ext);
      });
      if (fichiers.length === 0) return { valeurs: [], message: traduire("msg.aucun_fichier_audio_dans_var_0", chemin) };

      const selection = shuffle(fichiers, mulberry32(graine)).slice(0, maxPoints);
      const carte = genererCarteVille(graine, 640, 420, selection.map((f) => ({ nom: f.nom, chemin: f.chemin })));

      // Stocker pour la vue interactive
      (ctx.noeud.data as any)._carteSonore = carte;
      (ctx.noeud.data as any)._carteSonoreGraine = graine;

      return { valeurs: [], message: traduire("msg.carte_sonore_g_n_r_e_var_0_points_graine_var_1", carte.points.length, graine) };
    },
  },
] as FicheAudio[]).map(avecDoc);
