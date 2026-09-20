import { describe, expect, it } from "vitest";
import { agregerMetriques, detailParProcessus, formaterMo } from "./memoire-vive";

/** Electron rend `workingSetSize` en kibioctets : c'est la seule unité qu'il donne. */
const kio = (mo: number) => Math.round((mo * 1e6) / 1024);
const proc = (type: string, mo: number) => ({ type, memory: { workingSetSize: kio(mo) } });

describe("agréger ce que rendent les processus", () => {
  it("additionne tous les processus, pas seulement celui qui calcule", () => {
    const m = agregerMetriques([proc("Browser", 429), proc("Tab", 1206), proc("GPU", 133)]);
    expect(Math.round(m.total / 1e6)).toBe(1768);
  });

  it("regroupe les processus de même type — il y a plusieurs onglets", () => {
    const m = agregerMetriques([proc("Tab", 1206), proc("Tab", 307), proc("Browser", 220)]);
    expect(m.parType.map((p) => p.type)).toEqual(["Tab", "Browser"]);
    expect(Math.round(m.parType[0].octets / 1e6)).toBe(1513);
  });

  it("classe du plus gros au plus petit : c'est le gros qu'on cherche", () => {
    const m = agregerMetriques([proc("Utility", 48), proc("Tab", 1206), proc("Browser", 429)]);
    expect(m.parType.map((p) => p.type)).toEqual(["Tab", "Browser", "Utility"]);
  });

  it("un processus sans mémoire annoncée compte pour zéro, il ne fait pas échouer le relevé", () => {
    const m = agregerMetriques([{ type: "Tab" }, proc("Browser", 100)]);
    expect(Math.round(m.total / 1e6)).toBe(100);
  });

  it("un type absent ne perd pas ses octets", () => {
    const m = agregerMetriques([{ memory: { workingSetSize: kio(50) } }]);
    expect(m.parType).toEqual([{ type: "?", octets: m.total }]);
  });

  it("aucun processus : un total nul, et rien à détailler", () => {
    expect(agregerMetriques([])).toEqual({ total: 0, parType: [] });
  });
});

describe("afficher le chiffre", () => {
  it("en mégaoctets décimaux, jamais en gigaoctets — comparer d'un coup d'œil", () => {
    expect(formaterMo(2_104_000_000)).toBe("2 104 Mo");
  });

  it("un petit chiffre n'a pas de séparateur", () => {
    expect(formaterMo(429_000_000)).toBe("429 Mo");
  });

  it("arrondi au mégaoctet : la décimale changerait de largeur à chaque relevé", () => {
    expect(formaterMo(1_499_999)).toBe("1 Mo");
    expect(formaterMo(1_500_001)).toBe("2 Mo");
  });

  it("le détail nomme chaque processus, un par ligne", () => {
    const m = agregerMetriques([proc("Tab", 1206), proc("Browser", 429)]);
    expect(detailParProcessus(m)).toBe("Tab : 1 206 Mo\nBrowser : 429 Mo");
  });
});
