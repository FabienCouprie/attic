// scripts/gitignore-exceptions.test.ts — Une exception écrite dans `.gitignore` doit vraiment
// réinclure son fichier.
//
// ÉCRIT D'UNE PERTE, le 2026-10-21. `.gitignore` portait `build/` puis `!build/installer.nsh`, avec
// le commentaire « the custom NSIS installer script is source, not output ». L'intention était
// claire, et la règle était MORTE : git ne descend pas dans un dossier exclu, donc une négation qui
// nomme un fichier à l'intérieur n'est jamais consultée. Mesuré :
//
//   git check-ignore -v --no-index build/installer.nsh
//   .gitignore:125:build/   build/installer.nsh
//
// C'est `build/` qui gagnait, et depuis le jour où l'exception avait été écrite.
//
// CE QUE CELA A COÛTÉ. Le fichier est SUIVI, donc `git status` le montrait bien modifié — mais
// `git add build/installer.nsh` était REFUSÉ et réclamait `-f`. Pendant un découpage de commits, un
// `git checkout --` sur ce chemin a emporté le travail de passage de l'installeur en par-utilisateur,
// et rien ne l'a dit : un fichier qu'on ne peut pas indexer par la voie ordinaire ne laisse aucune
// trace quand ses modifications disparaissent. Le contenu a été retrouvé parmi les objets
// inaccessibles ; il aurait pu ne pas l'être.
//
// POURQUOI `--no-index` EST OBLIGATOIRE ICI, et c'est le piège qui rendrait ce garde vide sans lui.
// Sans ce drapeau, `git check-ignore` tient tout chemin PRÉSENT DANS L'INDEX pour non ignoré, quelles
// que soient les règles : interrogé sur `build/installer.nsh`, il répondait « non ignoré » alors que
// `git add` le refusait. Un garde écrit sans `--no-index` serait passé au vert sur la règle morte.
//
// CE GARDE CHERCHE UNE FORME, JAMAIS UN NOM. Il ne sait rien de `build/` ni de l'installeur : il lit
// les exceptions que `.gitignore` déclare, quelles qu'elles soient, et demande à git si chacune est
// effective. Une exception ajoutée demain sous un dossier exclu tombera de la même façon.
import { describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Les chemins que `.gitignore` prétend réinclure, avec leur numéro de ligne. */
function exceptionsDeclarees(): { ligne: number; motif: string }[] {
  const texte = readFileSync(resolve(RACINE, ".gitignore"), "utf8");
  return texte.split(/\r?\n/).flatMap((brute, i) => {
    const l = brute.trim();
    if (!l.startsWith("!")) return [];
    return [{ ligne: i + 1, motif: l.slice(1) }];
  });
}

/** `true` si git tient ce chemin pour exclu, l'index mis hors jeu. */
function estIgnore(chemin: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", "--no-index", "--", chemin],
      { cwd: RACINE, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** La règle qui l'emporte sur ce chemin, telle que git la nomme. */
function regleQuiGagne(chemin: string): string {
  try {
    return execFileSync("git", ["check-ignore", "-v", "--no-index", "--", chemin],
      { cwd: RACINE, encoding: "utf8" }).trim();
  } catch {
    return "(aucune)";
  }
}

const exceptions = exceptionsDeclarees();

describe("les exceptions de .gitignore", () => {
  it("le fichier en déclare, sans quoi ce garde ne regarderait rien", () => {
    expect(exceptions.length).toBeGreaterThan(0);
  });

  // UN MOTIF QUE CE GARDE NE SAIT PAS ÉPROUVER DOIT LE DIRE, et non passer en silence.
  // `check-ignore` demande un chemin, pas un glob : une exception écrite avec `*` ou `?` sortirait
  // du domaine de ce cas, et mieux vaut l'apprendre en lisant un échec qu'en perdant un fichier.
  it("chaque exception est un chemin, non un motif à joker", () => {
    const jokers = exceptions.filter((e) => /[*?[\]]/.test(e.motif));
    expect(jokers.map((e) => `.gitignore:${e.ligne}: !${e.motif}`), [
      "Ces exceptions emploient un joker, que ce garde ne sait pas éprouver : « git check-ignore »",
      "attend un chemin. Les écrire en chemins, ou étendre ce garde avant de les ajouter.",
    ].join("\n")).toEqual([]);
  });

  it("CHAQUE EXCEPTION EST EFFECTIVE : son chemin n'est pas ignoré", () => {
    const mortes = exceptions.filter((e) => estIgnore(e.motif));
    expect(mortes.map((e) => `.gitignore:${e.ligne}: !${e.motif} — ${regleQuiGagne(e.motif)}`), [
      "Ces exceptions sont SANS EFFET : git tient toujours leur chemin pour exclu, et la règle qui",
      "gagne est nommée à droite. La cause habituelle est un DOSSIER parent exclu — git n'y descend",
      "pas, donc la négation n'est jamais consultée. Le remède est d'exclure le CONTENU du dossier",
      "plutôt que le dossier : « dossier/* » au lieu de « dossier/ ».",
      "",
      "Ce n'est pas une affaire de cosmétique. Un fichier suivi dont l'exception est morte se",
      "montre bien dans « git status », mais « git add » le REFUSE et réclame « -f » : ses",
      "modifications peuvent alors disparaître sans laisser de trace.",
    ].join("\n")).toEqual([]);
  });
});
