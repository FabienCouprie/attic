// scripts/contrat-arbre.test.ts — Le contrat d'arbre refuse-t-il un arbre ouvert hors des dossiers de la session ?
//
// POURQUOI CE TEST, ET SUR UN VRAI DÉPÔT. Le contrat lit le dossier des arbres de session sous le
// checkout principal, par `git rev-parse --git-common-dir`. Un faux `git` rendant une chaîne
// préparée prouverait que mes chaînes s'accordent entre elles, et rien de plus : le dépôt est donc
// monté par `git init`, et l'arbre de la session est un vrai arbre sous `.claude/worktrees/`. Le
// contrat est lancé comme le crochet le lance : la charge en JSON sur l'entrée, le code de sortie et
// ce qu'il dit sur stderr.
//
// LE CAS QUI COMPTE LE PLUS est celui de la session qui travaille dans son propre arbre : de là,
// l'arbre d'une autre session, son voisin sous `.claude/worktrees/`, est accepté, et le voisin du
// checkout principal, le `E:\attic-p2-instantane` du 2026-11-17, est refusé.
//
// LES CHEMINS SONT FABRIQUÉS ICI, par `join`, et jamais écrits à la main dans un shell : c'est la
// leçon du contrat de retouche, dont le test a été faux deux fois pour un saut de ligne écrit au
// shell.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CONTRAT = resolve(__dirname, "contrat-arbre.mjs");
/** L'identifiant d'une session fictive, qui nomme son bac à sable. */
const SESSION = "00000000-0000-4000-8000-00000000a7b1";
const BAC_A_SABLE = join(tmpdir(), "claude", "cle-du-projet", SESSION, "scratchpad");

let bac = "";
let depot = "";
let arbreDeLaSession = "";
let dehors = "";

beforeAll(() => {
  bac = realpathSync(mkdtempSync(join(tmpdir(), "attic-arbre-")));
  depot = join(bac, "attic");
  arbreDeLaSession = join(depot, ".claude", "worktrees", "session-a");
  // LE VOISIN DU CHECKOUT PRINCIPAL : la place exacte de `E:\attic-p2-instantane` à côté de `E:\attic`.
  dehors = join(bac, "attic-p2-instantane");
  mkdirSync(depot);
  const git = (...args: string[]) => execFileSync("git", args, {
    cwd: depot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Essai", GIT_AUTHOR_EMAIL: "essai@local",
      GIT_COMMITTER_NAME: "Essai", GIT_COMMITTER_EMAIL: "essai@local",
      GIT_CONFIG_GLOBAL: join(bac, "pas-de-config"), GIT_CONFIG_SYSTEM: join(bac, "pas-de-config"),
    },
  });
  git("init", "-q", "--initial-branch=master");
  git("commit", "-q", "--allow-empty", "-m", "racine", "--no-gpg-sign");
  git("worktree", "add", "-q", "--detach", arbreDeLaSession);
});

afterAll(() => {
  try { rmSync(bac, { recursive: true, force: true }); } catch { /* le temporaire reste, sans conséquence */ }
});

/** Rend le code de sortie et ce que le contrat a dit. 0 = laissé passer, 2 = refusé. */
function juger(command: string, o: { cwd?: string; outil?: string; session?: string; env?: Record<string, string> } = {}) {
  const cwd = o.cwd ?? depot;
  const charge = JSON.stringify({ tool_name: o.outil ?? "Bash", tool_input: { command }, cwd, session_id: o.session ?? SESSION });
  try {
    execFileSync("node", [CONTRAT], {
      input: charge, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CLAUDE_PROJECT_DIR: cwd, ...o.env },
    });
    return { code: 0, dit: "" };
  } catch (e: any) {
    return { code: e.status ?? -1, dit: String(e.stderr ?? "") };
  }
}

