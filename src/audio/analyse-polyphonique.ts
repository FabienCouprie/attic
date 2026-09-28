// audio/analyse-polyphonique.ts — La transcription polyphonique.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import type { NoteEvenement } from "./midi-sequence";
import Meyda from "meyda";

// ── Basic Pitch (polyphonique) ────────────────────────────────────────────
// Caractéristiques du modèle, mesurées directement sur le fichier ONNX (et non
// supposées — l'implémentation précédente se trompait sur les trois points) :
//   • entrée  : [1, 43844, 1] — fenêtre FIXE de 43844 échantillons à 22050 Hz
//                (~1,988 s). L'ancien code passait la piste ENTIÈRE en
//                [1, 1, n] : mauvaise forme ET mauvaise longueur.
//   • sorties : TROIS tenseurs distincts, pas un seul entrelacé.
//       - "…Call:2" [1,172,88]  → onset   (2 trames actives sur une note tenue)
//       - "…Call:1" [1,172,88]  → note    (128 trames actives, l'activation)
//       - "…Call:0" [1,172,264] → contour (non utilisé ici)
//     L'ancien code lisait outputNames[0] en l'indexant `(t*K+k)*3+2`, soit
//     jusqu'à ~3×  la longueur réelle du tenseur : lectures hors limites
//     (undefined) au-delà du premier tiers, et indices mélangeant les pas de
//     temps et de note en deçà — d'où notes manquantes ET notes parasites.
const BP_FENETRE = 43844;          // échantillons par appel au modèle
const BP_TRAMES = 172;             // trames produites par fenêtre
const BP_SR = 22050;
const BP_HOP = BP_FENETRE / BP_TRAMES;   // ≈ 255 échantillons par trame
// Recouvrement entre fenêtres (comme l'implémentation de référence) : on rogne
// la moitié de chaque côté pour éliminer les artefacts de bord du modèle.
const BP_TRAMES_RECOUV = 30;
const BP_RECOUV = BP_TRAMES_RECOUV * BP_HOP;

const URL_BASIC_PITCH = "https://huggingface.co/daserge/basic-pitch-onnx/resolve/main/nmp.onnx";

let sessionBasicPitch: unknown = null;

// Rééchantillonne en mono vers 22050 Hz (interpolation linéaire).
function monoVers22k(buffer: AudioBuffer): Float32Array {
  const sr = buffer.sampleRate;
  const nCh = buffer.numberOfChannels;
  const length = buffer.length;
  const nbEch = Math.max(1, Math.ceil((length / sr) * BP_SR));
  const canaux: Float32Array[] = [];
  for (let c = 0; c < nCh; c++) canaux.push(buffer.getChannelData(c));
  const mono = new Float32Array(nbEch);
  for (let i = 0; i < nbEch; i++) {
    const posSrc = (i / BP_SR) * sr;
    const idx = Math.floor(posSrc);
    const frac = posSrc - idx;
    if (idx + 1 >= length) break;
    let s = 0;
    for (let c = 0; c < nCh; c++) s += (canaux[c][idx] * (1 - frac) + canaux[c][idx + 1] * frac) / nCh;
    mono[i] = s;
  }
  return mono;
}

