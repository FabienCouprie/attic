// plugins/magenta-helpers.ts — Fonctions de calcul des nœuds Magenta.
// Partagées entre le thread principal (magenta.ts) et le worker Magenta.
// @magenta/music : Apache 2.0 — déjà listé dans THIRD_PARTY.md.

import { creerAleatoire } from "../core";
import * as sequences from "@magenta/music/esm/core/sequences";
import { NoteSequence } from "@magenta/music/esm/protobuf";
import { parseMidi, writeMidi } from "midi-file";
// `midi-ordre` et NON `audio/midi` : ce fichier est chargé par le worker Magenta, et `audio/midi`
// tire `i18n.tsx` derrière lui — un module React, que Vite équipe en développement d'un préambule
// touchant `window`, lequel n'existe pas dans un worker.
import { comparerEvenementsMidi } from "../audio/midi-ordre";
import * as tf from "@tensorflow/tfjs";

tf.disableDeprecationWarnings();

/**
 * LES POINTS DE CONTRÔLE SONT LIVRÉS AVEC L'APPLICATION, et ne viennent plus d'un tiers.
 *
 * Ils vivaient sur `storage.googleapis.com`, chargés à l'exécution. Trois conséquences, toutes
 * vérifiées : une installation SANS RÉSEAU ne pouvait employer aucun des sept nœuds, là où tous les
 * autres nœuds à modèle fonctionnent hors ligne ; rien ne vérifiait l'intégrité de ce qui arrivait,
 * ces modèles étant absents de `modeles-manifest.json` ; et ils venaient d'un tiers, contre la
 * règle du dépôt. Ce qui n'était PAS en cause : le coût réseau. Mesuré sur trois lancements avec le
 * même profil, le cache disque de Chromium servait les six fichiers dès le second — 13 934 825
 * octets au premier, zéro ensuite.
 *
 * CINQ POINTS DE CONTRÔLE POUR SEPT NŒUDS, et c'est ce que l'ancienne table cachait : deux paires
 * partagent leur modèle. `instances` est donc indexé par POINT DE CONTRÔLE et non par nœud, sans
 * quoi le même modèle était construit deux fois en mémoire.
 */
const POINTS = {
  drums: "drums_2bar_nade_9_q2",
  continuation: "melody_rnn",
  melody: "melody_rnn",
  interpolation: "mel_2bar_small",
  drumsSeed: "drums_2bar_nade_9_q2",
  humanize: "groovae_2bar_humanize",
  improvisation: "piano_genie",
} as const;

/**
 * Où lire un point de contrôle, selon l'endroit où le code tourne.
 *
 * TROIS ENVIRONNEMENTS, ET LE WORKER EST LE DIFFICILE. Ce module est chargé par
 * `workers/magenta-worker.ts`, où `self.location` est l'URL DU SCRIPT du worker : une adresse
 * relative s'y résoudrait contre `/src/workers/`, et non contre la page. La base est donc toujours
 * absolue, construite sur l'ORIGINE.
 *
 *   · navigateur et développement — `http://hôte/magenta/…`, que Vite sert depuis `public/` ;
 *   · application empaquetée — la page vient de `file://`, où un `fetch` est refusé et où le worker
 *     n'a pas de preload : on passe par le schéma `attic-res:`, servi par le processus principal,
 *     qui résout par le même chemin que tout le reste du dépôt ;
 *   · test en Node — pas de `location` du tout, et aucun modèle n'y est chargé.
 */
function baseDuPoint(point: string): string {
  const loc = typeof self !== "undefined" ? self.location : undefined;
  if (!loc) return `magenta/${point}`;
  if (loc.protocol === "file:") return `attic-res://magenta/${point}`;
  return new URL(`magenta/${point}`, loc.origin).href;
}

export type ModelKind = keyof typeof POINTS;

/** Indexé par POINT DE CONTRÔLE : deux nœuds qui partagent un modèle le construisent une fois. */
const instances: Record<string, any> = {};

