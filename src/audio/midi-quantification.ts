// audio/midi-quantification.ts — Transposer et quantifier.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { parseMidi, writeMidi } from "midi-file";
import { comparerEvenementsMidi } from "./midi-ordre";
import { rendreAvecSF2 } from "./midi-soundfont";

// ─── Transposition + quantification MIDI ───

// Grilles de quantification en divisions par beat.
const GRILLES: Record<string, number> = {
  "Aucune": 0,
  "None": 0,
  "none": 0,
  "1/4": 1,
  "1/8": 2,
  "1/16": 4,
  "1/32": 8,
  "1/8 triplet": 3,
  "1/8t": 3,
  "1/16 triplet": 6,
  "1/16t": 6,
};

export async function transposerQuantifierMidi(
  fichier: File,
  demiTons: number,
  grilleNom: string,
  quantifierFin: boolean,
): Promise<File> {
  const bytes = new Uint8Array(await fichier.arrayBuffer());
  const midi = parseMidi(bytes);
  const tpm = midi.header.ticksPerBeat ?? 480;
  const divisions = GRILLES[grilleNom] ?? 0;
  const pasGrille = divisions > 0 ? Math.round(tpm / divisions) : 0;

  for (const piste of midi.tracks) {
    for (const evt of piste) {
      if (evt.type === "noteOn" || evt.type === "noteOff") {
        evt.noteNumber = Math.max(0, Math.min(127, evt.noteNumber + demiTons));
      }
    }
  }

  if (pasGrille > 0) {
    for (const piste of midi.tracks) {
      let tickAbsolu = 0;
      const eventsAbsolus: { tick: number; evt: any }[] = [];
      for (const evt of piste) {
        tickAbsolu += evt.deltaTime;
        eventsAbsolus.push({ tick: tickAbsolu, evt });
      }

      // Piste des noteOn actifs pour s'assurer fin >= debut + 1
      const noteOnTick = new Map<string, number>();

      for (const ea of eventsAbsolus) {
        if (ea.evt.type === "noteOn" && ea.evt.velocity > 0) {
          ea.tick = Math.round(ea.tick / pasGrille) * pasGrille;
          noteOnTick.set(`${ea.evt.channel}-${ea.evt.noteNumber}`, ea.tick);
        } else if (ea.evt.type === "noteOff" || (ea.evt.type === "noteOn" && ea.evt.velocity === 0)) {
          if (quantifierFin) {
            ea.tick = Math.round(ea.tick / pasGrille) * pasGrille;
          }
          const cle = `${ea.evt.channel}-${ea.evt.noteNumber}`;
          const debut = noteOnTick.get(cle);
          if (debut !== undefined && ea.tick <= debut) {
            ea.tick = debut + pasGrille;
          }
        }
      }

      // Un note-on de vélocité nulle vaut un note-off : il doit être rangé comme tel.
      const typeReel = (evt: any) =>
        evt.type === "noteOn" && evt.velocity === 0 ? "noteOff" : evt.type;
      // `endOfTrack` reste le dernier événement quoi qu'il arrive : son rang le ferait passer avant
      // un note-off de même tick, et la piste finirait avant sa dernière note.
      const fin = eventsAbsolus.filter((ea) => ea.evt.type === "endOfTrack");
      const corps = eventsAbsolus.filter((ea) => ea.evt.type !== "endOfTrack");
      corps.sort((a, b) =>
        comparerEvenementsMidi({ tick: a.tick, type: typeReel(a.evt) }, { tick: b.tick, type: typeReel(b.evt) }),
      );
      const ordonnes = [...corps, ...fin];
      let prevTick = 0;
      for (const ea of ordonnes) {
        ea.evt.deltaTime = Math.max(0, ea.tick - prevTick);
        prevTick = ea.tick;
      }
      // LE TRI DOIT ÊTRE APPLIQUÉ À LA PISTE, pas au seul tableau d'enveloppes : `writeMidi`
      // sérialise `midi.tracks`, qui gardait l'ordre d'origine. Les deltas étaient donc calculés
      // pour un ordre et écrits dans un autre. Comme `endOfTrack` précède un note-off de même tick,
      // et qu'il partage ce tick avec le dernier note-off, celui-ci recevait le delta zéro : il se
      // posait sur son propre note-on, la note sortait à durée nulle, et `rendreAvecSF2` écarte tout
      // ce qui dure moins d'une milliseconde. La dernière note de tout fichier quantifié
      // disparaissait, sans message ni trace.
      piste.length = 0;
      for (const ea of ordonnes) piste.push(ea.evt);
    }
  }

  const nomBase = fichier.name.replace(/\.mid$/i, "");
  const nouvBytes = new Uint8Array(writeMidi(midi as any));
  return new File([nouvBytes], `${nomBase}_tq.mid`, { type: "audio/midi" });
}

