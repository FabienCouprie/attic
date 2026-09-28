// plugins/gamme-jouee.ts — Une gamme entendue note à note, dans la clé qu'on veut.
//
// POURQUOI CE COMPOSANT EXISTE, relevé par Fabien : « si on chaîne ces gammes et qu'on joue les
// notes une à une on peut donc les relier à notre clavier d'apprentissage ». Cela n'était pas
// possible. Le seul composant dont une gamme était le sujet rendait du TEXTE, une ligne de noms
// sans octaves, et le convertisseur de texte en MIDI attend une note par ligne AVEC son octave et
// sa durée : la chaîne rendait zéro note, pour toutes les clés essayées. Quatorze composants
// portaient bien un réglage de gamme et sortaient du MIDI, mais tous ENGENDRENT une musique à
// partir d'une gamme, aucun ne parcourt la gamme elle-même.
//
// LES DEGRÉS VIENNENT DE LA TABLE COMMUNE, `audio/gammes.ts`, et le parcours aussi : ce fichier ne
// sait ni ce qu'est une gamme ni comment on la monte. Il ne fait que la rendre en son.
//
// LA SORTIE « NOTATION » EST AU FORMAT QUE LE CONVERTISSEUR DE TEXTE ATTEND, une note par ligne avec
// son octave et sa durée. C'est ce qui manquait pour qu'une gamme puisse être lue, retouchée à la
// main, puis rejouée.

import type { FicheAudio } from "../audio/types-domaine";
import { notesVersFichierMidi, rendreMidi, appliquerInstrumentMidi, type NoteEvenement } from "../audio";
import { GAMMES, parcoursDeGamme, type SensDeParcours } from "../audio/gammes";
import { CLES, PARAMETRE_TONIQUE, alterationDe } from "../audio/cles";
import { nomNoteRond, type Alteration } from "../audio/nom-note";
import { langueCourante } from "../i18n";
import {
  sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2,
  decoderInstrumentSF2,
} from "./soundfontGlobal";
import { avecDoc } from "./notices";

const en = () => langueCourante() === "en";


/** La notation qu'attend le convertisseur de texte : une note par ligne, octave et durée comprises. */
function notation(
  notes: readonly number[], duree: number, tempo: number, alteration: Alteration,
): string {
  return [`Tempo ${tempo}`, ...notes.map((n) => `${nomNoteRond(n, alteration)} ${duree}`)].join("\n");
}

