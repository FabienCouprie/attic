// plugins/accords-joues.ts — Un accord entendu, plaqué, arpégé ou roulé.
//
// LE PENDANT DE « GAMME JOUÉE », demandé par Fabien : « nous voulons faire un composant symétrique
// à celui des gammes ». Mêmes réglages là où ils se correspondent, mêmes trois sorties, même façon
// d'écarter ce qui sort de l'ambitus. Ce qui diffère tient à ce qu'un accord est : un renversement
// remplace le sens seul, et la façon de le faire entendre est un réglage à part entière.
//
// LES INTERVALLES VIENNENT DE LA TABLE COMMUNE, `audio/qualites-accords.ts`, et le calcul du jeu
// aussi : ce fichier ne sait ni ce qu'est un accord ni comment on le roule. Il ne fait que le rendre
// en son.
//
// LA FORME DÉCOMPOSÉE EST CELLE QUI SE JOUE, relevé par Fabien : « pour les glissandos, la forme
// décomposée est nécessaire pour la jouer au piano ». Un accord roulé est l'arpègement de la harpe
// et du piano, les notes entrant l'une après l'autre et restant tenues. C'est bien une suite de
// notes, et non un glissement continu de hauteur.

import type { FicheAudio } from "../audio/types-domaine";
import { notesVersFichierMidi, rendreMidi, appliquerInstrumentMidi } from "../audio";
import {
  QUALITES, dansLeSens, jouerAccord, notesDaccord, type ModeDeJeu, type SensDArpege,
} from "../audio/qualites-accords";
import { nomNoteRond, type Alteration } from "../audio/nom-note";
import { CLES, PARAMETRE_TONIQUE, alterationDe } from "../audio/cles";
import type { Note } from "../audio/note";
import { langueCourante } from "../i18n";
import {
  sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2,
  decoderInstrumentSF2,
} from "./soundfontGlobal";
import { avecDoc } from "./notices";

const en = () => langueCourante() === "en";


/** Le nombre de renversements offerts : l'accord le plus fourni de la table en compte sept notes. */
const RENVERSEMENT_MAX = Math.max(...QUALITES.map((q) => q.intervalles.length)) - 1;

/**
 * La notation qu'attend le convertisseur de texte : un départ par ligne, les notes simultanées
 * jointes par un plus.
 *
 * CE FORMAT EST SÉQUENTIEL, ET NE SAIT PAS DIRE QU'UNE NOTE TIENT PENDANT LA SUIVANTE. La durée
 * écrite est donc l'écart jusqu'au départ suivant, et celle du dernier départ est sa propre
 * longueur. Un accord roulé s'y lit comme une suite de départs, ce qu'il est ; ce qui se perd est
 * la tenue, et la sortie MIDI, elle, la garde.
 */
function notation(jouees: readonly Note[], tempo: number, alteration: Alteration): string {
  const parDepart = new Map<number, Note[]>();
  for (const n of jouees) {
    const cle = Math.round(n.debut * 1000);
    if (!parDepart.has(cle)) parDepart.set(cle, []);
    parDepart.get(cle)!.push(n);
  }
  const departs = [...parDepart.keys()].sort((a, b) => a - b);
  const noire = 60 / Math.max(1, tempo);
  const lignes = departs.map((ms, i) => {
    const groupe = parDepart.get(ms)!;
    const suivant = i + 1 < departs.length ? departs[i + 1] : null;
    const duree = suivant !== null
      ? (suivant - ms) / 1000
      : Math.max(...groupe.map((n) => n.fin - n.debut));
    return `${groupe.map((n) => nomNoteRond(n.note, alteration)).join("+")} ${(duree / noire).toFixed(3)}`;
  });
  return [`Tempo ${tempo}`, ...lignes].join("\n");
}