async function getModel(kind: ModelKind) {
  const point = POINTS[kind];
  if (instances[point]) return instances[point]!;
  const url = baseDuPoint(point);
  let model: any;
  if (kind === "drums" || kind === "interpolation" || kind === "drumsSeed" || kind === "humanize") {
    const { MusicVAE } = await import("@magenta/music/esm/music_vae/model");
    model = new MusicVAE(url);
  } else if (kind === "continuation" || kind === "melody") {
    const { MusicRNN } = await import("@magenta/music/esm/music_rnn/model");
    model = new MusicRNN(url);
  } else {
    const { PianoGenie } = await import("@magenta/music/esm/piano_genie/model");
    model = new PianoGenie(url);
  }
  // PLUS DE DÉTOUR PAR LE PROCESSUS PRINCIPAL : il servait à franchir la CSP vers Google, et il
  // n'y a plus de Google à franchir. Il ne s'est d'ailleurs jamais déclenché ici, `getModel`
  // tournant toujours dans le worker, où `window.api` n'existe pas.
  await model.initialize();
  instances[point] = model;
  return model;
}

async function fileToNoteSequence(file: File): Promise<any> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const midi = parseMidi(bytes);
  const ticksPerQuarter = midi.header.ticksPerBeat ?? 480;
  const tempos: { time: number; qpm: number }[] = [];
  const timeSignatures: { time: number; numerator: number; denominator: number }[] = [];
  const notes: any[] = [];

  let currentTempo = 500000; // 120 BPM
  let tempoTime = 0;
  let lastTempoTick = 0;
  const tickToSeconds = (tick: number) => tempoTime + ((tick - lastTempoTick) * currentTempo) / (ticksPerQuarter * 1_000_000);

  for (const track of midi.tracks) {
    let tick = 0;
    const active = new Map<string, { pitch: number; velocity: number; startTime: number; channel: number }>();
    for (const event of track) {
      tick += event.deltaTime;
      if (event.type === "setTempo") {
        const t = tickToSeconds(tick);
        tempos.push({ time: t, qpm: 60_000_000 / event.microsecondsPerBeat });
        tempoTime = t;
        lastTempoTick = tick;
        currentTempo = event.microsecondsPerBeat;
      }
      if (event.type === "timeSignature") {
        timeSignatures.push({ time: tickToSeconds(tick), numerator: event.numerator, denominator: event.denominator });
      }
      if (event.type === "noteOn" && event.velocity > 0) {
        const t = tickToSeconds(tick);
        const key = `${event.channel}-${event.noteNumber}`;
        active.set(key, { pitch: event.noteNumber, velocity: event.velocity, startTime: t, channel: event.channel });
      }
      if (event.type === "noteOff" || (event.type === "noteOn" && event.velocity === 0)) {
        const t = tickToSeconds(tick);
        const key = `${event.channel}-${event.noteNumber}`;
        const note = active.get(key);
        if (note) {
          active.delete(key);
          notes.push({
            pitch: note.pitch,
            velocity: note.velocity,
            startTime: note.startTime,
            endTime: t,
            isDrum: note.channel === 9,
          });
        }
      }
    }
  }

  const totalTime = notes.length > 0 ? Math.max(...notes.map((n) => n.endTime)) : 0;
  if (tempos.length === 0) tempos.push({ time: 0, qpm: 120 });
  if (timeSignatures.length === 0) timeSignatures.push({ time: 0, numerator: 4, denominator: 4 });

  return { notes, tempos, timeSignatures, ticksPerQuarter, totalTime };
}

function toPlainNoteSequence(ns: any): any {
  const clone = (v: any): any => {
    if (v === undefined || v === null) return v;
    if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
    if (Array.isArray(v)) return v.map(clone);
    if (typeof v === "object") {
      if (typeof v.toNumber === "function") return v.toNumber();
      const out: any = {};
      for (const key of Object.keys(v)) out[key] = clone(v[key]);
      return out;
    }
    return v;
  };
  const plain = clone(ns);
  if (Array.isArray(plain.notes)) {
    for (const n of plain.notes) {
      if (n.velocity === undefined || n.velocity === null || n.velocity === 0) {
        n.velocity = 80;
      }
    }
  }
  return plain;
}

