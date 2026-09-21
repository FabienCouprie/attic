// plugins/spectral-wishart.ts — Quatre mises en forme du spectre, d'après Trevor Wishart.
//
// D'après « Audible Design » (1994) et les programmes du Composers Desktop Project. La logique est
// dans `audio/spectral-wishart.ts`, testée ; ce fichier n'est que la prise.
//
// POURQUOI LES QUATRE SONT ENSEMBLE : ils partagent l'analyse, le recollement et la taille de
// trame. Le réglage « Finesse » veut dire la même chose pour les quatre, et une seule explication
// sert aux quatre notices.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import {
  SAUT, TAILLE_TRAME, analyser, flouter, geler, glissandoInterieur, recoller, tracer,
} from "../audio/spectral-wishart";

/** Le réglage commun aux quatre : ce que l'analyse voit du temps et de la fréquence. */
const FINESSE = {
  nom: "Finesse", nomEn: "Resolution", type: "choix" as const,
  options: ["Fine en temps (1024)", "Ordinaire (2048)", "Fine en fréquence (4096)", "Très fine (8192)"],
  optionsEn: ["Sharp in time (1024)", "Ordinary (2048)", "Sharp in frequency (4096)", "Very sharp (8192)"],
  optionIds: ["1024", "2048", "4096", "8192"],
  defaut: "Ordinaire (2048)", defautEn: "Ordinary (2048)",
  doc: "Taille de la fenêtre d'analyse, en échantillons. Le choix est un arbitrage, et il n'a pas de bonne réponse : une fenêtre courte situe bien les instants et distingue mal les fréquences voisines ; une fenêtre longue fait l'inverse. À 44 100 Hz, 1024 échantillons voient 23 ms et séparent 43 Hz ; 8192 voient 186 ms et séparent 5 Hz. Sur une voix ou une percussion, prenez court ; sur une nappe ou un accord à démêler, prenez long.",
  docEn: "Analysis window size, in samples. The choice is a trade-off with no right answer: a short window places moments well and separates neighbouring frequencies badly; a long window does the opposite. At 44,100 Hz, 1024 samples see 23 ms and separate 43 Hz; 8192 see 186 ms and separate 5 Hz. On a voice or a percussion, go short; on a pad or a chord to untangle, go long.",
};

const tailleDe = (ctx: any): number => {
  const t = parseInt(ctx.paramTexte("Finesse", "2048"), 10);
  return Number.isFinite(t) && t >= 256 ? t : TAILLE_TRAME;
};

/**
 * Applique une transformation de trames à chaque canal, et rend un tampon de même forme.
 *
 * LE SON EST PROLONGÉ D'UNE TRAME DE SILENCE DE CHAQUE CÔTÉ avant l'analyse, puis rogné. Sans cela,
 * les premiers et derniers échantillons ne sont couverts que par le bord d'une seule fenêtre, dont
 * le poids tend vers zéro ; le recollement divise par ce poids, ce qui est exact tant que la trame
 * n'est pas modifiée, et explose dès qu'elle l'est. Mesuré avant correction, aux bords seulement :
 * une crête de 21 au traçage, de 86 au flou, de 465 au gel — pour un son qui culmine à 0,5.
 */
function parCanal(entree: AudioBuffer, taille: number, transformer: (t: ReturnType<typeof analyser>) => ReturnType<typeof analyser>): AudioBuffer {
  const saut = Math.max(1, Math.round(taille / (TAILLE_TRAME / SAUT)));
  const sortie = new AudioBuffer({
    numberOfChannels: entree.numberOfChannels, length: entree.length, sampleRate: entree.sampleRate,
  });
  const n = entree.length;
  for (let c = 0; c < entree.numberOfChannels; c++) {
    const prolonge = new Float32Array(n + 2 * taille);
    prolonge.set(entree.getChannelData(c), taille);
    const trames = analyser(prolonge, taille, saut);
    const recolle = recoller(transformer(trames), prolonge.length, taille, saut);
    sortie.getChannelData(c).set(recolle.subarray(taille, taille + n));
  }
  return sortie;
}

const melanger = (sec: AudioBuffer, mouille: AudioBuffer, part: number): AudioBuffer => {
  if (part >= 1) return mouille;
  for (let c = 0; c < mouille.numberOfChannels; c++) {
    const a = sec.getChannelData(Math.min(c, sec.numberOfChannels - 1));
    const b = mouille.getChannelData(c);
    for (let i = 0; i < b.length; i++) b[i] = a[i] * (1 - part) + b[i] * part;
  }
  return mouille;
};

