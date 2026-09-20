// plugins/instrument-graphe.ts — Le sous-graphe devient l'instrument, rejoué touche par touche.
//
// DEUX NŒUDS, ET LE MOTEUR FAIT LE RESTE. « Note d'instrument » est la FRONTIÈRE : elle porte la note
// que l'on joue, et tout ce qui est branché entre elle et « Fin d'instrument » est la recette.
// Avant l'exécution, le moteur recopie cette recette une fois par note du clavier et injecte la note
// dans chaque copie — voir `core/instrument-graphe.ts`, testé. Rien n'est transposé : chaque note est
// CALCULÉE à sa hauteur, ce qui est la différence entre un synthétiseur et un échantillonneur.
//
// POURQUOI TROIS SORTIES SUR LA NOTE. Une recette peut prendre la note de trois façons, et aucune ne
// remplace les deux autres : en AUDIO — une excitation à la bonne fréquence, à filtrer et à traiter ;
// en MIDI — pour les nœuds qui jouent des notes eux-mêmes (instruments Csound, modèles physiques,
// SoundFont) ; en COURBE — pour piloter un paramètre avec la hauteur, un filtre qui s'ouvre vers
// l'aigu par exemple. Le premier venu aurait suffi pour un oscillateur, et aurait fermé les deux
// autres familles d'instruments.

import { writeMidi } from "midi-file";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { NOTE_MAX, NOTE_MIN, apparierRendus, racinesInstrument } from "../core/instrument-graphe";
import { banqueDepuisRendus, rendreNotes, type Banque } from "../audio/clavier-banque";

const TICKS_NOIRE = 480;
const hertz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/** Un fichier MIDI d'une seule note, pour les nœuds qui jouent des notes eux-mêmes. */
function midiUneNote(note: number, velocite: number, dureeSec: number): File {
  // Tempo 60 : une noire vaut une seconde, donc les ticks se lisent directement en secondes.
  const ticks = Math.max(1, Math.round(dureeSec * TICKS_NOIRE));
  const piste: any[] = [
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 1000000 },
    { deltaTime: 0, type: "noteOn", noteNumber: note, velocity: velocite, channel: 0 },
    { deltaTime: ticks, type: "noteOff", noteNumber: note, velocity: 0, channel: 0 },
    { deltaTime: 0, meta: true, type: "endOfTrack" },
  ];
  const octets = new Uint8Array(writeMidi({
    header: { format: 0, numTracks: 1, ticksPerBeat: TICKS_NOIRE }, tracks: [piste],
  } as any));
  return new File([octets], `note-${note}.mid`, { type: "audio/midi" });
}

/** L'excitation : une forme d'onde à la fréquence de la note, avec un fondu aux deux bouts. */
function exciter(
  note: number, forme: string, dureeSec: number, volume: number, sampleRate: number,
): AudioBuffer {
  const n = Math.max(1, Math.round(dureeSec * sampleRate));
  const audio = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate });
  const d = audio.getChannelData(0);
  const f = hertz(note);
  const fondu = Math.min(Math.round(0.005 * sampleRate), Math.floor(n / 2));
  let graine = note * 2654435761;
  for (let i = 0; i < n; i++) {
    const phase = (f * i) / sampleRate;
    const p = phase - Math.floor(phase);
    let v: number;
    switch (forme) {
      case "carre": v = p < 0.5 ? 1 : -1; break;
      case "scie": v = 2 * p - 1; break;
      case "triangle": v = 4 * Math.abs(p - 0.5) - 1; break;
      case "impulsion":
        // Une impulsion par période : de quoi exciter un résonateur, comme une corde pincée.
        v = p < 1 / sampleRate * f * 2 ? 1 : 0;
        break;
      case "bruit":
        graine = (graine * 1103515245 + 12345) & 0x7fffffff;
        v = graine / 0x3fffffff - 1;
        break;
      default: v = Math.sin(2 * Math.PI * p);
    }
    let env = 1;
    if (i < fondu) env = i / fondu;
    else if (i > n - fondu) env = (n - i) / fondu;
    d[i] = volume * env * v;
  }
  return audio;
}

