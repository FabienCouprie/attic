// electron/frontiere-des-modules.test.ts — Ce qu'un module `ipc-*.cjs` garde pour lui, `main.cjs` ne le lit pas.
//
// POURQUOI CE GARDE EXISTE. Le lot 5 de la revue d'architecture du 2026-10-31 sort de `main.cjs`,
// une famille de canaux à la fois, des blocs qui s'appelaient par leurs noms. Un nom parti dans un
// module que `main.cjs` lit encore ne fait aucune erreur au chargement : `node --check` le laisse
// passer, `oxlint` aussi, qui n'a pas `no-undef`, et aucun cas ne l'exerce. Il lève une
// `ReferenceError` le jour où le gestionnaire qui le lit passe par cette ligne. Relevé le
// 2026-11-08 en sortant les modèles (PR 319), sur une faute plantée : deux moteurs lisaient
// `annulationModeles`, partie dans `ipc-modeles.cjs`, et y revenir restait vert partout.
//
// LA PREMIÈRE RÈGLE : un nom qu'un module `ipc-*.cjs` déclare n'est lu par `main.cjs` que si
// `main.cjs` le déclare lui-même, ce qu'il fait en recevant ce que la fonction d'installation rend.
// LA SECONDE : ce qu'elle rend n'est pas une variable qu'elle réaffecte. Rendue par valeur, elle se
// figerait au moment de l'appel, et `main.cjs` lirait pour toujours sa valeur du chargement.
//
// LE GARDE CHERCHE UNE FORME, JAMAIS UN NOM : les modules qui restent à sortir sont couverts sans
// qu'on y touche. Les noms qu'un module tient d'un `require` n'en sont pas : les lire sans les
// importer est une faute de `main.cjs` seul, que la frontière n'explique pas.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";

const dossier = new URL(".", import.meta.url);
const lire = (nom: string) => readFileSync(new URL(nom, dossier), "utf8");

/** Le texte sans commentaires ni chaînes simples : un nom cité en prose n'est pas une lecture. */
const code = (texte: string) => texte
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "")
  .replace(/(\s)\/\/.*$/gm, "$1")
  .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** Les noms d'une liste déstructurée : `a, b: c, ...d` donne `a`, `c` et `d`. */
const deListe = (liste: string) => liste.split(",")
  .map((morceau) => morceau.split(":").pop()!.split("=")[0].replace("...", "").trim())
  .filter((nom) => IDENT.test(nom));

/**
 * Ce qu'un module déclare au niveau du module ou de sa fonction d'installation, deux crans au plus,
 * avec sa sorte. Plus profond, c'est le local d'un gestionnaire, que personne d'autre ne voit.
 */
function declarationsDuModule(texte: string) {
  const noms = new Map<string, "fonction" | "const" | "variable">();
  for (const m of texte.matchAll(/^(?: {2})?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm)) {
    noms.set(m[1], "fonction");
  }
  for (const m of texte.matchAll(/^(?: {2})?(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=(?!\s*require\()/gm)) {
    noms.set(m[2], m[1] === "const" ? "const" : "variable");
  }
  for (const m of texte.matchAll(/^(?: {2})?(const|let|var)\s*\{([^}]*)\}\s*=(?!\s*require\()/gm)) {
    for (const nom of deListe(m[2])) noms.set(nom, m[1] === "const" ? "const" : "variable");
  }
  return noms;
}

/** Tout ce que `main.cjs` lie lui-même, à n'importe quelle profondeur : déclarations et paramètres. */
function liesParLePrincipal(texte: string) {
  const noms = new Set<string>();
  for (const m of texte.matchAll(/\b(?:const|let|var|function\s*\*?|class)\s+([A-Za-z_$][\w$]*)/g)) noms.add(m[1]);
  for (const m of texte.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}/g)) deListe(m[1]).forEach((n) => noms.add(n));
  for (const m of texte.matchAll(/\(([^()]*)\)\s*=>|\bfunction\s*\*?\s*[\w$]*\s*\(([^()]*)\)|\bcatch\s*\(([^()]*)\)/g)) {
    deListe((m[1] ?? m[2] ?? m[3]).replace(/[{}[\]]/g, ",")).forEach((n) => noms.add(n));
  }
  for (const m of texte.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*=>/g)) noms.add(m[1]);
  return noms;
}

const lu = (texte: string, nom: string) =>
  new RegExp(`(?<![\\w$.])${nom.replace(/\$/g, "\\$")}(?![\\w$])`).test(texte);

const MODULES = readdirSync(dossier).filter((f) => /^ipc-.+\.cjs$/.test(f)).sort();
const principal = code(lire("main.cjs"));
const liesIci = liesParLePrincipal(principal);

describe("la frontière entre `main.cjs` et ses modules `ipc-*.cjs`", () => {
  it("voit les modules, et au moins un nom rendu que `main.cjs` reçoit", () => {
    expect(MODULES.length, "moins de quatre modules `ipc-*.cjs` : ce garde ne lit plus ce qui est sorti").toBeGreaterThanOrEqual(4);
    const recus = MODULES.flatMap((f) => [...declarationsDuModule(code(lire(f))).keys()])
      .filter((nom) => liesIci.has(nom) && lu(principal, nom));
    expect(recus.length, "aucun nom d'un module n'est reçu par `main.cjs` : le garde ne voit plus la frontière")
      .toBeGreaterThan(0);
  });

  for (const fichier of MODULES) {
    it(`\`main.cjs\` ne lit de \`${fichier}\` que ce qu'il en reçoit`, () => {
      const declares = declarationsDuModule(code(lire(fichier)));
      expect(declares.size, `${fichier} ne déclare rien que ce garde voie`).toBeGreaterThan(0);
      const fautes = [...declares.keys()].filter((nom) => lu(principal, nom) && !liesIci.has(nom));
      expect(fautes, `\`main.cjs\` lit ces noms de ${fichier} sans les recevoir ; ils y lèveraient une ReferenceError`)
        .toEqual([]);
    });

    it(`\`${fichier}\` ne rend aucune variable qu'il réaffecte`, () => {
      const texte = code(lire(fichier));
      const declares = declarationsDuModule(texte);
      const rendus = [...texte.matchAll(/^ {2}return\s*\{([^}]*)\};/gm)].flatMap((m) => deListe(m[1]));
      const figes = rendus.filter((nom) => declares.get(nom) === "variable");
      expect(figes, `${fichier} rend une variable par valeur : \`main.cjs\` n'en verrait que la valeur de l'appel`)
        .toEqual([]);
    });
  }
});
