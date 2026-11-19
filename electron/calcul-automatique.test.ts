// electron/calcul-automatique.test.ts — Ce que « Automatique » veut dire, selon `config.json`.
//
// Pièce C5 du plan du fichier de configuration (2026-11-19) : Fabien a choisi que la clé `calcul` règle
// le sens d'« Automatique », et non le défaut des nœuds posés. Ces cas tiennent la table des deux
// vocabulaires, la traduction de `dosEtCarte` qui sert neuf moteurs, et un garde : tout site du
// processus principal qui donne un périphérique à un moteur passe par la règle.
import { afterEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require_ = createRequire(import.meta.url);
const calcul = require_("./calcul-automatique.cjs");
const { dosEtCarte } = require_("./muscriptor.cjs");

afterEach(() => calcul.poserCalculAutomatique("auto", "windows"));

describe("le sens d'« Automatique »", () => {
  it("SANS CLÉ, RIEN NE CHANGE : le moteur choisit, et DirectML essaie la carte puis le processeur", () => {
    calcul.poserCalculAutomatique("auto", "windows");
    expect([calcul.calculDuPont(""), calcul.fournisseurDirectML("auto"), calcul.fournisseurDirectML(undefined)]).toEqual(["", "auto", "auto"]);
  });

  it("« PROCESSEUR » MET LE PROCESSEUR DANS LES DEUX VOCABULAIRES, sous Windows comme sous Linux", () => {
    for (const sys of ["windows", "linux"]) {
      calcul.poserCalculAutomatique("processeur", sys);
      expect([calcul.calculDuPont(""), calcul.fournisseurDirectML("auto")], sys).toEqual(["CPU", "processeur"]);
    }
  });

  it("« CARTE » IMPOSE LA CARTE À DIRECTML SOUS WINDOWS, ET LAISSE LE MOTEUR DU PONT CHOISIR SON NUMÉRO", () => {
    calcul.poserCalculAutomatique("carte", "windows");
    expect([calcul.calculDuPont(""), calcul.fournisseurDirectML("auto")]).toEqual(["", "carte"]);
    // SOUS LINUX, DirectML n'existe pas : « Automatique » y reste ce qu'il était.
    calcul.poserCalculAutomatique("carte", "linux");
    expect(calcul.fournisseurDirectML("auto")).toBe("auto");
  });

  it("UN CHOIX EXPLICITE DANS LE NŒUD L'EMPORTE TOUJOURS", () => {
    calcul.poserCalculAutomatique("processeur", "windows");
    expect([calcul.calculDuPont("Vulkan1"), calcul.fournisseurDirectML("carte")]).toEqual(["Vulkan1", "carte"]);
    calcul.poserCalculAutomatique("carte", "windows");
    expect([calcul.calculDuPont("CPU"), calcul.fournisseurDirectML("processeur")]).toEqual(["CPU", "processeur"]);
  });

  it("UNE VALEUR INCONNUE VAUT « AUTO »", () => {
    calcul.poserCalculAutomatique("gpu", "windows");
    expect(calcul.calculAutomatique()).toMatchObject({ preference: "auto", pont: "", directML: "auto" });
  });

  it("LES NEUF MOTEURS D'AUDIO.CPP, PAR `dosEtCarte` : « Automatique » devient le processeur, un numéro reste un numéro", () => {
    expect(dosEtCarte("")).toEqual({ backend: "best" });
    calcul.poserCalculAutomatique("processeur", "windows");
    expect(dosEtCarte("")).toEqual({ backend: "cpu", device: undefined });
    expect(dosEtCarte("Vulkan1")).toEqual({ backend: "vulkan", device: "1" });
  });
});

describe("tout site qui donne un périphérique à un moteur passe par la règle", () => {
  // UN SITE EST UN FICHIER DU PROCESSUS PRINCIPAL qui écrit `--device` ou `--backend` pour un binaire,
  // ou qui choisit dans une table `FOURNISSEURS`. Il doit traduire le réglage du nœud par
  // `calculDuPont`, `fournisseurDirectML`, ou `dosEtCarte`, qui appelle la première. Un moteur neuf
  // qui passerait le réglage tel quel laisserait « Automatique » sourd à `config.json`.
  const DOSSIER = __dirname;
  const sites = readdirSync(DOSSIER)
    .filter((f) => f.endsWith(".cjs") && f !== "calcul-automatique.cjs")
    .map((f) => ({ f, src: readFileSync(join(DOSSIER, f), "utf8") }))
    .filter(({ src }) => /["']--(?:device|backend)["']|FOURNISSEURS\[/.test(src));

  it("LES SITES SONT TROUVÉS : le garde ne passe pas sur un ensemble vide", () => {
    expect(sites.map((s) => s.f).sort()).toEqual(expect.arrayContaining(["acestep.cjs", "muscriptor.cjs", "sdcpp.cjs", "sdxs-image.cjs", "stable-audio-3.cjs"]));
    // DOUZE AU 2026-11-19 : neuf moteurs d'audio.cpp, acestep.cpp, stable-diffusion.cpp, et les deux DirectML.
    expect(sites.length).toBeGreaterThanOrEqual(12);
  });

  it("CHACUN TRADUIT LE RÉGLAGE DU NŒUD", () => {
    const sourds = sites.filter(({ src }) => !/\b(?:calculDuPont|fournisseurDirectML|dosEtCarte)\(/.test(src)).map((s) => s.f);
    expect(sourds, "ces moteurs passent le réglage du nœud sans traduire « Automatique »").toEqual([]);
  });
});
