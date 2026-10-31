// plugins/messages-langue.test.ts — Deux messages d'exécution qui restaient en français dans
// l'interface anglaise.
//
// Relevés le 2026-10-29 en filmant la présentation anglaise d'Attic. La Groove Box annonçait
// « Groove Box · C majeur · I–VI–IV–V · 110 BPM · 15 neurones · Pop dance · graine 4242 » : son
// message était composé à partir des IDENTIFIANTS de ses réglages, qui sont français, et de trois
// mots écrits en dur. Paulstretch annonçait « 71,9 s · 8,0 × » : il écrivait sa virgule décimale à
// la main, quelle que soit la langue.
//
// Le balayage de tout le registre est `tests-e2e/messages-anglais.spec.ts`, qui demande le banc et
// des dizaines de minutes. Ces cas-ci tiennent les deux fautes nommées sous `npx vitest run`, et le
// français tel qu'il était, au caractère près.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { constante } from "../audio/courbe";
import { francais, virguleDecimale } from "../docs/detecteur-francais";
import { ctxDEssai } from "../core/contexte-essai";

/**
 * Exécute quelque chose avec l'interface dans une langue donnée.
 *
 * `langueCourante` lit `localStorage`, absent sous vitest, et rend « fr » par défaut : sans ce
 * détour, le chemin anglais d'un message n'est jamais emprunté par un test. Même procédé que
 * `plugins/visualisation.test.ts`.
 */
async function avecLangue<T>(langue: string, f: () => Promise<T>): Promise<T> {
  const avant = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (c: string) => (c === "attic-lang" ? langue : null), setItem: () => {} },
    configurable: true, writable: true,
  });
  try { return await f(); } finally {
    if (avant) Object.defineProperty(globalThis, "localStorage", avant);
    else delete (globalThis as unknown as Record<string, unknown>).localStorage;
  }
}

function contexte(entrees: unknown[], reglages: Record<string, string | number>) {
  return ctxDEssai(entrees, reglages, { runtime: { sampleRate: 44100 } }) as never;
}

const lancer = async (id: string, entrees: unknown[], reglages: Record<string, string | number>) =>
  (await registre.trouverDef(id)!.executer(contexte(entrees, reglages))).message ?? "";

/** Un son reproductible d'une seconde. */
function son(secondes = 1, sr = 16000): AudioBuffer {
  const n = Math.round(secondes * sr);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
  const d = b.getChannelData(0);
  let g = 24680;
  for (let i = 0; i < n; i++) { g = (g * 1103515245 + 12345) % 2147483648; d[i] = (g / 2147483648 * 2 - 1) * 0.4; }
  return b;
}

describe("Groove Box : son message suit la langue de l'interface", () => {
  // Un réglage court : le message ne dépend pas de la longueur, et le rendu en dépend.
  const reglages = {
    "Clé": "C", "Gamme": "majeur", "Genre": "pop", "Tempo": 110, "Durée par accord": 1,
    "Nombre d'accords": 4, "Neurones": 15, "Style rythmique": "Marche militaire", "Graine": 4242,
    "Synthèse": "FM/Oscillateurs",
  };

  it("en français, il reste celui d'avant, au caractère près", async () => {
    const m = await avecLangue("fr", () => lancer("boite-groove", [], reglages));
    expect(m).toMatch(/^Groove Box · C majeur · [IV–]+ · 110 BPM · 15 neurones · Marche militaire · graine 4242$/);
  });

  it("en anglais, la gamme et le style prennent le libellé du menu, et les mots sont anglais", async () => {
    const m = await avecLangue("en", () => lancer("boite-groove", [], reglages));
    // « Marche militaire » est l'un des patrons dont le nom change d'une langue à l'autre : c'est
    // lui qui prouve que le style est traduit, « Pop dance » s'écrivant pareil dans les deux.
    expect(m).toMatch(/^Groove Box · C Major · [IV–]+ · 110 BPM · 15 neurons · Military march · seed 4242$/);
    expect(francais(m), m).toBe(false);
  });
});

describe("Paulstretch : ses nombres et sa course suivent la langue de l'interface", () => {
  it("sans courbe : la virgule en français, le point en anglais", async () => {
    const fr = await avecLangue("fr", () => lancer("paulstretch", [son(), null], { "Stretch": 8 }));
    const en = await avecLangue("en", () => lancer("paulstretch", [son(), null], { "Stretch": 8 }));
    expect(fr).toMatch(/^\d+,\d s · 8,0 ×$/);
    expect(en).toMatch(/^\d+\.\d s · 8\.0 ×$/);
    expect(virguleDecimale(en), en).toBe(false);
  });

  it("avec une courbe : « à » en français, « to » en anglais", async () => {
    const reglages = { "Modulation min": 2, "Modulation max": 50 };
    const fr = await avecLangue("fr", () => lancer("paulstretch", [son(), constante(0.5, 1)], reglages));
    const en = await avecLangue("en", () => lancer("paulstretch", [son(), constante(0.5, 1)], reglages));
    expect(fr).toMatch(/^\d+,\d s · 10,0 à 10,0 ×$/);
    expect(en).toMatch(/^\d+\.\d s · 10\.0 to 10\.0 ×$/);
    expect(francais(en) || virguleDecimale(en), en).toBe(false);
  });
});
