// scripts/contrat-poussee.test.ts — Le contrat de poussée voit-il les commits restés dehors ?
//
// POURQUOI CE TEST, ET SUR DE VRAIS DÉPÔTS. Ce garde-fou lit une forme d'historique, et une forme
// d'historique ne se simule pas honnêtement : les cas sont donc montés avec `git init`, un dépôt nu
// pour origine et un clone, et la fusion est une vraie fusion. Un faux `git` rendant des chaînes
// préparées aurait prouvé que mes chaînes s'accordent entre elles, et rien de plus.
//
// LE CAS QUI COMPTE LE PLUS EST CELUI QUI DOIT SE TAIRE. Repartir d'une branche neuve après une
// fusion donne, vu de loin, la même configuration que la faute : la ligne principale porte une
// fusion dont le second parent est un ancêtre de ma tête. Le premier jet du garde criait sur cet
// état, qui est l'état normal du dépôt après chaque lot. Ce cas est le défaut planté dans le garde
// lui-même.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const CONTRAT = resolve(__dirname, "contrat-poussee.mjs");
const bacs: string[] = [];

afterAll(() => {
  for (const bac of bacs) {
    try { rmSync(bac, { recursive: true, force: true }); } catch { /* le temporaire reste, sans conséquence */ }
  }
});

/** Un `git` dans un dossier donné, avec une identité à lui pour ne rien emprunter au poste. */
function git(dans: string) {
  return (...args: string[]) => execFileSync("git", args, {
    cwd: dans,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Essai", GIT_AUTHOR_EMAIL: "essai@local",
      GIT_COMMITTER_NAME: "Essai", GIT_COMMITTER_EMAIL: "essai@local",
      GIT_CONFIG_GLOBAL: join(dans, "pas-de-config"), GIT_CONFIG_SYSTEM: join(dans, "pas-de-config"),
    },
  }).trim();
}

/** Un commit vide, qui suffit : ce garde lit la forme du graphe et jamais le contenu. */
function commit(g: (...a: string[]) => string, message: string) {
  g("commit", "--allow-empty", "-m", message, "--no-gpg-sign");
  return g("rev-parse", "HEAD");
}

/** Une origine nue et son clone, la branche principale nommée `master` comme dans le dépôt. */
function monter() {
  const bac = mkdtempSync(join(tmpdir(), "attic-poussee-"));
  bacs.push(bac);
  const origine = join(bac, "origine.git");
  const clone = join(bac, "clone");
  execFileSync("git", ["init", "--bare", "--initial-branch=master", origine], { stdio: "ignore" });
  execFileSync("git", ["clone", "--quiet", origine, clone], { stdio: "ignore" });
  const g = git(clone);
  commit(g, "racine");
  g("push", "--quiet", "origin", "master");
  return { clone, g };
}

/** Rend le code de sortie et ce que le contrat a dit. 0 = rien à signaler, 2 = alerte. */
function juger(racine: string, command = "git push", outil = "Bash"): { code: number; dit: string } {
  const charge = JSON.stringify({ tool_name: outil, tool_input: { command } });
  try {
    execFileSync("node", [CONTRAT], {
      input: charge, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CLAUDE_PROJECT_DIR: racine },
    });
    return { code: 0, dit: "" };
  } catch (e: any) {
    return { code: e.status ?? -1, dit: String(e.stderr ?? "") };
  }
}

