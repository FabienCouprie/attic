// audio/generation-gammes.test.ts — Le générateur musical joue la gamme qu'on lui demande.
//
// LE DÉFAUT QUE CE TEST EXISTE POUR EMPÊCHER, relevé le 2026-11-14 par la passe de croisement des
// nomenclatures : `genererDepuisScript` ne lisait de la gamme que la présence de « min » dans son nom.
// Les vingt-cinq gammes offertes y rendaient deux musiques, et comme « dominant » et « diminuée »
// contiennent « min », la lydienne dominante, la phrygienne dominante, la bebop dominante et les deux
// diminuées se jouaient en mineur naturel.
//
// LE TEST MESURE LE SON : chaque note jouée, accords, basse et mélodie, doit appartenir à la gamme
// demandée. Une gamme rendue comme une autre y fait entendre une note étrangère.
import { describe, expect, it } from "vitest";
import { parseMidi } from "midi-file";
import { completer, degresDeGamme } from "./gammes";
import { genererDepuisScript, PROGRESSIONS_GENRE } from "./generation";

const GAMMES = completer(["majeur", "mineur"]);

async function classesJouees(gamme: string, cle = "C"): Promise<Set<number>> {
  const { midiBytes } = await genererDepuisScript(`genre = pop\ntempo = 120\ncle = ${cle}\ngamme = ${gamme}\nduree = 16`);
  const classes = new Set<number>();
  for (const piste of parseMidi(midiBytes).tracks) {
    for (const e of piste) if (e.type === "noteOn" && e.velocity > 0) classes.add(e.noteNumber % 12);
  }
  return classes;
}

describe("le générateur musical joue la gamme demandée", () => {
  it("les vingt-cinq gammes offertes sont toutes dans la table commune", () => {
    expect(GAMMES.length).toBe(25);
  });

  for (const g of GAMMES) {
    it(`${g.id} : chaque note jouée appartient à la gamme`, async () => {
      const permises = new Set(degresDeGamme(g.id));
      const etrangeres = [...(await classesJouees(g.id))].filter((c) => !permises.has(c));
      expect(etrangeres, `${g.id} joue des notes hors de sa gamme`).toEqual([]);
    });
  }

  it("CHAQUE GENRE REND SA MUSIQUE : ambient ne rend plus celle de pop", async () => {
    // LE DÉFAUT, relevé par la même passe : seule la première progression d'un genre est lue, par
    // le générateur musical, le générateur d'accords et la boîte à groove, et celle d'ambient était
    // celle de pop. Le cas compare le MIDI rendu, genre à genre.
    const rendus = new Map<string, string>();
    for (const genre of Object.keys(PROGRESSIONS_GENRE)) {
      const { midiBytes } = await genererDepuisScript(`genre = ${genre}\ntempo = 120\ncle = C\ngamme = majeur\nduree = 16`);
      const deja = [...rendus].find(([, b]) => b === midiBytes.join(","));
      expect(deja?.[0], `${genre} rend ce que rend ${deja?.[0]}`).toBeUndefined();
      rendus.set(genre, midiBytes.join(","));
    }
    const premieres = Object.values(PROGRESSIONS_GENRE).map((p) => p[0].join(" "));
    expect(new Set(premieres).size, "deux genres ouvrent sur la même progression").toBe(premieres.length);
  });

  it("une gamme écrite à l'ancienne, en anglais, se lit encore", async () => {
    // « minor » n'est pas dans la table : le repli garde ce qu'il faisait, le mineur naturel.
    const permises = new Set(degresDeGamme("mineur"));
    expect([...(await classesJouees("minor"))].filter((c) => !permises.has(c))).toEqual([]);
  });
});
