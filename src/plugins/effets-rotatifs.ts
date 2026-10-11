// plugins/effets-rotatifs.ts — Deux effets qui déplacent l'équilibre du spectre.
//
// CE QUE LES DEUX ONT EN COMMUN, et pourquoi ils sont dans le même fichier. L'un et l'autre
// coupent le son en deux bandes avant de le traiter, et font à chacune quelque chose de
// différent : c'est ce qui les sépare d'un trémolo, qui monte et descend tout le son d'un
// bloc. Le filtre de séparation leur est commun, et il est dans `audio/rotatifs.ts` avec le
// reste du calcul.
//
// POURQUOI LE CALCUL N'EST PAS CELUI DE `audio/effets-filtres.ts`. Celui-ci pose un biquad
// par `OfflineAudioContext`, absent de l'environnement de test : deux cas du dépôt s'y
// sautent déjà. La propriété qui compte ici est que la somme des deux bandes reste plate, et
// un calcul qu'on ne peut pas éprouver hors du navigateur ne peut pas porter ce garde.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { hautParleurRotatif, tremoloHarmonique } from "../audio/rotatifs";
import { MODULATION_MELANGE, bornesModulation, modulationNommee, reglageModule, portModulation } from "./effets-aides";

const canauxDe = (a: AudioBuffer): Float32Array[] =>
  Array.from({ length: a.numberOfChannels }, (_, c) => a.getChannelData(c));

/** Un tampon bâti sur des canaux déjà calculés, sans normalisation : un effet garde le niveau. */
function versTampon(canaux: Float32Array[], echantillonnage: number): AudioBuffer {
  const sortie = new AudioBuffer({
    numberOfChannels: canaux.length,
    length: Math.max(1, canaux[0].length),
    sampleRate: echantillonnage,
  });
  for (let c = 0; c < canaux.length; c++) sortie.getChannelData(c).set(canaux[c]);
  return sortie;
}

