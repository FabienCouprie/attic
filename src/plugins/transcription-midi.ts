// plugins/transcription-midi.ts — Un audio devient des notes, avec son tempo et sa grille.
//
// CE QUE LE MOTEUR DONNE, ET CE QU'IL NE DONNE PAS. Le transcripteur rend des notes datées à la
// seconde, avec leur instrument, et un fichier qui porte 120 battements par minute parce qu'un
// MIDI doit porter un tempo, non parce qu'il l'a trouvé. Ses attaques tombent sur son horloge
// d'analyse : relevé sur 1 650 attaques, elles sont toutes sur un réseau de dix millisecondes,
// et contre une grille de double-croches, à n'importe quel tempo, leur écart vaut ce que donnerait
// le hasard. L'information métrique n'est pas dans le fichier.
//
// D'OÙ LES DEUX RÉGLAGES QUI SUIVENT, ET LE FAIT QU'ILS SOIENT SÉPARÉS.
//
//   « Tempo » réancre : chaque note garde sa seconde, le tempo écrit devient celui qu'on donne, et
//   les tics sont recalculés pour que les deux soient d'accord. Les barres de mesure deviennent
//   justes sans qu'une note bouge, à l'arrondi du tic près. Ce n'est PAS un changement de vitesse,
//   et `audio/tempo-reancrage.ts` porte la démonstration.
//
//   « Quantification » pose ensuite les attaques sur la grille de ce tempo. C'est une
//   reconstruction, non une correction, puisque le rythme n'était pas là : à 166 battements par
//   minute la double-croche fait 90 millisecondes, et chaque note se déplace de 23 en moyenne. La
//   sortie « Rapport » donne l'indice d'alignement avant quantification, de sorte que le tempo
//   proposé se juge sur un chiffre plutôt que sur une impression.
//
// L'ENTRÉE « TEMPO » EXISTE POUR QUE LE CHIFFRE VIENNE D'AILLEURS. Un détecteur de tempo le rend
// sur un port de contrôle ; le brancher ici évite de recopier à la main un nombre qui se mesure.
import { parseMidi, writeMidi } from "midi-file";
import { analyserMidi } from "../audio/midi";
import { bpmInitial } from "../audio/midi-ecriture";
import { mesurerAlignement, reancrerTempo } from "../audio/tempo-reancrage";
import { transposerQuantifierMidi } from "../audio/midi-quantification";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { annoncerModele } from "./message-modele";
import { messageEchecPont } from "./pont-electron";

/**
 * Les groupes d'instruments que le moteur reconnaît, et qui servent ici.
 *
 * Le moteur en accepte trente-cinq ; la liste tenue ici est celle qui couvre les cas courants, et
 * « Tous » est le défaut parce que le moteur cherche alors de lui-même ce que la bande contient.
 */
const INSTRUMENTS = [
  { id: "", fr: "Tous", en: "All" },
  { id: "acoustic_piano", fr: "Piano", en: "Piano" },
  { id: "acoustic_guitar", fr: "Guitare acoustique", en: "Acoustic guitar" },
  { id: "clean_electric_guitar", fr: "Guitare électrique", en: "Electric guitar" },
  { id: "electric_bass", fr: "Basse électrique", en: "Electric bass" },
  { id: "acoustic_bass", fr: "Contrebasse", en: "Double bass" },
  { id: "string_ensemble", fr: "Cordes", en: "Strings" },
  { id: "voice", fr: "Voix", en: "Voice" },
  { id: "flutes", fr: "Flûtes", en: "Flutes" },
  { id: "trumpet", fr: "Trompette", en: "Trumpet" },
  { id: "organ", fr: "Orgue", en: "Organ" },
  { id: "synth_lead", fr: "Synthétiseur solo", en: "Synth lead" },
  { id: "synth_pad", fr: "Nappe de synthétiseur", en: "Synth pad" },
  { id: "drums", fr: "Batterie", en: "Drums" },
];

/**
 * Les grilles de quantification, avec les identifiants que `midi-quantification.ts` attend.
 *
 * LES IDENTIFIANTS SONT CEUX QUI EXISTENT DÉJÀ dans le dépôt, `none` et `1/16t` comprises : la
 * table des grilles est partagée, et inventer ici une seconde écriture des mêmes valeurs ferait
 * tomber en silence sur « aucune grille ».
 */
