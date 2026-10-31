// plugins/limiteur-crete-vraie.test.ts — Chacun des cinq réglages agit, et le composant est au catalogue.
//
// TROIS RÉGLAGES SONT INERTES QUAND RIEN NE DÉPASSE LE PLAFOND, et leur documentation le dit. L'épreuve
// part donc d'un son qui le dépasse à chaque coup : une basse et des frappes, poussées de 6 dB.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { fiches } from "./limiteur-crete-vraie";
import { fiches as fichesEffets } from "./effets";
import { creteVraieDb } from "../audio/crete-vraie";
import { ctxDEssai } from "../core/contexte-essai";

const fiche = fiches.find((f) => f.id === "limiteur-crete-vraie")!;
const SR = 48000;

/** Une basse à 55 Hz et une frappe toutes les 250 ms, sur deux canaux un peu différents. */
function son(): AudioBuffer {
  const n = SR, b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: SR });
  for (let c = 0; c < 2; c++) {
    b.getChannelData(c).set(Float32Array.from({ length: n }, (_, i) => {
      const frappe = Math.exp(-((i % 12000) / SR) * 60) * Math.sin(2 * Math.PI * 180 * i / SR);
      return 0.35 * Math.sin(2 * Math.PI * 55 * i / SR + c) + 0.45 * frappe;
    }));
  }
  return b;
}

function contexte(params: Record<string, number>, entree: unknown = son()) {
  return ctxDEssai([entree], params);
}

const DEPART: Record<string, number> = { Gain: 6, Plafond: -1, Anticipation: 2, Maintien: 20, "Relâchement": 100 };
const VARIANTE: Record<string, number> = { Gain: 9, Plafond: -3, Anticipation: 8, Maintien: 0, "Relâchement": 600 };

async function rendre(params: Record<string, number>) {
  const r = await fiche.executer(contexte(params) as any);
  return { sortie: r.valeurs[0] as AudioBuffer, message: r.message as string };
}

const ecart = (a: AudioBuffer, b: AudioBuffer) => {
  let m = 0;
  for (let c = 0; c < a.numberOfChannels; c++) {
    const x = a.getChannelData(c), y = b.getChannelData(c);
    for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i] - y[i]));
  }
  return m;
};

describe("le composant Limiteur à crête vraie", () => {
  it("est au catalogue, entre par les effets, et déclare ses cinq réglages", () => {
    expect(fichesEffets.some((f) => f.id === "limiteur-crete-vraie")).toBe(true);
    expect(fichesEffets.some((f) => f.id === "limiteur")).toBe(true);
    expect(fiche.parametres.map((p) => p.nom).sort()).toEqual(Object.keys(DEPART).sort());
  });

  it("CHACUN DES CINQ RÉGLAGES CHANGE LE SON, sur un son qui dépasse le plafond", async () => {
    const reference = (await rendre(DEPART)).sortie;
    const inertes: string[] = [];
    for (const nom of Object.keys(DEPART)) {
      const { sortie } = await rendre({ ...DEPART, [nom]: VARIANTE[nom] });
      if (ecart(sortie, reference) < 1e-3) inertes.push(nom);
    }
    expect(inertes, `réglages sans effet : ${inertes.join(", ")}`).toEqual([]);
  });

  it("chaque valeur de l'épreuve reste dans la plage déclarée", () => {
    for (const p of fiche.parametres) {
      const [min, max] = p.plage as [number, number];
      for (const v of [DEPART[p.nom], VARIANTE[p.nom], p.defaut as number]) {
        expect(v, `${p.nom} = ${v}`).toBeGreaterThanOrEqual(min);
        expect(v, `${p.nom} = ${v}`).toBeLessThanOrEqual(max);
      }
    }
  });

  it("LA SORTIE TIENT SON PLAFOND, et le message dit la réduction et la crête vraie", async () => {
    const { sortie, message } = await rendre(DEPART);
    expect(creteVraieDb(sortie)).toBeLessThanOrEqual(-1 + 1e-4);
    expect(message).toMatch(/^(Réduction maximale|Maximum reduction) -\d+\.\d dB · (crête vraie|true peak) -1\.\d\d dBTP/);
  });

  it("garde la durée, la cadence et les canaux", async () => {
    const { sortie } = await rendre(DEPART);
    expect([sortie.length, sortie.sampleRate, sortie.numberOfChannels]).toEqual([SR, SR, 2]);
  });

  it("sans entrée, il le dit au lieu de lever", async () => {
    const r = await fiche.executer(contexte({}, null) as any);
    expect(r.valeurs).toEqual([null]);
    expect(r.message).toBeTruthy();
  });
});
