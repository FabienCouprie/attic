// electron/scripts-autorises.test.ts — Quel script Python ou Julia a le droit de s'executer.
//
// ═══ LE DEFAUT, RELEVE PAR UNE REVUE LE 2026-10-27 ═══
//
// « Un projet recu ne peut plus executer de code que par un script Python ou Julia. Ce script
// s'execute au premier Lancer, sans confirmation, avec tous les droits de l'utilisateur. »
//
// CES CAS TIENNENT LA LISTE ET LE BRANCHEMENT. La boite native elle-meme ne se clique pas sous Node ;
// ce qui peut se tromper ici est ce qu'elle laisse passer sans etre posee.
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createHash } from "crypto";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const S = require("./scripts-autorises.cjs");

let fichier = "";
beforeEach(() => {
  fichier = join(mkdtempSync(join(tmpdir(), "attic-scripts-")), "scripts-autorises.json");
  S.memoriserLesScripts(fichier);
});

describe("la liste des scripts autorises", () => {
  it("UN SCRIPT INCONNU N'EST PAS AUTORISE, et c'est ce qui fait poser la question", () => {
    expect(S.scriptAutorise("print('bonjour')")).toBe(false);
  });

  it("L'AUTORISATION PORTE SUR LE CONTENU : un caractere change la retire", () => {
    S.autoriserScript("print('bonjour')");
    expect(S.scriptAutorise("print('bonjour')")).toBe(true);
    expect(S.scriptAutorise("print('bonjour') ")).toBe(false);
  });

  it("L'EMPREINTE EST LE SHA-256 DU SCRIPT", () => {
    const h = createHash("sha256").update("x = 1", "utf8").digest("hex");
    expect(S.empreinteDuScript("x = 1")).toBe(h);
    expect(S.autoriserScript("x = 1")).toBe(h);
  });

  it("SURVIT A UN REDEMARRAGE : la liste se relit du fichier ecrit", () => {
    S.autoriserScript("import os");
    expect(existsSync(fichier)).toBe(true);
    S.memoriserLesScripts(null);
    expect(S.scriptAutorise("import os"), "la liste n'a pas ete videe : le cas ne prouverait rien").toBe(false);
    S.memoriserLesScripts(fichier);
    expect(S.scriptAutorise("import os")).toBe(true);
  });

  it("UN FICHIER EDITE A LA MAIN NE DECLARE QUE DES EMPREINTES : un texte quelconque est ignore", () => {
    writeFileSync(fichier, JSON.stringify(["print('pas une empreinte')", "a".repeat(64), "z".repeat(64)]));
    expect(S.memoriserLesScripts(fichier), "seule la forme hexadecimale de 64 caracteres passe").toBe(1);
  });

  it("EST BORNEE : au-dela du plafond, la plus ancienne tombe", () => {
    S.autoriserScript("le plus ancien");
    for (let i = 0; i < S.EMPREINTES_GARDEES; i++) S.autoriserScript(`script ${i}`);
    expect(S.scriptAutorise("le plus ancien")).toBe(false);
    expect(S.scriptAutorise(`script ${S.EMPREINTES_GARDEES - 1}`)).toBe(true);
    expect(JSON.parse(readFileSync(fichier, "utf8"))).toHaveLength(S.EMPREINTES_GARDEES);
  });
});

describe("la question posee avant un script inconnu", () => {
  it("MONTRE LE SCRIPT, son nombre de lignes et son empreinte entiere", () => {
    const code = "import os\nos.remove('x')";
    const q = S.questionPourScript("python", code, false);
    expect(q.detail).toContain("os.remove('x')");
    expect(q.detail).toContain("2 ligne(s)");
    expect(q.detail).toContain(S.empreinteDuScript(code));
    expect(q.boutons, "Annuler doit etre le second bouton, celui par defaut").toEqual(["Exécuter", "Annuler"]);
  });

  it("DIT CE QU'UN SCRIPT PEUT FAIRE, sans l'adoucir", () => {
    expect(S.questionPourScript("julia", "x", false).detail).toContain("supprimer vos fichiers");
    expect(S.questionPourScript("julia", "x", true).detail).toContain("delete your files");
  });

  it("UN SCRIPT LONG EST TRONQUE, ET LE DIT", () => {
    const code = Array.from({ length: S.LIGNES_MONTREES + 5 }, (_, i) => `ligne_${i} = ${i}`).join("\n");
    const q = S.questionPourScript("python", code, false);
    expect(q.detail).toContain(`ligne_${S.LIGNES_MONTREES - 1}`);
    expect(q.detail).not.toContain(`ligne_${S.LIGNES_MONTREES} `);
    expect(q.detail).toContain("5 ligne(s) de plus");
  });
});

describe("le branchement dans le processus principal", () => {
  const main = readFileSync(new URL("main.cjs", import.meta.url), "utf8");

  for (const langage of ["python", "julia"]) {
    it(`« ${langage}:executer » DEMANDE L'AUTORISATION AVANT D'ECRIRE LE SCRIPT`, () => {
      const debut = main.indexOf(`ipcMain.handle("${langage}:executer"`);
      expect(debut, "gestionnaire introuvable").toBeGreaterThan(-1);
      const corps = main.slice(debut, debut + 2500);
      const autorisation = corps.indexOf(`autorisationDuScript(event, "${langage}"`);
      const ecriture = corps.indexOf("fs.writeFileSync(scriptPath");
      expect(autorisation, "le gestionnaire ne demande plus l'autorisation").toBeGreaterThan(-1);
      expect(ecriture, "le gestionnaire n'ecrit plus son script : le cas doit etre revu").toBeGreaterThan(-1);
      expect(autorisation, "le script est ecrit avant d'avoir ete autorise").toBeLessThan(ecriture);
    });
  }

  it("LA LISTE SE RELIT AU DEMARRAGE, sous userData", () => {
    expect(main).toMatch(/memoriserLesScripts\(path\.join\(app\.getPath\("userData"\), "scripts-autorises\.json"\)\)/);
  });
});
