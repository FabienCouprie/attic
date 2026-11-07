// audio/analyse-polyphonique.ts — La transcription polyphonique.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.
//
// LE CALCUL VIT DANS `basic-pitch.ts` depuis le 2026-11-07, pour passer hors du fil : le composant
// l'appelle par le worker d'inférence ONNX. Ce fichier garde la transcription dans le fil, sur un
// tampon, pour qui en a besoin hors d'un composant.

import type { NoteEvenement } from "./midi-sequence";
import { traduire } from "../i18n";
import { transcrireBasicPitch } from "./basic-pitch";

// LE MODÈLE NE SE PREND PLUS CHEZ UN TIERS. Il était récupéré par un `fetch` vers HuggingFace à
// chaque première transcription, de sorte que le nœud ne marchait qu'en ligne, que son poids
// n'apparaissait dans aucun inventaire, et que l'adresse pouvait disparaître sans prévenir — ce
// qui est précisément arrivé au classeur de genre. Il est désormais au manifeste, publié sur la
// release `assets` comme les autres, et lu depuis le disque par l'appelant.
//
// LE GARDE QUI AURAIT DÛ L'ATTRAPER NE REGARDAIT PAS ICI : `plugins/provenance-modeles.test.ts`
// ne balayait que `src/plugins` et `src/workers`, et ce fichier est dans `src/audio`.
let sessionBasicPitch: unknown = null;

export async function transcrirePolyphonique(
  buffer: AudioBuffer,
  seuilOnset: number,
  noteMin: number,
  noteMax: number,
  surProgres?: (pct: number) => void,
  modeleBuffer?: ArrayBuffer | null,
): Promise<NoteEvenement[]> {
  const ort = await import("onnxruntime-web");
  if (!sessionBasicPitch) {
    // LE MODÈLE VIENT DU DISQUE, et l'appelant le lit : il ne se télécharge plus chez un tiers à
    // chaque première transcription. Voir l'en-tête du fichier pour ce que ce `fetch` coûtait.
    if (!modeleBuffer) throw new Error(traduire("msg.basic_pitch_modele_absent"));
    sessionBasicPitch = await ort.InferenceSession.create(new Uint8Array(modeleBuffer), { executionProviders: ["wasm"] });
  }
  const session = sessionBasicPitch as import("onnxruntime-web").InferenceSession;
  const canaux = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  return transcrireBasicPitch(ort, session, canaux, buffer.sampleRate, seuilOnset, noteMin, noteMax, surProgres);
}
