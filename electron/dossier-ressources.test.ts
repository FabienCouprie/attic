// electron/dossier-ressources.test.ts — Le dossier des modèles téléchargés, et son déplacement.
//
// Ce que ces tests protègent : sous Linux, des dizaines de gigaoctets quittent `~/.config` pour
// `~/.local/share`. Un renommage raté ne doit jamais faire perdre l'accès aux modèles déjà pris,
// et rien ne doit être recopié en silence au lancement.
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { dossierRessourcesVoulu, migrerRessources } = require_("./dossier-ressources.cjs");

describe("dossierRessourcesVoulu", () => {
  it("garde userData/ressources hors Linux", () => {
    expect(dossierRessourcesVoulu({ plateforme: "win32", userData: "/u/Attic", home: "/h" }))
      .toBe(join("/u/Attic", "ressources"));
    expect(dossierRessourcesVoulu({ plateforme: "darwin", userData: "/u/Attic", home: "/h" }))
      .toBe(join("/u/Attic", "ressources"));
  });

  it("prend ~/.local/share/attic/ressources sous Linux par défaut", () => {
    expect(dossierRessourcesVoulu({ plateforme: "linux", userData: "/h/.config/attic", home: "/h" }))
      .toBe("/h/.local/share/attic/ressources");
  });

  it("suit XDG_DATA_HOME s'il est absolu, l'ignore s'il est relatif", () => {
    const base = { plateforme: "linux", userData: "/h/.config/attic", home: "/h" };
    expect(dossierRessourcesVoulu({ ...base, env: { XDG_DATA_HOME: "/d" } })).toBe("/d/attic/ressources");
    expect(dossierRessourcesVoulu({ ...base, env: { XDG_DATA_HOME: "rel" } }))
      .toBe("/h/.local/share/attic/ressources");
    expect(dossierRessourcesVoulu({ ...base, env: { XDG_DATA_HOME: "" } }))
      .toBe("/h/.local/share/attic/ressources");
  });
});

describe("migrerRessources", () => {
  const tmp = () => mkdtempSync(join(tmpdir(), "attic-ress-"));

  it("ne fait rien quand les deux chemins sont le même", () => {
    expect(migrerRessources("/a/ressources", "/a/ressources", { existe: () => true }))
      .toEqual({ dossier: "/a/ressources", action: "aucune" });
  });

  it("ne fait rien sans ancien dossier", () => {
    const racine = tmp();
    const r = migrerRessources(join(racine, "vieux"), join(racine, "neuf"));
    expect(r).toEqual({ dossier: join(racine, "neuf"), action: "aucune" });
    expect(existsSync(join(racine, "neuf"))).toBe(false);
    rmSync(racine, { recursive: true });
  });

  it("renomme l'ancien en le nouveau, contenu compris, parents créés", () => {
    const racine = tmp();
    const ancien = join(racine, "config", "attic", "ressources");
    const nouveau = join(racine, "share", "attic", "ressources");
    mkdirSync(join(ancien, "oonx"), { recursive: true });
    writeFileSync(join(ancien, "oonx", "m.onnx"), "poids");
    expect(migrerRessources(ancien, nouveau)).toEqual({ dossier: nouveau, action: "deplace" });
    expect(readFileSync(join(nouveau, "oonx", "m.onnx"), "utf8")).toBe("poids");
    expect(existsSync(ancien)).toBe(false);
    rmSync(racine, { recursive: true });
  });

  it("les deux présents : sert le nouveau, ne touche pas l'ancien", () => {
    let renomme = false;
    const r = migrerRessources("/v", "/n", { existe: () => true, renommer: () => { renomme = true; } });
    expect(r).toEqual({ dossier: "/n", action: "deux" });
    expect(renomme).toBe(false);
  });

  it("renommage impossible (autre disque) : garde l'ancien, ne recopie rien", () => {
    const r = migrerRessources("/v", "/n", {
      existe: (c: string) => c === "/v",
      creerDossier: () => {},
      renommer: () => { throw Object.assign(new Error("cross-device"), { code: "EXDEV" }); },
    });
    expect(r).toEqual({ dossier: "/v", action: "conserve", erreur: "EXDEV" });
  });
});
