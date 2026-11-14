// plugins/abc-reprise.ts — Nœud « Reprise ABC ».
// Ajoute à une partition ABC un accompagnement et une basse dans un style, en
// gardant la mélodie et les accords. Le motif et l'assemblage vivent dans
// audio/abc-reprise.ts, testés.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";
import { reprendreAbc, estStyle, ACCORDS_TENUS } from "../audio/abc-reprise";
import { rendreMidiDepuisBytes } from "../audio/midi-montage";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2 } from "./soundfontGlobal";
import { optionsPatrons } from "./patrons-rythme";

/**
 * Les styles offerts : « Accords tenus », puis la liste entière des patrons rythmiques, dans son
 * ordre, ses identifiants et ses libellés. Décision de Fabien du 2026-11-14 : les six styles d'avant
 * étaient écrits ici à la main, sous des libellés qu'aucune table ne portait.
 */
const PATRONS_OFFERTS = optionsPatrons();
export const STYLES_OFFERTS = {
  options: ["Accords tenus", ...PATRONS_OFFERTS.options],
  optionsEn: ["Held chords", ...PATRONS_OFFERTS.optionsEn],
  optionIds: [ACCORDS_TENUS, ...PATRONS_OFFERTS.optionIds],
};

/**
 * Les valeurs d'avant, identifiants et libellés des deux langues, et le style qui joue leur motif.
 *
 * UN PROJET ENREGISTRÉ GARDE L'UNE DE CES DIX-SEPT ÉCRITURES, et chacune mène au style dont le motif
 * est recopié du sien : le projet rouvert rend le même fichier MIDI. « pop » mène à « Rock » parce
 * que son motif, un accord par temps sur une basse en croches, est celui-là ; « ballade » mène à
 * « Pop ballade », l'arpège sur une basse tenue.
 */
export const STYLES_HERITES: Record<string, string> = {
  "blocs": ACCORDS_TENUS, "Blocs (accords tenus)": ACCORDS_TENUS, "Blocks (held chords)": ACCORDS_TENUS,
  "ballade": "Pop ballade", "Ballade (arpèges)": "Pop ballade", "Ballad (arpeggios)": "Pop ballade",
  "pop": "Rock", "Pop (accords sur les temps)": "Rock", "Pop (chords on the beats)": "Rock",
  "valse": "Valse", "Valse (basse – accord – accord)": "Valse", "Waltz (bass – chord – chord)": "Valse",
  "marche": "Marche militaire", "Marche (basse – accord)": "Marche militaire", "March (bass – chord)": "Marche militaire",
  "bossa": "Bossa Nova", "Bossa nova": "Bossa Nova",
};

/** Le nom d'un style dans la langue de l'interface. */
function nomDuStyle(id: string): string {
  const rang = STYLES_OFFERTS.optionIds.indexOf(id);
  if (rang < 0) return id;
  return (langueCourante() === "en" ? STYLES_OFFERTS.optionsEn : STYLES_OFFERTS.options)[rang];
}

export const fiches: FicheAudio[] = ([
  fiche({
    id: "reprise-abc", nom: "Reprise ABC", nomEn: "ABC Cover",
    univers: "Traitement", famille: "Conversion",
    resume: "Reprend une partition ABC dans un autre style : même mélodie, mêmes accords, avec un accompagnement et une basse sur le motif de l'un de cinquante-cinq genres, ou en accords tenus.",
    resumeEn: "Covers an ABC score in another style: same melody, same chords, with an accompaniment and a bass on the pattern of one of fifty-five genres, or in held chords.",
    entrees: [{ nom: "ABC", type: "texte", sousType: "abc", requis: true }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "MIDI", type: "midi" },
      { nom: "ABC", type: "texte", sousType: "abc" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Style", nomEn: "Style", type: "choix", ...STYLES_OFFERTS, optionsHeritees: STYLES_HERITES,
        defaut: "Pop ballade", defautEn: "Pop ballad",
        doc: "Le motif de basse et d'accompagnement, nommé d'après un genre. Accords tenus : l'accord et la basse tenus jusqu'au changement d'accord. Pop ballade : arpège en croches sur la basse tenue. Rock : accord à chaque temps, basse en croches. Ces trois styles s'appliquent à toute métrique. Valse : basse au premier temps, accords aux suivants, dès deux temps. Marche militaire : fondamentale puis quinte à la basse sur les temps impairs, accords sur les pairs, en mesure à nombre pair de temps. Bossa Nova : basse en noire pointée et croche, accords syncopés, en 4/4. Chacun des autres genres joue son propre motif de basse et d'accords sur une mesure de quatre noires, 4/4 ou 2/2, et Bolero sur une mesure de 3/4. Un style qui ne s'applique pas à la métrique est refusé, et le message le dit.",
        docEn: "The bass and accompaniment pattern, named after a genre. Held chords: chord and bass held until the next chord change. Pop ballad: eighth-note arpeggio over a held bass. Rock: a chord on every beat, bass in eighths. These three styles fit any meter. Waltz: bass on beat one, chords on the others, from two beats up. Military march: root then fifth in the bass on odd beats, chords on even beats, in bars with an even number of beats. Bossa Nova: dotted-quarter-and-eighth bass, syncopated chords, in 4/4. Each of the other genres plays its own bass and chord pattern over a bar of four quarter notes, 4/4 or 2/2, and Bolero over a bar of 3/4. A style that does not fit the meter is refused, and the message says so." },
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
    async executer(ctx) {
      const abc = ctx.entree(0);
      if (typeof abc !== "string" || !abc.trim()) return { valeurs: [null, null, null, null], erreur: true, message: traduire("msg.abc_reprise.aucun_abc") };
      const id = ctx.paramTexte("Style", "Pop ballade");
      const style = estStyle(id) ? id : "Pop ballade";
      const nom = nomDuStyle(style);
      const r = reprendreAbc(abc, {
        style, nomStyle: nom,
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
        traduire("msg.abc_reprise.var_0_var_1_var_2_var_3", nom, Math.round(r.tempo), r.notesAccompagnement, r.notesBasse),
        traduire("msg.abc_reprise.melodie_intacte"),
        traduire("msg.abc_contraintes.qualite_var_0_var_1", q.consonanceTempsForts === null ? "—" : `${Math.round(q.consonanceTempsForts * 100)} %`, q.notesDansLaGamme === null ? "—" : `${Math.round(q.notesDansLaGamme * 100)} %`),
      ].join("\n");
      return {
        valeurs: [audio, midi, r.abc, rapport],
        message: traduire("msg.abc_reprise.var_0_var_1_var_2_var_3", nom, Math.round(r.tempo), r.notesAccompagnement, r.notesBasse)
          + ` · ${audio.duration.toFixed(1)} s · ${traduire("msg.abc_reprise.melodie_intacte")}`,
      };
    },
  }),
] as FicheAudio[]).map(avecDoc);
