// plugins/texte-vers-midi.ts — Nœud « Texte → MIDI » : convertit une notation
// texte simple (une note/accord par ligne) en fichier MIDI + audio synthétisé.
// Débloque le workflow « LLM compositeur » : un nœud IA (Ollama, GPT-2…) produit
// la notation, ce nœud la rend. Marche aussi avec n'importe quelle source texte.
//
// Le format et son lecteur vivent dans `audio/notation-texte.ts`, que ce nœud emploie : un texte qui
// porte une ligne fautive y est refusé en entier, et le message nomme chaque ligne (décisions de
// Fabien du 2026-11-22, revue des notations en texte).
import { fiche } from "./fiche";
import { lireNotationTexte, type FauteDeNotation } from "../audio/notation-texte";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { notesVersFichierMidi, rendreMidi, appliquerInstrumentMidi } from "../audio";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2, decoderInstrumentSF2 } from "./soundfontGlobal";

/** Le message d'un texte refusé : le nombre de lignes fautives, puis chacune, huit au plus. */
function direLesFautes(fautes: readonly FauteDeNotation[]): string {
  const lignes = new Set(fautes.map((f) => f.ligne)).size;
  return [
    traduire("msg.notation.refusee", lignes),
    ...fautes.slice(0, 8).map((f) => traduire(`msg.notation.faute.${f.raison}`, f.ligne, f.texte, f.mot)),
    ...(fautes.length > 8 ? ["…"] : []),
  ].join("\n");
}

const EXEMPLE = "Tempo 120\nC4 0.5\nE4 0.5\nG4 0.5\nC5 1\nrest 0.5\nA4+C5+E5 1";

