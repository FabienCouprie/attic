// plugins/oscillateur-analogique.ts — Les quatre gestes d'un oscillateur à tension.
//
// CE QUE CE COMPOSANT APPORTE, et pourquoi il est à côté de l'autre et non dedans.
// L'oscillateur du dépôt somme des harmoniques sous Nyquist : son spectre est exact, il ne
// replie rien, et sa vue montre les barres de ses harmoniques. C'est ce qu'il faut pour
// montrer le lien entre une forme d'onde et ses harmoniques, et c'est exactement ce que les
// quatre gestes d'un oscillateur analogique détruisent, chacun d'eux fabriquant un spectre
// qui ne s'arrête pas à Nyquist. Les poser sur lui aurait coûté sa propriété et son propos.
//
// LES QUATRE GESTES NE SONT PAS QUATRE COMPOSANTS, et c'est la pile désaccordée qui l'a
// décidé : empiler des oscillateurs n'a pas de sens sans oscillateur à empiler. Les quatre
// partagent la même phase, la même fréquence et le même traitement du repliement ; séparés,
// chacun aurait eu à recevoir la sortie du précédent sous forme de signal, alors que ce
// qu'ils se passent est une phase.
//
// LE CALCUL EST DANS `audio/oscillateur-analogique.ts`, qui porte en tête ce que le
// repliement coûte et pourquoi la position de la rupture compte plus que le facteur de
// suréchantillonnage.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { FREQUENCE_ECH, versBuffer } from "./instruments-communs";
import {
  LARGEUR_MAX, LARGEUR_MIN, SUR_ECHANTILLONNAGE, VOIX_MAX, synthetiserVco, type FormeVco,
} from "../audio/oscillateur-analogique";

/** Les trois formes. Aucune ne se ramène aux autres, et aucune n'est une onde de base. */
const FORMES: { id: FormeVco; fr: string; en: string }[] = [
  { id: "sawtooth", fr: "Dent de scie", en: "Sawtooth" },
  { id: "impulsion", fr: "Impulsion", en: "Pulse" },
  { id: "phase", fr: "Phase déformée", en: "Distorted phase" },
];

const libelleForme = (id: string): string => {
  const f = FORMES.find((x) => x.id === id) ?? FORMES[0];
  return langueCourante() === "en" ? f.en : f.fr;
};

