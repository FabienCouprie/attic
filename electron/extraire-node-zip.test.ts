// electron/extraire-node-zip.test.ts — L'import d'un node .zip, et sa
// protection contre le Zip Slip.
//
// Ce code n'avait aucun test parce qu'il vivait dans main.cjs, donc dans le
// process principal d'Electron. C'est exactement là qu'un défaut a pu survivre :
// la boucle écrivait vers `resolvedTargetPath`, une variable jamais déclarée.
// La ReferenceError était avalée par le try/catch du gestionnaire IPC, qui
// rendait `{ ok: false, erreur: "resolvedTargetPath is not defined" }` — une
// fonctionnalité documentée dans le README qui ne pouvait pas marcher.
//
// Le second sujet est plus grave que le premier : un `.zip` de nœud est un
// fichier qu'on reçoit de quelqu'un d'autre. Une entrée nommée « ../../x »
// écrirait hors du dossier d'installation. Le garde-fou existait ; il n'avait
// jamais été vérifié.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { extraireEntrees } = require_("./extraire-node-zip.cjs");

/** Fausse entrée adm-zip : l'API réellement utilisée se réduit à ceci. */
function entree(entryName: string, contenu: string, isDirectory = false) {
  return { entryName, isDirectory, getData: () => Buffer.from(contenu, "utf-8") };
}

let racine: string;
let nodesDir: string;

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), "attic-zip-"));
  nodesDir = join(racine, "nodes", "mon-noeud");
  require_("node:fs").mkdirSync(nodesDir, { recursive: true });
});
afterEach(() => rmSync(racine, { recursive: true, force: true }));

describe("extraction d'un node .zip", () => {
  it("écrit les fichiers sur le disque", () => {
    // Le défaut d'origine : cette écriture levait une ReferenceError, et rien
    // n'arrivait jamais dans le dossier.
    extraireEntrees([
      entree("manifest.json", '{"id":"mon-noeud","nom":"Mon nœud"}'),
      entree("executer.js", "export default () => {};"),
    ], nodesDir);

    expect(existsSync(join(nodesDir, "manifest.json"))).toBe(true);
    expect(existsSync(join(nodesDir, "executer.js"))).toBe(true);
    expect(readFileSync(join(nodesDir, "executer.js"), "utf-8")).toBe("export default () => {};");
  });

  it("rend le contenu des fichiers texte attendus", () => {
    const { fichiers } = extraireEntrees([
      entree("manifest.json", '{"id":"x"}'),
      entree("notice.json", '{"fr":"…"}'),
      entree("assets/son.wav", "binaire"),
    ], nodesDir);

    expect(Object.keys(fichiers).sort()).toEqual(["manifest.json", "notice.json"]);
    expect(fichiers["manifest.json"]).toBe('{"id":"x"}');
  });

  it("crée les sous-dossiers d'une entrée imbriquée", () => {
    extraireEntrees([entree("assets/sons/a.wav", "x")], nodesDir);
    expect(existsSync(join(nodesDir, "assets", "sons", "a.wav"))).toBe(true);
  });

  it("ignore les entrées de type dossier", () => {
    extraireEntrees([entree("assets/", "", true), entree("manifest.json", "{}")], nodesDir);
    expect(readdirSync(nodesDir).sort()).toEqual(["manifest.json"]);
  });
});

describe("protection contre le Zip Slip", () => {
  it("refuse une entrée qui remonte hors du dossier", () => {
    const { ignorees } = extraireEntrees([
      entree("../../vole.txt", "charge utile"),
      entree("manifest.json", "{}"),
    ], nodesDir);

    expect(ignorees).toEqual(["../../vole.txt"]);
    // La vérification qui compte : le fichier n'est NULLE PART, pas seulement
    // absent du dossier d'installation.
    expect(existsSync(join(racine, "vole.txt"))).toBe(false);
    expect(existsSync(resolve(nodesDir, "..", "..", "vole.txt"))).toBe(false);
    // …et l'entrée légitime du même zip est bien passée : on écarte l'entrée
    // fautive, on n'abandonne pas l'import.
    expect(existsSync(join(nodesDir, "manifest.json"))).toBe(true);
  });

  it("refuse un chemin absolu", () => {
    const absolu = process.platform === "win32" ? "C:/Windows/vole.txt" : "/tmp/vole.txt";
    const { ignorees } = extraireEntrees([entree(absolu, "x")], nodesDir);
    expect(ignorees).toHaveLength(1);
  });

  it("refuse une remontée dissimulée au milieu du chemin", () => {
    // `path.resolve` est le seul filtre fiable : chercher la chaîne « .. » en
    // tête laisserait passer cette forme-ci.
    const { ignorees } = extraireEntrees([entree("assets/../../../vole.txt", "x")], nodesDir);
    expect(ignorees).toHaveLength(1);
    expect(existsSync(resolve(nodesDir, "..", "..", "..", "vole.txt"))).toBe(false);
  });

  it("laisse passer un « .. » qui reste à l'intérieur", () => {
    // Un chemin peut contenir « .. » sans sortir du dossier. Refuser sur la
    // seule présence de la chaîne écarterait une entrée légitime.
    extraireEntrees([entree("assets/../manifest.json", "{}")], nodesDir);
    expect(existsSync(join(nodesDir, "manifest.json"))).toBe(true);
  });
});