/** Un refus, et ce que son message doit porter : le chemin, la règle, sa raison et la sortie. */
function refuse(r: { code: number; dit: string }, quoi: string) {
  expect(r.code, `${quoi} : ${r.dit}`).toBe(2);
  expect(r.dit, quoi).toMatch(/CONTRAT D'ARBRE/);
}

describe("ce que le contrat refuse", () => {
  it("LE CAS DU 2026-11-17 : un arbre ouvert à côté du checkout principal", () => {
    const r = juger(`git worktree add -b travaux/p2 ${dehors} origin/master`);
    refuse(r, "le voisin du checkout");
    expect(r.dit).toContain(dehors);
    expect(r.dit, "la règle").toMatch(/hors de ses propres dossiers/);
    expect(r.dit, "sa raison").toMatch(/approuver chaque écriture/);
    expect(r.dit, "la façon de déclarer l'exception").toMatch(/# exception-arbre: <raison>/);
    expect(r.dit, "l'exception connue").toMatch(/EBUSY/);
  });

  it("le même chemin, demandé depuis l'arbre de la session, en absolu et en relatif", () => {
    refuse(juger(`git worktree add ${dehors}`, { cwd: arbreDeLaSession }), "absolu");
    refuse(juger("git worktree add ../../../../attic-p2-instantane", { cwd: arbreDeLaSession }), "relatif");
  });

  it("un chemin qui sort de .claude/worktrees par `..`, et un voisin qui n'en a que le début du nom", () => {
    refuse(juger("git worktree add .claude/worktrees/../../dehors"), "sortie par ..");
    refuse(juger("git worktree add .claude/worktrees-voisin/x"), "worktrees-voisin");
  });

  it("un dossier temporaire qui n'est pas le bac à sable de CETTE session", () => {
    refuse(juger(`git worktree add ${join(tmpdir(), "attic-verif")}`), "temporaire quelconque");
    const autre = join(tmpdir(), "claude", "cle-du-projet", "une-autre-session", "scratchpad", "x");
    refuse(juger(`git worktree add ${autre}`), "bac à sable d'une autre session");
    refuse(juger(`git worktree add ${join(BAC_A_SABLE, "x")}`, { session: "" }), "session sans identifiant");
  });

  it("un chemin qui ne se lit pas : une substitution, une variable inconnue", () => {
    for (const ecrit of ["$(pwd)/../x", "$VARIABLE_INCONNUE_DU_CONTRAT/x", "`pwd`/x"]) {
      const r = juger(`git worktree add ${ecrit}`);
      refuse(r, ecrit);
      expect(r.dit, ecrit).toMatch(/ne se lit pas/);
    }
  });

  it("par toutes les portes du shell", () => {
    const portes = [
      `git status && git worktree add ${dehors}`,
      `GIT_TRACE=1 git worktree add ${dehors}`,
      `git -C ${bac} worktree add attic-p2-instantane`,
      `cd ${bac} && git worktree add attic-p2-instantane`,
      `git worktree add --detach --lock --reason "on la garde" ${dehors} HEAD`,
      `git worktree add -f -- ${dehors}`,
      `bash -c "git worktree add ${dehors}"`,
      `git worktree add \\\n  ${dehors}`,
      `git worktree add "${dehors}"`,
    ];
    for (const porte of portes) refuse(juger(porte), porte);
    refuse(juger(`git worktree add "${dehors}" origin/master`, { outil: "PowerShell" }), "PowerShell");
  });

  it("une exception sans raison écrite", () => {
    refuse(juger(`git worktree add ${dehors}  # exception-arbre:`), "raison vide");
  });
});

describe("ce que le contrat laisse passer", () => {
  it("un arbre sous .claude/worktrees du dépôt, depuis le checkout principal", () => {
    expect(juger("git worktree add .claude/worktrees/session-b").code).toBe(0);
    expect(juger(`git worktree add -b travaux/x ${join(depot, ".claude", "worktrees", "session-b")} origin/master`).code).toBe(0);
  });

  it("LE CAS QUI COMPTE : depuis l'arbre de la session, son voisin sous .claude/worktrees", () => {
    expect(juger("git worktree add ../session-b", { cwd: arbreDeLaSession }).code).toBe(0);
    expect(juger(`git worktree add ${join(depot, ".claude", "worktrees", "session-b")}`, { cwd: arbreDeLaSession }).code).toBe(0);
    expect(juger("cd .. && git worktree add session-c", { cwd: arbreDeLaSession }).code).toBe(0);
    // Une ligne continuée : le chemin est sur la ligne suivante, et le `\` n'en est pas un.
    expect(juger("git worktree add \\\n  ../session-d", { cwd: arbreDeLaSession }).code).toBe(0);
  });

  it("un arbre dans le bac à sable de la session, écrit en clair ou par une variable", () => {
    expect(juger(`git worktree add --detach ${join(BAC_A_SABLE, "epreuve")} HEAD`).code).toBe(0);
    const env = { BAC_DU_TEST: BAC_A_SABLE };
    expect(juger("git worktree add $BAC_DU_TEST/epreuve", { env }).code).toBe(0);
    expect(juger('git worktree add "${BAC_DU_TEST}/epreuve"', { env }).code).toBe(0);
    expect(juger("git worktree add $env:BAC_DU_TEST/epreuve", { env, outil: "PowerShell" }).code).toBe(0);
  });

  it("une exception déclarée, raison écrite : le cas de l'asar tenu par l'application", () => {
    const raison = "npm ci en EBUSY, l'asar d'Electron tenu par l'application Claude";
    expect(juger(`git worktree add --detach ${dehors} HEAD  # exception-arbre: ${raison}`).code).toBe(0);
    expect(juger(`git worktree add --detach "${dehors}" HEAD # exception-arbre: ${raison}`, { outil: "PowerShell" }).code).toBe(0);
  });

  it("une commande sans `git worktree add`, même quand elle en parle", () => {
    for (const commande of [
      "git status --short",
      "git worktree list",
      `git worktree remove ${dehors}`,
      `git commit -m "doc: git worktree add ${dehors} est refuse"`,
      `echo git worktree add ${dehors}`,
      // Un message de commit en heredoc, SANS APOSTROPHE : une première version écrivait « le contrat
      // d'arbre », dont l'apostrophe ouvrait une chaîne qui avalait la ligne suivante. Le cas restait
      // vert avec la lecture des heredocs retirée du contrat : il ne l'éprouvait pas.
      `git commit -F - <<'MSG'\nfeat: le contrat des arbres\n\ngit worktree add ${dehors}\nMSG\n`,
    ]) {
      expect(juger(commande).code, commande).toBe(0);
    }
    // La chaîne multiligne de PowerShell, AVEC UNE APOSTROPHE, pour la raison inverse : sans elle, le
    // `'` de `@'` enferme tout le corps jusqu'à `'@`, et le cas passe sans éprouver le retrait.
    const iciPS = `git commit -m @'\nfeat: le contrat d'arbre\ngit worktree add ${dehors}\n'@`;
    expect(juger(iciPS, { outil: "PowerShell" }).code).toBe(0);
  });

  it("un autre outil que Bash ou PowerShell, et une entrée qui n'est pas du JSON", () => {
    expect(juger(`git worktree add ${dehors}`, { outil: "Edit" }).code).toBe(0);
    let code = 0;
    try {
      execFileSync("node", [CONTRAT], { input: "ceci n'est pas du json", encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    } catch (e: any) {
      code = e.status ?? -1;
    }
    expect(code).toBe(0);
  });
});

// LA FORME DE GIT BASH : la session écrit `/c/Users/…` dans l'outil Bash, et git le lit `C:\Users\…`.
describe.skipIf(process.platform !== "win32")("la forme /c/… de Git Bash", () => {
  const enGitBash = (p: string) => `/${p[0].toLowerCase()}${p.slice(2).split("\\").join("/")}`;

  it("accepte le bac à sable et refuse le voisin du checkout, écrits ainsi", () => {
    expect(juger(`git worktree add ${enGitBash(join(BAC_A_SABLE, "x"))}`).code).toBe(0);
    expect(juger(`git worktree add ${enGitBash(join(depot, ".claude", "worktrees", "y"))}`).code).toBe(0);
    refuse(juger(`git worktree add ${enGitBash(dehors)}`), "voisin en forme Git Bash");
  });
});