export const fiches: FicheAudio[] = ([
  {
    id: "tremolo-harmonique", nom: "Trémolo harmonique", nomEn: "Harmonic Tremolo",
    univers: "Traitement", famille: "Effets",
    // flux : deux biquads par bande, état dans quatre scalaires, et aucun regard en avant.
    memoire: "flux",
    resume: "Module le grave et l'aigu en opposition : la couleur oscille, le niveau presque pas.",
    resumeEn: "Modulates lows and highs in opposition: the colour sways, the level barely moves.",
    etiquettes: ["tremolo", "harmonique", "harmonic", "bandes", "brownface"],
    // LE PORT DU MÉLANGE GARDE SON NOM COURT, et ses bornes aussi. Il est en production, et un
    // graphe enregistré désigne un réglage par son NOM : renommer « Modulation min » orphelinerait
    // les valeurs déjà sauvegardées. Seul le port neuf porte le nom de son réglage.
    entrees: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      portModulation("Mélange"),
      portModulation("Profondeur", "Depth", { court: false }),
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Vitesse", nomEn: "Rate", type: "curseur", plage: [0.1, 20], pas: 0.1, defaut: 5, unite: "Hz",
        doc: "Nombre d'allers-retours par seconde entre le grave et l'aigu.",
        docEn: "Number of return trips per second between lows and highs." },
      { nom: "Profondeur", nomEn: "Depth", type: "curseur", plage: [0, 100], pas: 1, defaut: 70, unite: "%",
        doc: "Écart de niveau entre les deux bandes au plus fort de l'oscillation. À zéro, les deux bandes gardent leur niveau et le son ressort tel quel.",
        docEn: "Level difference between the two bands at the peak of the oscillation. At zero, both bands keep their level and the sound comes out unchanged." },
      { nom: "Coupure", nomEn: "Crossover", type: "curseur", plage: [100, 4000], pas: 10, defaut: 800, unite: "Hz",
        doc: "Fréquence qui sépare les deux bandes. Basse, seuls les aigus oscillent par rapport au reste ; haute, c'est le grave qui se détache.",
        docEn: "Frequency that separates the two bands. Low, only the treble sways against the rest; high, it is the bass that stands out." },
      { nom: "Mélange", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Part de son traité dans la sortie. À zéro, l'entrée ressort échantillon pour échantillon.",
        docEn: "Share of treated sound in the output. At zero, the input comes out sample for sample." },
      ...bornesModulation(MODULATION_MELANGE),
      ...bornesModulation(modulationNommee("Profondeur", "Depth", [0, 100], "%")),
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) {
        return { valeurs: [null], message: traduire("msg.connectez_une_source_audio") };
      }
      const coupure = ctx.paramNombre("Coupure", 800);
      const vitesse = ctx.paramNombre("Vitesse", 5);
      const canaux = tremoloHarmonique(canauxDe(a), a.sampleRate, {
        vitesse,
        profondeur: reglageModule(ctx, a.length, 2, {
          reglage: "Profondeur", defaut: 70, noms: ["Profondeur min", "Profondeur max"],
        }),
        coupure,
        melange: reglageModule(ctx, a.length, 1, { reglage: "Mélange" }),
      });
      return {
        valeurs: [versTampon(canaux, a.sampleRate)],
        message: traduire("msg.tremolo-harmonique.resultat", vitesse, Math.round(coupure)),
      };
    },
  },
  {
    id: "haut-parleur-rotatif", nom: "Haut-parleur rotatif", nomEn: "Rotary Speaker",
    univers: "Traitement", famille: "Effets",
    // flux : les lignes à retard sont bornées par le rayon des rotors, un millième de seconde.
    memoire: "flux",
    resume: "Fait tourner le grave et l'aigu sur deux rotors : le trajet varie, donc la hauteur et le niveau.",
    resumeEn: "Spins lows and highs on two rotors: the path varies, and with it the pitch and the level.",
    etiquettes: ["rotatif", "rotary", "leslie", "doppler", "cabine", "orgue"],
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }, portModulation("Mélange")],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Vitesse de la trompe", nomEn: "Horn rate", type: "curseur", plage: [0.2, 12], pas: 0.1, defaut: 6.7, unite: "tr/s",
        doc: "Tours par seconde du rotor aigu. C'est lui qui donne l'écart de hauteur le plus grand, son rayon étant le plus large.",
        docEn: "Turns per second of the treble rotor. It gives the widest pitch deviation, its radius being the larger." },
      { nom: "Vitesse du tambour", nomEn: "Drum rate", type: "curseur", plage: [0.1, 8], pas: 0.1, defaut: 1.2, unite: "tr/s",
        doc: "Tours par seconde du rotor grave. Le tourner moins vite que la trompe est ce qui empêche les deux bandes de battre ensemble.",
        docEn: "Turns per second of the bass rotor. Turning it slower than the horn is what keeps the two bands from beating together." },
      { nom: "Coupure", nomEn: "Crossover", type: "curseur", plage: [200, 2000], pas: 10, defaut: 800, unite: "Hz",
        doc: "Fréquence qui sépare la trompe du tambour.",
        docEn: "Frequency that separates the horn from the drum." },
      { nom: "Profondeur d'amplitude", nomEn: "Amplitude depth", type: "curseur", plage: [0, 100], pas: 1, defaut: 70, unite: "%",
        doc: "Écart de niveau entre le moment où un rotor fait face au micro et celui où il lui tourne le dos. À zéro, seule la hauteur bouge.",
        docEn: "Level difference between the moment a rotor faces the microphone and the moment it turns away. At zero, only the pitch moves." },
      { nom: "Profondeur du Doppler", nomEn: "Doppler depth", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Part du trajet parcourue par les rotors. L'écart de hauteur en découle avec la vitesse, il ne se règle pas directement : à cent pour cent et 6,7 tours par seconde, il atteint un tiers de demi-ton. À zéro, la hauteur ne bouge plus et il ne reste que la variation de niveau.",
        docEn: "Share of the path the rotors travel. The pitch deviation follows from it together with the rate, and is not set directly: at a hundred per cent and 6.7 turns per second it reaches a third of a semitone. At zero the pitch no longer moves and only the level variation remains." },
      { nom: "Largeur", nomEn: "Width", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Écart entre les deux micros autour de l'axe. À cent pour cent ils sont opposés et voient passer les rotors à un demi-tour d'intervalle ; à zéro ils sont au même endroit et les deux canaux se confondent.",
        docEn: "Angle between the two microphones around the axis. At a hundred per cent they are opposite and see the rotors pass half a turn apart; at zero they sit at the same place and the two channels coincide." },
      { nom: "Mélange", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Part de son traité dans la sortie. À zéro, l'entrée ressort échantillon pour échantillon sur les deux canaux.",
        docEn: "Share of treated sound in the output. At zero, the input comes out sample for sample on both channels." },
      ...bornesModulation(MODULATION_MELANGE),
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) {
        return { valeurs: [null], message: traduire("msg.connectez_une_source_audio") };
      }
      const vitesseAigu = ctx.paramNombre("Vitesse de la trompe", 6.7);
      const doppler = ctx.paramNombre("Profondeur du Doppler", 100) / 100;
      const canaux = hautParleurRotatif(canauxDe(a), a.sampleRate, {
        vitesseAigu,
        vitesseGrave: ctx.paramNombre("Vitesse du tambour", 1.2),
        coupure: ctx.paramNombre("Coupure", 800),
        profondeurAmplitude: ctx.paramNombre("Profondeur d'amplitude", 70) / 100,
        profondeurDoppler: doppler,
        largeur: ctx.paramNombre("Largeur", 100) / 100,
        melange: reglageModule(ctx, a.length, 1, { reglage: "Mélange" }),
      });
      // L'ÉCART DE HAUTEUR EST RENDU PLUTÔT QUE LE RÉGLAGE, parce qu'il ne se règle pas : il
      // sort du rayon et de la vitesse, et c'est lui qu'on entend.
      const cents = 1200 * Math.log2(1 + (2 * Math.PI * vitesseAigu * 0.17 * doppler) / 343);
      return {
        valeurs: [versTampon(canaux, a.sampleRate)],
        message: traduire("msg.rotatif.resultat", vitesseAigu.toFixed(1), cents.toFixed(1)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
