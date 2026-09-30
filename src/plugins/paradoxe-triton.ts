// plugins/paradoxe-triton.ts — La fiche du paradoxe du triton.
//
// Le calcul, ses références et la raison de ses choix sont dans `audio/paradoxe-triton.ts`.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  classeAuTriton, echantillonsDeLaPaire, NOMS_DE_CLASSE, NOMS_DE_CLASSE_EN,
} from "../audio/paradoxe-triton";

const en = () => langueCourante() === "en";
const SR = 44100;

export const fiches: FicheAudio[] = ([
  {
    id: "paradoxe-triton", nom: "Paradoxe du triton", nomEn: "Tritone Paradox",
    univers: "Entrées", famille: "Génération",
    resume: "Deux sons séparés d'un demi-octave, dont le sens du mouvement dépend de qui écoute.",
    resumeEn: "Two tones half an octave apart, whose direction of movement depends on who is listening.",
    notice: "Ce composant rend des paires de sons séparés d'un triton, c'est-à-dire d'un demi-octave. D'après Diana Deutsch, « A musical paradox », Music Perception 3(3), 1986, p. 275-280 ; l'influence de la langue et de la région d'origine sur la réponse est établie dans Diana Deutsch, « The tritone paradox : an influence of language on music perception », Music Perception 8(4), 1991, p. 335-347.\n\nCertains auditeurs entendent la paire monter, d'autres la même paire descendre, et chacun reste d'accord avec lui-même d'une écoute à l'autre. Le signal ne tranche pas : la réponse vient de l'auditeur.\n\nUn son est fait de composantes espacées d'une octave, dont les amplitudes suivent une enveloppe fixe en fréquence. La classe de hauteur est donc nette et la hauteur absolue ne l'est pas : le son n'a pas d'octave. Le triton étant la moitié exacte d'une octave, la seconde classe est à six demi-tons dans un sens comme dans l'autre.\n\n« Classe de départ » donne la première des deux classes ; la seconde s'en déduit. « Les douze » joue les douze paires à la suite, une par classe de départ : c'est l'épreuve qui révèle l'orientation propre à un auditeur, certaines classes s'entendant hautes et leurs opposées basses.\n\n« Composantes » est le nombre de sinusoïdes espacées d'une octave. « Centre » est le sommet de l'enveloppe, qui ne se déplace pas avec la classe ; le déplacer permet de vérifier que la réponse n'en dépend pas. « Largeur » est l'étendue de l'enveloppe en octaves.\n\n« Durée » est celle d'un son, « Silence » l'écart entre les deux sons d'une paire, « Pause » l'écart entre deux paires. « Volume » est le niveau de sortie.\n\nLa sortie « Audio » rend les paires. La sortie « Rapport » donne l'ordre des paires jouées, pour noter ses réponses et les comparer ensuite. Le message donne le nombre de paires et la durée.",
    noticeEn: "This node returns pairs of tones a tritone apart, that is half an octave. After Diana Deutsch, « A musical paradox », Music Perception 3(3), 1986, pp. 275-280; the influence of language and region of origin on the answer is established in Diana Deutsch, « The tritone paradox: an influence of language on music perception », Music Perception 8(4), 1991, pp. 335-347.\n\nSome listeners hear the pair rise, others hear the same pair fall, and each stays consistent with themselves from one hearing to the next. The signal does not settle it: the answer comes from the listener.\n\nA tone is made of components spaced an octave apart, whose amplitudes follow an envelope fixed in frequency. The pitch class is therefore clear and the absolute height is not: the tone has no octave. The tritone being exactly half an octave, the second class lies six semitones away in either direction.\n\n« Starting class » gives the first of the two classes; the second follows from it. « All twelve » plays the twelve pairs in turn, one per starting class: this is the test that reveals a listener's own orientation, some classes being heard as high and their opposites as low.\n\n« Components » is the number of sine waves spaced an octave apart. « Centre » is the peak of the envelope, which does not move with the class; moving it allows one to check that the answer does not depend on it. « Width » is the spread of the envelope in octaves.\n\n« Length » is that of one tone, « Gap » the interval between the two tones of a pair, « Pause » the interval between two pairs. « Volume » is the output level.\n\nThe « Audio » output returns the pairs. The « Report » output gives the order of the pairs played, to note one's answers and compare them afterwards. The message gives the number of pairs and the length.",
    entrees: [],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Classe de départ", nomEn: "Starting class", type: "choix",
        options: [...NOMS_DE_CLASSE, "Les douze"],
        optionsEn: [...NOMS_DE_CLASSE_EN, "All twelve"],
        optionIds: [...NOMS_DE_CLASSE.map((_, i) => String(i)), "douze"],
        defaut: "Les douze", defautEn: "All twelve",
        doc: "La première classe de hauteur de la paire ; la seconde est à un triton. « Les douze » joue les douze paires à la suite, ce qui est l'épreuve complète.",
        docEn: "The first pitch class of the pair; the second is a tritone away. « All twelve » plays the twelve pairs in turn, which is the full test." },
      { nom: "Composantes", nomEn: "Components", type: "curseur", plage: [2, 12], pas: 1, defaut: 6,
        doc: "Le nombre de sinusoïdes espacées d'une octave qui composent un son. Peu de composantes laissent une octave perceptible, ce qui lève le paradoxe.",
        docEn: "The number of sine waves an octave apart making up a tone. Few components leave an audible octave, which dissolves the paradox." },
      { nom: "Centre", nomEn: "Centre", type: "curseur", plage: [100, 2000], pas: 1, defaut: 523, unite: "Hz",
        doc: "Le sommet de l'enveloppe des amplitudes. Il ne se déplace pas avec la classe de hauteur : c'est ce qui prive le son d'octave. Le changer permet de vérifier que la réponse n'en dépend pas.",
        docEn: "The peak of the amplitude envelope. It does not move with the pitch class: that is what deprives the tone of an octave. Changing it allows one to check that the answer does not depend on it." },
      { nom: "Largeur", nomEn: "Width", type: "curseur", plage: [0.3, 3], pas: 0.1, defaut: 1, unite: "oct",
        doc: "L'étendue de l'enveloppe, en octaves. Étroite, le son se réduit à une ou deux composantes et retrouve une octave ; large, toutes pèsent presque autant.",
        docEn: "The spread of the envelope, in octaves. Narrow, the tone comes down to one or two components and regains an octave; wide, they all weigh almost the same." },
      { nom: "Durée", nomEn: "Length", type: "curseur", plage: [0.1, 2], pas: 0.05, defaut: 0.5, unite: "s",
        doc: "La durée d'un son.", docEn: "The length of one tone." },
      { nom: "Silence", nomEn: "Gap", type: "curseur", plage: [0, 1], pas: 0.05, defaut: 0, unite: "s",
        doc: "Le silence entre les deux sons d'une paire.", docEn: "The silence between the two tones of a pair." },
      { nom: "Pause", nomEn: "Pause", type: "curseur", plage: [0, 4], pas: 0.1, defaut: 1.5, unite: "s",
        doc: "Le silence entre deux paires, pour « Les douze ». Il laisse le temps de noter sa réponse.",
        docEn: "The silence between two pairs, for « All twelve ». It leaves time to note one's answer." },
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 70, unite: "%",
        doc: "Niveau de sortie.", docEn: "Output level." },
    ],
    async executer(ctx: any) {
      const choix = String(ctx.paramTexte("Classe de départ", "douze"));
      const classes = choix === "douze"
        ? Array.from({ length: 12 }, (_, i) => i)
        : [Math.max(0, Math.min(11, Math.round(Number(choix) || 0)))];
      const commun = {
        composantes: ctx.paramNombre("Composantes", 6),
        centre: ctx.paramNombre("Centre", 523),
        largeur: ctx.paramNombre("Largeur", 1),
        duree: ctx.paramNombre("Durée", 0.5),
        silence: ctx.paramNombre("Silence", 0),
        niveau: Math.max(0, Math.min(1, ctx.paramNombre("Volume", 70) / 100)),
        sampleRate: SR,
      };
      const pause = Math.round(ctx.paramNombre("Pause", 1.5) * SR);

      const paires = classes.map((classe) => echantillonsDeLaPaire({ ...commun, classe }));
      const total = paires.reduce((s, p) => s + p.length, 0) + pause * Math.max(0, paires.length - 1);
      const sortie = new AudioBuffer({ numberOfChannels: 1, length: Math.max(1, total), sampleRate: SR });
      const d = sortie.getChannelData(0);
      let ou = 0;
      for (const p of paires) {
        d.set(p, ou);
        ou += p.length + pause;
      }

      // LE RAPPORT DIT CE QUI A ÉTÉ JOUÉ, DANS L'ORDRE : sans lui, l'auditeur note douze réponses
      // sans savoir à quelle paire chacune se rapporte, et l'épreuve ne veut plus rien dire.
      const noms = en() ? NOMS_DE_CLASSE_EN : NOMS_DE_CLASSE;
      const lignes = classes.map((c, i) =>
        `${i + 1}. ${noms[c]} → ${noms[classeAuTriton(c)]}`);
      const entete = en()
        ? "Tritone paradox. For each pair, note whether you hear it rise or fall."
        : "Paradoxe du triton. Pour chaque paire, notez si vous l'entendez monter ou descendre.";
      return {
        valeurs: [sortie, [entete, "", ...lignes].join("\n")],
        message: en()
          ? `${paires.length} pairs · ${(sortie.length / SR).toFixed(2)} s`
          : `${paires.length} paires · ${(sortie.length / SR).toFixed(2).replace(".", ",")} s`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
