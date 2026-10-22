// tests-e2e/restaurer-dans-application.spec.ts — La restauration d'un son compressé, dans la vraie
// application.
//
// CE QUE CE CAS GARDE : que la chaîne entière réponde — composant, préchargement, processus
// principal, exécutable, retour, décodage, affichage — et que le son rendu ait la forme du son
// reçu. Une durée qui change de rapport serait une conversion de cadence faite sur la LONGUEUR au
// lieu de la DURÉE, ce qui transpose le son ; `isoler-voix` porte cette distinction depuis qu'elle
// lui a coûté un défaut.
//
// CE QU'IL NE GARDE PAS, ET IL FAUT L'ÉCRIRE. Le moteur refuse tout ce qui n'est pas du 44 100 Hz,
// et le composant y amène le son avant de le passer. Mais l'application tourne elle-même à
// 44 100 Hz : défaut planté en retirant la conversion, ce cas reste VERT, parce qu'il n'y a rien à
// convertir sur cette machine. Un garde qui ne peut pas tomber n'en est pas un, et cette propriété
// est donc tenue là où elle peut tomber — dans `src/plugins/restaurer-compresse.test.ts`, sur le
// refus que le pont oppose à une autre cadence.
import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const MODELE = join(RACINE, "public", "audiocpp", "apollo-orig.gguf");

function lancer(): Promise<ElectronApplication> {
  return electron.launch({ args: [RACINE], cwd: RACINE, env: { ...process.env, NODE_ENV: "" } });
}

test.describe("restaurer un son compressé, de bout en bout", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.skip(!existsSync(MODELE), "Modèle Apollo absent : le récupérer depuis le panneau des modèles.");
  test.setTimeout(300000);

  test("« RESTAURER UN SON COMPRESSÉ » TRAVERSE LE PONT, ET LA DURÉE NE BOUGE PAS", async () => {
    const app = await lancer();
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");
      await page.evaluate(() => {
        localStorage.setItem("attic-encours", JSON.stringify({
          nodes: [
            { id: "src", position: { x: 0, y: 0 },
              data: { ficheId: "metronome", parametres: { "Tempo": 120, "Durée": 6 } } },
            { id: "res", position: { x: 360, y: 0 },
              data: { ficheId: "restaurer-compresse",
                parametres: { "Dosage": 100, "Tranche": 0, "Calcul": "" } } },
          ],
          edges: [{ id: "e1", source: "src", target: "res", sourceHandle: "out:0", targetHandle: "in:0" }],
        }));
      });
      await page.reload();
      await page.waitForSelector(".attic-app", { timeout: 60000 });
      const noeud = page.locator('[data-id="res"]');
      await noeud.waitFor({ timeout: 60000 });
      await page.getByRole("button", { name: /Lancer/ }).click();
      await expect(noeud).toContainText(/\d+\s*%/, { timeout: 240000 });

      const rendu = await noeud.innerText();
      expect(rendu, "le pont doit répondre, et non manquer").not.toMatch(/nécessite Electron|requires Electron/i);
      expect(rendu, "le modèle doit être trouvé").not.toMatch(/Modèle absent|Model missing/i);

      // LA DURÉE ET LA CADENCE SONT LUES DANS LE MOTEUR, non dans le lecteur du nœud : celui-ci
      // replie le multicanal pour l'écoute, et ne dirait donc pas la vérité sur la sortie.
      const forme = await page.evaluate(() => {
        const r = (globalThis as unknown as { __attic_execution__?: { resultats?: Map<string, unknown> } })
          .__attic_execution__?.resultats;
        const lire = (id: string) => {
          const v = r instanceof Map ? r.get(id) : null;
          const b = (Array.isArray(v) ? v[0] : v) as AudioBuffer | null;
          return b && typeof b.numberOfChannels === "number"
            ? { canaux: b.numberOfChannels, cadence: b.sampleRate, duree: b.duration } : null;
        };
        return { entree: lire("src"), sortie: lire("res") };
      });
      expect(forme.entree, "le métronome doit avoir rendu du son").not.toBe(null);
      expect(forme.sortie, "le composant doit avoir rendu du son").not.toBe(null);
      expect(forme.sortie!.cadence, "la cadence rendue est celle reçue, non celle du moteur")
        .toBe(forme.entree!.cadence);
      // Le moteur rend quelques échantillons de plus ou de moins ; un dixième de seconde suffit
      // à distinguer cela d'une durée qui aurait changé de rapport.
      expect(Math.abs(forme.sortie!.duree - forme.entree!.duree)).toBeLessThan(0.1);
    } finally {
      await app.close();
    }
  });
});
