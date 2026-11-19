// tests-e2e/hors-ligne-dans-electron.spec.ts — Le mode hors ligne strict, dans l'application elle-même.
//
// ═══ CE QUE CETTE ÉPREUVE TIENT ═══
//
// Pièce C7 du plan du fichier de configuration (2026-11-19). `electron/hors-ligne.test.ts` tient la
// règle, la session sur un témoin, et un garde des modules qui sortent ; reste le fil dans `main.cjs`
// et les quatre sorties de l'application vraie, sur un profil jetable :
//   — une requête de la page vers `https://huggingface.co`, adresse que la politique de sécurité de la
//     page laisse partir, est coupée par la session : `net::ERR_BLOCKED_BY_CLIENT` ;
//   — un téléchargement par le pont est refusé, avec la clé dans le message ;
//   — Ollama, à une adresse d'une autre machine (192.0.2.1, réservée à la documentation), est refusé ;
//   — la recherche de mise à jour répond « indisponible » ;
//   — `ATTIC_HORS_LIGNE=1` l'arme sans fichier ;
//   — et ce qui est local passe : la page s'ouvre, une adresse `data:` se lit.
//
// AUCUNE REQUÊTE NE PART QUAND LE MODE TIENT. Sur le code d'avant C7, la requête vers huggingface.co
// sortait vraiment : c'est ce qui la fait tomber, quelle que soit la réponse du réseau.
import { test, expect, _electron as electron } from "@playwright/test";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { effacerProfil, profilAvec } from "./demarrage-electron";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const DEHORS = "https://huggingface.co/attic-hors-ligne-epreuve";

type Pont = {
  telechargerUrl: (u: string) => Promise<{ erreur?: string }>;
  ollamaModeles: () => Promise<{ erreur?: string }>;
  majVerifier: () => Promise<{ statut?: string }>;
};

/** Lance l'application, tente les quatre sorties, et rend ce que chacune a donné. */
async function tenter(config: string | null, env: Record<string, string> = {}) {
  const profil = profilAvec(config);
  const app = await electron.launch({
    args: [RACINE, `--user-data-dir=${profil}`], cwd: RACINE,
    env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1", ATTIC_HORS_LIGNE: "", ATTIC_OLLAMA_URL: "", ...env },
  });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector(".attic-app", { timeout: 60_000 });
    const echecs: string[] = [];
    page.on("requestfailed", (r) => { if (r.url().startsWith(DEHORS)) echecs.push(r.failure()?.errorText ?? "?"); });
    const r = await page.evaluate(async (dehors) => {
      const api = (window as unknown as { api: Pont }).api;
      const page = await fetch(dehors).then((x) => `répondu ${x.status}`, (e) => `échoué ${String(e)}`);
      const local = await fetch("data:text/plain,local").then((x) => x.text());
      return { page, local, telechargement: await api.telechargerUrl(dehors), ollama: await api.ollamaModeles(), maj: await api.majVerifier() };
    }, DEHORS);
    await expect.poll(() => echecs.length, { timeout: 5_000 }).toBeGreaterThan(0).catch(() => {});
    return { ...r, echecs };
  } finally {
    await app.close().catch(() => {});
    await effacerProfil(profil);
  }
}

test.describe("le mode hors ligne strict, dans Electron", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.setTimeout(300_000);

  test("PAR LE FICHIER : LA PAGE, LE TÉLÉCHARGEMENT, OLLAMA ET LA MISE À JOUR NE SORTENT PAS ; LE LOCAL PASSE", async () => {
    const r = await tenter(JSON.stringify({ horsLigne: true, ollama: "http://192.0.2.1:11434" }));
    expect(r.echecs, `la requête de la page devait être coupée par la session (${r.page})`).toEqual(["net::ERR_BLOCKED_BY_CLIENT"]);
    expect(r.page).toMatch(/^échoué/);
    expect(r.local).toBe("local");
    expect(r.telechargement.erreur).toMatch(/Hors ligne strict .* téléchargement vers https:\/\/huggingface\.co refusé/);
    expect(r.ollama.erreur).toMatch(/Hors ligne strict .* Ollama vers http:\/\/192\.0\.2\.1:11434 refusé/);
    expect(r.maj.statut).toBe("indisponible");
  });

  test("PAR LA VARIABLE, SANS FICHIER", async () => {
    const r = await tenter(null, { ATTIC_HORS_LIGNE: "1" });
    expect(r.echecs).toEqual(["net::ERR_BLOCKED_BY_CLIENT"]);
    expect(r.telechargement.erreur).toMatch(/Hors ligne strict/);
  });
});
