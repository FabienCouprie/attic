// plugins/decaleur-frequence.ts — Nœud « Décaleur de fréquence ».
//
// D'après Scott Wardle, « A Hilbert-Transformer Frequency Shifter for Audio », DAFx-98 ; et
// pour l'original analogique, Harald Bode et Robert Moog, « A High-Accuracy Frequency Shifter
// for Professional Audio Applications », JAES, 1972.
//
// La logique est dans `audio/decalage-frequence.ts`, testée ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { decalerFrequence } from "../audio/decalage-frequence";

export const fiches: FicheAudio[] = ([
  {
    id: "decaleur-frequence", nom: "Décaleur de fréquence", nomEn: "Frequency Shifter",
    univers: "Traitement", famille: "Effets",
    resume: "Ajoute le même nombre de hertz à toutes les fréquences : le son cesse d'être harmonique et devient cloche.",
    resumeEn: "Adds the same number of hertz to every frequency: the sound stops being harmonic and turns bell-like.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Décalage", nomEn: "Shift", type: "curseur", plage: [-1000, 1000], pas: 1, defaut: 100, unite: "Hz",
        doc: "Hertz ajoutés à TOUTES les fréquences. 200-400-600 décalé de 50 donne 250-450-650 : les rapports ne sont plus entiers, et c'est pourquoi on entend une cloche là où il y avait une note. Quelques hertz seulement suffisent à faire battre un son sans le dénaturer ; au-delà de la centaine, on quitte franchement la hauteur de départ.",
        docEn: "Hertz added to EVERY frequency. 200-400-600 shifted by 50 gives 250-450-650: the ratios are no longer whole numbers, which is why a note turns into a bell. A few hertz are enough to make a sound beat without disfiguring it; beyond a hundred, the original pitch is frankly left behind." },
      { nom: "Écart stéréo", nomEn: "Stereo offset", type: "curseur", plage: [0, 20], pas: 0.5, defaut: 0, unite: "Hz",
        doc: "Hertz ajoutés au canal droit en plus du décalage. Quelques dixièmes suffisent : les deux canaux dérivent alors l'un par rapport à l'autre et le son s'élargit lentement, sans déphasage destructeur. Sans effet sur un son mono.",
        docEn: "Hertz added to the right channel on top of the shift. A few tenths are enough: the two channels then drift apart and the sound widens slowly, with no destructive phasing. No effect on a mono sound." },
      { nom: "Mélange", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Part du son décalé dans la sortie. À 50 %, l'original et son décalage battent ensemble — c'est ainsi qu'on obtient les timbres métalliques doux plutôt qu'un dépaysement complet.",
        docEn: "Share of the shifted sound in the output. At 50 %, the original and its shift beat together — that is how one gets gently metallic timbres rather than a complete displacement." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!(entree instanceof AudioBuffer)) {
        return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      }
      const decalage = ctx.paramNombre("Décalage", 100);
      const ecart = ctx.paramNombre("Écart stéréo", 0);
      const melange = Math.max(0, Math.min(1, ctx.paramNombre("Mélange", 100) / 100));

      const { numberOfChannels: canaux, length, sampleRate } = entree;
      const sortie = new AudioBuffer({ numberOfChannels: canaux, length, sampleRate });
      for (let c = 0; c < canaux; c++) {
        const sec = entree.getChannelData(c);
        const decale = decalerFrequence(sec, decalage + (c > 0 ? ecart : 0), { sampleRate });
        const melangee = new Float32Array(length);
        for (let i = 0; i < length; i++) melangee[i] = sec[i] * (1 - melange) + decale[i] * melange;
        sortie.copyToChannel(melangee, c);
      }
      return {
        valeurs: [sortie],
        message: traduire("msg.decaleur.resultat",
          decalage > 0 ? `+${decalage}` : String(decalage),
          String(Math.round(melange * 100))),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
