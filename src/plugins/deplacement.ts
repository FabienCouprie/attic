// plugins/deplacement.ts — Doppler, magnétophone, ducking, ambisonie.
//
// Quatre nœuds qui ont en commun de manquer plutôt que de se ressembler : chacun comble un geste
// que ni le catalogue ni aucune combinaison de ses effets ne savait faire. La logique est dans
// `audio/deplacement.ts`, `audio/ducking.ts` et `audio/ambisonique.ts`, testées ; ce fichier n'est
// que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { bornesModulation, modulationNommee, portModulation, reglageModule } from "./effets-aides";
import { bande, doppler, hauteurApprochee, hauteurEloignee } from "../audio/deplacement";
import { mixdownMono } from "../audio/commun";
import { ducking } from "../audio/ducking";
import { decoderStereo, encoderStereo, partDirectionnelle, tourner } from "../audio/ambisonique";
import { mesurerStereo } from "../audio/stereo-correlation";
import { valeursParametre } from "../audio/courbe";
import { choixOuiNon } from "../core/oui-non";
import { entreeAudio, sansEntree } from "./lire-entree";

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
      { nom: "Atténuation", nomEn: "Attenuation", type: "choix", ...choixOuiNon(), defaut: "Oui", defautEn: "Yes",
        doc: "Appliquer la baisse de niveau en un sur la distance. Sans elle, on garde le décalage de hauteur et le déplacement dans le champ, mais la source semble rester aussi proche, ce qui est parfois exactement ce qu'on veut.",
        docEn: "Apply the one-over-distance level drop. Without it, one keeps the pitch shift and the movement across the field, but the source seems to stay as close, which is sometimes exactly what one wants." },
    ],
    async executer(ctx) {
      const e = entreeAudio(ctx, 0);
      if (sansEntree(e)) return e;
      const o = {
        vitesse: ctx.paramNombre("Vitesse", 30),
        distance: ctx.paramNombre("Distance", 10),
        celerite: ctx.paramNombre("Célérité", 343),
        attenuer: ctx.paramTexte("Atténuation", "oui") !== "non",
        frequence: e.sampleRate,
      };
      // LA SOURCE QUI PASSE EST UN POINT, donc elle se somme : `voie(e, 0)` ne lisait que le canal
      // gauche, et d'une prise stéréo la moitié droite disparaissait sans que rien ne le dise.
      // Mesuré avant la correction : une sinusoïde à 311 Hz posée à droite ressortait 40 dB plus
      // bas que celle de gauche. La sortie reste stéréo : c'est le déplacement dans le champ.
      const [g, d] = doppler(mixdownMono(e), o);
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
    notice: "Ce composant fait subir à un son les défauts d'une bande magnétique : le pleurage, le scintillement, "
      + "la saturation et les décrochages, auxquels s'ajoute un souffle. Le pleurage et le scintillement font varier la "
      + "vitesse de lecture, donc la hauteur et le temps ensemble ; le son est relu à cette vitesse par une "
      + "interpolation à sinus cardinal fenêtré, et sa durée reste celle du son reçu.\n\n"
      + "« Écart de pleurage » fixe de combien la hauteur monte et descend sous l'effet du pleurage, oscillation lente "
      + "de la vitesse, en pour cent : 0,3 la fait varier de 0,3 % de part et d'autre. « Pleurage Hz » fixe la "
      + "fréquence de cette oscillation, sans changer l'écart.\n\n"
      + "« Écart de scintillement » et « Scintillement Hz » font de même pour le scintillement, oscillation plus rapide "
      + "de la vitesse. Les deux écarts s'ajoutent.\n\n"
      + "« Saturation » fixe l'attaque d'une compression douce des crêtes, par une tangente hyperbolique, qui ajoute des "
      + "harmoniques. Elle est ramenée de sorte que la pleine échelle reste la pleine échelle ; un son plus faible en "
      + "ressort relevé, ses crêtes comprimées. À zéro, il n'y a pas de saturation.\n\n"
      + "« Décrochages » fixe le nombre de creux par seconde. Chacun dure vingt millisecondes, s'ouvre et se referme en "
      + "fondu, et sa profondeur est tirée au hasard.\n\n"
      + "« Souffle » fixe le niveau d'un bruit ajouté, dont la crête vaut ce pour cent de la pleine échelle.\n\n"
      + "« Graine » fixe le tirage des décrochages et du souffle : une même graine rend la même bande. Chaque canal "
      + "reçoit son propre tirage.\n\n"
      + "La sortie « Audio » rend le son déformé, avec la durée, la fréquence d'échantillonnage et les canaux reçus.",
    noticeEn: "This component applies the faults of a magnetic tape to a sound: wow, flutter, saturation and dropouts, "
      + "with a hiss added. Wow and flutter vary the playback speed, hence pitch and time together; the sound is read "
      + "again at that speed through a windowed sinc interpolation, and its duration stays that of the received sound.\n\n"
      + "« Wow depth » sets how far the pitch rises and falls under wow, a slow oscillation of the speed, in percent: "
      + "0.3 moves it by 0.3 % either way. « Wow rate » sets the frequency of this oscillation, without changing the "
      + "depth.\n\n"
      + "« Flutter depth » and « Flutter rate » do the same for flutter, a faster oscillation of the speed. The two "
      + "depths add up.\n\n"
      + "« Saturation » sets the drive of a gentle compression of the peaks, through a hyperbolic tangent, which adds "
      + "harmonics. It is scaled so that full scale stays full scale; a quieter sound comes out raised, its peaks "
      + "compressed. At zero, there is no saturation.\n\n"
      + "« Dropouts » sets the number of dips per second. Each lasts twenty milliseconds, opens and closes with a fade, "
      + "and its depth is drawn at random.\n\n"
      + "« Hiss » sets the level of an added noise, whose peak is this percentage of full scale.\n\n"
      + "« Seed » sets the draw of dropouts and hiss: the same seed gives the same tape. Each channel gets its own draw.\n\n"
      + "The « Audio » output returns the distorted sound, with the received length, sample rate and channels.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      // RENOMMÉS, ET NON GARDÉS SOUS LEUR ANCIEN NOM, parce que l'unité a changé : « Pleurage » et
      // « Scintillement » étaient des pour cent d'un retard de 10 ms, que la fréquence multipliait.
      // Un graphe enregistré porte « Pleurage : 8 », qui valait ±0,30 % de hauteur ; relu sous le même
      // nom, il aurait donné ±8 %, vingt-six fois plus. Sous un nom neuf, l'ancienne valeur n'est plus
      // lue, et le nœud prend l'ouverture, qui rend le son de l'ancienne.
      { nom: "Écart de pleurage", nomEn: "Wow depth", type: "curseur", plage: [0, 10], pas: 0.05, defaut: 0.3, unite: "%",
        doc: "De combien la hauteur monte et descend sous l'effet du pleurage, en crête : 0,3 la fait varier de 0,3 % de part et d'autre, quel que soit « Pleurage Hz ».",
        docEn: "How far the pitch rises and falls under wow, at its peak: 0.3 moves it by 0.3 % either way, whatever « Wow rate »." },
      { nom: "Pleurage Hz", nomEn: "Wow rate", type: "curseur", plage: [0.1, 3], pas: 0.1, defaut: 0.6, unite: "Hz",
        doc: "Fréquence de l'oscillation lente de la vitesse. Elle ne change pas « Écart de pleurage ».",
        docEn: "Frequency of the slow oscillation of the speed. It does not change « Wow depth »." },
      { nom: "Écart de scintillement", nomEn: "Flutter depth", type: "curseur", plage: [0, 10], pas: 0.05, defaut: 1.7, unite: "%",
        doc: "De combien la hauteur monte et descend sous l'effet du scintillement, en crête : 1,7 la fait varier de 1,7 % de part et d'autre, quel que soit « Scintillement Hz ».",
        docEn: "How far the pitch rises and falls under flutter, at its peak: 1.7 moves it by 1.7 % either way, whatever « Flutter rate »." },
      { nom: "Scintillement Hz", nomEn: "Flutter rate", type: "curseur", plage: [4, 25], pas: 0.5, defaut: 9, unite: "Hz",
        doc: "Fréquence de l'oscillation rapide de la vitesse. Elle ne change pas « Écart de scintillement ».",
        docEn: "Frequency of the fast oscillation of the speed. It does not change « Flutter depth »." },
      { nom: "Saturation", nomEn: "Saturation", type: "curseur", plage: [0, 12], pas: 0.5, defaut: 2,
        doc: "Attaque de la saturation de bande. À zéro, aucune. Le niveau ne change pas quand on la monte, seule la forme de l'onde change, et les harmoniques qui vont avec.",
        docEn: "Drive of the tape saturation. At zero, none. The level does not change as it is raised, only the waveshape does, and the harmonics that come with it." },
      { nom: "Décrochages", nomEn: "Dropouts", type: "curseur", plage: [0, 20], pas: 0.5, defaut: 0.5, unite: "/s",
        doc: "Trous par seconde dans la couche magnétique. Chacun dure une vingtaine de millisecondes et s'ouvre en fondu, sans quoi on entendrait un clic plutôt qu'une absence.",
        docEn: "Holes per second in the magnetic coating. Each lasts some twenty milliseconds and opens with a fade, without which one would hear a click rather than an absence." },
      { nom: "Souffle", nomEn: "Hiss", type: "curseur", plage: [0, 5], pas: 0.1, defaut: 0.5, unite: "%",
        doc: "Niveau du souffle de bande. Il ne s'entend que dans les silences, ce qui est exactement son défaut d'origine.",
        docEn: "Level of tape hiss. It is heard only in the silences, which is exactly its original failing." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 1,
        doc: "Graine des décrochages et du souffle. Une même graine rejoue la même bande.",
        docEn: "Seed for dropouts and hiss. The same seed replays the same tape." },
    ],
    async executer(ctx) {
      const e = entreeAudio(ctx, 0);
      if (sansEntree(e)) return e;
      const o = {
        pleurage: ctx.paramNombre("Écart de pleurage", 0.3),
        pleurageHz: ctx.paramNombre("Pleurage Hz", 0.6),
        scintillement: ctx.paramNombre("Écart de scintillement", 1.7),
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
    id: "ducking", nomDicte: "baisser sous la voix", nom: "Ducking", nomEn: "Ducking",
    univers: "Traitement", famille: "Effets",
    resume: "Un son s'efface devant un autre : la musique recule sous la voix, sans que la voix sorte.",
    resumeEn: "One sound steps aside for another: the music backs off under the voice, without the voice being heard.",
    notice: "Tous écoutent le signal qu'ils traitent : ils baissent un son quand ce son est fort. Aucun ne sait baisser un son quand un autre est fort. C'est pourtant le geste le plus courant du mixage (la musique qui s'efface sous une voix, la nappe qui recule à chaque coup de grosse caisse) et il ne s'obtient par aucune combinaison des quatre.\n\nOn dit « chaîne latérale » en parlant du câblage : le signal qui commande entre par le côté, et ne sort jamais. Seule la cible est rendue.\n\nLe maintien mérite qu'on s'y arrête. Sans lui, une voix qui hésite laisse la musique remonter entre deux mots, et l'on entend un halètement. Le maintien garde l'atténuation un moment après que le déclencheur est retombé, si bien qu'une phrase parlée creuse un seul trou plutôt que douze.\n\nQuatre réglages acceptent une courbe, chacun par son entrée : « Modulation seuil », « Modulation réduction », « Modulation attaque » et « Modulation relâchement », avec leurs bornes nommées d'après leur réglage. Le maintien, lui, n'en accepte pas : il est lu au seul instant où le déclencheur franchit le seuil.",
    noticeEn: "All listen to the signal they treat: they lower a sound when that sound is loud. None can lower a sound when another is loud. Yet this is the commonest gesture in mixing (the music stepping aside under a voice, the pad backing off at each kick) and no combination of the four produces it.\n\nOne says « side chain » when speaking of the wiring: the controlling signal comes in from the side, and never comes out. Only the target is rendered.\n\nThe hold deserves attention. Without it, a hesitating voice lets the music rise between two words, and one hears a panting. The hold keeps the attenuation for a while after the trigger has fallen back, so that a spoken phrase digs one hole rather than twelve.\n\nFour settings accept a curve, each through its own input: « Modulation threshold », « Modulation reduction », « Modulation attack » and « Modulation release », with their bounds named after their setting. The hold does not: it is read at the single instant the trigger crosses the threshold.",
    // LES QUATRE ARRIVENT ENSEMBLE, donc aucun ne garde « Modulation » : c'est le précédent du
    // gate. Ils viennent APRÈS les deux entrées audio, dont les rangs ne bougent pas.
    entrees: [
      { nom: "Cible", nomEn: "Target", type: "audio" },
      { nom: "Déclencheur", nomEn: "Trigger", type: "audio" },
      portModulation("Seuil", "Threshold", { court: false }),
      portModulation("Réduction", "Reduction", { court: false }),
      portModulation("Attaque", "Attack", { court: false }),
      portModulation("Relâchement", "Release", { court: false }),
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
      // LA COURSE PAR DÉFAUT N'EST PAS LA PLAGE ENTIÈRE : elle est là pour que chacun trouve son
      // réglage, non pour qu'une courbe la parcoure d'un bout à l'autre.
      ...bornesModulation({ ...modulationNommee("Seuil", "Threshold", [-60, 0], "dB"), defauts: [-45, -15] }),
      ...bornesModulation({ ...modulationNommee("Réduction", "Reduction", [0, 40], "dB"), defauts: [0, 24] }),
      // LE PAS EST CELUI DU RÉGLAGE BORNÉ, et il manquait. `bornesModulation` en pose un par défaut,
      // ce qui convient à un pour cent ou à un décibel et à rien qui se compte en secondes : une
      // borne de 0,001 à 0,5 seconde au pas de un n'offrait qu'UNE position atteignable, et celle
      // du relâchement deux. Le curseur était donc inutilisable, sans que rien ne le dise.
      ...bornesModulation({ ...modulationNommee("Attaque", "Attack", [0.001, 0.5], "s"), defauts: [0.005, 0.2], pas: 0.001 }),
      ...bornesModulation({ ...modulationNommee("Relâchement", "Release", [0.01, 2], "s"), defauts: [0.05, 1], pas: 0.01 }),
    ],
    async executer(ctx) {
      const cible = entreeAudio(ctx, 0), declencheur = entreeAudio(ctx, 1);
      if (sansEntree(cible)) return cible;
      if (sansEntree(declencheur)) return declencheur;
      const o = {
        // LE REPLI DES BORNES EST DONNÉ, et il manquait. Aucune de ces quatre n'est en pour cent :
        // sans lui, un graphe enregistré avant que ces bornes existent les lirait de zéro à cent,
        // soit des décibels pris pour des pour cent et des secondes pour des centaines.
        seuilDb: reglageModule(ctx, cible.length, 2, {
          reglage: "Seuil", defaut: -30, rendu: "pourCent", noms: ["Seuil min", "Seuil max"],
          bornes: [-45, -15] }),
        reductionDb: reglageModule(ctx, cible.length, 3, {
          reglage: "Réduction", defaut: 12, rendu: "pourCent", noms: ["Réduction min", "Réduction max"],
          bornes: [0, 24] }),
        attaqueSec: reglageModule(ctx, cible.length, 4, {
          reglage: "Attaque", defaut: 0.01, rendu: "pourCent", noms: ["Attaque min", "Attaque max"],
          bornes: [0.005, 0.2] }),
        relachementSec: reglageModule(ctx, cible.length, 5, {
          reglage: "Relâchement", defaut: 0.25, rendu: "pourCent", noms: ["Relâchement min", "Relâchement max"],
          bornes: [0.05, 1] }),
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
    id: "ambisonique", nomDicte: "rotation du champ", nom: "Rotation ambisonique", nomEn: "Ambisonic Rotation",
    univers: "Traitement", famille: "Effets",
    resume: "Encode la prise en champ sonore, le fait tourner autour de l'auditeur, et le redescend en stéréo.",
    resumeEn: "Encodes the take as a sound field, turns it around the listener, and brings it back down to stereo.",
    notice: "D'après Michael Gerzon, « Periphony: With-Height Sound Reproduction », Journal of the Audio Engineering Society 21(1), 1973, et la convention B-format du système Ambisonic.\n\nUn panoramique place une source ; il ne sait pas prendre un enregistrement entier et le faire tourner autour de l'auditeur. C'est ce que l'ambisonie apporte : le champ sonore est représenté par quatre grandeurs indépendantes de tout haut-parleur, et une rotation y est une simple rotation de deux d'entre elles. Faire tourner une scène stéréo autrement demanderait de séparer les sources, ce que personne ne sait faire proprement.\n\nLa pression et la hauteur ne tournent pas : l'une n'a pas de direction, l'autre est l'axe de rotation. Faire tourner une scène coûte donc deux multiplications par échantillon, et c'est la raison d'être du format.\n\nCe que ce composant ne prétend pas faire : retrouver la scène d'origine. Il reconstitue une scène plausible, deux sources aux angles d'écoute habituels, et la traite comme un champ. Sans rotation, il rend les deux canaux dans le bon ordre, l'image resserrée par le décodage et le niveau multiplié par 1,5, soit 3,5 dB de plus : l'encodage suivi du décodage n'est pas de gain unitaire, et ce composant ne normalise pas, faute de quoi la rotation ne s'entendrait plus qu'en niveau.\n\nUne prise mono n'a pas de scène à tourner. Deux canaux identiques donnent un champ où la composante gauche-droite vaut L−R, donc zéro : il ne reste qu'une direction, et la tourner déplace la source d'un côté au lieu de faire tourner quoi que ce soit. Mesuré sur un générateur de fréquence : à 90°, 9,5 dB d'écart entre les canaux, un panoramique franc, qui s'entend ; à 180°, strictement rien, puisque échanger deux canaux identiques les laisse identiques, seul le niveau baissant. Le composant affiche donc la part directionnelle du champ reçu : à zéro, aucun angle ne changera sa sortie. La rotation s'entend sur une image qui existe déjà (deux sources panoramiquées, un élargissement en amont) pilotée par une courbe sur l'entrée Modulation.\n\nL'ouverture du décodeur accepte une courbe à son tour, par l'entrée « Modulation ouverture », avec « Ouverture min » et « Ouverture max » : les deux microphones virtuels s'écartent ou se rapprochent au fil du son. Un angle fixe garde son cosinus et son sinus uniques ; un angle qui se déplace en paie un couple par échantillon, et le décodage en appelle deux.",
    noticeEn: "After Michael Gerzon, « Periphony: With-Height Sound Reproduction », Journal of the Audio Engineering Society 21(1), 1973, and the Ambisonic system's B-format convention.\n\nA panner places a source; it cannot take a whole recording and turn it around the listener. That is what ambisonics brings: the sound field is represented by four quantities independent of any loudspeaker, and a rotation there is a simple rotation of two of them. Turning a stereo scene otherwise would require separating the sources, which nobody can do cleanly.\n\nPressure and height do not turn: one has no direction, the other is the axis of rotation. Turning a scene therefore costs two multiplications per sample, and that is the format's reason for being.\n\nWhat this node does not claim to do: recover the original scene. It reconstitutes a plausible one, two sources at the usual listening angles, and treats it as a field. With no rotation it renders the two channels in the right order, the image narrowed by the decoding and the level multiplied by 1.5, that is 3.5 dB more: encoding followed by decoding is not unity gain, and this node does not normalise, failing which the rotation would only be heard as a level change.\n\nA mono take has no scene to turn. Two identical channels give a field whose left-right component is L−R, hence zero: only one direction remains, and turning it moves the source to one side instead of turning anything. On a frequency generator: at 90°, 9.5 dB between the channels, a plain pan, which is audible; at 180°, strictly nothing, since swapping two identical channels leaves them identical, only the level dropping. The node therefore shows the directional share of the field it received: at zero, no angle will change its output. The rotation is heard on an image that already exists (two panned sources, a widening upstream) driven by a curve on the Modulation input.\n\nThe decoder width accepts a curve in turn, through the « Modulation opening » input, with « Opening min » and « Opening max »: the two virtual microphones spread apart or close in along the sound. A fixed angle keeps its single cosine and sine; an angle that moves pays a pair per sample, and the decoding calls for two.",
    entrees: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Modulation", nomEn: "Modulation", type: "courbe", requis: false, module: "Rotation" },
      portModulation("Ouverture", "Opening", { court: false }),
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      // LA COURSE VA JUSQU'À UN TOUR ENTIER, et c'est ici la BORNE qui avait raison : sa
      // documentation dit « de zéro à 360°, une rampe fait faire un tour complet à la scène », et
      // le réglage s'arrêtait à un demi-tour. Une borne ne peut pas demander ce que le réglage ne
      // sait pas prendre. Posé seul, 360° revient à zéro, ce qui est sans conséquence ; c'est
      // comme point d'arrivée d'une courbe que cette valeur sert.
      { nom: "Rotation", nomEn: "Rotation", type: "curseur", plage: [-360, 360], pas: 1, defaut: 180, unite: "°",
        doc: "De combien la scène tourne, dans le sens direct. À 180°, la gauche et la droite sont échangées ; à 90°, ce qui était à gauche passe devant. Sur une source mono, cet échange est inaudible, deux canaux identiques échangés restent identiques, et seul le niveau baisse ; c'est à 90° qu'une source mono se déplace, de 9,5 dB. Une courbe branchée sur l'entrée Modulation fait tourner la scène en continu, ce qui s'entend bien mieux qu'un angle fixe.",
        docEn: "How far the scene turns, counter-clockwise. At 180° left and right are swapped; at 90°, what was on the left comes to the front. On a mono source that swap is inaudible, two identical channels swapped stay identical, and only the level drops; it is at 90° that a mono source moves, by 9.5 dB. A curve connected to the Modulation input turns the scene continuously, which is far more audible than a fixed angle." },
      // LES DEUX ANGLES QUI SUIVENT S'ARRÊTENT À UN DEMI-TOUR, et la raison n'était écrite nulle
      // part : la Rotation porte la justification de sa course, ces deux-là n'avaient que la
      // description de ce qu'ils font. Demandé par Fabien, qui a cru à un plafond de 180° sur la
      // rotation elle-même.
      //
      // CE SONT DES ANGLES ENTRE DEUX DIRECTIONS, et non des positions : `encoderStereo` place les
      // deux sources à ±écart/2, `decoderStereo` les deux microphones virtuels à ±ouverture/2. À
      // 180° la paire est donc déjà à ±90°, extrême gauche et extrême droite, le plus large qu'on
      // puisse écarter deux sources DEVANT l'auditeur. Au-delà, elles passent derrière, et un
      // décodage de face n'y perd que du niveau.
      //
      // RELEVÉ SUR UNE VRAIE STÉRÉO, sans rotation, ouverture à 90°, niveau efficace de la sortie :
      // 0,3978 à 90°, 0,3073 à 180°, 0,2808 à 200°, 0,1770 à 270°, et 0,0737 à 360°, soit 14,6 dB
      // sous le réglage par défaut. Et la part directionnelle du champ reste à 0,99 partout :
      // ouvrir au-delà de 180° ne gagne aucune image, cela ne fait que baisser.
      //
      // ET CE N'EST PAS UNE REDONDANCE, hypothèse que la mesure a réfutée. Je pensais que 200°
      // valait 160° avec les canaux échangés ; l'écart maximal entre le G de 160° et le D de 200°
      // vaut 0,662. Ce sont bien deux configurations différentes, et la seconde ne sert à rien.
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
      ...bornesModulation({ ...modulationNommee("Ouverture", "Decoder width", [30, 180], "°"), defauts: [60, 150] }),
    ],
    async executer(ctx) {
      const e = entreeAudio(ctx, 0);
      if (sansEntree(e)) return e;
      const rad = (d: number) => (d * Math.PI) / 180;
      const champ = encoderStereo(voie(e, 0), voie(e, 1), rad(ctx.paramNombre("Écart des sources", 90)));
      // Sans courbe, une constante à la valeur du réglage : un seul chemin de calcul.
      const angles = valeursParametre(ctx.entree(1), e.length, rad(ctx.paramNombre("Rotation", 180)), {
        min: rad(ctx.paramNombre("Modulation min", 0)),
        max: rad(ctx.paramNombre("Modulation max", 360)),
      });
      // L'ouverture est déclarée en degrés et le décodeur la veut en radians : la conversion se
      // fait donc point par point quand c'est une courbe, et une seule fois quand c'est un nombre.
      const ouverture = reglageModule(ctx, champ.W.length, 2, {
        reglage: "Ouverture", defaut: 90, rendu: "pourCent",
        noms: ["Ouverture min", "Ouverture max"], bornes: [60, 150],
      });
      const [g, d] = decoderStereo(tourner(champ, angles), ouverture, rad);
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