export const fiches: FicheAudio[] = ([
  {
    id: "gamme-jouee", nom: "Gamme jouée", nomEn: "Scale Run",
    univers: "Entrées", famille: "Génération",
    resume: "Joue les degrés d'une gamme un à un, dans une clé et sur le nombre d'octaves voulu.",
    resumeEn: "Plays the degrees of a scale one by one, in a key and over as many octaves as wanted.",
    notice: `Rend les degrés d'une gamme comme des notes datées, une à une, depuis la tonique de la clé choisie. La sortie MIDI se branche sur tout ce qui lit du MIDI, un clavier compris.

« Gamme » donne les degrés. Les ${GAMMES.length} gammes offertes sont celles de la table commune : les sept modes, les trois mineures, les pentatoniques, le vocabulaire du jazz, les symétriques et les gammes à seconde augmentée.

« Clé » est la tonique, et elle déplace tout le parcours sans rien changer d'autre : les écarts entre degrés sont ceux de la gamme, quelle que soit la clé.

« Octave » est celle de la tonique de départ. Quatre place le do central.

« Étendue » est le nombre d'octaves parcourues. Chacune rejoue les mêmes degrés, douze demi-tons plus haut.

« Sens » décide du chemin. Montante part de la tonique ; descendante fait le chemin exactement à l'envers ; l'aller-retour monte puis redescend sans rejouer son sommet, qui est atteint une fois.

« Tonique finale » ferme le parcours sur l'octave de la tonique. Sans elle, une gamme s'arrête sur son dernier degré, ce qui s'entend comme une phrase interrompue. La couper est ce qu'il faut pour enchaîner deux parcours, où elle ferait une note doublée à la jointure.

« Tempo » est la vitesse, et une note dure un temps.

« Nuance » est la vélocité de chaque note, la même d'un bout à l'autre.

Une note qui sortirait des cent vingt-huit du MIDI est écartée et non repliée : la ramener dans l'ambitus la ferait tomber au milieu du parcours, où elle s'entendrait comme une faute. Le message dit combien de notes sont sorties.

« Synthèse », « Instrument » et « Volume » ne touchent qu'à l'audio rendu ici. Le MIDI sorti porte le programme de l'instrument choisi, et ses notes gardent leur vélocité.

La sortie « Notation » écrit le parcours en texte, une note par ligne avec son octave et sa durée, dans la forme qu'un convertisseur de texte en MIDI relit.`,
    noticeEn: `Returns the degrees of a scale as dated notes, one by one, from the tonic of the chosen key. The MIDI output plugs into anything that reads MIDI, a keyboard included.

« Scale » gives the degrees. The ${GAMMES.length} scales on offer are those of the common table: the seven modes, the three minors, the pentatonics, the jazz vocabulary, the symmetrical scales and the scales with an augmented second.

« Key » is the tonic, and it moves the whole run without changing anything else: the gaps between degrees are those of the scale, whatever the key.

« Octave » is that of the starting tonic. Four places middle C.

« Range » is the number of octaves covered. Each one replays the same degrees, twelve semitones higher.

« Direction » decides the path. Ascending starts from the tonic; descending makes the same path in reverse; the round trip goes up then back down without replaying its summit, which is reached once.

« Closing tonic » ends the run on the tonic's octave. Without it, a scale stops on its last degree, which is heard as an interrupted phrase. Dropping it is what one wants in order to chain two runs, where it would make a doubled note at the joint.

« Tempo » is the speed, and one note lasts one beat.

« Dynamics » is the velocity of every note, the same throughout.

A note that would fall outside MIDI's hundred and twenty-eight is dropped and not folded: bringing it back into range would make it land in the middle of the run, where it would be heard as a mistake. The message states how many notes were dropped.

« Synthesis », « Instrument » and « Volume » only affect the audio rendered here. The MIDI output carries the chosen instrument's program, and its notes keep their velocity.

The « Notation » output writes the run as text, one note per line with its octave and its duration, in the form a text-to-MIDI converter reads back.`,
    entrees: [],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "MIDI", type: "midi" },
      { nom: "Notation", nomEn: "Notation", type: "texte" },
    ],
    parametres: [
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: GAMMES.map((g) => g.fr), optionsEn: GAMMES.map((g) => g.en),
        optionIds: GAMMES.map((g) => g.id), defaut: GAMMES[0].fr, defautEn: GAMMES[0].en,
        doc: "Les degrés à parcourir. Ils viennent de la table commune des gammes.",
        docEn: "The degrees to run through. They come from the common scale table." },
      { ...PARAMETRE_TONIQUE, nom: "Clé", nomEn: "Key",
        doc: "La tonique. Elle déplace tout le parcours et ne change rien aux écarts entre degrés.",
        docEn: "The tonic. It moves the whole run and changes nothing about the gaps between degrees." },
      { nom: "Octave", nomEn: "Octave", type: "curseur", plage: [0, 8], pas: 1, defaut: 4,
        doc: "L'octave de la tonique de départ. Quatre place le do central.",
        docEn: "The octave of the starting tonic. Four places middle C." },
      { nom: "Étendue", nomEn: "Range", type: "curseur", plage: [1, 6], pas: 1, defaut: 1,
        unite: " octave(s)", uniteEn: " octave(s)",
        doc: "Le nombre d'octaves parcourues. Chacune rejoue les mêmes degrés douze demi-tons plus haut.",
        docEn: "The number of octaves covered. Each one replays the same degrees twelve semitones higher." },
      { nom: "Sens", nomEn: "Direction", type: "choix",
        options: ["Montante", "Descendante", "Aller-retour"],
        optionsEn: ["Ascending", "Descending", "Round trip"],
        optionIds: ["montante", "descendante", "aller-retour"],
        defaut: "Montante", defautEn: "Ascending",
        doc: "Le chemin. L'aller-retour monte puis redescend sans rejouer son sommet.",
        docEn: "The path. The round trip goes up then back down without replaying its summit." },
      { nom: "Tonique finale", nomEn: "Closing tonic", type: "choix",
        options: ["Oui", "Non"], optionsEn: ["Yes", "No"], optionIds: ["oui", "non"],
        defaut: "Oui", defautEn: "Yes",
        doc: "Fermer le parcours sur l'octave de la tonique. À couper pour enchaîner deux parcours, où elle ferait une note doublée.",
        docEn: "End the run on the tonic's octave. Drop it to chain two runs, where it would make a doubled note." },
      { nom: "Tempo", nomEn: "Tempo", type: "curseur", plage: [20, 300], pas: 1, defaut: 90, unite: "BPM",
        doc: "La vitesse du parcours. Une note dure un temps.",
        docEn: "The speed of the run. One note lasts one beat." },
      { nom: "Nuance", nomEn: "Dynamics", type: "curseur", plage: [1, 127], pas: 1, defaut: 90,
        doc: "La vélocité de chaque note, la même d'un bout à l'autre.",
        docEn: "The velocity of every note, the same throughout." },
      { ...PARAMETRE_SYNTHESE,
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume de l'audio rendu.", docEn: "Volume of the rendered audio." },
    ],
    async executer(ctx: any) {
      const gamme = ctx.paramTexte("Gamme", GAMMES[0].id);
      const demiTon = parseInt(ctx.paramTexte("Clé", "0"), 10) || 0;
      const octave = Math.round(ctx.paramNombre("Octave", 4));
      const octaves = Math.round(ctx.paramNombre("Étendue", 1));
      const sens = ctx.paramTexte("Sens", "montante") as SensDeParcours;
      const fermer = ctx.paramTexte("Tonique finale", "oui") !== "non";
      const tempo = ctx.paramNombre("Tempo", 90);
      const velocite = Math.round(ctx.paramNombre("Nuance", 90));

      // L'OCTAVE QUATRE EST LE DO CENTRAL, soit la note 60 : c'est la convention de nommage du dépôt,
      // celle que `nomNoteRond` écrit et relit.
      const tonique = (octave + 1) * 12 + demiTon;
      const hauteurs = parcoursDeGamme(gamme, tonique, octaves, sens, fermer);
      if (hauteurs.length === 0) {
        return { valeurs: [null, null, ""], erreur: true,
          message: en() ? "No note falls within MIDI's range." : "Aucune note ne tombe dans l'ambitus MIDI." };
      }
      // Ce qui a été écarté faute de tenir dans les 128 notes, pour que le message le dise. Le même
      // parcours fait depuis la note zéro ne peut rien perdre : six octaves n'y montent qu'à 72.
      const ecartees = parcoursDeGamme(gamme, 0, octaves, sens, fermer).length - hauteurs.length;

      const duree = 60 / Math.max(1, tempo);
      const notes: NoteEvenement[] = hauteurs.map((note, i) => ({
        note, velocite, debut: i * duree, fin: (i + 1) * duree,
      }));

      const midiFichier = notesVersFichierMidi(notes, tempo);
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const { programme: instrument, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
      const rendu: "FM/Oscillateurs" | "SoundFont" =
        mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
      const audio = await rendreMidi(midiFichier, rendu, ctx.paramNombre("Volume", 80), instrument, banque);
      const midiFinal = await appliquerInstrumentMidi(midiFichier, ctx.paramNombre("Instrument", 0));

      const nom = GAMMES.find((g) => g.id === gamme);
      const cle = CLES[demiTon] ?? CLES[0];
      const titre = `${en() ? cle.en : cle.fr} ${nom ? (en() ? nom.en : nom.fr) : gamme}`;
      const ecart = ecartees > 0
        ? ` · ${ecartees} ${en() ? "outside MIDI's range" : "hors de l'ambitus MIDI"}`
        : "";
      return {
        // LA GAMME S'ÉCRIT DANS LA GRAPHIE DE SA CLÉ : mi bémol majeur se lit « Eb F G Ab Bb C D »
        // et non en dièses, qui désignent les mêmes touches sans nommer les degrés.
        valeurs: [audio, midiFinal, notation(hauteurs, 1, tempo, alterationDe(demiTon))],
        message: `${titre} · ${hauteurs.length} notes · ${(hauteurs.length * duree).toFixed(1)} s${ecart}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
