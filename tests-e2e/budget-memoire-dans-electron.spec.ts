// tests-e2e/budget-memoire-dans-electron.spec.ts — Le budget mémoire, lu sur la machine ou dans
// `config.json`, dans l'application elle-même.
//
// ═══ CE QUE CETTE ÉPREUVE TIENT, ET QU'AUCUN CAS UNITAIRE NE PEUT TENIR ═══
//
// Pièce C2 du plan du fichier de configuration (2026-11-19). Les cas unitaires tiennent la règle, le
// seuil des aperçus, l'historique et l'indicateur derrière un pont témoin ; reste ce que seul Electron
// dit :
//   — le défaut est la mémoire de CETTE machine, que le processus principal lit avant d'être prêt,
//     et `config.propose.json` la montre ;
//   — sous un budget de 2 Gio, l'indicateur de la barre d'outils passe en rouge quand l'application
//     tient plus de 80 % du budget, et son infobulle le dit ;
//   — sous le défaut, la même mémoire ne l'y fait pas passer.
//
// LA MÉMOIRE EST TENUE PAR LA PAGE : 1,8 Go d'un tableau rempli, que l'indicateur voit dans le
// processus de l'onglet. L'indicateur relève toutes les deux secondes.
//
// UN PROFIL JETABLE PAR LANCEMENT ; l'interface vient de `dist/`.
import { test, expect, _electron as electron } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { totalmem } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { effacerProfil, profilAvec } from "./demarrage-electron";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const GIO = 1024 ** 3;
const TENU = 1.8e9;

interface Releve { recue: { systeme?: string; valeurs: Record<string, unknown> }; propose: Record<string, Record<string, unknown>>; avant: string; apres: { classe: string; titre: string } }

/** Lance l'application sur ce `config.json`, fait tenir 1,8 Go à la page, et rend ce que l'indicateur montre. */
async function releverSous(config: string | null, attendreAlerte: boolean): Promise<Releve> {
  const profil = profilAvec(config);
  const app = await electron.launch({ args: [RACINE, `--user-data-dir=${profil}`], cwd: RACINE, env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1" } });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector(".attic-app", { timeout: 60_000 });
    const indicateur = page.locator(".attic-memoire");
    await expect(indicateur).toBeVisible({ timeout: 15_000 });
    const avant = (await indicateur.getAttribute("class")) ?? "";
    const recue = await page.evaluate(() => (window as unknown as { api: { configuration: () => Promise<unknown> } }).api.configuration()) as Releve["recue"];
    await page.evaluate((n) => { (window as unknown as { __tenu__: Uint8Array }).__tenu__ = new Uint8Array(n).fill(1); }, TENU);
    if (attendreAlerte) await expect(page.locator(".attic-memoire-alerte")).toBeVisible({ timeout: 20_000 });
    // SANS ALERTE ATTENDUE, TROIS RELEVÉS DE L'INDICATEUR AU MOINS : il relève toutes les deux secondes.
    else await page.waitForTimeout(6_500);
    const apres = { classe: (await indicateur.getAttribute("class")) ?? "", titre: (await indicateur.getAttribute("title")) ?? "" };
    const propose = JSON.parse(readFileSync(join(profil, "config.propose.json"), "utf8"));
    return { recue, propose, avant, apres };
  } finally {
    await app.close().catch(() => {});
    await effacerProfil(profil);
  }
}

test.describe("le budget mémoire, dans Electron", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.skip(process.platform !== "win32", "Le défaut se compare à la mémoire de Windows ; Linux n'a pas de construction.");
  test.setTimeout(300_000);

  test("SANS FICHIER, LE BUDGET EST LA MÉMOIRE DE LA MACHINE, LE FICHIER PROPOSÉ LA MONTRE, ET 1,8 GO N'ALERTENT PAS", async () => {
    const r = await releverSous(null, false);
    const machine = Math.floor((totalmem() / GIO) * 10) / 10;
    expect(r.recue.systeme).toBe("windows");
    expect(r.recue.valeurs.budgetMemoireGio).toBe(machine);
    expect(r.propose.windows.budgetMemoireGio, "config.propose.json doit montrer la mémoire de la machine").toBe(machine);
    expect(r.avant).toBe("attic-memoire");
    expect(r.apres.classe, `sous ${machine} Gio, 1,8 Go ne doivent pas alerter`).toBe("attic-memoire");
  });

  test("SOUS 2 GIO, L'INDICATEUR PASSE EN ROUGE AU-DELÀ DE 80 %, ET SON INFOBULLE LE DIT", async () => {
    const r = await releverSous(JSON.stringify({ budgetMemoireGio: 2 }), true);
    expect(r.recue.valeurs.budgetMemoireGio).toBe(2);
    expect(r.avant, "au démarrage, l'application tient moins de 1,6 Gio").toBe("attic-memoire");
    expect(r.apres.classe).toBe("attic-memoire attic-memoire-alerte");
    expect(r.apres.titre).toMatch(/80 % du budget mémoire, 2 Gio|80% of the memory budget, 2 GiB/);
    expect(r.apres.titre).toMatch(/budgetMemoireGio/);
  });
});
