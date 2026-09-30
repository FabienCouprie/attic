// plugins/fondamentale-manquante.ts — La fiche de la fondamentale manquante.
//
// Le calcul, ses références et la raison de ses choix sont dans `audio/fondamentale-manquante.ts`.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  echantillonsDuComplexe, echantillonsDuSinus, hauteurPrediteDuResidu, partielsDuComplexe,
} from "../audio/fondamentale-manquante";
import { fondamentaleVirtuelle } from "../audio/harmonie-spectrale";

const en = () => langueCourante() === "en";
const SR = 44100;

export const fiches: FicheAudio[] = ([
  {
    id: "fondamentale-manquante", nom: "Fondamentale manquante", nomEn: "Missing Fundamental",
    univers: "Entrées", famille: "Génération",
    resume: "Une suite d'harmoniques sans son fondamental, qui s'entend pourtant à la hauteur de ce fondamental absent.",
    resumeEn: "A run of harmonics without its fundamental, which is nonetheless heard at the pitch of that absent fundamental.",
    notice: "Ce composant rend un son fait d'harmoniques consécutifs dont le fondamental est absent. La hauteur entendue est celle de ce fondamental, qui n'est pourtant nulle part dans le signal.\n\nD'après Jan Frederik Schouten, « The perception of subjective tones », Proceedings of the Koninklijke Nederlandse Akademie van Wetenschappen 41, 1938, p. 1086-1093, qui nomme le résidu ; August Seebeck l'avait observé dès 1841. J. C. R. Licklider, « Periodicity pitch and place pitch », Journal of the Acoustical Society of America 26, 1954, p. 945, montre que la hauteur survit à un bruit masquant la région du fondamental. Ernst Terhardt, « Pitch, consonance, and harmony », même journal 55(5), 1974, p. 1061-1069, en tire la hauteur virtuelle.\n\n« Fondamentale » est la hauteur qui s'entendra. « Premier rang » est le premier harmonique présent : à un, la fondamentale est jouée et il n'y a plus d'illusion ; à trois, le son commence au triple et la hauteur reste celle du simple.\n\n« Harmoniques » est le nombre de rangs consécutifs présents. « Décroissance » est la pente de leurs amplitudes, de toutes égales à une décroissance en un sur le rang.\n\n« Décalage » ajoute le même nombre de hertz à tous les partiels. Les écarts entre eux ne changent pas, et la hauteur perçue se déplace pourtant, d'environ le décalage divisé par le rang moyen : c'est la mesure de Schouten, Ritsma et Cardozo, « Pitch of the residue », Journal of the Acoustical Society of America 34(9), 1962, p. 1418-1424. Le rapport donne cette prédiction au premier ordre.\n\n« Masque » ajoute un bruit grave couvrant la région du fondamental absent. La hauteur y survit, ce qui écarte l'explication par un produit de distorsion né dans l'oreille ou dans l'appareil.\n\n« Comparaison » fait précéder le complexe d'une sinusoïde à la fondamentale : les deux hauteurs s'entendent alors l'une après l'autre, et la seconde n'est pas dans le signal.\n\n« Durée » est celle de chaque son et « Volume » le niveau de sortie.\n\nLa sortie « Audio » rend le son. La sortie « Rapport » donne les partiels présents, la fondamentale absente et la hauteur que le calcul de fondamentale virtuelle attribue au même agrégat. Le message donne le nombre de partiels et la hauteur attendue.",
    noticeEn: "This node returns a sound made of consecutive harmonics whose fundamental is absent. The pitch heard is that of the fundamental, which is nowhere in the signal.\n\nAfter Jan Frederik Schouten, « The perception of subjective tones », Proceedings of the Koninklijke Nederlandse Akademie van Wetenschappen 41, 1938, pp. 1086-1093, who names the residue; August Seebeck had observed it as early as 1841. J. C. R. Licklider, « Periodicity pitch and place pitch », Journal of the Acoustical Society of America 26, 1954, p. 945, shows the pitch survives a noise masking the region of the fundamental. Ernst Terhardt, « Pitch, consonance, and harmony », same journal 55(5), 1974, pp. 1061-1069, draws virtual pitch from it.\n\n« Fundamental » is the pitch that will be heard. « First rank » is the first harmonic present: at one, the fundamental is played and there is no illusion left; at three, the sound starts at the triple and the pitch stays that of the simple.\n\n« Harmonics » is the number of consecutive ranks present. « Decay » is the slope of their amplitudes, from all equal to a decay in one over the rank.\n\n« Shift » adds the same number of hertz to every partial. The gaps between them do not change, and the perceived pitch moves all the same, by about the shift divided by the mean rank: that is the measurement of Schouten, Ritsma and Cardozo, « Pitch of the residue », Journal of the Acoustical Society of America 34(9), 1962, pp. 1418-1424. The report gives that first-order prediction.\n\n« Mask » adds a low noise covering the region of the absent fundamental. The pitch survives it, which rules out the explanation by a distortion product born in the ear or in the equipment.\n\n« Comparison » has the complex preceded by a sine wave at the fundamental: the two pitches are then heard one after the other, and the second is not in the signal.\n\n« Length » is that of each sound and « Volume » the output level.\n\nThe « Audio » output returns the sound. The « Report » output gives the partials present, the absent fundamental and the pitch that the virtual fundamental computation attributes to the same aggregate. The message gives the number of partials and the expected pitch.",
    entrees: [],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Fondamentale", nomEn: "Fundamental", type: "curseur", plage: [40, 800], pas: 1, defaut: 220, unite: "Hz",
        doc: "La hauteur qui s'entendra. Elle n'est jouée que si « Premier rang » vaut un.",
        docEn: "The pitch that will be heard. It is played only if « First rank » is one." },
      { nom: "Premier rang", nomEn: "First rank", type: "curseur", plage: [1, 16], pas: 1, defaut: 3,
        doc: "Le premier harmonique présent. À un, la fondamentale est jouée et l'illusion disparaît : c'est la comparaison. Au-delà de dix, les rangs deviennent trop serrés pour que l'oreille les sépare, et la hauteur du résidu s'affaiblit.",
        docEn: "The first harmonic present. At one, the fundamental is played and the illusion goes: that is the comparison. Beyond ten, the ranks grow too close for the ear to separate them, and the residue pitch weakens." },
      { nom: "Harmoniques", nomEn: "Harmonics", type: "curseur", plage: [1, 16], pas: 1, defaut: 6,
        doc: "Le nombre de rangs consécutifs présents. Un seul partiel n'est qu'une sinusoïde, et s'entend à sa propre hauteur.",
        docEn: "The number of consecutive ranks present. A single partial is only a sine wave, and is heard at its own pitch." },
      { nom: "Décroissance", nomEn: "Decay", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "La pente des amplitudes : à zéro tous les partiels pèsent autant, à cent le rang k pèse un sur k.",
        docEn: "The slope of the amplitudes: at zero all partials weigh the same, at one hundred rank k weighs one over k." },
      { nom: "Décalage", nomEn: "Shift", type: "curseur", plage: [-200, 200], pas: 1, defaut: 0, unite: "Hz",
        doc: "Le même nombre de hertz ajouté à tous les partiels. Les écarts entre eux ne bougent pas, et la hauteur perçue se déplace pourtant d'environ ce décalage divisé par le rang moyen. Le son n'est alors plus harmonique.",
        docEn: "The same number of hertz added to every partial. The gaps between them do not move, and the perceived pitch shifts all the same by about that shift divided by the mean rank. The sound is then no longer harmonic." },
      { nom: "Masque", nomEn: "Mask", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Un bruit grave couvrant la région du fondamental absent. La hauteur y survit, ce qui écarte l'explication par un produit de distorsion né à cette fréquence.",
        docEn: "A low noise covering the region of the absent fundamental. The pitch survives it, which rules out the explanation by a distortion product born at that frequency." },
      { nom: "Comparaison", nomEn: "Comparison", type: "choix",
        options: ["Non", "Sinus d'abord"], optionsEn: ["No", "Sine first"],
        optionIds: ["non", "sinus"], defaut: "Sinus d'abord", defautEn: "Sine first",
        doc: "Fait précéder le complexe d'une sinusoïde à la fondamentale, pour entendre les deux hauteurs l'une après l'autre.",
        docEn: "Has the complex preceded by a sine wave at the fundamental, to hear the two pitches one after the other." },
      { nom: "Durée", nomEn: "Length", type: "curseur", plage: [0.2, 5], pas: 0.1, defaut: 1.5, unite: "s",
        doc: "La durée de chaque son.", docEn: "The length of each sound." },
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 70, unite: "%",
        doc: "Niveau de sortie.", docEn: "Output level." },
    ],
    async executer(ctx: any) {
      const o = {
        fondamentale: ctx.paramNombre("Fondamentale", 220),
        premierRang: ctx.paramNombre("Premier rang", 3),
        harmoniques: ctx.paramNombre("Harmoniques", 6),
        decroissance: ctx.paramNombre("Décroissance", 50),
        decalage: ctx.paramNombre("Décalage", 0),
      };
      const partiels = partielsDuComplexe(o);
      if (partiels.length === 0) {
        return { valeurs: [null, null], message: en() ? "No partial." : "Aucun partiel." };
      }
      const duree = ctx.paramNombre("Durée", 1.5);
      const niveau = Math.max(0, Math.min(1, ctx.paramNombre("Volume", 70) / 100));
      const complexe = echantillonsDuComplexe(partiels, {
        duree, niveau,
        masque: ctx.paramNombre("Masque", 0) / 100,
        // La coupure se pose sous le premier partiel : le bruit couvre la région du fondamental
        // absent sans noyer les partiels qui portent le résidu.
        coupure: Math.max(20, partiels[0].frequence * 0.8),
        sampleRate: SR, graine: 1,
      });

      const avecSinus = String(ctx.paramTexte("Comparaison", "sinus")) === "sinus";
      const sinus = avecSinus
        ? echantillonsDuSinus(o.fondamentale, duree, niveau, SR)
        : new Float32Array(0);
      const creux = avecSinus ? Math.round(0.4 * SR) : 0;
      const sortie = new AudioBuffer({
        numberOfChannels: 1, length: sinus.length + creux + complexe.length, sampleRate: SR,
      });
      const d = sortie.getChannelData(0);
      if (avecSinus) d.set(sinus, 0);
      d.set(complexe, sinus.length + creux);

      // LA HAUTEUR ANNONCÉE VIENT DU CALCUL DÉJÀ ÉCRIT, celui de l'harmonie spectrale : il n'y a pas
      // deux estimateurs de fondamentale virtuelle dans ce dépôt.
      const virtuelle = fondamentaleVirtuelle(partiels.map((p) => p.frequence));
      const predite = hauteurPrediteDuResidu(o);
      const nb = (v: number) => (en() ? v.toFixed(1) : v.toFixed(1).replace(".", ","));
      const entete = en()
        ? `Missing fundamental: ${nb(o.fondamentale)} Hz, absent from the signal.`
        : `Fondamentale manquante : ${nb(o.fondamentale)} Hz, absente du signal.`;
      const lignes = partiels.map((p) =>
        `  ${en() ? "rank" : "rang"} ${p.rang} · ${nb(p.frequence)} Hz · ${p.amplitude.toFixed(3)}`);
      const dit = [
        entete, "",
        en() ? "Partials present:" : "Partiels présents :", ...lignes, "",
        en()
          ? `Residue theory, first order: ${nb(predite)} Hz.`
          : `Théorie du résidu, premier ordre : ${nb(predite)} Hz.`,
        en()
          ? `Virtual fundamental computed on these frequencies: ${nb(virtuelle)} Hz.`
          : `Fondamentale virtuelle calculée sur ces fréquences : ${nb(virtuelle)} Hz.`,
      ].join("\n");

      return {
        valeurs: [sortie, dit],
        message: en()
          ? `${partiels.length} partials, ranks ${partiels[0].rang} to ${partiels[partiels.length - 1].rang} · heard at ${nb(predite)} Hz`
          : `${partiels.length} partiels, rangs ${partiels[0].rang} à ${partiels[partiels.length - 1].rang} · entendu à ${nb(predite)} Hz`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
