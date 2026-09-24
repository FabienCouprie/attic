// scripts/contrat-heredoc.test.ts — Le contrat de retouche refuse-t-il ce qu'il doit refuser ?
//
// POURQUOI CE TEST. Le contrat est un garde-fou, et un garde-fou muet ne garde rien. Trois pannes
// mesurées lui ont donné ses trois règles ; sans test, une expression régulière qui cesse de
// correspondre ne se signalerait par rien du tout, et l'on retomberait dans les mêmes pertes de
// temps en croyant être protégé.
//
// LES CAS SONT CONSTRUITS EN JSON PAR CE TEST, et non écrits à la main dans un shell : mes deux
// premières tentatives d'échantillon ont produit un vrai saut de ligne là où il fallait un `\n`
// littéral, et le contrat s'est tu à juste titre. C'était le test qui était faux, deux fois. La
// leçon est celle du contrat lui-même : ne pas faire passer du texte par le shell.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CONTRAT = resolve(__dirname, "contrat-heredoc.mjs");

/** Rend le code de sortie et ce que le contrat a dit. 0 = laissé passer, 2 = refusé. */
function juger(command: string, outil = "Bash"): { code: number; dit: string } {
  const charge = JSON.stringify({ tool_name: outil, tool_input: { command } });
  try {
    const dit = execFileSync("node", [CONTRAT], { input: charge, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    return { code: 0, dit };
  } catch (e: any) {
    return { code: e.status ?? -1, dit: String(e.stderr ?? "") };
  }
}

/** Un heredoc, fabriqué ici pour que ses sauts de ligne soient de vrais sauts et rien d'autre. */
const heredoc = (avant: string, corps: string[], delim = "PY") =>
  `${avant} <<${delim}\n${corps.join("\n")}\n${delim}\n`;

describe("ce que le contrat laisse passer", () => {
  it("une commande ordinaire", () => {
    expect(juger("npx tsc -b").code).toBe(0);
    expect(juger("git status --short").code).toBe(0);
  });

  it("un heredoc qui ne porte pas de code, par exemple un message de commit", () => {
    expect(juger(heredoc('git commit -F -', ["feat: quelque chose", "", "un corps de message"], "MSG")).code).toBe(0);
  });

  it("un autre outil que Bash ou PowerShell n'est pas son affaire", () => {
    expect(juger(heredoc("python -", ["import io"]), "Edit").code).toBe(0);
  });
});

describe("LES ACCENTS : python sans PYTHONUTF8 est refusé", () => {
  // Mesuré sur cette machine : `sys.stdin.encoding` vaut cp1252, et « celui-là » est détruit avant
  // toute comparaison. Aucun échappement ne corrige cela ; seul le drapeau le corrige.
  it("refuse un source envoyé dans python sans forcer l'UTF-8", () => {
    const r = juger(heredoc("python -", ["print(1)"]));
    expect(r.code).toBe(2);
    expect(r.dit).toMatch(/cp1252/);
  });

  it("accepte le drapeau, et accepte aussi -X utf8", () => {
    // Le corps ne porte pas de code, pour n'éprouver que cette règle-ci.
    expect(juger(heredoc("PYTHONUTF8=1 python -", ["print(1)"])).dit).not.toMatch(/cp1252/);
    expect(juger(heredoc("python -X utf8 -", ["print(1)"])).dit).not.toMatch(/cp1252/);
  });
});

describe("LE CODE : un source ne passe pas par le shell", () => {
  it("refuse un heredoc qui porte du code, quel que soit le langage", () => {
    for (const ligne of ["import io", "from x import y", "def f():", "class A:", "const a = 1", "function f() {}"]) {
      const r = juger(heredoc("PYTHONUTF8=1 python -", [ligne]));
      expect(r.code, ligne).toBe(2);
      expect(r.dit, ligne).toMatch(/transporte du code/);
    }
  });

  // LE CAS OBSERVÉ, et il a refusé un commit légitime : un message dont une phrase française
  // commençait par « import ». Un mot-clé en tête de ligne n'est pas une instruction.
  it("LAISSE PASSER DE LA PROSE dont une phrase commence par un mot-clé", () => {
    const message = [
      "chore: trois pieces contractualisent la fiabilite",
      "",
      "Sa premiere version cherchait un nom au lieu d'un",
      "import et signalait le socle comme orphelin.",
      "class et const sont des mots comme les autres dans une phrase.",
      "function n'est pas davantage une instruction ici.",
      "from la ligne de depart, rien ne bougeait.",
    ];
    const r = juger(heredoc("git commit -F -", message, "MSG"));
    expect(r.code, r.dit).toBe(0);
  });

  it("refuse une instruction véritable, quelle que soit la forme", () => {
    for (const ligne of [
      'import { a } from "b"',
      'import "effets-de-bord"',
      "from pathlib import Path",
      "def calculer(x):",
      "class Machine {",
      "const table = [1, 2]",
      "let n = 0",
      "function faire() {",
      "async function faire() {",
    ]) {
      const r = juger(heredoc("PYTHONUTF8=1 python -", [ligne]));
      expect(r.code, ligne).toBe(2);
      expect(r.dit, ligne).toMatch(/transporte du code/);
    }
  });

  it("refuse même quand l'UTF-8 est forcé : les deux fautes sont indépendantes", () => {
    const r = juger(heredoc("PYTHONUTF8=1 python -", ["import io", "print(1)"]));
    expect(r.code).toBe(2);
    expect(r.dit).toMatch(/transporte du code/);
    expect(r.dit).not.toMatch(/cp1252/);
  });
});

describe("LES FINS DE LIGNE : la règle suit l'état réel du dépôt", () => {
  // `\n` LITTÉRAL dans le corps du script, c'est-à-dire les deux caractères barre oblique inversée
  // et n, que Python lira comme un saut. Construit par `String.fromCharCode` pour qu'aucune couche
  // de citation ne puisse le transformer en route.
  const ANTISLASH = String.fromCharCode(92);
  const motif = () => heredoc("PYTHONUTF8=1 python -", [`s = s.replace("a${ANTISLASH}nb", "c")`]);

  // Depuis que `.gitattributes` impose `eol=lf`, l'arbre sort entièrement en LF et un motif avec un
  // saut de ligne fonctionne : la règle DOIT se taire, sans quoi elle refuserait du travail légitime.
  it("se tait quand `.gitattributes` impose eol=lf", () => {
    const attributs = readFileSync(resolve(__dirname, "..", ".gitattributes"), "utf8");
    expect(attributs, "prémisse du test").toMatch(/eol\s*=\s*lf/);
    expect(juger(motif()).dit).not.toMatch(/arbre est mixte/);
  });

  it("la règle existe et sait tirer quand l'arbre est mixte", () => {
    // Éprouvée depuis un dossier SANS `.gitattributes`, l'état où le dépôt se trouvait avant.
    const ailleurs = mkdtempSync(join(tmpdir(), "sans-attributs-"));
    const charge = JSON.stringify({ tool_name: "Bash", tool_input: { command: motif() } });
    try {
      execFileSync("node", [CONTRAT], { input: charge, encoding: "utf8", cwd: ailleurs, env: { ...process.env, CLAUDE_PROJECT_DIR: ailleurs } });
      throw new Error("la règle n'a pas tiré");
    } catch (e: any) {
      expect(e.status).toBe(2);
      expect(String(e.stderr)).toMatch(/arbre est mixte/);
    }
  });
});

describe("le contrat ne casse jamais la session", () => {
  it("une entrée qui n'est pas du JSON le laisse muet", () => {
    expect(juger.call(null, "").code).toBe(0);
    const charge = "ceci n'est pas du json";
    try {
      execFileSync("node", [CONTRAT], { input: charge, encoding: "utf8" });
    } catch (e: any) {
      expect(e.status).toBe(0);
    }
  });
});
