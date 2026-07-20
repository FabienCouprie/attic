// plugins/resonance.ts — Nœud de spatialisation 3D via Resonance Audio.
import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";
import { appliquerResonanceAudio } from "../audio/effets-spectral";

const MATERIALS = [
  "transparent",
  "acoustic-ceiling-tiles",
  "brick-bare",
  "brick-painted",
  "concrete-block-coarse",
  "concrete-block-painted",
  "curtain-heavy",
  "fiber-glass-insulation",
  "glass-thin",
  "glass-thick",
  "grass",
  "linoleum-on-concrete",
  "marble",
  "metal",
  "plywood",
  "plaster-smooth",
  "wood-panel",
];

export const fiches: FicheAudio[] = ([
  {
    id: "resonance-audio",
    nom: "Resonance Audio",
    nomEn: "Resonance Audio",
    univers: "Traitement",
    famille: "Effets",
    resume: "Spatialisation 3D binaurale d’un son via Resonance Audio (HRTF + modèle de salle).",
    resumeEn: "Binaural 3D spatialization of a sound using Resonance Audio (HRTF + room model).",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      {
        nom: "Source X", nomEn: "Source X", type: "curseur",
        plage: [-10, 10], pas: 0.1, defaut: 2,
        doc: "Position gauche/droite de la source (mètres).",
        docEn: "Left/right position of the source (meters).",
      },
      {
        nom: "Source Y", nomEn: "Source Y", type: "curseur",
        plage: [-10, 10], pas: 0.1, defaut: 0,
        doc: "Position haut/bas de la source (mètres).",
        docEn: "Up/down position of the source (meters).",
      },
      {
        nom: "Source Z", nomEn: "Source Z", type: "curseur",
        plage: [-10, 10], pas: 0.1, defaut: 0,
        doc: "Position avant/arrière de la source (mètres).",
        docEn: "Front/back position of the source (meters).",
      },
      {
        nom: "Largeur", nomEn: "Width", type: "curseur",
        plage: [1, 100], pas: 0.5, defaut: 20,
        doc: "Largeur de la pièce (mètres).",
        docEn: "Room width (meters).",
      },
      {
        nom: "Hauteur", nomEn: "Height", type: "curseur",
        plage: [1, 100], pas: 0.5, defaut: 10,
        doc: "Hauteur de la pièce (mètres).",
        docEn: "Room height (meters).",
      },
      {
        nom: "Profondeur", nomEn: "Depth", type: "curseur",
        plage: [1, 100], pas: 0.5, defaut: 20,
        doc: "Profondeur de la pièce (mètres).",
        docEn: "Room depth (meters).",
      },
      {
        nom: "Matériau", nomEn: "Material", type: "choix",
        options: MATERIALS,
        optionsEn: MATERIALS,
        defaut: "plaster-smooth",
        doc: "Matériau appliqué aux six parois de la pièce.",
        docEn: "Material applied to the six room surfaces.",
      },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null], message: "Aucune entrée audio." };
      }
      const sourceX = ctx.paramNombre("Source X", 2);
      const sourceY = ctx.paramNombre("Source Y", 0);
      const sourceZ = ctx.paramNombre("Source Z", 0);
      const roomWidth = ctx.paramNombre("Largeur", 20);
      const roomHeight = ctx.paramNombre("Hauteur", 10);
      const roomDepth = ctx.paramNombre("Profondeur", 20);
      const roomMaterial = ctx.paramTexte("Matériau", "plaster-smooth");
      try {
        const out = await appliquerResonanceAudio(
          audio,
          sourceX,
          sourceY,
          sourceZ,
          roomWidth,
          roomHeight,
          roomDepth,
          roomMaterial,
        );
        return { valeurs: [out], message: `Resonance Audio · ${audio.numberOfChannels}→2 canaux` };
      } catch (err: any) {
        return { valeurs: [null], erreur: true, message: `Erreur Resonance Audio : ${err?.message ?? err}` };
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
