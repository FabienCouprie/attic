// audio/midi-arpege.test.ts — La vitesse de l'arpégiateur, et les deux écritures du triolet.
//
// CE QUE CE FICHIER ARRÊTE. Le réglage « Vitesse » nomme une valeur de note, et le calcul la
// traduit en divisions par temps par une table écrite à côté de lui. Un nom absent de cette table
// retombe sur quatre, c'est-à-dire sur la double croche, SANS QUE RIEN NE LE DISE. Les
// identifiants de ce réglage viennent désormais de `audio/valeurs-note.ts`, où le triolet s'écrit
// `1/8t` et non « 1/8 triplet » : si la table du calcul ne suivait pas, le triolet rendrait des
// doubles croches en silence, et le contrat de composant interdit un réglage qui ne change rien.
import { describe, expect, it } from "vitest";
import { writeMidi } from "midi-file";
import { arpegerMidi } from "./midi-arpege";
import { analyserMidi } from "./midi";
import { parseMidi } from "midi-file";

/** Un accord de trois notes tenu une noire, à 480 tics par noire. */
function accordMidi(): File {
  const octets = writeMidi({
    header: { format: 0, numTracks: 1, ticksPerBeat: 480 },
    tracks: [[
      { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500000 } as any,
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 60, velocity: 100 } as any,
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 64, velocity: 100 } as any,
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 67, velocity: 100 } as any,
      { deltaTime: 1920, type: "noteOff", channel: 0, noteNumber: 60, velocity: 0 } as any,
      { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: 64, velocity: 0 } as any,
      { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: 67, velocity: 0 } as any,
      { deltaTime: 0, meta: true, type: "endOfTrack" } as any,
    ]],
  });
  return new File([new Uint8Array(octets)], "accord.mid");
}

/**
 * L'écartement des notes arpégées, en secondes.
 *
 * CE N'EST PAS LE COMPTE QUI VARIE, MAIS LE PAS. L'arpégiateur rend un pas par note de l'accord,
 * de sorte que trois notes en donnent trois quelle que soit la vitesse ; ce que la vitesse décide,
 * c'est l'intervalle qui les sépare. Mesurer le compte ne verrait donc rien bouger, et c'est
 * exactement l'erreur qu'un garde doit éviter : croire mesurer un réglage en regardant ailleurs.
 */
const ecartement = async (vitesse: string) => {
  const sortie = await arpegerMidi(accordMidi(), "Droit", "Montant", vitesse, 1, 80);
  const { notes } = analyserMidi(parseMidi(new Uint8Array(await sortie.arrayBuffer())));
  const debuts = notes.map((n) => n.debut).sort((a, b) => a - b);
  expect(debuts.length, `« ${vitesse} » ne rend aucune note`).toBeGreaterThan(1);
  return debuts[1] - debuts[0];
};

describe("la vitesse de l'arpégiateur", () => {
  it("CHAQUE VALEUR CHANGE L'ÉCARTEMENT, sinon le réglage serait inerte", async () => {
    const croche = await ecartement("1/8");
    const doubleCroche = await ecartement("1/16");
    const tripleCroche = await ecartement("1/32");
    expect(doubleCroche, "1/16 doit serrer plus que 1/8").toBeLessThan(croche);
    expect(tripleCroche, "1/32 doit serrer plus que 1/16").toBeLessThan(doubleCroche);
  });

  it("LE TRIOLET EST LU SOUS SON IDENTIFIANT, et non retombé sur la double croche", async () => {
    // TROIS DIVISIONS PAR TEMPS, ET NON QUATRE : l'écartement doit se placer ENTRE celui de la
    // croche et celui de la double croche, ce qu'aucun repli silencieux ne donnerait.
    const croche = await ecartement("1/8");
    const triolet = await ecartement("1/8t");
    const doubleCroche = await ecartement("1/16");
    expect(triolet, "« 1/8t » rend l'écartement de la croche, donc il n'est pas lu").toBeLessThan(croche);
    expect(triolet, "« 1/8t » rend l'écartement de la double croche, donc il est retombé dessus")
      .toBeGreaterThan(doubleCroche);
  });

  it("ET SOUS L'ÉCRITURE QU'UN PROJET ANCIEN PORTE, « 1/8 triplet »", async () => {
    expect(await ecartement("1/8 triplet")).toBe(await ecartement("1/8t"));
    expect(await ecartement("1/16 triplet")).toBe(await ecartement("1/16t"));
  });
});