export const fiches: FicheAudio[] = ([
  {
    id: "oscillateur-analogique", nom: "Oscillateur analogique", nomEn: "Analogue Oscillator",
    univers: "Entrées", famille: "Génération",
    resume: "Génère une onde par les quatre gestes d'un oscillateur à tension : largeur, synchronisation, pile désaccordée, phase déformée.",
    resumeEn: "Generates a wave through the four gestures of a voltage-controlled oscillator: width, synchronisation, detuned stack, distorted phase.",
    etiquettes: ["pwm", "supersaw", "sync", "vco", "analogique", "analogue", "largeur", "impulsion"],
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      {
        nom: "Forme", nomEn: "Waveform", type: "choix",
        options: FORMES.map((f) => f.fr), optionsEn: FORMES.map((f) => f.en),
        optionIds: FORMES.map((f) => f.id), defaut: "Dent de scie", defautEn: "Sawtooth",
        doc: "L'onde calculée. « Dent de scie » monte linéairement puis retombe, et porte toutes les harmoniques. « Impulsion » reste en haut la part du cycle que donne « Largeur », puis en bas le reste. « Phase déformée » lit une sinusoïde à une phase que « Distorsion » et « Largeur » déforment.",
        docEn: "The wave computed. « Sawtooth » rises linearly then falls back, and carries every harmonic. « Pulse » stays high for the share of the cycle given by « Width », then low for the rest. « Distorted phase » reads a sine at a phase that « Distortion » and « Width » bend.",
      },
      {
        nom: "Fréquence", nomEn: "Frequency", plage: [20, 4000], pas: 1, defaut: 220, unite: "Hz",
        doc: "La fréquence de la remise à zéro, en hertz : c'est la hauteur entendue, y compris sous synchronisation.",
        docEn: "The frequency of the reset, in hertz: this is the pitch heard, including under synchronisation.",
      },
      {
        nom: "Durée", nomEn: "Duration", plage: [0.2, 5], pas: 0.1, defaut: 1.5, unite: "s",
        doc: "Durée du son généré.",
        docEn: "Duration of the generated tone.",
      },
      {
        // LES BORNES SONT CELLES DU CALCUL, et non deux nombres recopiés : l'interface ne
        // doit pas offrir une largeur que le calcul ramènerait dans ses bornes en silence.
        //
        // ET LE DÉFAUT N'EST PAS À CINQUANTE, ce qu'un balayage de tous les réglages dans
        // l'application a imposé : le genou de la phase déformée part de la largeur, de
        // sorte qu'à cinquante pour cent il est déjà au milieu du cycle et « Distorsion »
        // n'a plus rien à déplacer. Les deux réglages rendaient alors la même empreinte,
        // 0.005091170, et le curseur ne pouvait rien changer. À vingt-cinq, les deux
        // agissent, et un créneau au quart est une forme plus parlante qu'un carré, portant
        // les harmoniques paires comme les impaires.
        nom: "Largeur", nomEn: "Width",
        plage: [LARGEUR_MIN * 100, LARGEUR_MAX * 100], pas: 1, defaut: 25, unite: "%",
        doc: "La part du cycle passée en haut, pour « Impulsion ». À cinquante, le créneau est symétrique et ne porte que les harmoniques impaires ; en s'écartant du milieu, les harmoniques paires apparaissent et le son s'amincit, la hauteur ne bougeant pas. Pour « Phase déformée », la même valeur est la position que « Distorsion » donne au genou : à cinquante, le genou est déjà au milieu du cycle et « Distorsion » n'a rien à déplacer. Sur « Dent de scie », ce réglage reste sans effet, une scie n'ayant pas de palier.",
        docEn: "The share of the cycle spent high, for « Pulse ». At fifty the pulse is symmetrical and carries only odd harmonics; away from the middle, even harmonics appear and the sound thins out, while the pitch stays put. For « Distorted phase », the same value is the position « Distortion » gives the knee: at fifty the knee already sits at the middle of the cycle and « Distortion » has nothing to move. On « Sawtooth » this setting has no effect, a sawtooth having no plateau.",
      },
      {
        nom: "Modulation de largeur", nomEn: "Width modulation", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Profondeur du balayage de « Largeur ». À zéro, la largeur reste celle qui est réglée. L'amplitude se borne à ce que les bornes de la largeur laissent de part et d'autre, de sorte qu'à cent le balayage les atteint sans les franchir. Sans effet sur « Dent de scie ».",
        docEn: "Depth of the sweep applied to « Width ». At zero the width stays as set. The amplitude is limited to what the width bounds leave on either side, so that at a hundred the sweep reaches them without crossing them. No effect on « Sawtooth ».",
      },
      {
        nom: "Vitesse de modulation", nomEn: "Modulation rate", plage: [0.05, 20], pas: 0.05, defaut: 0.5, unite: "Hz",
        doc: "Vitesse du balayage de « Largeur », en balayages par seconde. Sans effet quand « Modulation de largeur » est à zéro, puisque rien ne balaie alors.",
        docEn: "Rate of the « Width » sweep, in sweeps per second. No effect when « Width modulation » is at zero, since nothing then sweeps.",
      },
      {
        nom: "Voix", nomEn: "Voices", plage: [1, VOIX_MAX], pas: 1, defaut: 1,
        doc: "Nombre d'oscillateurs calculés ensemble, leurs phases de départ réparties régulièrement sur le cycle. Les voix sont moyennées, de sorte qu'une pile ne sort pas plus fort qu'une voix seule.",
        docEn: "Number of oscillators computed together, their starting phases spread evenly over the cycle. The voices are averaged, so that a stack does not come out louder than a single voice.",
      },
      {
        nom: "Désaccord", nomEn: "Detune", plage: [0, 50], pas: 1, defaut: 12, unite: "cents",
        doc: "Écart total entre la voix la plus basse et la plus haute de la pile, réparti autour de la fréquence réglée. Les voix s'éloignent puis se rapprochent, ce qui fait battre le niveau. Sans effet à une seule voix.",
        docEn: "Total interval between the lowest and the highest voice of the stack, spread around the frequency set. The voices drift apart then together, which makes the level beat. No effect with a single voice.",
      },
      {
        nom: "Synchronisation", nomEn: "Synchronisation", plage: [1, 8], pas: 1, defaut: 1,
        doc: "Rapport entre la fréquence de l'onde et celle de la remise à zéro. À un, la remise à zéro n'intervient pas et l'onde suit sa propre période. Au-delà, l'onde est coupée net à chaque période de « Fréquence » : la hauteur reste celle de « Fréquence » et le rapport déplace le relief du spectre, ce qui se règle comme un timbre.",
        docEn: "Ratio between the frequency of the wave and that of the reset. At one, the reset does not intervene and the wave follows its own period. Above, the wave is cut short at every period of « Frequency »: the pitch stays that of « Frequency » and the ratio moves the peak of the spectrum, which is set like a timbre.",
      },
      {
        nom: "Distorsion", nomEn: "Distortion", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Déformation de la phase, pour « Phase déformée ». À zéro, le genou est au milieu du cycle et la sortie est une sinusoïde. En montant, le genou rejoint « Largeur » et une moitié de la sinusoïde se comprime dans une portion plus courte du cycle, ce qui fabrique des harmoniques hautes sans changer la période. Ce réglage reste donc sans effet quand « Largeur » est à cinquante, le genou étant déjà au milieu. Sans effet non plus sur les deux autres formes.",
        docEn: "Bend applied to the phase, for « Distorted phase ». At zero the knee sits at the middle of the cycle and the output is a sine. As it rises, the knee moves to « Width » and one half of the sine is squeezed into a shorter part of the cycle, which makes high harmonics without changing the period. This setting therefore has no effect when « Width » is at fifty, the knee already sitting at the middle. No effect either on the other two waveforms.",
      },
      {
        nom: "Volume", nomEn: "Volume", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Niveau de la sortie, après normalisation de la crête.",
        docEn: "Output level, after the peak has been normalised.",
      },
    ],
    async executer(ctx: any) {
      const forme = (FORMES.find((f) => f.id === ctx.paramTexte("Forme", "sawtooth"))?.id
        ?? "sawtooth") as FormeVco;
      const frequence = ctx.paramNombre("Fréquence", 220);
      const voix = Math.round(ctx.paramNombre("Voix", 1));
      const sync = Math.round(ctx.paramNombre("Synchronisation", 1));
      const resultat = synthetiserVco({
        forme,
        frequence,
        duree: ctx.paramNombre("Durée", 1.5),
        largeur: ctx.paramNombre("Largeur", 50) / 100,
        modulationLargeur: ctx.paramNombre("Modulation de largeur", 0) / 100,
        vitesseModulation: ctx.paramNombre("Vitesse de modulation", 0.5),
        voix,
        desaccord: ctx.paramNombre("Désaccord", 12),
        sync,
        distorsion: ctx.paramNombre("Distorsion", 50) / 100,
      }, FREQUENCE_ECH, SUR_ECHANTILLONNAGE);

      // `versBuffer` ATTEND DES POUR CENT et divise lui-même : diviser ici aussi sortait cent
      // fois trop bas, soit quarante décibels.
      const buffer = versBuffer(resultat.signal, ctx.paramNombre("Volume", 80));
      return {
        valeurs: [buffer],
        message: traduire("msg.vco.resultat", libelleForme(forme), Math.round(frequence),
          voix, sync > 1 ? `· ${sync}:1` : "", resultat.continu.toFixed(3)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
