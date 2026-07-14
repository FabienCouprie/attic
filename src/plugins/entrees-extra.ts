// plugins/entrees-extra.ts — Nœuds entrees-extra (issus du découpage de complements.ts).

import type { PluginDef } from "../core";
import {
  decoderFichier, decoderBlob,
  appliquerEchoPingPong, appliquerReverbeProgressive,
  extraireZone, reinsererZone, melangerPistes, placerSonSurZones,
  fusionnerPistes, bouclerAudio,
  genererMelodieAleatoire, genererMusiqueFractale, genererBoiteRythmes,
  genererAccords, rendreAvecEchantillon,
  bufferVersMp3Blob,
} from "../audio";
import { avecDoc } from "./notices";

export const fiches: PluginDef[] = ([
  {
    id: "explorateur-musique", nom: "Explorateur musique", nomEn: "Music explorer", univers: "Entrées", famille: "Audio",
    resume: "Charge un fichier audio depuis l'explorateur.",
    resumeEn: "Loads an audio file from the explorer.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [{ nom: "Chemin", nomEn: "Path", type: "texte", defaut: "music collection", docEn: "Directory to scan, relative to project folder." }],
    async executer(ctx: any) {
      const f = ctx.noeud.data.audioFichier;
      if (!f) return { valeurs: [null], message: "Aucun fichier." };
      const buf = await decoderFichier(f, ctx.runtime);
      return { valeurs: [buf] };
    },
  },

  // ── Effets ──
] as PluginDef[]).map(avecDoc);
