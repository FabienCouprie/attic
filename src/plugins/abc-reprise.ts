// plugins/abc-reprise.ts — Nœud « Reprise ABC ».
// Ajoute à une partition ABC un accompagnement et une basse dans un style, en
// gardant la mélodie et les accords. Le motif et l'assemblage vivent dans
// audio/abc-reprise.ts, testés.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { reprendreAbc, STYLES, type Style } from "../audio/abc-reprise";
import { rendreMidiDepuisBytes } from "../audio/midi";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2 } from "./soundfontGlobal";

export const fiches: FicheAudio[] = ([
  {
    id: "reprise-abc", nom: "Reprise ABC", nomEn: "ABC Cover",
    univers: "Entrées", famille: "Génération",
    resume: "Reprend une partition ABC dans un autre style : même mélodie, mêmes accords, avec un accompagnement et une basse — ballade, pop, valse, marche, bossa nova.",
    resumeEn: "Covers an ABC score in another style: same melody, same chords, with an accompaniment and a bass — ballad, pop, waltz, march, bossa nova.",
    entrees: [{ nom: "ABC", type: "texte", requis: true }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "MIDI", type: "midi" },
      { nom: "ABC", type: "texte" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Style", nomEn: "Style", type: "choix",
        options: ["Blocs (accords tenus)", "Ballade (arpèges)", "Pop (accords sur les temps)", "Valse (basse – accord – accord)", "Marche (basse – accord)", "Bossa nova"],
        optionsEn: ["Blocks (held chords)", "Ballad (arpeggios)", "Pop (chords on the beats)", "Waltz (bass – chord – chord)", "March (bass – chord)", "Bossa nova"],
        optionIds: [...STYLES], defaut: "Ballade (arpèges)", defautEn: "Ballad (arpeggios)",
        doc: "L'habillage de l'accompagnement. Blocs : accords et basse tenus. Ballade : arpège en croches sur la basse tenue. Pop : accord à chaque temps, basse en croches. Valse : basse au premier temps, accords aux suivants. Marche : basse fondamentale puis quinte sur les temps impairs, accords sur les pairs — mesures à nombre pair de temps. Bossa nova : basse en noire pointée et croche, accords syncopés — 4/4 seulement. Un style qui ne s'applique pas à la métrique est refusé, et le message le dit.",
        docEn: "The accompaniment's style. Blocks: held chords and bass. Ballad: eighth-note arpeggio over a held bass. Pop: a chord on every beat, bass in eighths. Waltz: bass on beat one, chords on the others. March: root then fifth in the bass on odd beats, chords on even beats — bars with an even number of beats. Bossa nova: dotted-quarter-and-eighth bass, syncopated chords — 4/4 only. A style that does not fit the meter is refused, and the message says so." },
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [0, 300], pas: 1, defaut: 0, unite: "BPM",
        doc: "Tempo de la reprise en noires par minute. 0 : celui de la partition.",
        docEn: "Tempo of the cover in quarter notes per minute. 0: the score's own." },
      PARAMETRE_SYNTHESE,
      { ...PARAMETRE_INSTRUMENT_SF2, nom: "Instrument mélodie", nomEn: "Melody instrument", defaut: 73,
        doc: "Preset du SoundFont pour la mélodie. Flûte par défaut.", docEn: "SoundFont preset for the melody. Flute by default." },
      { ...PARAMETRE_INSTRUMENT_SF2, nom: "Instrument accompagnement", nomEn: "Accompaniment instrument", defaut: 0,
        doc: "Preset du SoundFont pour l'accompagnement. Piano par défaut.", docEn: "SoundFont preset for the accompaniment. Piano by default." },
      { ...PARAMETRE_INSTRUMENT_SF2, nom: "Instrument basse", nomEn: "Bass instrument", defaut: 33,
        doc: "Preset du SoundFont pour la basse. Basse aux doigts par défaut.", docEn: "SoundFont preset for the bass. Fingered bass by default." },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume de l'audio synthétisé.", docEn: "Synthesized audio volume." },
    ],
    async executer(ctx: any) {
      const abc = ctx.entree(0);
      if (typeof abc !== "string" || !abc.trim()) return { valeurs: [null, null, null, null], erreur: true, message: traduire("msg.abc_reprise.aucun_abc") };
      const id = ctx.paramTexte("Style", "ballade");
      const style = ((STYLES as readonly string[]).includes(id) ? id : "ballade") as Style;
      const r = reprendreAbc(abc, {
        style,
        tempo: ctx.paramNombre("Tempo", 0),
        instrumentMelodie: ctx.paramNombre("Instrument mélodie", 73),
        instrumentAccompagnement: ctx.paramNombre("Instrument accompagnement", 0),
        instrumentBasse: ctx.paramNombre("Instrument basse", 33),
      });
      if (!r.ok) return { valeurs: [null, null, null, r.erreur], erreur: true, message: r.erreur ?? "" };

      // Le rendu suit les instruments écrits canal par canal : un instrument
      // global mettrait mélodie, accompagnement et basse au même timbre.
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const modeRendu: "FM/Oscillateurs" | "SoundFont" = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
      ctx.onProgress(traduire("progress.abc_reprise.rendu"));
      const audio = await rendreMidiDepuisBytes(r.midi!, modeRendu, ctx.paramNombre("Volume", 80));
      const midi = new File([r.midi! as unknown as BlobPart], "reprise.mid", { type: "audio/midi" });

      const q = r.verification!.qualite;
      const rapport = [
        traduire("msg.abc_reprise.var_0_var_1_var_2_var_3", style, Math.round(r.tempo), r.notesAccompagnement, r.notesBasse),
        traduire("msg.abc_reprise.melodie_intacte"),
        traduire("msg.abc_contraintes.qualite_var_0_var_1", q.consonanceTempsForts === null ? "—" : `${Math.round(q.consonanceTempsForts * 100)} %`, q.notesDansLaGamme === null ? "—" : `${Math.round(q.notesDansLaGamme * 100)} %`),
      ].join("\n");
      return {
        valeurs: [audio, midi, r.abc, rapport],
        message: traduire("msg.abc_reprise.var_0_var_1_var_2_var_3", style, Math.round(r.tempo), r.notesAccompagnement, r.notesBasse)
          + ` · ${audio.duration.toFixed(1)} s · ${traduire("msg.abc_reprise.melodie_intacte")}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
