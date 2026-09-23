// plugins/velours.ts — Nœud « Réverbération velours ».
//
// D'après Vesa Välimäki et al., « Late Reverberation Synthesis Using Filtered Velvet Noise »,
// 2017 ; et pour la décroissance quelconque, Fagerström, Meyer-Kahlen, Schlecht et Välimäki,
// « Dark Velvet Noise », DAFx-22, puis « Non-Exponential Reverberation Modeling Using Dark
// Velvet Noise », 2024.
//
// La logique est dans `audio/velours.ts`, testée ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { convoluer, reponseVelours, type ProfilDecroissance } from "../audio/velours";

export const fiches: FicheAudio[] = ([
  {
    id: "reverberation-velours", nom: "Réverbération velours", nomEn: "Velvet Reverb",
    univers: "Traitement", famille: "Effets",
    resume: "Réverbération à queue libre : exponentielle comme une salle, linéaire, en gonflement, ou à deux pentes.",
    resumeEn: "Reverb with a free-form tail: exponential like a room, linear, swelling, or two-sloped.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Réponse", nomEn: "Impulse response", type: "audio" },
    ],
    parametres: [
      { nom: "Profil", nomEn: "Profile", type: "choix",
        options: ["Exponentielle", "Linéaire", "Gonflement", "Salles couplées"],
        optionsEn: ["Exponential", "Linear", "Swell", "Coupled rooms"],
        optionIds: ["exponentielle", "lineaire", "gonflement", "couplee"],
        defaut: "Exponentielle", defautEn: "Exponential",
        doc: "Forme de la queue. L'exponentielle est ce que fait une salle. La linéaire descend en ligne droite, ce qu'aucune ne fait. Le gonflement monte et s'arrête net ; on ne l'obtient autrement qu'en retournant un enregistrement. Les salles couplées enchaînent deux pentes, signature d'une salle qui en contient une autre : une église et sa chapelle, une scène et sa cage.",
        docEn: "Shape of the tail. The exponential is what a room does. The linear falls in a straight line, which none does. The swell rises and stops dead, otherwise obtainable only by reversing a recording. Coupled rooms chain two slopes, the signature of a room containing another: a church and its chapel, a stage and its tower." },
      { nom: "Durée", nomEn: "Length", type: "curseur", plage: [0.2, 8], pas: 0.1, defaut: 2, unite: "s",
        doc: "Longueur de la queue. Au-delà de la chute de soixante décibels, elle n'ajoute que du silence.",
        docEn: "Length of the tail. Beyond the sixty-decibel drop it adds nothing but silence." },
      { nom: "Chute", nomEn: "Decay", type: "curseur", plage: [0.2, 8], pas: 0.1, defaut: 1.5, unite: "s",
        doc: "Temps de chute de soixante décibels, le RT60 des acousticiens. Sans effet sur le profil linéaire, qui tient toute la durée.",
        docEn: "Time to fall sixty decibels, the acousticians' RT60. No effect on the linear profile, which holds for the whole length." },
      { nom: "Densité", nomEn: "Density", type: "curseur", plage: [200, 4000], pas: 100, defaut: 1500, unite: "/s",
        doc: "Impulsions par seconde. Au-dessus du millier, l'oreille n'entend plus les impulsions séparées mais une nappe, et une nappe plus lisse que celle d'un bruit gaussien, aucune impulsion n'étant plus forte qu'une autre. En dessous, on les entend une à une, ce qui est un effet en soi.",
        docEn: "Impulses per second. Above a thousand, the ear no longer hears separate impulses but a smooth wash, smoother than a Gaussian noise of the same density, since no impulse is louder than another. Below, they are heard one by one, which is an effect in itself." },
      { nom: "Assombrissement", nomEn: "Darkening", type: "curseur", plage: [1, 100], pas: 1, defaut: 25, unite: "%",
        doc: "À quel point les aigus s'éteignent avant les graves. Cent laisse la queue brillante, ce qui s'entend comme une nappe de bruit collée au son ; vingt-cinq donne une salle ordinaire.",
        docEn: "How much the treble dies before the bass. A hundred leaves the tail bright, which sounds like a noise wash glued onto the sound; twenty-five gives an ordinary room." },
      { nom: "Coude", nomEn: "Knee", type: "curseur", plage: [5, 95], pas: 5, defaut: 30, unite: "%",
        doc: "Pour les salles couplées seulement : à quel moment de la queue la seconde pente prend le relais.",
        docEn: "For coupled rooms only: at what point in the tail the second slope takes over." },
      { nom: "Mélange", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 35, unite: "%",
        doc: "Part de son réverbéré dans la sortie.",
        docEn: "Share of reverberated sound in the output." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [1, 999999], pas: 1, defaut: 1,
        doc: "Graine des positions et des signes. Deux graines donnent deux salles de mêmes dimensions.",
        docEn: "Seed of the positions and signs. Two seeds give two rooms of the same dimensions." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!(entree instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      }
      const { sampleRate, numberOfChannels: canaux, length } = entree;
      const profil = ctx.paramTexte("Profil", "exponentielle") as ProfilDecroissance;
      const duree = ctx.paramNombre("Durée", 2);
      const melange = Math.max(0, Math.min(1, ctx.paramNombre("Mélange", 35) / 100));
      const commun = {
        duree, sampleRate, profil,
        rt60: ctx.paramNombre("Chute", 1.5),
        densite: Math.round(ctx.paramNombre("Densité", 1500)),
        assombrissement: ctx.paramNombre("Assombrissement", 25) / 100,
        coude: ctx.paramNombre("Coude", 30) / 100,
      };

      const longueurReponse = Math.max(1, Math.round(duree * sampleRate));
      const sortie = new AudioBuffer({ numberOfChannels: canaux, length, sampleRate });
      const reponses = new AudioBuffer({ numberOfChannels: canaux, length: longueurReponse, sampleRate });
      for (let c = 0; c < canaux; c++) {
        ctx.onProgress?.(traduire("msg.velours.canal", String(c + 1), String(canaux)));
        // Une graine par canal : les deux côtés décrivent la même salle sans être la même queue,
        // ce qui donne l'ampleur d'une réverbération stéréo sans aucun élargissement artificiel.
        const h = reponseVelours({ ...commun, graine: Math.round(ctx.paramNombre("Graine", 1)) + c * 977 });
        const sec = entree.getChannelData(c);
        const mouille = convoluer(sec, h);
        // Le niveau d'une convolution dépend de la longueur de la queue : on le recale sur le son
        // d'entrée, faute de quoi allonger la réverbération monterait le volume.
        let cs = 0, cm = 0;
        for (let i = 0; i < length; i++) cs = Math.max(cs, Math.abs(sec[i]));
        for (let i = 0; i < mouille.length; i++) cm = Math.max(cm, Math.abs(mouille[i]));
        const g = cm > 1e-9 ? cs / cm : 0;
        const melangee = new Float32Array(length);
        for (let i = 0; i < length; i++) melangee[i] = sec[i] * (1 - melange) + mouille[i] * g * melange;
        sortie.copyToChannel(melangee, c);
        reponses.copyToChannel(new Float32Array(h), c);
      }
      return {
        valeurs: [sortie, reponses],
        message: traduire("msg.velours.resultat", duree.toFixed(1),
          String(Math.round(commun.densite)), String(Math.round(melange * 100))),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
