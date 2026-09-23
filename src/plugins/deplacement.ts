// plugins/deplacement.ts — Doppler, magnétophone, ducking, ambisonie.
//
// Quatre nœuds qui ont en commun de manquer plutôt que de se ressembler : chacun comble un geste
// que ni le catalogue ni aucune combinaison de ses effets ne savait faire. La logique est dans
// `audio/deplacement.ts`, `audio/ducking.ts` et `audio/ambisonique.ts`, testées ; ce fichier n'est
// que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { bande, doppler, hauteurApprochee, hauteurEloignee } from "../audio/deplacement";
import { ducking } from "../audio/ducking";
import { decoderStereo, encoderStereo, partDirectionnelle, tourner } from "../audio/ambisonique";
import { mesurerStereo } from "../audio/stereo-correlation";
import { valeursParametre } from "../audio/courbe";

const sansEntree = () => ({ valeurs: [null], message: traduire("msg.aucune_entr_e") });

/** Le canal `c` d'un tampon, ou son dernier si le tampon en a moins. */
const voie = (b: AudioBuffer, c: number) => b.getChannelData(Math.min(c, b.numberOfChannels - 1));

export const fiches: FicheAudio[] = ([
  {
    id: "doppler", nom: "Doppler", nomEn: "Doppler",
    univers: "Traitement", famille: "Effets",
    resume: "Une source qui passe : la hauteur monte en approchant, bascule au plus près, et descend en s'éloignant.",
    resumeEn: "A source going past: the pitch rises as it approaches, tips over at the closest point, and falls as it recedes.",
    notice: "L'effet décrit par Christian Doppler en 1842. \n\nCe composant ne transpose pas le son d'un rapport calculé. Il pose le retard égal au temps que le son met à parcourir la distance, et laisse le décalage de hauteur en sortir tout seul. C'est ce qui donne la bascule juste au moment du passage, là où une transposition par un rapport fixe se trompe : la vitesse radiale s'inverse alors, et aucun rapport constant ne peut le décrire.\n\nLa distance est prise à l'instant d'émission et non d'arrivée. Prendre l'instant d'arrivée revient à faire bouger l'auditeur plutôt que la source, et donne une hauteur trop basse de vingt-quatre centièmes de demi-ton, assez pour s'entendre sur un son tenu.",
    noticeEn: "The effect described by Christian Doppler in 1842. \n\nThis node does not transpose the sound by a computed ratio. It sets the delay equal to the time sound takes to cover the distance, and lets the pitch shift fall out of that on its own. This is what gives the right tipping point at the moment of passing, where a fixed-ratio transposition goes wrong: the radial velocity reverses there, and no constant ratio can describe it.\n\nThe distance is taken at the instant of emission, not of arrival. Taking the arrival instant amounts to moving the listener rather than the source, and gives a pitch too low by twenty-four hundredths of a semitone, enough to be heard on a sustained sound.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Vitesse", nomEn: "Speed", type: "curseur", plage: [1, 120], pas: 1, defaut: 30, unite: "m/s",
        doc: "Vitesse de la source. 30 m/s valent 108 km/h, l'allure d'une voiture sur une route. Au-delà de la célérité du son, l'effet cesse d'avoir un sens physique : la source rattraperait ce qu'elle a émis.",
        docEn: "Speed of the source. 30 m/s is 108 km/h, a car's pace on a road. Beyond the speed of sound the effect stops making physical sense: the source would catch up with what it emitted." },
      { nom: "Distance", nomEn: "Distance", type: "curseur", plage: [0.5, 100], pas: 0.5, defaut: 10, unite: "m",
        doc: "Distance au plus près du passage. C'est elle qui décide de la brutalité de la bascule : de tout près, la hauteur chute d'un coup ; de loin, elle glisse longuement. Elle décide aussi de la vitesse à laquelle l'image traverse le champ stéréo.",
        docEn: "How close the pass comes. It decides how abrupt the tipping is: from very close the pitch drops at once; from far away it glides at length. It also decides how fast the image crosses the stereo field." },
      { nom: "Célérité", nomEn: "Speed of sound", type: "curseur", plage: [200, 500], pas: 1, defaut: 343, unite: "m/s",
        doc: "Célérité du son. 343 m/s à 20 °C au niveau de la mer ; 331 à zéro degré, 1480 dans l'eau. La baisser exagère l'effet sans changer sa forme, ce qui est une façon commode de l'entendre mieux.",
        docEn: "Speed of sound. 343 m/s at 20 °C at sea level; 331 at zero degrees, 1480 in water. Lowering it exaggerates the effect without changing its shape, which is a handy way of hearing it better." },
      { nom: "Atténuation", nomEn: "Attenuation", type: "choix", options: ["Oui", "Non"], optionsEn: ["Yes", "No"],
        optionIds: ["oui", "non"], defaut: "Oui", defautEn: "Yes",
        doc: "Appliquer la baisse de niveau en un sur la distance. Sans elle, on garde le décalage de hauteur et le déplacement dans le champ, mais la source semble rester aussi proche, ce qui est parfois exactement ce qu'on veut.",
        docEn: "Apply the one-over-distance level drop. Without it, one keeps the pitch shift and the movement across the field, but the source seems to stay as close, which is sometimes exactly what one wants." },
    ],
    async executer(ctx: any) {
      const e = ctx.entree(0);
      if (!(e instanceof AudioBuffer)) return sansEntree();
      const o = {
        vitesse: ctx.paramNombre("Vitesse", 30),
        distance: ctx.paramNombre("Distance", 10),
        celerite: ctx.paramNombre("Célérité", 343),
        attenuer: ctx.paramTexte("Atténuation", "oui") !== "non",
        frequence: e.sampleRate,
      };
      const [g, d] = doppler(voie(e, 0), o);
      const out = new AudioBuffer({ numberOfChannels: 2, length: e.length, sampleRate: e.sampleRate });
      out.getChannelData(0).set(g);
      out.getChannelData(1).set(d);
      // Le rapport annoncé est celui d'une hauteur de référence : c'est le chiffre qu'on peut
      // vérifier à l'oreille sur un son tenu.
      return {
        valeurs: [out],
        message: traduire("msg.doppler.hauteurs",
          hauteurApprochee(440, o.vitesse, o.celerite).toFixed(0),
          hauteurEloignee(440, o.vitesse, o.celerite).toFixed(0)),
      };
    },
  },
  {
    id: "magnetophone", nom: "Magnétophone", nomEn: "Tape Machine",
    univers: "Traitement", famille: "Effets",
    resume: "Les quatre défauts d'une bande : pleurage, scintillement, saturation, décrochages.",
    resumeEn: "The four faults of tape: wow, flutter, saturation, dropouts.",
    notice: "Aucun des quatre défauts n'est décoratif, et chacun a une cause distincte.\n\nLe pleurage vient de l'excentricité de la bobine : une oscillation lente, sous deux hertz, qui fait dériver la hauteur. Le scintillement vient du cabestan et des galets : la même chose, mais entre cinq et vingt hertz, et l'oreille l'entend comme un tremblement plutôt que comme une dérive. La saturation vient de l'oxyde, qui cesse de répondre linéairement bien avant de rendre les armes, d'où une compression douce des crêtes, et des harmoniques qui n'étaient pas là. Les décrochages viennent des trous dans la couche magnétique : le son disparaît un instant, sans prévenir.\n\nLes deux premiers partagent leur machinerie avec le Doppler, et c'est la même idée : lire le signal à une distance qui change. Une ambulance qui approche raccourcit la distance ; un galet qui tourne mal l'allonge et la raccourcit tour à tour.\n\nLa saturation est normalisée : monter son attaque change la forme de l'onde, pas le volume. Sans cela, on croirait à un défaut du réglage.",
    noticeEn: "None of the four faults is decorative, and each has a distinct cause.\n\nWow comes from the reel's eccentricity: a slow oscillation, under two hertz, that makes the pitch drift. Flutter comes from the capstan and the rollers: the same thing, but between five and twenty hertz, and the ear hears it as a tremble rather than a drift. Saturation comes from the oxide, which stops responding linearly long before it gives up, hence a gentle compression of the peaks, and harmonics that were not there. Dropouts come from holes in the magnetic coating: the sound vanishes for an instant, without warning.\n\nThe first two share their machinery with the Doppler node, and it is the same idea: reading the signal at a distance that changes. An ambulance coming closer shortens the distance; a badly turning roller lengthens and shortens it by turns.\n\nSaturation is normalised: raising its drive changes the waveshape, not the volume. Without that, one would take it for a fault in the setting.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Pleurage", nomEn: "Wow", type: "curseur", plage: [0, 60], pas: 1, defaut: 8, unite: "%",
        doc: "Amplitude de la dérive lente de hauteur. Quelques pour cent suffisent à donner l'impression d'une machine fatiguée ; au-delà de vingt, on entend un instrument qui se désaccorde tout seul.",
        docEn: "Amplitude of the slow pitch drift. A few per cent are enough to suggest a tired machine; beyond twenty, one hears an instrument detuning itself." },
      { nom: "Pleurage Hz", nomEn: "Wow rate", type: "curseur", plage: [0.1, 3], pas: 0.1, defaut: 0.6, unite: "Hz",
        doc: "Vitesse de la dérive, c'est-à-dire le tour de bobine. Sous un hertz, on entend une respiration ; au-dessus de deux, cela commence à ressembler à un vibrato.",
        docEn: "Rate of the drift, that is the reel's turn. Under one hertz one hears a breathing; above two it starts to resemble a vibrato." },
      { nom: "Scintillement", nomEn: "Flutter", type: "curseur", plage: [0, 30], pas: 1, defaut: 3, unite: "%",
        doc: "Amplitude du tremblement rapide. Il se remarque bien moins que le pleurage à amplitude égale, et c'est pour cela que son réglage monte moins haut.",
        docEn: "Amplitude of the fast tremble. It is far less noticeable than wow at equal amplitude, which is why its range goes less high." },
      { nom: "Scintillement Hz", nomEn: "Flutter rate", type: "curseur", plage: [4, 25], pas: 0.5, defaut: 9, unite: "Hz",
        doc: "Vitesse du tremblement, c'est-à-dire le tour du cabestan.",
        docEn: "Rate of the tremble, that is the capstan's turn." },
      { nom: "Saturation", nomEn: "Saturation", type: "curseur", plage: [0, 12], pas: 0.5, defaut: 2,
        doc: "Attaque de la saturation de bande. À zéro, aucune. Le niveau ne change pas quand on la monte, seule la forme de l'onde change, et les harmoniques qui vont avec.",
        docEn: "Drive of the tape saturation. At zero, none. The level does not change as it is raised, only the waveshape does, and the harmonics that come with it." },
      { nom: "Décrochages", nomEn: "Dropouts", type: "curseur", plage: [0, 20], pas: 0.5, defaut: 0.5, unite: "/s",
        doc: "Trous par seconde dans la couche magnétique. Chacun dure une vingtaine de millisecondes et s'ouvre en fondu, sans quoi on entendrait un clic plutôt qu'une absence.",
        docEn: "Holes per second in the magnetic coating. Each lasts some twenty milliseconds and opens with a fade, without which one would hear a click rather than an absence." },
      { nom: "Souffle", nomEn: "Hiss", type: "curseur", plage: [0, 5], pas: 0.1, defaut: 0.5, unite: "%",
        doc: "Niveau du souffle de bande. Il ne s'entend que dans les silences, ce qui est exactement son défaut d'origine.",
        docEn: "Level of tape hiss. It is heard only in the silences, which is exactly its original failing." },
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 1,
        doc: "Graine des décrochages et du souffle. Une même graine rejoue la même bande.",
        docEn: "Seed for dropouts and hiss. The same seed replays the same tape." },
    ],
    async executer(ctx: any) {
      const e = ctx.entree(0);
      if (!(e instanceof AudioBuffer)) return sansEntree();
      const o = {
        pleurage: ctx.paramNombre("Pleurage", 8),
        pleurageHz: ctx.paramNombre("Pleurage Hz", 0.6),
        scintillement: ctx.paramNombre("Scintillement", 3),
        scintillementHz: ctx.paramNombre("Scintillement Hz", 9),
        saturation: ctx.paramNombre("Saturation", 2),
        decrochages: ctx.paramNombre("Décrochages", 0.5),
        souffle: ctx.paramNombre("Souffle", 0.5) / 100,
        graine: Math.round(ctx.paramNombre("Graine", 1)),
        frequence: e.sampleRate,
      };
      const out = new AudioBuffer({
        numberOfChannels: e.numberOfChannels, length: e.length, sampleRate: e.sampleRate,
      });
      for (let c = 0; c < e.numberOfChannels; c++) {
        // Une graine par canal : la même sur les deux ferait des décrochages parfaitement
        // corrélés, c'est-à-dire un trou au milieu de l'image plutôt qu'un défaut de bande.
        out.getChannelData(c).set(bande(e.getChannelData(c), { ...o, graine: o.graine + c * 7919 }));
      }
      return { valeurs: [out] };
    },
  },
  {
    id: "ducking", nom: "Ducking", nomEn: "Ducking",
    univers: "Traitement", famille: "Effets",
    resume: "Un son s'efface devant un autre : la musique recule sous la voix, sans que la voix sorte.",
    resumeEn: "One sound steps aside for another: the music backs off under the voice, without the voice being heard.",
    notice: "Tous écoutent le signal qu'ils traitent : ils baissent un son quand ce son est fort. Aucun ne sait baisser un son quand un autre est fort. C'est pourtant le geste le plus courant du mixage (la musique qui s'efface sous une voix, la nappe qui recule à chaque coup de grosse caisse) et il ne s'obtient par aucune combinaison des quatre.\n\nOn dit « chaîne latérale » en parlant du câblage : le signal qui commande entre par le côté, et ne sort jamais. Seule la cible est rendue.\n\nLe maintien mérite qu'on s'y arrête. Sans lui, une voix qui hésite laisse la musique remonter entre deux mots, et l'on entend un halètement. Le maintien garde l'atténuation un moment après que le déclencheur est retombé, si bien qu'une phrase parlée creuse un seul trou plutôt que douze.",
    noticeEn: "All listen to the signal they treat: they lower a sound when that sound is loud. None can lower a sound when another is loud. Yet this is the commonest gesture in mixing (the music stepping aside under a voice, the pad backing off at each kick) and no combination of the four produces it.\n\nOne says « side chain » when speaking of the wiring: the controlling signal comes in from the side, and never comes out. Only the target is rendered.\n\nThe hold deserves attention. Without it, a hesitating voice lets the music rise between two words, and one hears a panting. The hold keeps the attenuation for a while after the trigger has fallen back, so that a spoken phrase digs one hole rather than twelve.",
    entrees: [
      { nom: "Cible", nomEn: "Target", type: "audio" },
      { nom: "Déclencheur", nomEn: "Trigger", type: "audio" },
    ],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Seuil", nomEn: "Threshold", type: "curseur", plage: [-60, 0], pas: 1, defaut: -30, unite: "dB",
        doc: "Niveau du déclencheur au-dessus duquel l'atténuation s'engage. Trop haut, une voix douce ne déclenche rien ; trop bas, le souffle du micro suffit à faire reculer la musique.",
        docEn: "Level of the trigger above which the attenuation engages. Too high and a soft voice triggers nothing; too low and the microphone's hiss is enough to push the music back." },
      { nom: "Réduction", nomEn: "Reduction", type: "curseur", plage: [0, 40], pas: 1, defaut: 12, unite: "dB",
        doc: "De combien la cible baisse. Six décibels suffisent à dégager une voix ; au-delà de vingt, la musique disparaît plutôt qu'elle ne recule.",
        docEn: "How far the target drops. Six decibels are enough to clear a voice; beyond twenty, the music vanishes rather than backs off." },
      { nom: "Attaque", nomEn: "Attack", type: "curseur", plage: [0.001, 0.5], pas: 0.001, defaut: 0.01, unite: "s",
        doc: "Temps de descente. Court, le premier mot est dégagé mais on entend le creusement ; long, le début de la phrase reste couvert.",
        docEn: "Fall time. Short, the first word is cleared but one hears the dip happen; long, the start of the phrase stays buried." },
      { nom: "Relâchement", nomEn: "Release", type: "curseur", plage: [0.01, 2], pas: 0.01, defaut: 0.25, unite: "s",
        doc: "Temps de remontée, une fois le maintien écoulé. C'est lui qui donne son naturel à l'effet : trop court, la musique bondit ; trop long, elle met une seconde à revenir.",
        docEn: "Rise time, once the hold has elapsed. It is what makes the effect natural: too short and the music jumps back; too long and it takes a second to return." },
      { nom: "Maintien", nomEn: "Hold", type: "curseur", plage: [0, 1], pas: 0.01, defaut: 0.1, unite: "s",
        doc: "Durée pendant laquelle l'atténuation est gardée après que le déclencheur est repassé sous le seuil. C'est le réglage qui empêche le halètement entre deux mots.",
        docEn: "How long the attenuation is kept after the trigger has fallen back below the threshold. This is the setting that prevents panting between two words." },
    ],
    async executer(ctx: any) {
      const cible = ctx.entree(0);
      const declencheur = ctx.entree(1);
      if (!(cible instanceof AudioBuffer) || !(declencheur instanceof AudioBuffer)) return sansEntree();
      const o = {
        seuilDb: ctx.paramNombre("Seuil", -30),
        reductionDb: ctx.paramNombre("Réduction", 12),
        attaqueSec: ctx.paramNombre("Attaque", 0.01),
        relachementSec: ctx.paramNombre("Relâchement", 0.25),
        maintienSec: ctx.paramNombre("Maintien", 0.1),
        frequence: cible.sampleRate,
      };
      const out = new AudioBuffer({
        numberOfChannels: cible.numberOfChannels, length: cible.length, sampleRate: cible.sampleRate,
      });
      for (let c = 0; c < cible.numberOfChannels; c++) {
        out.getChannelData(c).set(ducking(cible.getChannelData(c), voie(declencheur, c), o));
      }
      return { valeurs: [out] };
    },
  },
  {
    id: "ambisonique", nom: "Rotation ambisonique", nomEn: "Ambisonic Rotation",
    univers: "Traitement", famille: "Effets",
    resume: "Encode la prise en champ sonore, le fait tourner autour de l'auditeur, et le redescend en stéréo.",
    resumeEn: "Encodes the take as a sound field, turns it around the listener, and brings it back down to stereo.",
    notice: "D'après Michael Gerzon, « Periphony: With-Height Sound Reproduction », Journal of the Audio Engineering Society 21(1), 1973, et la convention B-format du système Ambisonic.\n\nUn panoramique place une source ; il ne sait pas prendre un enregistrement entier et le faire tourner autour de l'auditeur. C'est ce que l'ambisonie apporte : le champ sonore est représenté par quatre grandeurs indépendantes de tout haut-parleur, et une rotation y est une simple rotation de deux d'entre elles. Faire tourner une scène stéréo autrement demanderait de séparer les sources, ce que personne ne sait faire proprement.\n\nLa pression et la hauteur ne tournent pas : l'une n'a pas de direction, l'autre est l'axe de rotation. Faire tourner une scène coûte donc deux multiplications par échantillon, et c'est la raison d'être du format.\n\nCe que ce composant ne prétend pas faire : retrouver la scène d'origine. Il reconstitue une scène plausible, deux sources aux angles d'écoute habituels, et la traite comme un champ. Sans rotation, il rend les deux canaux dans le bon ordre, l'image resserrée par le décodage et le niveau multiplié par 1,5, soit 3,5 dB de plus : l'encodage suivi du décodage n'est pas de gain unitaire, et ce composant ne normalise pas, faute de quoi la rotation ne s'entendrait plus qu'en niveau.\n\nUne prise mono n'a pas de scène à tourner. Deux canaux identiques donnent un champ où la composante gauche-droite vaut L−R, donc zéro : il ne reste qu'une direction, et la tourner déplace la source d'un côté au lieu de faire tourner quoi que ce soit. Mesuré sur un générateur de fréquence : à 90°, 9,5 dB d'écart entre les canaux, un panoramique franc, qui s'entend ; à 180°, strictement rien, puisque échanger deux canaux identiques les laisse identiques, seul le niveau baissant. Le composant affiche donc la part directionnelle du champ reçu : à zéro, aucun angle ne changera sa sortie. La rotation s'entend sur une image qui existe déjà (deux sources panoramiquées, un élargissement en amont) pilotée par une courbe sur l'entrée Modulation.",
    noticeEn: "After Michael Gerzon, « Periphony: With-Height Sound Reproduction », Journal of the Audio Engineering Society 21(1), 1973, and the Ambisonic system's B-format convention.\n\nA panner places a source; it cannot take a whole recording and turn it around the listener. That is what ambisonics brings: the sound field is represented by four quantities independent of any loudspeaker, and a rotation there is a simple rotation of two of them. Turning a stereo scene otherwise would require separating the sources, which nobody can do cleanly.\n\nPressure and height do not turn: one has no direction, the other is the axis of rotation. Turning a scene therefore costs two multiplications per sample, and that is the format's reason for being.\n\nWhat this node does not claim to do: recover the original scene. It reconstitutes a plausible one, two sources at the usual listening angles, and treats it as a field. With no rotation it renders the two channels in the right order, the image narrowed by the decoding and the level multiplied by 1.5, that is 3.5 dB more: encoding followed by decoding is not unity gain, and this node does not normalise, failing which the rotation would only be heard as a level change.\n\nA mono take has no scene to turn. Two identical channels give a field whose left-right component is L−R, hence zero: only one direction remains, and turning it moves the source to one side instead of turning anything. On a frequency generator: at 90°, 9.5 dB between the channels, a plain pan, which is audible; at 180°, strictly nothing, since swapping two identical channels leaves them identical, only the level dropping. The node therefore shows the directional share of the field it received: at zero, no angle will change its output. The rotation is heard on an image that already exists (two panned sources, a widening upstream) driven by a curve on the Modulation input.",
    entrees: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Modulation", nomEn: "Modulation", type: "courbe", requis: false, module: "Rotation" },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Rotation", nomEn: "Rotation", type: "curseur", plage: [-180, 180], pas: 1, defaut: 90, unite: "°",
        doc: "De combien la scène tourne, dans le sens direct. À 180°, la gauche et la droite sont échangées ; à 90°, ce qui était à gauche passe devant. Sur une source mono, cet échange est inaudible, deux canaux identiques échangés restent identiques, et seul le niveau baisse ; c'est à 90° qu'une source mono se déplace, de 9,5 dB. Une courbe branchée sur l'entrée Modulation fait tourner la scène en continu, ce qui s'entend bien mieux qu'un angle fixe.",
        docEn: "How far the scene turns, counter-clockwise. At 180° left and right are swapped; at 90°, what was on the left comes to the front. On a mono source that swap is inaudible, two identical channels swapped stay identical, and only the level drops; it is at 90° that a mono source moves, by 9.5 dB. A curve connected to the Modulation input turns the scene continuously, which is far more audible than a fixed angle." },
      { nom: "Écart des sources", nomEn: "Source spread", type: "curseur", plage: [30, 180], pas: 5, defaut: 90, unite: "°",
        doc: "Angle entre les deux sources dont on reconstitue la scène. Étroit, la prise est traitée comme deux voix presque devant soi ; large, comme deux voix sur les côtés. Contrairement à ce qu'on attendrait, large n'est pas plus spectaculaire, et à l'extrême c'est le contraire : la part du champ qu'une rotation peut déplacer vaut le cosinus de la moitié de cet écart sur une prise mono, 0,71 à 90°, et zéro à 180°, où aucun angle ne change plus rien. Sur une vraie stéréo, 180° ne tourne pas l'image non plus : une rotation d'un quart de tour y rend les deux canaux identiques, mesuré ; elle écrase l'image au lieu de la faire tourner. Quatre-vingt-dix degrés est le réglage qui tourne vraiment.",
        docEn: "Angle between the two sources whose scene is reconstituted. Narrow, the take is treated as two voices almost in front; wide, as two voices at the sides. Contrary to expectation, wide is not more striking, and at the extreme it is the opposite: the share of the field a rotation can move is the cosine of half this spread on a mono take, 0.71 at 90°, and zero at 180°, where no angle changes anything any more. On a true stereo take, 180° does not turn the image either: a quarter-turn there makes the two channels identical, measured; it crushes the image instead of turning it. Ninety degrees is the setting that really turns." },
      { nom: "Ouverture", nomEn: "Decoder width", type: "curseur", plage: [30, 180], pas: 5, defaut: 90, unite: "°",
        doc: "Angle entre les deux microphones virtuels du décodage. Faible, l'image est étroite mais cohérente ; large, elle sépare davantage au prix d'un creux au centre.",
        docEn: "Angle between the two virtual microphones of the decoding. Narrow, the image is tight but coherent; wide, it separates further at the cost of a dip in the centre." },
      { nom: "Modulation min", nomEn: "Modulation min", modulationDe: "Rotation", type: "curseur", plage: [-360, 360], pas: 5, defaut: 0, unite: "°",
        doc: "Rotation que vaut le zéro d'une courbe branchée. Sans courbe, ce réglage ne sert pas.",
        docEn: "Rotation that a connected curve's zero means. With no curve, this setting does nothing." },
      { nom: "Modulation max", nomEn: "Modulation max", modulationDe: "Rotation", type: "curseur", plage: [-360, 360], pas: 5, defaut: 360, unite: "°",
        doc: "Rotation que vaut le un de la courbe. De zéro à 360°, une rampe fait faire un tour complet à la scène.",
        docEn: "Rotation that the curve's one means. From zero to 360°, a ramp makes the scene turn a full circle." },
    ],
    async executer(ctx: any) {
      const e = ctx.entree(0);
      if (!(e instanceof AudioBuffer)) return sansEntree();
      const rad = (d: number) => (d * Math.PI) / 180;
      const champ = encoderStereo(voie(e, 0), voie(e, 1), rad(ctx.paramNombre("Écart des sources", 90)));
      // Sans courbe, une constante à la valeur du réglage : un seul chemin de calcul.
      const angles = valeursParametre(ctx.entree(1), e.length, rad(ctx.paramNombre("Rotation", 90)), {
        min: rad(ctx.paramNombre("Modulation min", 0)),
        max: rad(ctx.paramNombre("Modulation max", 360)),
      });
      const [g, d] = decoderStereo(tourner(champ, angles), rad(ctx.paramNombre("Ouverture", 90)));
      const out = new AudioBuffer({ numberOfChannels: 2, length: e.length, sampleRate: e.sampleRate });
      out.getChannelData(0).set(g.subarray(0, e.length));
      out.getChannelData(1).set(d.subarray(0, e.length));

      // LE NŒUD DIT CE QU'IL A REÇU, parce qu'il est resté muet une fois de trop. Une prise mono
      // n'a pas de scène à tourner : la rotation ne peut que la déplacer d'un côté, et à certains
      // réglages elle ne peut RIEN faire. Sans ces trois chiffres, la seule façon de s'en
      // apercevoir était de ne rien entendre et de douter du nœud.
      const part = partDirectionnelle(champ);
      const avant = mesurerStereo(voie(e, 0), voie(e, 1));
      const apres = mesurerStereo(g.subarray(0, e.length), d.subarray(0, e.length));
      const ecart = (m: { rmsGauche: number; rmsDroite: number }) => Math.abs(m.rmsGauche - m.rmsDroite);
      // LE NIVEAU SE MESURE EN ÉNERGIE, et non en moyenne des décibels des deux canaux : sur une
      // paire déséquilibrée — ce que la rotation fabrique précisément — la moyenne des décibels
      // annonçait ×0,87 là où l'énergie totale monte de ×1,12, et c'est l'énergie qu'on entend.
      const energie = (m: { rmsGauche: number; rmsDroite: number }) =>
        (Math.pow(10, m.rmsGauche / 10) + Math.pow(10, m.rmsDroite / 10)) / 2;
      const niveau = Math.sqrt(energie(apres) / Math.max(1e-30, energie(avant)));
      const resume = traduire("msg.ambisonique.resume",
        part.toFixed(2), ecart(avant).toFixed(1), ecart(apres).toFixed(1), niveau.toFixed(2));
      return {
        valeurs: [out],
        message: part < 0.05 ? `${resume} — ${traduire("msg.ambisonique.rienATourner")}` : resume,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
