// plugins/egaliseur-parametrique.ts — Sept étages placés où l'on veut : passe-haut, plateaux, quatre cloches.
//
// LE CALCUL EST DANS `audio/egaliseur-parametrique.ts`, qui dit pourquoi ce composant existe à côté
// de l'égaliseur à neuf bandes fixes, et ce qu'il rend. Cette fiche ne fait que lire les dix-sept
// réglages et les lui passer.
//
// LES BANDES S'OUVRENT NEUTRES, et c'est voulu : un égaliseur posé ne change rien tant qu'on ne lui
// a rien demandé, et le son reçu ressort alors à l'échantillon près. Monter un gain est un geste
// explicite, comme la règle de sécurité pour l'oreille le veut de toute amplification.
//
// LA FRÉQUENCE ET LE Q D'UNE BANDE À ZÉRO DÉCIBEL SONT INERTES, et leur documentation le dit :
// une bande sans gain n'est pas posée. Ce n'est pas un réglage mort, c'est un réglage en attente
// de son gain.
import type { FicheAudio } from "../audio/types-domaine";
import { egaliserParametrique, etagesActifs, type ReglagesEgaliseur } from "../audio/egaliseur-parametrique";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { entreeAudio, sansEntree } from "./lire-entree";

/** Les quatre cloches, leur centre à l'ouverture : une par région où l'on corrige le plus souvent. */
const CLOCHES = [250, 1000, 3000, 8000];

const frequence = (nom: string, nomEn: string, defaut: number, plage: [number, number], doc: string, docEn: string) =>
  ({ nom, nomEn, plage, pas: 1, defaut, unite: "Hz", doc, docEn });

const gain = (nom: string, nomEn: string, doc: string, docEn: string) =>
  ({ nom, nomEn, plage: [-18, 18] as [number, number], pas: 0.5, defaut: 0, unite: "dB", doc, docEn });

const SANS_GAIN = "Sans effet tant que le gain de la bande est nul.";
const SANS_GAIN_EN = "No effect while the band's gain is zero.";

const parametresCloches = CLOCHES.flatMap((centre, i) => {
  const n = i + 1;
  return [
    frequence(`Fréquence ${n}`, `Frequency ${n}`, centre, [20, 20000],
      `Le centre de la cloche ${n}. ${SANS_GAIN}`, `The centre of bell ${n}. ${SANS_GAIN_EN}`),
    gain(`Gain ${n}`, `Gain ${n}`,
      `Ce que la cloche ${n} ajoute ou retire à son centre. À zéro, elle n'est pas posée.`,
      `What bell ${n} adds or removes at its centre. At zero, it is not applied.`),
    { nom: `Q ${n}`, nomEn: `Q ${n}`, plage: [0.3, 10] as [number, number], pas: 0.1, defaut: 1, unite: "Q",
      doc: `La largeur de la cloche ${n} : élevé, elle se resserre sur quelques hertz ; faible, elle s'étend sur plusieurs octaves. ${SANS_GAIN}`,
      docEn: `The width of bell ${n}: high, it narrows to a few hertz; low, it spreads over several octaves. ${SANS_GAIN_EN}` },
  ];
});

