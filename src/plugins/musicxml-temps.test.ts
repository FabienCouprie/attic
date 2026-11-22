// plugins/musicxml-temps.test.ts — Le MusicXML venu d'un MIDI : sa clé, et ses valeurs selon les temps.
//
// Les deux derniers points que la revue des notations en texte avait laissés ouverts sur ce format,
// tranchés par Fabien le 2026-11-22 : « Choose by register » pour la clé, « Follow the beats » pour le
// découpage des durées. Tout passe par `executer`, du MIDI au texte MusicXML.
//
// LES ATTENDUS VIENNENT DE L'USAGE DE LA GRAVURE, tel qu'Elaine Gould l'expose dans « Behind Bars »
// (2011) : une valeur montre le milieu d'une mesure à quatre temps et ne cache pas un temps quand elle
// commence hors du temps, sauf les syncopes que l'usage admet, la blanche du deuxième temps entre deux
// noires et la noire entre deux croches.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { notesVersFichierMidi } from "../audio/midi-ecriture";

const F = (id: string) => registre.trouverDef(id) as unknown as FicheLancable;
const COURT: Record<string, string> = { whole: "w", half: "h", quarter: "q", eighth: "8", "16th": "16" };

/** Des notes en noires, à 120 à la noire, en fichier MIDI. */
const midi = (notes: [number, number, number][]) => new File([notesVersFichierMidi(
  notes.map(([note, debut, fin]) => ({ note, velocite: 90, debut: debut / 2, fin: fin / 2 })) as any, 120,
) as unknown as BlobPart], "m.mid");

async function ecrire(notes: [number, number, number][], metrique = "4/4") {
  const r = await lancerFiche(F("musicxml"), { "Métrique": metrique, Quantification: "16" }, { entrees: [midi(notes), null, null] });
  expect(r.erreurRendue, r.message).toBe(false);
  return { xml: String(r.valeurs[0]), message: r.message };
}

/** Chaque note écrite : sa valeur, ses points, « ~ » quand elle se lie à la suivante, « r » pour un silence. */
const valeurs = (xml: string) => [...xml.matchAll(/<note>([\s\S]*?)<\/note>/g)].map(([, n]) =>
  `${n.includes("<rest/>") ? "r" : ""}${COURT[/<type>(\w+)<\/type>/.exec(n)![1]]}${".".repeat((n.match(/<dot\/>/g) ?? []).length)}${n.includes('<tie type="start"/>') ? "~" : ""}`);

describe("la clé suit le registre", () => {
  it("une ligne de basse s'écrit en clé de fa, et le message le dit", async () => {
    const { xml, message } = await ecrire([[36, 0, 1], [38, 1, 2], [40, 2, 3], [41, 3, 4]]);
    expect(xml).toContain("<clef><sign>F</sign><line>4</line></clef>");
    expect(message).toContain("clé de fa");
  });

  it("une ligne aiguë reste en clé de sol, et le message le dit", async () => {
    const { xml, message } = await ecrire([[72, 0, 1], [74, 1, 2], [76, 2, 3], [77, 3, 4]]);
    expect(xml).toContain("<clef><sign>G</sign><line>2</line></clef>");
    expect(message).toContain("clé de sol");
  });
});

describe("les valeurs suivent les temps de la mesure", () => {
  it.each([
    ["noire, blanche du deuxième temps, noire : la syncope admise", "4/4",
      [[60, 0, 1], [62, 1, 3], [64, 3, 4]], ["q", "h", "q"]],
    ["une blanche pointée du deuxième temps montre le troisième", "4/4",
      [[60, 0, 1], [62, 1, 4]], ["q", "q~", "h"]],
    ["une note qui commence hors du temps ne cache pas le milieu de la mesure", "4/4",
      [[60, 0, 1.5], [62, 1.5, 3.5], [64, 3.5, 4]], ["q.", "8~", "q.", "8"]],
    ["croche, noire, croche : la syncope admise dans une demi-mesure", "4/4",
      [[60, 0, 0.5], [62, 0.5, 1.5], [64, 1.5, 2], [65, 2, 4]], ["8", "q", "8", "h"]],
    ["la même noire, à cheval sur le milieu, se coupe en deux croches", "4/4",
      [[60, 0, 1], [62, 1, 1.5], [64, 1.5, 2.5], [65, 2.5, 3], [67, 3, 4]], ["q", "8", "8~", "8", "8", "q"]],
    ["en 3/4, noire et blanche", "3/4", [[60, 0, 1], [62, 1, 3]], ["q", "h"]],
    ["en 6/8, la noire dans un temps reste une noire", "6/8", [[60, 0, 0.5], [62, 0.5, 1.5], [64, 1.5, 3]], ["8", "q", "q."]],
    ["en 6/8, la noire qui passe d'un temps à l'autre se coupe en deux croches", "6/8",
      [[60, 0, 1], [62, 1, 2], [64, 2, 3]], ["q", "8~", "8", "q"]],
  ] as [string, string, [number, number, number][], string[]][])("%s", async (_titre, metrique, notes, attendu) => {
    expect(valeurs((await ecrire(notes, metrique)).xml)).toEqual(attendu);
  });
});
