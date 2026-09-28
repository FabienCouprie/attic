// audio/midi-ecriture.ts — Ecrire un fichier MIDI, et lui poser ses instruments.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { parseMidi, writeMidi } from "midi-file";
import { comparerEvenementsMidi } from "./midi-ordre";
import type { NoteEvenement } from "./midi-sequence";

export function notesVersFichierMidi(
  notes: NoteEvenement[],
  tempoBpm: number,
  canal = 0,
  banque?: number,
  programme?: number,
): File {
  const tpm = 480;
  const debutMin = notes.length > 0 ? Math.min(...notes.map((n) => n.debut)) : 0;
  const microsecParBeat = (60 / tempoBpm) * 1_000_000;

  function secEnTicks(sec: number): number { return Math.round(((sec - debutMin) / 60) * tempoBpm * tpm); }

  const lignes: { tick: number; type: string; [key: string]: any }[] = [
    { tick: 0, type: "setTempo", microsecondsPerBeat: microsecParBeat },
    { tick: 0, type: "timeSignature", numerator: 4, denominator: 4, channel: canal },
  ];

  if (banque !== undefined && programme !== undefined) {
    lignes.push({ tick: 0, type: "controller", channel: canal, controllerType: 0, value: Math.floor(banque / 128) });
    lignes.push({ tick: 0, type: "controller", channel: canal, controllerType: 32, value: banque % 128 });
    lignes.push({ tick: 0, type: "programChange", channel: canal, programNumber: programme });
  }

  for (const n of notes) {
    const tickDebut = secEnTicks(n.debut);
    const tickFin = secEnTicks(n.fin);
    if (tickDebut < 0) continue;
    // LE NUMÉRO DE NOTE EST UN OCTET, ET IL S'ARRONDIT ICI. Une hauteur peut ne pas tomber sur un
    // demi-ton, la conversion en fréquence étant continue ; le format MIDI, lui, ne sait pas porter
    // de cents. L'écriture tronquait : 69,5 partait en 69, soit jusqu'à quatre-vingt-dix-neuf cents
    // trop bas au lieu de cinquante au pire. Arrondir ne rend pas le microton, cela cesse
    // seulement de le fausser dans un seul sens.
    const numero = Math.round(n.note);
    lignes.push({ tick: tickDebut, type: "noteOn", channel: canal, noteNumber: numero, velocity: Math.max(1, n.velocite) });
    lignes.push({ tick: Math.max(tickDebut + 1, tickFin), type: "noteOff", channel: canal, noteNumber: numero, velocity: 0 });
  }

  lignes.sort(comparerEvenementsMidi);

  let tickCourant = 0;
  const events: { deltaTime: number; type: string; [key: string]: any }[] = [];
  for (const l of lignes) {
    const { tick, ...rest } = l;
    events.push({ deltaTime: tick - tickCourant, ...rest });
    tickCourant = tick;
  }
  events.push({ deltaTime: 0, type: "endOfTrack" });

  const midi = { header: { format: 1 as const, numTracks: 1, ticksPerBeat: tpm }, tracks: [events] };
  const bytes = new Uint8Array(writeMidi(midi as any));
  return new File([bytes], "transcription.mid", { type: "audio/midi" });
}


/** Insère un changement de banque/programme en tête du premier canal du fichier MIDI.
 * La valeur `instrument` est encodée comme `banque * 128 + programme`. */
export async function appliquerInstrumentMidi(
  fichier: File,
  instrument: number,
): Promise<File> {
  if (instrument <= 0) return fichier;
  const valeur = instrument;
  const programme = Math.max(0, Math.min(127, Math.round(valeur % 128)));
  const banque = Math.max(0, Math.floor(valeur / 128));
  const bytes = new Uint8Array(await fichier.arrayBuffer());
  const midi = parseMidi(bytes);
  const canal = 0;
  const evts: any[] = [];
  if (banque > 0) {
    evts.push({ deltaTime: 0, type: "controller", channel: canal, controllerType: 0, value: Math.floor(banque / 128) });
    evts.push({ deltaTime: 0, type: "controller", channel: canal, controllerType: 32, value: banque % 128 });
  }
  evts.push({ deltaTime: 0, type: "programChange", channel: canal, programNumber: programme });
  if (midi.tracks.length === 0) {
    midi.tracks = [evts];
  } else {
    midi.tracks[0] = [...evts, ...midi.tracks[0]];
  }
  const out = new Uint8Array(writeMidi(midi as any));
  return new File([out], fichier.name, { type: fichier.type });
}

/**
 * Impose un instrument à certains canaux d'un MIDI, en octets.
 *
 * Sert aux nœuds qui rendent plusieurs parties EN UN SEUL PASSAGE : plutôt que
 * de passer un instrument global au moteur de rendu — qui l'appliquerait alors à
 * tous les canaux, aplatissant l'arrangement — on écrit dans le MIDI l'instrument
 * de chaque partie, et le rendu n'a plus qu'à suivre le fichier. Un seul rendu,
 * donc un seul tampon audio, pour autant d'instruments qu'il y a de canaux.
 *
 * @param parCanal instrument par canal, encodé `banque * 128 + programme` comme
 *        partout ailleurs. Une valeur négative signifie « laisser le canal tel
 *        quel », c'est-à-dire garder l'instrument que le générateur y a écrit.
 *
 * Les événements sont insérés au tick 0 EN TÊTE de la première piste, donc avant
 * tout changement de programme que le fichier contiendrait déjà — ceux-ci
 * l'emporteraient sinon, et le réglage resterait sans effet. Les anciens
 * changements du canal visé sont donc retirés.
 */
