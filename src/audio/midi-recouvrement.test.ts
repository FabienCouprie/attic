// audio/midi-recouvrement.test.ts — Une hauteur rejouée avant d'être relâchée sort-elle sans ambiguïté ?
//
// CE QUE CES CAS ÉPROUVENT, et dans quel ordre d'importance. D'abord que l'ambiguïté disparaît :
// plus aucune hauteur n'est ouverte deux fois sur un même canal. Ensuite, et c'est ce qui distingue
// cette réparation d'une fusion, que les DEUX ATTAQUES subsistent et que la durée sonnante totale ne
// bouge pas. Enfin que tout le reste est laissé tranquille : un accord n'est pas un recouvrement,
// deux canaux ne se gênent pas, et les réglages gardent leur place.
import { describe, expect, it } from "vitest";

import { resoudreRecouvrements, type EvenementTick } from "./midi-recouvrement";

const on = (tick: number, noteNumber: number, channel = 0): EvenementTick =>
  ({ tick, type: "noteOn", channel, noteNumber, velocity: 96 });
const off = (tick: number, noteNumber: number, channel = 0): EvenementTick =>
  ({ tick, type: "noteOff", channel, noteNumber, velocity: 0 });

/** Les hauteurs ouvertes deux fois sans fermeture entre-temps : ce que le garde de conformité voit. */
function ambigus(evenements: EvenementTick[]): string[] {
  const ouvertes = new Set<string>();
  const fautes: string[] = [];
  for (const e of [...evenements]) {
    const cle = `${e.channel ?? 0}/${e.noteNumber}`;
    if (e.type === "noteOn" && Number(e.velocity) > 0) {
      if (ouvertes.has(cle)) fautes.push(`${cle} rejouee au tick ${e.tick}`);
      ouvertes.add(cle);
    } else if (e.type === "noteOff" || e.type === "noteOn") ouvertes.delete(cle);
  }
  return fautes;
}

/** La durée pendant laquelle une hauteur sonne, telle qu'un lecteur conforme l'entend. */
function dureeSonnante(evenements: EvenementTick[], noteNumber: number, channel = 0): number {
  let total = 0, depuis: number | null = null;
  for (const e of evenements) {
    if ((e.channel ?? 0) !== channel || e.noteNumber !== noteNumber) continue;
    if (e.type === "noteOn" && Number(e.velocity) > 0) { if (depuis === null) depuis = e.tick; }
    else if (depuis !== null) { total += e.tick - depuis; depuis = null; }
  }
  return total;
}

describe("le recouvrement d'une même hauteur", () => {
  it("ÉCOURTE LA NOTE OUVERTE À L'INSTANT OÙ LA MÊME HAUTEUR SE REJOUE", () => {
    // La première dure 0 à 480, la seconde s'attaque à 240 : il n'y a pas deux do à la fois.
    const sortie = resoudreRecouvrements([on(0, 60), off(480, 60), on(240, 60), off(720, 60)]);
    expect(ambigus(sortie)).toEqual([]);
    expect(sortie.map((e) => [e.tick, e.type])).toEqual([
      [0, "noteOn"], [240, "noteOff"], [240, "noteOn"], [720, "noteOff"],
    ]);
  });

  it("GARDE LES DEUX ATTAQUES, et c'est ce qui distingue l'écourtement d'une fusion", () => {
    const sortie = resoudreRecouvrements([on(0, 60), off(480, 60), on(240, 60), off(720, 60)]);
    expect(sortie.filter((e) => e.type === "noteOn").map((e) => e.tick)).toEqual([0, 240]);
  });

  it("et la durée sonnante totale ne bouge pas : de 0 à 720 avant comme après", () => {
    const avant = [on(0, 60), off(480, 60), on(240, 60), off(720, 60)];
    // Avant la réparation, un lecteur conforme s'arrêtait au premier note-off, soit 480.
    expect(dureeSonnante(resoudreRecouvrements(avant), 60)).toBe(720);
  });

  it("enchaîne trois notes qui se recouvrent toutes", () => {
    const sortie = resoudreRecouvrements([
      on(0, 60), off(600, 60), on(200, 60), off(800, 60), on(400, 60), off(1000, 60),
    ]);
    expect(ambigus(sortie)).toEqual([]);
    expect(sortie.map((e) => e.tick)).toEqual([0, 200, 200, 400, 400, 1000]);
  });

  it("ne garde qu'une note quand deux attaques tombent au même tick, la plus longue des deux", () => {
    // Rien ne peut s'écourter entre deux attaques simultanées : elles ne décrivent qu'une note.
    const sortie = resoudreRecouvrements([on(0, 60), off(240, 60), on(0, 60), off(480, 60)]);
    expect(sortie.filter((e) => e.type === "noteOn")).toHaveLength(1);
    expect(sortie.filter((e) => e.type === "noteOff").map((e) => e.tick)).toEqual([480]);
  });
});