function noteSequenceToMidiEvents(ns: any) {
  const ticksPerBeat = ns.ticksPerQuarter || 480;
  const tempos = ns.tempos && ns.tempos.length > 0 ? ns.tempos : [{ time: 0, qpm: 120 }];
  const qpm = tempos[0].qpm ?? 120;
  const timeToTicks = (t: number) => Math.round(t * ticksPerBeat * qpm / 60);

  const track0: any[] = [
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: Math.round(60_000_000 / qpm) },
  ];
  const timeSigs = ns.timeSignatures && ns.timeSignatures.length > 0 ? ns.timeSignatures : [{ time: 0, numerator: 4, denominator: 4 }];
  let lastSigTick = 0;
  for (const ts of timeSigs) {
    const tick = timeToTicks(ts.time);
    track0.push({ deltaTime: tick - lastSigTick, meta: true, type: "timeSignature", numerator: ts.numerator, denominator: ts.denominator, metronome: 24, thirtyseconds: 8 });
    lastSigTick = tick;
  }
  track0.push({ deltaTime: 0, meta: true, type: "endOfTrack" });

  const track1: any[] = [];
  const notes: any[] = (ns.notes || []).map((n: any) => ({
    pitch: n.pitch ?? n.note ?? 60,
    velocity: n.velocity ?? 80,
    startTime: n.startTime ?? 0,
    endTime: n.endTime ?? ((n.startTime ?? 0) + 0.1),
    channel: n.isDrum ? 9 : (n.channel ?? 0),
    program: n.program ?? 0,
  }));
  notes.sort((a, b) => a.startTime - b.startTime);

  const channels = new Set(notes.map((n) => n.channel));
  for (const channel of channels) {
    if (channel !== 9) {
      const program = notes.find((n) => n.channel === channel)?.program ?? 0;
      track1.push({ deltaTime: 0, channel, type: "programChange", programNumber: program });
    }
  }

  const events = notes.flatMap((n) => [
    { tick: timeToTicks(n.startTime), channel: n.channel, type: "noteOn", noteNumber: n.pitch, velocity: n.velocity },
    { tick: Math.max(timeToTicks(n.startTime) + 1, timeToTicks(n.endTime)), channel: n.channel, type: "noteOff", noteNumber: n.pitch, velocity: 0 },
  ]);
  // Note-off avant note-on à tick égal (voir `comparerEvenementsMidi`) : sinon une note
  // qui se rejoue à la même hauteur est refermée à l'instant où elle s'ouvre.
  events.sort((a: any, b: any) => comparerEvenementsMidi(a, b));

  let lastTick = 0;
  for (const e of events) {
    track1.push({ deltaTime: e.tick - lastTick, channel: e.channel, type: e.type, noteNumber: e.noteNumber, velocity: e.velocity });
    lastTick = e.tick;
  }
  track1.push({ deltaTime: 0, meta: true, type: "endOfTrack" });

  return { header: { format: 1 as const, numTracks: 2, ticksPerBeat }, tracks: [track0, track1] };
}

/**
 * Écrit une séquence en fichier MIDI, au tempo demandé.
 *
 * `qpm` EXISTE PARCE QU'UNE SÉQUENCE ENGENDRÉE N'EN PORTE PAS. Magenta construit la sienne par
 * `createQuantizedNoteSequence(stepsPerQuarter, qpm)` sans lui passer de `qpm` : elle revient donc
 * à 120, le défaut de la bibliothèque, quel que soit le tempo de ce qu'on lui a donné. Un appelant
 * qui connaît le tempo de l'entrée le passe ici, et `unquantizeSequence` s'en sert pour les deux
 * choses qui en dépendent — l'en-tête de tempo du fichier, et la conversion des pas en secondes.
 *
 * Sans argument, le comportement d'avant est conservé : c'est le cas des nœuds qui portent leur
 * propre réglage de tempo et l'ont déjà posé sur la séquence.
 *
 * EXPORTÉE POUR ÊTRE TENUE PAR UN TEST, et c'est la seule raison : les modèles Magenta exigent un
 * navigateur, du WebGL et le réseau, de sorte qu'aucun test ne peut passer par un nœud entier.
 * Cette fonction-ci est le chemin d'écriture, pure et sans modèle ; c'est là que le tempo se perd
 * ou se garde, donc c'est là que le contrat se vérifie.
 */
