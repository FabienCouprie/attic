// plugins/illusion-octave.ts — La fiche de l'illusion d'octave.
//
// Le calcul, ses références et la raison de ses choix sont dans `audio/illusion-octave.ts`.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  echantillonsDichotiques, pasDeLaSequence, perceptsDuModele,
} from "../audio/illusion-octave";

const en = () => langueCourante() === "en";
const SR = 44100;

/** Un nombre écrit dans la langue courante, virgule ou point selon le cas. */
const hz = (v: number) => (en() ? v.toFixed(1) : v.toFixed(1).replace(".", ","));

export const fiches: FicheAudio[] = ([
  {
    id: "illusion-octave", nom: "Illusion d'octave", nomEn: "Octave Illusion",
    univers: "Entrées", famille: "Génération",
    resume: "Deux sons séparés d'une octave alternent d'une oreille à l'autre, et l'on en entend un seul.",
    resumeEn: "Two tones an octave apart alternate from one ear to the other, and one hears a single tone.",
    notice: "Ce composant rend une suite dichotique : à chaque pas, une oreille reçoit un son grave et l'autre le même son à l'octave, et les deux oreilles s'échangent leurs rôles au pas suivant. D'après Diana Deutsch, « An auditory illusion », Nature 251, 1974, p. 307-309.\n\nLes deux oreilles reçoivent donc un son en permanence, et jamais le même. La plupart des auditeurs entendent pourtant un seul son, qui saute d'une oreille à l'autre en changeant de hauteur. Ce qui est entendu n'est pas ce qui est envoyé, et la sortie « Rapport » donne l'un pour qu'on le compare à l'autre.\n\nLa suite demande un casque, et rien d'autre ne convient. Sur des haut-parleurs les deux canaux se mélangent dans la pièce avant d'atteindre les oreilles : il ne reste alors qu'un accord d'octave immobile, et il n'y a plus rien à entendre. Le repli en mono efface le stimulus entier.\n\nDeux décisions séparées expliquent le percept, d'après Diana Deutsch et Philip Roll, « Separate what and where decision mechanisms in processing a dichotic tonal sequence », Journal of Experimental Psychology: Human Perception and Performance 2(1), 1976, p. 23-29 : la hauteur entendue suit ce que reçoit l'oreille dominante, et le côté où elle s'entend suit l'oreille qui reçoit le son le plus aigu. Ces deux oreilles ne sont pas la même à tous les pas, et la hauteur s'entend alors du côté qui ne l'a pas reçue.\n\nLa réponse dépend de l'auditeur. Diana Deutsch, « The octave illusion in relation to handedness and familial handedness background », Neuropsychologia 21(3), 1983, p. 289-293, la relie à la latéralité et à celle de la famille : une dominance droite fait entendre l'aigu à droite et le grave à gauche, une dominance gauche donne l'image inverse.\n\n« Aigu d'abord à » échange les deux canaux, ce qui revient à retourner le casque. C'est l'épreuve qui tranche : si la réponse tenait à la place d'un son dans la suite, elle s'inverserait ; si elle tient à l'oreille, elle ne bouge pas.\n\n« Fréquence » est le son grave et « Écart » la distance au second, en demi-tons. À douze, les deux sons sont à l'octave et se confondent en une seule hauteur : c'est la condition de l'illusion. À un autre écart, ils restent deux sons distincts et l'alternance s'entend pour ce qu'elle est.\n\n« Durée d'un ton » est la durée d'un pas et « Alternances » leur nombre. « Fondu » adoucit les deux bouts de chaque pas : sans lui, un changement laisse un clic, qui porte toutes les fréquences et désigne l'alternance à l'oreille. « Volume » est le niveau de sortie.\n\nLa sortie « Audio » rend la suite, en deux canaux. La sortie « Rapport » dit ce qui est envoyé à chaque oreille, donne la prédiction du modèle pour l'une et l'autre dominance, et rappelle la marche à suivre. Le message donne le nombre de pas, la durée et l'intervalle.",
    noticeEn: "This node returns a dichotic sequence: at each step one ear receives a low tone and the other the same tone an octave up, and the two ears swap roles at the next step. After Diana Deutsch, « An auditory illusion », Nature 251, 1974, pp. 307-309.\n\nBoth ears therefore receive a tone at all times, and never the same one. Most listeners nonetheless hear a single tone, which jumps from one ear to the other while changing pitch. What is heard is not what is sent, and the « Report » output gives the one so it can be compared with the other.\n\nThe sequence calls for headphones, and nothing else will do. Over loudspeakers the two channels mix in the room before reaching the ears: all that remains is a motionless octave chord, and there is nothing left to hear. Folding down to mono wipes out the whole stimulus.\n\nTwo separate decisions account for the percept, after Diana Deutsch and Philip Roll, « Separate what and where decision mechanisms in processing a dichotic tonal sequence », Journal of Experimental Psychology: Human Perception and Performance 2(1), 1976, pp. 23-29: the pitch heard follows what the dominant ear receives, and the side it is heard on follows the ear receiving the higher tone. Those two ears are not the same at every step, and the pitch is then heard on the side that did not receive it.\n\nThe answer depends on the listener. Diana Deutsch, « The octave illusion in relation to handedness and familial handedness background », Neuropsychologia 21(3), 1983, pp. 289-293, relates it to handedness and to that of the family: right dominance has the high tone heard on the right and the low tone on the left, left dominance gives the mirror image.\n\n« High tone first on » swaps the two channels, which amounts to turning the headphones round. This is the test that settles it: were the answer to depend on a tone's place in the sequence, it would reverse; if it depends on the ear, it does not move.\n\n« Frequency » is the low tone and « Interval » the distance to the second, in semitones. At twelve the two tones are an octave apart and merge into a single pitch: that is the condition of the illusion. At any other interval they stay two distinct tones and the alternation is heard for what it is.\n\n« Tone length » is the length of one step and « Alternations » their number. « Fade » softens both ends of each step: without it a change leaves a click, which carries every frequency and points the alternation out to the ear. « Volume » is the output level.\n\nThe « Audio » output returns the sequence, in two channels. The « Report » output says what is sent to each ear, gives the model's prediction for either dominance, and recalls the procedure. The message gives the number of steps, the length and the interval.",
    entrees: [],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Fréquence", nomEn: "Frequency", type: "curseur", plage: [100, 1500], pas: 1, defaut: 400, unite: "Hz",
        doc: "Le son grave. Le second est plus haut de l'écart choisi. Deutsch emploie quatre cents hertz.",
        docEn: "The low tone. The second is higher by the chosen interval. Deutsch uses four hundred hertz." },
      { nom: "Écart", nomEn: "Interval", type: "curseur", plage: [1, 24], pas: 1, defaut: 12, unite: "1/2 ton",
        doc: "La distance entre les deux sons, en demi-tons. À douze, ils sont à l'octave et se confondent en une seule hauteur, ce qui est la condition de l'illusion ; ailleurs, ils restent deux sons distincts.",
        docEn: "The distance between the two tones, in semitones. At twelve they are an octave apart and merge into a single pitch, which is the condition of the illusion; elsewhere they stay two distinct tones." },
      { nom: "Durée d'un ton", nomEn: "Tone length", type: "curseur", plage: [50, 1000], pas: 5, defaut: 250, unite: "ms",
        doc: "La durée d'un pas. Deutsch emploie deux cent cinquante millisecondes.",
        docEn: "The length of one step. Deutsch uses two hundred and fifty milliseconds." },
      { nom: "Alternances", nomEn: "Alternations", type: "curseur", plage: [2, 200], pas: 1, defaut: 20,
        doc: "Le nombre de pas de la suite. Le percept met quelques pas à se former.",
        docEn: "The number of steps in the sequence. The percept takes a few steps to settle." },
      { nom: "Aigu d'abord à", nomEn: "High tone first on", type: "choix",
        options: ["Droite", "Gauche"], optionsEn: ["Right", "Left"], optionIds: ["droite", "gauche"],
        defaut: "Droite", defautEn: "Right",
        doc: "L'oreille qui reçoit le son aigu au premier pas. Changer ce réglage échange les deux canaux, ce qui revient à retourner le casque : c'est l'épreuve qui dit si la réponse tient à l'oreille ou à la place du son dans la suite.",
        docEn: "The ear receiving the high tone at the first step. Changing this setting swaps the two channels, which amounts to turning the headphones round: it is the test that says whether the answer depends on the ear or on the tone's place in the sequence." },
      { nom: "Fondu", nomEn: "Fade", type: "curseur", plage: [0, 50], pas: 0.5, defaut: 5, unite: "ms",
        doc: "Le fondu aux deux bouts de chaque pas. Sans lui, un changement laisse un clic, qui porte toutes les fréquences et désigne l'alternance à l'oreille. Trop long, il émousse le changement.",
        docEn: "The fade at both ends of each step. Without it a change leaves a click, which carries every frequency and points the alternation out to the ear. Too long, it blunts the change." },
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 70, unite: "%",
        doc: "Niveau de sortie.", docEn: "Output level." },
    ],
    async executer(ctx: any) {
      const plan = pasDeLaSequence({
        frequence: ctx.paramNombre("Fréquence", 400),
        ecart: ctx.paramNombre("Écart", 12),
        alternances: ctx.paramNombre("Alternances", 20),
        aiguADroiteDabord: String(ctx.paramTexte("Aigu d'abord à", "droite")) !== "gauche",
      });
      const { gauche, droite } = echantillonsDichotiques(plan, {
        dureeDunTon: ctx.paramNombre("Durée d'un ton", 250) / 1000,
        fondu: ctx.paramNombre("Fondu", 5) / 1000,
        niveau: Math.max(0, Math.min(1, ctx.paramNombre("Volume", 70) / 100)),
        sampleRate: SR,
      });

      // DEUX CANAUX, ET C'EST LE STIMULUS ENTIER : ramené à un seul, il ne resterait qu'un accord
      // d'octave immobile, le même à tous les pas.
      const sortie = new AudioBuffer({
        numberOfChannels: 2, length: Math.max(1, gauche.length), sampleRate: SR,
      });
      sortie.getChannelData(0).set(gauche);
      sortie.getChannelData(1).set(droite);

      // LE RAPPORT DIT CE QUI A ÉTÉ ENVOYÉ, faute de quoi l'auditeur n'a que ce qu'il entend et
      // aucun moyen de voir en quoi les deux diffèrent. La suite étant strictement alternée, deux
      // lignes la décrivent entièrement.
      const premier = plan[0];
      const second = plan[1] ?? plan[0];
      const grave = Math.min(premier.gauche, premier.droite);
      const aigu = Math.max(premier.gauche, premier.droite);
      const droitier = perceptsDuModele(plan, "droite");
      const gaucher = perceptsDuModele(plan, "gauche");
      const cote = (c: string) => (en() ? (c === "droite" ? "right" : "left") : c);
      const dit = (p: { hauteur: number; cote: string }) => en()
        ? `${hz(p.hauteur)} Hz on the ${cote(p.cote)}`
        : `${hz(p.hauteur)} Hz à ${p.cote}`;
      const demiTons = Math.round(12 * Math.log2(aigu / grave));

      const rapport = en() ? [
        "Octave illusion. On headphones, and on headphones only.",
        "",
        `What is sent, alternating ${plan.length} times:`,
        `  odd step  — left ear ${hz(premier.gauche)} Hz · right ear ${hz(premier.droite)} Hz`,
        `  even step — left ear ${hz(second.gauche)} Hz · right ear ${hz(second.droite)} Hz`,
        "",
        "Both ears receive a tone at every step, and never the same one.",
        "",
        "What the two-channel model predicts, pitch following the dominant ear and side following the ear holding the high tone:",
        `  right dominance — ${dit(droitier[0])}, then ${dit(droitier[1] ?? droitier[0])}`,
        `  left dominance  — ${dit(gaucher[0])}, then ${dit(gaucher[1] ?? gaucher[0])}`,
        "",
        "Note what you hear, then run it again with « High tone first on » set to the other side. If your answer does not move, it depends on the ear and not on the tone's place in the sequence.",
      ] : [
        "Illusion d'octave. Au casque, et seulement au casque.",
        "",
        `Ce qui est envoyé, en alternance, ${plan.length} fois :`,
        `  pas impair — oreille gauche ${hz(premier.gauche)} Hz · oreille droite ${hz(premier.droite)} Hz`,
        `  pas pair   — oreille gauche ${hz(second.gauche)} Hz · oreille droite ${hz(second.droite)} Hz`,
        "",
        "Les deux oreilles reçoivent un son à chaque pas, et jamais le même.",
        "",
        "Ce que le modèle à deux voies prédit, la hauteur suivant l'oreille dominante et le côté suivant l'oreille qui tient l'aigu :",
        `  dominance droite — ${dit(droitier[0])}, puis ${dit(droitier[1] ?? droitier[0])}`,
        `  dominance gauche — ${dit(gaucher[0])}, puis ${dit(gaucher[1] ?? gaucher[0])}`,
        "",
        "Notez ce que vous entendez, puis reprenez avec « Aigu d'abord à » sur l'autre côté. Si votre réponse ne bouge pas, elle tient à l'oreille et non à la place du son dans la suite.",
      ];

      return {
        valeurs: [sortie, rapport.join("\n")],
        message: en()
          ? `${plan.length} steps · ${(sortie.length / SR).toFixed(2)} s · ${hz(grave)} and ${hz(aigu)} Hz, ${demiTons} semitones`
          : `${plan.length} pas · ${(sortie.length / SR).toFixed(2).replace(".", ",")} s · ${hz(grave)} et ${hz(aigu)} Hz, ${demiTons} demi-tons`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
