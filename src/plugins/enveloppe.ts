// plugins/enveloppe.ts — Modeleur d'enveloppe ADSR.

import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";
import { appliquerADSR } from "../audio";

export const fiches: FicheAudio[] = ([
  {
    id: "enveloppe-adsr", nom: "Enveloppe ADSR", nomEn: "ADSR Envelope",
    univers: "Traitement", famille: "Effets",
    resume: "Modèle le volume du son dans le temps (attaque, déclin, maintien, relâchement).",
    resumeEn: "Shapes the sound's volume over time (attack, decay, sustain, release).",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Attaque", nomEn: "Attack", plage: [0, 2000], pas: 1, defaut: 10, unite: "ms",
        doc: "Temps de montée du silence au maximum. Court = percussif ; long = son qui gonfle.", docEn: "Rise time from silence to peak. Short = percussive; long = swelling sound." },
      { nom: "Déclin", nomEn: "Decay", plage: [0, 2000], pas: 1, defaut: 100, unite: "ms",
        doc: "Temps de descente du pic vers le niveau de maintien.", docEn: "Fall time from peak to the sustain level." },
      { nom: "Maintien", nomEn: "Sustain", plage: [0, 100], pas: 1, defaut: 70, unite: "%",
        doc: "Niveau (pas une durée !) tenu au cœur du son.", docEn: "Level (not a duration!) held through the body of the sound." },
      { nom: "Relâchement", nomEn: "Release", plage: [0, 3000], pas: 1, defaut: 200, unite: "ms",
        doc: "Temps de retour au silence à la fin (la « queue » du son).", docEn: "Time to return to silence at the end (the sound's « tail »)." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Connectez une source audio." };
      const out = appliquerADSR(
        a,
        ctx.paramNombre("Attaque", 10),
        ctx.paramNombre("Déclin", 100),
        ctx.paramNombre("Maintien", 70),
        ctx.paramNombre("Relâchement", 200),
      );
      return { valeurs: [out] };
    },
  },
] as FicheAudio[]).map(avecDoc);
