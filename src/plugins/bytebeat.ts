// plugins/bytebeat.ts — Une formule d'une ligne, un compteur d'échantillons, un octet par échantillon.
//
// D'après Viznut, 2011. La logique est dans `audio/bytebeat.ts`, testée, avec la filiation, la
// raison de l'analyseur écrit à la main et la précédence du C ; ce fichier n'est que la prise.
//
// UNE FORMULE INVALIDE SE DIT, elle ne rend pas du silence. L'analyseur lève en nommant ce qu'il
// n'a pas su lire, et l'exécuteur le rapporte à l'écran : une formule qui passerait pour jouée en
// ne rendant rien est le pire des deux comportements.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { bornesModulation, modulationNommee, portModulation, reglageModule } from "./effets-aides";
import { FormuleInvalide, bytebeat } from "../audio/bytebeat";
import { frequenceDeTravail } from "../audio/frequence-de-travail";

const VIZNUT = "t*(((t>>12)|(t>>8))&(63&(t>>4)))";

/** Les deux réglages qu'une courbe vient piloter, dans l'ordre de leurs ports. */
const MOD_CADENCE = { ...modulationNommee("Cadence", "Rate", [1000, 48000], "Hz"), echelle: "logarithmique" as const, pas: 100, defauts: [2000, 24000] as [number, number] };
const MOD_VOLUME = { ...modulationNommee("Volume", "Volume", [0, 100], "%"), defauts: [0, 100] as [number, number] };

