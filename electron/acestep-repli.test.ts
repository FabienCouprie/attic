// electron/acestep-repli.test.ts — « Automatique » repasse sur le processeur quand la carte est refusée.
//
// LA FORME DU PIÈGE : mesuré le 2026-11-04 sous Linux sur un Intel HD 4000, ggml-vulkan écarte la
// carte et le moteur s'arrête sur « Unsupported device » sans rien produire. « Automatique » tombait
// donc en erreur à chaque lancement sur cette machine, alors que « Processeur » y rend.
//
// LE FAUX MOTEUR EST UN SCRIPT SHELL, et non le binaire : il refuse comme la carte tant qu'on ne lui
// passe pas `--device`, et écrit le plan attendu quand on le lui passe. Ce qui est éprouvé est donc
// le câblage du pont — relancer, avec quoi, et seulement quand il le faut —, sans modèle ni carte.
import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const requerir = createRequire(import.meta.url);
const { planifier, doitRepasserSurProcesseur } = requerir("./acestep.cjs") as {
  planifier: (options: Record<string, unknown>, surAvancement: () => void, contexte: Record<string, unknown>)
    => Promise<{ ok: boolean; plan?: string; journal?: string }>;
  doitRepasserSurProcesseur: (code: number | null, journal: string, peripherique?: string) => boolean;
};

const temporaires: string[] = [];

afterEach(() => {
  while (temporaires.length > 0) {
    try { fs.rmSync(temporaires.pop()!, { recursive: true, force: true }); } catch { /* sans conséquence */ }
  }
});

/** Une racine de projet dont `bin/acestep/ace-lm` est le faux moteur ; il note chaque appel. */
function racineAvecFauxMoteur() {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), "attic-acestep-repli-"));
  temporaires.push(racine);
  const bin = path.join(racine, "bin", "acestep");
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(racine, "public", "acestep"), { recursive: true });
  const appels = path.join(racine, "appels.txt");
  const script = [
    "#!/bin/sh",
    `echo "$*" >> '${appels}'`,
    'requete=""; device=""',
    'while [ $# -gt 0 ]; do',
    '  case "$1" in --request) requete="$2"; shift ;; --device) device="$2"; shift ;; esac',
    "  shift",
    "done",
    'if [ -z "$device" ]; then echo "terminate called after throwing an instance of std::runtime_error" >&2; echo "  what():  Unsupported device" >&2; exit 134; fi',
    'echo "{\\"device\\":\\"$device\\"}" > "$(dirname "$requete")/requete0.json"',
  ].join("\n");
  fs.writeFileSync(path.join(bin, "ace-lm"), script, { mode: 0o755 });
  return { contexte: { empaquete: false, racineProjet: racine }, appels };
}

describe("le repli de « Automatique » sur le processeur", () => {
  it("ne relance que sur une carte refusée, et seulement sans périphérique nommé", () => {
    expect(doitRepasserSurProcesseur(134, "what():  Unsupported device", "")).toBe(true);
    expect(doitRepasserSurProcesseur(null, "what():  Unsupported device", undefined)).toBe(true);
    expect(doitRepasserSurProcesseur(134, "what():  Unsupported device", "Vulkan0")).toBe(false);
    expect(doitRepasserSurProcesseur(1, "FATAL: synth_model not found", "")).toBe(false);
    expect(doitRepasserSurProcesseur(0, "Unsupported device", "")).toBe(false);
  });

  it.skipIf(process.platform === "win32")("« Automatique » rend sur le processeur, en le disant", async () => {
    const { contexte, appels } = racineAvecFauxMoteur();
    const r = await planifier({ legende: "une ballade" }, () => {}, contexte);
    expect(r.ok).toBe(true);
    expect(JSON.parse(r.plan!)).toEqual({ device: "CPU" });
    expect(r.journal).toMatch(/repris sur le processeur/);
    const lignes = fs.readFileSync(appels, "utf8").trim().split("\n");
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).not.toMatch(/--device/);
    expect(lignes[1]).toMatch(/--device CPU$/);
  });

  it.skipIf(process.platform === "win32")("un périphérique nommé part tel quel, sans repli", async () => {
    const { contexte, appels } = racineAvecFauxMoteur();
    // Le faux moteur accepte tout `--device` : ce qui est éprouvé ici est qu'un choix nommé part
    // tel quel, en un seul appel, sans `--device CPU` ajouté ni phrase de repli.
    const r = await planifier({ legende: "une ballade", peripherique: "Vulkan0" }, () => {}, contexte);
    const lignes = fs.readFileSync(appels, "utf8").trim().split("\n");
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatch(/--device Vulkan0$/);
    expect(r.journal ?? "").not.toMatch(/repris sur le processeur/);
  });
});
