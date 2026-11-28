// audio/soundhelix-batterie-midi.ts — Ce que les nœuds de batterie du chantier SoundHelix lisent et
// écrivent en MIDI : les notes d'un fichier de batterie ramenées à la grille de l'harmonie, et un
// fichier quelconque passé au groove.
//
// LES VÉLOCITÉS ALLER ET RETOUR. Le chantier compte en millièmes, le fichier sur 127 ; une note lue
// reçoit le millième qui la rend à sa vélocité MIDI, si bien qu'un fichier relu puis récrit garde
// chacune de ses notes à l'identique.

import { parseMidi, writeMidi, type MidiEvent } from "midi-file";
import { comparerEvenementsMidi } from "./midi-ordre";
import { velociteMidi } from "./soundhelix-midi";
import { placerAuGroove, type NoteBatterie } from "./soundhelix-batterie";

/**
 * Le plus petit millième qu'une vélocité MIDI de 1 à 127 rend à l'identique. L'arrondi au plus proche
 * tombait hors de la case dans un cas sur dix : 9 devenait 8, et un roulement relu puis récrit par le
 * motif conditionnel suivant perdait un cran à chaque passage.
 */
export const millieme = (velocite: number): number => Math.ceil(((velocite - 1) * 999) / 126) + 1;

/** Les notes d'un fichier, toutes pistes et tous canaux, ramenées à la grille de `ticsParTemps` par temps. */
export function notesDuFichierBatterie(octets: Uint8Array, ticsParTemps: number): NoteBatterie[] {
  const midi = parseMidi(octets);
  const echelle = ticsParTemps / (midi.header.ticksPerBeat ?? 480);
  const out: NoteBatterie[] = [];
  for (const piste of midi.tracks) {
    let tick = 0;
    const ouvertes = new Map<string, { tick: number; velocite: number }[]>();
    for (const e of piste) {
      tick += e.deltaTime;
      if (e.type !== "noteOn" && e.type !== "noteOff") continue;
      const cle = `${e.channel}:${e.noteNumber}`;
      if (e.type === "noteOn" && e.velocity > 0) {
        ouvertes.set(cle, [...(ouvertes.get(cle) ?? []), { tick, velocite: e.velocity }]);
        continue;
      }
      const depart = ouvertes.get(cle)?.shift();
      if (!depart) continue;
      const tic = Math.round(depart.tick * echelle);
      out.push({ tic, tics: Math.max(1, Math.round(tick * echelle) - tic), hauteur: e.noteNumber, velocite: millieme(depart.velocite) });
    }
  }
  return out.sort((a, b) => a.tic - b.tic || a.hauteur - b.hauteur);
}

/** Vérifie qu'un groove se lit : des nombres positifs, séparés par des virgules. */
export function lireGroove(texte: string): number[] | null {
  const g = texte.split(",").map((s) => s.trim()).filter((s) => s !== "").map(Number);
  return g.length > 0 && g.every((x) => Number.isFinite(x) && x > 0) ? g : null;
}

/** La résolution la plus basse que le groove écrit, en tics par noire. */
export const RESOLUTION_DU_GROOVE = 480;

/**
 * Le fichier passé au groove : chaque événement déplacé à son tic de groove, rien d'autre ne change.
 *
 * LA RÉSOLUTION MONTE D'ABORD, relevé dans l'application : un fichier du chantier a la grille de son
 * harmonie, quatre tics par noire, où le dixième d'un pas s'arrondit à zéro, et le groove n'y déplaçait
 * aucune note. Le fichier passe donc à 480 tics par noire au moins, en multipliant ses tics.
 */
export function grooverMidi(octets: Uint8Array, groove: readonly number[], ticsParTemps: number): { octets: Uint8Array<ArrayBuffer>; deplaces: number } {
  const midi = parseMidi(octets);
  const ppq = midi.header.ticksPerBeat ?? 480;
  const facteur = Math.max(1, Math.ceil(RESOLUTION_DU_GROOVE / ppq));
  const pas = (ppq * facteur) / ticsParTemps;
  let deplaces = 0;
  const pistes = midi.tracks.map((piste) => {
    let tick = 0;
    const poses = piste.map((evt, i) => {
      tick += evt.deltaTime * facteur;
      const t = placerAuGroove(tick, pas, groove);
      if (t !== tick && evt.type === "noteOn" && evt.velocity > 0) deplaces++;
      return { tick: t, evt, i };
    });
    // LA FIN DE PISTE RESTE LA DERNIÈRE : triée avec les autres, à tic égal, l'ordre des événements la
    // faisait passer devant un arrêt de note, et la piste finissait avant sa dernière note.
    const fin = poses.find((p) => p.evt.type === "endOfTrack");
    const corps = poses.filter((p) => p.evt.type !== "endOfTrack");
    corps.sort((a, b) => comparerEvenementsMidi(
      { tick: a.tick, type: a.evt.type, velocity: "velocity" in a.evt ? a.evt.velocity : undefined },
      { tick: b.tick, type: b.evt.type, velocity: "velocity" in b.evt ? b.evt.velocity : undefined }) || a.i - b.i);
    let avant = 0;
    const sortie = corps.map(({ tick: t, evt }): MidiEvent => { const d = t - avant; avant = t; return { ...evt, deltaTime: d }; });
    sortie.push({ deltaTime: Math.max(0, (fin?.tick ?? avant) - avant), meta: true, type: "endOfTrack" });
    return sortie;
  });
  const header = { ...midi.header, ticksPerBeat: ppq * facteur };
  return { octets: new Uint8Array(writeMidi({ header, tracks: pistes })), deplaces };
}

/** Les notes de batterie en fichier, sur le canal 10, à la grille et au tempo donnés. */
export function batterieEnMidi(notes: readonly NoteBatterie[], m: { ticsParTemps: number; tics: number; tempo: number; tempsParMesure: number }): Uint8Array<ArrayBuffer> {
  const poses: { tick: number; evt: MidiEvent }[] = [
    { tick: 0, evt: { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: Math.round(60_000_000 / m.tempo) } },
    { tick: 0, evt: { deltaTime: 0, meta: true, type: "timeSignature", numerator: m.tempsParMesure, denominator: 4, metronome: 24, thirtyseconds: 8 } },
  ];
  for (const n of notes) {
    const velocity = velociteMidi(n.velocite);
    if (velocity <= 0 || n.tics <= 0 || n.hauteur < 0 || n.hauteur > 127) continue;
    poses.push({ tick: n.tic, evt: { deltaTime: 0, type: "noteOn", channel: 9, noteNumber: n.hauteur, velocity } });
    poses.push({ tick: n.tic + n.tics, evt: { deltaTime: 0, type: "noteOff", channel: 9, noteNumber: n.hauteur, velocity: 0 } });
  }
  poses.sort((a, b) => comparerEvenementsMidi(
    { tick: a.tick, type: a.evt.type, velocity: "velocity" in a.evt ? a.evt.velocity : undefined },
    { tick: b.tick, type: b.evt.type, velocity: "velocity" in b.evt ? b.evt.velocity : undefined }));
  let avant = 0;
  const piste: MidiEvent[] = poses.map(({ tick, evt }) => { const d = tick - avant; avant = tick; return { ...evt, deltaTime: d }; });
  piste.push({ deltaTime: Math.max(0, m.tics - avant), meta: true, type: "endOfTrack" });
  return new Uint8Array(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: m.ticsParTemps }, tracks: [piste] }));
}