describe("la faute : la fusion a pris la branche en vol", () => {
  it("nomme les commits restés dehors, et le point où repartir", () => {
    const { clone, g } = monter();
    g("checkout", "--quiet", "-b", "travaux/essai");
    const pris = commit(g, "le premier, celui que la fusion emporte");
    const reste = commit(g, "le second, celui qui reste dehors");

    // La fusion prend la branche À SON PREMIER COMMIT, c'est-à-dire sans le second.
    g("checkout", "--quiet", "master");
    g("merge", "--quiet", "--no-ff", "--no-gpg-sign", "-m", "Merge pull request #1", pris);
    g("push", "--quiet", "origin", "master");
    g("checkout", "--quiet", "travaux/essai");

    const { code, dit } = juger(clone);
    expect(code, "la faute doit être annoncée").toBe(2);
    expect(dit).toContain("1 commit est hors de « master »");
    expect(dit, "le commit resté dehors est nommé").toContain(reste.slice(0, 7));
    expect(dit, "le point pris est nommé, pour y repartir").toContain(pris.slice(0, 7));
    expect(dit).toContain("git cherry-pick");
  });

  it("compte tous les commits qui suivent le point pris, et non le dernier seul", () => {
    const { clone, g } = monter();
    g("checkout", "--quiet", "-b", "travaux/essai");
    const pris = commit(g, "le point pris");
    commit(g, "dehors, un");
    commit(g, "dehors, deux");

    g("checkout", "--quiet", "master");
    g("merge", "--quiet", "--no-ff", "--no-gpg-sign", "-m", "Merge pull request #2", pris);
    g("push", "--quiet", "origin", "master");
    g("checkout", "--quiet", "travaux/essai");

    const { code, dit } = juger(clone);
    expect(code).toBe(2);
    expect(dit).toContain("2 commits sont hors de « master »");
  });

  it("MÊME QUAND LA RÉFÉRENCE LOCALE MENT SUR LA BASE : le distant est cru, pas elle", () => {
    // `refs/remotes/origin/HEAD` est posé une fois par `git clone` et ne bouge plus. Un clone fait
    // depuis un dépôt dont la tête était sur une branche de travail le fait pointer là, et le garde
    // mesurait alors contre cette branche — qui est la mienne, donc il se taisait. Relevé en montant
    // le banc du cas réel, où la base s'est annoncée sous un nom de branche de travail.
    const { clone, g } = monter();
    g("checkout", "--quiet", "-b", "travaux/essai");
    const pris = commit(g, "le point pris");
    const reste = commit(g, "dehors");
    g("checkout", "--quiet", "master");
    g("merge", "--quiet", "--no-ff", "--no-gpg-sign", "-m", "Merge pull request #8", pris);
    g("push", "--quiet", "origin", "master");
    g("checkout", "--quiet", "travaux/essai");

    // La branche est poussée, donc `origin/travaux/essai` vaut ma tête exacte : prise pour base,
    // elle contient tout ce que j'ai, et le garde n'aurait rien à dire.
    g("push", "--quiet", "origin", "travaux/essai");
    // `symbolic-ref` ET NON `update-ref` : le second poserait une référence ordinaire sur le même
    // objet, que `symbolic-ref --short` refuse de lire, de sorte que le garde retomberait sur
    // « master » et que ce cas passerait défaut planté. Il l'a fait, à la première écriture.
    g("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/travaux/essai");

    const { code, dit } = juger(clone);
    expect(code, "la base est celle que le distant annonce, et elle n'a pas ce commit").toBe(2);
    expect(dit).toContain("hors de « master »");
    expect(dit).toContain(reste.slice(0, 7));
  });

  it("et un commit ajouté après une fusion qui avait tout pris est dehors aussi", () => {
    // LA RÈGLE DE LA BRANCHE NEUVE, tenue par la même condition : la pull request est close, donc
    // ce commit n'est dans aucune.
    const { clone, g } = monter();
    g("checkout", "--quiet", "-b", "travaux/essai");
    const tout = commit(g, "le lot entier");

    g("checkout", "--quiet", "master");
    g("merge", "--quiet", "--no-ff", "--no-gpg-sign", "-m", "Merge pull request #3", tout);
    g("push", "--quiet", "origin", "master");

    g("checkout", "--quiet", "travaux/essai");
    const apres = commit(g, "un commit de trop sur une branche fusionnée");

    const { code, dit } = juger(clone);
    expect(code).toBe(2);
    expect(dit).toContain(apres.slice(0, 7));
  });
});

describe("ce que le contrat doit laisser passer", () => {
  it("UNE BRANCHE NEUVE REPARTIE D'UNE BASE FUSIONNÉE — le défaut planté dans le garde", () => {
    const { clone, g } = monter();
    g("checkout", "--quiet", "-b", "travaux/premier");
    const lot = commit(g, "le premier lot");
    g("checkout", "--quiet", "master");
    g("merge", "--quiet", "--no-ff", "--no-gpg-sign", "-m", "Merge pull request #4", lot);
    g("push", "--quiet", "origin", "master");

    // La façon de faire du dépôt : branche neuve sur la base à jour.
    g("checkout", "--quiet", "-b", "travaux/second");
    commit(g, "le lot suivant, dans les règles");

    const { code, dit } = juger(clone);
    expect(code, `rien n'est dehors ici, et le garde a dit : ${dit}`).toBe(0);
  });

  it("une branche ouverte dont rien n'a encore été fusionné", () => {
    const { clone, g } = monter();
    g("checkout", "--quiet", "-b", "travaux/essai");
    commit(g, "un lot en cours");
    expect(juger(clone).code).toBe(0);
  });

  it("une fusion qui a pris la tête exacte", () => {
    const { clone, g } = monter();
    g("checkout", "--quiet", "-b", "travaux/essai");
    const tete = commit(g, "le lot entier");
    g("checkout", "--quiet", "master");
    g("merge", "--quiet", "--no-ff", "--no-gpg-sign", "-m", "Merge pull request #5", tete);
    g("push", "--quiet", "origin", "master");
    g("checkout", "--quiet", "travaux/essai");
    expect(juger(clone).code).toBe(0);
  });

  it("la fusion du lot de quelqu'un d'autre, pendant que ma branche avance", () => {
    const { clone, g } = monter();
    g("checkout", "--quiet", "-b", "travaux/autre");
    const autre = commit(g, "le lot d'un autre");
    g("checkout", "--quiet", "master");
    g("merge", "--quiet", "--no-ff", "--no-gpg-sign", "-m", "Merge pull request #6", autre);
    g("push", "--quiet", "origin", "master");

    g("checkout", "--quiet", "-b", "travaux/moi", "master~1");
    commit(g, "mon lot, parti d'avant la fusion");

    const { code, dit } = juger(clone);
    expect(code, `la fusion n'est pas la mienne, et le garde a dit : ${dit}`).toBe(0);
  });

  it("une commande qui ne pousse pas n'est pas son affaire, même en pleine faute", () => {
    const { clone, g } = monter();
    g("checkout", "--quiet", "-b", "travaux/essai");
    const pris = commit(g, "le point pris");
    commit(g, "dehors");
    g("checkout", "--quiet", "master");
    g("merge", "--quiet", "--no-ff", "--no-gpg-sign", "-m", "Merge pull request #7", pris);
    g("push", "--quiet", "origin", "master");
    g("checkout", "--quiet", "travaux/essai");

    expect(juger(clone, "git status --short").code, "la faute est là, mais on ne vient pas de pousser").toBe(0);
    expect(juger(clone, "npx vitest run").code).toBe(0);
    expect(juger(clone, "git push", "Edit").code, "un autre outil n'est pas son affaire").toBe(0);
  });
});
