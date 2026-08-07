// audio/groove-box.ts — Groove box : progressions d'accords déterministes + mélodie de réservoir.
// Combine une grille harmonique fixe (I-IV-V-I...) avec une mélodie émergente
// générée par un réservoir de neurones aléatoires. La mélodie est quantisée
// aux notes de l'accord courant pour rester consonante.

import { writeMidi } from "midi-file";
import { genererReservoirMusical, type ConfigReservoir, type NoteGeneree } from "./reservoir";
import {
  PROGRESSIONS_GENRE,
  degresGammeAccords,
  degreAccordProche,
  traduireCle,
  PATRONS_RYTHME,
  type Patron,
} from "./generation";

export interface ConfigGrooveBox {
  cle: string;
  gamme: string;
  genre: string;
  progression: string;
  tempo: number;
  dureeAccord: number;
  nbAccords: number;
  styleRythme: string;
  // réservoir
  neurones: number;
  connectivite: number;
  memoire: number;
  spectre: number;
  octave: number;
  densite: number;
  repetition: number;
  silence: number;
  graine: number;
}

export interface NoteGroove {
  note: number;
  velocite: number;
  debut: number;
  fin: number;
  canal: number;
}

export interface ResultatGrooveBox {
  midiBytes: Uint8Array;
  midiAccords: Uint8Array;
  midiBasse: Uint8Array;
  midiMelodie: Uint8Array;
  midiBatterie: Uint8Array;
  notes: NoteGroove[];
  description: string;
  graineUtilisee: number;
}

const ROMAIN_VERS_DEGRE: Record<string, number> = {
  I: 0, II: 1, III: 2, IV: 3, V: 4, VI: 5, VII: 6,
  i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6,
};

function progressionDepuisConfig(config: ConfigGrooveBox): number[] {
  if (config.genre === "custom" || config.genre === "personnalisé") {
    const parsed = config.progression
      .split("-")
      .map((r) => ROMAIN_VERS_DEGRE[r.trim()])
      .filter((n) => n !== undefined);
    return parsed.length > 0 ? parsed : [0];
  }
  const progressions = PROGRESSIONS_GENRE[config.genre] || PROGRESSIONS_GENRE["pop"];
  return progressions[0];
}

// Tierce et quinte trouvées par proximité (degreAccordProche) plutôt que par
// décalage d'index fixe (+2/+4 degrés) : sur une gamme heptatonique cela
// retombe sur le 3e/5e degré habituel, et cela reste correct sur une gamme
// pentatonique (5 degrés) où +2/+4 degrés ne correspond plus à une tierce/
// quinte réelle.
function notesAccord(degre: number, decalage: number, degres: number[]): number[] {
  const racinePc = degres[degre % degres.length];
  const root = 36 + decalage + racinePc + Math.floor(degre / degres.length) * 12;
  const third = root + degreAccordProche(degres, racinePc, 4);
  const fifth = root + degreAccordProche(degres, racinePc, 7);
  return [root, third, fifth];
}

function genererNotesAccordsEtBasse(
  progression: number[],
  config: ConfigGrooveBox,
  degres: number[],
  decalage: number,
): NoteGroove[] {
  const notes: NoteGroove[] = [];
  const noire = 60 / config.tempo;
  const dureeSecAccord = config.dureeAccord * noire;

  for (let i = 0; i < config.nbAccords; i++) {
    const deb = i * dureeSecAccord;
    const fin = deb + dureeSecAccord;
    const deg = progression[i % progression.length];
    const [root, third, fifth] = notesAccord(deg, decalage, degres);

    // Accord (canal 0)
    notes.push({ note: root, velocite: 75, debut: deb, fin, canal: 0 });
    notes.push({ note: third, velocite: 70, debut: deb, fin, canal: 0 });
    notes.push({ note: fifth, velocite: 65, debut: deb, fin, canal: 0 });

    // Basse (canal 1)
    notes.push({ note: root - 12, velocite: 95, debut: deb, fin, canal: 1 });
  }

  return notes;
}

