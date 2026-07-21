// plugins/sortie-conversion.ts — Nœuds sortie-conversion (issus du découpage de complements.ts).

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { bufferVersMp3Blob } from "../audio";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "visualiseur-forme-onde", nom: "Visualiseur", nomEn: "Waveform Viewer", univers: "Visualisation", famille: "Analyse",
    resume: "Affiche la forme d'onde du signal avec zoom et barre de défilement.",
    resumeEn: "Displays the waveform with zoom and scrollbar.",
    entrees: [{ nom: "Audio", type: "audio" }], sorties: [{ nom: "Audio", type: "audio" }, { nom: "Durée", nomEn: "Duration", type: "controle" }], parametres: [],
    async executer(ctx: any) {
      const a = ctx.entree(0); if (!(a instanceof AudioBuffer)) return { valeurs:[null, null] };
      return { valeurs:[a, { debut: 0, duree: a.duration }] };
   },
 },
  {
    id: "convertisseur-audio", nom: "WAV → MP3", nomEn: "WAV → MP3", univers: "Traitement", famille: "Conversion",
    resume: "Convertit un flux audio en MP3 téléchargeable.",
    resumeEn: "Converts an audio stream to downloadable MP3.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "Durée", nomEn: "Duration", type: "controle" }],
    parametres: [
      { nom: "Qualité", nomEn: "Quality", plage: [64,320], defaut: 192, unite: "kbps" },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      try {
        const qualite = ctx.paramNombre("Qualité", 192);
        const { serialiserGraphe } = await import("../audio/graphe-embarque");
        const graphe = serialiserGraphe() ?? undefined;
        const blob = await bufferVersMp3Blob(a, qualite, graphe);
        if ((ctx.noeud.data as any).mp3Url) URL.revokeObjectURL((ctx.noeud.data as any).mp3Url);
        (ctx.noeud.data as any).mp3Url = URL.createObjectURL(blob);
      } catch {
        // MP3 encoding failed — pass through audio anyway
      }
      return { valeurs: [a, { debut: 0, duree: a.duration }] };
   },
 },
  {
    id: "convertisseur-mp3-wav", nom: "MP3 → WAV", nomEn: "MP3 → WAV", univers: "Traitement", famille: "Conversion",
    resume: "Convertit un flux audio en WAV téléchargeable.",
    resumeEn: "Converts an audio stream to downloadable WAV.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "Durée", nomEn: "Duration", type: "controle" }],
    parametres: [],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      const { serialiserGraphe } = await import("../audio/graphe-embarque");
      const graphe = serialiserGraphe() ?? undefined;
      // Le graphe est embarqué dans le WAV téléchargé via la vue d'export
      (ctx.noeud.data as any)._grapheExport = graphe;
      return { valeurs: [a, { debut: 0, duree: a.duration }] };
   },
 },
  {
    id: "point-ecoute", nom: "Point d'écoute", nomEn: "Listening Point", univers: "Sorties", famille: "Écoute",
    resume: "Auditionne le signal sans interrompre la chaîne.",
    resumeEn: "Auditions the signal at a point in the chain without interrupting it.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e_connect_e") };
      return { valeurs: [a] };
   },
 },

  // ── IA ──
] as FicheAudio[]).map(avecDoc);
