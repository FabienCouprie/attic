// audio/vosk-travailleur.test.ts — Le worker de Vosk sort de son blob, et reste le même worker.
//
// Relevé le 2026-10-27 par le passage du catalogue sous la politique stricte : le worker de Vosk
// construit des fonctions (embind), et un worker de blob hérite la politique du document. Ces cas
// tiennent la séparation SUR LE PAQUET INSTALLÉ : une version neuve de `vosk-browser` qui fabriquerait
// son worker autrement doit faire tomber ce cas, et non passer en silence.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FICHIER_TRAVAILLEUR_VOSK, separerTravailleurVosk } from "./vosk-travailleur";

const SOURCE = readFileSync(resolve(process.cwd(), "node_modules/vosk-browser/dist/vosk.js"), "utf8");

describe("le worker de Vosk, hors de son blob", () => {
  const separe = separerTravailleurVosk(SOURCE);

  it("LA FORME ATTENDUE EST DANS LE PAQUET INSTALLÉ", () => {
    expect(separe, "vosk-browser ne fabrique plus son worker par createBase64WorkerFactory").not.toBeNull();
  });

  it("LE MODULE NE FABRIQUE PLUS DE BLOB : il charge le fichier, contre l'adresse du document", () => {
    expect(separe!.code).not.toMatch(/var WorkerFactory = createBase64WorkerFactory\('/);
    expect(separe!.code).toContain(`new Worker(new URL(${JSON.stringify(FICHIER_TRAVAILLEUR_VOSK)}, document.baseURI), options)`);
    expect(separe!.code.length, "le base64 du worker est resté dans le module").toBeLessThan(SOURCE.length / 2);
  });

  it("LE TEXTE DU WORKER EST CELUI QUE LE BLOB PORTAIT", () => {
    // Ce que fait `createURL` : décoder en chaîne d'octets, retirer la ligne du chargeur.
    const b64 = /createBase64WorkerFactory\('([A-Za-z0-9+/=]+)'/.exec(SOURCE)![1];
    const brut = Buffer.from(b64, "base64").toString("latin1");
    expect(separe!.travailleur).toBe(brut.substring(brut.indexOf("\n", 10) + 1));
    expect(separe!.travailleur.startsWith("/* rollup-plugin-web-worker-loader */"), "la ligne du chargeur est restée").toBe(false);
  });

  it("C'EST BIEN LE CODE QUI CONSTRUIT DES FONCTIONS, d'où sa propre politique", () => {
    expect(separe!.travailleur).toContain("createNamedFunction");
    expect(separe!.travailleur).toMatch(/new_\(Function/);
  });

  it("UNE AUTRE FORME REND NULL, au lieu d'être transformée à l'aveugle", () => {
    expect(separerTravailleurVosk("var WorkerFactory = autreChose();")).toBeNull();
  });
});
