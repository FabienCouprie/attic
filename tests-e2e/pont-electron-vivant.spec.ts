// tests-e2e/pont-electron-vivant.spec.ts — La première épreuve qui lance la VRAIE application.
//
// CE QUE LES TRENTE-SIX AUTRES NE PEUVENT PAS FAIRE. Elles tournent en Chromium sur le serveur
// Vite, où `window.api` n'existe pas : trente et un composants dépendent du pont, soixante-deux
// canaux le traversent, et aucune épreuve n'en a jamais emprunté un seul. Le garde statique
// `electron/pont-canaux.test.ts` apparie les NOMS des deux côtés, ce qui attrape une faute de
// frappe ; il ne dit rien de ce qui se passe quand on appelle.
//
// TROIS PROPRIÉTÉS, DU PLUS BAS AU PLUS HAUT :
//   1. le préchargement s'exécute, donc `window.api` est là ;
//   2. tout canal que le préchargement invoque a un gestionnaire VIVANT dans le processus
//      principal, lu dans le processus lui-même et non dans un fichier ;
//   3. un aller-retour réel aboutit et rend une valeur.
//
// LE DEUXIÈME CAS EST CELUI QUI VALAIT LE HARNAIS. `ipcMain` tient ses gestionnaires dans une table
// que `app.evaluate` peut lire, puisque Playwright évalue DANS le processus principal. On compare
// donc ce que le préchargement promet à ce que le principal tient réellement, à l'exécution. Un
// `ipcMain.handle` écrit dans une branche jamais prise, ou après un `return` hâtif, passerait le
// garde statique et tomberait ici.
//
// L'APPLICATION EST LANCÉE HORS MODE DÉVELOPPEMENT, donc elle charge `dist/index.html` et n'a
// besoin d'aucun serveur. Sans build, l'épreuve s'ignore en le disant : un harnais qui échouerait
// faute d'artefact apprendrait seulement qu'on n'a pas construit.
import { test, expect, _electron as electron } from "@playwright/test";
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");

/** Les canaux que le préchargement invoque, lus dans son source. */
function canauxInvoques(): string[] {
  const source = readFileSync(join(RACINE, "electron", "preload.cjs"), "utf8");
  const trouves = new Set<string>();
  for (const m of source.matchAll(/ipcRenderer\.invoke\(\s*["']([^"']+)["']/g)) trouves.add(m[1]);
  return [...trouves].sort();
}

test.describe("le pont, dans l'application qui tourne", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.setTimeout(120000);

  test("LE PONT EST VIVANT : préchargement posé, canaux tenus, aller-retour abouti", async () => {
    const app = await electron.launch({
      args: [RACINE],
      // NI MODE DÉVELOPPEMENT NI MISE À JOUR : l'un chercherait un serveur, l'autre sortirait sur le
      // réseau au démarrage. L'épreuve doit tenir sur une machine hors ligne.
      env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1" },
    });

    try {
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");

      // 1. LE PRÉCHARGEMENT S'EST EXÉCUTÉ. Une seule ligne fautive y fait échouer le fichier
      // ENTIER, et l'application perd tous ses boutons d'un coup, sans message : c'est écrit en
      // tête de `preload.cjs`, et rien ne le vérifiait.
      const pont = await page.evaluate(() => {
        const api = (globalThis as unknown as { api?: Record<string, unknown> }).api;
        return { present: !!api, fonctions: api ? Object.keys(api).length : 0 };
      });
      expect(pont.present, "« window.api » doit exister : sinon le préchargement a échoué en bloc").toBe(true);
      expect(pont.fonctions).toBeGreaterThan(40);

      // 2. CHAQUE CANAL INVOQUÉ A UN GESTIONNAIRE VIVANT, lu dans le processus principal lui-même.
      const tenus: string[] = await app.evaluate(({ ipcMain }) => {
        const table = (ipcMain as unknown as { _invokeHandlers?: Map<string, unknown> })._invokeHandlers;
        return table ? [...table.keys()] : [];
      });
      expect(tenus.length, "la table des gestionnaires doit être lisible").toBeGreaterThan(0);
      const orphelins = canauxInvoques().filter((c) => !tenus.includes(c));
      expect(orphelins, [
        "Ces canaux sont invoqués par le préchargement et aucun gestionnaire ne les tient dans",
        "l'application qui tourne. Le nœud qui les emprunte échouera sur « No handler registered",
        "for … ». Un « ipcMain.handle » écrit dans une branche jamais prise passe le garde",
        "statique et tombe ici.",
      ].join("\n")).toEqual([]);

      // 3. UN ALLER-RETOUR RÉEL ABOUTIT. Le répertoire de travail est choisi parce qu'il ne touche
      // à rien : il lit un chemin et le rend, sans écrire ni réseau ni modèle.
      const repertoire = await page.evaluate(async () => {
        const api = (globalThis as unknown as { api: { obtenirRepertoireTravail: () => Promise<unknown> } }).api;
        return api.obtenirRepertoireTravail();
      });
      expect(typeof repertoire, "l'aller-retour doit rendre un chemin").toBe("string");
      expect((repertoire as string).length).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });
});