function quantifierReservoirSurAccord(
  noteReservoir: NoteGeneree,
  progression: number[],
  config: ConfigGrooveBox,
  degres: number[],
  decalage: number,
): NoteGroove {
  const noire = 60 / config.tempo;
  const dureeSecAccord = config.dureeAccord * noire;
  const idxChord = Math.min(
    Math.max(0, Math.floor(noteReservoir.debut / dureeSecAccord)),
    config.nbAccords - 1,
  );
  const deg = progression[idxChord % progression.length];
  const [root, third, fifth] = notesAccord(deg, decalage, degres);
  const chordTones = [root, third, fifth];

  // Trouve la hauteur de l'accord la plus proche de la note du réservoir
  let nearest = chordTones[0];
  let bestDist = Infinity;
  for (const t of chordTones) {
    const octaveShift = 12 * Math.round((noteReservoir.note - t) / 12);
    const candidate = Math.max(0, Math.min(127, t + octaveShift));
    const dist = Math.abs(noteReservoir.note - candidate);
    if (dist < bestDist) {
      bestDist = dist;
      nearest = candidate;
    }
  }

  return {
    note: nearest,
    velocite: noteReservoir.velocite,
    debut: noteReservoir.debut,
    fin: noteReservoir.debut + noteReservoir.duree,
    canal: 2,
  };
}

function genererNotesBatterie(config: ConfigGrooveBox): NoteGroove[] {
  const notes: NoteGroove[] = [];
  const mesures = Math.max(1, Math.ceil((config.nbAccords * config.dureeAccord) / 4));
  const pasParMesure = 16;
  const totalPas = mesures * pasParMesure;
  const tempsPas = (60 / config.tempo) / 4;

  const entree = PATRONS_RYTHME[config.styleRythme];
  const signatureCle = "4/4";
  const patron: Patron =
    entree && entree.signatures.includes(signatureCle)
      ? entree.positions[signatureCle]!
      : { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] };

  for (let p = 0; p < totalPas; p++) {
    const t = p * tempsPas;
    const pos = p % pasParMesure;
    if (patron.kick.includes(pos)) {
      notes.push({ note: 36, velocite: 100, debut: t, fin: t + 0.05, canal: 9 });
    }
    if (patron.snare.includes(pos)) {
      notes.push({ note: 38, velocite: 85, debut: t, fin: t + 0.05, canal: 9 });
    }
    if (patron.hat.includes(pos)) {
      notes.push({ note: 42, velocite: 65, debut: t, fin: t + 0.03, canal: 9 });
    }
    if (patron.hatOuvert.includes(pos)) {
      notes.push({ note: 46, velocite: 75, debut: t, fin: t + 0.05, canal: 9 });
    }
  }

  return notes;
}

function trierPiste(events: any[]): any[] {
  events.sort((a, b) => a.deltaTime - b.deltaTime || (a.type === "noteOff" ? 1 : -1));
  let tick = 0;
  const sorted: any[] = [];
  for (const e of events) {
    sorted.push({ ...e, deltaTime: e.deltaTime - tick });
    tick = e.deltaTime;
  }
  sorted.push({ deltaTime: 0, type: "endOfTrack" });
  return sorted;
}

function midiCanalUnique(
  notes: NoteGroove[],
  canal: number,
  config: ConfigGrooveBox,
  initEvents: any[],
): Uint8Array {
  const tpm = 480;
  const microsecParBeat = (60 / config.tempo) * 1_000_000;
  const notesCanal = notes.filter((n) => n.canal === canal);
  const debutMin = notesCanal.length > 0 ? Math.min(...notesCanal.map((n) => n.debut)) : 0;
  const secEnTicks = (sec: number) => Math.max(0, Math.round(((sec - debutMin) / 60) * config.tempo * tpm));

  const pisteTempo: any[] = [
    { deltaTime: 0, type: "setTempo", microsecondsPerBeat: microsecParBeat },
    { deltaTime: 0, type: "timeSignature", numerator: 4, denominator: 4, channel: 0 },
  ];
  const pisteCanal: any[] = [...initEvents];
  for (const n of notesCanal) {
    const td = secEnTicks(n.debut);
    const tf = Math.max(td + 1, secEnTicks(n.fin));
    pisteCanal.push({ deltaTime: td, type: "noteOn", channel: canal, noteNumber: n.note, velocity: n.velocite });
    pisteCanal.push({ deltaTime: tf, type: "noteOff", channel: canal, noteNumber: n.note, velocity: 0 });
  }

  const midi = {
    header: { format: 1 as const, numTracks: 2, ticksPerBeat: tpm },
    tracks: [trierPiste(pisteTempo), trierPiste(pisteCanal)],
  };
  return new Uint8Array(writeMidi(midi));
}