const GRILLES = [
  { id: "none", fr: "Aucune", en: "None", divisions: 4 },
  { id: "1/4", fr: "1/4", en: "1/4", divisions: 1 },
  { id: "1/8", fr: "1/8", en: "1/8", divisions: 2 },
  { id: "1/16", fr: "1/16", en: "1/16", divisions: 4 },
  { id: "1/32", fr: "1/32", en: "1/32", divisions: 8 },
  { id: "1/8t", fr: "1/8 de triolet", en: "1/8 triplet", divisions: 3 },
  { id: "1/16t", fr: "1/16 de triolet", en: "1/16 triplet", divisions: 6 },
];

const CALCULS = [
  { id: "", fr: "Automatique", en: "Automatic" },
  { id: "CPU", fr: "Processeur", en: "Processor" },
  { id: "Vulkan0", fr: "Vulkan 0", en: "Vulkan 0" },
  { id: "Vulkan1", fr: "Vulkan 1", en: "Vulkan 1" },
  { id: "CUDA0", fr: "CUDA 0", en: "CUDA 0" },
];

/** Le canal du processus principal, nommé une fois : le nœud l'appelle et le reconnaît en cas d'échec. */
const CANAL = "muscriptor:transcrire";

const api = () => (globalThis as unknown as { api?: Record<string, (...a: unknown[]) => Promise<unknown>> }).api;

/** Branche l'avancement du moteur sur celui du nœud, et rend de quoi se débrancher. */
function suivre(ctx: { onProgress?: (m: string) => void }) {
  const pont = api()?.muscriptorProgression as unknown as
    ((cb: (e: { ligne: string }) => void) => () => void) | undefined;
  if (!pont) return () => { /* hors application : rien à suivre */ };
  return pont(({ ligne }) => ctx.onProgress?.(ligne));
}

/** Les instruments trouvés et leur compte, depuis les événements que le moteur rend en texte. */
function instrumentsTrouves(evenements: string): { nom: string; notes: number }[] {
  const compte = new Map<string, number>();
  for (const m of evenements.matchAll(/"instrument":"([a-z_]+)"/g)) {
    compte.set(m[1], (compte.get(m[1]) ?? 0) + 1);
  }
  return [...compte.entries()].map(([nom, notes]) => ({ nom, notes })).sort((a, b) => b.notes - a.notes);
}

