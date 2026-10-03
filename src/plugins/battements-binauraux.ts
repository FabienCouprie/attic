// plugins/battements-binauraux.ts — La fiche des battements binauraux.
//
// Le calcul, ses références et la raison de ses choix sont dans `audio/battements-binauraux.ts`.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  frequencesDuCouple, rendreBinaural, type OptionsRendu, type RenduBinaural,
} from "../audio/battements-binauraux";
import { parUneFois } from "./hors-lot";

const en = () => langueCourante() === "en";
const SR = 44100;

/** Un nombre écrit dans la langue courante, virgule ou point selon le cas. */
const nb = (v: number, d = 1) => (en() ? v.toFixed(d) : v.toFixed(d).replace(".", ","));

export const fiches: FicheAudio[] = ([
  {
    id: "battements-binauraux", nom: "Battements binauraux", nomEn: "Binaural Beats",
    univers: "Entrées", famille: "Génération",
    resume: "Deux sons purs voisins, un par oreille, dont la pulsation entendue n'est dans aucun des deux.",
    resumeEn: "Two close pure tones, one per ear, whose heard pulsation is in neither of them.",
    notice: "Ce composant rend deux sons purs de fréquences voisines, un par oreille. On entend une pulsation lente, à la vitesse de leur écart, que ni l'un ni l'autre ne porte. Heinrich Wilhelm Dove le décrit en 1839 ; Gerald Oster, « Auditory beats in the brain », Scientific American 229(4), 1973, p. 94-102, en donne la revue qui a fait connaître le phénomène.\n\nDeux battements portent le même nom et ne sont pas la même chose. Deux sons voisins mélangés dans l'air donnent un battement acoustique : leur somme est une modulation d'amplitude, inscrite dans le signal, qu'un microphone relève et qu'un seul haut-parleur suffit à faire entendre. Envoyés séparément à chaque oreille, les deux sons ne se mélangent nulle part avant les oreilles : chaque canal est un son pur d'amplitude constante, aucun des deux ne bat, et le spectre ne porte rien à la vitesse entendue. Le réglage « Présentation » donne l'un et l'autre, et le rapport mesure les deux sur le son rendu.\n\nLa suite demande donc un casque, et rien d'autre ne convient. Sur des haut-parleurs les deux canaux se rejoignent dans la pièce, et il ne reste que le battement acoustique.\n\n« Porteuse » est la hauteur entendue et « Battement » la vitesse de la pulsation, qui est l'écart entre les deux sons. Les deux s'écartent chacun de la moitié de cet écart, de sorte que la hauteur reste celle qu'on a demandée.\n\nLa porteuse a une limite mesurée : d'après J. C. R. Licklider, J. C. Webster et J. M. Hedlun, « On the frequency limits of binaural beats », Journal of the Acoustical Society of America 22, 1950, p. 468-473, le battement binaural s'entend pour des porteuses basses et se perd au-delà d'un millier de hertz environ. Le battement acoustique, lui, s'entend à toute hauteur.\n\n« Aigu à » dit quelle oreille reçoit la plus haute des deux fréquences. Ce réglage n'agit que sur la présentation par oreille, les deux canaux étant identiques dans l'autre.\n\n« Durée » est celle du son et « Fondu » l'ouverture et la fermeture. « Volume » est le niveau de sortie.\n\nLa sortie « Audio » rend le son, en deux canaux. La sortie « Rapport » donne les deux fréquences envoyées, la profondeur de modulation mesurée sur chaque canal et sur leur somme, et la limite de porteuse. Le message donne les deux fréquences et la vitesse.",
    noticeEn: "This node returns two pure tones of close frequencies, one per ear. A slow pulsation is heard, at the speed of their difference, which neither of them carries. Heinrich Wilhelm Dove described it in 1839; Gerald Oster, « Auditory beats in the brain », Scientific American 229(4), 1973, pp. 94-102, gives the review that made the phenomenon known.\n\nTwo beats carry the same name and are not the same thing. Two close tones mixed in the air give an acoustic beat: their sum is an amplitude modulation, written into the signal, which a microphone picks up and which a single loudspeaker suffices to make audible. Sent separately to each ear, the two tones mix nowhere before the ears: each channel is a pure tone of constant amplitude, neither of them beats, and the spectrum carries nothing at the speed heard. The « Presentation » setting gives one and the other, and the report measures both on the rendered sound.\n\nThe sequence therefore calls for headphones, and nothing else will do. Over loudspeakers the two channels meet in the room, and only the acoustic beat remains.\n\n« Carrier » is the pitch heard and « Beat » the speed of the pulsation, which is the difference between the two tones. Each moves away by half that difference, so the pitch stays the one that was asked for.\n\nThe carrier has a measured limit: after J. C. R. Licklider, J. C. Webster and J. M. Hedlun, « On the frequency limits of binaural beats », Journal of the Acoustical Society of America 22, 1950, pp. 468-473, the binaural beat is heard for low carriers and is lost beyond about a thousand hertz. The acoustic beat is heard at any pitch.\n\n« High tone on » says which ear receives the higher of the two frequencies. This setting acts only on the one-per-ear presentation, the two channels being identical in the other.\n\n« Length » is that of the sound and « Fade » its opening and closing. « Volume » is the output level.\n\nThe « Audio » output returns the sound, in two channels. The « Report » output gives the two frequencies sent, the modulation depth measured on each channel and on their sum, and the carrier limit. The message gives the two frequencies and the speed.",
    entrees: [],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Porteuse", nomEn: "Carrier", type: "curseur", plage: [20, 1500], pas: 1, defaut: 220, unite: "Hz",
        doc: "La hauteur entendue, au milieu des deux sons envoyés. Le battement binaural se perd au-delà d'un millier de hertz environ, mesure de Licklider, Webster et Hedlun.",
        docEn: "The pitch heard, midway between the two tones sent. The binaural beat is lost beyond about a thousand hertz, as measured by Licklider, Webster and Hedlun." },
      { nom: "Battement", nomEn: "Beat", type: "curseur", plage: [0.5, 40], pas: 0.5, defaut: 6, unite: "Hz",
        doc: "La vitesse de la pulsation, qui est l'écart entre les deux sons. Au-delà d'une trentaine de hertz, la pulsation cesse de s'entendre comme telle et les deux sons se séparent.",
        docEn: "The speed of the pulsation, which is the difference between the two tones. Beyond about thirty hertz the pulsation stops being heard as such and the two tones come apart." },
      { nom: "Présentation", nomEn: "Presentation", type: "choix",
        options: ["Une par oreille", "Les deux dans les deux"],
        optionsEn: ["One per ear", "Both in both"],
        optionIds: ["par-oreille", "les-deux"],
        defaut: "Une par oreille", defautEn: "One per ear",
        doc: "Par oreille, chaque canal est un son pur et rien ne bat dans le signal : la pulsation naît de l'écoute. Les deux dans les deux, la somme est faite avant la sortie et la pulsation est une modulation d'amplitude, présente dans le signal et audible sur n'importe quoi.",
        docEn: "Per ear, each channel is a pure tone and nothing beats in the signal: the pulsation arises from the listening. Both in both, the sum is made before the output and the pulsation is an amplitude modulation, present in the signal and audible on anything." },
      { nom: "Aigu à", nomEn: "High tone on", type: "choix",
        options: ["Droite", "Gauche"], optionsEn: ["Right", "Left"], optionIds: ["droite", "gauche"],
        defaut: "Droite", defautEn: "Right",
        doc: "L'oreille qui reçoit la plus haute des deux fréquences. Ce réglage n'agit que sur la présentation par oreille : dans l'autre, les deux canaux sont le même signal et il n'y a rien à échanger.",
        docEn: "The ear receiving the higher of the two frequencies. This setting acts only on the per-ear presentation: in the other, the two channels are the same signal and there is nothing to swap." },
      { nom: "Durée", nomEn: "Length", type: "curseur", plage: [1, 300], pas: 1, defaut: 30, unite: "s",
        doc: "La durée du son. La pulsation met quelques secondes à s'installer.",
        docEn: "The length of the sound. The pulsation takes a few seconds to settle." },
      { nom: "Fondu", nomEn: "Fade", type: "curseur", plage: [0, 2000], pas: 10, defaut: 200, unite: "ms",
        doc: "L'ouverture et la fermeture du son. Sans elles, le premier et le dernier échantillon sont des clics.",
        docEn: "The opening and closing of the sound. Without them, the first and last samples are clicks." },
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 60, unite: "%",
        doc: "Niveau de sortie.", docEn: "Output level." },
    ],
    async executer(ctx: any) {
      const porteuse = ctx.paramNombre("Porteuse", 220);
      const battement = ctx.paramNombre("Battement", 6);
      const parOreille = String(ctx.paramTexte("Présentation", "par-oreille")) !== "les-deux";
      const aiguADroite = String(ctx.paramTexte("Aigu à", "droite")) !== "gauche";
      const rendu = await parUneFois<OptionsRendu, RenduBinaural>({
        porteuse, battement, parOreille, aiguADroite,
        duree: ctx.paramNombre("Durée", 30),
        fondu: ctx.paramNombre("Fondu", 200) / 1000,
        niveau: Math.max(0, Math.min(1, ctx.paramNombre("Volume", 60) / 100)),
        sampleRate: SR,
      }, {
        creerWorker: () => new Worker(new URL("../workers/binaural-worker.ts", import.meta.url), { type: "module" }),
        calcul: rendreBinaural,
      });
      const { gauche, droite } = rendu;

      // DEUX CANAUX, ET C'EST LE STIMULUS ENTIER dans la présentation par oreille : ramené à un
      // seul, il ne resterait que le battement acoustique, qui est l'autre phénomène.
      const sortie = new AudioBuffer({
        numberOfChannels: 2, length: Math.max(1, gauche.length), sampleRate: SR,
      });
      // `copyToChannel` et non `getChannelData().set` : les tableaux reviennent d'un ouvrier.
      sortie.copyToChannel(new Float32Array(gauche), 0);
      sortie.copyToChannel(new Float32Array(droite), 1);

      // LE RAPPORT MESURE CE QU'IL ANNONCE, sur le son qui vient d'être rendu : dire qu'un canal ne
      // bat pas sans le vérifier serait une affirmation, et c'est précisément le point qu'un
      // auditeur ne peut pas trancher à l'oreille.
      const { basse, haute } = frequencesDuCouple(porteuse, battement);
      // LE RAPPORT SUIT LE RÉGLAGE, il ne récite pas un ordre fixe : annoncer le grave à gauche
      // quand l'aigu y est envoyé donnerait à l'auditeur l'inverse de ce qu'il entend.
      const aGauche = aiguADroite ? basse : haute;
      const aDroite = aiguADroite ? haute : basse;
      // Les trois profondeurs sont mesurées AVEC le rendu, dans l'ouvrier : c'est là qu'est tout le
      // coût, et les renvoyer pour les relire ici l'aurait laissé dans le fil.
      const pc = (x: number) => nb(x * 100, 2);
      const aG = pc(rendu.profondeurGauche);
      const aD = pc(rendu.profondeurDroite);
      const aM = pc(rendu.profondeurSomme);

      const rapport = en() ? [
        "Binaural beats. On headphones, and on headphones only.",
        "",
        "What is sent:",
        `  left ear  — ${parOreille ? `${nb(aGauche)} Hz` : `${nb(basse)} Hz and ${nb(haute)} Hz together`}`,
        `  right ear — ${parOreille ? `${nb(aDroite)} Hz` : `${nb(basse)} Hz and ${nb(haute)} Hz together`}`,
        `  pulsation — ${nb(battement)} Hz, carrier ${nb(porteuse)} Hz`,
        "",
        "Modulation depth measured on the rendered sound:",
        `  left channel  ${aG} %`,
        `  right channel ${aD} %`,
        `  their sum     ${aM} %`,
        "",
        parOreille
          ? "Neither channel beats: the pulsation is in neither signal. Their sum beats, and that is what happens over loudspeakers."
          : "Each channel beats: the pulsation is an amplitude modulation, written into the signal, and it is heard on anything.",
        "",
        `The binaural beat is heard for low carriers and is lost beyond about a thousand hertz; here the carrier is ${nb(porteuse)} Hz.`,
      ] : [
        "Battements binauraux. Au casque, et seulement au casque.",
        "",
        "Ce qui est envoyé :",
        `  oreille gauche — ${parOreille ? `${nb(aGauche)} Hz` : `${nb(basse)} Hz et ${nb(haute)} Hz ensemble`}`,
        `  oreille droite — ${parOreille ? `${nb(aDroite)} Hz` : `${nb(basse)} Hz et ${nb(haute)} Hz ensemble`}`,
        `  pulsation      — ${nb(battement)} Hz, porteuse ${nb(porteuse)} Hz`,
        "",
        "Profondeur de modulation mesurée sur le son rendu :",
        `  canal gauche   ${aG} %`,
        `  canal droit    ${aD} %`,
        `  leur somme     ${aM} %`,
        "",
        parOreille
          ? "Aucun des deux canaux ne bat : la pulsation n'est dans aucun des deux signaux. Leur somme bat, et c'est ce qui arrive sur des haut-parleurs."
          : "Chaque canal bat : la pulsation est une modulation d'amplitude, inscrite dans le signal, et elle s'entend sur n'importe quoi.",
        "",
        `Le battement binaural s'entend pour des porteuses basses et se perd au-delà d'un millier de hertz environ ; ici la porteuse est à ${nb(porteuse)} Hz.`,
      ];

      return {
        valeurs: [sortie, rapport.join("\n")],
        message: en()
          ? `${nb(basse)} and ${nb(haute)} Hz · beat ${nb(battement)} Hz · ${nb(sortie.length / SR, 2)} s`
          : `${nb(basse)} et ${nb(haute)} Hz · battement ${nb(battement)} Hz · ${nb(sortie.length / SR, 2)} s`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
