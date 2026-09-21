// core/respirer.test.ts — La respiration d'une boucle longue.
//
// Ce qui se vérifie ici tient en une phrase : une boucle qui appelle `tour()` à chaque itération ne
// doit céder la main QUE de temps en temps. Céder à chaque tour rendrait le calcul dix fois plus
// lent ; ne céder jamais fige l'interface. L'horloge est injectée, sinon le test dépendrait de la
// vitesse de la machine — et serait donc instable là où il compte, sur une machine chargée.
import { describe, expect, it } from "vitest";
import { DELAI_RESPIRATION_MS, Respiration, respirer } from "./respirer";

/** Une horloge qu'on avance à la main. */
function horloge() {
  let t = 1000;
  return { lire: () => t, avancer: (ms: number) => { t += ms; } };
}

describe("la respiration d'une boucle", () => {
  it("ne cède pas la main tant que le délai n'est pas passé", async () => {
    const h = horloge();
    const r = new Respiration(50, h.lire);
    expect(await r.tour()).toBe(false);
    h.avancer(49);
    expect(await r.tour()).toBe(false);
  });

  it("cède la main une fois le délai atteint", async () => {
    const h = horloge();
    const r = new Respiration(50, h.lire);
    h.avancer(50);
    expect(await r.tour()).toBe(true);
  });

  it("repart à zéro après avoir cédé : elle ne cède pas deux fois de suite", async () => {
    const h = horloge();
    const r = new Respiration(50, h.lire);
    h.avancer(60);
    expect(await r.tour()).toBe(true);
    expect(await r.tour()).toBe(false);
    h.avancer(60);
    expect(await r.tour()).toBe(true);
  });

  it("sur mille tours rapides, cède un nombre de fois proportionnel au temps écoulé", async () => {
    // Mille tours d'une milliseconde, délai de cinquante : vingt respirations, pas mille.
    const h = horloge();
    const r = new Respiration(50, h.lire);
    let cedees = 0;
    for (let i = 0; i < 1000; i++) {
      h.avancer(1);
      if (await r.tour()) cedees++;
    }
    expect(cedees).toBe(20);
  });

  it("annonce ce qu'elle va faire sans le faire, pour qu'une boucle puisse s'organiser", () => {
    const h = horloge();
    const r = new Respiration(50, h.lire);
    expect(r.doitRespirer()).toBe(false);
    h.avancer(50);
    expect(r.doitRespirer()).toBe(true);
    // Consulter ne consomme pas : deux lectures de suite disent la même chose.
    expect(r.doitRespirer()).toBe(true);
  });

  it("garde un délai par défaut sous le seuil de perception d'un blocage", () => {
    // Au-delà d'une centaine de millisecondes, une interface est perçue comme figée : le délai par
    // défaut doit rester nettement en dessous.
    expect(DELAI_RESPIRATION_MS).toBeLessThanOrEqual(100);
    expect(DELAI_RESPIRATION_MS).toBeGreaterThan(0);
  });

  it("rend réellement la main : une tâche posée après elle s'exécute avant sa reprise", async () => {
    const ordre: string[] = [];
    setTimeout(() => ordre.push("tâche du navigateur"), 0);
    await respirer();
    ordre.push("reprise du calcul");
    expect(ordre).toEqual(["tâche du navigateur", "reprise du calcul"]);
  });
});
