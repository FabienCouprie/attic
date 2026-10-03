// ui/clavier-son.test.ts — Le clavier doit sonner comme le nœud rendra.
//
// Le nœud « Clavier mélodie » offre « Synthèse » et « Instrument », et son exécution les
// respecte. Le clavier, lui, les ignorait : presser une touche passait par un oscillateur
// triangle écrit en dur. On choisissait un piano et l'on entendait un bip.
import { describe, expect, it } from "vitest";
import { instrumentClavier, modeRenduClavier, volumeClavier } from "./clavier-son";

describe("mode de rendu du clavier", () => {
  it("suit « Automatique » : SoundFont si un fichier est chargé, sinon synthèse interne", () => {
    expect(modeRenduClavier({ "Synthèse": "Automatique" }, true)).toBe("SoundFont");
    expect(modeRenduClavier({ "Synthèse": "Automatique" }, false)).toBe("FM/Oscillateurs");
  });

  it("respecte « SoundFont » demandé explicitement", () => {
    expect(modeRenduClavier({ "Synthèse": "soundfont" }, true)).toBe("SoundFont");
  });

  it("respecte « FM » même quand un SoundFont est charge", () => {
    expect(modeRenduClavier({ "Synthèse": "FM/Oscillateurs" }, true)).toBe("FM/Oscillateurs");
    expect(modeRenduClavier({ "Synthèse": "fm" }, true)).toBe("FM/Oscillateurs");
  });

  it("retombe sur la synthèse interne si le SoundFont manque — un clavier ne devient pas muet", () => {
    // L'exécution, elle, lève une erreur : un nœud en erreur se voit et s'explique, un
    // clavier silencieux sous les doigts ne s'explique pas.
    expect(modeRenduClavier({ "Synthèse": "SoundFont" }, false)).toBe("FM/Oscillateurs");
  });

  it("vaut « Automatique » quand le paramètre manque ou n'a pas de sens", () => {
    expect(modeRenduClavier(undefined, true)).toBe("SoundFont");
    expect(modeRenduClavier({}, false)).toBe("FM/Oscillateurs");
    expect(modeRenduClavier({ "Synthèse": "n'importe quoi" }, true)).toBe("SoundFont");
  });
});

describe("instrument et volume", () => {
  it("décode le programme et la banque comme l'exécution", () => {
    expect(instrumentClavier({ Instrument: 0 })).toEqual({ programme: 0, banque: 0 });
    expect(instrumentClavier({ Instrument: 40 })).toEqual({ programme: 40, banque: 0 });
    // Au-delà de 127, la banque : 128 + 25 = batterie GM, banque 1.
    expect(instrumentClavier({ Instrument: 128 + 25 })).toEqual({ programme: 25, banque: 1 });
  });

  it("prend le piano par défaut quand rien n'est choisi", () => {
    expect(instrumentClavier(undefined)).toEqual({ programme: 0, banque: 0 });
    expect(instrumentClavier({ Instrument: "abc" })).toEqual({ programme: 0, banque: 0 });
  });

  it("borne le volume, et retient 80 par défaut", () => {
    expect(volumeClavier({ Volume: 50 })).toBe(50);
    expect(volumeClavier(undefined)).toBe(80);
    expect(volumeClavier({ Volume: 300 })).toBe(100);
    expect(volumeClavier({ Volume: -10 })).toBe(0);
  });
});
