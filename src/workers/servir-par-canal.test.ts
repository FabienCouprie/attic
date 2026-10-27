// src/workers/servir-par-canal.test.ts — Ce qu'un worker de calcul rend part TRANSFÉRÉ, non recopié.
//
// LE DÉFAUT, MESURÉ LE 2026-10-27. `servir-par-canal` tenait sa propre liste de transfert, qui ne
// connaissait pas un résultat qui EST un tableau typé : `Object.values` en énumérait les
// échantillons sans rien y trouver, et le résultat repartait recopié. Neuf workers rendent ainsi un
// `Float32Array` nu. Sur deux canaux de trois minutes et le worker de la vitesse variable, dans le
// navigateur : 2 008 à 2 219 ms par appel avant, 520 à 662 ms après. Le fil ne gelait pas ; c'est
// la durée qui se payait.
//
// LE FAUX `self` capte ce que le worker poste, et c'est la liste de transfert de la réponse qu'on
// lit : un tampon qui n'y est pas est un tampon recopié.
import { afterEach, describe, expect, it, vi } from "vitest";
import { listeDeTransfert } from "./liste-de-transfert";
import { servirParCanal } from "./servir-par-canal";
import { servirParLot } from "./servir-par-lot";

interface Envoi { message: { type: string; resultats?: unknown[] }; transfert: unknown }

function fauxSelf() {
  const envois: Envoi[] = [];
  const s = {
    onmessage: null as null | ((e: { data: unknown }) => void),
    postMessage: (message: Envoi["message"], transfert?: unknown) => { envois.push({ message, transfert }); },
  };
  vi.stubGlobal("self", s);
  const reponse = () => {
    const fin = envois.find((e) => e.message.type === "done");
    expect(fin, `le worker n'a pas répondu : ${JSON.stringify(envois.map((e) => e.message))}`).toBeTruthy();
    return fin!;
  };
  return { s, reponse };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("la liste de transfert des workers de calcul", () => {
  it("UN RÉSULTAT QUI EST UN TABLEAU TYPÉ PART TRANSFÉRÉ, canal par canal", () => {
    const { s, reponse } = fauxSelf();
    servirParCanal<object, Float32Array>((x) => x.map((v) => v * 2));
    s.onmessage!({ data: { voies: [new Float32Array(8), new Float32Array(8)] } });
    const fin = reponse();
    const resultats = fin.message.resultats as Float32Array[];
    expect(fin.transfert, "la liste de transfert doit nommer le tampon de chaque canal").toHaveLength(2);
    expect((fin.transfert as ArrayBuffer[])[0]).toBe(resultats[0].buffer);
    expect((fin.transfert as ArrayBuffer[])[1]).toBe(resultats[1].buffer);
  });

  it("et les tableaux typés d'un résultat en objet, rangés en liste compris", () => {
    const { s, reponse } = fauxSelf();
    servirParCanal<object, { y: Float32Array; trames: Float32Array[] }>(
      () => ({ y: new Float32Array(4), trames: [new Float32Array(2), new Float32Array(2)] }));
    s.onmessage!({ data: { voies: [new Float32Array(4)] } });
    expect(reponse().transfert).toHaveLength(3);
  });

  it("UN TAMPON N'Y EST NOMMÉ QU'UNE FOIS : deux fois, `postMessage` lèverait", () => {
    // `DataCloneError` sur un tampon répété dans la liste de transfert : deux vues sur un même
    // tampon suffisent, et la copie, elle, les acceptait.
    const commun = new ArrayBuffer(16);
    const resultat = { a: new Float32Array(commun, 0, 2), b: new Float32Array(commun, 8, 2) };
    expect(listeDeTransfert([resultat, { c: resultat.a }])).toEqual([commun]);
  });

  it("le dialogue par lot rend la même liste", () => {
    const { s, reponse } = fauxSelf();
    servirParLot<object, null, Float32Array>(() => null, (t) => new Float32Array(4).fill(t));
    s.onmessage!({ data: { taches: [0, 1, 2] } });
    const fin = reponse();
    expect(fin.transfert).toEqual((fin.message.resultats as Float32Array[]).map((r) => r.buffer));
  });
});