export const fiches: FicheAudio[] = ([
  {
    id: "accords-joues", nom: "Accords joués", nomEn: "Chord Run",
    univers: "Entrées", famille: "Génération",
    resume: "Joue un accord nommé, plaqué, arpégé ou roulé, dans la fondamentale et le renversement voulus.",
    resumeEn: "Plays a named chord, struck, arpeggiated or rolled, in the wanted root and inversion.",
    notice: `Rend les notes d'un accord comme des notes datées, depuis la fondamentale choisie. La sortie MIDI se branche sur tout ce qui lit du MIDI, un clavier compris.

« Accord » donne les intervalles. Les ${QUALITES.length} qualités offertes viennent de la table commune : les triades, les septièmes et les sixtes, les extensions de neuvième, onzième et treizième, les accords altérés et les suspendus. Une qualité vaut pour les douze fondamentales, ce qui fait ${QUALITES.length * 12} accords.

Les intervalles déclarés sont ceux qui se jouent, et non l'empilement théorique : l'accord de onzième se joue sans sa tierce, qui frotterait d'un demi-ton contre elle, et la treizième de dominante sans sa onzième, pour la même raison. L'onzième mineure, elle, les garde toutes les deux, la tierce mineure ne frottant pas contre la onzième.

« Fondamentale » est la note du bas de l'accord non renversé. Elle déplace tout l'accord et ne change rien aux écarts entre les notes.

« Octave » est celle de la fondamentale. Quatre place le do central.

« Étendue » est le nombre d'octaves parcourues. Chacune rejoue les mêmes notes, douze demi-tons plus haut.

« Renversement » monte d'une octave les notes du bas, une par degré demandé. C'est ce qui change la basse sans changer l'accord : les mêmes notes y sont, autrement posées. Un renversement plus grand que le nombre de notes de l'accord est ramené au dernier possible.

« Façon » décide de ce qu'on entend, et les trois ne font pas la même musique.
• « Plaqué » fait partir toutes les notes ensemble et les arrête ensemble. C'est l'accord d'un seul geste.
• « Arpégé » les fait partir l'une après l'autre, chacune relâchée quand la suivante part. L'accord n'y sonne jamais entier : on l'entend note à note.
• « Roulé » les fait partir l'une après l'autre et les tient toutes jusqu'à la fin. L'accord sonne donc entier à partir du dernier départ, et c'est la forme décomposée que la harpe et le piano jouent.

« Sens » décide de l'ordre des notes, et n'agit pas sur un accord plaqué, dont les notes partent ensemble. L'aller-retour monte puis redescend sans rejouer son sommet, qui est atteint une fois.

« Fondamentale finale » ajoute la fondamentale au-dessus de tout l'accord. Elle ferme un arpège, que sa dernière note laisserait autrement en suspens, et sur un accord plaqué elle double la basse. Sur un accord dont une extension monte au-delà de l'octave, elle est montée d'autant d'octaves qu'il faut pour rester la note la plus haute.

« Étalement » est la part de la durée sur laquelle les départs se répartissent. À un, un arpège remplit exactement la durée ; petit, un roulé devient un geste bref suivi de l'accord tenu. Il n'agit pas sur un accord plaqué, dont les notes partent toutes au même instant. Étant une part et non un temps, un accord deux fois plus long garde la même allure.

« Tempo » et « Durée » donnent la longueur de l'accord, la durée étant comptée en temps.

« Nuance » est la vélocité de chaque note, la même d'un bout à l'autre.

Une note qui sortirait des cent vingt-huit du MIDI est écartée et non repliée : la ramener dans l'ambitus la ferait tomber au milieu de l'accord, où elle changerait le renversement sans qu'on l'ait demandé. Le message dit combien de notes sont sorties.

« Synthèse », « Instrument » et « Volume » ne touchent qu'à l'audio rendu ici. Le MIDI sorti porte le programme de l'instrument choisi, et ses notes gardent leur vélocité.

La sortie « Notation » écrit l'accord en texte, un départ par ligne et les notes simultanées jointes par un plus, dans la forme qu'un convertisseur de texte en MIDI relit. Ce format est séquentiel et ne sait pas dire qu'une note tient pendant la suivante : un accord roulé s'y lit comme la suite de ses départs, et c'est la sortie MIDI qui en garde la tenue.`,
    noticeEn: `Returns the notes of a chord as dated notes, from the chosen root. The MIDI output plugs into anything that reads MIDI, a keyboard included.

« Chord » gives the intervals. The ${QUALITES.length} qualities on offer come from the common table: the triads, the sevenths and sixths, the ninth, eleventh and thirteenth extensions, the altered chords and the suspended ones. One quality holds for the twelve roots, which makes ${QUALITES.length * 12} chords.

The declared intervals are the ones that get played, not the theoretical stack: the eleventh chord is played without its third, which would clash a semitone against it, and the dominant thirteenth without its eleventh, for the same reason. The minor eleventh keeps both, the minor third not clashing against the eleventh.

« Root » is the bottom note of the un-inverted chord. It moves the whole chord and changes nothing about the gaps between its notes.

« Octave » is the root's. Four places middle C.

« Range » is the number of octaves covered. Each one replays the same notes, twelve semitones higher.

« Inversion » moves the bottom notes up an octave, one per requested degree. That is what changes the bass without changing the chord: the same notes are there, laid out differently. An inversion larger than the chord's number of notes is brought back to the last possible one.

« Manner » decides what one hears, and the three do not make the same music.
• « Struck » starts every note together and stops them together. That is the chord in a single gesture.
• « Arpeggiated » starts them one after another, each released when the next starts. The chord never sounds whole: it is heard note by note.
• « Rolled » starts them one after another and holds them all to the end. The chord therefore sounds whole from the last onset, and that is the spread form the harp and the piano play.

« Direction » decides the order of the notes, and does nothing on a struck chord, whose notes start together. The round trip goes up then back down without replaying its summit, which is reached once.

« Closing root » adds the root above the whole chord. It closes an arpeggio that its last note would otherwise leave hanging, and on a struck chord it doubles the bass. On a chord whose extension rises beyond the octave, it is raised by as many octaves as needed to remain the highest note.

« Spread » is the share of the duration over which the onsets are laid out. At one, an arpeggio fills the duration exactly; small, a roll becomes a brief gesture followed by the held chord. It does nothing on a struck chord, whose notes all start at the same instant. Being a share and not a time, a chord twice as long keeps the same gait.

« Tempo » and « Duration » give the chord's length, the duration being counted in beats.

« Dynamics » is the velocity of every note, the same throughout.

A note that would fall outside MIDI's hundred and twenty-eight is dropped and not folded: bringing it back into range would make it land in the middle of the chord, where it would change the inversion without being asked. The message states how many notes were dropped.

« Synthesis », « Instrument » and « Volume » only affect the audio rendered here. The MIDI output carries the chosen instrument's program, and its notes keep their velocity.

The « Notation » output writes the chord as text, one onset per line and simultaneous notes joined by a plus, in the form a text-to-MIDI converter reads back. That format is sequential and cannot say that a note holds through the next one: a rolled chord reads there as the series of its onsets, and it is the MIDI output that keeps its sustain.`,
    entrees: [],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "MIDI", type: "midi" },
      { nom: "Notation", nomEn: "Notation", type: "texte" },
    ],
    parametres: [
      { nom: "Accord", nomEn: "Chord", type: "choix",
        options: QUALITES.map((q) => q.fr), optionsEn: QUALITES.map((q) => q.en),
        optionIds: QUALITES.map((q) => q.id), defaut: QUALITES[0].fr, defautEn: QUALITES[0].en,
        doc: "La qualité à jouer. Ses intervalles viennent de la table commune des accords.",
        docEn: "The quality to play. Its intervals come from the common chord table." },
      { ...PARAMETRE_TONIQUE, nom: "Fondamentale", nomEn: "Root",
        doc: "La note du bas de l'accord non renversé. Elle déplace tout l'accord et ne change rien aux écarts entre ses notes.",
        docEn: "The bottom note of the un-inverted chord. It moves the whole chord and changes nothing about the gaps between its notes." },
      { nom: "Octave", nomEn: "Octave", type: "curseur", plage: [0, 8], pas: 1, defaut: 4,
        doc: "L'octave de la fondamentale. Quatre place le do central.",
        docEn: "The root's octave. Four places middle C." },
      { nom: "Étendue", nomEn: "Range", type: "curseur", plage: [1, 4], pas: 1, defaut: 1,
        unite: " octave(s)", uniteEn: " octave(s)",
        doc: "Le nombre d'octaves parcourues. Chacune rejoue les mêmes notes douze demi-tons plus haut.",
        docEn: "The number of octaves covered. Each one replays the same notes twelve semitones higher." },
      { nom: "Renversement", nomEn: "Inversion", type: "curseur", plage: [0, RENVERSEMENT_MAX], pas: 1, defaut: 0,
        doc: "Monte d'une octave les notes du bas, une par degré. Change la basse sans changer l'accord.",
        docEn: "Moves the bottom notes up an octave, one per degree. Changes the bass without changing the chord." },
      { nom: "Façon", nomEn: "Manner", type: "choix",
        options: ["Plaqué", "Arpégé", "Roulé"],
        optionsEn: ["Struck", "Arpeggiated", "Rolled"],
        optionIds: ["plaque", "arpege", "roule"],
        defaut: "Plaqué", defautEn: "Struck",
        doc: "Ce qu'on entend. Le roulé fait partir les notes l'une après l'autre et les tient toutes : l'accord sonne entier à partir du dernier départ.",
        docEn: "What one hears. The roll starts the notes one after another and holds them all: the chord sounds whole from the last onset." },
      { nom: "Sens", nomEn: "Direction", type: "choix",
        options: ["Montant", "Descendant", "Aller-retour"],
        optionsEn: ["Ascending", "Descending", "Round trip"],
        optionIds: ["montant", "descendant", "aller-retour"],
        defaut: "Montant", defautEn: "Ascending",
        doc: "L'ordre des notes. Sans effet sur un accord plaqué, dont les notes partent ensemble.",
        docEn: "The order of the notes. Has no effect on a struck chord, whose notes start together." },
      { nom: "Fondamentale finale", nomEn: "Closing root", type: "choix",
        options: ["Non", "Oui"], optionsEn: ["No", "Yes"], optionIds: ["non", "oui"],
        defaut: "Non", defautEn: "No",
        doc: "Ajoute la fondamentale une octave au-dessus. Elle ferme un arpège, et double la basse d'un accord plaqué.",
        docEn: "Adds the root one octave above. It closes an arpeggio, and doubles a struck chord's bass." },
      { nom: "Étalement", nomEn: "Spread", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "La part de la durée sur laquelle les départs se répartissent. Sans effet sur un accord plaqué, dont les notes partent au même instant.",
        docEn: "The share of the duration over which the onsets are laid out. Has no effect on a struck chord, whose notes start at the same instant." },
      { nom: "Tempo", nomEn: "Tempo", type: "curseur", plage: [20, 300], pas: 1, defaut: 90, unite: "BPM",
        doc: "La vitesse. Avec la durée, elle donne la longueur de l'accord.",
        docEn: "The speed. With the duration, it gives the chord's length." },
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [0.25, 8], pas: 0.25, defaut: 2,
        unite: " temps", uniteEn: " beats",
        doc: "La longueur de l'accord, en temps.",
        docEn: "The chord's length, in beats." },
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
      const qualite = ctx.paramTexte("Accord", QUALITES[0].id);
      const demiTon = parseInt(ctx.paramTexte("Fondamentale", "0"), 10) || 0;
      const octave = Math.round(ctx.paramNombre("Octave", 4));
      const octaves = Math.round(ctx.paramNombre("Étendue", 1));
      const renversement = Math.round(ctx.paramNombre("Renversement", 0));
      const facon = ctx.paramTexte("Façon", "plaque") as ModeDeJeu;
      const sens = ctx.paramTexte("Sens", "montant") as SensDArpege;
      const fermer = ctx.paramTexte("Fondamentale finale", "non") === "oui";
      const etalement = ctx.paramNombre("Étalement", 100) / 100;
      const tempo = ctx.paramNombre("Tempo", 90);
      const dureeEnTemps = ctx.paramNombre("Durée", 2);
      const velocite = Math.round(ctx.paramNombre("Nuance", 90));

      // L'OCTAVE QUATRE EST LE DO CENTRAL, soit la note 60 : la convention de nommage du dépôt,
      // celle que `nomNoteRond` écrit et relit.
      const fondamentale = (octave + 1) * 12 + demiTon;
      const hauteurs = notesDaccord(qualite, fondamentale, octaves, renversement, fermer);
      if (hauteurs.length === 0) {
        return { valeurs: [null, null, ""], erreur: true,
          message: en() ? "No note falls within MIDI's range." : "Aucune note ne tombe dans l'ambitus MIDI." };
      }
      // Le même accord posé sur la note zéro ne peut rien perdre : quatre octaves n'y montent qu'à 45.
      const ecartees = notesDaccord(qualite, 0, octaves, renversement, fermer).length - hauteurs.length;

      const duree = dureeEnTemps * (60 / Math.max(1, tempo));
      const notes = jouerAccord(dansLeSens(hauteurs, sens), facon, duree, etalement, velocite);

      const midiFichier = notesVersFichierMidi(notes, tempo);
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const { programme: instrument, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
      const rendu: "FM/Oscillateurs" | "SoundFont" =
        mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
      const audio = await rendreMidi(midiFichier, rendu, ctx.paramNombre("Volume", 80), instrument, banque);
      const midiFinal = await appliquerInstrumentMidi(midiFichier, ctx.paramNombre("Instrument", 0));

      const q = QUALITES.find((x) => x.id === qualite);
      const fonda = CLES[demiTon] ?? CLES[0];
      const titre = `${en() ? fonda.en : fonda.fr}${q ? q.symbole : ""}`;
      const renverse = renversement > 0
        ? ` · ${en() ? "inversion" : "renversement"} ${Math.min(renversement, hauteurs.length - 1)}`
        : "";
      const hors = ecartees > 0
        ? ` · ${ecartees} ${en() ? "outside MIDI's range" : "hors de l'ambitus MIDI"}`
        : "";
      const derniere = Math.max(...notes.map((n) => n.fin));
      return {
        // L'ACCORD S'ÉCRIT DANS LA GRAPHIE DE SA FONDAMENTALE : un mi bémol mineur septième se lit
        // « Eb4+Gb4+Bb4+Db5 » et non en dièses, qui désignent les mêmes touches sans nommer l'accord.
        valeurs: [audio, midiFinal, notation(notes, tempo, alterationDe(demiTon))],
        message: `${titre} · ${notes.length} notes${renverse} · ${derniere.toFixed(1)} s${hors}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
