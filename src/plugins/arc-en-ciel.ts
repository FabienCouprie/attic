// plugins/arc-en-ciel.ts — La fiche de l'arc-en-ciel acoustique.
//
// Le calcul, ses références et la raison de ses choix sont dans `audio/arc-en-ciel.ts`.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { arcEnCiel, bandesArcEnCiel } from "../audio/arc-en-ciel";
import { MODULATION_MIX, bornesModulation, reglageModule, portModulation } from "./effets-aides";

const en = () => langueCourante() === "en";

export const fiches: FicheAudio[] = ([
  {
    id: "arc-en-ciel-acoustique", nom: "Arc-en-ciel acoustique", nomEn: "Acoustic Rainbow",
    univers: "Traitement", famille: "Stéréo",
    // PAS DE PROMESSE DE FLUX, et le contrat de mémoire a eu raison de la refuser : le niveau du son
    // trié est ramené à celui de l'entrée, ce qui demande la crête du signal ENTIER avant d'écrire
    // le premier échantillon. Une déclaration « flux » serait fausse, et sa fausseté ne se verrait
    // que sur une piste assez longue pour que le moteur travaille par blocs.
    resume: "Trie le son par fréquence dans l'espace : chaque bande sort d'une direction, arrive à son heure, et demeure là où elle s'arrête.",
    resumeEn: "Sorts sound across space by frequency: each band comes from its own direction, arrives at its own time, and dwells where it stops.",
    notice: "Ce composant range les fréquences d'un son dans l'espace stéréo : chaque bande sort d'une direction qui lui est propre, arrive à un instant qui lui est propre, et continue de sonner là où elle s'est arrêtée.\n\nD'après le piégeage en arc-en-ciel, proposé en optique par Kosmas L. Tsakmakidis, Allan D. Boardman et Ortwin Hess, « 'Trapped rainbow' storage of light in metamaterials », Nature 450, 2007, p. 397-401, et démontré en acoustique par Jie Zhu, Yong Chen, Xuefeng Zhu et al., « Acoustic rainbow trapping », Scientific Reports 3, 2013, 1728. Dans un réseau gradué de résonateurs, une onde large bande ralentit et chaque bande s'immobilise là où la résonance locale la rattrape : les aigus tôt, les graves loin. Noé Jiménez, Vicent Romero-García, Vincent Pagneux et Jean-Philippe Groby, « Rainbow-trapping absorbers », Scientific Reports 7, 2017, 13595, en tirent un absorbeur large bande.\n\n« Bandes » est le nombre de résonateurs du banc, répartis en fréquence par octaves égales entre « Grave » et « Aigu ». Les fréquences au-delà de la moitié de la fréquence d'échantillonnage sont écartées.\n\n« Sens » dit de quel côté sort le grave. « Ouverture » est la part de l'étendue stéréo employée : à zéro, toutes les bandes sortent du centre et le tri ne s'entend plus que dans le temps.\n\n« Courbure » resserre le gradient vers un bord. À zéro, la position suit le rang de la bande ; au-dessus, les graves se rassemblent d'un côté et les aigus s'étalent ; en dessous, l'inverse.\n\n« Dispersion » est le trajet de la bande la plus grave, celle qui va le plus loin. Les bandes plus aiguës arrivent plus tôt, dans l'ordre du gradient. À zéro, toutes arrivent ensemble et il ne reste que le tri dans l'espace.\n\n« Piégeage » est le temps que la bande la plus grave met à perdre 60 dB. Le banc est à Q constant : le temps de résonance suit l'inverse de la fréquence, si bien que la bande qui va le plus loin est aussi celle qui demeure le plus longtemps. Ce réglage commande du même geste la finesse du tri, un résonateur à deux pôles n'ayant qu'une seule commande pour sa largeur et sa durée : bref, le son garde son grain ; long, il se change en bandes tenues.\n\n« Mix » est la part du son trié. Une courbe branchée sur l'entrée « Modulation » prend sa place : « Modulation min » et « Modulation max » disent alors ce que valent le zéro et le un de cette courbe, et « Mix » cesse d'agir. La courbe est lue sur la durée de l'entrée ; au-delà, sa dernière valeur tient pour toute la queue de résonance.\n\nL'entrée est sommée en une voie avant le tri : ce composant refait l'image stéréo à partir de la fréquence, et garder celle qu'il reçoit ferait tenir deux images à la fois sur la même sortie.\n\nLa sortie est plus longue que l'entrée : le trajet le plus long et la résonance la plus longue s'ajoutent après la fin du son. Le niveau du son trié est ramené à celui de l'entrée. Le message donne le nombre de bandes retenues, l'écart de trajet entre les deux bords et le temps de résonance du grave.",
    noticeEn: "This node lays the frequencies of a sound across stereo space: each band comes out of its own direction, arrives at its own moment, and goes on ringing where it stopped.\n\nAfter rainbow trapping, proposed in optics by Kosmas L. Tsakmakidis, Allan D. Boardman and Ortwin Hess, « 'Trapped rainbow' storage of light in metamaterials », Nature 450, 2007, pp. 397-401, and shown in acoustics by Jie Zhu, Yong Chen, Xuefeng Zhu et al., « Acoustic rainbow trapping », Scientific Reports 3, 2013, 1728. In a graded array of resonators a broadband wave slows down and each band halts where the local resonance catches it: the highs early, the lows far. Noé Jiménez, Vicent Romero-García, Vincent Pagneux and Jean-Philippe Groby, « Rainbow-trapping absorbers », Scientific Reports 7, 2017, 13595, draw a broadband absorber from it.\n\n« Bands » is the number of resonators in the array, spread in frequency by equal octaves between « Low » and « High ». Frequencies beyond half the sample rate are dropped.\n\n« Direction » says which side the low end comes out of. « Spread » is the share of the stereo field used: at zero, every band comes from the centre and the sorting is heard in time alone.\n\n« Curve » gathers the gradient towards one edge. At zero the position follows the rank of the band; above, the lows gather on one side and the highs spread out; below, the other way round.\n\n« Dispersion » is the travel of the lowest band, the one that goes furthest. Higher bands arrive earlier, in the order of the gradient. At zero they all arrive together and only the sorting in space remains.\n\n« Trapping » is the time the lowest band takes to lose 60 dB. The array is constant-Q: the ring time follows the inverse of the frequency, so the band that travels furthest is also the one that dwells longest. This setting commands the sharpness of the sorting in the same gesture, a two-pole resonator having a single command for its width and its length: short, the sound keeps its grain; long, it turns into held bands.\n\n« Mix » is the share of the sorted sound. A curve connected to the « Modulation » input takes its place: « Modulation min » and « Modulation max » then say what the zero and the one of that curve are worth, and « Mix » stops acting. The curve is read over the length of the input; beyond that, its last value holds for the whole ring-out.\n\nThe input is summed to one channel before sorting: this node rebuilds the stereo image from frequency, and keeping the one it receives would hold two images at once on the same output.\n\nThe output is longer than the input: the longest travel and the longest resonance come after the end of the sound. The level of the sorted sound is brought back to that of the input. The message gives the number of bands kept, the travel difference between the two edges and the ring time of the low end.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }, portModulation("Mix")],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Bandes", nomEn: "Bands", type: "curseur", plage: [4, 128], pas: 1, defaut: 32,
        doc: "Nombre de résonateurs du banc, répartis par octaves égales entre « Grave » et « Aigu ». Peu de bandes donnent un tri grossier et audible comme tel ; beaucoup donnent un dégradé continu.",
        docEn: "Number of resonators in the array, spread by equal octaves between « Low » and « High ». Few bands give a coarse sorting, heard as such; many give a continuous gradient." },
      { nom: "Grave", nomEn: "Low", type: "curseur", plage: [20, 2000], pas: 1, defaut: 60, unite: "Hz",
        doc: "Bord grave du banc. Rien en dessous n'est trié.",
        docEn: "Low edge of the array. Nothing below it is sorted." },
      { nom: "Aigu", nomEn: "High", type: "curseur", plage: [1000, 20000], pas: 100, defaut: 12000, unite: "Hz",
        doc: "Bord aigu du banc. Une bande au-delà de la moitié de la fréquence d'échantillonnage est écartée.",
        docEn: "High edge of the array. A band beyond half the sample rate is dropped." },
      { nom: "Sens", nomEn: "Direction", type: "choix",
        options: ["Grave à gauche", "Grave à droite"], optionsEn: ["Low on the left", "Low on the right"],
        optionIds: ["grave-gauche", "grave-droite"], defaut: "Grave à gauche", defautEn: "Low on the left",
        doc: "De quel côté sort la bande la plus grave ; l'aigu sort de l'autre.",
        docEn: "Which side the lowest band comes out of; the high end comes out of the other." },
      { nom: "Ouverture", nomEn: "Spread", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Part de l'étendue stéréo employée. À zéro, toutes les bandes sortent du centre et le tri ne s'entend plus que dans le temps.",
        docEn: "Share of the stereo field used. At zero, every band comes from the centre and the sorting is heard in time alone." },
      { nom: "Courbure", nomEn: "Curve", type: "curseur", plage: [-100, 100], pas: 1, defaut: 0,
        doc: "Resserrement du gradient vers un bord. À zéro, la position suit le rang de la bande ; au-dessus, les graves se rassemblent d'un côté ; en dessous, ce sont les aigus.",
        docEn: "Gathering of the gradient towards one edge. At zero the position follows the rank of the band; above, the lows gather on one side; below, the highs do." },
      { nom: "Dispersion", nomEn: "Dispersion", type: "curseur", plage: [0, 2], pas: 0.01, defaut: 0.25, unite: "s",
        doc: "Trajet de la bande la plus grave, celle qui va le plus loin. Les bandes plus aiguës arrivent plus tôt. À zéro, toutes arrivent ensemble.",
        docEn: "Travel of the lowest band, the one that goes furthest. Higher bands arrive earlier. At zero they all arrive together." },
      { nom: "Piégeage", nomEn: "Trapping", type: "curseur", plage: [0.01, 5], pas: 0.01, defaut: 0.3, unite: "s",
        doc: "Temps que la bande la plus grave met à perdre 60 dB. Le banc étant à Q constant, les bandes aiguës résonnent d'autant moins. Ce réglage commande du même geste la finesse du tri : bref, le son garde son grain ; long, il se change en bandes tenues.",
        docEn: "Time the lowest band takes to lose 60 dB. The array being constant-Q, high bands ring proportionally less. This setting commands the sharpness of the sorting in the same gesture: short, the sound keeps its grain; long, it turns into held bands." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Part du son trié. À 0 %, l'entrée seule.",
        docEn: "Share of the sorted sound. At 0%, the input alone." },
      ...bornesModulation(MODULATION_MIX),
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) {
        return { valeurs: [null], message: en() ? "No audio input." : "Aucune entrée audio." };
      }
      const o = {
        bandes: ctx.paramNombre("Bandes", 32),
        grave: ctx.paramNombre("Grave", 60),
        aigu: ctx.paramNombre("Aigu", 12000),
        sens: String(ctx.paramTexte("Sens", "grave-gauche")) === "grave-droite"
          ? "grave-droite" as const : "grave-gauche" as const,
        ouverture: ctx.paramNombre("Ouverture", 100),
        courbure: ctx.paramNombre("Courbure", 0),
        dispersion: ctx.paramNombre("Dispersion", 0.25),
        piegeage: ctx.paramNombre("Piégeage", 0.3),
        // LA COURBE EST LUE SUR LA LONGUEUR DE L'ENTRÉE, non sur celle de la sortie, qui la
        // dépasse du plus long trajet et de la plus longue résonance : une courbe étirée sur la
        // queue ne correspondrait plus au son que l'on voit.
        mix: reglageModule(ctx, a.length, 1, { reglage: "Mix", rendu: "pourCent" }),
      };
      const y = arcEnCiel(a, o);
      const gardees = bandesArcEnCiel(o).filter((b) => b.frequence < a.sampleRate * 0.49);
      const ecart = gardees.length > 0
        ? Math.max(...gardees.map((b) => b.retard)) - Math.min(...gardees.map((b) => b.retard))
        : 0;
      const t60Grave = gardees.length > 0 ? gardees[0].t60 : 0;
      const nombre = (v: number) => (en() ? v.toFixed(2) : v.toFixed(2).replace(".", ","));
      return { valeurs: [y], message: en()
        ? `${gardees.length} bands · ${nombre(ecart)} s of travel · ${nombre(t60Grave)} s of ring`
        : `${gardees.length} bandes · ${nombre(ecart)} s de trajet · ${nombre(t60Grave)} s de résonance` };
    },
  },
] as FicheAudio[]).map(avecDoc);