export const fiches: FicheAudio[] = ([
  {
    id: "frontiere-note", nom: "Note d'instrument", nomEn: "Instrument Note",
    univers: "Entrées", famille: "Génération",
    resume: "Porte la note jouée dans une chaîne d'instrument : excitation audio, MIDI d'une note, et la hauteur en courbe.",
    resumeEn: "Carries the played note into an instrument chain: audio excitation, one-note MIDI, and the pitch as a curve.",
    entrees: [],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "MIDI", nomEn: "MIDI", type: "midi" },
      { nom: "Hauteur", nomEn: "Pitch", type: "courbe" },
    ],
    parametres: [
      { nom: "Note", nomEn: "Note", type: "curseur", plage: [21, 108], pas: 1, defaut: 60,
        doc: "Note MIDI rendue (60 = do central). C'est la frontière de l'instrument : quand une « Fin d'instrument » est branchée en aval, le moteur recopie la chaîne une fois par note du clavier et remplace ce réglage dans chaque copie. Seul, le nœud rend la note réglée ici — de quoi écouter et régler l'instrument à une hauteur avant de le décliner sur les 88 touches.",
        docEn: "MIDI note rendered (60 = middle C). This is the instrument's boundary: when an « Instrument End » is connected downstream, the engine copies the chain once per keyboard note and replaces this setting in each copy. On its own, the node renders the note set here — enough to listen to and tune the instrument at one pitch before spreading it across the 88 keys." },
      { nom: "Forme", nomEn: "Waveform", type: "choix",
        options: ["Sinus", "Dent de scie", "Carré", "Triangle", "Impulsion", "Bruit"],
        optionsEn: ["Sine", "Sawtooth", "Square", "Triangle", "Impulse", "Noise"],
        optionIds: ["sinus", "scie", "carre", "triangle", "impulsion", "bruit"],
        defaut: "Dent de scie", defautEn: "Sawtooth",
        doc: "Forme de l'excitation rendue sur la sortie Audio. La dent de scie contient tous les harmoniques, ce qui donne au filtre de quoi travailler ; l'impulsion excite un résonateur comme une corde pincée ; le bruit sert aux sons soufflés et aux percussions. La sortie MIDI et la sortie Hauteur ne dépendent pas de ce réglage.",
        docEn: "Shape of the excitation on the Audio output. The sawtooth holds every harmonic, giving a filter something to work with; the impulse excites a resonator like a plucked string; Noise serves breathy sounds and percussion. The MIDI and Pitch outputs do not depend on this setting." },
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [0.1, 8], pas: 0.1, defaut: 1.5, unite: "s",
        doc: "Durée de l'excitation, et donc de chaque échantillon de la banque. C'est elle qui décide du poids de l'instrument : dix-huit zones d'une seconde et demie font environ deux mégaoctets.",
        docEn: "Length of the excitation, hence of each sample in the bank. It decides the instrument's weight: eighteen zones of a second and a half come to about two megabytes." },
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 60, unite: "%",
        doc: "Niveau de l'excitation. À garder bas si la chaîne résonne : un filtre à forte résonance peut multiplier le niveau par dix.",
        docEn: "Level of the excitation. Keep it low if the chain resonates: a high-resonance filter can multiply the level tenfold." },
      { nom: "Vélocité", nomEn: "Velocity", type: "curseur", plage: [1, 127], pas: 1, defaut: 100,
        doc: "Vélocité écrite dans la sortie MIDI, pour les nœuds qui en tiennent compte.",
        docEn: "Velocity written into the MIDI output, for the nodes that take it into account." },
    ],
    async executer(ctx: any) {
      const note = Math.round(ctx.paramNombre("Note", 60));
      const duree = ctx.paramNombre("Durée", 1.5);
      const audio = exciter(
        note, ctx.paramTexte("Forme", "scie"), duree,
        ctx.paramNombre("Volume", 60) / 100, 44100,
      );
      const midi = midiUneNote(note, Math.round(ctx.paramNombre("Vélocité", 100)), duree);
      // La hauteur en courbe : normalisée sur l'étendue du clavier, en échelle logarithmique comme
      // toutes les courbes de hauteur d'Attic — une octave vaut partout le même intervalle.
      const part = (note - NOTE_MIN) / Math.max(1, NOTE_MAX - NOTE_MIN);
      const hauteurCourbe = { valeurs: new Float32Array(32).fill(part), cadence: 32 / duree };
      return {
        valeurs: [audio, midi, hauteurCourbe],
        message: traduire("msg.instrument.note", String(note), hertz(note).toFixed(1)),
      };
    },
  },
  {
    id: "instrument-fin", nom: "Fin d'instrument", nomEn: "Instrument End",
    // Dans les SORTIES, avec « Export SFZ » : ce nœud ne traite pas un son, il REFERME une chaîne
    // et livre une banque — c'est un aboutissement, pas un effet de plus dans le signal.
    univers: "Sorties", famille: "Export",
    resume: "Referme une chaîne d'instrument et rassemble les rendus de toutes les notes en une banque de clavier.",
    resumeEn: "Closes an instrument chain and gathers every note's render into a keyboard bank.",
    entrees: [{ nom: "Audio", type: "audio", dynamique: true }],
    sorties: [
      { nom: "Banque", nomEn: "Bank", type: "banque" },
      { nom: "Aperçu", nomEn: "Preview", type: "audio" },
    ],
    parametres: [
      { nom: "Largeur de zone", nomEn: "Zone width", type: "curseur", plage: [1, 12], pas: 1, defaut: 2,
        unite: " demi-tons", uniteEn: " semitones",
        doc: "Écart entre deux notes rendues. C'est le réglage qui décide du coût : la chaîne est rejouée une fois par note, donc dix-huit fois à ±2 demi-tons sur 88 touches, six fois à ±6. Contrairement à l'étalement par transposition, la largeur ne dégrade pas le son de la racine — elle décide seulement de combien de demi-tons les touches voisines seront rééchantillonnées à la lecture.",
        docEn: "Gap between two rendered notes. This is the setting that decides the cost: the chain is replayed once per note, so eighteen times at ±2 semitones over 88 keys, six times at ±6. Unlike spreading by transposition, the width does not degrade the root's sound — it only decides by how many semitones neighbouring keys will be resampled at playback." },
      { nom: "Note basse", nomEn: "Lowest key", type: "curseur", plage: [21, 108], pas: 1, defaut: 21,
        doc: "Première touche couverte. 21 = La0.", docEn: "First key covered. 21 = A0." },
      { nom: "Note haute", nomEn: "Highest key", type: "curseur", plage: [21, 108], pas: 1, defaut: 108,
        doc: "Dernière touche couverte. 108 = Do8.", docEn: "Last key covered. 108 = C8." },
      { nom: "Boucle de maintien", nomEn: "Sustain loop", type: "choix",
        options: ["Oui", "Non"], optionsEn: ["Yes", "No"], optionIds: ["oui", "non"],
        defaut: "Oui", defautEn: "Yes",
        doc: "Pose dans chaque zone une boucle relue tant que la touche est tenue. Utile si l'excitation est courte et que l'on veut des notes tenues.",
        docEn: "Places in each zone a loop replayed while the key is held. Useful if the excitation is short and held notes are wanted." },
      { nom: "Début de boucle", nomEn: "Loop start", type: "curseur", plage: [5, 90], pas: 1, defaut: 50, unite: "%",
        doc: "Où la boucle commence dans l'échantillon — après l'attaque, donc.",
        docEn: "Where the loop starts within the sample — after the attack, then." },
    ],
    async executer(ctx: any) {
      const brutes = ctx.entrees() as unknown[];
      // Les racines se recalculent ici à l'identique du dépliage : le moteur a livré un rendu par
      // racine, DANS CET ORDRE, et c'est pourquoi la fonction est partagée. L'appariement garde
      // l'INDICE de chaque entrée — une copie qui a échoué livre `null`, et décaler les notes
      // suivantes rendrait une banque fausse sans que rien ne le dise. Voir `core`, testé.
      const racines = racinesInstrument(ctx.noeud as any);
      const app = apparierRendus<AudioBuffer>(brutes, racines,
        (v): v is AudioBuffer => v instanceof AudioBuffer);
      // Le nombre d'entrées ne correspond pas au dépliage : la chaîne n'a donc PAS été dépliée —
      // pas de « Note d'instrument » en amont, deux notes en amont, ou rien entre les deux —, ou un
      // nœud étranger nourrit la fin. Rendre une banque ici serait rendre une banque désaccordée.
      if (app.nonDeplie) {
        return {
          valeurs: [null, null],
          message: traduire("msg.instrument.nonDeplie", String(brutes.length), String(racines.length)),
        };
      }
      const rendus = app.paires.map((p) => p.valeur);
      if (rendus.length === 0) {
        return { valeurs: [null, null], message: traduire("msg.instrument.sansNote") };
      }
      const banque: Banque = banqueDepuisRendus(app.paires.map((p) => p.racine), rendus, {
        largeur: Math.round(ctx.paramNombre("Largeur de zone", 2)),
        noteBasse: Math.round(ctx.paramNombre("Note basse", NOTE_MIN)),
        noteHaute: Math.round(ctx.paramNombre("Note haute", NOTE_MAX)),
        boucle: ctx.paramTexte("Boucle de maintien", "oui") !== "non",
        boucleDebut: ctx.paramNombre("Début de boucle", 50) / 100,
      });
      const apercu = rendreNotes(
        banque.zones.map((z, i) => ({ note: z.racine, velocite: 100, debut: i * 0.35, fin: i * 0.35 + 0.33 })),
        banque, { volume: 0.8, relachement: 0.02 },
      );
      // Les notes manquantes sont NOMMÉES : c'est ce qui dit où chercher. Toutes sauf une, et le
      // défaut est en amont de la chaîne ; les plus graves ou les plus aiguës seulement, et c'est un
      // nœud qui ne tient pas toute l'étendue du clavier. Le nœud fautif de la chaîne, lui, est en
      // rouge dans le graphe — les statuts des copies remontent au nœud visible.
      return {
        valeurs: [banque, apercu],
        message: app.manquantes.length > 0
          ? traduire("msg.instrument.partielle", String(rendus.length), String(racines.length),
              app.manquantes.slice(0, 8).join(", ") + (app.manquantes.length > 8 ? "…" : ""))
          : traduire("msg.instrument.faite", String(banque.zones.length), String(racines[0]), String(racines[racines.length - 1])),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
