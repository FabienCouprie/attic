// plugins/retard-spectral.ts — Retarder le grave plus que l'aigu.
//
// D'après Välimäki, Abel et Smith, « Spectral Delay Filters », JAES 57(7-8), 2009 ; et Pekonen et
// Välimäki, DAFx-09, pour la réaction et les coefficients variables. La logique est dans
// `audio/retard-spectral.ts`, testée ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { longueurTraine, retardDeGroupe, retardSpectral } from "../audio/retard-spectral";

export const fiches: FicheAudio[] = ([
  {
    id: "retard-spectral", nom: "Retard spectral", nomEn: "Spectral Delay",
    univers: "Traitement", famille: "Effets",
    resume: "Retarde le grave plus que l'aigu — ou l'inverse — sans rien couper : le son n'est pas filtré, il est étalé.",
    resumeEn: "Delays the low end more than the high end — or the other way round — without cutting anything: the sound is not filtered, it is spread out.",
    entrees: [
      { nom: "Audio", type: "audio" },
      { nom: "Modulation", nomEn: "Modulation", type: "courbe", requis: false },
    ],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Sections", nomEn: "Sections", type: "curseur", plage: [1, 1000], pas: 1, defaut: 200,
        doc: "Nombre de passe-tout en cascade. Une section ne fait presque rien — quelques échantillons —, et les retards s'additionnent : c'est ce réglage qui fait l'ampleur de l'effet. C'est aussi lui qui décide du coût, le calcul étant proportionnel au produit du nombre de sections par la durée : 0,05 s pour deux secondes de son à 200 sections, 0,14 s à 500.",
        docEn: "Number of cascaded allpass sections. One section does almost nothing — a few samples — and the delays add up: this setting sets the scale of the effect. It also decides the cost, the computation being proportional to sections times duration: 0.05 s for two seconds of sound at 200 sections, 0.14 s at 500." },
      { nom: "Dispersion", nomEn: "Dispersion", type: "curseur", plage: [0, 0.99], pas: 0.01, defaut: 0.9,
        doc: "Force de l'étalement, soit le coefficient des passe-tout. À zéro, la cascade devient un simple retard de « Sections » échantillons, identique pour toutes les fréquences. Près de un, l'écart entre les deux bouts du spectre explose — et la traîne avec lui, car elle croît comme (1+a)/(1−a).",
        docEn: "Strength of the spreading, that is the allpass coefficient. At zero the cascade becomes a plain delay of « Sections » samples, the same for every frequency. Near one, the gap between the two ends of the spectrum explodes — and so does the tail, which grows as (1+a)/(1−a)." },
      { nom: "Sens", nomEn: "Direction", type: "choix",
        options: ["Grave retardé", "Aigu retardé"], optionsEn: ["Low end delayed", "High end delayed"],
        optionIds: ["grave", "aigu"], defaut: "Grave retardé", defautEn: "Low end delayed",
        doc: "Quel bout du spectre arrive en dernier. Il n'y a rien d'autre à changer pour inverser l'effet : c'est le signe du coefficient, et la formule du retard de groupe échange ses deux bouts avec lui. Les deux sens ne se valent pas, et il vaut mieux le savoir : le retard se concentre dans une bosse étroite en fréquence, placée au grave ou à Nyquist selon le signe. Au grave, cette bosse couvre plusieurs octaves audibles — mesuré à 44,1 kHz, 200 sections, dispersion 0,9 : 86 ms à 100 Hz, encore 30 ms à 1 kHz. À l'aigu, elle se loge dans la dernière fraction d'octave sous Nyquist, où il n'y a presque rien à retarder : 0,3 ms à 10 kHz, 1,4 ms à 16 kHz. « Aigu retardé » est donc un effet discret par nature, et non un réglage mal fichu.",
        docEn: "Which end of the spectrum arrives last. Nothing else needs changing to reverse the effect: it is the sign of the coefficient, and the group-delay formula swaps its two ends with it. The two directions are not equals, and it is better to know it: the delay gathers in a bump that is narrow in frequency, placed at the low end or at Nyquist depending on the sign. At the low end that bump spans several audible octaves — measured at 44.1 kHz, 200 sections, dispersion 0.9: 86 ms at 100 Hz, still 30 ms at 1 kHz. At the high end it sits in the last fraction of an octave below Nyquist, where there is almost nothing left to delay: 0.3 ms at 10 kHz, 1.4 ms at 16 kHz. « High end delayed » is therefore a subtle effect by nature, not a botched setting." },
      { nom: "Réaction", nomEn: "Feedback", type: "curseur", plage: [0, 0.95], pas: 0.01, defaut: 0, unite: "%",
        doc: "Renvoie la sortie dans la cascade, ce qui donne une suite d'échos dont chacun est plus dispersé que le précédent : le premier est encore un son, le dixième une traînée. C'est l'apport de l'article de 2009 suivi de DAFx-09.",
        docEn: "Feeds the output back into the cascade, giving a series of echoes each more dispersed than the last: the first is still a sound, the tenth a streak. This is the addition of the 2009 paper's DAFx-09 sequel." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Proportion de son traité. À 0 %, la sortie est le son d'entrée, inchangé.",
        docEn: "Proportion of processed sound. At 0 %, the output is the input, unchanged." },
      { nom: "Traîne max", nomEn: "Max tail", type: "curseur", plage: [0.5, 20], pas: 0.5, defaut: 4, unite: "s",
        doc: "Borne de la queue ajoutée après le son. Ce n'est pas un réglage de confort : à forte dispersion, la traîne théorique atteint des dizaines de secondes que le rebouclage répète encore, et le rendu deviendrait interminable. La borne la coupe, et c'est ce qui rend les réglages extrêmes utilisables.",
        docEn: "Bound on the tail added after the sound. This is not a comfort setting: at high dispersion the theoretical tail reaches tens of seconds, which feedback then repeats, and rendering would become endless. The bound cuts it, and that is what makes extreme settings usable." },
      { nom: "Modulation min", nomEn: "Modulation min", type: "curseur", plage: [0, 0.99], pas: 0.01, defaut: 0.2,
        doc: "Dispersion que vaut le zéro d'une courbe branchée sur l'entrée Modulation. Sans courbe, ce réglage ne sert pas.",
        docEn: "Dispersion that a connected curve's zero means. With no curve, this setting does nothing." },
      { nom: "Modulation max", nomEn: "Modulation max", type: "curseur", plage: [0, 0.99], pas: 0.01, defaut: 0.95,
        doc: "Dispersion que vaut le un de la courbe. C'est aussi ce qui fixe la longueur de la traîne quand une courbe est branchée : elle se mesure sur la dispersion la plus forte que le rendu atteindra.",
        docEn: "Dispersion that the curve's one means. It is also what sets the tail length when a curve is connected: the tail is measured on the strongest dispersion the render will reach." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!(entree instanceof AudioBuffer)) {
        return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      }
      const sections = Math.round(ctx.paramNombre("Sections", 200));
      const dispersion = ctx.paramNombre("Dispersion", 0.9);
      const versLeGrave = ctx.paramTexte("Sens", "grave") !== "aigu";
      const { numberOfChannels: canaux, length, sampleRate } = entree;
      const options = {
        sections, dispersion, versLeGrave,
        reaction: ctx.paramNombre("Réaction", 0) / 100,
        melange: ctx.paramNombre("Mix", 100) / 100,
        courbe: ctx.entree(1),
        plage: {
          min: ctx.paramNombre("Modulation min", 0.2),
          max: ctx.paramNombre("Modulation max", 0.95),
        },
        traineMax: Math.round(ctx.paramNombre("Traîne max", 4) * sampleRate),
      };

      const voies: Float32Array[] = [];
      for (let c = 0; c < canaux; c++) {
        ctx.onProgress?.(traduire("msg.retardSpectral.canal", String(c + 1), String(canaux)));
        voies.push(retardSpectral(entree.getChannelData(c), options));
      }
      // La sortie est plus longue que l'entrée : la traîne du bout lent sort après la fin du son,
      // et la couper reviendrait à jeter l'effet même qu'on cherche.
      const nouvelle = Math.max(length, ...voies.map((v) => v.length));
      const sortie = new AudioBuffer({ numberOfChannels: canaux, length: nouvelle, sampleRate });
      for (let c = 0; c < canaux; c++) sortie.getChannelData(c).set(voies[c].subarray(0, nouvelle));

      // Le retard annoncé est celui de DEUX FRÉQUENCES RÉELLES, 100 Hz et 10 kHz, et non celui des
      // deux bouts mathématiques du spectre. La différence n'est pas cosmétique : à dispersion
      // 0,9, le retard vaut 86 ms au zéro absolu et à Nyquist, mais la bosse est étroite en
      // fréquence, si bien qu'à 10 kHz il ne reste que 0,3 ms. Annoncer 86 ms côté aigu ferait
      // attendre un effet que l'oreille n'entendra pas — mesuré dans l'application.
      const a = Math.min(0.999, Math.abs(dispersion)) * (versLeGrave ? -1 : 1);
      const ms = (hz: number) =>
        (1000 * sections * retardDeGroupe(a, (2 * Math.PI * hz) / sampleRate)) / sampleRate;
      return {
        valeurs: [sortie],
        message: traduire("msg.retardSpectral.retards",
          ms(100).toFixed(0), ms(10000).toFixed(0),
          (longueurTraine(sections, Math.abs(a)) / sampleRate).toFixed(2)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
