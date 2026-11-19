// plugins/soundfontGlobal.test.ts — Le SoundFont du démarrage : le choix de l'utilisateur d'abord.
//
// LE DÉFAUT, jusqu'au 2026-11-19 : FluidR3, que l'installeur porte toujours, était cherché en
// premier, et un utilisateur qui avait chargé un autre SoundFont le retrouvait à chaque démarrage.
// Seul le nom du fichier était retenu, si bien qu'un fichier pris hors du dossier `sf2/` n'était
// jamais retrouvé. Les cas du chemin et du nom tombent tous deux sur l'ordre d'avant.
//
// CE QUI N'EST PAS ICI : l'analyse du fichier, éprouvée par `audio/soundfont.test.ts`. Elle est
// remplacée par une structure vide, et seule l'en-tête RIFF/sfbk que ce module vérifie est écrite.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../audio/soundfont", () => ({
  analyserSF2: () => ({ presets: [], instruments: [], echantillons: [] }),
}));

import { autoChargerSF2, retenirChoixSF2, sf2Nom, sourcesDuDemarrage } from "./soundfontGlobal";

/** Les octets d'une banque que ce module accepte : « RIFF », la taille, « sfbk », et assez de long. */
function banque(): Uint8Array {
  const b = new Uint8Array(2048);
  b.set([82, 73, 70, 70], 0);
  b.set([115, 102, 98, 107], 8);
  return b;
}

/** Ce que `fichier:lire-binaire` sait lire : les chemins relatifs des ressources, et des absolus. */
function poserLeDisque(chemins: string[]): void {
  const disque = new Map(chemins.map((c) => [c, banque()]));
  vi.stubGlobal("window", {
    api: {
      lireBinaire: async (chemin: string) => {
        const donnees = disque.get(chemin);
        return donnees ? { donnees, nom: chemin.split("/").pop()! } : null;
      },
    },
  });
}

const LIVRE = "./sf2/FluidR3_GM.sf2";

beforeEach(() => {
  const magasin = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => magasin.get(k) ?? null,
    setItem: (k: string, v: string) => { magasin.set(k, v); },
    removeItem: (k: string) => { magasin.delete(k); },
  });
  vi.stubGlobal("fetch", async () => ({ ok: false }));
  (globalThis as { __attic_sf2__?: unknown }).__attic_sf2__ = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
  (globalThis as { __attic_sf2__?: unknown }).__attic_sf2__ = null;
});

describe("le SoundFont du démarrage", () => {
  it("SANS CHOIX, LA BANQUE LIVRÉE est chargée, comme avant", async () => {
    poserLeDisque([LIVRE]);
    expect(await autoChargerSF2()).not.toBeNull();
    expect(sf2Nom()).toBe("FluidR3_GM.sf2");
  });

  it("LE FICHIER CHOISI, RETROUVÉ PAR SON CHEMIN, PASSE AVANT LA BANQUE LIVRÉE", async () => {
    poserLeDisque([LIVRE, "D:/banques/Autre.sf2"]);
    retenirChoixSF2("Autre.sf2", "D:/banques/Autre.sf2");
    await autoChargerSF2();
    expect(sf2Nom()).toBe("Autre.sf2");
  });

  it("UN CHOIX RETENU PAR SON SEUL NOM, dans le dossier sf2/, passe aussi avant", async () => {
    poserLeDisque([LIVRE, "./sf2/Autre.sf2"]);
    retenirChoixSF2("Autre.sf2", "");
    await autoChargerSF2();
    expect(sf2Nom()).toBe("Autre.sf2");
  });

  it("UN FICHIER CHOISI QUI A DISPARU laisse la banque livrée, sans lever", async () => {
    poserLeDisque([LIVRE]);
    retenirChoixSF2("Autre.sf2", "D:/banques/Autre.sf2");
    expect(await autoChargerSF2()).not.toBeNull();
    expect(sf2Nom()).toBe("FluidR3_GM.sf2");
  });

  it("UN NOUVEAU CHOIX SANS CHEMIN EFFACE L'ANCIEN CHEMIN, qui sinon passerait devant lui", async () => {
    poserLeDisque([LIVRE, "D:/banques/Ancienne.sf2", "./sf2/Nouvelle.sf2"]);
    retenirChoixSF2("Ancienne.sf2", "D:/banques/Ancienne.sf2");
    retenirChoixSF2("Nouvelle.sf2", "");
    await autoChargerSF2();
    expect(sf2Nom()).toBe("Nouvelle.sf2");
  });

  it("L'ORDRE : le chemin, le nom, puis les deux noms de la banque livrée", () => {
    expect(sourcesDuDemarrage({ nom: "A.sf2", chemin: "D:/A.sf2" })).toEqual([
      { genre: "chemin", chemin: "D:/A.sf2" },
      { genre: "nom", nom: "A.sf2" },
      { genre: "livre", nom: "FluidR3_GM.sf2" },
      { genre: "livre", nom: "FluidR3_GM_GS.sf2" },
    ]);
    expect(sourcesDuDemarrage({ nom: null, chemin: null }).map((s) => s.genre)).toEqual(["livre", "livre"]);
  });
});
