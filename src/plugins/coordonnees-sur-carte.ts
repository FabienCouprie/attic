// plugins/coordonnees-sur-carte.ts — Variante de Carte sonore pilotée par des
// coordonnées 2D reçues en entrée (ex. sortie « Coordonnées » de Classification
// de pistes) plutôt que par un dossier lu au hasard. Réutilise tel quel le
// moteur de génération de carte (routes, quartiers, bâtiments, esthétiques) de
// carte-sonore.ts — décor procédural identique, seule la position des points
// change. carte-sonore.ts n'est ni modifié ni dupliqué : uniquement ses
// exports publics (générateurs de carte, rendu HTML, types).

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import {
  genererCarteVille, genererCarteConcentrique, genererCarteVoronoi, genererCarteOrganique, genererHtmlCarte,
  type StyleCarte, type Esthetique, type PointSonore,
} from "./carte-sonore";

const MAX_POINTS = 400;

// Même palette Okabe-Ito (sûre pour le daltonisme) que le graphique SVG de
// Classification de pistes (algebre-musicale.ts) — cohérence visuelle entre
// les deux nœuds quand on colore par groupe.
const PALETTE_GROUPES = ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7", "#999999"];

function safeFileName(nom: string): string {
  return nom.replace(/[^a-zA-Z0-9._-]/g, "_");
}

interface CoordEntree { nom: string; chemin: string; x: number; y: number }
interface RapportEntree { nom: string; chemin: string; groupe: number; probabilites?: number[] }

