// audio/esthetique.test.ts — Préparation et agrégation pour Audiobox Aesthetics.
//
// Les valeurs de référence viennent du code de Meta (audiobox_aesthetics 0.0.4, PyTorch
// 2.11, torchaudio 2.11), exécuté sur la collection de démonstration.
import { describe, expect, it } from "vitest";
import {
  reechantillonnerCommeTorchaudio, mixerMono, decouperEnTranches, preparerTranches, agregerTranches,
  scoresDepuisSortie, pointsFaibles, ecartsEsthetiques, formaterHorodatage,
  ECHANTILLONS_TRANCHE, type TrancheNotee, type ScoresEsthetiques,
} from "./esthetique";
import fixture from "./esthetique.torchaudio.json";

/** Même signal que celui passé à torchaudio pour produire la fixture : 440 Hz, 5 kHz, et 9 kHz au-dessus de la Nyquist cible. */
function signalTest(sr: number): Float32Array {
  const n = Math.floor(sr * 0.1);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr) + 0.3 * Math.sin((2 * Math.PI * 5000 * i) / sr + 0.3)
      + 0.2 * Math.sin((2 * Math.PI * 9000 * i) / sr);
  }
  return x;
}

const decoder = (b64: string) => {
  const octets = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Float32Array(octets.buffer);
};

describe("reechantillonnerCommeTorchaudio", () => {
  for (const [sr, { n, attendu }] of Object.entries(fixture as Record<string, { n: number; attendu: string }>)) {
    it(`reproduit torchaudio.functional.resample de ${sr} Hz vers 16 kHz, bords compris`, () => {
      const entree = signalTest(Number(sr));
      expect(entree.length).toBe(n);
      const ref = decoder(attendu);
      const sortie = reechantillonnerCommeTorchaudio(entree, Number(sr), 16000);
      expect(sortie.length).toBe(ref.length);
      let max = 0;
      for (let i = 0; i < ref.length; i++) max = Math.max(max, Math.abs(sortie[i] - ref[i]));
      expect(max).toBeLessThan(1e-6);
    });
  }

  it("rend le signal tel quel quand la fréquence est déjà 16 kHz", () => {
    const x = new Float32Array([0.1, 0.2, 0.3]);
    expect(reechantillonnerCommeTorchaudio(x, 16000, 16000)).toBe(x);
  });

  it("refuse une fréquence non entière, comme torchaudio", () => {
    expect(() => reechantillonnerCommeTorchaudio(new Float32Array(10), 44100.5, 16000)).toThrow(/invalides/);
  });
});

describe("mixage, découpage, préparation", () => {
  it("mixe en moyenne des canaux", () => {
    expect(Array.from(mixerMono([new Float32Array([1, 0.5]), new Float32Array([0, -0.5])]))).toEqual([0.5, 0]);
  });

  it("découpe en tranches de 10 s sans recouvrement et complète la dernière de zéros", () => {
    const mono = new Float32Array(16000 * 25).fill(0.25);
    const tr = decouperEnTranches(mono);
    expect(tr.map((t) => [t.debutSec, t.finSec, t.utiles])).toEqual([[0, 10, 160000], [10, 20, 160000], [20, 25, 80000]]);
    expect(tr[2].signal.length).toBe(ECHANTILLONS_TRANCHE);
    expect(tr[2].signal[79999]).toBe(0.25);
    expect(tr[2].signal[80000]).toBe(0);
  });

  it("ne crée pas de tranche vide sur une durée multiple de 10 s", () => {
    expect(decouperEnTranches(new Float32Array(16000 * 20)).length).toBe(2);
  });

  it("donne les mêmes longueurs que le chemin de référence (space_annoucement.wav, 44,1 kHz, 522 806 échantillons)", () => {
    const tr = preparerTranches([new Float32Array(522806), new Float32Array(522806)], 44100);
    expect(tr.length).toBe(2);
    expect(tr[1].utiles).toBe(189681 - 160000);
  });

  it("refuse un signal vide", () => {
    expect(() => preparerTranches([new Float32Array(0)], 48000)).toThrow(/vide/);
  });
});

describe("agrégation", () => {
  const tranche = (debutSec: number, finSec: number, CE: number, CU: number, PC: number, PQ: number): TrancheNotee =>
    ({ debutSec, finSec, scores: { CE, CU, PC, PQ } });

  it("retrouve le score officiel de Meta à partir de ses scores par tranche, pondérés par la part réelle de chaque tranche", () => {
    // space_annoucement.wav : deux tranches, la seconde de 29 681 échantillons à 16 kHz.
    const fin = 189681 / 16000;
    const a = agregerTranches([
      tranche(0, 10, 5.828025817871094, 7.6755242347717285, 3.094895601272583, 7.832847595214844),
      tranche(10, fin, 4.0821990966796875, 7.019104957580566, 1.6368211507797241, 7.6984477043151855),
    ]);
    const officiel: ScoresEsthetiques = { CE: 5.554841995239258, CU: 7.572809219360352, PC: 2.8667383193969727, PQ: 7.811817169189453 };
    for (const axe of ["CE", "CU", "PC", "PQ"] as const) expect(a.global[axe]).toBeCloseTo(officiel[axe], 5);
    expect(a.dureeSec).toBeCloseTo(11.855, 3);
  });

  it("repère la tranche la plus basse de chaque axe et son écart au global", () => {
    const a = agregerTranches([tranche(0, 10, 7, 7, 5, 8), tranche(10, 20, 3, 7.5, 6, 6), tranche(20, 30, 6, 6, 4, 8)]);
    const p = pointsFaibles(a);
    expect(p.find((x) => x.axe === "CE")).toMatchObject({ debutSec: 10, finSec: 20, score: 3 });
    expect(p.find((x) => x.axe === "PQ")!.ecart).toBeCloseTo(6 - 22 / 3, 10);
  });

  it("calcule l'écart B − A par axe", () => {
    const a = agregerTranches([tranche(0, 10, 5, 6, 3, 7)]);
    const b = agregerTranches([tranche(0, 10, 5.5, 6, 2, 7.25)]);
    expect(ecartsEsthetiques(a, b)).toEqual({ CE: 0.5, CU: 0, PC: -1, PQ: 0.25 });
  });

  it("lit la sortie du modèle dans l'ordre CE, CU, PC, PQ et refuse une autre forme", () => {
    expect(scoresDepuisSortie([1, 2, 3, 4])).toEqual({ CE: 1, CU: 2, PC: 3, PQ: 4 });
    expect(() => scoresDepuisSortie([1, 2, 3])).toThrow(/3 valeurs/);
  });

  it("formate les horodatages en minutes:secondes", () => {
    expect(formaterHorodatage(0)).toBe("0:00");
    expect(formaterHorodatage(189681 / 16000)).toBe("0:11");
    expect(formaterHorodatage(406.3)).toBe("6:46");
  });
});
