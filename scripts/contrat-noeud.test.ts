// scripts/contrat-noeud.test.ts — Le contrat de composant lit-il les classes de champs là où elles sont ?
//
// LE DÉFAUT QUE CE FICHIER GARDE FERMÉ, mesuré le 2026-11-01. Le script lisait les trois classes
// dans `useExecutionGraphe.ts` par un littéral `new Set([…])` ; elles en étaient parties le
// 2026-10-31 pour `core/classes-de-champs.ts`, où `CHAMPS_UTILISATEUR` n'est même plus un littéral.
// Les trois ensembles étaient vides, et la règle 1 comparait chaque écriture sur un nœud à rien :
// un champ d'une classe connue y passait pour un champ sans classe, et l'inverse ne se voyait pas
// davantage. Aucun plugin n'écrivant plus sur `data` ce jour-là, rien ne l'a dit.
//
// DEUX CAS. Le premier lit les classes dans le dépôt tel qu'il est, et exige d'y trouver des noms
// des deux côtés. Le second monte un dépôt temporaire avec un plugin qui écrit deux champs, l'un
// d'une classe connue et l'autre inventé, lance le script tel que le crochet le lance, et exige que
// seul l'inventé soit relevé : sous l'ancienne lecture, les deux l'étaient.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { classes } from "./contrat-noeud.mjs";

const RACINE = resolve(__dirname, "..");
const CONTRAT = resolve(__dirname, "contrat-noeud.mjs");
const bacs: string[] = [];
afterAll(() => {
  for (const bac of bacs) {
    try { rmSync(bac, { recursive: true, force: true }); } catch { /* le temporaire reste, sans conséquence */ }
  }
});

describe("les classes de champs que le contrat de composant connaît", () => {
  it("sont lues dans core/saisies.ts et core/classes-de-champs.ts, et ne sont pas vides", () => {
    const connues = classes(RACINE);
    // Une saisie universelle, un média, un champ de saisie d'un genre, et trois dépôts d'exécution.
    for (const nom of ["parametres", "zonesSelectionnees", "audioFichier", "sequenceNotes",
      "audioResultatUrl", "apercuCourbe", "ecartNiveau"]) {
      expect(connues.has(nom), `${nom} doit être une classe connue`).toBe(true);
    }
    expect(connues.size, "les deux classes réunies dépassent vingt noms").toBeGreaterThan(20);
    // Et un nom cité dans un commentaire de la source n'en fait pas une classe.
    expect(connues.has("_grapheExport")).toBe(false);
  });

  it("DISTINGUENT UN CHAMP CONNU D'UN CHAMP INVENTÉ dans le balayage d'un plugin modifié", () => {
    const bac = mkdtempSync(join(tmpdir(), "contrat-noeud-"));
    bacs.push(bac);
    mkdirSync(join(bac, "src", "core"), { recursive: true });
    mkdirSync(join(bac, "src", "plugins"), { recursive: true });
    cpSync(join(RACINE, "src", "core", "saisies.ts"), join(bac, "src", "core", "saisies.ts"));
    cpSync(join(RACINE, "src", "core", "classes-de-champs.ts"), join(bac, "src", "core", "classes-de-champs.ts"));
    // Un plugin neuf, non suivi, qui écrit un champ de résultat (classe connue) et un champ inventé.
    writeFileSync(join(bac, "src", "plugins", "plante.ts"), [
      "export const fiches = [{ id: \"plante\", nom: \"Planté\", parametres: [{ nom: \"Gain\" }],",
      "  executer(ctx: any) { ctx.noeud.data.apercuCourbe = 1; ctx.noeud.data.zorg = 2; return { valeurs: [null] }; } }];",
      "const Gain = 1; void Gain;",
      "",
    ].join("\n"));
    const git = (...args: string[]) => execFileSync("git", args, {
      cwd: bac, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_CONFIG_GLOBAL: join(bac, "pas-de-config"), GIT_CONFIG_SYSTEM: join(bac, "pas-de-config") },
    });
    git("init", "-q");

    let sortie = "";
    let code = 0;
    try {
      execFileSync("node", [CONTRAT], {
        cwd: bac, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, CLAUDE_PROJECT_DIR: bac },
      });
    } catch (e: any) {
      code = e.status;
      sortie = String(e.stderr ?? "");
    }
    expect(code, "un plugin modifié fait parler le contrat").toBe(2);
    expect(sortie, "le champ inventé est relevé").toContain("data.zorg");
    expect(sortie, "le champ d'une classe connue ne l'est pas").not.toContain("data.apercuCourbe");
  });
});
