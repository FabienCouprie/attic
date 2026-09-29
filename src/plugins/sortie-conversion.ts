// plugins/sortie-conversion.ts — Nœuds sortie-conversion (issus du découpage de complements.ts).

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { bufferVersMp3Blob } from "../audio";
import { decrire } from "../audio/metadonnees";
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
      let mp3Url: string | undefined;
      try {
        const qualite = ctx.paramNombre("Qualité", 192);
        const { serialiserGraphe } = await import("../audio/graphe-embarque");
        const graphe = serialiserGraphe() ?? undefined;
        const blob = await bufferVersMp3Blob(a, qualite, graphe, decrire(a, { noeud: "WAV → MP3" }));
        // LE MP3 PRÉCÉDENT SE RÉVOQUE, et il se relit dans le canal déclaré où le run d'avant l'a
        // laissé. Ce fichier était le dernier champ d'affichage d'un composant à passer par un nom
        // convenu : il figurait même dans la signature universelle des exécuteurs, faute d'endroit
        // où le mettre. C'est la cicatrice que le canal efface.
        const avant = (ctx.noeud.data as { _affichage?: { mp3Url?: string } })._affichage?.mp3Url;
        if (typeof avant === "string") URL.revokeObjectURL(avant);
        mp3Url = URL.createObjectURL(blob);
      } catch (e: any) {
        // L'audio passe quand même : la suite du graphe n'a pas à tomber avec l'encodeur. Mais l'échec
        // se dit — c'est son silence qui avait caché des MP3 qui n'en étaient pas.
        return { valeurs: [a, { debut: 0, duree: a.duration }], message: `MP3 : ${e?.message ?? String(e)}` };
      }
      return { valeurs: [a, { debut: 0, duree: a.duration }], affichage: { mp3Url } };
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
      // LE GRAPHE PART PAR LE CANAL DU MOTEUR : c'est lui qui écrit le WAV, donc lui qui doit
      // savoir quoi y embarquer. Rien ne se pose sur le nœud.
      return { valeurs: [a, { debut: 0, duree: a.duration }], moteur: { grapheAEmbarquer: graphe } };
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
