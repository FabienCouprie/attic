// plugins/magenta-tempo.test.ts — Une suite engendrée garde le tempo de ce qu'elle continue.
//
// POURQUOI CE TEST. Relevé par Fabien, en vérifiant ce que le paramètre « Pas à générer » de
// « Magenta Continuation » produit réellement. Le compte de pas était juste — `totalQuantizedSteps`
// valait exactement le réglage dans les vingt-six exécutions mesurées — mais **la suite revenait
// toujours à 120 noires par minute**, quelle que soit la pièce continuée. Mesuré sur une entrée à
// **90** : la séquence rendue portait `qpm: 120`, et le fichier écrit aussi. Enchaînée après la
// pièce, la continuation jouait donc plus vite qu'elle.
//
// LA CAUSE EST DANS LA BIBLIOTHÈQUE, et c'est ce qui la rendait invisible. `continueSequence`
// construit son résultat par `createQuantizedNoteSequence(stepsPerQuarter, qpm)` en ne passant que
// le premier argument : le second retombe sur `DEFAULT_QUARTERS_PER_MINUTE`, qui vaut 120. Rien
// dans le code d'Attic ne nommait 120 ; il fallait aller lire le défaut de Magenta.
//
// CE QUE CE TEST TIENT, ET POURQUOI IL NE PASSE PAS PAR UN NŒUD. Les modèles Magenta exigent un
// navigateur, du WebGL et le réseau. Ce test exerce donc le CHEMIN D'ÉCRITURE, qui est pur et sans
// modèle, et qui est exactement l'endroit où le tempo se perd ou se garde.
import { describe, expect, it } from "vitest";
import { parseMidi } from "midi-file";
import { noteSequenceToMidiFile, tempoDe } from "./magenta-helpers";

/** Une séquence quantifiée telle que Magenta en rend : quatre pas par noire, et son tempo à lui. */
function suiteEngendree(qpmDeMagenta = 120) {
  return {
    quantizationInfo: { stepsPerQuarter: 4 },
    tempos: [{ time: 0, qpm: qpmDeMagenta }],
    totalQuantizedSteps: 16,
    notes: [
      { pitch: 60, velocity: 100, quantizedStartStep: 0, quantizedEndStep: 4 },
      { pitch: 64, velocity: 100, quantizedStartStep: 4, quantizedEndStep: 8 },
    ],
  };
}

async function lire(f: File) {
  const midi = parseMidi(new Uint8Array(await f.arrayBuffer()));
  const tpb = (midi.header as { ticksPerBeat?: number }).ticksPerBeat ?? 480;
  let qpm: number | null = null;
  for (const piste of midi.tracks) {
    for (const e of piste as unknown as { type: string; microsecondsPerBeat?: number }[]) {
      if (e.type === "setTempo") { qpm = 60_000_000 / e.microsecondsPerBeat!; break; }
    }
    if (qpm !== null) break;
  }
  let tickMax = 0;
  for (const piste of midi.tracks) {
    let t = 0;
    for (const e of piste as unknown as { deltaTime: number }[]) { t += e.deltaTime; if (t > tickMax) tickMax = t; }
  }
  return { qpm, noires: tickMax / tpb, secondes: qpm ? (tickMax / tpb) * (60 / qpm) : null };
}

describe("une suite engendrée garde le tempo de ce qu'elle continue", () => {
  it("LE TEMPO DEMANDÉ L'EMPORTE SUR CELUI QUE MAGENTA A POSÉ, et c'est tout le correctif", async () => {
    const f = await noteSequenceToMidiFile(suiteEngendree(120), "t.mid", 90);
    const lu = await lire(f);
    // AU MILLIÈME, ET LA TOLÉRANCE A UNE RAISON : un fichier MIDI ne range pas un tempo mais une
    // durée de noire en MICROSECONDES ENTIÈRES. 90 noires par minute font 666 666,67 µs, arrondies
    // à 666 667, d'où 89,999955 au retour. L'écart est de cinq cent-millièmes de noire par minute.
    expect(lu.qpm!, "le fichier devrait porter le tempo de l'entrée, non le défaut de Magenta")
      .toBeCloseTo(90, 3);
  });

  it("ET LA DURÉE SUIT, car un pas ne vaut pas le même temps selon le tempo", async () => {
    // Deux noires de musique : 2 × 60/90 = 1,3333 s à 90, contre 1 s à 120.
    const a90 = await lire(await noteSequenceToMidiFile(suiteEngendree(120), "t.mid", 90));
    const a120 = await lire(await noteSequenceToMidiFile(suiteEngendree(120), "t.mid", 120));
    expect(a90.noires, "le contenu musical ne change pas : deux noires").toBeCloseTo(2, 3);
    expect(a120.noires).toBeCloseTo(2, 3);
    expect(a90.secondes!).toBeCloseTo(2 * 60 / 90, 3);
    expect(a120.secondes!).toBeCloseTo(2 * 60 / 120, 3);
    // Et la différence s'entend : un tiers de seconde sur deux noires.
    expect(a90.secondes! - a120.secondes!).toBeCloseTo(1 / 3, 3);
  });

  it("SANS TEMPO DEMANDÉ, RIEN NE CHANGE : les nœuds qui portent le leur l'ont déjà posé", async () => {
    // `genererBatterie` et `improviser` ont un réglage « Tempo » et l'écrivent sur la séquence
    // avant d'appeler l'écriture. Leur chemin ne doit pas bouger.
    const lu = await lire(await noteSequenceToMidiFile(suiteEngendree(85), "t.mid"));
    expect(lu.qpm!, "sans argument, le tempo de la séquence est respecté").toBeCloseTo(85, 3);
  });

  it("LE DÉFAUT DE MAGENTA EST BIEN 120, et c'est ce qu'on observait avant le correctif", async () => {
    // Le témoin : la même séquence écrite sans rien demander, telle que `continueSequence` la rend.
    const lu = await lire(await noteSequenceToMidiFile(suiteEngendree(120), "t.mid"));
    expect(lu.qpm!).toBeCloseTo(120, 3);
  });

  it("le tempo d'une séquence lue se prend sur le PREMIER changement", () => {
    expect(tempoDe({ tempos: [{ time: 0, qpm: 90 }, { time: 4, qpm: 140 }] })).toBe(90);
  });

  it("une séquence sans tempo utilisable n'en impose aucun, et le défaut d'avant reprend", () => {
    // Important : rendre 0 ou NaN forcerait une division par zéro dans la conversion des pas.
    expect(tempoDe({ tempos: [] })).toBeUndefined();
    expect(tempoDe({})).toBeUndefined();
    expect(tempoDe(null)).toBeUndefined();
    expect(tempoDe({ tempos: [{ time: 0, qpm: 0 }] })).toBeUndefined();
  });
});