export const fiches = ([
  {
    id: "transcription-midi", nom: "Transcription MIDI", nomEn: "MIDI Transcription",
    univers: "Traitement", famille: "Conversion",
    resume: "Transcrit un audio en notes MIDI par instrument, avec son tempo et sa quantification.",
    resumeEn: "Transcribes audio into MIDI notes per instrument, with its tempo and quantization.",
    notice: "Ce composant transcrit un enregistrement en notes MIDI, une piste par instrument reconnu, et rend "
      + "le fichier obtenu.\n\n"
      + "« Instruments » restreint la recherche à un seul groupe ; à « Tous », le moteur cherche ceux que la bande "
      + "contient. « Calcul » nomme le périphérique employé.\n\n"
      + "« Tempo » donne au fichier le tempo en battements par minute qui sera écrit dedans. À zéro, celui que le "
      + "moteur a posé est gardé. Changer ce réglage ne déplace aucune note dans le temps : les instants restent "
      + "ceux de l'enregistrement, et seules les mesures et l'indication de tempo changent. L'entrée du même nom "
      + "reçoit ce chiffre d'un autre composant quand elle est branchée, et le réglage sert alors de repli.\n\n"
      + "« Quantification » pose ensuite chaque attaque sur la subdivision la plus proche du tempo retenu, ce qui "
      + "la déplace. À « Aucune », aucune attaque ne bouge. « Quantifier les fins » applique la même grille aux "
      + "fins de notes, qui restent sinon à leur durée.\n\n"
      + "La sortie « MIDI » rend le fichier. « Notes » rend la liste des notes, instrument par instrument. "
      + "« Rapport » donne le nombre de notes, les instruments trouvés, le tempo écrit et l'indice d'alignement "
      + "des attaques sur la grille avant quantification : zéro quand elles tombent toutes sur une subdivision, "
      + "un quand elles s'en écartent autant que le feraient des instants pris au hasard.",
    noticeEn: "This component transcribes a recording into MIDI notes, one track per recognized instrument, and "
      + "returns the resulting file.\n\n"
      + "« Instruments » narrows the search to a single group; at « All », the engine looks for those the track "
      + "contains. « Compute » names the device used.\n\n"
      + "« Tempo » gives the file the tempo in beats per minute that will be written in it. At zero, the one the "
      + "engine wrote is kept. Changing this setting moves no note in time: the instants stay those of the "
      + "recording, and only the bars and the tempo marking change. The input of the same name receives this "
      + "number from another component when connected, and the setting then serves as a fallback.\n\n"
      + "« Quantization » then places each onset on the nearest subdivision of the chosen tempo, which moves it. "
      + "At « None », no onset moves. « Quantize ends » applies the same grid to note ends, which otherwise keep "
      + "their duration.\n\n"
      + "The « MIDI » output returns the file. « Notes » returns the note listing, instrument by instrument. "
      + "« Report » gives the number of notes, the instruments found, the written tempo and the alignment index "
      + "of the onsets on the grid before quantization: zero when they all fall on a subdivision, one when they "
      + "stray from it as much as instants taken at random would.",
    entrees: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Tempo", nomEn: "Tempo", type: "controle", requis: false },
    ],
    sorties: [
      { nom: "MIDI", nomEn: "MIDI", type: "midi" },
      { nom: "Notes", nomEn: "Notes", type: "texte" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Instruments", nomEn: "Instruments", type: "choix",
        options: INSTRUMENTS.map((i) => i.fr), optionsEn: INSTRUMENTS.map((i) => i.en),
        optionIds: INSTRUMENTS.map((i) => i.id), defaut: "Tous", defautEn: "All",
        doc: "Le groupe d'instruments cherché. À « Tous », le moteur cherche ceux que la bande contient, et donne une piste à chacun.",
        docEn: "The instrument group searched for. At « All », the engine looks for those the track contains, and gives each one a track." },
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [0, 400], pas: 1, defaut: 0, unite: "BPM",
        doc: "Le tempo écrit dans le fichier. À zéro, celui que le moteur a posé est gardé. Aucune note ne change d'instant ; les mesures, elles, suivent ce chiffre.",
        docEn: "The tempo written in the file. At zero, the one the engine wrote is kept. No note changes instant; the bars, however, follow this number." },
      { nom: "Quantification", nomEn: "Quantization", type: "choix",
        options: GRILLES.map((g) => g.fr), optionsEn: GRILLES.map((g) => g.en),
        optionIds: GRILLES.map((g) => g.id), defaut: "Aucune", defautEn: "None",
        doc: "La grille sur laquelle poser les attaques. Chaque attaque rejoint la subdivision la plus proche, ce qui la déplace ; l'indice du rapport dit de combien le tempo retenu les en écarte.",
        docEn: "The grid the onsets are placed on. Each onset joins the nearest subdivision, which moves it; the report's index says how far the chosen tempo puts them from it." },
      { nom: "Quantifier les fins", nomEn: "Quantize ends", type: "choix",
        options: ["Non", "Oui"], optionsEn: ["No", "Yes"], optionIds: ["no", "yes"],
        defaut: "Non", defautEn: "No",
        doc: "Applique la grille aux fins de notes, qui restent sinon à leur durée. Sans effet quand « Quantification » vaut « Aucune », puisqu'il n'y a alors pas de grille.",
        docEn: "Applies the grid to note ends, which otherwise keep their duration. Without effect when « Quantization » is « None », since there is then no grid." },
      { nom: "Calcul", nomEn: "Compute", type: "choix",
        options: CALCULS.map((c) => c.fr), optionsEn: CALCULS.map((c) => c.en),
        optionIds: CALCULS.map((c) => c.id), defaut: "Automatique", defautEn: "Automatic",
        doc: "Le périphérique de calcul. Il change le temps de calcul et non les notes, qui sont les mêmes d'un périphérique à l'autre. « Automatique » laisse le moteur prendre ce qu'il juge le meilleur, ce qui n'est pas toujours la carte graphique : une machine à deux cartes expose souvent le circuit intégré en premier, et les deux numéros sont là pour les départager. « Processeur » tourne partout, et bien plus lentement.",
        docEn: "The compute device. It changes the compute time and not the notes, which are the same from one device to another. « Automatic » lets the engine take what it deems best, which is not always the graphics card: a machine with two cards often exposes the integrated one first, and the two numbers are there to tell them apart. « Processor » runs everywhere, and far more slowly." },
    ],
    async executer(ctx: any) {
      const pont = api();
      if (!pont?.muscriptorTranscrire) {
        return { valeurs: [null, null, null], erreur: true, message: traduire("msg.n_cessite_electron") };
      }
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null, null, null], erreur: true, message: traduire("msg.aucune_entr_e") };
      }

      await annoncerModele(ctx, "transcription-midi", traduire("progress.transcription.modele"));
      const { bufferVersWavBlob } = await import("../audio/io");
      const wav = new Uint8Array(await bufferVersWavBlob(audio).arrayBuffer());

      const debrancher = suivre(ctx);
      let r: { ok: boolean; midi?: Uint8Array; evenements?: string; journal?: string };
      try {
        r = await pont.muscriptorTranscrire({
          audio: wav,
          instruments: ctx.paramTexte("Instruments", ""),
          calcul: ctx.paramTexte("Calcul", "").trim(),
        }) as typeof r;
      } catch (erreur) {
        // L'APPEL LUI-MÊME PEUT ÉCHOUER, et pas seulement le travail demandé. Le cas qui se produit
        // est celui d'un processus principal plus vieux que le préchargement : le pont part, et
        // personne ne répond. `pont-electron.ts` porte le pourquoi et le remède.
        return { valeurs: [null, null, null], erreur: true, message: messageEchecPont(erreur, CANAL) };
      } finally {
        debrancher();
      }
      if (!r.ok || !r.midi) {
        return { valeurs: [null, null, null], erreur: true, message: (r.journal ?? "").slice(-240) };
      }

      const brut = parseMidi(new Uint8Array(r.midi));
      const attaques = analyserMidi(brut).notes.map((n) => n.debut).sort((a, b) => a - b);

      // LE TEMPO VIENT DU PORT S'IL EST BRANCHÉ, du réglage sinon : un détecteur rend un nombre sur
      // un port de contrôle, et recopier ce nombre à la main serait une occasion de se tromper.
      const entreeTempo = ctx.entree(1);
      const demande = typeof entreeTempo === "number" && entreeTempo > 0
        ? entreeTempo : ctx.paramNombre("Tempo", 0);
      const grille = ctx.paramTexte("Quantification", "none");
      const divisions = GRILLES.find((g) => g.id === grille)?.divisions ?? 4;

      let octets = new Uint8Array(r.midi);
      let tempoEcrit = bpmInitial(brut);
      if (demande > 0) {
        const { midi: reancre } = reancrerTempo(brut as any, demande);
        octets = new Uint8Array(writeMidi(reancre as any));
        tempoEcrit = demande;
      }
      const avant = mesurerAlignement(attaques, tempoEcrit, divisions);

      let fichier = new File([octets as unknown as BlobPart], "transcription.mid", { type: "audio/midi" });
      if (grille !== "none") {
        fichier = await transposerQuantifierMidi(
          fichier, 0, grille, ctx.paramTexte("Quantifier les fins", "no") === "yes");
      }

      const trouves = instrumentsTrouves(r.evenements ?? "");
      const notes = trouves.length > 0
        ? trouves.map((i) => `${i.nom} : ${i.notes}`).join("\n")
        : `${attaques.length} notes`;
      const rapport = [
        `${attaques.length} notes · ${brut.tracks.length} pistes`,
        `${traduire("msg.transcription.tempo")} ${Math.round(tempoEcrit)} BPM`,
        `${traduire("msg.transcription.alignement")} ${avant.indice.toFixed(2)} (${(avant.partProche * 100).toFixed(0)} % < 20 ms)`,
        grille === "none" ? traduire("msg.transcription.sans_grille")
          : `${traduire("msg.transcription.grille")} ${grille} · ${avant.ecartMoyenMs.toFixed(0)} ms`,
      ].join("\n");

      return {
        valeurs: [fichier, notes, rapport],
        message: `${attaques.length} notes · ${Math.round(tempoEcrit)} BPM · ${trouves.length || 1}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