const MIX = {
  nom: "Mix", nomEn: "Mix", type: "curseur" as const, plage: [0, 100] as [number, number], pas: 1, defaut: 100, unite: "%",
  doc: "Proportion de son traité. À 0 %, la sortie est le son d'entrée, inchangé.",
  docEn: "Proportion of processed sound. At 0 %, the output is the input, unchanged.",
};

const sansEntree = () => ({ valeurs: [null], message: traduire("msg.aucune_entr_e") });

export const fiches: FicheAudio[] = ([
  {
    id: "tracage-spectral", nom: "Traçage spectral", nomEn: "Spectral Tracing",
    univers: "Traitement", famille: "Effets",
    resume: "Ne garde que les partiels les plus forts de chaque instant : un son complexe devient quelques lignes qui se tressent.",
    resumeEn: "Keeps only the loudest partials of each moment: a complex sound becomes a few interweaving lines.",
    notice: "D'après Trevor Wishart, « Audible Design » (1994), et le programme `spec trace` du Composers Desktop Project.\n\nÀ chaque instant, le son est décomposé en quelques centaines de composantes, et ce nœud ne garde que les plus fortes. Ce n'est pas un filtre, et la différence est ce qui rend le procédé intéressant : un filtre garde une région du spectre décidée d'avance, la même du début à la fin ; le traçage garde ce qui est fort, où que cela se trouve, et son choix change à chaque instant. Il suit donc le son au lieu de le découper.\n\nÀ une seule composante gardée, on entend le partiel dominant se déplacer — une mélodie que le son contenait sans qu'on l'entende, et que rien d'autre ne fait sortir. À une soixantaine, on entend le son débarrassé de son bruit de fond. Entre les deux, on entend des lignes se tresser : c'est ce que Wishart appelle tracer.",
    noticeEn: "After Trevor Wishart, « Audible Design » (1994), and the Composers Desktop Project's `spec trace`.\n\nAt every moment the sound is broken into a few hundred components, and this node keeps only the loudest. It is not a filter, and the difference is what makes the process interesting: a filter keeps a region of the spectrum decided in advance, the same from start to finish; tracing keeps what is loud, wherever it sits, and its choice changes at every moment. It follows the sound instead of cutting it up.\n\nWith a single component kept, one hears the dominant partial moving — a melody the sound contained without one hearing it, and that nothing else brings out. With sixty or so, one hears the sound stripped of its background noise. In between, one hears lines interweaving: this is what Wishart calls tracing.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Composantes", nomEn: "Components", type: "curseur", plage: [1, 200], pas: 1, defaut: 12,
        doc: "Nombre de composantes gardées à chaque instant. À 1, le partiel dominant seul. Au-delà d'une centaine, l'effet devient difficile à entendre sur la plupart des sons : il n'y a plus grand-chose à jeter.",
        docEn: "Number of components kept at each moment. At 1, the dominant partial alone. Beyond a hundred or so the effect becomes hard to hear on most sounds: there is not much left to throw away." },
      FINESSE, MIX,
    ],
    async executer(ctx: any) {
      const e = ctx.entree(0);
      if (!(e instanceof AudioBuffer)) return sansEntree();
      const n = Math.round(ctx.paramNombre("Composantes", 12));
      const out = parCanal(e, tailleDe(ctx), (t) => tracer(t, n));
      return { valeurs: [melanger(e, out, ctx.paramNombre("Mix", 100) / 100)] };
    },
  },
  {
    id: "flou-spectral", nom: "Flou spectral", nomEn: "Spectral Blur",
    univers: "Traitement", famille: "Effets",
    resume: "Moyenne le spectre sur plusieurs instants voisins : le son s'étale dans le temps sans changer de durée.",
    resumeEn: "Averages the spectrum over neighbouring moments: the sound spreads out in time without changing duration.",
    notice: "D'après Trevor Wishart, « Audible Design » (1994), et le programme `blur blur` du Composers Desktop Project.\n\nCe que ce n'est pas : un étirement. Paulstretch et le vocodeur de phase allongent la durée, donc déplacent tout ce qui suit. Ici la fin arrive à l'heure — mais on ne sait plus quand les choses ont commencé. C'est un flou au sens photographique : le bougé, pas le ralenti.\n\nUne attaque devient une montée. Une note qui change de hauteur devient un accord tenu, les deux hauteurs se recouvrant. Un texte parlé perd ses consonnes et garde ses voyelles. Plus la largeur est grande, plus loin le son déborde de lui-même.\n\nLes phases ne sont pas moyennées, seulement les énergies : les phases portent le grain du son, et les mêler rendrait un signal sans relief.",
    noticeEn: "After Trevor Wishart, « Audible Design » (1994), and the Composers Desktop Project's `blur blur`.\n\nWhat it is not: a stretch. Paulstretch and the phase vocoder lengthen the duration, hence move everything that follows. Here the end arrives on time — but one no longer knows when things began. It is a blur in the photographic sense: motion blur, not slow motion.\n\nAn attack becomes a swell. A note that changes pitch becomes a held chord, the two pitches overlapping. Spoken text loses its consonants and keeps its vowels. The wider the setting, the further the sound spills beyond itself.\n\nPhases are not averaged, only energies: phases carry the grain of the sound, and mixing them would give a signal with no relief.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Largeur", nomEn: "Width", type: "curseur", plage: [1, 200], pas: 1, defaut: 24,
        doc: "Nombre d'instants moyennés. À 1, rien ne change. La durée que cela représente dépend de la finesse : à 2048 et 44 100 Hz, un instant vaut 12 ms, donc 24 instants étalent le son sur environ trois dixièmes de seconde.",
        docEn: "Number of moments averaged. At 1, nothing changes. How long that is depends on the resolution: at 2048 and 44,100 Hz one moment is 12 ms, so 24 moments spread the sound over roughly three tenths of a second." },
      FINESSE, MIX,
    ],
    async executer(ctx: any) {
      const e = ctx.entree(0);
      if (!(e instanceof AudioBuffer)) return sansEntree();
      const w = Math.round(ctx.paramNombre("Largeur", 24));
      const out = parCanal(e, tailleDe(ctx), (t) => flouter(t, w));
      return { valeurs: [melanger(e, out, ctx.paramNombre("Mix", 100) / 100)] };
    },
  },
  {
    id: "gel-spectral", nom: "Gel spectral", nomEn: "Spectral Freeze",
    univers: "Traitement", famille: "Effets",
    resume: "Tient le spectre d'un instant pour toute la suite : une immobilité, et non une boucle.",
    resumeEn: "Holds one moment's spectrum for all that follows: a stillness, not a loop.",
    notice: "D'après Trevor Wishart, « Audible Design » (1994), et le programme `blur freeze` du Composers Desktop Project.\n\nEn quoi cela diffère du gel granulaire, déjà présent dans Attic. Celui-là boucle un morceau de signal : on entend la boucle, sa période et ses raccords, et le son garde le grain du bout qu'on a pris. Ici on tient une analyse — les énergies sont celles de l'instant choisi, mais les phases continuent d'avancer comme si le son se prolongeait. Il n'y a donc ni période, ni raccord, ni battement : le son ne bouge plus du tout.\n\nC'est la différence entre arrêter un disque sur un sillon et arrêter le temps. Ce qui précède l'instant choisi passe intact ; à partir de là, le son se fige et tient jusqu'à la fin.",
    noticeEn: "After Trevor Wishart, « Audible Design » (1994), and the Composers Desktop Project's `blur freeze`.\n\nHow it differs from the granular freeze already in Attic. That one loops a piece of signal: one hears the loop, its period and its joins, and the sound keeps the grain of the fragment taken. Here an analysis is held — the energies are those of the chosen moment, but the phases keep advancing as though the sound went on. So there is no period, no join, no beating: the sound stops moving entirely.\n\nIt is the difference between stopping a record on a groove and stopping time. What precedes the chosen moment passes through untouched; from there on the sound freezes and holds to the end.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Instant", nomEn: "Moment", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Où le gel commence, en proportion de la durée. Ce qui précède passe inchangé ; à partir de là, le spectre de cet instant est tenu jusqu'à la fin.",
        docEn: "Where the freeze begins, as a proportion of the duration. What precedes passes through unchanged; from there on, that moment's spectrum is held to the end." },
      FINESSE, MIX,
    ],
    async executer(ctx: any) {
      const e = ctx.entree(0);
      if (!(e instanceof AudioBuffer)) return sansEntree();
      const part = Math.max(0, Math.min(1, ctx.paramNombre("Instant", 50) / 100));
      const taille = tailleDe(ctx);
      const saut = Math.max(1, Math.round(taille / (TAILLE_TRAME / SAUT)));
      const out = parCanal(e, taille, (t) => geler(t, Math.round(part * (t.length - 1)), taille, saut));
      return { valeurs: [melanger(e, out, ctx.paramNombre("Mix", 100) / 100)] };
    },
  },
  {
    id: "glissando-interieur", nom: "Glissando intérieur", nomEn: "Inner Glissando",
    univers: "Traitement", famille: "Effets",
    resume: "Garde l'enveloppe de formants du son et met dessous un glissando sans fin : l'illusion de Risset, habillée d'un timbre réel.",
    resumeEn: "Keeps the sound's formant envelope and puts an endless glissando underneath: Risset's illusion, dressed in a real timbre.",
    notice: "D'après Trevor Wishart, « Audible Design » (1994), qui l'appelle « inner glissando ». L'illusion elle-même vient de Roger Shepard (1964), rendue continue par Jean-Claude Risset.\n\nCe que ce nœud ajoute au « Glissando de Risset » déjà présent. Celui-là produit l'illusion nue — un son de synthèse qui monte sans fin, et qui sonne comme une démonstration de laboratoire. Ici l'illusion passe par la bouche de quelqu'un : l'enveloppe de formants du son d'entrée est conservée, et c'est elle qui décide du timbre. Une voyelle reste la même voyelle pendant que la hauteur monte sans fin.\n\nPourquoi cela marche. L'enveloppe de formants est ce qui fait qu'une voyelle est un « a » ou un « ou » : elle ne dépend pas de la hauteur à laquelle on chante. C'est précisément pour cela qu'on peut changer l'une sans toucher à l'autre. Le nœud extrait cette enveloppe en lissant le spectre — les bosses larges survivent, les raies fines disparaissent — puis pose dessous des partiels espacés d'une octave dont l'amplitude suit une cloche fixe : chacun naît en bas, traverse, s'éteint en haut, et l'on ne surprend jamais ni son apparition ni sa disparition.",
    noticeEn: "After Trevor Wishart, « Audible Design » (1994), who calls it « inner glissando ». The illusion itself is Roger Shepard's (1964), made continuous by Jean-Claude Risset.\n\nWhat this node adds to the « Risset Glissando » already present. That one produces the illusion bare — a synthetic sound rising endlessly, which sounds like a laboratory demonstration. Here the illusion passes through someone's mouth: the input's formant envelope is kept, and it decides the timbre. A vowel stays the same vowel while the pitch rises without end.\n\nWhy it works. The formant envelope is what makes a vowel an « ah » or an « oo »: it does not depend on the pitch one sings at. That is exactly why one can change one without touching the other. The node extracts that envelope by smoothing the spectrum — broad bumps survive, fine lines vanish — then places beneath it partials an octave apart whose amplitude follows a fixed bell: each is born low, crosses, dies high, and one never catches either its appearance or its disappearance.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Vitesse", nomEn: "Speed", type: "curseur", plage: [-4, 4], pas: 0.1, defaut: 0.5, unite: "oct/s",
        doc: "Octaves par seconde. Positif : cela monte sans fin. Négatif : cela descend. À zéro, les partiels restent en place et l'on entend le timbre du son posé sur un accord d'octaves.",
        docEn: "Octaves per second. Positive: it rises endlessly. Negative: it falls. At zero the partials stay put and one hears the sound's timbre laid over a stack of octaves." },
      { nom: "Octaves", nomEn: "Octaves", type: "curseur", plage: [3, 10], pas: 1, defaut: 6,
        doc: "Nombre d'octaves que l'illusion empile. En dessous de trois, la cloche est trop étroite et l'on entend les partiels apparaître : l'illusion se défait.",
        docEn: "How many octaves the illusion stacks. Below three the bell is too narrow and one hears partials appear: the illusion breaks." },
      { nom: "Lissage", nomEn: "Smoothing", type: "curseur", plage: [0, 80], pas: 1, defaut: 20,
        doc: "Largeur du lissage qui sépare les formants des partiels, en composantes. Trop peu, et les partiels du son d'origine survivent, ce qui brouille le glissando. Trop, et l'enveloppe s'aplatit : le timbre disparaît et l'on retombe sur l'illusion nue.",
        docEn: "Width of the smoothing that separates formants from partials, in components. Too little and the original's partials survive, blurring the glissando. Too much and the envelope flattens: the timbre vanishes and one falls back on the bare illusion." },
      FINESSE, MIX,
    ],
    async executer(ctx: any) {
      const e = ctx.entree(0);
      if (!(e instanceof AudioBuffer)) return sansEntree();
      const taille = tailleDe(ctx);
      const saut = Math.max(1, Math.round(taille / (TAILLE_TRAME / SAUT)));
      const o = {
        vitesse: ctx.paramNombre("Vitesse", 0.5),
        octaves: Math.round(ctx.paramNombre("Octaves", 6)),
        lissage: Math.round(ctx.paramNombre("Lissage", 20)),
        taille, saut, frequence: e.sampleRate,
      };
      const out = parCanal(e, taille, (t) => glissandoInterieur(t, o));
      return { valeurs: [melanger(e, out, ctx.paramNombre("Mix", 100) / 100)] };
    },
  },
] as FicheAudio[]).map(avecDoc);