export function genererGrooveBox(config: ConfigGrooveBox): ResultatGrooveBox {
  const degres = degresGammeAccords(config.gamme);
  const decalage = traduireCle(config.cle);
  const progression = progressionDepuisConfig(config);

  const notes: NoteGroove[] = genererNotesAccordsEtBasse(progression, config, degres, decalage);

  // Génération mélodique par réservoir
  const pasParBeat = 2;
  const mesuresReservoir = Math.max(1, Math.ceil((config.nbAccords * config.dureeAccord) / 4));
  const configReservoir: ConfigReservoir = {
    taille: config.neurones,
    connectivite: config.connectivite,
    leaking: config.memoire,
    gain: 1.5,
    spectre: config.spectre,
    cle: config.cle,
    gamme: config.gamme,
    octave: config.octave,
    tempo: config.tempo,
    pasParBeat,
    mesures: mesuresReservoir,
    volume: 85,
    timbre: "Triangle",
    graine: config.graine,
    probaNote: config.densite,
    repetition: config.repetition,
    silence: config.silence,
  };
  const { notes: notesReservoir, graineUtilisee } = genererReservoirMusical(configReservoir);

  for (const nr of notesReservoir) {
    if (nr.silence) continue;
    notes.push(quantifierReservoirSurAccord(nr, progression, config, degres, decalage));
  }

  // Batterie
  notes.push(...genererNotesBatterie(config));

  // Construction du MIDI multi-pistes (combinaison + 4 pistes séparées)
  const tpm = 480;
  const microsecParBeat = (60 / config.tempo) * 1_000_000;
  const debutMin = notes.length > 0 ? Math.min(...notes.map((n) => n.debut)) : 0;
  const secEnTicks = (sec: number) => Math.max(0, Math.round(((sec - debutMin) / 60) * config.tempo * tpm));

  const pisteAccords: any[] = [
    { deltaTime: 0, type: "setTempo", microsecondsPerBeat: microsecParBeat },
    { deltaTime: 0, type: "timeSignature", numerator: 4, denominator: 4, channel: 0 },
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: 0 },
  ];
  const pisteBasse: any[] = [
    { deltaTime: 0, type: "programChange", channel: 1, programNumber: 33 },
  ];
  const pisteMelodie: any[] = [
    { deltaTime: 0, type: "programChange", channel: 2, programNumber: 80 },
  ];
  const pisteBatterie: any[] = [
    { deltaTime: 0, type: "controller", channel: 9, controllerType: 0, value: 1 },
    { deltaTime: 0, type: "controller", channel: 9, controllerType: 32, value: 0 },
    { deltaTime: 0, type: "programChange", channel: 9, programNumber: 0 },
  ];

  for (const n of notes) {
    const piste = n.canal === 0 ? pisteAccords : n.canal === 1 ? pisteBasse : n.canal === 2 ? pisteMelodie : pisteBatterie;
    const td = secEnTicks(n.debut);
    const tf = Math.max(td + 1, secEnTicks(n.fin));
    piste.push({ deltaTime: td, type: "noteOn", channel: n.canal, noteNumber: n.note, velocity: n.velocite });
    piste.push({ deltaTime: tf, type: "noteOff", channel: n.canal, noteNumber: n.note, velocity: 0 });
  }

  const midi = {
    header: { format: 1 as const, numTracks: 4, ticksPerBeat: tpm },
    tracks: [trierPiste(pisteAccords), trierPiste(pisteBasse), trierPiste(pisteMelodie), trierPiste(pisteBatterie)],
  };
  const midiBytes = new Uint8Array(writeMidi(midi));

  const midiAccords = midiCanalUnique(notes, 0, config, [
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: 0 },
  ]);
  const midiBasse = midiCanalUnique(notes, 1, config, [
    { deltaTime: 0, type: "programChange", channel: 1, programNumber: 33 },
  ]);
  const midiMelodie = midiCanalUnique(notes, 2, config, [
    { deltaTime: 0, type: "programChange", channel: 2, programNumber: 80 },
  ]);
  const midiBatterie = midiCanalUnique(notes, 9, config, [
    { deltaTime: 0, type: "controller", channel: 9, controllerType: 0, value: 1 },
    { deltaTime: 0, type: "controller", channel: 9, controllerType: 32, value: 0 },
    { deltaTime: 0, type: "programChange", channel: 9, programNumber: 0 },
  ]);

  const progressionTexte = progression.map((d) => ["I", "II", "III", "IV", "V", "VI", "VII"][d % 7]).join("–");
  const description = `Groove Box · ${config.cle} ${config.gamme} · ${progressionTexte} · ${config.tempo} BPM · ${config.neurones} neurones · ${config.styleRythme}`;

  return { midiBytes, midiAccords, midiBasse, midiMelodie, midiBatterie, notes, description, graineUtilisee };
}
