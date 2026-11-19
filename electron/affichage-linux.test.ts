// electron/affichage-linux.test.ts — X11 ou Wayland sous Linux, choisi par `config.json` (pièce C6).
//
// CE QUI SE TIENT AILLEURS QUE SOUS LINUX : quelle option pour quel choix, rien sous Windows, une option
// donnée au lancement qui l'emporte, et la clé lue dans la seule section `linux`. Ce qui ne se tient
// pas ici, faute d'une construction Linux : que Chromium entende l'option posée par le processus
// principal. `electron/affichage-linux.cjs` le dit.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { optionsDAffichage, appliquerAffichage } = require_("./affichage-linux.cjs");
const { lireConfiguration, SCHEMA } = require_("./configuration.cjs");

/** Une ligne de commande témoin : ce qui y est déjà, et ce qu'on y pose. */
function ligne(deja: Record<string, string> = {}) {
  const posees: [string, string][] = [];
  return { posees, hasSwitch: (n: string) => n in deja, appendSwitch: (n: string, v: string) => { posees.push([n, v]); } };
}

describe("l'affichage sous Linux", () => {
  it("X11 OU WAYLAND POSENT --ozone-platform ; AUTO NE POSE RIEN, et Electron choisit", () => {
    expect(optionsDAffichage("x11", "linux")).toEqual([["ozone-platform", "x11"]]);
    expect(optionsDAffichage("wayland", "linux")).toEqual([["ozone-platform", "wayland"]]);
    expect(optionsDAffichage("auto", "linux")).toEqual([]);
  });

  it("RIEN SOUS WINDOWS, quoi que dise la clé", () => {
    for (const a of ["auto", "x11", "wayland"]) expect(optionsDAffichage(a, "windows"), a).toEqual([]);
    const l = ligne();
    expect(appliquerAffichage(l, "x11", "windows")).toEqual([]);
    expect(l.posees).toEqual([]);
  });

  it("L'OPTION EST POSÉE ET DITE, SAUF SI LE LANCEUR L'A DÉJÀ DONNÉE", () => {
    const l = ligne();
    expect(appliquerAffichage(l, "x11", "linux")).toEqual(["--ozone-platform=x11"]);
    expect(l.posees).toEqual([["ozone-platform", "x11"]]);
    const deja = ligne({ "ozone-platform": "wayland" });
    expect(appliquerAffichage(deja, "x11", "linux")).toEqual([]);
    expect(deja.posees).toEqual([]);
  });

  it("LA CLÉ NE SE LIT QUE DANS LA SECTION LINUX, ET SOUS LINUX", () => {
    const lire = (plateforme: string, texte: string) => lireConfiguration({ plateforme, texte, schema: SCHEMA });
    expect(lire("linux", JSON.stringify({ linux: { affichage: "x11" } })).valeurs.affichage).toBe("x11");
    const windows = lire("win32", JSON.stringify({ linux: { affichage: "x11" } }));
    expect([windows.valeurs.affichage, windows.problemes]).toEqual(["auto", []]);
    // ÉCRITE DANS LA PARTIE COMMUNE, elle est nommée sous Windows, et ignorée.
    expect(lire("win32", JSON.stringify({ affichage: "x11" })).problemes.map((p: { code: string }) => p.code)).toEqual(["autre-systeme"]);
    expect(lire("linux", JSON.stringify({ linux: { affichage: "mir" } })).problemes.map((p: { code: string }) => p.code)).toEqual(["choix"]);
  });
});