/**
 * Réunit plusieurs fichiers MIDI en un seul, une piste par fichier.
 *
 * Un nœud qui produit une sortie MIDI par partie — le Multi-réservoir, la Groove Box —
 * doit aussi pouvoir les jouer ensemble, avec l'instrument de chacune. Les pistes sont
 * reprises telles quelles : chaque partie garde son canal et son changement de programme.
 *
 * La résolution (ticks par noire) du PREMIER fichier fait foi : elle est la même pour
 * tous ceux que ce projet écrit. Un fichier de résolution différente serait rejoué à la
 * mauvaise vitesse, donc il est refusé plutôt que mal joué.
 */
export function fusionnerMidis(fichiers: Uint8Array[]): Uint8Array {
  const lus = fichiers.map((octets) => parseMidi(octets));
  if (lus.length === 0) throw new Error("Aucun MIDI à fusionner.");
  const tpm = lus[0].header.ticksPerBeat;
  for (const m of lus) {
    if (m.header.ticksPerBeat !== tpm) {
      throw new Error(`Résolutions MIDI différentes : ${m.header.ticksPerBeat} et ${tpm} ticks par noire.`);
    }
  }
  const pistes = lus.flatMap((m) => m.tracks);
  return new Uint8Array(writeMidi({
    header: { format: 1 as const, numTracks: pistes.length, ticksPerBeat: tpm },
    tracks: pistes,
  } as never));
}

export function appliquerInstrumentsParCanal(
  bytes: Uint8Array,
  parCanal: Map<number, number>,
): Uint8Array {
  const remplaces = [...parCanal.entries()].filter(([, v]) => v >= 0);
  if (remplaces.length === 0) return bytes;

  const midi = parseMidi(bytes);
  const canauxVises = new Set(remplaces.map(([c]) => c));

  // Retirer les programChange/bank existants des canaux visés : leur laisser la
  // priorité annulerait le réglage. Le deltaTime retiré est reporté sur
  // l'événement suivant pour ne pas décaler la suite de la piste.
  for (const piste of midi.tracks) {
    let reporte = 0;
    for (let i = 0; i < piste.length; i++) {
      const evt: any = piste[i];
      const estProgramme = evt.type === "programChange"
        || (evt.type === "controller" && (evt.controllerType === 0 || evt.controllerType === 32));
      if (estProgramme && canauxVises.has(evt.channel)) {
        reporte += evt.deltaTime ?? 0;
        piste.splice(i, 1);
        i--;
        continue;
      }
      if (reporte > 0) {
        evt.deltaTime = (evt.deltaTime ?? 0) + reporte;
        reporte = 0;
      }
    }
  }

  const entete: any[] = [];
  for (const [canal, valeur] of remplaces) {
    const programme = Math.max(0, Math.min(127, Math.round(valeur % 128)));
    const banque = Math.max(0, Math.floor(valeur / 128));
    if (banque > 0) {
      entete.push({ deltaTime: 0, type: "controller", channel: canal, controllerType: 0, value: Math.floor(banque / 128) });
      entete.push({ deltaTime: 0, type: "controller", channel: canal, controllerType: 32, value: banque % 128 });
    }
    entete.push({ deltaTime: 0, type: "programChange", channel: canal, programNumber: programme });
  }

  if (midi.tracks.length === 0) midi.tracks = [entete];
  else midi.tracks[0] = [...entete, ...midi.tracks[0]];

  return new Uint8Array(writeMidi(midi as any));
}

export function bpmInitial(midi: any): number {
  for (const piste of midi.tracks) {
    for (const evt of piste) {
      if (evt.type === "setTempo") return 60_000_000 / evt.microsecondsPerBeat;
    }
  }
  return 120;
}

export function evenementsAbsolus(
  midi: any,
  tpmSortie: number,
  supprimerTempoDebut: boolean,
): { tick: number; evt: any }[] {
  const ratio = tpmSortie / (midi.header.ticksPerBeat || 480);
  const result: { tick: number; evt: any }[] = [];
  for (const piste of midi.tracks) {
    let tick = 0;
    for (const evt of piste) {
      tick += evt.deltaTime;
      if (evt.type === "endOfTrack") continue;
      if (supprimerTempoDebut && tick === 0 && (evt.type === "setTempo" || evt.type === "timeSignature")) continue;
      result.push({ tick: Math.round(tick * ratio), evt: { ...evt } });
    }
  }
  return result;
}

/** Concatène deux fichiers MIDI. La seconde piste commence à la fin de la première,
 * moins le chevauchement (en secondes). Le chevauchement nul donne une simple
 * concaténation. Les événements sont conservés et les canaux restent inchangés. */
