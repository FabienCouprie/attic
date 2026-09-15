// electron/esthetique.test.ts — Le vrai modèle, de bout en bout, contre le code PyTorch de Meta.
//
// Ignoré quand le modèle n'est pas présent (CI, checkout sans ressources) : il pèse 420 Mo
// et n'est pas dans git. En local, c'est le seul test qui vérifie ensemble notre
// rééchantillonneur, notre découpage et l'ONNX exporté.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { preparerTranches, agregerTranches, scoresDepuisSortie } from "../src/audio/esthetique";

const require = createRequire(import.meta.url);
const MODELE = join(__dirname, "..", "public", "oonx", "audiobox-aesthetics.onnx");

describe.skipIf(!existsSync(MODELE))("Audiobox Aesthetics (ONNX, onnxruntime-node)", () => {
  it("note un sinus de 440 Hz comme le code de Meta, tranche par tranche et au global", async () => {
    const { noterTranche } = require("./esthetique.cjs");
    // Signal identique à la référence Python : 25 s, 44,1 kHz, amplitude 0,5.
    const sr = 44100;
    const x = new Float32Array(sr * 25);
    for (let i = 0; i < x.length; i++) x[i] = Math.fround(Math.sin((2 * Math.PI * 440 * i) / sr)) * 0.5;
    const tranches = preparerTranches([x], sr);
    const notees = [];
    for (const t of tranches) {
      notees.push({ debutSec: t.debutSec, finSec: t.finSec, scores: scoresDepuisSortie(await noterTranche(MODELE, t.signal, t.utiles)) });
    }
    const reference = {
      CE: [2.9044806957244873, 2.9048221111297607, 2.613295316696167],
      CU: [6.862025260925293, 6.862740993499756, 5.725808620452881],
      PC: [1.6904001235961914, 1.690385103225708, 1.815871000289917],
      PQ: [7.2110981941223145, 7.211544513702393, 6.069310665130615],
    };
    for (const axe of ["CE", "CU", "PC", "PQ"] as const) {
      notees.forEach((n, i) => expect(n.scores[axe], `${axe} tranche ${i}`).toBeCloseTo(reference[axe][i], 3));
    }
    const global = agregerTranches(notees).global;
    expect(global.PQ).toBeCloseTo(6.982919216156006, 3);
    expect(global.CE).toBeCloseTo(2.8463802337646484, 3);
  }, 60000);

  it("refuse une tranche qui n'a pas 160 000 échantillons", async () => {
    const { noterTranche } = require("./esthetique.cjs");
    await expect(noterTranche(MODELE, new Float32Array(1000), 1000)).rejects.toThrow(/160000/);
  });
});
