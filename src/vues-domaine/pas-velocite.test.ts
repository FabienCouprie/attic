// ui/pas-velocite.test.ts — Un clic sur une case allumée doit l'éteindre.
//
// Le défaut rapporté : dans le séquenceur de batterie avancé, cliquer une case déjà
// active ne l'effaçait pas — on ne pouvait donc pas défaire le motif de départ. Le clic
// montait la vélocité d'un cran, et une case arrivée à 9 ne répondait plus du tout.
import { describe, expect, it } from "vitest";
import { VELOCITE_PAR_DEFAUT, gestePas, velociteApresGeste } from "./pas-velocite";

describe("geste choisi par le clic", () => {
  it("bascule sans modificateur, monte avec Maj, descend avec Alt", () => {
    expect(gestePas({})).toBe("bascule");
    expect(gestePas({ shiftKey: true })).toBe("monter");
    expect(gestePas({ altKey: true })).toBe("descendre");
  });
});

describe("clic simple", () => {
  it("éteint une case allumée — le défaut rapporté", () => {
    for (const vel of [1, 5, 9]) {
      expect(velociteApresGeste(vel, "bascule")).toBe(0);
    }
  });

  it("éteint aussi une case à la vélocité maximale, qui ne répondait plus du tout", () => {
    expect(velociteApresGeste(9, "bascule")).toBe(0);
  });

  it("allume une case éteinte à une vélocité franche", () => {
    expect(velociteApresGeste(0, "bascule")).toBe(VELOCITE_PAR_DEFAUT);
    expect(VELOCITE_PAR_DEFAUT).toBeGreaterThan(0);
  });

  it("rend à la case la nuance qu'elle avait avant d'être éteinte", () => {
    expect(velociteApresGeste(0, "bascule", 9)).toBe(9);
    expect(velociteApresGeste(0, "bascule", 2)).toBe(2);
    // Une nuance nulle n'en est pas une : on retombe sur le défaut.
    expect(velociteApresGeste(0, "bascule", 0)).toBe(VELOCITE_PAR_DEFAUT);
  });

  it("éteindre puis rallumer redonne le motif de départ", () => {
    const depart = 7;
    const eteint = velociteApresGeste(depart, "bascule");
    expect(eteint).toBe(0);
    expect(velociteApresGeste(eteint, "bascule", depart)).toBe(depart);
  });
});

describe("nuance sur les modificateurs", () => {
  it("Maj monte d'un cran et s'arrête à 9", () => {
    expect(velociteApresGeste(0, "monter")).toBe(1);
    expect(velociteApresGeste(5, "monter")).toBe(6);
    expect(velociteApresGeste(9, "monter")).toBe(9);
  });

  it("Alt descend d'un cran et s'arrête à 0", () => {
    expect(velociteApresGeste(9, "descendre")).toBe(8);
    expect(velociteApresGeste(1, "descendre")).toBe(0);
    expect(velociteApresGeste(0, "descendre")).toBe(0);
  });

  it("neuf Alt+clic effacent une case au maximum — l'ancien seul recours", () => {
    let v = 9;
    for (let i = 0; i < 9; i++) v = velociteApresGeste(v, "descendre");
    expect(v).toBe(0);
  });
});
