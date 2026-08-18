// plugins/accords-vers-notation.ts — Nœud « Accords → Notation MIDI ».
//
// Passerelle entre « Analyse harmonique » et « Texte → MIDI » : le premier
// décrit l'harmonie pour un lecteur humain (« Cmaj (1.5s) », « I V vi IV »),
// le second attend une notation exécutable (« C4+E4+G4 1.5 »). Sans ce nœud,
// il fallait retaper la transcription à la main.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { Chord, Note, Progression, RomanNumeral } from "tonal";

// Les symboles produits par `detecterAccords` (audio/accords.ts) suivent ses
// propres gabarits, qui ne coïncident pas tous avec ceux de Tonal : « min7b5 »
// y désigne le demi-diminué, que Tonal nomme « m7b5 ». Vérifié symbole par
// symbole : les neuf autres gabarits passent tels quels, celui-ci seul échoue
// et renverrait un accord vide, donc une ligne perdue en silence.
const ALIAS_SUFFIXE: Record<string, string> = { min7b5: "m7b5" };

function normaliserSymbole(symbole: string): string {
  const m = /^([A-G][#b]?)(.*)$/.exec(symbole.trim());
  if (!m) return symbole.trim();
  const [, racine, suffixe] = m;
  return racine + (ALIAS_SUFFIXE[suffixe] ?? suffixe);
}

// Notes de l'accord en ordre ascendant à partir de `octave`, pour éviter qu'un
// renversement ne descende sous la fondamentale.
function notesAscendantes(symbole: string, octave: number): string[] {
  const accord = Chord.get(normaliserSymbole(symbole));
  if (!accord || accord.empty || !accord.notes.length) return [];
  const notes: string[] = [];
  let precedent = -Infinity;
  for (const n of accord.notes) {
    let midi = Note.midi(`${n}${octave}`);
    if (midi == null) continue;
    while (midi < precedent) midi += 12;
    const nom = Note.fromMidi(midi);
    if (nom) notes.push(nom);
    precedent = midi;
  }
  return notes;
}

// « 0:00 Csus2 (4.0s) » → { symbole: "Csus2", secondes: 4 }.
// L'horodatage en tête est ajouté par `detecterAccords` lui-même (il préfixe
// `nomEn` avec `formatTemps`), il ne fait donc PAS partie du symbole d'accord.
// Il est optionnel ici pour rester tolérant si la source évolue, et la durée
// l'est aussi (repli sur `dureeDefaut`).
function parserLigneAccord(ligne: string, dureeDefaut: number): { symbole: string; secondes: number } | null {
  const t = ligne.trim();
  if (!t) return null;
  const m = /^(?:\d+:\d{2}\s+)?(\S+)\s*(?:\(\s*([\d.,]+)\s*s\s*\))?/.exec(t);
  if (!m) return null;
  const secondes = m[2] ? parseFloat(m[2].replace(",", ".")) : dureeDefaut;
  return { symbole: m[1], secondes: Number.isFinite(secondes) && secondes > 0 ? secondes : dureeDefaut };
}

// Tonal LIT bien la casse d'un chiffre romain (`RomanNumeral.get("vi").major`
// vaut false) mais ne la reporte PAS sur le type d'accord : `chordType` reste
// vide et `fromRomanNumerals` construit alors une triade majeure. « vi » en do
// majeur donnait ainsi La MAJEUR (A C# E) au lieu du relatif mineur (A C E) —
// une faute d'harmonie silencieuse. On explicite donc le « m » quand le chiffre
// est en minuscules et qu'aucun type n'est déjà précisé (« vi7 » reste intact).
function normaliserRomains(tokens: string[]): string[] {
  return tokens.map((t) => {
    const rn = RomanNumeral.get(t);
    if (rn.empty || rn.major || rn.chordType) return t;
    return t + "m";
  });
}

// « C major (87%) » / « A minor » → tonique utilisable par Tonal.
function toniqueDepuisTonalite(texte: string): string | null {
  const m = /^\s*([A-G][#b]?)/.exec(texte ?? "");
  return m ? m[1] : null;
}

export const fiches: FicheAudio[] = ([
  {
    id: "accords-vers-notation",
    nom: "Accords → Notation MIDI", nomEn: "Chords → MIDI Notation",
    univers: "Traitement", famille: "Conversion",
    resume: "Convertit la sortie d'Analyse harmonique en notation lisible par Texte → MIDI.",
    resumeEn: "Converts Harmonic Analysis output into the notation expected by Text → MIDI.",
    entrees: [
      { nom: "Accords détectés", nomEn: "Detected chords", type: "texte", requis: false },
      { nom: "Progression", nomEn: "Progression", type: "texte", requis: false },
      { nom: "Tonalité", nomEn: "Key", type: "texte", requis: false },
    ],
    sorties: [{ nom: "Notation", nomEn: "Notation", type: "texte" }],
    parametres: [
      { nom: "Source", nomEn: "Source", type: "choix",
        options: ["Accords détectés", "Progression"], optionsEn: ["Detected chords", "Progression"],
        optionIds: ["accords", "progression"], defaut: "Accords détectés", defautEn: "Detected chords",
        doc: "« Accords détectés » transcrit l'harmonie réelle avec ses durées mesurées. « Progression » développe les chiffres romains suggérés, ce qui exige la Tonalité en entrée.",
        docEn: "« Detected chords » transcribes the actual harmony with its measured durations. « Progression » expands the suggested roman numerals, which requires the Key input." },
      { nom: "Octave", nomEn: "Octave", plage: [1, 6], pas: 1, defaut: 3,
        doc: "Octave de la fondamentale des accords générés.",
        docEn: "Octave of the root note of the generated chords." },
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Tempo écrit en tête de la notation. Il sert aussi à convertir les durées en secondes de l'analyse vers des temps.",
        docEn: "Tempo written at the top of the notation. Also used to convert the analysis durations from seconds into beats." },
      { nom: "Durée par accord", nomEn: "Duration per chord", plage: [0.25, 8], pas: 0.25, defaut: 1, unite: "temps",
        doc: "Durée attribuée à chaque accord quand la source ne fournit pas de durée (cas de la Progression).",
        docEn: "Duration given to each chord when the source provides none (Progression case)." },
    ],
    async executer(ctx: any) {
      const source = ctx.paramTexte("Source", "accords");
      const octave = ctx.paramNombre("Octave", 3);
      const tempo = ctx.paramNombre("Tempo", 120);
      const dureeDefaut = ctx.paramNombre("Durée par accord", 1);

      const lignes: string[] = [`TEMPO ${tempo}`];
      let nbAccords = 0;
      let nbIgnores = 0;

      if (source === "progression") {
        const progression = ctx.entree(1);
        const tonaliteTexte = ctx.entree(2);
        if (typeof progression !== "string" || !progression.trim()) {
          return { valeurs: [null], message: traduire("msg.accords_notation.progression_absente") };
        }
        const tonique = toniqueDepuisTonalite(typeof tonaliteTexte === "string" ? tonaliteTexte : "");
        if (!tonique) {
          return { valeurs: [null], message: traduire("msg.accords_notation.tonalite_absente") };
        }
        // Les chiffres romains n'ont de sens que rapportés à une tonique : c'est
        // pourquoi cette source exige l'entrée Tonalité.
        const symboles = Progression.fromRomanNumerals(tonique, normaliserRomains(progression.trim().split(/\s+/)));
        for (const symbole of symboles) {
          const notes = notesAscendantes(symbole, octave);
          if (!notes.length) { nbIgnores++; continue; }
          lignes.push(`${notes.join("+")} ${dureeDefaut}`);
          nbAccords++;
        }
      } else {
        const accords = ctx.entree(0);
        if (typeof accords !== "string" || !accords.trim()) {
          return { valeurs: [null], message: traduire("msg.accords_notation.accords_absents") };
        }
        // Les durées de l'analyse sont en secondes ; la notation Texte → MIDI
        // raisonne en temps, d'où la conversion par le tempo.
        const tempsParSeconde = tempo / 60;
        for (const ligne of accords.split(/\r?\n/)) {
          const parsee = parserLigneAccord(ligne, dureeDefaut / tempsParSeconde);
          if (!parsee) continue;
          const notes = notesAscendantes(parsee.symbole, octave);
          if (!notes.length) { nbIgnores++; continue; }
          const temps = Math.max(0.05, Math.round(parsee.secondes * tempsParSeconde * 100) / 100);
          lignes.push(`${notes.join("+")} ${temps}`);
          nbAccords++;
        }
      }

      if (nbAccords === 0) {
        return { valeurs: [null], message: traduire("msg.accords_notation.aucun_accord") };
      }
      return {
        valeurs: [lignes.join("\n")],
        message: nbIgnores > 0
          ? traduire("msg.accords_notation.resultat_partiel_var_0_var_1", nbAccords, nbIgnores)
          : traduire("msg.accords_notation.resultat_var_0", nbAccords),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