export async function noteSequenceToMidiFile(ns: any, name: string, qpm?: number): Promise<File> {
  const plain = toPlainNoteSequence(ns);
  const toEncode = plain.quantizationInfo ? sequences.unquantizeSequence(plain, qpm) : plain;
  const midiData = noteSequenceToMidiEvents(toEncode);
  const bytes = new Uint8Array(writeMidi(midiData as any));
  return new File([bytes as unknown as BlobPart], name, { type: "audio/midi" });
}

/**
 * Le tempo d'une séquence lue d'un fichier, ou `undefined` si elle n'en porte pas.
 *
 * LE PREMIER TEMPO, ET C'EST UN CHOIX : un MIDI peut en changer en cours de route, mais une
 * séquence quantifiée n'en admet qu'un — `unquantizeSequence` le vérifie elle-même. Continuer une
 * pièce qui accélère au tempo de son DÉBUT est ce qui se rapproche le plus de l'intention.
 */
export function tempoDe(ns: any): number | undefined {
  const qpm = ns?.tempos?.[0]?.qpm;
  return typeof qpm === "number" && qpm > 0 ? qpm : undefined;
}

// ── Nouveaux nœuds : génération, interpolation, humanisation, synthèse ──

/** Même chemin que la continuation, donc même perte de tempo, et même correctif. */
export async function genererMelodie(file: File, steps: number, temperature: number, spq: number): Promise<File> {
  const model = await getModel("melody");
  const ns = await fileToNoteSequence(file);
  const qns = sequences.quantizeNoteSequence(ns, spq);
  const continued = await model.continueSequence(qns, steps, temperature);
  return noteSequenceToMidiFile(continued, "magenta_melodie.mid", tempoDe(ns));
}

export async function interpolerMidi(file1: File, file2: File, numInterps: number, temperature: number, position: number): Promise<File> {
  const model = await getModel("interpolation");
  const ns1 = await fileToNoteSequence(file1);
  const ns2 = await fileToNoteSequence(file2);
  const qns1 = sequences.quantizeNoteSequence(ns1, 4);
  const qns2 = sequences.quantizeNoteSequence(ns2, 4);
  const interps = await model.interpolate([qns1, qns2], numInterps, temperature);
  const idx = Math.min(numInterps - 1, Math.floor(position * numInterps));
  // LE TEMPO DE LA PREMIÈRE PIÈCE, ET C'EST UN CHOIX À CONNAÎTRE. `interpolate` appelle `decode`
  // sans tempo, donc son résultat sortait à 120 comme les autres. Deux pièces peuvent avoir deux
  // tempos ; on prend celui du DÉPART, qui est la pièce qu'on fait évoluer. Interpoler aussi le
  // tempo serait défendable, mais ferait dériver la vitesse avec un curseur que l'utilisateur
  // règle pour la MÉLODIE, ce qui surprendrait.
  return noteSequenceToMidiFile(interps[idx], "magenta_interpolation.mid", tempoDe(ns1));
}

export async function genererBatterie(file: File | null, temperature: number, bars: number, tempo: number, similarity: number): Promise<File> {
  const model = await getModel("drumsSeed");
  let seqs: any[];
  if (file) {
    const ns = await fileToNoteSequence(file);
    const qns = sequences.quantizeNoteSequence(ns, 4);
    const out = await model.similar(qns, 1, similarity, temperature);
    seqs = [out[0]];
  } else {
    const numSamples = Math.max(1, Math.ceil(bars / 2));
    seqs = await model.sample(numSamples, temperature);
  }
  const durations = seqs.map((s) => s.totalQuantizedSteps ?? s.totalTime);
  const combined = sequences.concatenate(seqs, durations);
  combined.tempos = [NoteSequence.Tempo.create({ time: 0, qpm: tempo })];
  const outFile = await noteSequenceToMidiFile(combined, "magenta_batterie.mid");
  return outFile;
}

/**
 * ICI LE 120 ÉTAIT ÉCRIT EN DUR, et c'est la forme la plus visible du même défaut : `decode` prend
 * le tempo en cinquième argument et le pose sur la séquence rendue. On lui donne celui de l'entrée.
 *
 * Humaniser un groove, c'est en déplacer légèrement les attaques : le rendre à un autre tempo que
 * celui où il a été joué était la seule façon de défaire ce que le nœud vient de faire.
 */
