// plugins/midi-vers-abc.ts — Nœud « MIDI → ABC ».
// Écrit un fichier MIDI en notation ABC, pour le rendre lisible et modifiable
// en texte. L'écriture vit dans audio/midi-vers-abc.ts, testée.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { midiVersAbc } from "../audio/midi-vers-abc";

const METRIQUES = ["fichier", "2/4", "3/4", "4/4", "5/4", "6/8", "7/8", "9/8", "12/8"];
const GRILLES: Record<string, "auto" | number> = { auto: "auto", "2": 2, "4": 4, "8": 8, "3": 3, "6": 6, "12": 12 };

export const fiches: FicheAudio[] = ([
  {
    id: "midi-vers-abc", nom: "MIDI → ABC", nomEn: "MIDI → ABC",
    univers: "Visualisation", famille: "Notation",
    resume: "Écrit un fichier MIDI en notation ABC : une partition en texte, lisible et modifiable par un modèle de langage.",
    resumeEn: "Writes a MIDI file in ABC notation: a text score, readable and editable by a language model.",
    entrees: [{ nom: "MIDI", type: "midi", requis: true }],
    sorties: [
      { nom: "ABC", type: "texte" },
      { nom: "Tonalité", nomEn: "Key", type: "texte" },
    ],
    parametres: [
      { nom: "Métrique", nomEn: "Meter", type: "choix",
        options: ["Du fichier", "2/4", "3/4", "4/4", "5/4", "6/8", "7/8", "9/8", "12/8"],
        optionsEn: ["From file", "2/4", "3/4", "4/4", "5/4", "6/8", "7/8", "9/8", "12/8"],
        optionIds: METRIQUES, defaut: "Du fichier", defautEn: "From file",
        doc: "Où placer les barres. ATTENTION : les nœuds d'Attic écrivent tous « 4/4 » dans leurs fichiers, même pour une valse — « Du fichier » donne donc presque toujours 4/4. Choisissez la métrique réelle à la main ; elle n'est pas devinée, parce qu'une métrique mal devinée donne une partition illisible sans le dire.",
        docEn: "Where to put the bar lines. NOTE: Attic's nodes all write « 4/4 » into their files, even for a waltz — « From file » therefore almost always gives 4/4. Pick the real meter by hand; it is not guessed, because a wrongly guessed meter gives an unreadable score without saying so." },
      { nom: "Tonalité", nomEn: "Key", type: "texte", defaut: "Auto", defautEn: "Auto",
        doc: "« Auto » la déduit des notes (méthode de Krumhansl, la même que l'analyse harmonique sur l'audio). FIABLE SUR DE L'HARMONIE SEULEMENT : mesuré sur le Groove Box, juste 24 fois sur 24 sur la partie d'accords, 4 sur 24 sur la mélodie seule, 0 sur 24 sur la basse seule — et la confiance affichée ne permet pas de voir l'erreur. Une ligne seule est donc signalée : imposez alors la tonalité, sous forme de champ K: d'ABC (« G », « Am », « Ddor », « Bb »…). Elle décide de l'armure, donc de l'orthographe : fa dièse ou sol bémol.",
        docEn: "« Auto » infers it from the notes (Krumhansl's method, the same as the harmonic analysis on audio). RELIABLE ON HARMONY ONLY: measured on the Groove Box, right 24 times out of 24 on the chord part, 4 out of 24 on the melody alone, 0 out of 24 on the bass alone — and the displayed confidence does not reveal the error. A single line is therefore flagged: impose the key then, as an ABC K: field (« G », « Am », « Ddor », « Bb »…). It sets the key signature, hence the spelling: F sharp or G flat." },
      { nom: "Grille", nomEn: "Grid", type: "choix",
        options: ["Automatique", "Croches (1/8)", "Doubles (1/16)", "Triples (1/32)", "Triolets de croches", "Triolets de doubles", "Doubles et triolets"],
        optionsEn: ["Automatic", "Eighths (1/8)", "Sixteenths (1/16)", "32nds (1/32)", "Eighth triplets", "Sixteenth triplets", "Sixteenths and triplets"],
        optionIds: ["auto", "2", "4", "8", "3", "6", "12"], defaut: "Automatique", defautEn: "Automatic",
        doc: "Grille sur laquelle les notes sont calées. Automatique : la plus grossière sur laquelle toutes les notes tombent exactement, s'il y en a une — un MIDI généré ne bouge alors pas d'un tick —, sinon les doubles croches. Sur un jeu capturé ou humanisé, les notes sont déplacées et le message les compte.",
        docEn: "Grid the notes are snapped to. Automatic: the coarsest one on which every note falls exactly, if any — a generated MIDI then does not move by a single tick — otherwise sixteenths. On captured or humanised playing, notes are moved and the message counts them." },
      { nom: "Chevauchements", nomEn: "Overlaps", type: "choix",
        options: ["Voix séparées (exact)", "Raccourcir en une ligne"],
        optionsEn: ["Separate voices (exact)", "Shorten into one line"],
        optionIds: ["voix", "raccourcir"], defaut: "Voix séparées (exact)", defautEn: "Separate voices (exact)",
        doc: "Que faire d'une note qui sonne encore quand la suivante commence. Voix séparées : elle part dans une voix de plus, et la partition relue redonne exactement les mêmes notes. Raccourcir : elle est coupée à l'attaque de la suivante, pour qu'une mélodie jouée legato reste sur une seule ligne — plus lisible, et plus facile à modifier pour un modèle de langage, mais la durée des notes coupées est perdue. Les accords ne sont jamais coupés. La mélodie du Groove Box, dont des notes de même hauteur se recouvrent, sort sur deux voix dans le premier mode et une dans le second.",
        docEn: "What to do with a note still sounding when the next one starts. Separate voices: it goes into an extra voice, and the score read back gives exactly the same notes. Shorten: it is cut at the next attack, so a legato melody stays on a single line — more readable, and easier for a language model to edit, but the length of the cut notes is lost. Chords are never cut. The Groove Box melody, whose same-pitch notes overlap, comes out on two voices in the first mode and one in the second." },
      { nom: "Titre", nomEn: "Title", type: "texte", defaut: "", defautEn: "",
        doc: "Titre écrit dans le champ T:. Vide : le nom de piste du fichier, s'il en a un.",
        docEn: "Title written in the T: field. Empty: the file's track name, if any." },
    ],
    async executer(ctx: any) {
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File) && !(fichier instanceof Blob)) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.midi_abc.aucun_midi") };
      }
      const octets = new Uint8Array(await fichier.arrayBuffer());
      const metrique = ctx.paramTexte("Métrique", "fichier");
      const tonalite = ctx.paramTexte("Tonalité", "Auto").trim();
      let r;
      try {
        r = midiVersAbc(octets, {
          metrique: METRIQUES.includes(metrique) ? metrique : "fichier",
          tonalite: !tonalite || /^auto$/i.test(tonalite) ? "auto" : tonalite,
          grille: GRILLES[ctx.paramTexte("Grille", "auto")] ?? "auto",
          titre: ctx.paramTexte("Titre", ""),
          chevauchements: ctx.paramTexte("Chevauchements", "voix") === "raccourcir" ? "raccourcir" : "voix",
        });
      } catch (e) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.midi_abc.illisible_var_0", String((e as Error).message ?? e)) };
      }
      if (r.notesEcrites === 0) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.midi_abc.aucune_note_var_0", r.batterieIgnoree) };
      }

      // Le message dit ce qui a été DÉCIDÉ pour écrire : la tonalité et sa
      // confiance, la grille et si elle était exacte, les notes déplacées, les
      // voix créées. Rien de cela ne se lit dans la partition elle-même.
      const ton = r.tonaliteAuto
        ? traduire("msg.midi_abc.tonalite_auto_var_0_var_1", r.cle, r.tonaliteAuto.confiance.toFixed(2))
        : `K:${r.cle}`;
      const grille = r.grilleExacte
        ? traduire("msg.midi_abc.grille_exacte_var_0", r.subdivisions)
        : traduire("msg.midi_abc.grille_var_0_var_1", r.subdivisions, r.notesDeplacees);
      const raccourcies = r.notesRaccourcies > 0 ? traduire("msg.midi_abc.raccourcies_var_0", r.notesRaccourcies) : "";
      const avert = raccourcies + (r.avertissements.length > 0 ? ` · ${r.avertissements.join(" · ")}` : "");
      return {
        valeurs: [r.abc, r.tonaliteNom === "none" ? null : r.tonaliteNom],
        message: traduire("msg.midi_abc.var_0_var_1_var_2_var_3_var_4", r.notesEcrites, r.voix, r.metrique, ton, grille) + avert,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
