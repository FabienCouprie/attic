// plugins/correction-hauteur.ts — Le nœud « Correction de hauteur ». La logique est dans
// `audio/correction-hauteur.ts`, testée ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { corrigerHauteur, courbeDeCorrection, degresDe, GAMMES_CORRECTION } from "../audio/correction-hauteur";

const NOTES = ["Do", "Do#", "Ré", "Mi♭", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "Si♭", "Si"];
const NOTES_EN = ["C", "C#", "D", "E♭", "E", "F", "F#", "G", "G#", "A", "B♭", "B"];

export const fiches: FicheAudio[] = ([
  {
    id: "correction-hauteur", nom: "Correction de hauteur", nomEn: "Pitch Correction",
    univers: "Traitement", famille: "Effets",
    resume: "Ramène chaque note sur le degré le plus proche de la gamme choisie, sans déplacer les formants.",
    resumeEn: "Brings every note to the nearest degree of the chosen scale, without moving the formants.",
    notice: "Le classique qui manquait, et dont Attic avait déjà toutes les pièces : un suiveur de hauteur pYIN qui rend une fréquence par trame avec sa confiance, des gammes, des tempéraments, et de quoi transposer. Il ne manquait que le nœud qui les relie — ce qui est exactement la forme que prennent les oublis d'un catalogue qui grossit par familles : ce qui a un auteur et un article se propose tout seul, ce qui est trop banal pour avoir une paternité n'a personne pour le rappeler.\n\nDeux réglages font tout, et on les confond volontiers. La force dit quelle part de l'écart est corrigée : à 100 %, la note tombe pile sur le degré ; à 50 %, on garde la moitié du vibrato et des attaques, ce qui est ce qu'on veut presque toujours. La transition dit en combien de temps la correction s'installe : à zéro, la hauteur saute d'un degré à l'autre sans passer par les intermédiaires — c'est l'effet rendu célèbre par un disque de 1998, et c'est un effet, pas un défaut ; à cinquante millisecondes, l'oreille n'entend plus qu'une justesse retrouvée.\n\nLa méthode est le recollement synchrone des périodes, et ce choix a une conséquence qui s'entend : les formants ne suivent pas la note. Le signal est découpé en grains de deux périodes qu'on recolle à un espacement différent ; le contenu de chaque grain ne bouge pas, si bien qu'une voix corrigée ne prend pas l'accent de l'écureuil — ce qu'un rééchantillonnage lui aurait fait. Un premier jet le faisait précisément ainsi et, sur les quelques dizaines de cents d'une correction ordinaire, ne déplaçait même pas la hauteur : un la à 452 Hz ressortait à 452,06 au lieu de 440.\n\nSa limite, puisqu'elle en a une : elle suppose un son périodique. Sur une voix ou un instrument tenu, c'est le cas ; sur un accord, un bruit ou une percussion, il n'y a pas de période à recoller, et le seuil de confiance est là pour que ces passages ne soient pas corrigés du tout. Le rapport est borné à quatre demi-tons : au-delà, deux copies d'un même grain s'annulent — mesuré, à l'octave la raie dominante tombe à un centième du niveau d'entrée. Pour transposer franchement, le catalogue a des outils faits pour cela.\n\nL'écart maximal n'est pas une prudence décorative : un suiveur de hauteur se trompe d'octave sur les sons riches, et corriger une erreur d'octave déplacerait la note d'une octave entière. Au-delà de la borne, on ne corrige pas — mieux vaut laisser une note juste qu'en fabriquer une fausse.\n\nLa seconde sortie rend la correction appliquée sous forme de courbe, à brancher sur le visualiseur : un demi vaut aucune correction, le haut tire vers l'aigu, le bas vers le grave. C'est la façon la plus directe de voir ce que le nœud a fait, et où il a renoncé.",
    noticeEn: "The classic that was missing, and whose parts Attic already had: a pYIN pitch follower returning a frequency per frame with its confidence, scales, temperaments, and ways to transpose. Only the node that links them was missing — which is exactly the shape a growing catalogue's omissions take: what has an author and a paper proposes itself, what is too ordinary to have a parent has nobody to recall it.\n\nTwo settings do everything, and they are readily confused. Strength says how much of the deviation is corrected: at 100 % the note lands exactly on the degree; at 50 % half the vibrato and the attacks are kept, which is what one wants almost always. Transition says how long the correction takes to settle: at zero the pitch jumps from one degree to the next without passing through — the effect made famous by a 1998 record, and it is an effect, not a fault; at fifty milliseconds the ear hears nothing but tuning restored.\n\nThe method is pitch-synchronous overlap-add, and that choice has an audible consequence: formants do not follow the note. The signal is cut into two-period grains that are glued back at a different spacing; each grain's content does not move, so a corrected voice does not take on a chipmunk accent — which resampling would have done to it. A first attempt did precisely that and, over the few dozen cents of an ordinary correction, did not even move the pitch: an A at 452 Hz came out at 452.06 instead of 440.\n\nIts limit, since it has one: it assumes a periodic sound. On a voice or a sustained instrument that holds; on a chord, a noise or a drum there is no period to glue, and the confidence threshold is there so those passages are not corrected at all. The ratio is bounded to four semitones: beyond that, two copies of one grain cancel — measured, at the octave the dominant line falls to a hundredth of the input level. To transpose in earnest, the catalogue has tools made for it.\n\nThe maximum deviation is not decorative caution: a pitch follower makes octave errors on rich sounds, and correcting an octave error would move the note by a whole octave. Beyond the bound nothing is corrected — better to leave a note in tune than to manufacture one out of it.\n\nThe second output returns the applied correction as a curve, to be plugged into the viewer: a half means no correction, the top pulls towards the treble, the bottom towards the bass. It is the most direct way to see what the node did, and where it gave up.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Correction", nomEn: "Correction", type: "courbe" },
    ],
    parametres: [
      { nom: "Tonique", nomEn: "Root", type: "choix",
        options: NOTES, optionsEn: NOTES_EN, optionIds: NOTES_EN.map((n) => n.toLowerCase()),
        defaut: "Do", defautEn: "C",
        doc: "La tonique de la gamme. Sans effet en chromatique, qui contient toutes les notes.",
        docEn: "The scale's root. Without effect in chromatic, which contains every note." },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: GAMMES_CORRECTION.map((g) => g.fr), optionsEn: GAMMES_CORRECTION.map((g) => g.en),
        optionIds: GAMMES_CORRECTION.map((g) => g.id), defaut: "Chromatique", defautEn: "Chromatic",
        doc: "Les degrés permis. Plus une gamme en a, moins la correction déplace les notes : la chromatique rend juste, la pentatonique impose une couleur et s'entend comme un effet.",
        docEn: "The allowed degrees. The more a scale has, the less the correction moves the notes: chromatic restores tuning, pentatonic imposes a colour and is heard as an effect." },
      { nom: "Force", nomEn: "Strength", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Part de l'écart corrigée. À 100 %, la note tombe pile sur le degré ; à 50 %, la moitié du vibrato et des attaques survit, ce qui est presque toujours ce qu'on veut.",
        docEn: "Share of the deviation corrected. At 100 % the note lands exactly on the degree; at 50 % half the vibrato and the attacks survive, which is almost always what one wants." },
      { nom: "Transition", nomEn: "Transition", type: "curseur", plage: [0, 200], pas: 1, defaut: 0, unite: "ms",
        doc: "Temps d'installation de la correction. À zéro, la hauteur saute d'un degré à l'autre : c'est l'effet de 1998, et c'en est un. Vers cinquante millisecondes, on n'entend plus qu'une justesse retrouvée.",
        docEn: "How long the correction takes to settle. At zero the pitch jumps from one degree to the next: that is the 1998 effect, and it is one. Around fifty milliseconds, nothing is heard but tuning restored." },
      { nom: "Confiance", nomEn: "Confidence", type: "curseur", plage: [10, 90], pas: 5, defaut: 40, unite: "%",
        doc: "En deçà de cette confiance du suiveur, la trame n'est pas corrigée. C'est ce qui laisse les consonnes, les souffles et les percussions tranquilles : on ne recolle pas des périodes là où il n'y en a pas.",
        docEn: "Below this follower confidence, the frame is not corrected. That is what leaves consonants, breaths and drums alone: periods are not glued where there are none." },
      { nom: "Écart max", nomEn: "Max deviation", type: "curseur", plage: [0.2, 2], pas: 0.1, defaut: 1, unite: "demi-tons", uniteEn: "semitones",
        doc: "Au-delà de cet écart, la trame n'est pas corrigée : un suiveur se trompe d'octave sur les sons riches, et corriger une erreur d'octave déplacerait la note d'une octave entière.",
        docEn: "Beyond this deviation the frame is not corrected: a follower makes octave errors on rich sounds, and correcting one would move the note by a whole octave." },
    ],
    async executer(ctx: any) {
      const e = ctx.entree(0);
      if (!(e instanceof AudioBuffer)) return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      const tonique = Math.max(0, NOTES_EN.findIndex((n) => n.toLowerCase() === ctx.paramTexte("Tonique", "c")));
      const ecartMax = ctx.paramNombre("Écart max", 1);
      const o = {
        degres: degresDe(ctx.paramTexte("Gamme", "chromatique"), tonique),
        force: ctx.paramNombre("Force", 100) / 100,
        transitionMs: ctx.paramNombre("Transition", 0),
        seuilConfiance: ctx.paramNombre("Confiance", 40) / 100,
        ecartMaxDemiTons: ecartMax,
        frequence: e.sampleRate,
      };
      const sortie = new AudioBuffer({ numberOfChannels: e.numberOfChannels, length: e.length, sampleRate: e.sampleRate });
      // La correction est calculée sur le premier canal et appliquée à tous : deux canaux d'une
      // même voix doivent bouger ensemble, faute de quoi l'image stéréo se mettrait à flotter.
      const premier = corrigerHauteur(e.getChannelData(0), o);
      sortie.getChannelData(0).set(premier.audio);
      for (let c = 1; c < e.numberOfChannels; c++) {
        sortie.getChannelData(c).set(corrigerHauteur(e.getChannelData(c), o).audio);
      }
      return {
        valeurs: [sortie, courbeDeCorrection(premier, ecartMax)],
        message: traduire("msg.correction.resume",
          premier.centsMoyen.toFixed(0), Math.round(premier.partCorrigee * 100)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
