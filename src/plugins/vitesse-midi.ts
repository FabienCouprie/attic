// plugins/vitesse-midi.ts — Nœud « Vitesse MIDI ».
//
// Attic étirait le temps depuis longtemps, mais seulement sur de l'audio. Sur les vingt-six
// nœuds qui prennent un MIDI et en rendent un, aucun ne touchait à la vitesse — alors que c'est
// le geste le plus ordinaire qui soit : ralentir un passage pour l'apprendre, caler deux
// morceaux au même tempo. Et sur du MIDI il est EXACT, là où l'audio ne fait qu'approcher :
// rien n'est rééchantillonné, les hauteurs ne bougent pas d'un centième de ton.
//
// Trois façons de dire la même chose, parce qu'on ne pense pas dans la même unité selon ce
// qu'on fait : un FACTEUR quand on sait ce qu'on veut, un POURCENTAGE quand on tâtonne, un
// TEMPO CIBLE quand on cale un morceau sur un autre — le nœud lit alors le tempo du fichier et
// fait la division à votre place.
//
// LE MIDI DE SORTIE N'EST PAS RÉENCODÉ. Seul son tempo est réécrit, ce qui laisse les positions
// en tics intactes : canaux, changements de programme, contrôleurs, pédale, noms de pistes —
// tout traverse. Un réencodage depuis les seules hauteurs aurait aplati un piano à deux mains
// sur un canal unique. La logique est dans `audio/vitesse-midi.ts`, testée ; ce fichier n'est
// que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { parseMidi, writeMidi } from "midi-file";
import { analyserMidi, rendreSequence, appliquerInstrumentMidi, type NoteEvenement } from "../audio";
import {
  DUREE_MIN_DEFAUT, etirerNotes, facteurDepuisTempo, facteurValide, reglerTempoMidi,
  tempoDuMidi, tempoEtire,
} from "../audio/vitesse-midi";
import {
  sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2,
  decoderInstrumentSF2,
} from "./soundfontGlobal";