export async function transcrirePolyphonique(
  buffer: AudioBuffer,
  seuilOnset: number,
  noteMin: number,
  noteMax: number,
  surProgres?: (pct: number) => void,
): Promise<NoteEvenement[]> {
  const ort = await import("onnxruntime-web");
  if (!sessionBasicPitch) {
    const rep = await fetch(URL_BASIC_PITCH);
    if (!rep.ok) throw new Error(`HTTP ${rep.status} — modèle Basic Pitch introuvable`);
    const donnees = await rep.arrayBuffer();
    sessionBasicPitch = await ort.InferenceSession.create(new Uint8Array(donnees), { executionProviders: ["wasm"] });
  }
  const session = sessionBasicPitch as import("onnxruntime-web").InferenceSession;

  const mono = monoVers22k(buffer);
  // Les trois sorties sont identifiées par leur FORME, pas par leur position :
  // les noms « StatefulPartitionedCall:N » sont un détail d'export TensorFlow.
  const nomsSorties = session.outputNames;
  const nomEntree = session.inputNames[0];

  const pas = BP_FENETRE - BP_RECOUV;
  const nbFenetres = Math.max(1, Math.ceil(mono.length / pas));
  const marge = BP_TRAMES_RECOUV / 2;

  // Activations concaténées sur toute la piste, note par note (88 demi-tons).
  const K = 88;
  const onsetGlobal: number[][] = Array.from({ length: K }, () => []);
  const noteGlobal: number[][] = Array.from({ length: K }, () => []);

  for (let w = 0; w < nbFenetres; w++) {
    const debut = w * pas;
    const bloc = new Float32Array(BP_FENETRE);
    for (let i = 0; i < BP_FENETRE && debut + i < mono.length; i++) bloc[i] = mono[debut + i];
    const sorties = await session.run({ [nomEntree]: new ort.Tensor("float32", bloc, [1, BP_FENETRE, 1]) });

    let tOnset: import("onnxruntime-web").Tensor | null = null;
    let tNote: import("onnxruntime-web").Tensor | null = null;
    const candidats88: import("onnxruntime-web").Tensor[] = [];
    for (const nom of nomsSorties) {
      const t = sorties[nom];
      if (t.dims[2] === K) candidats88.push(t);   // note ET onset ; contour a 264 bins
    }
    if (candidats88.length < 2) throw new Error("Sorties Basic Pitch inattendues");
    // Départage note/onset par la statistique qui les distingue sans ambiguïté :
    // l'onset est creux (pics isolés sur les attaques), l'activation de note est
    // dense (elle dure toute la note). Mesuré : 2 trames actives contre 128.
    const densite = candidats88.map((t) => {
      const d = t.data as Float32Array;
      let n = 0;
      for (let i = 0; i < d.length; i++) if (d[i] > 0.3) n++;
      return n;
    });
    const iOnset = densite[0] <= densite[1] ? 0 : 1;
    tOnset = candidats88[iOnset];
    tNote = candidats88[1 - iOnset];

    const dOnset = tOnset.data as Float32Array;
    const dNote = tNote.data as Float32Array;
    const T = tOnset.dims[1] as number;
    // Rogner les bords recouverts (sauf aux extrémités de la piste).
    const tDeb = w === 0 ? 0 : marge;
    const tFin = w === nbFenetres - 1 ? T : T - marge;
    for (let t = tDeb; t < tFin; t++) {
      for (let k = 0; k < K; k++) {
        onsetGlobal[k].push(dOnset[t * K + k]);
        noteGlobal[k].push(dNote[t * K + k]);
      }
    }
    surProgres?.(Math.round(((w + 1) / nbFenetres) * 100));
  }

  // Décalage temporel dû au rognage de la première fenêtre.
  const secParTrame = BP_HOP / BP_SR;
  const seuil = Math.max(0.05, seuilOnset / 100);
  const seuilTenue = seuil * 0.5;   // l'activation retombe sous le seuil d'attaque
  const notes: NoteEvenement[] = [];

  for (let k = 0; k < K; k++) {
    const noteMidi = k + 21;
    if (noteMidi < noteMin || noteMidi > noteMax) continue;
    const on = onsetGlobal[k];
    const act = noteGlobal[k];
    const T = on.length;
    for (let t = 1; t < T - 1; t++) {
      // Attaque = maximum local franchissant le seuil (évite de redéclencher
      // une note à chaque trame pendant la montée).
      if (!(on[t] > seuil && on[t] >= on[t - 1] && on[t] >= on[t + 1])) continue;
      let fin = t + 1;
      let velMax = act[t];
      while (fin < T && act[fin] > seuilTenue) {
        velMax = Math.max(velMax, act[fin]);
        // Une nouvelle attaque franche termine la note en cours.
        if (fin > t + 1 && on[fin] > seuil && on[fin] >= on[fin - 1]) break;
        fin++;
      }
      const debutSec = t * secParTrame;
      const finSec = fin * secParTrame;
      if (finSec - debutSec < 0.05) continue;   // rejette le fourmillement
      notes.push({
        note: noteMidi,
        velocite: Math.max(1, Math.min(127, Math.round(velMax * 127))),
        debut: debutSec,
        fin: finSec,
      });
      t = fin - 1;
    }
  }

  notes.sort((a, b) => a.debut - b.debut || a.note - b.note);
  return notes;
}