describe("ce que la réparation laisse tranquille", () => {
  it("UN ACCORD, qui recouvre des hauteurs DIFFÉRENTES sur le même canal", () => {
    const accord = [on(0, 60), on(0, 64), on(0, 67), off(480, 60), off(480, 64), off(480, 67)];
    const sortie = resoudreRecouvrements(accord);
    expect(sortie.filter((e) => e.type === "noteOff").map((e) => e.tick)).toEqual([480, 480, 480]);
  });

  it("la même hauteur sur DEUX CANAUX, qui ne se gênent pas", () => {
    const sortie = resoudreRecouvrements([on(0, 60, 0), off(480, 60, 0), on(240, 60, 1), off(720, 60, 1)]);
    expect(sortie.filter((e) => e.type === "noteOff").map((e) => e.tick)).toEqual([480, 720]);
  });

  it("deux notes bout à bout, la seconde commençant exactement où la première finit", () => {
    const sortie = resoudreRecouvrements([on(0, 60), off(240, 60), on(240, 60), off(480, 60)]);
    expect(sortie.map((e) => [e.tick, e.type])).toEqual([
      [0, "noteOn"], [240, "noteOff"], [240, "noteOn"], [480, "noteOff"],
    ]);
  });

  it("les réglages, qui gardent leur tick et passent avant les notes du même tick", () => {
    const sortie = resoudreRecouvrements([
      on(0, 60), off(480, 60), on(240, 60), off(720, 60),
      { tick: 0, type: "setTempo", microsecondsPerBeat: 500000 },
      { tick: 240, type: "programChange", channel: 0, programNumber: 4 },
    ]);
    expect(sortie[0].type).toBe("setTempo");
    const au240 = sortie.filter((e) => e.tick === 240).map((e) => e.type);
    expect(au240).toEqual(["programChange", "noteOff", "noteOn"]);
  });

  it("un note-off sans note ouverte, qui ne décrit aucune note à écourter", () => {
    const sortie = resoudreRecouvrements([off(100, 60), on(200, 60), off(400, 60)]);
    expect(sortie.map((e) => [e.tick, e.type])).toEqual([
      [100, "noteOff"], [200, "noteOn"], [400, "noteOff"],
    ]);
  });

  it("un note-on de vélocité nulle, qui EST un note-off", () => {
    const sortie = resoudreRecouvrements([
      on(0, 60), { tick: 480, type: "noteOn", channel: 0, noteNumber: 60, velocity: 0 },
      on(240, 60), off(720, 60),
    ]);
    expect(ambigus(sortie)).toEqual([]);
    expect(sortie.find((e) => e.velocity === 0)!.tick).toBe(240);
  });

  it("LA LISTE REÇUE, qui n'est pas touchée", () => {
    const entree = [on(0, 60), off(480, 60), on(240, 60), off(720, 60)];
    const copie = entree.map((e) => ({ ...e }));
    resoudreRecouvrements(entree);
    expect(entree).toEqual(copie);
  });

  it("une liste vide et une liste sans la moindre note", () => {
    expect(resoudreRecouvrements([])).toEqual([]);
    const reglages: EvenementTick[] = [{ tick: 0, type: "setTempo", microsecondsPerBeat: 500000 }];
    expect(resoudreRecouvrements(reglages)).toEqual(reglages);
  });
});
