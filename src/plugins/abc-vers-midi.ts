// plugins/abc-vers-midi.ts — Nœud « ABC → MIDI ».
// Lit une partition en notation ABC et la rend en MIDI multipiste + audio. La
// lecture et l'écriture MIDI vivent dans audio/abc.ts, testées.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { decouperMorceaux, lireMorceau, morceauVersMidi } from "../audio/abc";
import { rendreMidiDepuisBytes } from "../audio/midi";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2 } from "./soundfontGlobal";

const EXEMPLE = `X:1
T:Speed the Plough
M:4/4
L:1/8
Q:1/4=120
K:G
|:"G"GABG DGBG|"C"cBcd "G"efge|"D"dcBA GFGA|"G"BG"D"AF "G"G4:|`;

export const fiches: FicheAudio[] = ([
  {
    id: "abc-vers-midi", nom: "ABC → MIDI", nomEn: "ABC → MIDI",
    univers: "Traitement", famille: "Conversion",
    resume: "Lit une partition en notation ABC (mélodie, accords chiffrés, reprises, plusieurs voix) et la rend en MIDI et en audio.",
    resumeEn: "Reads a score in ABC notation (melody, chord symbols, repeats, several voices) and renders it to MIDI and audio.",
    entrees: [{ nom: "Texte", nomEn: "Text", type: "texte", requis: false }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "MIDI", type: "midi" },
      { nom: "Tonalité", nomEn: "Key", type: "texte" },
    ],
    parametres: [
      { nom: "ABC", nomEn: "ABC", type: "texte", defaut: EXEMPLE, defautEn: EXEMPLE,
        doc: "Partition ABC, utilisée si aucune entrée texte n'est connectée. Accepte un fichier entier à plusieurs morceaux (champ X:), le texte libre qui précède un X: et les blocs de code d'un modèle de langage.",
        docEn: "ABC score, used when no text input is connected. Accepts a whole file with several tunes (X: field), free text before an X:, and a language model's code blocks." },
      { nom: "Morceau", nomEn: "Tune", type: "nombre", plage: [1, 200], pas: 1, defaut: 1,
        doc: "Quel morceau jouer quand le texte en contient plusieurs, dans l'ordre du fichier.",
        docEn: "Which tune to play when the text holds several, in file order." },
      { nom: "Accords chiffrés", nomEn: "Chord symbols", type: "choix",
        options: ["Jouer", "Ignorer"], optionsEn: ["Play", "Ignore"], optionIds: ["jouer", "ignorer"],
        defaut: "Jouer", defautEn: "Play",
        doc: "Jouer les accords chiffrés (« Am », « G7 », « C/E ») sur une piste d'accompagnement, chacun tenu jusqu'au suivant. Ils sortent sur leur propre canal MIDI.",
        docEn: "Play chord symbols (« Am », « G7 », « C/E ») on an accompaniment track, each held until the next. They go out on their own MIDI channel." },
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [30, 300], pas: 1, defaut: 120, unite: "BPM",
        doc: "Tempo en noires par minute, utilisé seulement si la partition n'a pas de champ Q:.",
        docEn: "Tempo in quarter notes per minute, used only when the score has no Q: field." },
      PARAMETRE_SYNTHESE,
      { ...PARAMETRE_INSTRUMENT_SF2, nom: "Instrument", nomEn: "Instrument",
        doc: "Preset du SoundFont pour les voix de la partition.",
        docEn: "SoundFont preset for the score's voices." },
      { ...PARAMETRE_INSTRUMENT_SF2, nom: "Instrument accords", nomEn: "Chord instrument", defaut: 24,
        doc: "Preset du SoundFont pour l'accompagnement des accords chiffrés. Par défaut une guitare nylon, pour qu'il se distingue de la mélodie.",
        docEn: "SoundFont preset for the chord-symbol accompaniment. A nylon guitar by default, so it stands apart from the melody." },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume de l'audio synthétisé.", docEn: "Synthesized audio volume." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const texte = typeof entree === "string" && entree.trim() ? entree : ctx.paramTexte("ABC", EXEMPLE);
      const morceaux = decouperMorceaux(texte);
      if (morceaux.length === 0) {
        return { valeurs: [null, null, null], erreur: true, message: traduire("msg.abc.aucun_morceau") };
      }
      const index = Math.max(1, Math.min(morceaux.length, Math.round(ctx.paramNombre("Morceau", 1))));
      const m = lireMorceau(morceaux[index - 1], index);
      const nbNotes = m.voix.reduce((s, v) => s + v.notes.length, 0);
      if (nbNotes === 0) {
        return { valeurs: [null, null, null], erreur: true, message: traduire("msg.abc.aucune_note_var_0", m.avertissements.join(" · ") || "—") };
      }

      const { octets, tempo } = morceauVersMidi(m, {
        tempoParDefaut: ctx.paramNombre("Tempo", 120),
        instrumentVoix: ctx.paramNombre("Instrument", 0),
        instrumentAccords: ctx.paramNombre("Instrument accords", 24),
        jouerAccords: ctx.paramTexte("Accords chiffrés", "jouer") !== "ignorer",
      });

      // Le rendu suit les instruments écrits DANS le fichier, canal par canal :
      // passer un instrument global mettrait la mélodie et les accords au même
      // timbre — le défaut corrigé sur le Groove Box.
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const modeRendu: "FM/Oscillateurs" | "SoundFont" = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
      ctx.onProgress(traduire("progress.abc.rendu"));
      const audio = await rendreMidiDepuisBytes(octets, modeRendu, ctx.paramNombre("Volume", 80));
      const midi = new File([octets as unknown as BlobPart], `${(m.titre || "abc").replace(/[^\w\-]+/g, "_")}.mid`, { type: "audio/midi" });

      // Le message nomme ce qui n'a pas été lu : une partition rendue en partie
      // sans le dire ferait croire à une erreur de la partition elle-même.
      const avert = m.avertissements.length > 0
        ? traduire("msg.abc.avertissements_var_0_var_1", m.avertissements.length, m.avertissements.slice(0, 3).join(" · "))
        : "";
      const plusieurs = morceaux.length > 1 ? traduire("msg.abc.morceau_var_0_var_1", index, morceaux.length) : "";
      return {
        valeurs: [audio, midi, m.tonalite.nom === "none" ? null : m.tonalite.nom],
        message: traduire("msg.abc.var_0_var_1_var_2_var_3_var_4_var_5",
          m.titre || traduire("msg.abc.sans_titre"), m.tonalite.nom, m.metrique?.texte ?? "—",
          Math.round(tempo), nbNotes, audio.duration.toFixed(1)) + plusieurs + avert,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
