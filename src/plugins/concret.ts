// plugins/concret.ts — Vitesse variable, convolution de deux sons, résonateurs.
//
// Les trois outils de la musique concrète qui manquaient au catalogue (relevé du 2026-09-21, pour
// un compositeur électroacousticien). Le calcul est dans `audio/concret.ts`.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { estCourbe, valeursParametre, progressionPour } from "../audio/courbe";
import {
  convoluerDeuxSons, rapportsDeVitesse, rapportsResonateurs, resonateurs, vitesseVariable,
  type StructureResonateurs,
} from "../audio/concret";

const en = () => langueCourante() === "en";
const aucuneEntree = () => (en() ? "No audio input." : "Aucune entrée audio.");

/** « 0 4 7 », « 0, 3, 7, 10 » ou « 0;5;7 » : des demi-tons, dans n'importe quel ordre. */
export function lireIntervalles(texte: string): number[] {
  return texte.split(/[\s,;]+/).filter((t) => t !== "").map(Number).filter((v) => Number.isFinite(v) && Math.abs(v) <= 96);
}

export const fiches: FicheAudio[] = ([
  {
    id: "vitesse-variable", nom: "Vitesse variable", nomEn: "Varispeed",
    univers: "Traitement", famille: "Effets",
    resume: "La bande qu'on accélère ou qu'on freine : hauteur et durée liées, pilotables par une courbe.",
    resumeEn: "The tape you speed up or slow down: pitch and duration tied together, drivable by a curve.",
    notice: "Ce composant change la vitesse de lecture d'un son, comme on accélère ou ralentit une bande : la hauteur et la durée bougent ensemble. Une octave plus haut, le son dure deux fois moins ; une octave plus bas, deux fois plus, et son grain se révèle. C'est ainsi que Pierre Schaeffer transposait ses disques et ses bandes.\n\nLa vitesse peut rester fixe, ou évoluer : une courbe branchée sur l'entrée Modulation transposition dessine alors le geste : accélérer une chute, freiner une résonance jusqu'au grave, faire glisser un son vers l'aigu comme un disque qu'on lance.\n\nLa courbe suit la source, et non la sortie. Son début agit sur le début du son d'origine, sa fin sur sa fin : on écrit un geste posé sur le matériau, et la durée de la sortie en découle.\n\nLa course se parcourt en demi-tons, c'est-à-dire en multipliant la vitesse : de −12 à +12, le milieu de la courbe rend la vitesse d'origine, et chaque octave dure autant sur la courbe. C'est ainsi que l'oreille entend une transposition.\n\nAccélérer ne replie pas les aigus. Poussé deux octaves plus haut, un son à 8 kHz monterait à 32 kHz, au-delà de ce qu'un fichier peut contenir ; une lecture naïve le ferait réapparaître à 12 kHz, un son qui n'existait nulle part. La bande, elle, ne replie pas : la lecture filtre donc à mesure qu'elle accélère. À zéro demi-ton, la source est rendue exactement, échantillon pour échantillon.",
    noticeEn: "This node changes the playback speed of a sound, as one speeds up or slows down a tape: pitch and duration move together. An octave up, the sound lasts half as long; an octave down, twice as long, and its grain comes out. It is how Pierre Schaeffer transposed his discs and tapes.\n\nThe speed can stay fixed, or move: a curve connected to the Transposition modulation input then draws the gesture: speeding up a fall, braking a resonance down into the bass, sliding a sound upwards like a record being spun.\n\nThe curve follows the source, not the output. Its start acts on the start of the original sound, its end on its end: one writes a gesture laid on the material, and the output duration follows from it.\n\nThe travel is in semitones, that is by multiplying the speed: from -12 to +12, the middle of the curve gives back the original speed, and every octave lasts as long on the curve. That is how the ear hears a transposition.\n\nSpeeding up does not fold the highs back. Pushed two octaves up, an 8 kHz sound would rise to 32 kHz, beyond what a file can hold; a naive reading would make it reappear at 12 kHz, a sound that existed nowhere. Tape does not fold back: the reading therefore filters as it speeds up. At zero semitones the source is returned exactly, sample for sample.",
    entrees: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Modulation transposition", nomEn: "Transposition modulation", type: "courbe", requis: false, module: "Transposition" },
    ],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      { nom: "Transposition", nomEn: "Transposition", type: "curseur", plage: [-48, 48], pas: 0.1, defaut: -12, unite: "demi-tons", uniteEn: "semitones",
        doc: "De combien la bande est accélérée (positif) ou ralentie (négatif). +12 : une octave plus haut et deux fois plus court ; −12 : une octave plus bas et deux fois plus long. Quatre octaves au plus de chaque côté.",
        docEn: "How much the tape is sped up (positive) or slowed down (negative). +12: an octave up and half as long; -12: an octave down and twice as long. Four octaves at most either way." },
      { nom: "Transposition min", nomEn: "Transposition min", modulationDe: "Transposition", type: "curseur", plage: [-48, 48], pas: 0.1, defaut: -12, unite: "demi-tons", uniteEn: "semitones",
        doc: "Transposition que vaut le zéro d'une courbe branchée. Sans courbe, ce réglage ne sert pas.",
        docEn: "Transposition that a connected curve's zero means. With no curve, this setting does nothing." },
      { nom: "Transposition max", nomEn: "Transposition max", modulationDe: "Transposition", type: "curseur", plage: [-48, 48], pas: 0.1, defaut: 12, unite: "demi-tons", uniteEn: "semitones",
        doc: "Transposition que vaut le un de la courbe.", docEn: "Transposition that the curve's one means." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: aucuneEntree() };
      try {
        const rapports = rapportsDeVitesse(a.length, ctx.paramNombre("Transposition", -12), ctx.entree(1), {
          min: ctx.paramNombre("Transposition min", -12), max: ctx.paramNombre("Transposition max", 12),
        });
        const y = vitesseVariable(a, rapports);
        return { valeurs: [y], message: `${a.duration.toFixed(2)} s → ${y.duration.toFixed(2)} s` };
      } catch (e: any) {
        return { valeurs: [null], message: e?.message ?? String(e) };
      }
    },
  },
  {
    id: "convolution-deux-sons", nom: "Convolution de deux sons", nomEn: "Two-Sound Convolution",
    univers: "Traitement", famille: "Effets",
    resume: "Fait sonner un son par un autre : seules leurs fréquences communes survivent, et leurs durées s'additionnent.",
    resumeEn: "Makes one sound ring through another: only their shared frequencies survive, and their durations add up.",
    notice: "Convoluer, c'est faire sonner un son à travers un autre. C'est ainsi qu'on place un son dans une salle dont on connaît la réponse ; mais le second son peut être n'importe lequel : une voix par un gong, un frottement par une goutte, un accord par un bruit de pas. C'est un outil de base de la composition électroacoustique, du Composers' Desktop Project à SoundHack.\n\nCe qu'on entend. Chaque instant du premier son déclenche une copie entière du second, à son niveau. Deux conséquences, qui décident de tout. Le spectre du résultat est le produit des deux spectres : seules les fréquences communes survivent, les autres s'annulent, un bruit convolué par une note devient cette note, soufflée. Et la durée est la somme des deux : un son long par un son long donne une nappe, un son bref par n'importe quoi rend presque ce n'importe quoi, frappé une fois.\n\nL'opération est symétrique : échanger les deux entrées rend le même son. Ce qui distingue le premier du second n'est que le niveau de sortie, ramené à celui du premier son. Une convolution brute de deux sons à pleine échelle additionne des milliers d'échantillons et sortirait vingt ou quarante décibels trop fort ; rien de musical ne tient à ce chiffre.",
    noticeEn: "To convolve is to make one sound ring through another. It is how a sound is placed in a room whose response is known; but the second sound can be anything at all: a voice through a gong, a scrape through a drop, a chord through footsteps. It is a basic tool of electroacoustic composition, from the Composers' Desktop Project to SoundHack.\n\nWhat is heard. Each instant of the first sound triggers a whole copy of the second, at its level. Two consequences decide everything. The spectrum of the result is the product of the two spectra: only the shared frequencies survive, the others cancel: a noise convolved by a note becomes that note, breathed. And the duration is the sum of the two: a long sound through a long sound gives a pad, a short sound through anything gives back nearly that anything, struck once.\n\nThe operation is symmetric: swapping the two inputs gives the same sound. What tells the first from the second is only the output level, brought back to that of the first sound. A raw convolution of two full-scale sounds adds up thousands of samples and would come out twenty or forty decibels too loud; nothing musical hangs on that figure.",
    entrees: [
      { nom: "Son", nomEn: "Sound", type: "audio" },
      { nom: "Second son", nomEn: "Second sound", type: "audio" },
    ],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Part du son convolué. À 0 %, le premier son seul, inchangé ; entre les deux, le son et ce qu'il devient se superposent.",
        docEn: "Share of the convolved sound. At 0%, the first sound alone, unchanged; in between, the sound and what it becomes overlap." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0), b = ctx.entree(1);
      if (!(a instanceof AudioBuffer) || !(b instanceof AudioBuffer)) {
        return { valeurs: [null], message: en() ? "Two sounds are needed." : "Il faut deux sons." };
      }
      try {
        const y = await convoluerDeuxSons(a, b, ctx.paramNombre("Mix", 100));
        return { valeurs: [y], message: `${a.duration.toFixed(2)} s + ${b.duration.toFixed(2)} s → ${y.duration.toFixed(2)} s` };
      } catch (e: any) {
        return { valeurs: [null], message: e?.message ?? String(e) };
      }
    },
  },
  {
    id: "resonateurs", nom: "Résonateurs", nomEn: "Resonators",
    univers: "Traitement", famille: "Effets",
    memoire: "flux", // filtres récursifs, état dans deux scalaires par résonateur
    resume: "Un banc de résonateurs accordés, que n'importe quel son fait sonner : un bruit devient un accord, un frottement une cloche.",
    resumeEn: "A bank of tuned resonators that any sound can set ringing: a noise becomes a chord, a scrape a bell.",
    notice: "Ce composant fait passer un son dans un banc de résonateurs accordés. Chaque résonateur ne garde de ce qu'il reçoit que sa propre fréquence, et continue de sonner après qu'on a cessé de l'exciter : le son d'entrée prend l'accord du banc. Un souffle devient un accord tenu, une pluie de clics une harmonie qui scintille, un frottement une cloche. Le principe est celui de l'outil Reson des GRM Tools et des resonators~ de Max.\n\nLe banc ne joue rien de lui-même : c'est le son d'entrée qui le fait sonner, et ce qu'on entend dépend autant de ce son que de l'accord des résonateurs.\n\nLa résonance se règle en secondes, comme on la pense : le temps qu'il faut à un résonateur pour perdre 60 dB après qu'on a cessé de l'exciter. Brève, le son garde son grain et se colore ; longue, il s'efface derrière l'accord qu'il a fait sonner. Une queue de cette durée est ajoutée à la sortie, pour qu'on entende les résonateurs s'éteindre après la fin du son.\n\nLa structure dit où sont les résonateurs au-dessus de la fondamentale : harmonique (1, 2, 3…), impaire (1, 3, 5…, le spectre d'une clarinette ou d'un tuyau fermé), barre (1 ; 2,756 ; 5,404 ; 8,933…, les modes d'une barre libre, inharmoniques, métalliques), ou accord, d'après les intervalles écrits, répétés d'octave en octave.\n\nLa fondamentale se pilote par une courbe : les résonances glissent alors, et le son d'entrée les suit. Le niveau de sortie est ramené à celui de l'entrée.",
    noticeEn: "This node passes a sound through a bank of tuned resonators. Each resonator keeps only its own frequency from what it receives, and goes on ringing once it is no longer excited: the input sound takes on the bank's chord. A breath becomes a held chord, a rain of clicks a shimmering harmony, a scrape a bell. The principle is that of the Reson tool of GRM Tools and of Max's resonators~.\n\nThe bank plays nothing by itself: the input sound sets it ringing, and what one hears depends as much on that sound as on how the resonators are tuned.\n\nResonance is set in seconds, the way one thinks of it: the time a resonator takes to lose 60 dB once it is no longer excited. Short, the sound keeps its grain and takes on a colour; long, it fades behind the chord it set ringing. A tail of that length is added to the output, so the resonators can be heard dying away after the sound ends.\n\nThe structure says where the resonators sit above the fundamental: harmonic (1, 2, 3...), odd (1, 3, 5..., the spectrum of a clarinet or a closed pipe), bar (1; 2.756; 5.404; 8.933..., the modes of a free bar, inharmonic, metallic), or chord, from the intervals written, repeated octave after octave.\n\nThe fundamental can be driven by a curve: the resonances then glide, and the input sound follows them. The output level is brought back to that of the input.",
    entrees: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Modulation fondamentale", nomEn: "Fundamental modulation", type: "courbe", requis: false, module: "Fondamentale" },
    ],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      { nom: "Fondamentale", nomEn: "Fundamental", type: "curseur", plage: [20, 4000], pas: 1, defaut: 110, unite: "Hz",
        doc: "Fréquence du premier résonateur ; les autres s'en déduisent par la structure. Un résonateur qui tomberait au-delà de la moitié de la fréquence d'échantillonnage est écarté, et non replié.",
        docEn: "Frequency of the first resonator; the others follow from it through the structure. A resonator that would fall beyond half the sample rate is dropped, not folded back." },
      { nom: "Structure", nomEn: "Structure", type: "choix", options: ["Harmonique", "Impaire", "Barre", "Accord"], optionIds: ["harmonique", "impaire", "barre", "accord"],
        optionsEn: ["Harmonic", "Odd", "Bar", "Chord"], defaut: "Harmonique", defautEn: "Harmonic",
        doc: "Où sont les résonateurs au-dessus de la fondamentale. Harmonique : 1, 2, 3… ; impaire : 1, 3, 5… ; barre : les modes inharmoniques d'une barre libre ; accord : les intervalles écrits ci-dessous.",
        docEn: "Where the resonators sit above the fundamental. Harmonic: 1, 2, 3...; odd: 1, 3, 5...; bar: the inharmonic modes of a free bar; chord: the intervals written below." },
      { nom: "Intervalles", nomEn: "Intervals", type: "texte", defaut: "0 4 7 11", placeholder: "0 4 7 11", placeholderEn: "0 4 7 11",
        doc: "Pour la structure accord : les intervalles en demi-tons au-dessus de la fondamentale, séparés par des espaces ou des virgules. Ils se répètent d'octave en octave jusqu'au nombre de résonateurs. « 0 4 7 11 » : un accord de septième majeure ; « 0 1 6 » : une grappe tendue.",
        docEn: "For the chord structure: the intervals in semitones above the fundamental, separated by spaces or commas. They repeat octave after octave up to the number of resonators. « 0 4 7 11 »: a major seventh chord; « 0 1 6 »: a tense cluster." },
      { nom: "Nombre", nomEn: "Count", type: "curseur", plage: [1, 32], pas: 1, defaut: 12,
        doc: "Nombre de résonateurs.", docEn: "Number of resonators." },
      { nom: "Résonance", nomEn: "Resonance", type: "curseur", plage: [0.05, 20], pas: 0.05, defaut: 3, unite: "s",
        doc: "Temps qu'il faut à un résonateur pour perdre 60 dB. Bref, le son se colore ; long, il s'efface derrière l'accord.",
        docEn: "Time a resonator takes to lose 60 dB. Short, the sound takes on a colour; long, it fades behind the chord." },
      { nom: "Brillance", nomEn: "Brightness", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Niveau des résonateurs aigus par rapport aux graves. 100 % : tous au même niveau ; 0 % : le k-ième à 1/k², un son sombre.",
        docEn: "Level of the high resonators relative to the low ones. 100%: all at the same level; 0%: the k-th at 1/k², a dark sound." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Part du son résonné. À 0 %, l'entrée seule.", docEn: "Share of the resonated sound. At 0%, the input alone." },
      { nom: "Fondamentale min", nomEn: "Fundamental min", modulationDe: "Fondamentale", type: "curseur", plage: [20, 4000], pas: 1, defaut: 55, unite: "Hz",
        doc: "Fondamentale que vaut le zéro d'une courbe branchée. La course se parcourt en multipliant, comme toute fréquence. Sans courbe, ce réglage ne sert pas.",
        docEn: "Fundamental that a connected curve's zero means. The travel is multiplicative, as for any frequency. With no curve, this setting does nothing." },
      { nom: "Fondamentale max", nomEn: "Fundamental max", modulationDe: "Fondamentale", type: "curseur", plage: [20, 4000], pas: 1, defaut: 440, unite: "Hz",
        doc: "Fondamentale que vaut le un de la courbe.", docEn: "Fundamental that the curve's one means." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: aucuneEntree() };
      const structure = String(ctx.paramTexte("Structure", "harmonique")).toLowerCase() as StructureResonateurs;
      const fondamentale = ctx.paramNombre("Fondamentale", 110);
      const t60 = ctx.paramNombre("Résonance", 3);
      const courbe = ctx.entree(1);
      const n = a.length + Math.round(Math.min(20, Math.max(0.01, t60)) * a.sampleRate);
      const fondamentales = estCourbe(courbe)
        ? valeursParametre(courbe, n, fondamentale, {
            min: ctx.paramNombre("Fondamentale min", 55), max: ctx.paramNombre("Fondamentale max", 440),
            ...progressionPour({ unite: "Hz" }),
          })
        : null;
      const rapports = rapportsResonateurs(
        ["harmonique", "impaire", "barre", "accord"].includes(structure) ? structure : "harmonique",
        ctx.paramNombre("Nombre", 12), lireIntervalles(ctx.paramTexte("Intervalles", "0 4 7 11")),
      );
      const y = resonateurs(a, {
        fondamentale, rapports, t60, fondamentales,
        brillance: ctx.paramNombre("Brillance", 50), mix: ctx.paramNombre("Mix", 100),
      });
      const audibles = rapports.filter((r) => fondamentale * r < a.sampleRate * 0.49).length;
      return { valeurs: [y], message: en()
        ? `${audibles} resonators, ${t60} s`
        : `${audibles} résonateurs, ${String(t60).replace(".", ",")} s` };
    },
  },
] as FicheAudio[]).map(avecDoc);
