// plugins/effets-midi.ts — Effets qui transforment du MIDI.
//
// Les fiches sont rangees par nature du traitement, et non par famille : les quarante-trois
// effets declarent la meme, « Effets », ce qui ne decoupe rien. Les fabriques partagees vivent
// dans `effets-aides.ts`.


import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";
import { hasardDuNoeud } from "../core";
import { parseMidi } from "midi-file";
import { appliquerInstrumentMidi, joindreMidi, bouclerMidi, analyserMidi, rendreSequence } from "../audio";
import { eclaircir, echoNotes, evenements, imposerRythme, palindrome, repeterEtTourner, type SensMotif } from "../audio/motifs-midi";
import { PARAMETRE_INSTRUMENT_SF2, PARAMETRE_SYNTHESE, decoderInstrumentSF2, normaliserModeSynthèse, sf2Chargee } from "./soundfontGlobal";
import { PARAMETRE_TONIQUE } from "../audio/cles";
import { TEMPERAMENTS, noteTemperee, tableEcarts, temperament } from "../audio/temperaments";
import { apprendre, engendrer, statistiques, tableEnTexte } from "../audio/markov";

import { effet, simple, canalDominant, notesDuMidi, rendreMotif, PARAMETRES_RENDU_MOTIF, SORTIES_MOTIF } from "./effets-aides";

