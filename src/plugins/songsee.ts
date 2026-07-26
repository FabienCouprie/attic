// plugins/songsee.ts — Nœud « Visualisation Songsee » : génère une image de
// visualisation audio (spectrogram, mel, chroma, hpss, selfsim, loudness,
// tempogram, mfcc, flux) via le binaire Go Songsee. Nécessite Electron.
import type { FicheAudio } from "../audio/types-domaine";
import { bufferVersWavBlob } from "../audio/io";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

const VIZS = ["spectrogram", "mel", "chroma", "hpss", "selfsim", "loudness", "tempogram", "mfcc", "flux"];
const PALETTES = ["classic", "magma", "inferno", "viridis", "gray", "claw"];

export const fiches: FicheAudio[] = ([
  {
    id: "visualisation-songsee",
    nom: "Visualisation Songsee",
    nomEn: "Songsee Visualizer",
    univers: "Visualisation",
    famille: "Analyse",
    resume: "Génère une image de visualisation audio via le moteur Songsee.",
    resumeEn: "Generates an audio visualization image using the Songsee engine.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Image", type: "image" }],
    parametres: [
      {
        nom: "Visualisation",
        nomEn: "Visualization",
        type: "choix",
        options: ["Toutes", ...VIZS],
        defaut: "Toutes",
        doc: "Mode de visualisation Songsee. 'Toutes' génère une grille des 9 modes.",
        docEn: "Songsee visualization mode. 'All' renders a grid of all 9 modes.",
        optionsEn: ["All", ...VIZS],
        defautEn: "All",
      },
      {
        nom: "Palette",
        nomEn: "Palette",
        type: "choix",
        options: PALETTES,
        defaut: "classic",
        doc: "Palette de couleurs appliquée au spectrogramme.",
        docEn: "Color palette applied to the spectrogram.",
      },
      {
        nom: "Largeur",
        nomEn: "Width",
        type: "nombre",
        plage: [640, 3840],
        pas: 1,
        defaut: 1920,
        unite: "px",
        doc: "Largeur de l'image générée.",
        docEn: "Width of the generated image.",
      },
      {
        nom: "Hauteur",
        nomEn: "Height",
        type: "nombre",
        plage: [480, 2160],
        pas: 1,
        defaut: 1080,
        unite: "px",
        doc: "Hauteur de l'image générée.",
        docEn: "Height of the generated image.",
      },
      {
        nom: "Format",
        nomEn: "Format",
        type: "choix",
        options: ["JPEG", "PNG"],
        optionsEn: ["JPEG", "PNG"],
        defaut: "JPEG",
        defautEn: "JPEG",
        doc: "Format de l'image de sortie.",
        docEn: "Output image format.",
      },
      {
        nom: "Début",
        nomEn: "Start",
        type: "nombre",
        plage: [0, 3600],
        pas: 0.1,
        defaut: 0,
        unite: "s",
        doc: "Début de la zone analysée (en secondes). 0 = depuis le début.",
        docEn: "Start time of the analyzed region (seconds). 0 = from beginning.",
      },
      {
        nom: "Durée",
        nomEn: "Duration",
        type: "nombre",
        plage: [0, 3600],
        pas: 0.1,
        defaut: 0,
        unite: "s",
        doc: "Durée de la zone analysée (en secondes). 0 = tout le fichier.",
        docEn: "Duration of the analyzed region (seconds). 0 = whole file.",
      },
    ],
    async executer(ctx: any) {
      const api = (window as any).api;
      if (!api?.genererSongsee) {
        return { valeurs: [null], message: traduire("msg.n_cessite_electron") };
      }

      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null], message: traduire("msg.connecter.audio") };
      }

      const viz = ctx.paramTexte("Visualisation", "Toutes");
      const palette = ctx.paramTexte("Palette", "classic");
      const width = Math.round(ctx.paramNombre("Largeur", 1920));
      const height = Math.round(ctx.paramNombre("Hauteur", 1080));
      const format = ctx.paramTexte("Format", "JPEG").toLowerCase();
      const start = ctx.paramNombre("Début", 0);
      const duration = ctx.paramNombre("Durée", 0);

      const vizOpt = viz === "Toutes" || viz === "All" ? "all" : viz;
      const startOpt = start > 0 ? start : undefined;
      const durationOpt = duration > 0 ? duration : undefined;

      // Écriture du buffer audio dans un WAV temporaire.
      const wavBlob = bufferVersWavBlob(audio);
      const wavBytes = new Uint8Array(await wavBlob.arrayBuffer());
      const tempIn = `${ctx.repertoireTravail}/.songsee-in-${ctx.noeud.id}-${Date.now()}.wav`;
      const ecrit = await api.ecrireFichier(tempIn, wavBytes);
      if (!ecrit) {
        return { valeurs: [null], message: traduire("msg.songsee.ecriture impossible") };
      }

      try {
        ctx.onProgress?.(traduire("msg.songsee.generation"));
        const rep = await api.genererSongsee({
          cheminEntree: tempIn,
          options: {
            viz: vizOpt,
            palette,
            width,
            height,
            format,
            start: startOpt,
            duration: durationOpt,
          },
        });

        if (!rep.ok) {
          return { valeurs: [null], message: rep.erreur || traduire("msg.songsee.erreur") };
        }

        const ext = rep.format === "png" ? "png" : "jpg";
        const nomFichier = `songsee-${vizOpt}-${palette}.${ext}`;
        const fichier = new File([rep.donnees], nomFichier, { type: rep.mime });
        return {
          valeurs: [fichier],
          message: traduire("msg.songsee.termine", vizOpt, palette, `${rep.width}x${rep.height}`),
        };
      } catch (e: any) {
        return { valeurs: [null], message: e?.message || traduire("msg.songsee.erreur") };
      } finally {
        try { await api.supprimerFichier(tempIn); } catch {}
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
