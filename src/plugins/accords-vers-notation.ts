// plugins/accords-vers-notation.ts — Nœud « Accords → Notation MIDI ».
//
// Passerelle entre « Analyse harmonique » et « Texte → MIDI » : le premier
// décrit l'harmonie pour un lecteur humain (« 0:02 Am (1.5s, 90%) », « I V vi IV »),
// le second attend une notation exécutable (« C4+E4+G4 1.5 »). Sans ce nœud,
// il fallait retaper la transcription à la main.
import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { Note } from "tonal";
import { accordsDepuisRomains, modeDepuisTonalite, romainsInconnus, toniqueDepuisTonalite } from "../audio/theorie-romains";
import { accordDuSymbole, estSansAccord } from "../audio/symboles-accords";

// LE SYMBOLE SE LIT PAR LE SEUL LECTEUR DES SYMBOLES (`audio/symboles-accords.ts`), revue des
// notations en texte du 2026-11-22. Ce nœud avait le sien, qui ne ramenait que « min7b5 » à
// l'écriture de Tonal : « Bø7 », « Cm(maj7) » ou « B♭ » étaient perdus sans être nommés.

// Notes de l'accord en ordre ascendant à partir de `octave`, pour éviter qu'un
// renversement ne descende sous la fondamentale.
function notesAscendantes(symbole: string, octave: number): string[] {
  const accord = accordDuSymbole(symbole);
  if (!accord) return [];
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
  // LA CONFIANCE PEUT SUIVRE LA DURÉE, « (2.0s, 100%) » : c'est ce que le détecteur écrit. Elle
  // empêchait de lire la durée, et chaque accord retombait sur « Durée par accord », sans un mot ;
  // mesuré le 2026-11-22, revue des notations en texte.
  const m = /^(?:\d+:\d{2}\s+)?(\S+)\s*(?:\(\s*([\d.,]+)\s*s\s*(?:,[^)]*)?\))?/.exec(t);
  if (!m) return null;
  const secondes = m[2] ? parseFloat(m[2].replace(",", ".")) : dureeDefaut;
  return { symbole: m[1], secondes: Number.isFinite(secondes) && secondes > 0 ? secondes : dureeDefaut };
}

// « C major (87%) » / « A minor » → tonique utilisable par Tonal.

