// plugins/pochette.ts — Nœud « Générateur de pochette » : génère une pochette
// d'album procédurale en SVG depuis un prompt + titre + artiste.
// Hors-ligne, instantané, sans GPU. Sortie « Image » (SVG) chaînable.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { genererPochetteFile, genererPochetteSVG } from "./pochette-svg";

export { genererPochetteSVG };

export const fiches: FicheAudio[] = ([
  {
    id: "generateur-pochette", nom: "Générateur de pochette", nomEn: "Cover Art Generator",
    univers: "Autres", famille: "Génération",
    resume: "Génère une pochette d'album procédurale en SVG depuis un prompt + titre.",
    resumeEn: "Generates a procedural album cover (SVG) from a prompt + title.",
    entrees: [],
    sorties: [{ nom: "Image", nomEn: "Image", type: "image" }],
    parametres: [
      { nom: "Prompt", nomEn: "Prompt", type: "texte", defaut: "dark ambient night mysterious",
        doc: "Description du style. Les couleurs sont déduites des mots-clés (feu/rouge, eau/bleu, nature/vert, nuit/noir, jour/jaune, rêve/violet, terre/marron…).",
        docEn: "Style description. Colors are derived from keywords (fire/red, water/blue, nature/green, night/black, day/yellow, dream/purple, earth/brown…).", defautEn: "dark ambient night mysterious" },
      { nom: "Titre", nomEn: "Title", type: "texte", defaut: "Album",
        doc: "Titre de l'album (inséré dans l'image).", docEn: "Album title (inserted in the image).", defautEn: "Album" },
      { nom: "Artiste", nomEn: "Artist", type: "texte", defaut: "",
        doc: "Nom de l'artiste (inséré sous le titre).", docEn: "Artist name (inserted below the title).", defautEn: "" },
      { nom: "Style", nomEn: "Style", type: "choix",
        options: ["Minimaliste", "Géométrique", "Vagues", "Grain", "Concentrique", "Bauhaus", "Rayures", "Mosaïque", "Étoiles", "Brutalisme", "Cyber", "Pastel"],
        optionsEn: ["Minimalist", "Geometric", "Waves", "Grain", "Concentric", "Bauhaus", "Stripes", "Mosaic", "Stars", "Brutalism", "Cyber", "Pastel"],
        optionIds: ["minimaliste", "geometrique", "vagues", "grain", "concentrique", "bauhaus", "rayures", "mosaique", "etoiles", "brutalisme", "cyber", "pastel"],
        defaut: "bauhaus",
        defautEn: "bauhaus",
        doc: "Style visuel. Minimaliste = dégradé simple ; Géométrique = grille de formes ; Vagues = couches superposées ; Grain = texture bruitée ; Concentrique = cercles ; Bauhaus = formes primaires ; Rayures = bandes ; Mosaïque = tuiles ; Étoiles = champ d'étoiles ; Brutalisme = formes brutes ; Cyber = grille + glitch ; Pastel = taches douces.",
        docEn: "Visual style. Minimalist = simple gradient; Geometric = shape grid; Waves = layered waves; Grain = noisy texture; Concentric = circles; Bauhaus = primary shapes; Stripes = bands; Mosaic = tiles; Stars = star field; Brutalism = raw shapes; Cyber = grid + glitch; Pastel = soft blobs." },
      { nom: "Palette", nomEn: "Palette", type: "choix",
        options: ["Auto", "Chaud", "Froid", "Néon", "Pastel", "Monochrome", "Terre", "Royal", "Synthwave", "Sépia", "Cyber", "Forêt", "Océan", "Magma", "Givre"],
        optionsEn: ["Auto", "Warm", "Cold", "Neon", "Pastel", "Monochrome", "Earth", "Royal", "Synthwave", "Sepia", "Cyber", "Forest", "Ocean", "Magma", "Frost"],
        optionIds: ["auto", "chaud", "froid", "neon", "pastel", "monochrome", "terre", "royal", "synthwave", "sepia", "cyber", "foret", "ocean", "magma", "givre"],
        defaut: "auto",
        defautEn: "auto",
        doc: "Palette de couleurs. « Auto » déduit les couleurs du prompt. Les préréglages forcent une ambiance fixe.",
        docEn: "Color palette. « Auto » derives colors from the prompt. Presets force a fixed mood." },
      { nom: "Complexité", nomEn: "Complexity", type: "nombre", plage: [1, 100], pas: 1, defaut: 50,
        doc: "Densité des motifs (1 = minimal, 100 = très dense).", docEn: "Motif density (1 = minimal, 100 = very dense)." },
      { nom: "Bordure", nomEn: "Border", type: "choix",
        options: ["Non", "Fine", "Épaisse", "Arrondie"],
        optionsEn: ["None", "Thin", "Thick", "Rounded"],
        optionIds: ["non", "fine", "epaisse", "arrondie"],
        defaut: "non",
        defautEn: "non",
        doc: "Bordure décorative autour de la pochette.", docEn: "Decorative border around the cover." },
      { nom: "Typographie", nomEn: "Typography", type: "choix",
        options: ["Sans-serif", "Serif", "Mono", "Condensé", "Gras", "Script"],
        optionsEn: ["Sans-serif", "Serif", "Mono", "Condensed", "Bold", "Script"],
        optionIds: ["sans-serif", "serif", "mono", "condense", "gras", "script"],
        defaut: "sans-serif",
        defautEn: "sans-serif",
        doc: "Style de police pour le titre.", docEn: "Title font style." },
      { nom: "Largeur", nomEn: "Width", type: "nombre", plage: [128, 2048], pas: 1, defaut: 512,
        doc: "Largeur de l'image SVG en pixels.", docEn: "SVG image width in pixels." },
      { nom: "Hauteur", nomEn: "Height", type: "nombre", plage: [128, 2048], pas: 1, defaut: 512,
        doc: "Hauteur de l'image SVG en pixels.", docEn: "SVG image height in pixels." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [0, 99999], pas: 1, defaut: 0,
        doc: "Graine aléatoire (0 = nouvelle à chaque exécution). Même graine = même pochette.",
        docEn: "Random seed (0 = new each run). Same seed = same cover." },
    ],
    async executer(ctx: any) {
      const prompt = ctx.paramTexte("Prompt", "dark ambient night mysterious");
      const titre = ctx.paramTexte("Titre", "Album");
      const artiste = ctx.paramTexte("Artiste", "");
      const style = ctx.paramTexte("Style", "bauhaus");
      const palette = ctx.paramTexte("Palette", "auto");
      const complexite = ctx.paramNombre("Complexité", 50);
      const bordure = ctx.paramTexte("Bordure", "non");
      const typographie = ctx.paramTexte("Typographie", "sans-serif");
      const largeur = ctx.paramNombre("Largeur", 512);
      const hauteur = ctx.paramNombre("Hauteur", 512);
      const graine = ctx.paramNombre("Graine", 0);
      const fichier = genererPochetteFile({
        prompt, titre, artiste, style, palette,
        complexite, bordure, typographie,
        largeur, hauteur, graine,
      });
      return {
        valeurs: [fichier],
        message: traduire("msg.pochette_var_0_var_1_var_2", titre, style, prompt.slice(0, 30)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
