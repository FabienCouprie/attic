// src/docs/generer-dependances-audio.test.ts — La table des dépendances ne dérive pas en silence.
//
// POURQUOI CE TEST. La table dit ce qui peut quitter le fil de l'interface, et j'y ai répondu quatre
// fois de travers en interrogeant un `grep` à sa place. Écrite une fois sans garde, elle vieillirait :
// un module qui gagne un `OfflineAudioContext` change de classe, et rien ne le dirait.
//
// DEUX GARDES, ET LA SECONDE COMPTE AUTANT QUE LA PREMIÈRE. La première refuse un fichier périmé. La
// seconde éprouve le classement lui-même sur des cas construits : un marqueur en commentaire ne
// décide de rien, un `AudioBuffer` seul est un récipient et non une dépendance. Sans elle, la table
// serait fidèle à un classement peut-être faux.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { classer, dependancesAudio, tableEnTexte } from "./dependances-audio";

const RACINE = resolve(__dirname, "../..");
const CHEMIN = resolve(RACINE, "DEPENDANCES-AUDIO.md");
const ecrire = process.env.ECRIRE_DEPENDANCES === "1";

describe("le classement", () => {
  it("un rendu est reconnu par son contexte", () => {
    expect(classer("const c = new OfflineAudioContext(2, 128, 48000);").classe).toBe("rendu");
    expect(classer("const f = ctx.createBiquadFilter();").classe).toBe("rendu");
  });

  it("UN MARQUEUR EN COMMENTAIRE NE DÉCIDE DE RIEN", () => {
    // C'est le cas qui m'a fait mentir sur `reverbes-etendues.ts` : après correction, ses deux seules
    // mentions d'`AudioBuffer` étaient dans un commentaire expliquant qu'il ne s'en servait plus.
    expect(classer("// on n'emploie plus OfflineAudioContext ici\nconst x = 1;").classe).toBe("pur");
    expect(classer("/* AudioBuffer servait de récipient */\nconst x = 1;").classe).toBe("pur");
    expect(classer("const x = 1; // AudioBuffer").classe).toBe("pur");
  });

  it("UN AudioBuffer SEUL EST UN RÉCIPIENT, et non une dépendance", () => {
    const r = classer("function f(b: AudioBuffer) { return b.getChannelData(0); }");
    expect(r.classe).toBe("recipient");
    expect(r.marqueur).toBe("AudioBuffer");
  });

  it("un module qui ne mentionne rien est pur", () => {
    expect(classer("export function f(x: Float32Array) { return x; }").classe).toBe("pur");
  });

  it("le rendu l'emporte sur le récipient : c'est la contrainte la plus forte", () => {
    expect(classer("function f(b: AudioBuffer) { new OfflineAudioContext(1, 1, 1); }").classe)
      .toBe("rendu");
  });
});

describe("la table versionnée", () => {
  it("elle est à jour", () => {
    const table = dependancesAudio(RACINE);
    const texte = tableEnTexte(table);
    if (ecrire) {
      writeFileSync(CHEMIN, texte, "utf8");
      return;
    }
    expect(existsSync(CHEMIN),
      "DEPENDANCES-AUDIO.md est absent : lancez « npm run docs:dependances »").toBe(true);
    expect(readFileSync(CHEMIN, "utf8").replace(/\r\n/g, "\n"), [
      "DEPENDANCES-AUDIO.md ne correspond plus à src/audio/.",
      "Un module a changé de classe : relisez ce que cela implique, puis lancez",
      "« npm run docs:dependances ». Ne corrigez pas le fichier à la main.",
    ].join("\n")).toBe(texte);
  });

  it("chaque module reçoit une classe, et aucune n'est inventée", () => {
    const table = dependancesAudio(RACINE);
    expect(table.length).toBeGreaterThan(150);
    for (const d of table) {
      expect(["rendu", "recipient", "pur"], d.module).toContain(d.classe);
      if (d.classe !== "pur") expect(d.marqueur, d.module).not.toBe("");
    }
  });
});