export const fiches = ([
  {
    id: "egaliseur-parametrique", nom: "Égaliseur paramétrique", nomEn: "Parametric Equalizer",
    univers: "Traitement", famille: "Effets",
    resume: "Corrige l'équilibre fréquentiel par un passe-haut, deux plateaux et quatre cloches placés à volonté.",
    resumeEn: "Corrects the frequency balance with a high-pass, two shelves and four bells placed at will.",
    etiquettes: ["EQ", "paramétrique", "parametric", "plateau", "shelf", "cloche", "bell", "passe-haut", "high-pass"],
    notice: "Ce composant corrige l'équilibre fréquentiel d'un son par sept étages placés à la fréquence voulue : "
      + "un passe-haut, un plateau grave, quatre cloches et un plateau aigu. Les filtres suivent les formules de "
      + "Robert Bristow-Johnson (« Cookbook formulae for audio EQ biquad filter coefficients »).\n\n"
      + "« Passe-haut » fixe la fréquence de coupure d'un filtre de Butterworth du second ordre, qui atténue de "
      + "trois décibels à cette fréquence et de douze décibels par octave en dessous. À zéro, rien n'est coupé.\n\n"
      + "« Fréquence grave » et « Gain grave » règlent le plateau grave : ce qui est sous la fréquence reçoit le "
      + "gain, et la fréquence elle-même en reçoit la moitié, en décibels.\n\n"
      + "« Fréquence 1 », « Fréquence 2 », « Fréquence 3 » et « Fréquence 4 » placent le centre des quatre cloches. "
      + "« Gain 1 », « Gain 2 », « Gain 3 » et « Gain 4 » disent ce que chacune ajoute ou retire à son centre. "
      + "« Q 1 », « Q 2 », « Q 3 » et « Q 4 » règlent leur largeur : un Q élevé resserre la cloche sur quelques "
      + "hertz, un Q faible l'étend sur plusieurs octaves.\n\n"
      + "« Fréquence aiguë » et « Gain aigu » règlent le plateau aigu, symétrique du grave : ce qui est au-dessus "
      + "de la fréquence reçoit le gain, et la fréquence elle-même en reçoit la moitié.\n\n"
      + "Un étage dont le gain est nul n'est pas posé : sa fréquence et sa largeur sont alors sans effet. Quand "
      + "aucun gain n'est réglé et que « Passe-haut » vaut zéro, le son reçu ressort inchangé. Une fréquence "
      + "au-delà de la moitié de la fréquence d'échantillonnage est ramenée juste en dessous. Un gain positif "
      + "élève le niveau, et les crêtes avec lui.\n\n"
      + "La sortie « Audio » rend le son égalisé, avec la durée, la fréquence d'échantillonnage et les canaux "
      + "reçus. Le message donne le nombre d'étages posés.",
    noticeEn: "This component corrects the frequency balance of a sound with seven stages placed at the chosen "
      + "frequency: a high-pass, a low shelf, four bells and a high shelf. The filters follow Robert "
      + "Bristow-Johnson's formulae (« Cookbook formulae for audio EQ biquad filter coefficients »).\n\n"
      + "« High-pass » sets the cutoff frequency of a second-order Butterworth filter, which attenuates by three "
      + "decibels at that frequency and by twelve decibels per octave below it. At zero, nothing is cut.\n\n"
      + "« Low frequency » and « Low gain » set the low shelf: what lies below the frequency receives the gain, "
      + "and the frequency itself receives half of it, in decibels.\n\n"
      + "« Frequency 1 », « Frequency 2 », « Frequency 3 » and « Frequency 4 » place the centre of the four bells. "
      + "« Gain 1 », « Gain 2 », « Gain 3 » and « Gain 4 » say what each adds or removes at its centre. "
      + "« Q 1 », « Q 2 », « Q 3 » and « Q 4 » set their width: a high Q narrows the bell to a few hertz, a low Q "
      + "spreads it over several octaves.\n\n"
      + "« High frequency » and « High gain » set the high shelf, the mirror of the low one: what lies above the "
      + "frequency receives the gain, and the frequency itself receives half of it.\n\n"
      + "A stage whose gain is zero is not applied: its frequency and width then have no effect. When no gain is "
      + "set and « High-pass » is zero, the received sound comes out unchanged. A frequency beyond half the "
      + "sample rate is brought just below it. A positive gain raises the level, and the peaks with it.\n\n"
      + "The « Audio » output returns the equalised sound, with the received length, sample rate and channels. "
      + "The message gives the number of stages applied.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      frequence("Passe-haut", "High-pass", 0, [0, 500],
        "La coupure d'un passe-haut à douze décibels par octave. À zéro, rien n'est coupé.",
        "The cutoff of a twelve-decibel-per-octave high-pass. At zero, nothing is cut."),
      frequence("Fréquence grave", "Low frequency", 100, [20, 1000],
        `La charnière du plateau grave : sous elle, le gain s'applique. ${SANS_GAIN}`,
        `The hinge of the low shelf: below it, the gain applies. ${SANS_GAIN_EN}`),
      gain("Gain grave", "Low gain", "Ce que le plateau grave ajoute ou retire. À zéro, il n'est pas posé.",
        "What the low shelf adds or removes. At zero, it is not applied."),
      ...parametresCloches,
      frequence("Fréquence aiguë", "High frequency", 10000, [1000, 20000],
        `La charnière du plateau aigu : au-dessus d'elle, le gain s'applique. ${SANS_GAIN}`,
        `The hinge of the high shelf: above it, the gain applies. ${SANS_GAIN_EN}`),
      gain("Gain aigu", "High gain", "Ce que le plateau aigu ajoute ou retire. À zéro, il n'est pas posé.",
        "What the high shelf adds or removes. At zero, it is not applied."),
    ],
    async executer(ctx) {
      const audio = entreeAudio(ctx, 0);
      if (sansEntree(audio)) return audio;
      const reglages: ReglagesEgaliseur = {
        passeHaut: ctx.paramNombre("Passe-haut", 0),
        graveFrequence: ctx.paramNombre("Fréquence grave", 100),
        graveGainDb: ctx.paramNombre("Gain grave", 0),
        cloches: CLOCHES.map((centre, i) => ({
          frequence: ctx.paramNombre(`Fréquence ${i + 1}`, centre),
          gainDb: ctx.paramNombre(`Gain ${i + 1}`, 0),
          q: ctx.paramNombre(`Q ${i + 1}`, 1),
        })),
        aiguFrequence: ctx.paramNombre("Fréquence aiguë", 10000),
        aiguGainDb: ctx.paramNombre("Gain aigu", 0),
      };
      const poses = etagesActifs(reglages, audio.sampleRate).length;
      const sortie = await egaliserParametrique(audio, reglages);
      return {
        valeurs: [sortie],
        message: poses === 0 ? traduire("msg.egaliseur_parametrique.neutre")
          : traduire("msg.egaliseur_parametrique.fait", poses),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