export const fiches: FicheAudio[] = ([
  {
    id: "vitesse-midi", nom: "Vitesse MIDI", nomEn: "MIDI Speed",
    univers: "Traitement", famille: "Effets",
    resume: "Joue un MIDI plus lentement ou plus vite, sans toucher aux hauteurs.",
    resumeEn: "Plays a MIDI file slower or faster, without touching the pitches.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "MIDI", type: "midi" },
    ],
    parametres: [
      { nom: "Mode", nomEn: "Mode", type: "choix",
        options: ["Facteur", "Pourcentage", "Tempo cible"],
        optionsEn: ["Factor", "Percentage", "Target tempo"],
        optionIds: ["facteur", "pourcentage", "tempo"],
        defaut: "Facteur", defautEn: "Factor",
        doc: "Comment dire la vitesse. « Facteur » quand on sait ce qu'on veut, « Pourcentage » quand on tâtonne, « Tempo cible » quand on cale un morceau sur un autre ; le composant lit alors le tempo du fichier et fait la division lui-même.",
        docEn: "How to state the speed. « Factor » when you know what you want, « Percentage » when you are feeling your way, « Target tempo » when matching one piece to another, the node then reads the file's tempo and does the division itself." },
      { nom: "Facteur", nomEn: "Factor", type: "curseur", plage: [0.1, 8], pas: 0.05, defaut: 1, unite: "×",
        doc: "Vitesse de lecture : 0,5 joue deux fois plus lentement, 2 deux fois plus vite. C'est une vitesse et non un étirement, les durées sont divisées par lui.",
        docEn: "Playback speed: 0.5 plays twice as slow, 2 twice as fast. This is a speed and not a stretch, durations are divided by it." },
      { nom: "Pourcentage", nomEn: "Percentage", type: "curseur", plage: [10, 800], pas: 5, defaut: 100, unite: "%",
        doc: "En mode « Pourcentage » : la vitesse en pour cent de l'originale, 75 % pour un ralenti d'un quart, 200 % pour le double.",
        docEn: "The same thing as a percentage of the original speed: 75 % for a quarter slower, 200 % for twice as fast." },
      { nom: "Tempo cible", nomEn: "Target tempo", type: "nombre", plage: [20, 300], pas: 1, defaut: 120, unite: "BPM",
        doc: "En mode « Tempo » : le tempo auquel jouer le fichier. Le facteur en découle : un fichier à 120 joué à 90 est ralenti à 0,75. Le tempo lu dans le fichier est rappelé dans le message.",
        docEn: "The tempo to play the file at. The factor follows: a file at 120 played at 90 is slowed to 0.75. The tempo read from the file is recalled in the message." },
      { nom: "Durée minimale", nomEn: "Minimum duration", type: "curseur", plage: [0, 200], pas: 5, defaut: 20, unite: "ms",
        doc: "Plancher de durée d'une note accélérée. À huit fois plus vite, une double croche tombe sous cinq millisecondes : ce n'est plus une note, c'est un clic. Ce plancher ne concerne que l'audio rendu ici, le MIDI de sortie, lui, garde ses durées exactes.",
        docEn: "Duration floor for a sped-up note. At eight times faster, a sixteenth note falls below five milliseconds: that is no longer a note, it is a click. This floor only affects the audio rendered here; the MIDI output keeps its exact durations." },
      { ...PARAMETRE_SYNTHESE,
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 80, unite: "%" },
    ],
    async executer(ctx: any) {
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) {
        return { valeurs: [null, null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      }
      const parse = parseMidi(new Uint8Array(await fichier.arrayBuffer()));
      const { notes } = analyserMidi(parse);
      if (notes.length === 0) return { valeurs: [null, null], message: traduire("msg.aucune_note") };
      const { tempo: tempoSource, changements } = tempoDuMidi(parse.tracks as never);

      const mode = ctx.paramTexte("Mode", "facteur");
      const facteur = facteurValide(
        mode === "pourcentage" ? ctx.paramNombre("Pourcentage", 100) / 100
          : mode === "tempo" ? facteurDepuisTempo(tempoSource, ctx.paramNombre("Tempo cible", 120))
          : ctx.paramNombre("Facteur", 1));

      const dureeMin = Math.max(0, ctx.paramNombre("Durée minimale", DUREE_MIN_DEFAUT * 1000) / 1000);
      const evenements: NoteEvenement[] = notes.map((n) => ({
        note: n.note, velocite: n.velociete ?? 90, debut: n.debut, fin: n.fin,
      }));
      const { notes: etirees, ecourtees } = etirerNotes(evenements, facteur, { dureeMin });

      const synthese = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const { programme: instrument, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
      const modeRendu: "FM/Oscillateurs" | "SoundFont" =
        synthese === "SoundFont" || (synthese === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
      const audio = await rendreSequence(etirees, modeRendu, ctx.paramNombre("Volume", 80), instrument, banque);

      // Le MIDI n'est PAS réencodé : on ne réécrit que son tempo, et tout le reste traverse.
      const { midi: sortie } = reglerTempoMidi(parse as never, facteur);
      const nomBase = fichier.name.replace(/\.mid(i)?$/i, "");
      const octets = new Uint8Array(writeMidi(sortie as never));
      const midi = await appliquerInstrumentMidi(
        new File([octets], `${nomBase}_x${facteur.toFixed(2)}.mid`, { type: "audio/midi" }),
        ctx.paramNombre("Instrument", 0));

      const duree = etirees.reduce((m, n) => Math.max(m, n.fin), 0);
      const messages = [
        traduire("msg.vitesse.resultat", facteur.toFixed(2),
          Math.round(tempoSource).toString(), Math.round(tempoEtire(tempoSource, facteur)).toString(),
          duree.toFixed(1)),
        ecourtees > 0 ? traduire("msg.vitesse.ecourtees", String(ecourtees)) : "",
        // Un fichier à tempo variable garde son relief : chaque changement est étiré. On le dit
        // quand même, parce que le « tempo » annoncé ci-dessus n'est alors que le premier.
        changements > 1 ? traduire("msg.vitesse.tempoVariable", String(changements)) : "",
      ].filter(Boolean);
      return { valeurs: [audio, midi], message: messages.join(" · ") };
    },
  },
] as FicheAudio[]).map(avecDoc);
