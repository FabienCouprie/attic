// plugins/pochette.ts — Nœud « Générateur de pochette » : génère une pochette
// d'album procédurale (canvas) depuis un prompt + titre + artiste.
// Hors-ligne, instantané, sans GPU. Export PNG.

import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "generateur-pochette", nom: "Générateur de pochette", nomEn: "Cover Art Generator",
    univers: "Autres", famille: "Texte",
    resume: "Génère une pochette d'album procédurale depuis un prompt + titre.",
    resumeEn: "Generates procedural album cover art from a prompt + title.",
    entrees: [],
    sorties: [],
    parametres: [
      { nom: "Prompt", nomEn: "Prompt", type: "texte", defaut: "dark ambient night mysterious",
        doc: "Description du style (couleurs déduites des mots-clés : feu/rouge, eau/bleu, nature/vert, nuit/noir, jour/jaune, rêve/violet, terre/marron…).",
        docEn: "Style description (colors derived from keywords: fire/red, water/blue, nature/green, night/black, day/yellow, dream/purple, earth/brown…)." },
      { nom: "Titre", nomEn: "Title", type: "texte", defaut: "Album",
        doc: "Titre de l'album (inséré dans l'image).", docEn: "Album title (inserted in the image)." },
      { nom: "Artiste", nomEn: "Artist", type: "texte", defaut: "",
        doc: "Nom de l'artiste (inséré sous le titre).", docEn: "Artist name (inserted below the title)." },
      { nom: "Style", nomEn: "Style", type: "choix",
        options: ["minimaliste", "geometrique", "vagues", "grain", "concentrique", "bauhaus"],
        optionsEn: ["Minimalist", "Geometric", "Waves", "Grain", "Concentric", "Bauhaus"],
        defaut: "bauhaus",
        doc: "Style visuel. Minimaliste = dégradé simple ; Géométrique = grille de formes ; Vagues = couches superposées ; Grain = texture bruitée ; Concentrique = cercles ; Bauhaus = formes primaires.",
        docEn: "Visual style. Minimalist = simple gradient; Geometric = shape grid; Waves = layered waves; Grain = noisy texture; Concentric = circles; Bauhaus = primary shapes." },
      { nom: "Graine", nomEn: "Seed", plage: [0, 99999], pas: 1, defaut: 0,
        doc: "Graine aléatoire (0 = nouvelle à chaque exécution). Même graine = même pochette.",
        docEn: "Random seed (0 = new each run). Same seed = same cover." },
    ],
    async executer(ctx: any) {
      // La pochette est générée par la vue (canvas). Le plugin signale juste.
      const titre = ctx.paramTexte("Titre", "Album");
      const style = ctx.paramTexte("Style", "bauhaus");
      const prompt = ctx.paramTexte("Prompt", "dark ambient night mysterious");
      return { valeurs: [], message: `Pochette « ${titre} » · ${style} · ${prompt.slice(0, 30)}` };
    },
  },
] as FicheAudio[]).map(avecDoc);
