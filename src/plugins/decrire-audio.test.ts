// src/plugins/decrire-audio.test.ts — Ce que les étiquettes deviennent en mots.
//
// L'ÉTIQUETTE « Music » EST ÉCARTÉE QUAND ELLE EST PREMIÈRE, et c'est une mesure qui l'a décidé,
// non un goût. Relevé le 2026-10-21 sur deux témoins musicaux : elle sortait à 0,763 et 0,848, loin
// devant tout le reste, et une description qui commence par « music » n'apprend rien à un modèle
// dont le métier est d'engendrer de la musique. Sur un témoin NON musical — une ambiance de bar —
// elle n'était pas première, à 0,026, et rien ne doit alors être écarté : la règle est donc sur la
// POSITION et non sur la présence du mot.
import { describe, expect, it } from "vitest";
import { descriptionDepuis, tableauEtiquettes } from "./decrire-audio";

/** Le relevé réel du rendu de guitare, dix étiquettes, dans l'ordre que le moteur a rendu. */
const GUITARE = [
  { etiquette: "Music", score: 0.7631 },
  { etiquette: "Musical instrument", score: 0.1376 },
  { etiquette: "Guitar", score: 0.1125 },
  { etiquette: "Plucked string instrument", score: 0.0996 },
  { etiquette: "Acoustic guitar", score: 0.0261 },
  { etiquette: "Tender music", score: 0.0041 },
];

/** Le relevé réel de l'ambiance de bar : « Music » y est présente, et septième. */
const BAR = [
  { etiquette: "Speech", score: 0.8841 },
  { etiquette: "Conversation", score: 0.1217 },
  { etiquette: "Inside, small room", score: 0.0387 },
  { etiquette: "Music", score: 0.0260 },
  { etiquette: "Dishes, pots, and pans", score: 0.0200 },
];

describe("descriptionDepuis", () => {
  it("écarte « Music » quand elle est première, et garde les instruments", () => {
    expect(descriptionDepuis(GUITARE))
      .toBe("musical instrument, guitar, plucked string instrument, acoustic guitar, tender music");
  });

  it("GARDE « Music » quand elle n'est pas première : la règle est sur la position", () => {
    expect(descriptionDepuis(BAR)).toContain("music");
    expect(descriptionDepuis(BAR))
      .toBe("speech, conversation, inside, small room, music, dishes, pots, and pans");
  });

  it("met tout en minuscules, comme la description d'un plan", () => {
    expect(descriptionDepuis([{ etiquette: "Steel guitar, slide guitar", score: 0.1 }]))
      .toBe("steel guitar, slide guitar");
  });

  it("une liste vide rend une chaîne vide, et le plan écrira « instrumental »", () => {
    expect(descriptionDepuis([])).toBe("");
  });

  it("une seule étiquette « Music » ne laisse rien, plutôt qu'un mot inutile", () => {
    expect(descriptionDepuis([{ etiquette: "Music", score: 0.9 }])).toBe("");
  });
});

describe("tableauEtiquettes", () => {
  it("rend une ligne par étiquette, avec son score en pour cent", () => {
    expect(tableauEtiquettes(GUITARE.slice(0, 2)))
      .toBe("Music — 76.3 %\nMusical instrument — 13.8 %");
  });

  it("garde la casse d'origine : le relevé se lit, il ne se branche pas", () => {
    expect(tableauEtiquettes([{ etiquette: "Acoustic guitar", score: 0.0261 }]))
      .toBe("Acoustic guitar — 2.6 %");
  });
});