export const fiches: FicheAudio[] = ([
  {
    id: "bytebeat", nomDicte: "musique par formule", nom: "Bytebeat", nomEn: "Bytebeat",
    univers: "Entrées", famille: "Génération",
    resume: "Calcule un octet par échantillon à partir d'une formule entière sur le compteur du temps.",
    resumeEn: "Computes one byte per sample from an integer formula on the time counter.",
    notice: `Engendre un son en calculant un octet par échantillon, à partir d'une formule entière dont la seule variable est le compteur du temps.

D'après Ville-Matias Heikkilä, dit Viznut, « Algorithmic symphonies from one line of code, how and why? », blog countercomplex, 2 octobre 2011 ; et son analyse, « Discovering novel computer music techniques by exploring the space of short computer programs », arXiv 1112.1368, 6 décembre 2011. La forme d'origine est un programme en C d'une ligne, qui écrit un octet par échantillon dans la sortie audio.

« Formule » est l'expression calculée pour chaque valeur de « t », qui compte les octets depuis le début, à partir de zéro. Les opérateurs sont ceux du C et ils ont sa précédence : « t*5 & t>>7 » se lit donc comme le produit d'abord, le décalage ensuite, et le et binaire en dernier. Sont reconnus le et, le ou, le ou exclusif, les deux décalages, le non binaire, les quatre opérations, le reste, les six comparaisons et le choix à trois termes. Une formule qui porte autre chose est refusée, et le message dit ce qui n'a pas été lu plutôt que de rendre du silence.

« Cadence » est le nombre d'octets par seconde. Huit mille est la valeur d'origine, et ce n'est pas un choix musical : c'était la configuration par défaut des sorties audio en ligne de commande d'où le procédé est né. Elle n'en est pas moins constitutive du son, puisqu'elle décide de la place des composantes repliées par l'échantillonnage : la changer ne transpose pas, elle déplace les intervalles.

Le résultat de la formule est replié sur huit bits, c'est-à-dire ramené entre zéro et 255, et non limité à cette étendue. Ce repli fait le son : il transforme une valeur qui croît en une dent de scie, dont les huit ondes carrées, une par bit, sont ce que l'oreille entend. « Octet » dit comment cet octet se lit, en non signé de zéro à 255 comme à l'origine, ou en signé de moins 128 à 127 comme chez d'autres lecteurs ; les deux donnent deux formes d'onde différentes.

Chaque octet est tenu jusqu'au suivant, sans lissage. Cette tenue en escalier est le son du procédé et non un raccourci : c'est elle qui porte le repliement auquel l'analyse de l'auteur attribue les intervalles.

« Durée » est la longueur rendue, « Volume » le niveau de sortie.

Les entrées « Modulation cadence » et « Modulation volume » prennent la place de leur réglage quand une courbe y est branchée, chacune avec ses deux bornes ; sans courbe, ces bornes ne servent pas. La cadence se parcourt en multipliant, une octave valant un doublement.

La sortie « Audio » porte le son. Le message donne le nombre d'octets calculés, le nombre de valeurs distinctes qu'ils ont prises sur les 256 possibles, et la part du rendu qui tombe au milieu de la course.`,
    noticeEn: `Generates a sound by computing one byte per sample, from an integer formula whose only variable is the time counter.

After Ville-Matias Heikkilä, known as Viznut, « Algorithmic symphonies from one line of code, how and why? », countercomplex blog, 2 October 2011; and his analysis, « Discovering novel computer music techniques by exploring the space of short computer programs », arXiv 1112.1368, 6 December 2011. The original form is a one-line C program that writes one byte per sample to the audio output.

« Formula » is the expression computed for each value of « t », which counts the bytes from the start, beginning at zero. The operators are those of C and they have its precedence: « t*5 & t>>7 » therefore reads as the product first, the shift next, and the bitwise and last. Recognised are the and, the or, the exclusive or, both shifts, the bitwise not, the four operations, the remainder, the six comparisons and the three-term choice. A formula carrying anything else is refused, and the message says what was not read rather than returning silence.

« Rate » is the number of bytes per second. Eight thousand is the original value, and it is not a musical choice: it was the default setting of the command-line audio outputs the method was born on. It is no less a part of the sound for that, since it decides where the components folded back by sampling land: changing it does not transpose, it moves the intervals.

The formula's result is folded onto eight bits, that is brought between zero and 255, and not limited to that range. This folding makes the sound: it turns a growing value into a sawtooth, whose eight square waves, one per bit, are what the ear hears. « Byte » states how that byte is read, unsigned from zero to 255 as in the original, or signed from minus 128 to 127 as in other players; the two give two different waveforms.

Each byte is held until the next one, with no smoothing. That staircase hold is the sound of the method and not a shortcut: it is what carries the folding to which the author's analysis attributes the intervals.

« Duration » is the rendered length, « Volume » the output level.

The « Modulation rate » and « Modulation volume » inputs take the place of their setting when a curve is connected, each with its two bounds; with no curve those bounds do nothing. The rate is traversed by multiplying, an octave being a doubling.

The « Audio » output carries the sound. The message gives the number of bytes computed, how many distinct values they took out of the 256 possible, and the share of the render that falls in the middle of the range.`,
    entrees: [
      portModulation("Cadence", "Rate", { court: false }),
      portModulation("Volume", "Volume", { court: false }),
    ],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Formule", nomEn: "Formula", type: "texte", defaut: VIZNUT, defautEn: VIZNUT,
        doc: "L'expression calculée pour chaque valeur de « t », qui compte les octets depuis le début. Les opérateurs sont ceux du C et ils ont sa précédence. Une formule qui porte autre chose que l'arithmétique entière est refusée, et le message dit ce qui n'a pas été lu.",
        docEn: "The expression computed for each value of « t », which counts the bytes from the start. The operators are those of C and they have its precedence. A formula carrying anything other than integer arithmetic is refused, and the message says what was not read." },
      { nom: "Cadence", nomEn: "Rate", type: "curseur", plage: [1000, 48000], pas: 100, defaut: 8000, unite: "Hz",
        doc: "Le nombre d'octets par seconde. Huit mille est la valeur d'origine. La changer ne transpose pas le son : elle déplace les intervalles, la place des composantes repliées par l'échantillonnage en dépendant.",
        docEn: "The number of bytes per second. Eight thousand is the original value. Changing it does not transpose the sound: it moves the intervals, the place of the components folded back by sampling depending on it." },
      { nom: "Octet", nomEn: "Byte", type: "choix",
        options: ["Non signé", "Signé"], optionsEn: ["Unsigned", "Signed"],
        optionIds: ["nonsigne", "signe"], defaut: "Non signé", defautEn: "Unsigned",
        doc: "Comment l'octet se lit : en non signé de zéro à 255 comme à l'origine, ou en signé de moins 128 à 127 comme chez d'autres lecteurs. Les deux donnent deux formes d'onde différentes de la même formule.",
        docEn: "How the byte is read: unsigned from zero to 255 as in the original, or signed from minus 128 to 127 as in other players. The two give two different waveforms from the same formula." },
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [0.1, 60], pas: 0.1, defaut: 8, unite: "s",
        doc: "La longueur rendue. Une formule met souvent plusieurs secondes à déployer sa structure, le compteur devant atteindre les rangs de bits que les décalages consultent.",
        docEn: "The rendered length. A formula often takes several seconds to unfold its structure, the counter having to reach the bit ranks the shifts look at." },
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Le niveau de sortie. Le repli sur huit bits porte des sauts d'une amplitude pleine, et la dent de scie qui en résulte est dense.",
        docEn: "The output level. The eight-bit folding carries jumps of full amplitude, and the resulting sawtooth is dense." },
      ...bornesModulation(MOD_CADENCE),
      ...bornesModulation(MOD_VOLUME),
    ],
    async executer(ctx) {
      const sr = frequenceDeTravail();
      const dureeSec = ctx.paramNombre("Durée", 8);
      const n = Math.max(1, Math.round(dureeSec * sr));
      const formule = ctx.paramTexte("Formule", VIZNUT);

      try {
        const { sortie, rapport } = bytebeat({
          formule, sampleRate: sr, dureeSec,
          nonSigne: ctx.paramTexte("Octet", "nonsigne") !== "signe",
          cadence: reglageModule(ctx, n, 0, {
            reglage: "Cadence", defaut: 8000, rendu: "pourCent", echelle: "logarithmique",
            noms: ["Cadence min", "Cadence max"], bornes: MOD_CADENCE.defauts,
          }),
          amplitude: reglageModule(ctx, n, 1, {
            reglage: "Volume", defaut: 50,
            noms: ["Volume min", "Volume max"], bornes: MOD_VOLUME.defauts,
          }),
        });
        const buffer = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
        buffer.getChannelData(0).set(sortie);
        return {
          valeurs: [buffer],
          message: traduire("msg.bytebeat.rendu",
            String(rapport.octets), String(rapport.valeurs),
            (rapport.partNulle * 100).toFixed(0)),
        };
      } catch (e) {
        // LA FORMULE REFUSÉE SE DIT, et son message porte ce qui n'a pas été lu : rendre du silence
        // la laisserait passer pour jouée.
        if (e instanceof FormuleInvalide) {
          return { valeurs: [null], message: traduire("msg.bytebeat.refusee", e.message) };
        }
        throw e;
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