export const fiches: FicheAudio[] = ([
  {
    id: "motif-imposer-rythme", nom: "Imposer un rythme", nomEn: "Impose Rhythm",
    univers: "Traitement", famille: "Effets",
    resume: "Plaque la grille rythmique d'un MIDI sur les hauteurs d'un autre.",
    resumeEn: "Applies one MIDI file's rhythmic grid to another's pitches.",
    entrees: [
      { nom: "Hauteurs", nomEn: "Pitches", type: "midi" },
      { nom: "Rythme", nomEn: "Rhythm", type: "midi" },
    ],
    sorties: SORTIES_MOTIF,
    parametres: PARAMETRES_RENDU_MOTIF,
    async executer(ctx: any) {
      const hauteurs = await notesDuMidi(ctx.entree(0));
      const grille = await notesDuMidi(ctx.entree(1));
      if (!hauteurs || !grille) return { valeurs: [null, null], message: traduire("msg.motif.deuxMidi") };
      const sortie = imposerRythme(hauteurs, grille);
      if (sortie.length === 0) return { valeurs: [null, null], message: traduire("msg.aucune_note") };
      const [audio, midi] = await rendreMotif(ctx, sortie, canalDominant(hauteurs));
      return {
        valeurs: [audio, midi],
        // On annonce des ÉVÉNEMENTS et non des notes : ce qui tourne en boucle, ce sont
        // les accords, et ce qui commande la longueur, ce sont les frappes.
        message: traduire("msg.motif.imposer", sortie.length, evenements(grille).length, evenements(hauteurs).length),
      };
    },
  },
  {
    id: "motif-echo-notes", nom: "Écho de notes", nomEn: "Note Echo",
    univers: "Traitement", famille: "Effets",
    resume: "Superpose des copies décalées d'un motif, de vélocité décroissante.",
    resumeEn: "Layers time-shifted copies of a pattern, with decreasing velocity.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: SORTIES_MOTIF,
    parametres: [
      { nom: "Répétitions", nomEn: "Repeats", type: "nombre", plage: [0, 16], pas: 1, defaut: 3,
        doc: "Nombre de copies ajoutées après chaque note. Les copies qui descendraient sous la vélocité 1 ne sont pas écrites.",
        docEn: "Number of copies added after each note. Copies that would fall below velocity 1 are not written." },
      { nom: "Décalage", nomEn: "Offset", type: "nombre", plage: [0.01, 4], pas: 0.01, defaut: 0.25, unite: "s",
        doc: "Écart entre deux copies successives.", docEn: "Gap between two successive copies." },
      { nom: "Atténuation", nomEn: "Feedback", type: "nombre", plage: [0, 100], pas: 1, defaut: 60, unite: "%",
        doc: "Part de la vélocité que chaque copie garde de la précédente. 100 % = copies aussi fortes que l'original.",
        docEn: "Share of the velocity each copy keeps from the previous one. 100 % = copies as loud as the original." },
      { nom: "Transposition", nomEn: "Transpose", type: "nombre", plage: [-12, 12], pas: 1, defaut: 0, unite: " ½-ton", uniteEn: "st",
        doc: "Transposition cumulée à chaque copie : +7 fait monter l'écho de quinte en quinte. Une copie qui sortirait du clavier MIDI arrête la série.",
        docEn: "Transposition accumulated at each copy: +7 sends the echo up fifth by fifth. A copy that would leave the MIDI range ends the series." },
      ...PARAMETRES_RENDU_MOTIF,
    ],
    async executer(ctx: any) {
      const notes = await notesDuMidi(ctx.entree(0));
      if (!notes) return { valeurs: [null, null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      if (notes.length === 0) return { valeurs: [null, null], message: traduire("msg.aucune_note") };
      const sortie = echoNotes(notes, {
        repetitions: ctx.paramNombre("Répétitions", 3),
        decalage: ctx.paramNombre("Décalage", 0.25),
        attenuation: ctx.paramNombre("Atténuation", 60) / 100,
        transposition: ctx.paramNombre("Transposition", 0),
      });
      const [audio, midi] = await rendreMotif(ctx, sortie, canalDominant(notes));
      return {
        valeurs: [audio, midi],
        message: traduire("msg.motif.echo", notes.length, sortie.length - notes.length),
      };
    },
  },
  {
    id: "motif-eclaircir", nom: "Éclaircir", nomEn: "Thin Out",
    univers: "Traitement", famille: "Effets",
    resume: "Retire une part des notes au hasard, de façon reproductible.",
    resumeEn: "Removes a share of the notes at random, reproducibly.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: SORTIES_MOTIF,
    parametres: [
      { nom: "Proportion", nomEn: "Amount", type: "nombre", plage: [0, 100], pas: 1, defaut: 30, unite: "%",
        doc: "Part des événements retirés. Le tirage se fait par événement et non par note : un accord part entier ou reste entier.",
        docEn: "Share of events removed. The draw is per event, not per note: a chord leaves whole or stays whole." },
      { nom: "Garder les temps", nomEn: "Keep beats", type: "choix",
        options: ["Non", "Oui"], optionsEn: ["No", "Yes"], optionIds: ["non", "oui"],
        defaut: "Oui", defautEn: "Yes",
        doc: "Épargne les événements qui tombent sur un temps. Une trame éclaircie entièrement au hasard perd sa pulsation ; on veut souvent l'alléger sans la dissoudre.",
        docEn: "Spares the events that land on a beat. A texture thinned purely at random loses its pulse; one often wants to lighten it without dissolving it." },
      { nom: "Durée d'un temps", nomEn: "Beat length", type: "nombre", plage: [0.05, 4], pas: 0.05, defaut: 0.5, unite: "s",
        doc: "Ce qui compte pour un temps, en secondes. À 120 BPM, la noire fait 0,5 s.",
        docEn: "What counts as a beat, in seconds. At 120 BPM, a quarter note is 0.5 s." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 0,
        doc: "0 = tirée au sort à chaque exécution, et affichée dans le message. Toute autre valeur rejoue exactement le même éclaircissement.",
        docEn: "0 = drawn at random on every run, and shown in the message. Any other value replays the exact same thinning." },
      ...PARAMETRES_RENDU_MOTIF,
    ],
    async executer(ctx: any) {
      const notes = await notesDuMidi(ctx.entree(0));
      if (!notes) return { valeurs: [null, null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      if (notes.length === 0) return { valeurs: [null, null], message: traduire("msg.aucune_note") };
      const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      const sortie = eclaircir(notes, ctx.paramNombre("Proportion", 30) / 100, aleatoire, {
        preserverPremierTemps: ctx.paramTexte("Garder les temps", "oui") === "oui",
        dureeTemps: ctx.paramNombre("Durée d'un temps", 0.5),
      });
      if (sortie.length === 0) return { valeurs: [null, null], message: traduire("msg.motif.toutRetire") };
      const [audio, midi] = await rendreMotif(ctx, sortie, canalDominant(notes));
      return {
        valeurs: [audio, midi],
        message: traduire("msg.motif.eclaircir", notes.length - sortie.length, notes.length, graine),
      };
    },
  },
  {
    id: "motif-retrograde", nom: "Rétrograde et palindrome", nomEn: "Retrograde and Palindrome",
    univers: "Traitement", famille: "Effets",
    resume: "Joue un motif à l'envers, ou en aller-retour.",
    resumeEn: "Plays a pattern backwards, or there and back.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: SORTIES_MOTIF,
    parametres: [
      { nom: "Sens", nomEn: "Direction", type: "choix",
        options: ["Rétrograde", "Aller-retour", "Retour-aller"],
        optionsEn: ["Retrograde", "There and back", "Back and there"],
        optionIds: ["retrograde", "aller-retour", "retour-aller"],
        defaut: "Aller-retour", defautEn: "There and back",
        doc: "« Rétrograde » ne rend que le motif à l'envers. « Aller-retour » met le motif puis son rétrograde à la suite, ce qui donne un palindrome. « Retour-aller » commence par le rétrograde, ce qui fait entendre le motif d'origine comme une résolution.",
        docEn: "« Retrograde » outputs the reversed pattern only. « There and back » puts the pattern then its retrograde one after the other, giving a palindrome. « Back and there » starts with the retrograde, which makes the original pattern sound like a resolution." },
      { nom: "Rejouer la charnière", nomEn: "Repeat the hinge", type: "choix",
        options: ["Non", "Oui"], optionsEn: ["No", "Yes"], optionIds: ["non", "oui"],
        defaut: "Non", defautEn: "No",
        doc: "Sort de l'événement du retournement. Do-ré-mi suivi de son rétrograde donne do-ré-mi-mi-ré-do, où le mi est joué deux fois ; le palindrome qu'on écrit en musique est do-ré-mi-ré-do, avec un seul mi au sommet. La répétition marque le retournement, son absence le rend fluide. Sans effet en mode « Rétrograde ».",
        docEn: "What becomes of the turning event. C-D-E followed by its retrograde gives C-D-E-E-D-C, where the E is played twice; the palindrome one writes in music is C-D-E-D-C, with a single E at the top. Repeating marks the turn, dropping it makes it flow. No effect in « Retrograde » mode." },
      ...PARAMETRES_RENDU_MOTIF,
    ],
    async executer(ctx: any) {
      const notes = await notesDuMidi(ctx.entree(0));
      if (!notes) return { valeurs: [null, null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      if (notes.length === 0) return { valeurs: [null, null], message: traduire("msg.aucune_note") };
      const sens = ctx.paramTexte("Sens", "aller-retour") as SensMotif;
      const pivot = ctx.paramTexte("Rejouer la charnière", "non") === "oui";
      const sortie = palindrome(notes, sens, pivot);
      const [audio, midi] = await rendreMotif(ctx, sortie, canalDominant(notes));
      return {
        valeurs: [audio, midi],
        message: traduire("msg.motif.retrograde", evenements(sortie).length, evenements(notes).length),
      };
    },
  },
  {
    id: "motif-repeter-tourner", nom: "Répéter et tourner", nomEn: "Ply and Rotate",
    univers: "Traitement", famille: "Effets",
    resume: "Répète chaque note dans sa propre durée, et décale les hauteurs sur la grille.",
    resumeEn: "Repeats each note within its own duration, and shifts the pitches along the grid.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: SORTIES_MOTIF,
    parametres: [
      { nom: "Répétitions", nomEn: "Repeats", type: "nombre", plage: [1, 16], pas: 1, defaut: 2,
        doc: "Nombre de fois que chaque événement est joué à l'intérieur de sa durée d'origine. La grille ne se déplace pas : elle se remplit. 1 = aucune répétition.",
        docEn: "How many times each event is played inside its original duration. The grid does not move: it fills up. 1 = no repetition." },
      { nom: "Rotation", nomEn: "Rotation", type: "nombre", plage: [-32, 32], pas: 1, defaut: 0,
        doc: "Décale la suite des hauteurs sur la grille rythmique, sans toucher aux départs : le rythme reste, la mélodie glisse. La rotation s'applique après les répétitions, donc sur le motif densifié.",
        docEn: "Shifts the pitch sequence along the rhythmic grid without touching the onsets: the rhythm stays, the melody slides. The rotation applies after the repeats, hence on the densified pattern." },
      ...PARAMETRES_RENDU_MOTIF,
    ],
    async executer(ctx: any) {
      const notes = await notesDuMidi(ctx.entree(0));
      if (!notes) return { valeurs: [null, null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      if (notes.length === 0) return { valeurs: [null, null], message: traduire("msg.aucune_note") };
      const repetitions = ctx.paramNombre("Répétitions", 2);
      const rotation = ctx.paramNombre("Rotation", 0);
      const sortie = repeterEtTourner(notes, repetitions, rotation);
      const [audio, midi] = await rendreMotif(ctx, sortie, canalDominant(notes));
      return {
        valeurs: [audio, midi],
        message: traduire("msg.motif.repeter", sortie.length, repetitions, rotation),
      };
    },
  },
  {
    id: "markov-midi", nom: "Chaîne de Markov", nomEn: "Markov Chain",
    univers: "Traitement", famille: "Effets",
    resume: "Apprend les enchaînements de notes d'un MIDI et en engendre de nouveaux, avec la table de transitions en clair.",
    resumeEn: "Learns a MIDI file's note transitions and generates new ones, with the transition table in plain sight.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "MIDI", nomEn: "MIDI", type: "midi" },
      { nom: "Table", nomEn: "Table", type: "texte" },
    ],
    parametres: [
      { nom: "Ordre", nomEn: "Order", type: "nombre", plage: [1, 4], pas: 1, defaut: 2,
        doc: "Nombre de notes regardées en arrière. À 1, le morceau ressort dans sa tonalité mais sans phrase ; à 2 ou 3, ses tournures réapparaissent ; au-delà, la chaîne n'a plus le choix et recopie la source. La sortie texte indique la part de contextes sans choix, qui mesure ce sur-apprentissage.",
        docEn: "How many notes are looked back on. At 1, the piece comes out in its key but without phrasing; at 2 or 3, its turns of phrase reappear; beyond that, the chain has no choice left and copies the source. The text output gives the share of contexts with no choice, which measures that overfitting." },
      { nom: "Notes", nomEn: "Notes", type: "nombre", plage: [4, 2000], pas: 1, defaut: 64,
        doc: "Nombre de notes engendrées.", docEn: "Number of notes generated." },
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [40, 300], pas: 1, defaut: 120, unite: "BPM",
        doc: "Vitesse du MIDI produit. Les durées de la source ne sont pas apprises : le composant n'imite que les hauteurs, et les joue en croches.",
        docEn: "Speed of the produced MIDI. The source's durations are not learned: the node imitates pitches only, and plays them as eighth notes." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 0,
        doc: "0 = tirée au sort à chaque exécution, et affichée dans le message. Toute autre valeur rejoue exactement la même suite.",
        docEn: "0 = drawn at random on every run, and shown in the message. Any other value replays the exact same sequence." },
      { ...PARAMETRE_SYNTHESE,
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume du rendu audio.", docEn: "Output volume." },
    ],
    async executer(ctx: any) {
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null, null, null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      const { notes } = analyserMidi(parseMidi(new Uint8Array(await fichier.arrayBuffer())));
      if (notes.length === 0) return { valeurs: [null, null, null], message: traduire("msg.aucune_note") };
      const ordre = ctx.paramNombre("Ordre", 2);
      const table = apprendre(
        notes.map((n: any) => ({ note: n.note, velocite: n.velocite ?? 90, debut: n.debut, fin: n.fin })),
        ordre,
      );
      if (table.size === 0) return { valeurs: [null, null, null], message: traduire("msg.markov.tropCourt") };
      const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      const hauteurs = engendrer(table, ordre, ctx.paramNombre("Notes", 64), aleatoire);
      const tempo = ctx.paramNombre("Tempo", 120);
      const pas = (60 / tempo) / 2;
      const engendrees = hauteurs.map((note, i) => ({ note, velocite: 90, debut: i * pas, fin: i * pas + pas * 0.9 }));
      const stats = statistiques(table);
      const rapport = [
        traduire("msg.markov.stats", stats.contextes, stats.transitions, Math.round(stats.partSansChoix * 100)),
        "",
        tableEnTexte(table),
      ].join("\n");
      // La chaîne n'apprend que des hauteurs : elle ne reprend donc jamais le canal de
      // la source, et sa sortie est mélodique même apprise sur une piste de batterie.
      const [audio, midi] = await rendreMotif(ctx, engendrees, 0);
      return {
        valeurs: [audio, midi, rapport],
        message: traduire("msg.markov.resultat", engendrees.length, stats.contextes, graine),
      };
    },
  },
  {
    id: "temperament", nom: "Tempérament", nomEn: "Temperament",
    univers: "Traitement", famille: "Effets",
    resume: "Rejoue un MIDI dans un tempérament historique ou en intonation juste, au lieu du tempérament égal.",
    resumeEn: "Replays a MIDI file in a historical temperament or just intonation, instead of equal temperament.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    // UNE TROISIÈME SORTIE, APRÈS LES DEUX AUTRES : les arêtes enregistrées visent les ports zéro
    // et un, qui ne bougent pas. Le nœud calculait déjà des hauteurs fractionnaires et les jetait
    // après les avoir rendues en son : aucune ne sortait, donc rien ne pouvait être enchaîné ni
    // gravé. Elles sortent maintenant sur le flux qui sait les porter, et la même intonation juste
    // peut aller vers une partition, vers un autre traitement, ou vers les deux.
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Écarts", nomEn: "Deviations", type: "texte" },
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
    ],
    parametres: [
      { nom: "Tempérament", nomEn: "Temperament", type: "choix",
        options: TEMPERAMENTS.map((t) => t.fr),
        optionsEn: TEMPERAMENTS.map((t) => t.en),
        optionIds: TEMPERAMENTS.map((t) => t.id),
        defaut: "Intonation juste", defautEn: "Just intonation",
        doc: "L'accord employé. « Égal » est celui de tous les autres composants ; les autres donnent à chaque tonalité une couleur propre.",
        docEn: "The tuning used. « Equal » is the one every other node uses; the others give each key its own colour." },
      { ...PARAMETRE_TONIQUE,
        doc: "La note sur laquelle le tempérament est accordé. C'est elle qui sonne pure ; les tonalités éloignées s'écartent d'autant plus.",
        docEn: "The note the temperament is tuned on. It is the one that sounds pure; distant keys drift the further away." },
      { ...PARAMETRE_SYNTHESE, doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM.", docEn: "Auto = SoundFont if an SF2 file is loaded, else FM." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume du rendu.", docEn: "Output volume." },
    ],
    async executer(ctx: any) {
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null, null, null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      const { analyserMidi, rendreSequence } = await import("../audio");
      const { notes } = analyserMidi(parseMidi(new Uint8Array(await fichier.arrayBuffer())));
      if (notes.length === 0) return { valeurs: [null, null, null], message: traduire("msg.aucune_note") };
      const temp = temperament(ctx.paramTexte("Tempérament", "juste"));
      const tonique = parseInt(ctx.paramTexte("Tonique", "0"), 10) || 0;
      // Les hauteurs deviennent FRACTIONNAIRES : c'est l'écart qui s'entend. Les deux
      // rendus d'Attic l'acceptent, puisqu'ils en tirent une fréquence ou un rapport de
      // lecture d'échantillon.
      const temperees = notes.map((n: any) => ({
        note: noteTemperee(n.note, tonique, temp),
        velocite: n.velocite ?? 90,
        debut: n.debut,
        fin: n.fin,
      }));
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const modeRendu: "FM/Oscillateurs" | "SoundFont" = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
      const { programme, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
      const buffer = await rendreSequence(temperees, modeRendu, ctx.paramNombre("Volume", 80), programme, banque);
      const nom = langueCourante() === "en" ? temp.en : temp.fr;
      const explication = langueCourante() === "en" ? temp.noteEn : temp.noteFr;
      const horsTempere = temperees.filter((n) => !Number.isInteger(n.note)).length;
      return {
        valeurs: [
          buffer,
          [nom, tableEcarts(temp), "", explication].join("\n"),
          { notes: temperees, titre: nom },
        ],
        message: `${nom} · ${notes.length} notes · ${horsTempere} ${langueCourante() === "en" ? "off the keyboard" : "hors du clavier"}`,
      };
    },
  },
  {
    id: "transposeur-quantiseur-midi", nom: "Transposeur/Quantiseur MIDI", nomEn: "MIDI Transposer/Quantizer",
    univers: "Traitement", famille: "Effets",
    resume: "Transpose et/ou quantifie un fichier MIDI.",
    resumeEn: "Transposes and/or quantizes a MIDI file.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Transposition", nomEn: "Transpose", plage: [-24, 24], pas: 1, defaut: 0, unite: " ½-ton", uniteEn: "st",
        doc: "Transposition en demi-tons (−24 à +24). 0 = aucune transposition.",
        docEn: "Transposition in semitones (−24 to +24). 0 = no transposition." },
      { nom: "Quantisation", nomEn: "Quantization", type: "choix",
        options: ["Aucune", "1/4", "1/8", "1/16", "1/32", "1/8 triplet", "1/16 triplet"],
        optionsEn: ["None", "1/4", "1/8", "1/16", "1/32", "1/8 triplet", "1/16 triplet"],
        optionIds: ["none", "1/4", "1/8", "1/16", "1/32", "1/8t", "1/16t"],
        defaut: "1/16",
        doc: "Grille de quantification des départs de notes. Aligner les notes sur la grille rythmique choisie.",
        docEn: "Quantization grid for note onsets. Snaps notes to the chosen rhythmic grid.", defautEn: "1/16" },
      { nom: "Quantifier fins", nomEn: "Quantize ends", type: "choix",
        options: ["Non", "Oui"], optionsEn: ["No", "Yes"], optionIds: ["no", "yes"],
        defaut: "Non",
        doc: "Si « Oui », les fins de notes sont aussi alignées sur la grille (peut raccourcir/allonger les notes).",
        docEn: "If « Yes », note ends are also snapped to the grid (may shorten/lengthen notes).", defautEn: "No" },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx: any) {
      const { transposerQuantifierMidi } = await import("../audio");
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      const demiTons = Math.round(ctx.paramNombre("Transposition", 0));
      const grille = ctx.paramTexte("Quantisation", "1/16");
      const quantifierFin = ctx.paramTexte("Quantifier fins", "no") === "yes";
      const nouvFichier = await appliquerInstrumentMidi(
        await transposerQuantifierMidi(fichier, demiTons, grille, quantifierFin),
        ctx.paramNombre("Instrument", 0),
      );
      const msgs: string[] = [];
      if (demiTons !== 0) msgs.push(traduire("msg.transposition_var_0_var_1", `${demiTons > 0 ? "+" : ""}${demiTons}`, Math.abs(demiTons) > 1 ? "s" : ""));
      if (grille !== "none") msgs.push(traduire("msg.quantification_var_0_var_1", grille, quantifierFin ? " +fins" : ""));
      return { valeurs: [nouvFichier], message: msgs.length > 0 ? msgs.join(" · ") : traduire("msg.aucune_modification") };
   },
  },
  {
    id: "arpegiateur-midi", nom: "Arpégiateur MIDI", nomEn: "MIDI Arpeggiator",
    univers: "Traitement", famille: "Effets",
    resume: "Arpège les accords d'un fichier MIDI selon un motif et une direction.",
    resumeEn: "Arpeggiates chords from a MIDI file according to a pattern and direction.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Direction", nomEn: "Direction", type: "choix",
        options: ["Montant", "Descendant", "UpDown", "DownUp", "Aléatoire"], optionIds: ["Montant","Descendant","UpDown","DownUp","Aléatoire"],
        optionsEn: ["Up", "Down", "UpDown", "DownUp", "Random"],
        defaut: "Montant",
        doc: "Ordre de lecture des notes de l'accord. Up = du grave à l'aigu ; Down = de l'aigu au grave ; UpDown = aller-retour ; Random = ordre aléatoire.",
        docEn: "Order in which chord notes are played. Up = low to high ; Down = high to low ; UpDown = back and forth ; Random = random order.", defautEn: "Up" },
      { nom: "Motif", nomEn: "Pattern", type: "choix",
        options: ["Droit", "1232", "12321", "1321", "1213"], optionIds: ["Droit","1232","12321","1321","1213"],
        optionsEn: ["Straight", "1232", "12321", "1321", "1213"],
        defaut: "Droit",
        doc: "Motif de répétition intra-accord (1=note basse, 2=médium, 3=haute). « Droit » = joue les notes dans l'ordre de la direction.",
        docEn: "Intra-chord repetition pattern (1=low note, 2=mid, 3=high). « Straight » = plays notes in the direction order.", defautEn: "Straight" },
      { nom: "Vitesse", nomEn: "Speed", type: "choix",
        options: ["1/8", "1/16", "1/32", "1/8 triplet", "1/16 triplet"],
        optionsEn: ["1/8", "1/16", "1/32", "1/8 triplet", "1/16 triplet"],
        defaut: "1/16",
        doc: "Vitesse de l'arpège (division du temps).",
        docEn: "Arpeggio speed (time division).", defautEn: "1/16" },
      { nom: "Octaves", nomEn: "Octaves", plage: [1, 4], pas: 1, defaut: 1,
        doc: "Nombre d'octaves sur lesquelles l'arpège se déploie (chaque octave ajoute +12 demi-tons).",
        docEn: "Number of octaves the arpeggio spans (each octave adds +12 semitones)." },
      { nom: "Graine", graine: true, nomEn: "Seed", plage: [0, 999999], pas: 1, defaut: 0,
        doc: "Graine de l'ordre des notes, sans effet hors du mode « Aléatoire ». 0 = tirée au sort à chaque exécution, et affichée dans le message pour pouvoir être recopiée ici.",
        docEn: "Seed for the note order; no effect outside the « Random » mode. 0 = drawn at random on every run, and shown in the message so it can be copied back here." },
      { nom: "Durée note", nomEn: "Note length", plage: [10, 100], pas: 5, defaut: 50, unite: "%",
        doc: "Durée de chaque note arpégée en pourcentage du pas de temps. 100% = legato, 50% = staccato.",
        docEn: "Length of each arpeggiated note as a percentage of the step time. 100% = legato, 50% = staccato." },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx: any) {
      const { arpegerMidi } = await import("../audio");
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      const direction = ctx.paramTexte("Direction", "Montant");
      const motif = ctx.paramTexte("Motif", "Droit");
      const vitesse = ctx.paramTexte("Vitesse", "1/16");
      const octaves = Math.round(ctx.paramNombre("Octaves", 1));
      const dureeNote = ctx.paramNombre("Durée note", 50);
      const { graine, aleatoire: aleatoireArpege } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      const nouvFichier = await appliquerInstrumentMidi(
        await arpegerMidi(fichier, motif, direction, vitesse, octaves, dureeNote, aleatoireArpege),
        ctx.paramNombre("Instrument", 0),
      );
      return { valeurs: [nouvFichier], message: `${traduire("msg.arp_ge_var_0_var_1_var_2_oct", direction, vitesse, octaves)} · graine ${graine}` };
   },
  },
  {
    id: "jointure-midi", nom: "Jointure MIDI", nomEn: "MIDI Join",
    univers: "Traitement", famille: "Montage",
    resume: "Place deux fichiers MIDI l'un après l'autre avec un chevauchement.",
    resumeEn: "Places two MIDI files one after another with an overlap.",
    entrees: [{ nom: "MIDI 1", nomEn: "MIDI 1", type: "midi" }, { nom: "MIDI 2", nomEn: "MIDI 2", type: "midi" }],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Chevauchement", nomEn: "Overlap", plage: [0, 30], pas: 0.1, defaut: 0, unite: "s",
        doc: "Durée pendant laquelle le deuxième MIDI démarre avant la fin du premier. 0 = concaténation simple.",
        docEn: "Duration for which the second MIDI starts before the first ends. 0 = simple concatenation." },
    ],
    async executer(ctx: any) {
      const fichier1 = ctx.entree(0);
      const fichier2 = ctx.entree(1);
      if (!(fichier1 instanceof File) || !(fichier2 instanceof File)) {
        return { valeurs: [null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      }
      const chevauchement = ctx.paramNombre("Chevauchement", 0);
      const nouvFichier = await joindreMidi(fichier1, fichier2, chevauchement);
      const { notes, dureeTotale } = analyserMidi(parseMidi(new Uint8Array(await nouvFichier.arrayBuffer())));
      return { valeurs: [nouvFichier], message: traduire("msg.jointure_midi_var_0_notes_var_1_s", notes.length, dureeTotale.toFixed(2)) };
    },
  },
  {
    id: "boucle-midi", nom: "Boucle MIDI", nomEn: "MIDI Loop",
    univers: "Traitement", famille: "Montage",
    resume: "Répète un fichier MIDI un nombre de fois donné.",
    resumeEn: "Repeats a MIDI file a given number of times.",
    entrees: [{ nom: "MIDI", nomEn: "MIDI", type: "midi" }],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Répétitions", nomEn: "Repeats", plage: [1, 32], pas: 1, defaut: 4,
        doc: "Nombre de fois où le fichier MIDI est rejoué à la suite.",
        docEn: "Number of times the MIDI file is replayed in a row." },
      { nom: "Fondu", nomEn: "Fade", plage: [0, 1000], pas: 1, defaut: 0, unite: "ms",
        doc: "Chevauchement entre deux répétitions. 0 = pas de chevauchement (raccord sec).",
        docEn: "Overlap between two repetitions. 0 = no overlap (hard join)." },
    ],
    async executer(ctx: any) {
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      const repetitions = Math.round(ctx.paramNombre("Répétitions", 4));
      const fondu = ctx.paramNombre("Fondu", 0);
      const nouvFichier = await bouclerMidi(fichier, repetitions, fondu);
      const { notes, dureeTotale } = analyserMidi(parseMidi(new Uint8Array(await nouvFichier.arrayBuffer())));
      return { valeurs: [nouvFichier], message: traduire("msg.boucle_midi_var_0_repetitions_var_1_notes_var_2_s", repetitions, notes.length, dureeTotale.toFixed(2)) };
    },
  },
  {
    id: "aligneur-piste", nom: "Aligneur de piste", nomEn: "Track Aligner",
    univers: "Traitement", famille: "Montage",
    // AUCUN LECTEUR ICI. L'aperçu joue la PREMIÈRE sortie audio, et celle-ci est « Référence »,
    // c'est-à-dire l'entrée rendue telle quelle : le lecteur proposait d'écouter ce qu'on venait de
    // brancher, et non le travail du nœud. Ses deux sorties sont des pairs, la référence et la piste
    // mise à sa longueur, et aucune ne représente à elle seule ce qu'il produit.
    sansApercuAudio: true,
    resume: "Ajuste une piste à la longueur d'une référence (silence ou fade).",
    resumeEn: "Aligns a track to a reference length (silence or fade).",
    entrees: [{ nom: "Référence", nomEn: "Reference", type: "audio" }, { nom: "Piste", nomEn: "Track", type: "audio" }],
    sorties: [{ nom: "Référence", nomEn: "Reference", type: "audio" }, { nom: "Piste alignée", nomEn: "Aligned track", type: "audio" }],
    parametres: [
      { nom: "Position", nomEn: "Position", type: "choix",
        options: ["Avant", "Après"], optionsEn: ["Before", "After"], optionIds: ["before", "after"],
        defaut: "Après",
        doc: "Où ajuster la différence. Si la piste est trop courte : ajoute du silence au début (« Avant ») ou à la fin (« Après »). Si trop longue : fade d'ouverture (« Avant », garde le début) ou fade de fermeture (« Après », garde la fin).",
        docEn: "Where to adjust the difference. If the track is too short: adds silence at the start (« Before ») or end (« After »). If too long: fade in (« Before », keeps the start) or fade out (« After », keeps the end).", defautEn: "After" },
    ],
    async executer(ctx: any) {
      const ref = ctx.entree(0);
      const piste = ctx.entree(1);
      if (!(ref instanceof AudioBuffer)) return { valeurs: [null, null], message: traduire("msg.branchez_une_r_f_rence_entr_e_1") };
      if (!(piste instanceof AudioBuffer)) return { valeurs: [ref, null], message: traduire("msg.branchez_une_piste_aligner_entr_e_2") };
      const { alignerPiste } = await import("../audio");
      const position = ctx.paramTexte("Position", "after");
      const [refOut, pisteOut] = alignerPiste(ref, piste, position === "before" ? "avant" : "apres");
      const diff = piste.length - ref.length;
      let msg: string;
      if (diff < 0) msg = `Piste ${(-diff / ref.sampleRate).toFixed(2)}s trop courte → silence ${position === "before" ? "au début" : "à la fin"}`;
      else if (diff > 0) msg = `Piste ${(diff / ref.sampleRate).toFixed(2)}s trop longue → fade ${position === "before" ? "d'ouverture" : "de fermeture"}`;
      else msg = "Pistes de même longueur — aucune modification";
      return { valeurs: [refOut, pisteOut], message: msg };
   },
 },
] as FicheAudio[]).map(avecDoc);
