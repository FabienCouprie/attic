// tests-e2e/arret-des-travaux-dans-application.spec.ts — « Arrêter » tue le processus enfant.
//
// ═══ POURQUOI CETTE ÉPREUVE, ET POURQUOI ELLE NE PEUT PAS ÊTRE UNITAIRE ═══
//
// Relevé par une revue le 2026-10-26 : les travaux confiés au processus principal ne s'arrêtaient
// pas. Douze canaux de progression, un seul canal d'annulation — celui des téléchargements —, et
// aucun `.kill(` dans `electron/`. Le nœud s'arrêtait, le binaire continuait : la carte graphique
// restait occupée, et l'ordonnanceur attendait la fin d'un travail que personne n'avait demandé.
//
// LES CAS UNITAIRES TIENNENT LES DEUX MOITIÉS SÉPARÉMENT — le registre dans `electron/travaux.
// test.ts`, l'abonnement au signal dans `src/plugins/arret-des-travaux.test.ts`. Aucun des deux ne
// dit que la chaîne se referme : entre eux il y a `window.api`, un canal IPC et un gestionnaire,
// et c'est précisément là qu'un canal déclaré mais non branché passerait inaperçu — le bouton
// répondrait, et rien ne mourrait.
//
// CE QUI EST MESURÉ ICI EST DONC LE TRAJET ENTIER, dans l'application lancée comme un utilisateur
// la lance : un VRAI processus enfant qui dort une minute, l'appel que le rendu fait au pont, et la
// mort constatée — par le registre, et par la promesse du travail qui se résout au lieu d'attendre.
import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");

/** Lance l'application comme un utilisateur la lance, et non en mode développement. */
function lancer(): Promise<ElectronApplication> {
  return electron.launch({
    args: [RACINE],
    env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1" },
  });
}

test.describe("l'arrêt d'un travail, dans l'application qui tourne", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.setTimeout(120000);

  test("LE RENDU DEMANDE, LE PRINCIPAL TUE : un enfant qui dort meurt et sa promesse se résout", async () => {
    const app = await lancer();

    try {
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");

      // ── 1. Un vrai travail, qui ne s'arrêtera que si on le tue ──
      //
      // `process.execPath` EST L'ELECTRON QUI TOURNE : il est toujours là, et son Node sait dormir.
      // Un faux processus n'aurait prouvé que mon faux processus meurt.
      // `process.mainModule.require` ET NON `require` : Playwright évalue dans le processus
      // principal, mais dans un cadre qui n'a pas de `require` à lui. Celui du module principal
      // est le même que celui dont `main.cjs` se sert, donc le MÊME exemplaire du registre — et
      // c'est ce qui compte : un second exemplaire aurait son propre `Set`, vide, et l'épreuve
      // aurait mesuré un registre que le canal ne touche pas.
      const lance = await app.evaluate(async ({ app: electronApp }) => {
        const prendre = (process.mainModule as { require: (m: string) => unknown }).require;
        const chemin = (prendre("path") as { join: (...p: string[]) => string })
          .join(electronApp.getAppPath(), "electron", "travaux.cjs");
        const registre = prendre(chemin) as {
          lancerTravail: (b: string, a: string[], l: (x: string) => void) => Promise<unknown>;
          travauxEnCours: () => number;
        };
        const etat = (globalThis as Record<string, unknown>);
        etat.__attic_promesse__ = registre.lancerTravail(
          process.execPath,
          ["-e", "setTimeout(() => process.exit(0), 60000)"],
          () => {},
        ).then((r: unknown) => { etat.__attic_fini__ = r; return r; });
        etat.__attic_registre__ = registre;
        return { enCours: registre.travauxEnCours() };
      });
      expect(lance.enCours, "le travail doit être inscrit dès son lancement").toBe(1);

      // ── 2. Le rendu demande l'arrêt, par le pont et par le canal, comme un nœud le ferait ──
      const reponse = await page.evaluate(async () => {
        const api = (globalThis as unknown as { api?: { travauxAnnuler?: () => Promise<unknown> } }).api;
        if (!api?.travauxAnnuler) return { manquant: true };
        return { manquant: false, ...(await api.travauxAnnuler() as Record<string, unknown>) };
      });
      expect(reponse.manquant, "« travauxAnnuler » doit être sur le pont").toBe(false);
      expect(reponse.tues, "le canal doit dire ce qu'il a tué, et non « ok »").toBe(1);
      expect(reponse.avant).toBe(1);

      // ── 3. L'enfant est mort, et sa promesse s'est résolue ──
      //
      // LES DEUX COMPTENT. Le registre vidé dit que `close` est bien arrivé ; la promesse résolue
      // dit que l'appelant ne reste pas à attendre une minute un travail déjà mort — c'était la
      // moitié du défaut, puisque l'ordonnanceur attend cette promesse avant la demande suivante.
      const apres = await app.evaluate(async () => {
        const etat = globalThis as Record<string, unknown>;
        const resultat = await Promise.race([
          etat.__attic_promesse__ as Promise<unknown>,
          new Promise((r) => setTimeout(() => r("TROP LONG"), 15000)),
        ]);
        const registre = etat.__attic_registre__ as { travauxEnCours: () => number };
        return { resultat, enCours: registre.travauxEnCours() };
      });
      expect(apres.resultat, "la promesse du travail tué n'est pas revenue").not.toBe("TROP LONG");
      expect(apres.enCours, "un mort reste au registre").toBe(0);
    } finally {
      await app.close();
    }
  });
});
