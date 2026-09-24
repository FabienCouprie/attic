// electron/preload-bac-a-sable.test.ts — Le préchargement ne requiert que « electron ».
//
// CE QUE CE TEST EMPÊCHE EST ARRIVÉ. Un `require("./plage-media.cjs")` ajouté au préchargement a
// fait échouer le fichier entier : le bac à sable n'y donne accès ni aux modules de Node ni à un
// fichier voisin. `window.api` n'a jamais été exposé, et l'application a perdu d'un coup tous ses
// boutons, sans message et sans rien dans la console de la fenêtre. Le rapport est venu de Fabien,
// qui a vu un sélecteur de fichier disparaître.
//
// La panne est totale et muette, elle ne se voit pas à la compilation, et aucun test de la fenêtre
// ne la montre : le préchargement n'est chargé que par Electron.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const PRELOAD = readFileSync(new URL("./preload.cjs", import.meta.url), "utf-8");

describe("préchargement en bac à sable", () => {
  it("ne requiert rien d'autre qu'« electron »", () => {
    const requis = [...PRELOAD.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
    expect(requis.length).toBeGreaterThan(0);
    expect(requis.filter((r) => r !== "electron")).toEqual([]);
  });

  it("n'importe rien non plus par « import »", () => {
    expect(/^\s*import\s/m.test(PRELOAD)).toBe(false);
  });
});