export const fiches: FicheAudio[] = ([
  fiche({
    id: "accords-vers-notation",
    nom: "Accords → Notation MIDI", nomEn: "Chords → MIDI Notation",
    univers: "Traitement", famille: "Conversion",
    resume: "Convertit la sortie d'Analyse harmonique en notation lisible par Texte → MIDI.",
    resumeEn: "Converts Harmonic Analysis output into the notation expected by Text → MIDI.",
    // Ordre calqué sur les SORTIES d'« Analyse harmonique » (Tonalité,
    // Progression, Accords détectés) : les deux nœuds se branchent ainsi à
    // ports parallèles, sans liaisons croisées.
    entrees: [
      { nom: "Tonalité", nomEn: "Key", type: "texte", requis: false },
      { nom: "Progression", nomEn: "Progression", type: "texte", requis: false },
      { nom: "Accords détectés", nomEn: "Detected chords", type: "texte", requis: false },
    ],
    sorties: [{ nom: "Notation", nomEn: "Notation", type: "texte", sousType: "notation" }],
    parametres: [
      { nom: "Source", nomEn: "Source", type: "choix",
        options: ["Accords détectés", "Progression"], optionsEn: ["Detected chords", "Progression"],
        optionIds: ["accords", "progression"], defaut: "Accords détectés", defautEn: "Detected chords",
        doc: "« Accords détectés » transcrit l'harmonie réelle avec ses durées mesurées. « Progression » développe les chiffres romains suggérés, ce qui exige la Tonalité en entrée.",
        docEn: "« Detected chords » transcribes the actual harmony with its measured durations. « Progression » expands the suggested roman numerals, which requires the Key input." },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: ["majeur", "mineur"], optionsEn: ["major", "minor"],
        optionIds: ["majeur", "mineur"], defaut: "majeur", defautEn: "major",
        doc: "Gamme dans laquelle lire les degrés, quand l'entrée Tonalité ne nomme pas de mode. « Analyse harmonique » écrit « A minor (90%) » : ce mode-là l'emporte, et le réglage ne sert que pour une tonique saisie à la main. En mineur, III, VI et VII descendent d'un demi-ton. Sans effet quand « Source » vaut « Accords détectés », qui ne lit pas de degrés.",
        docEn: "Scale the degrees are read in, when the Key input names no mode. « Harmonic Analysis » writes « A minor (90%) »: that mode wins, and this setting only applies to a hand-typed tonic. In minor, III, VI and VII drop a semitone. No effect when « Source » is « Detected chords », which reads no degrees." },
      { nom: "Octave", nomEn: "Octave", plage: [1, 6], pas: 1, defaut: 3,
        doc: "Octave de la fondamentale des accords générés.",
        docEn: "Octave of the root note of the generated chords." },
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Tempo écrit en tête de la notation. Il sert aussi à convertir les durées en secondes de l'analyse vers des temps.",
        docEn: "Tempo written at the top of the notation. Also used to convert the analysis durations from seconds into beats." },
      { nom: "Durée par accord", nomEn: "Duration per chord", plage: [0.25, 8], pas: 0.25, defaut: 1, unite: "temps", uniteEn: "beats",
        doc: "Durée attribuée à chaque accord quand la source ne fournit pas de durée (cas de la Progression).",
        docEn: "Duration given to each chord when the source provides none (Progression case)." },
    ],
    async executer(ctx) {
      const source = ctx.paramTexte("Source", "accords");
      const octave = ctx.paramNombre("Octave", 3);
      const tempo = ctx.paramNombre("Tempo", 120);
      const dureeDefaut = ctx.paramNombre("Durée par accord", 1);

      const lignes: string[] = [`TEMPO ${tempo}`];
      let nbAccords = 0;
      const inconnus: string[] = [];

      if (source === "progression") {
        const progression = ctx.entree(1);
        const tonaliteTexte = ctx.entree(0);
        if (typeof progression !== "string" || !progression.trim()) {
          return { valeurs: [null], message: traduire("msg.accords_notation.progression_absente") };
        }
        // ABSENTE OU ILLISIBLE NE SE DISENT PAS DE LA MÊME FAÇON. Le message unique affirmait que
        // l'entrée Tonalité manquait, y compris quand elle était BRANCHÉE et portait un texte que
        // la lecture n'avait pas su interpréter : le refus était juste, son motif était faux, et il
        // envoyait chercher un câble déjà posé.
        const brute = typeof tonaliteTexte === "string" ? tonaliteTexte.trim() : "";
        if (!brute) {
          return { valeurs: [null], message: traduire("msg.accords_notation.tonalite_absente") };
        }
        const tonique = toniqueDepuisTonalite(brute);
        if (!tonique) {
          return { valeurs: [null],
            message: traduire("msg.tonal.tonique_illisible_var_0", brute.slice(0, 40)) };
        }
        // Les chiffres romains n'ont de sens que rapportés à une tonique ET à un
        // mode : c'est pourquoi cette source exige l'entrée Tonalité, dont on lit
        // les deux. « Analyse harmonique » émet « A minor (90%) » et suggérait
        // « i VI III VII » — développé sur la gamme majeure, cela donnait
        // Am F♯ C♯ G♯. La chaîne documentée du projet produisait donc de faux
        // accords pour tout morceau mineur.
        // Le mode nommé dans l'entrée l'emporte sur le réglage : il a été MESURÉ
        // par « Analyse harmonique », alors que le paramètre est un défaut que
        // personne ne pense à changer quand la tonalité arrive par un câble.
        const mode = modeDepuisTonalite(String(tonaliteTexte))
          ?? (ctx.paramTexte("Gamme", "majeur") === "mineur" ? "mineur" : "majeur");
        const jetons = progression.trim().split(/\s+/);
        // Ce port attend des CHIFFRES ROMAINS. La sortie « Accords » du nœud
        // « Progression » est du texte elle aussi, et se branche donc sans
        // réserve — mais elle contient des noms d'accords (« Am F C G »), que
        // Tonal ne sait pas lire comme des degrés. L'échec se manifestait alors
        // par « aucun accord exploitable », qui ne désignait pas la cause. On la
        // nomme, avec la sortie à utiliser à la place.
        if (!jetons.some((j) => /^[b#]?[IViv]/.test(j))) {
          return {
            valeurs: [null], erreur: true,
            message: traduire("msg.accords_notation.pas_des_romains_var_0", jetons.slice(0, 4).join(" ")),
          };
        }
        // UN CHIFFRE QUI NE SE LIT PAS EST REFUSÉ, NOMMÉ, revue des notations en texte du 2026-11-22.
        const illisibles = romainsInconnus(jetons);
        if (illisibles.length > 0) {
          return { valeurs: [null], erreur: true, message: traduire("msg.tonal.romains_inconnus_var_0", illisibles.slice(0, 4).join(" » « ")) };
        }
        const symboles = accordsDepuisRomains(tonique, jetons, mode);
        for (const symbole of symboles) {
          const notes = notesAscendantes(symbole, octave);
          if (!notes.length) { inconnus.push(symbole); continue; }
          lignes.push(`${notes.join("+")} ${dureeDefaut}`);
          nbAccords++;
        }
      } else {
        const accords = ctx.entree(2);
        if (typeof accords !== "string" || !accords.trim()) {
          return { valeurs: [null], message: traduire("msg.accords_notation.accords_absents") };
        }
        // Les durées de l'analyse sont en secondes ; la notation Texte → MIDI
        // raisonne en temps, d'où la conversion par le tempo.
        const tempsParSeconde = tempo / 60;
        for (const ligne of accords.split(/\r?\n/)) {
          const parsee = parserLigneAccord(ligne, dureeDefaut / tempsParSeconde);
          if (!parsee) continue;
          const temps = Math.max(0.05, Math.round(parsee.secondes * tempsParSeconde * 100) / 100);
          // « N.C. » est un accord silencieux, décision de Fabien du 2026-11-22 : il garde sa durée.
          if (estSansAccord(parsee.symbole)) { lignes.push(`rest ${temps}`); nbAccords++; continue; }
          const notes = notesAscendantes(parsee.symbole, octave);
          if (!notes.length) { inconnus.push(parsee.symbole); continue; }
          lignes.push(`${notes.join("+")} ${temps}`);
          nbAccords++;
        }
      }

      // UN SYMBOLE QUI NE SE LIT PAS REFUSE LA TRANSCRIPTION, ET LE MESSAGE LE NOMME, règle de la revue
      // des notations en texte du 2026-11-22. Le nœud comptait les lignes ignorées sans les nommer, et
      // rendait une transcription trouée, plus courte que l'harmonie qu'elle disait transcrire.
      if (inconnus.length > 0) {
        return { valeurs: [null], erreur: true,
          message: traduire("msg.accords_notation.symboles_inconnus_var_0", inconnus.slice(0, 8).join(" » « ")) };
      }
      if (nbAccords === 0) {
        return { valeurs: [null], message: traduire("msg.accords_notation.aucun_accord") };
      }
      return { valeurs: [lignes.join("\n")], message: traduire("msg.accords_notation.resultat_var_0", nbAccords) };
    },
  }),
] as FicheAudio[]).map(avecDoc);