export async function humaniserGroove(file: File, temperature: number, spq: number): Promise<File> {
  const model = await getModel("humanize");
  const ns = await fileToNoteSequence(file);
  const qns = sequences.quantizeNoteSequence(ns, spq);
  const z = await model.encode([qns]);
  const decoded = await model.decode(z, temperature, undefined, spq, tempoDe(ns) ?? 120);
  z.dispose();
  return noteSequenceToMidiFile(decoded[0], "magenta_groove.mid");
}

// ── Continuation ────────────────────────────────────────────────────────

/**
 * LA CONTINUATION SUIT LE TEMPO DE CE QU'ELLE CONTINUE — relevé par Fabien, en vérifiant ce que
 * « Pas à générer » produit.
 *
 * Elle ne le suivait pas : `continueSequence` rend une séquence que Magenta a construite sans
 * tempo, donc à 120. **Mesuré : une entrée à 90 noires par minute rendait une suite à 120**, au
 * niveau de la séquence comme du fichier écrit, et cela dans les six réglages essayés. Enchaînée
 * après la pièce, la continuation jouait donc plus vite qu'elle.
 */
export async function continuerMidi(file: File, steps: number, temperature: number, spq: number): Promise<File> {
  const model = await getModel("continuation");
  const ns = await fileToNoteSequence(file);
  const qns = sequences.quantizeNoteSequence(ns, spq);
  const continued = await model.continueSequence(qns, steps, temperature);
  return noteSequenceToMidiFile(continued, "magenta_continuation.mid", tempoDe(ns));
}

// ── Improvisation ───────────────────────────────────────────────────────

export const MODES = ["Aléatoire", "Marche", "Montant", "Descendant", "Arpège"];
export const MODES_EN = ["Random", "Walk", "Up", "Down", "Arpeggio"];
export const MODES_IDS = ["random", "walk", "up", "down", "arpeggio"];
const ARP = [0, 2, 4, 6, 7, 5, 3, 1];

function choisirBouton(
  step: number, mode: string, prev: number,
  hasard: () => number = Math.random,
): number {
  switch (mode) {
    case "up": return step % 8;
    case "down": return 7 - (step % 8);
    case "arpeggio": return ARP[step % 8];
    case "walk": {
      const dir = hasard() < 0.5 ? -1 : 1;
      return Math.max(0, Math.min(7, prev + dir));
    }
    default: return Math.floor(hasard() * 8);
  }
}

export async function improviser(duree: number, tempo: number, temperature: number, mode: string, seed: number): Promise<File> {
  const model = await getModel("improvisation");
  const stepDuration = 60 / tempo / 4; // double-croches
  const steps = Math.max(1, Math.ceil(duree / stepDuration));
  const notes: any[] = [];
  let t = 0;
  let prevButton = 0;
  const seedVal = seed > 0 ? seed : undefined;
  // La graine pilotait le modele Magenta mais PAS le choix des boutons, qui
  // tirait sur Math.random : deux executions a graine egale ne donnaient donc
  // pas la meme improvisation. Les deux sources partagent desormais la graine.
  const hasard = seed > 0 ? creerAleatoire(seed) : Math.random;
  model.resetState();
  for (let i = 0; i < steps; i++) {
    const button = choisirBouton(i, mode, prevButton, hasard);
    (model as any).overrideDeltaTime(stepDuration);
    const pitch = model.next(button, temperature, seedVal);
    const note = Math.max(0, Math.min(127, pitch + 21));
    const noteDuration = stepDuration * 0.9;
    notes.push({ pitch: note, velocity: 100, startTime: t, endTime: t + noteDuration, isDrum: false });
    t += stepDuration;
    prevButton = button;
  }
  const ns = {
    notes,
    tempos: [{ time: 0, qpm: tempo }],
    timeSignatures: [{ time: 0, numerator: 4, denominator: 4 }],
    totalTime: t,
  };
  return noteSequenceToMidiFile(ns, "magenta_improvisation.mid");
}
