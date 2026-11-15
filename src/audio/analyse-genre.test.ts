// audio/analyse-genre.test.ts — En mode heuristique, le classificateur de genre n'essaie pas le modèle.
//
// LE DÉFAUT RELEVÉ PAR LA PASSE DE CROISEMENT (lot 3e, 2026-11-15) : en « Heuristique », le nœud ne
// chargeait pas le modèle, mais `classerGenre` l'essayait quand même, levait « modèle absent », et
// écrivait dans la sortie « Genres » que le modèle avait échoué, même quand il était là. Les deux
// modes rendaient donc le même texte faute de modèle.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { classerGenre } from "./analyse-genre";
import { traduire } from "../i18n";

function la(secondes: number): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 1, length: secondes * 22050, sampleRate: 22050 });
  b.getChannelData(0).set(Float32Array.from({ length: b.length }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / 22050)));
  return b;
}

describe("le classificateur de genre", () => {
  const echec = traduire("msg.genres_onnx_echou");

  it("EN HEURISTIQUE, N'ESSAIE PAS LE MODÈLE, et sa sortie ne dit pas qu'il a échoué", async () => {
    const [premier] = await classerGenre(la(2), 30, undefined, false);
    expect(premier.description).toBeDefined();
    expect(premier.description).not.toContain(echec);
  });

  it("en IA sans modèle, retombe sur l'heuristique et dit pourquoi", async () => {
    const [premier] = await classerGenre(la(2), 30, undefined);
    expect(premier.description).toContain(echec);
  });
});