export const fiches: FicheAudio[] = ([
  fiche({
    id: "texte-vers-midi", nom: "Texte → MIDI", nomEn: "Text → MIDI",
    univers: "Traitement", famille: "Conversion",
    resume: "Convertit une notation texte (note/accord par ligne) en MIDI + audio.",
    resumeEn: "Converts a text notation (one note/chord per line) into MIDI + audio.",
    notice: "Rend une notation texte en fichier MIDI et en audio synthétisé.\n\nChaque ligne porte une note, un accord ou un silence, puis sa durée en temps, puis sa vélocité, facultative :\n- « C4 0.5 » joue un do 4 pendant un demi-temps, à la vélocité 80 ;\n- « C4+E4+G4 1 100 » joue un accord pendant un temps, à la vélocité 100 ;\n- « rest 0.5 » est un silence d'un demi-temps.\n\nUne note s'écrit par sa lettre, son altération et son octave, le do central valant « C4 » : « # » et « b » pour un demi-ton, « ## », « x » et « bb » pour deux. Un numéro MIDI de 0 à 127 la désigne aussi. Une durée est décimale ou en fraction, « 0.5 » ou « 1/2 » ; absente, elle vaut un temps. La vélocité va de 1 à 127.\n\n« Tempo 120 » fixe le tempo de ce qui suit : en tête, il remplace le réglage « Tempo » ; plus loin, il le change à son instant. Une ligne vide est sautée, et un commentaire commence par « # » ou « // ».\n\nUn texte qui porte une ligne fautive est refusé en entier : le message nomme chaque ligne fautive, son numéro et sa raison, et rien n'est joué.\n\nLe texte vient de l'entrée « Notation », ou du réglage « Notation » quand l'entrée n'est pas branchée.",
    noticeEn: "Renders a text notation into a MIDI file and synthesized audio.\n\nEach line carries a note, a chord or a rest, then its duration in beats, then its velocity, optional:\n- « C4 0.5 » plays a C4 for half a beat, at velocity 80;\n- « C4+E4+G4 1 100 » plays a chord for one beat, at velocity 100;\n- « rest 0.5 » is a rest of half a beat.\n\nA note is written by its letter, its accidental and its octave, middle C being « C4 »: « # » and « b » for a semitone, « ## », « x » and « bb » for two. A MIDI number from 0 to 127 also designates it. A duration is decimal or a fraction, « 0.5 » or « 1/2 »; absent, it is one beat. The velocity goes from 1 to 127.\n\n« Tempo 120 » sets the tempo of what follows: at the top, it replaces the « Tempo » setting; further on, it changes it at its instant. An empty line is skipped, and a comment begins with « # » or « // ».\n\nA text carrying a faulty line is refused whole: the message names each faulty line, its number and its reason, and nothing is played.\n\nThe text comes from the « Notation » input, or from the « Notation » setting when the input is not connected.",
    // LE PORT PORTE LE NOM DE CE QU'IL REÇOIT, et non celui de son type.
    //
    // IL S'APPELAIT « TEXTE » ALORS QUE SON PROPRE RÉGLAGE DE REPLI S'APPELLE « NOTATION » : le nœud
    // se contredisait d'une ligne à l'autre. Et quatre sorties du catalogue nommées « Notation » —
    // accords joués, gamme jouée, accords vers notation, grille d'accords — écrivent PRÉCISÉMENT ce
    // format, sans qu'aucun nom ne les relie à la seule entrée qui les attend.
    //
    // MESURÉ : un plan de chanson branché sur « Texte » était accepté et rendait zéro note. Le câble
    // était licite, les couleurs de port s'accordaient, et rien dans le graphe ne pouvait le dire.
    //
    // LE RENOMMAGE NE COÛTE RIEN, et c'est mesuré aussi : un graphe enregistré désigne un port par
    // son INDICE — « in:0 » —, et aucun code du dépôt ne cherche un port par son nom. Un réglage,
    // lui, se lit par son nom dans `noeud.data.parametres[nom]` : c'est pourquoi le réglage de repli
    // garde le sien.
    entrees: [{ nom: "Notation", nomEn: "Notation", type: "texte", sousType: "notation", requis: false }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Notation", nomEn: "Notation", type: "texte", defaut: EXEMPLE,
        doc: "Notation à convertir, utilisée si aucune entrée texte n'est connectée. Une note/accord par ligne.",
        docEn: "Notation to convert, used when no text input is connected. One note/chord per line." },
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Tempo par défaut (temps → secondes). Une ligne « Tempo n » dans le texte le remplace.",
        docEn: "Default tempo (beats → seconds). A « Tempo n » line in the text overrides it." },
      PARAMETRE_SYNTHESE,
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume de l'audio synthétisé.", docEn: "Synthesized audio volume." },
    ],
    async executer(ctx) {
      const entree = ctx.entree(0);
      const texte = (typeof entree === "string" && entree.trim()) ? entree : ctx.paramTexte("Notation", EXEMPLE);
      const { notes, tempos, fautes } = lireNotationTexte(texte, ctx.paramNombre("Tempo", 120));
      if (fautes.length) return { valeurs: [null, null], erreur: true, message: direLesFautes(fautes) };
      if (notes.length === 0) return { valeurs: [null, null], erreur: true, message: traduire("msg.aucune_note_reconnue_format_attendu_c4_0_5_par_ligne") };
      const tempo = tempos[tempos.length - 1].bpm;
      const midiFichier = notesVersFichierMidi(notes, tempo);
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const { programme: instrument, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
      const modeRendu: "FM/Oscillateurs" | "SoundFont" = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
      const audio = await rendreMidi(midiFichier, modeRendu, ctx.paramNombre("Volume", 80), instrument, banque);
      const midiFinal = await appliquerInstrumentMidi(midiFichier, ctx.paramNombre("Instrument", 0));
      return { valeurs: [audio, midiFinal], message: traduire("msg.var_0_note_s_var_1_bpm_var_2_s", notes.length, tempo, audio.duration.toFixed(1)) };
   },
  }),
] as FicheAudio[]).map(avecDoc);
