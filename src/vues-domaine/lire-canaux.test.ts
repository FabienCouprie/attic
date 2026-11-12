// vues-domaine/lire-canaux.test.ts — Les vues lisent les canaux sous une forme déclarée, et seulement ainsi.
//
// CE QUE CE GARDE TIENT, et c'est la pièce 5b du plan `work/plan-donnees-noeud-2026-11-11.md`.
// Vingt-trois vues lisaient `_affichage` et `_designe` sous une affirmation de type écrite pour leur
// compte, quatre en `any`, sans rien qui tienne la forme lue à la forme écrite. Chaque forme est
// désormais déclarée une fois dans `plugins/formes-des-canaux.ts`, vérifiée par l'exécuteur qui
// l'écrit, et lue par `affichageDe` ou `designeDe`.
//
// IL LIT LE CODE PAR SA FORME, commentaires et chaînes vidés : une affirmation `data as` dans une vue,
// une forme qu'aucun exécuteur n'écrit ou qu'aucune vue ne lit, une forme d'affichage lue comme une
// désignation. Les noms des formes viennent du module, et non d'une liste écrite ici.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "..");

/** Le texte sans commentaires ni contenu de chaînes, les sauts de ligne gardés. */
function code(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      const fin = src.indexOf("\n", i);
      const j = fin < 0 ? src.length : fin;
      out += " ".repeat(j - i); i = j; continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const fin = src.indexOf("*/", i + 2);
      const j = fin < 0 ? src.length : fin + 2;
      out += src.slice(i, j).replace(/[^\n]/g, " "); i = j; continue;
    }
    if (c === "\"" || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      out += c + src.slice(i + 1, j).replace(/[^\n]/g, " ") + c; i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

/** Les sources d'un dossier de `src/`, tests exclus, avec leur code. */
function sources(dossier: string): { chemin: string; code: string }[] {
  const out: { chemin: string; code: string }[] = [];
  const parcourir = (d: string) => {
    for (const n of readdirSync(d)) {
      const c = join(d, n);
      if (statSync(c).isDirectory()) { parcourir(c); continue; }
      if (!/\.tsx?$/.test(n) || /\.test\.tsx?$/.test(n)) continue;
      out.push({ chemin: relative(SRC, c).replace(/\\/g, "/"), code: code(readFileSync(c, "utf8")) });
    }
  };
  parcourir(resolve(SRC, dossier));
  return out;
}

const MODULE = "plugins/formes-des-canaux.ts";
// LES FORMES SONT DES ALIAS DE TYPE depuis le 2026-11-12 : une interface n'entre pas dans le canal,
// qui est un `Record<string, unknown>`. Le garde lit les deux écritures, pour qu'une interface
// ajoutée ici compte encore comme une forme et que le compilateur dise seul ce qui ne va pas.
const FORMES = [...code(readFileSync(resolve(SRC, MODULE), "utf8"))
  .matchAll(/\bexport\s+(?:interface\s+(\w+)|type\s+(\w+)\s*=)/g)].map((m) => m[1] ?? m[2]);
const VUES = sources("vues-domaine");
const EXECUTEURS = sources("plugins").filter((s) => s.chemin !== MODULE);

/**
 * Chaque lecture d'un canal dans les vues : le lecteur appelé et la forme qu'on lui donne.
 *
 * LE MODULE DES LECTEURS N'EN EST PAS : il les définit, et `affichageDe<Forme extends object>` y passerait
 * pour une lecture sous une forme écrite sur place. Le premier jet de ce garde l'a pris pour une faute.
 */
const LECTURES = VUES.filter((s) => s.chemin !== "vues-domaine/lire-canaux.ts")
  .flatMap((s) => [...s.code.matchAll(/\b(affichageDe|designeDe)\s*<\s*([^>]*)>/g)]
  .map((m) => ({ chemin: s.chemin, lecteur: m[1], forme: m[2].trim() })));

describe("les canaux d'un exécuteur, lus par ses vues", () => {
  it("LE MODULE DÉCLARE SES FORMES, et le garde les a lues", () => {
    expect(FORMES.length, "le garde doit lire les formes de plugins/formes-des-canaux.ts").toBeGreaterThanOrEqual(18);
  });

  it("AUCUNE VUE NE LIT PLUS UN NŒUD SOUS UNE AFFIRMATION DE TYPE", () => {
    // `data as {…}`, `(data as any)`, `d = data as …` : toutes les formes qu'avaient les trente-trois
    // lectures du 2026-11-11. La seule affirmation qui reste est dans `lire-canaux.ts`, sur le canal.
    const fautifs = VUES.flatMap((s) => s.code.split("\n")
      .map((ligne, i) => (/\bdata\s+as\b/.test(ligne) ? `${s.chemin}:${i + 1}` : null))
      .filter((x): x is string => x !== null));
    expect(fautifs, "Lisez le canal par affichageDe ou designeDe, sous une forme de plugins/formes-des-canaux.ts.").toEqual([]);
  });

  it("CHAQUE LECTURE PREND UNE FORME DÉCLARÉE, et par le bon canal", () => {
    expect(LECTURES.length, "le garde doit trouver les lectures des vues").toBeGreaterThanOrEqual(20);
    const fautives = LECTURES.filter((l) => !FORMES.includes(l.forme)
      || (l.lecteur === "affichageDe") !== l.forme.startsWith("Affichage"))
      .map((l) => `${l.chemin} : ${l.lecteur}<${l.forme}>`);
    expect(fautives, [
      "Une forme écrite sur place ne tient à rien, et une forme d'affichage lue comme une désignation lit",
      "l'autre canal : déclarez-la dans plugins/formes-des-canaux.ts, sous le nom de son canal.",
    ].join("\n")).toEqual([]);
  });

  it("CHAQUE FORME A UN EXÉCUTEUR QUI L'ÉCRIT ET UNE VUE QUI LA LIT", () => {
    const sansAuteur = FORMES.filter((f) => !EXECUTEURS.some((s) => new RegExp(String.raw`\b${f}\b`).test(s.code)));
    const sansLecteur = FORMES.filter((f) => !LECTURES.some((l) => l.forme === f));
    expect({ sansAuteur, sansLecteur }, "Une forme qu'aucun exécuteur ne vérifie, ou qu'aucune vue ne lit, ne tient plus rien.")
      .toEqual({ sansAuteur: [], sansLecteur: [] });
  });
});
