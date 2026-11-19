// tests-e2e/variables-dans-electron.spec.ts — Les variables d'environnement d'avant, écrites dans
// `config.json`, dans l'application elle-même.
//
// ═══ CE QUE CETTE ÉPREUVE TIENT, ET QU'AUCUN CAS UNITAIRE NE PEUT TENIR ═══
//
// Pièce C4 du plan du fichier de configuration (2026-11-19). `electron/configuration.test.ts` tient la
// lecture, `electron/capacites-chemins.test.ts` les racines ; reste le fil, dans `main.cjs`, jusqu'aux
// trois modules qui s'en servent, et que seul Electron fait courir :
//   — `python` : l'interprète que `python:info` dit employer. Le témoin est le Node qui lance
//     l'épreuve : un exécutable absolu, qui répond à `--version`, et qu'aucune détection ne
//     trouverait d'elle-même sous ce nom ;
//   — `racines` : un dossier jetable où le pont écrit, qu'il refuse sans la clé ;
//   — `ollama` : l'adresse que le processus principal interroge, que son message d'échec nomme. Le
//     port 9 est fermé : la connexion est refusée aussitôt ;
//   — `ATTIC_OLLAMA_URL` l'emporte sur le fichier ;
//   — sans fichier, `config.propose.json` montre l'interprète que l'application a trouvé.
//
// UN PROFIL JETABLE PAR LANCEMENT : un `python-path.txt` choisi dans l'interface l'emporterait.
import { test, expect, _electron as electron } from "@playwright/test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { effacerProfil, profilAvec } from "./demarrage-electron";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");

type Pont = {
  pythonInfo: () => Promise<{ chemin: string | null }>;
  ecrireFichier: (c: string, b: string) => Promise<string | null>;
  ollamaModeles: () => Promise<{ modeles?: string[]; erreur?: string }>;
};
interface Releve { python: string | null; ecrit: string | null; ollama: { modeles?: string[]; erreur?: string }; propose: Record<string, Record<string, unknown>> }

/** Lance l'application sur ce `config.json` et cet environnement, et relève ce que les trois modules emploient. */
async function relever(config: string | null, cible: string, env: Record<string, string> = {}): Promise<Releve> {
  const profil = profilAvec(config);
  const app = await electron.launch({
    args: [RACINE, `--user-data-dir=${profil}`], cwd: RACINE,
    env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1", ATTIC_PYTHON: "", ATTIC_RACINES: "", ATTIC_OLLAMA_URL: "", ...env },
  });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector(".attic-app", { timeout: 60_000 });
    const r = await page.evaluate(async (cible) => {
      const api = (window as unknown as { api: Pont }).api;
      return { python: (await api.pythonInfo()).chemin, ecrit: await api.ecrireFichier(cible, "x"), ollama: await api.ollamaModeles() };
    }, cible);
    return { ...r, propose: JSON.parse(readFileSync(join(profil, "config.propose.json"), "utf8")) };
  } finally {
    await app.close().catch(() => {});
    await effacerProfil(profil);
  }
}

test.describe("les variables d'environnement d'avant, par config.json, dans Electron", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.skip(process.platform !== "win32", "Les chemins de l'épreuve sont ceux de Windows ; Linux n'a pas de construction.");
  test.setTimeout(300_000);

  test("ÉCRITES DANS LE FICHIER, PYTHON, LES RACINES ET OLLAMA ATTEIGNENT LEURS MODULES", async () => {
    const dossier = mkdtempSync(join(tmpdir(), "attic-racine-c4-"));
    try {
      const config = JSON.stringify({ ollama: "http://127.0.0.1:9", windows: { python: process.execPath, racines: [dossier] } });
      const r = await relever(config, join(dossier, "dedans.txt"));
      expect(r.python, "l'interprète de config.json").toBe(process.execPath);
      expect(r.ecrit, "le pont doit écrire dans une racine de config.json").toBe(join(dossier, "dedans.txt"));
      expect(readFileSync(join(dossier, "dedans.txt"), "utf8")).toBe("x");
      expect(r.ollama.erreur, "le message doit nommer l'adresse de config.json").toMatch(/127\.0\.0\.1:9\b/);
      expect(r.propose.windows).toMatchObject({ racines: [dossier], python: process.execPath, ollama: "http://127.0.0.1:9" });
    } finally {
      await effacerProfil(dossier);
    }
  });

  test("LA VARIABLE L'EMPORTE SUR LE FICHIER", async () => {
    const r = await relever(JSON.stringify({ ollama: "http://127.0.0.1:9" }), join(tmpdir(), "attic-hors-racine.txt"), { ATTIC_OLLAMA_URL: "http://127.0.0.1:7" });
    expect(r.ollama.erreur).toMatch(/127\.0\.0\.1:7\b/);
    expect(r.propose.windows.ollama).toBe("http://127.0.0.1:7");
  });

  test("SANS FICHIER, AUCUNE RACINE DE PLUS, ET LE FICHIER PROPOSÉ MONTRE L'INTERPRÈTE TROUVÉ", async () => {
    const dossier = mkdtempSync(join(tmpdir(), "attic-racine-c4-"));
    try {
      const r = await relever(null, join(dossier, "dehors.txt"));
      expect(r.ecrit, "sans la clé, ce dossier n'est pas une racine").toBeNull();
      expect(existsSync(join(dossier, "dehors.txt"))).toBe(false);
      expect(r.python).not.toBe(process.execPath);
      // L'INTERPRÈTE TROUVÉ, s'il a un chemin absolu ; sinon, aucune clé.
      if (r.python && /^[A-Za-z]:\\/.test(r.python)) expect(r.propose.windows.python).toBe(r.python);
      else expect(r.propose.windows.python).toBeUndefined();
      expect(r.propose.windows).toMatchObject({ racines: [], ollama: "http://127.0.0.1:11434" });
      console.log(`interprète trouvé sur cette machine : ${r.python}`);
    } finally {
      await effacerProfil(dossier);
    }
  });
});
