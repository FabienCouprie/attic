// plugins/effets-cresson.ts — Six effets du répertoire du CRESSON.
//
// Les calculs, leurs références et la raison de leurs choix sont dans `audio/echo-flottant.ts`,
// `audio/ubiquite.ts`, `audio/vague.ts`, `audio/platine.ts` et `audio/creneau.ts`.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { echoFlottant, frequenceDuPeigne, haas, periodeEntreMurs } from "../audio/echo-flottant";
import { correlationDesCanaux, ubiquite } from "../audio/ubiquite";
import { vague } from "../audio/vague";
import { frequenceDeRotation, platine } from "../audio/platine";
import { enUneVoie, meilleurCreneau, poserDansLeCreneau } from "../audio/creneau";

const en = () => langueCourante() === "en";
const nb = (v: number, d = 1) => (en() ? v.toFixed(d) : v.toFixed(d).replace(".", ","));

export const fiches: FicheAudio[] = ([
  {
    id: "echo-flottant", nom: "Écho flottant", nomEn: "Flutter Echo",
    univers: "Traitement", famille: "Effets",
    resume: "Le battement métallique d'un son pris entre deux murs parallèles.",
    resumeEn: "The metallic flutter of a sound caught between two parallel walls.",
    notice: "Ce composant rend le battement d'un son pris entre deux surfaces parallèles et réfléchissantes. D'après Jean-François Augoyard et Henry Torgue, « À l'écoute de l'environnement : répertoire des effets sonores », Parenthèses, 1995, traduit sous le titre « Sonic Experience: A Guide to Everyday Sounds », McGill-Queen's University Press, 2005.\n\nLe son fait l'aller-retour entre les deux murs en deux fois la distance divisée par la célérité, puis recommence. Les fréquences dont la demi-longueur d'onde divise la distance se renforcent à chaque tour, les autres s'annulent : il reste un peigne dont les dents sont espacées de la célérité sur deux fois la distance. Les réflexions restent discrètes et périodiques, et c'est leur régularité qui fait le timbre.\n\n« Distance » est l'écart entre les deux murs. À trois mètres, l'aller-retour dure dix-sept millisecondes et demie et le peigne sonne à cinquante-sept hertz ; écarter les murs fait descendre le battement.\n\n« Décroissance » est le temps que met le battement à perdre soixante décibels. Le gain de chaque tour s'en déduit, de sorte que la durée reste celle qu'on demande quelle que soit la distance.\n\n« Amortissement » est la part des aigus que les murs absorbent à chaque réflexion. Le battement s'assourdit alors en s'éteignant.\n\n« Mélange » dose la part de l'effet dans la sortie.\n\nLa sortie « Audio » rend le son traité. Le message donne la période de l'aller-retour et la fréquence du peigne.",
    noticeEn: "This node returns the flutter of a sound caught between two parallel reflecting surfaces. After Jean-François Augoyard and Henry Torgue, « Sonic Experience: A Guide to Everyday Sounds », McGill-Queen's University Press, 2005.\n\nThe sound travels back and forth between the two walls in twice the distance divided by the speed of sound, then starts again. Frequencies whose half wavelength divides the distance build up on every round trip, the others cancel: what remains is a comb whose teeth are spaced by the speed of sound over twice the distance. The reflections stay discrete and periodic, and it is their regularity that makes the timbre.\n\n« Distance » is the gap between the two walls. At three metres the round trip lasts seventeen and a half milliseconds and the comb sounds at fifty-seven hertz; moving the walls apart brings the flutter down.\n\n« Decay » is the time the flutter takes to lose sixty decibels. The gain of each round trip follows from it, so the length stays the one asked for whatever the distance.\n\n« Damping » is the share of highs the walls absorb at each reflection. The flutter then dulls as it dies away.\n\n« Mix » sets the share of the effect in the output.\n\nThe « Audio » output returns the treated sound. The message gives the round-trip period and the comb frequency.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Distance", nomEn: "Distance", type: "curseur", plage: [0.5, 20], pas: 0.1, defaut: 3, unite: "m",
        doc: "L'écart entre les deux murs. Il fixe la hauteur du battement : trois mètres donnent cinquante-sept hertz, et écarter les murs fait descendre.",
        docEn: "The gap between the two walls. It sets the pitch of the flutter: three metres give fifty-seven hertz, and moving them apart brings it down." },
      { nom: "Décroissance", nomEn: "Decay", type: "curseur", plage: [0.05, 10], pas: 0.05, defaut: 1, unite: "s",
        doc: "Le temps que met le battement à perdre soixante décibels.",
        docEn: "The time the flutter takes to lose sixty decibels." },
      { nom: "Amortissement", nomEn: "Damping", type: "curseur", plage: [0, 95], pas: 1, defaut: 20, unite: "%",
        doc: "La part des aigus que les murs absorbent à chaque réflexion. Le battement s'assourdit en s'éteignant.",
        docEn: "The share of highs the walls absorb at each reflection. The flutter dulls as it dies away." },
      { nom: "Mélange", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 70, unite: "%",
        doc: "La part de l'effet dans la sortie.", docEn: "The share of the effect in the output." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: en() ? "No audio input" : "Aucune entrée audio" };
      const distance = ctx.paramNombre("Distance", 3);
      const out = echoFlottant(a, {
        distance,
        decroissance: ctx.paramNombre("Décroissance", 1),
        amortissement: ctx.paramNombre("Amortissement", 20) / 100,
        melange: ctx.paramNombre("Mélange", 70) / 100,
      });
      return {
        valeurs: [out],
        message: en()
          ? `${nb(periodeEntreMurs(distance) * 1000)} ms round trip · comb at ${nb(frequenceDuPeigne(distance))} Hz`
          : `aller-retour ${nb(periodeEntreMurs(distance) * 1000)} ms · peigne à ${nb(frequenceDuPeigne(distance))} Hz`,
      };
    },
  },
  {
    id: "haas", nom: "Effet Haas", nomEn: "Haas Effect",
    univers: "Traitement", famille: "Effets",
    resume: "Un canal retardé de quelques millisecondes : l'image se porte du côté arrivé le premier.",
    resumeEn: "One channel delayed by a few milliseconds: the image moves to the side that arrives first.",
    notice: "Ce composant retarde l'un des deux canaux de quelques millisecondes. D'après Helmut Haas, « Über den Einfluss eines Einfachechos auf die Hörsamkeit von Sprache », Acustica 1, 1951, p. 49-58.\n\nEntre une et trente millisecondes, l'oreille ne sépare pas l'onde directe de l'onde réfléchie : elle les fond en un seul son, qu'elle situe du côté arrivé le premier, même quand le côté retardé est plus fort. Au-delà d'une quarantaine de millisecondes la fusion se défait et deux sons s'entendent.\n\nLa source est ramenée au mono avant le traitement : l'effet tient à ce que les deux oreilles reçoivent la même onde à deux instants.\n\n« Retard » est l'écart entre les deux canaux. « Côté retardé » dit lequel des deux arrive en second ; l'image se porte sur l'autre. « Niveau du retardé » règle sa force.\n\nLa sortie « Audio » rend deux canaux. Le message donne le retard et dit si la fusion tient encore.",
    noticeEn: "This node delays one of the two channels by a few milliseconds. After Helmut Haas, « Über den Einfluss eines Einfachechos auf die Hörsamkeit von Sprache », Acustica 1, 1951, pp. 49-58.\n\nBetween one and thirty milliseconds the ear does not separate the direct wave from the reflected one: it fuses them into a single sound, placed on the side that arrives first, even when the delayed side is louder. Beyond about forty milliseconds the fusion breaks and two sounds are heard.\n\nThe source is brought down to mono before the treatment: the effect rests on both ears receiving the same wave at two instants.\n\n« Delay » is the gap between the two channels. « Delayed side » says which of the two arrives second; the image moves to the other. « Delayed level » sets its strength.\n\nThe « Audio » output returns two channels. The message gives the delay and says whether fusion still holds.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Retard", nomEn: "Delay", type: "curseur", plage: [0, 60], pas: 0.5, defaut: 12, unite: "ms",
        doc: "L'écart entre les deux canaux. La fusion tient jusqu'à une quarantaine de millisecondes ; au-delà, deux sons s'entendent.",
        docEn: "The gap between the two channels. Fusion holds up to about forty milliseconds; beyond that, two sounds are heard." },
      { nom: "Côté retardé", nomEn: "Delayed side", type: "choix",
        options: ["Droite", "Gauche"], optionsEn: ["Right", "Left"], optionIds: ["droite", "gauche"],
        defaut: "Droite", defautEn: "Right",
        doc: "Le canal qui arrive en second. L'image se porte sur l'autre.",
        docEn: "The channel that arrives second. The image moves to the other." },
      { nom: "Niveau du retardé", nomEn: "Delayed level", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "La force du canal retardé. L'image reste du côté arrivé le premier même quand ce niveau le dépasse.",
        docEn: "The strength of the delayed channel. The image stays on the side that arrives first even when this level exceeds it." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: en() ? "No audio input" : "Aucune entrée audio" };
      const ms = ctx.paramNombre("Retard", 12);
      const out = haas(a, {
        retard: ms / 1000,
        retarderLaDroite: String(ctx.paramTexte("Côté retardé", "droite")) !== "gauche",
        gainDuRetarde: ctx.paramNombre("Niveau du retardé", 100) / 100,
      });
      const fondu = ms <= 40;
      return {
        valeurs: [out],
        message: en()
          ? `${nb(ms)} ms · ${fondu ? "one fused sound" : "two sounds heard"}`
          : `${nb(ms)} ms · ${fondu ? "un seul son fondu" : "deux sons distincts"}`,
      };
    },
  },
  {
    id: "ubiquite", nom: "Ubiquité", nomEn: "Ubiquity",
    univers: "Traitement", famille: "Effets",
    resume: "Une source qu'on ne peut plus situer, ou qu'on situe mieux que nature.",
    resumeEn: "A source that can no longer be located, or located better than life.",
    notice: "Ce composant disperse ou resserre la provenance d'un son. D'après Jean-François Augoyard et Henry Torgue, « À l'écoute de l'environnement : répertoire des effets sonores », Parenthèses, 1995, qui nomment ubiquité l'effet par lequel une source devient impossible à situer, et hyperlocalisation son contraire.\n\nL'oreille situe un son par trois indices : l'écart de temps entre les deux oreilles, l'écart de niveau, et la cohérence des deux signaux. C'est le troisième que ce composant déplace. Deux oreilles qui reçoivent la même onde concluent à une source ; deux oreilles qui reçoivent des ondes sans rapport ne concluent à rien, et le son se répand.\n\nLa dispersion se fait par la phase. Des passe-tout en cascade tournent la phase de chaque canal sans toucher à son spectre, et les deux voies reçoivent des tours opposés. Le repli en mono garde ainsi sa forme : il perd les trois décibels que coûte toute décorrélation, et rien de plus.\n\n« Dispersion » va de l'hyperlocalisation à l'ubiquité. Au négatif, les deux canaux glissent vers ce qu'ils ont en commun, jusqu'à ne plus laisser que lui. À zéro, le son sort tel qu'il est entré. Au positif, la phase se brouille.\n\n« Étages » est le nombre de passe-tout en cascade. « Graine » fixe le tirage de leurs coefficients.\n\nLa sortie « Audio » rend deux canaux. Le message donne la corrélation des deux canaux avant et après.",
    noticeEn: "This node disperses or tightens where a sound comes from. After Jean-François Augoyard and Henry Torgue, « Sonic Experience: A Guide to Everyday Sounds », McGill-Queen's University Press, 2005, whoname ubiquity the effect by which a source becomes impossible to locate, and hyperlocalization its opposite.\n\nThe ear locates a sound by three cues: the time difference between the two ears, the level difference, and the coherence of the two signals. It is the third that this node moves. Two ears receiving the same wave conclude there is a source; two ears receiving unrelated waves conclude nothing, and the sound spreads out.\n\nDispersion works on phase. Cascaded all-pass sections turn the phase of each channel without touching its spectrum, and the two sides receive opposite turns. The mono fold-down therefore keeps its shape: it loses the three decibels any decorrelation costs, and nothing more.\n\n« Dispersion » runs from hyperlocalization to ubiquity. Negative, the two channels slide towards what they have in common until only that is left. At zero the sound comes out as it went in. Positive, the phase scrambles.\n\n« Stages » is the number of cascaded all-pass sections. « Seed » fixes the draw of their coefficients.\n\nThe « Audio » output returns two channels. The message gives the correlation of the two channels before and after.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Dispersion", nomEn: "Dispersion", type: "curseur", plage: [-100, 100], pas: 1, defaut: 80, unite: "%",
        doc: "De l'hyperlocalisation au négatif à l'ubiquité au positif. À zéro, le son sort tel qu'il est entré.",
        docEn: "From hyperlocalization when negative to ubiquity when positive. At zero the sound comes out as it went in." },
      { nom: "Étages", nomEn: "Stages", type: "curseur", plage: [1, 16], pas: 1, defaut: 6,
        doc: "Le nombre de passe-tout en cascade. Plus il y en a, plus finement la phase se brouille.",
        docEn: "The number of cascaded all-pass sections. The more there are, the more finely the phase scrambles." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 3,
        doc: "Le tirage des coefficients. La changer donne une autre dispersion, de même caractère.",
        docEn: "The draw of the coefficients. Changing it gives another dispersion of the same character." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: en() ? "No audio input" : "Aucune entrée audio" };
      const out = ubiquite(a, {
        dispersion: ctx.paramNombre("Dispersion", 80) / 100,
        etages: ctx.paramNombre("Étages", 6),
        graine: ctx.paramNombre("Graine", 3),
      });
      const avant = correlationDesCanaux(a);
      const apres = correlationDesCanaux(out);
      return {
        valeurs: [out],
        message: en()
          ? `correlation ${nb(avant, 2)} to ${nb(apres, 2)}`
          : `corrélation ${nb(avant, 2)} à ${nb(apres, 2)}`,
      };
    },
  },
  {
    id: "vague", nom: "Vague", nomEn: "Wave",
    univers: "Traitement", famille: "Effets",
    resume: "Des cycles de crescendo, de sommet et de ressac, espacés de plusieurs secondes.",
    resumeEn: "Cycles of crescendo, crest and undertow, several seconds apart.",
    notice: "Ce composant fait passer un son par des cycles d'intensité qui ont la forme de la vague. D'après Jean-François Augoyard et Henry Torgue, « À l'écoute de l'environnement : répertoire des effets sonores », Parenthèses, 1995, qui le décrivent comme un crescendo, un point maximal, une rupture rapide ou progressive, et un decrescendo, les cycles se succédant à plusieurs secondes d'intervalle, régulièrement ou non.\n\nLe cycle est asymétrique, et c'est ce qui le fait reconnaître : la vague met longtemps à se former et se brise vite. Le répertoire en fait un effet composé, de phase et de filtrage ; le timbre suit donc l'intensité, et le son s'éclaircit en montant.\n\n« Période » est la durée d'un cycle. « Variation » rend les cycles inégaux, de zéro pour une houle régulière à cent pour une mer désordonnée.\n\n« Montée » est la part du cycle passée à monter. Au-dessus d'un demi, la vague se brise.\n\n« Rupture » choisit la façon dont elle se brise. « Déferlante » tombe en laissant une arête au sommet ; « Progressive » se retire sans arête.\n\n« Profondeur » est la part du niveau que le creux emporte. « Ouverture » est la part du timbre qui suit l'intensité. « Graine » fixe le tirage de la variation.\n\nLa sortie « Audio » rend le son traité. Le message donne le nombre de cycles et la durée moyenne de l'un d'eux.",
    noticeEn: "This node carries a sound through cycles of intensity shaped like a wave. After Jean-François Augoyard and Henry Torgue, « Sonic Experience: A Guide to Everyday Sounds », McGill-Queen's University Press, 2005, whodescribe it as a crescendo, a maximum point, a fast or gradual break, and a decrescendo, the cycles following one another several seconds apart, regularly or not.\n\nThe cycle is asymmetric, and that is what makes it recognizable: the wave takes a long time to build and breaks quickly. The repertoire makes it a composite effect, of phase and filtering; the timbre therefore follows the intensity, and the sound brightens as it rises.\n\n« Period » is the length of one cycle. « Variation » makes the cycles uneven, from zero for a regular swell to a hundred for a disordered sea.\n\n« Rise » is the share of the cycle spent rising. Above one half, the wave breaks.\n\n« Break » chooses how it breaks. « Breaker » falls leaving a ridge at the crest; « Gradual » withdraws without one.\n\n« Depth » is the share of the level the trough takes away. « Opening » is the share of the timbre that follows the intensity. « Seed » fixes the draw of the variation.\n\nThe « Audio » output returns the treated sound. The message gives the number of cycles and the mean length of one.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Période", nomEn: "Period", type: "curseur", plage: [1, 30], pas: 0.5, defaut: 7, unite: "s",
        doc: "La durée d'un cycle.", docEn: "The length of one cycle." },
      { nom: "Variation", nomEn: "Variation", type: "curseur", plage: [0, 100], pas: 1, defaut: 20, unite: "%",
        doc: "L'inégalité des cycles. À zéro, la houle est régulière.",
        docEn: "The unevenness of the cycles. At zero the swell is regular." },
      { nom: "Montée", nomEn: "Rise", type: "curseur", plage: [10, 90], pas: 1, defaut: 70, unite: "%",
        doc: "La part du cycle passée à monter. Au-dessus d'un demi, la vague se brise.",
        docEn: "The share of the cycle spent rising. Above one half, the wave breaks." },
      { nom: "Rupture", nomEn: "Break", type: "choix",
        options: ["Déferlante", "Progressive"], optionsEn: ["Breaker", "Gradual"],
        optionIds: ["deferlante", "progressive"], defaut: "Déferlante", defautEn: "Breaker",
        doc: "La façon dont la vague se brise. Déferlante laisse une arête au sommet, progressive n'en laisse pas.",
        docEn: "How the wave breaks. Breaker leaves a ridge at the crest, gradual leaves none." },
      { nom: "Profondeur", nomEn: "Depth", type: "curseur", plage: [0, 100], pas: 1, defaut: 90, unite: "%",
        doc: "La part du niveau que le creux emporte.", docEn: "The share of the level the trough takes away." },
      { nom: "Ouverture", nomEn: "Opening", type: "curseur", plage: [0, 100], pas: 1, defaut: 60, unite: "%",
        doc: "La part du timbre qui suit l'intensité. À zéro, seul le niveau bouge.",
        docEn: "The share of the timbre that follows the intensity. At zero, only the level moves." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 5,
        doc: "Le tirage de la variation. Sans variation, ce réglage ne sert pas.",
        docEn: "The draw of the variation. With no variation, this setting does nothing." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: en() ? "No audio input" : "Aucune entrée audio" };
      const periode = ctx.paramNombre("Période", 7);
      const out = vague(a, {
        periode,
        variation: ctx.paramNombre("Variation", 20) / 100,
        montee: ctx.paramNombre("Montée", 70) / 100,
        rupture: String(ctx.paramTexte("Rupture", "deferlante")) === "progressive" ? "progressive" : "deferlante",
        profondeur: ctx.paramNombre("Profondeur", 90) / 100,
        ouverture: ctx.paramNombre("Ouverture", 60) / 100,
        graine: ctx.paramNombre("Graine", 5),
      });
      const combien = Math.max(1, Math.round(a.duration / periode));
      return {
        valeurs: [out],
        message: en()
          ? `${combien} waves · ${nb(a.duration / combien)} s each`
          : `${combien} vagues · ${nb(a.duration / combien)} s chacune`,
      };
    },
  },
  {
    id: "platine", nom: "Platine", nomEn: "Turntable",
    univers: "Traitement", famille: "Effets",
    resume: "Les défauts d'un tourne-disques : ronflement, surface, clics, et le trou décentré.",
    resumeEn: "The faults of a record player: rumble, surface, clicks, and the off-centre hole.",
    notice: "Ce composant ajoute à un son les défauts d'une platine tourne-disques. D'après Jean-François Augoyard et Henry Torgue, « À l'écoute de l'environnement : répertoire des effets sonores », Parenthèses, 1995, qui donnent le rumble pour le ronflement du moteur capté par la cellule de lecture et mélangé au signal.\n\nTout y est accroché à la vitesse de rotation. Un disque de trente-trois tours fait un tour en une seconde huit : le trou n'étant jamais exactement au centre, la vitesse de lecture monte et descend une fois par tour, et la hauteur du son avec elle. À quarante-cinq tours le cycle dure une seconde trois, à soixante-dix-huit sept dixièmes.\n\n« Vitesse » choisit entre les trois vitesses de disque.\n\n« Ronflement » est le niveau du grondement du moteur et du palier, sous la pleine échelle. La norme DIN 45 539 le relève ainsi : une bonne platine tient soixante-dix décibels sous la référence, une platine de salon cinquante-cinq.\n\n« Surface » est le niveau de la poussière dans le sillon, un fond continu sans grave. « Clics » est le nombre de craquements par seconde, qui sont des impulsions brèves et non du bruit.\n\n« Excentricité » est le décentrement du trou, qui fait onduler la hauteur une fois par tour. « Graine » fixe le tirage du bruit et des clics.\n\nLa sortie « Audio » rend le son traité. Le message donne la vitesse et la durée d'un tour.",
    noticeEn: "This node adds the faults of a record player to a sound. After Jean-François Augoyard and Henry Torgue, « Sonic Experience: A Guide to Everyday Sounds », McGill-Queen's University Press, 2005, whogive rumble as the whirring of the motor picked up by the cartridge and mixed into the signal.\n\nEverything here hangs on the rotation speed. A thirty-three record turns once in one point eight seconds: the hole never being exactly centred, the reading speed rises and falls once per turn, and the pitch of the sound with it. At forty-five the cycle lasts one point three seconds, at seventy-eight seven tenths.\n\n« Speed » chooses between the three record speeds.\n\n« Rumble » is the level of the motor and bearing growl, below full scale. The DIN 45 539 standard measures it this way: a good turntable holds seventy decibels below reference, a domestic one fifty-five.\n\n« Surface » is the level of the dust in the groove, a continuous bed with no bass. « Clicks » is the number of crackles per second, which are brief impulses rather than noise.\n\n« Eccentricity » is the off-centring of the hole, which makes the pitch waver once per turn. « Seed » fixes the draw of the noise and the clicks.\n\nThe « Audio » output returns the treated sound. The message gives the speed and the length of one turn.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Vitesse", nomEn: "Speed", type: "choix",
        options: ["33 tours", "45 tours", "78 tours"], optionsEn: ["33 rpm", "45 rpm", "78 rpm"],
        optionIds: ["33", "45", "78"], defaut: "33 tours", defautEn: "33 rpm",
        doc: "La vitesse du disque. Elle fixe le rythme de l'ondulation et la respiration du ronflement.",
        docEn: "The speed of the record. It sets the rate of the wavering and the breathing of the rumble." },
      { nom: "Ronflement", nomEn: "Rumble", type: "curseur", plage: [-90, -20], pas: 1, defaut: -58, unite: "dB",
        doc: "Le niveau du grondement du moteur, sous la pleine échelle. Une bonne platine tient soixante-dix décibels sous la référence.",
        docEn: "The level of the motor growl, below full scale. A good turntable holds seventy decibels below reference." },
      { nom: "Surface", nomEn: "Surface", type: "curseur", plage: [-90, -20], pas: 1, defaut: -52, unite: "dB",
        doc: "Le niveau de la poussière dans le sillon, un fond continu sans grave.",
        docEn: "The level of the dust in the groove, a continuous bed with no bass." },
      { nom: "Clics", nomEn: "Clicks", type: "curseur", plage: [0, 20], pas: 0.5, defaut: 2, unite: "/s",
        doc: "Le nombre de craquements par seconde. Ce sont des impulsions brèves, et non du bruit.",
        docEn: "The number of crackles per second. These are brief impulses, not noise." },
      { nom: "Excentricité", nomEn: "Eccentricity", type: "curseur", plage: [0, 100], pas: 1, defaut: 25, unite: "%",
        doc: "Le décentrement du trou. Il fait onduler la hauteur une fois par tour.",
        docEn: "The off-centring of the hole. It makes the pitch waver once per turn." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 4,
        doc: "Le tirage du bruit et des clics. La changer donne un autre disque, de même état.",
        docEn: "The draw of the noise and the clicks. Changing it gives another record in the same condition." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: en() ? "No audio input" : "Aucune entrée audio" };
      const vitesse = Number(ctx.paramTexte("Vitesse", "33")) === 45 ? 45
        : Number(ctx.paramTexte("Vitesse", "33")) === 78 ? 78 : 33 + 1 / 3;
      const out = platine(a, {
        vitesse,
        ronflement: ctx.paramNombre("Ronflement", -58),
        surface: ctx.paramNombre("Surface", -52),
        clics: ctx.paramNombre("Clics", 2),
        excentricite: ctx.paramNombre("Excentricité", 25) / 100,
        graine: ctx.paramNombre("Graine", 4),
      });
      return {
        valeurs: [out],
        message: en()
          ? `${nb(vitesse)} rpm · one turn in ${nb(1 / frequenceDeRotation(vitesse), 2)} s`
          : `${nb(vitesse)} tours · un tour en ${nb(1 / frequenceDeRotation(vitesse), 2)} s`,
      };
    },
  },
  {
    id: "creneau", nom: "Créneau", nomEn: "Niche",
    univers: "Traitement", famille: "Montage",
    resume: "Pose un son à l'instant où le fond lui laisse sa place, en temps et en fréquence.",
    resumeEn: "Places a sound at the moment the background leaves it room, in time and in frequency.",
    notice: "Ce composant cherche dans un fond l'instant où un son trouve sa place, et l'y pose. D'après Jean-François Augoyard et Henry Torgue, « À l'écoute de l'environnement : répertoire des effets sonores », Parenthèses, 1995, qui définissent le créneau comme l'occurrence d'une émission sonore au moment où le contexte est le plus favorable et ménage une place particulièrement adaptée à son expression, et en font l'un des instruments de l'action sonore.\n\nLa place ne se réduit pas à un creux de niveau. Un fond chargé dans le grave laisse passer un son aigu sans jamais faiblir, et un fond chargé dans l'aigu laisse passer un son grave au même niveau. La recherche se fait donc dans le plan du temps et des fréquences, et le son qu'on veut poser dit lui-même où regarder : son propre profil de bandes sert de poids. Le fond est découpé en douze bandes par un banc de passe-bande, et le son glisse le long du fond jusqu'à l'endroit où ce qui l'occupe est le plus faible.\n\nLe fond n'est ni coupé ni baissé : l'effet décrit une place que le contexte ménage.\n\nL'entrée « Fond » reçoit le contexte. L'entrée « Son » reçoit ce qu'on veut y poser.\n\n« Écoute » choisit ce que la recherche regarde. « Le timbre et le niveau » pèse chaque bande par le profil du son ; « Le niveau seul » pèse toutes les bandes également.\n\n« Fenêtre » est la durée d'une trame d'analyse. « Au plus tôt » interdit de chercher avant un certain instant. « Niveau » règle la force du son posé.\n\nLa sortie « Audio » rend le fond et le son mêlés. La sortie « Rapport » donne l'instant trouvé, ce que le fond y occupe, et ce qu'il occupe en moyenne et au pire. Le message donne l'instant et le rapport entre la place trouvée et la place moyenne.",
    noticeEn: "This node looks through a background for the moment a sound finds its place, and puts it there. After Jean-François Augoyard and Henry Torgue, « Sonic Experience: A Guide to Everyday Sounds », McGill-Queen's University Press, 2005, whodefine the niche as the occurrence of a sound emission at the moment the context is most favourable and leaves a place particularly suited to its expression, and make it one of the instruments of sonic action.\n\nRoom is not merely a dip in level. A background loaded in the bass lets a treble sound through without ever weakening, and a background loaded in the treble lets a bass sound through at the same level. The search is therefore made in the plane of time and frequency, and the sound to be placed says itself where to look: its own band profile serves as the weighting. The background is split into twelve bands by a bank of band-pass filters, and the sound slides along the background to the point where what occupies it is weakest.\n\nThe background is neither cut nor lowered: the effect describes a place the context leaves.\n\nThe « Background » input takes the context. The « Sound » input takes what is to be placed in it.\n\n« Listening » chooses what the search looks at. « Timbre and level » weights each band by the sound's profile; « Level only » weights all bands equally.\n\n« Window » is the length of an analysis frame. « No earlier than » forbids searching before a given instant. « Level » sets the strength of the placed sound.\n\nThe « Audio » output returns the background and the sound together. The « Report » output gives the instant found, what the background occupies there, and what it occupies on average and at worst. The message gives the instant and the ratio between the place found and the average.",
    entrees: [
      { nom: "Fond", nomEn: "Background", type: "audio", sousType: "stereo" },
      { nom: "Son", nomEn: "Sound", type: "audio", sousType: "stereo" },
    ],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Écoute", nomEn: "Listening", type: "choix",
        options: ["Le timbre et le niveau", "Le niveau seul"],
        optionsEn: ["Timbre and level", "Level only"],
        optionIds: ["timbre", "niveau"], defaut: "Le timbre et le niveau", defautEn: "Timbre and level",
        doc: "Ce que la recherche regarde. Par le timbre, chaque bande est pesée par le profil du son, et un fond qui n'occupe pas sa bande lui laisse la place. Par le niveau seul, toutes les bandes pèsent autant.",
        docEn: "What the search looks at. By timbre, each band is weighted by the sound's profile, and a background that does not occupy its band leaves it room. By level only, all bands weigh the same." },
      { nom: "Fenêtre", nomEn: "Window", type: "curseur", plage: [10, 500], pas: 5, defaut: 50, unite: "ms",
        doc: "La durée d'une trame d'analyse. Courte, la place se cherche finement ; longue, le calcul va plus vite.",
        docEn: "The length of an analysis frame. Short, the place is sought finely; long, the computation runs faster." },
      { nom: "Au plus tôt", nomEn: "No earlier than", type: "curseur", plage: [0, 600], pas: 0.5, defaut: 0, unite: "s",
        doc: "L'instant avant lequel la recherche ne va pas.",
        docEn: "The instant before which the search does not go." },
      { nom: "Niveau", nomEn: "Level", type: "curseur", plage: [0, 200], pas: 1, defaut: 100, unite: "%",
        doc: "La force du son posé.", docEn: "The strength of the placed sound." },
    ],
    async executer(ctx: any) {
      const fond = ctx.entree(0);
      const son = ctx.entree(1);
      if (!(fond instanceof AudioBuffer) || !(son instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: en() ? "Needs a background and a sound" : "Demande un fond et un son" };
      }
      const c = meilleurCreneau(enUneVoie(fond), enUneVoie(son), fond.sampleRate, {
        fenetre: ctx.paramNombre("Fenêtre", 50) / 1000,
        auPlusTot: ctx.paramNombre("Au plus tôt", 0),
        parLeTimbre: String(ctx.paramTexte("Écoute", "timbre")) !== "niveau",
      });
      const out = poserDansLeCreneau(fond, son, c.instant, ctx.paramNombre("Niveau", 100) / 100);
      const part = c.moyenne > 0 ? c.occupation / c.moyenne : 1;
      const lignes = en() ? [
        `Niche found at ${nb(c.instant, 2)} s, for a sound of ${nb(son.duration, 2)} s.`,
        "",
        `What the background occupies there : ${c.occupation.toExponential(2)}`,
        `On average over the search     : ${c.moyenne.toExponential(2)}`,
        `At its most crowded            : ${c.pire.toExponential(2)}`,
        "",
        `The place found is ${nb(part * 100)} % of the average occupancy.`,
      ] : [
        `Créneau trouvé à ${nb(c.instant, 2)} s, pour un son de ${nb(son.duration, 2)} s.`,
        "",
        `Ce que le fond y occupe        : ${c.occupation.toExponential(2)}`,
        `Ce qu'il occupe en moyenne     : ${c.moyenne.toExponential(2)}`,
        `Ce qu'il occupe au pire        : ${c.pire.toExponential(2)}`,
        "",
        `La place trouvée vaut ${nb(part * 100)} % de l'occupation moyenne.`,
      ];
      return {
        valeurs: [out, lignes.join("\n")],
        message: en()
          ? `${nb(c.instant, 2)} s · ${nb(part * 100)} % of the average`
          : `${nb(c.instant, 2)} s · ${nb(part * 100)} % de la moyenne`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