function parserJson<T>(texte: string | null | undefined): T[] | null {
  if (!texte || !texte.trim()) return null;
  try {
    const v = JSON.parse(texte);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

// Un seul facteur d'échelle pour les deux axes (pas un par axe) : sinon les
// distances relatives entre points sont déformées et la carte cesse de
// représenter fidèlement la similarité calculée en amont.
function rescalerCoordonnees(points: CoordEntree[], largeur: number, hauteur: number, marge: number): { x: number; y: number }[] {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const etendueX = Math.max(Math.max(...xs) - Math.min(...xs), 1e-6);
  const etendueY = Math.max(Math.max(...ys) - Math.min(...ys), 1e-6);
  const echelle = Math.min((largeur - 2 * marge) / etendueX, (hauteur - 2 * marge) / etendueY);
  const centreX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const centreY = (Math.max(...ys) + Math.min(...ys)) / 2;
  return points.map((p) => ({
    x: largeur / 2 + (p.x - centreX) * echelle,
    y: hauteur / 2 + (p.y - centreY) * echelle,
  }));
}

export const fiches: FicheAudio[] = ([
  {
    id: "coordonnees-sur-carte", nom: "Coordonnées sur carte", nomEn: "Coordinates on Map",
    univers: "Collections", famille: "Export",
    resume: "Projette des coordonnées 2D reçues en entrée (ex. sortie Coordonnées de Classification de pistes) sur une carte fictive — même moteur visuel (style, esthétique) que Carte sonore, mais la position des points reflète la similarité calculée en amont plutôt que d'être aléatoire.",
    resumeEn: "Projects 2D coordinates received as input (e.g. the Coordinates output of Track classification) onto a fictional map — same visual engine (style, aesthetic) as Sound Map, but point position reflects upstream-computed similarity instead of being random.",
    affichageAutonome: true,
    entrees: [
      { nom: "Rapport", nomEn: "Report", type: "texte", requis: false },
      { nom: "Coordonnées", nomEn: "Coordinates", type: "texte", requis: true },
    ],
    sorties: [],
    parametres: [
      { nom: "Dossier sortie", nomEn: "Output folder", type: "dossier", defaut: "", defautEn: "",
        doc: "Dossier où générer index.html et copier les sons.", docEn: "Folder where index.html and the sounds will be generated." },
      { nom: "Titre", nomEn: "Title", type: "texte", defaut: "Coordonnées sur carte", defautEn: "Coordinates on Map",
        doc: "Titre de la page HTML.", docEn: "Title of the HTML page." },
      { nom: "Style", nomEn: "Style", type: "choix", options: ["Ville en grille", "Cercles concentriques", "Organique", "Voronoi"], optionsEn: ["Grid city", "Concentric circles", "Organic", "Voronoi"], optionIds: ["ville", "concentrique", "organique", "voronoi"], defaut: "Ville en grille", defautEn: "Grid city",
        doc: "Style de la carte.", docEn: "Map style." },
      { nom: "Esthétique", nomEn: "Aesthetic", type: "choix", options: ["Classique", "Baroque", "Art nouveau", "Art déco", "Exotique"], optionsEn: ["Classic", "Baroque", "Art Nouveau", "Art Deco", "Exotic"], optionIds: ["classique", "baroque", "art-nouveau", "art-deco", "exotique"], defaut: "Classique", defautEn: "Classic",
        doc: "Ambiance visuelle de la carte (décor : routes, quartiers, bâtiments).", docEn: "Visual mood of the map (backdrop: roads, districts, buildings)." },
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [0, 9999], pas: 1, defaut: 0,
        doc: "Graine du décor procédural (0 = décor différent à chaque exécution). Ne change pas la position des points, calquée sur les coordonnées reçues.", docEn: "Procedural backdrop seed (0 = different backdrop each run). Does not affect point position, which follows the received coordinates." },
    ],
    async executer(ctx: any) {
      const api = (window as any).api;
      if (!api?.ecrireFichier) return { valeurs: [], message: traduire("msg.n_cessite_electron") };

      const coordonnees = parserJson<CoordEntree>(ctx.entree(1));
      if (!coordonnees || coordonnees.length === 0) {
        return { valeurs: [], erreur: true, message: traduire("msg.aucune_coordonnee_recue") };
      }
      const rapportBrut = parserJson<RapportEntree>(ctx.entree(0));
      const groupeParChemin = new Map<string, number>();
      if (rapportBrut) for (const r of rapportBrut) groupeParChemin.set(r.chemin, r.groupe);

      const sortie = ctx.paramTexte("Dossier sortie", "").replace(/^[/\\]+|[/\\]+$/g, "");
      if (!sortie) return { valeurs: [], message: traduire("msg.aucun_r_pertoire_de_sortie_sp_cifi") };

      const titre = ctx.paramTexte("Titre", "Coordonnées sur carte");
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

      const selection = coordonnees.slice(0, MAX_POINTS);
      const pointInputs = selection.map((c) => ({ nom: c.nom, chemin: c.chemin }));

      ctx.onProgress(traduire("progress.g_n_ration_de_la_carte"));
      const carte = style === "concentrique"
        ? genererCarteConcentrique(graine, 1920, 1080, pointInputs, esthetique)
        : style === "organique"
        ? genererCarteOrganique(graine, 1920, 1080, pointInputs, esthetique)
        : style === "voronoi"
        ? genererCarteVoronoi(graine, 1920, 1080, pointInputs, esthetique)
        : genererCarteVille(graine, 1920, 1080, pointInputs, esthetique);

      // On garde tout le décor généré (routes, quartiers, bâtiments, eau,
      // décorations) tel quel — seule la position (et, si un Rapport est
      // branché, la couleur) des points est remplacée par les données reçues.
      const positions = rescalerCoordonnees(selection, carte.width, carte.height, 90);
      const points: PointSonore[] = selection.map((c, i) => ({
        x: positions[i].x,
        y: positions[i].y,
        nom: c.nom,
        chemin: c.chemin,
        couleur: groupeParChemin.has(c.chemin)
          ? PALETTE_GROUPES[groupeParChemin.get(c.chemin)! % PALETTE_GROUPES.length]
          : carte.points[i]?.couleur ?? "#999999",
      }));
      const carteRepositionnee = { ...carte, points };

      const html = genererHtmlCarte(carteRepositionnee, titre, selection);

      const dossierSortie = sortie.replace(/\\/g, "/");
      const htmlPath = `${dossierSortie}/index.html`;
      const htmlOk = await api.ecrireFichier(htmlPath, html);

      let copies = 0;
      if (api.copierFichier) {
        for (const c of selection) {
          ctx.onProgress(traduire("progress.copie_audio_var_0", c.nom));
          const cible = `${dossierSortie}/audio/${safeFileName(c.nom)}`;
          const res = await api.copierFichier(c.chemin, cible);
          if (res) copies++;
        }
      }

      // Même limite du canal `ctx.noeud.data` que Carte sonore, même
      // solution : ces champs `_xxx` sont reportés dans l'état réel par la
      // fusion générique de useExecutionGraphe.ts, pas par ce plugin.
      (ctx.noeud.data as any)._coordCarteHtmlPath = htmlPath;
      (ctx.noeud.data as any)._coordCarteSonore = carteRepositionnee;

      return {
        valeurs: [],
        message: traduire("msg.coord_carte_g_n_r_e_var_0_var_1_points_var_2_audio_copi", htmlPath, points.length, copies, htmlOk ? "HTML écrit ✓" : "HTML échec ✗"),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
