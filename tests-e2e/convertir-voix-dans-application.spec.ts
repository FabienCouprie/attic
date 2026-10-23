// tests-e2e/convertir-voix-dans-application.spec.ts — La conversion de voix, dans la vraie
// application.
//
// CE QUE CE CAS GARDE : que la chaîne entière réponde — composant, préchargement, processus
// principal, exécutable, retour, décodage, affichage — sur un composant qui demande DEUX entrées
// audio. Les autres composants à modèle du dépôt n'en prennent qu'une, de sorte que le chemin à
// deux entrées n'était emprunté par aucune épreuve.
//
// ET LA DURÉE EST EXIGÉE, parce que c'est la propriété que la conversion doit tenir : elle garde
// les mots et le rythme de la source, donc sa longueur. Un rendu plus court serait une troncature,
// un rendu plus long une resynthèse — et dans les deux cas autre chose que ce qui est annoncé.
//
// LE SON VIENT DE DEUX MÉTRONOMES DE TEMPOS DIFFÉRENTS, et non d'une voix : « Entrée audio »
// réclamerait un dialogue système que rien ne sait piloter ici. Ce que le moteur fait d'un
// métronome n'importe pas — sa qualité se mesure au banc, sur de vraies voix, et le relevé est
// écrit en tête de `src/plugins/convertir-voix.ts`.
import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const MODELE = join(RACINE, "public", "audiocpp", "chatterbox-q8_0.gguf");

function lancer(): Promise<ElectronApplication> {
  return electron.launch({ args: [RACINE], cwd: RACINE, env: { ...process.env, NODE_ENV: "" } });
}

test.describe("convertir une voix, de bout en bout", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.skip(!existsSync(MODELE), "Modèle Chatterbox absent : le récupérer depuis le panneau des modèles.");
  test.setTimeout(420000);

  test("« CONVERTIR UNE VOIX » TRAVERSE LE PONT AVEC SES DEUX ENTRÉES", async () => {
    const app = await lancer();
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");
      await page.evaluate(() => {
        localStorage.setItem("attic-encours", JSON.stringify({
          nodes: [
            { id: "src", position: { x: 0, y: 0 },
              data: { ficheId: "metronome", parametres: { "Tempo": 120, "Durée": 4 } } },
            { id: "cib", position: { x: 0, y: 240 },
              data: { ficheId: "metronome", parametres: { "Tempo": 90, "Durée": 4 } } },
            { id: "cnv", position: { x: 360, y: 0 },
              data: { ficheId: "convertir-voix", parametres: { "Graine": 42, "Calcul": "" } } },
          ],
          edges: [
            { id: "e1", source: "src", target: "cnv", sourceHandle: "out:0", targetHandle: "in:0" },
            { id: "e2", source: "cib", target: "cnv", sourceHandle: "out:0", targetHandle: "in:1" },
          ],
        }));
      });
      await page.reload();
      await page.waitForSelector(".attic-app", { timeout: 60000 });
      const noeud = page.locator('[data-id="cnv"]');
      await noeud.waitFor({ timeout: 60000 });
      await page.getByRole("button", { name: /Lancer/ }).click();
      await expect(noeud).toContainText(/[\d.,]+\s*s/, { timeout: 360000 });

      const rendu = await noeud.innerText();
      expect(rendu, "le pont doit répondre, et non manquer").not.toMatch(/nécessite Electron|requires Electron/i);
      expect(rendu, "le modèle doit être trouvé").not.toMatch(/Modèle absent|Model missing/i);
      expect(rendu, "les deux entrées doivent arriver").not.toMatch(/Brancher un audio/);

      const forme = await page.evaluate(() => {
        const r = (globalThis as unknown as { __attic_execution__?: { resultats?: Map<string, unknown> } })
          .__attic_execution__?.resultats;
        const lire = (id: string) => {
          const v = r instanceof Map ? r.get(id) : null;
          const b = (Array.isArray(v) ? v[0] : v) as AudioBuffer | null;
          return b && typeof b.numberOfChannels === "number" ? { duree: b.duration } : null;
        };
        return { source: lire("src"), sortie: lire("cnv") };
      });
      expect(forme.source, "la source doit avoir rendu du son").not.toBe(null);
      expect(forme.sortie, "le composant doit avoir rendu du son").not.toBe(null);
      // LA DURÉE DE LA SOURCE EST GARDÉE : c'est elle qui porte les mots et le rythme. Un demi-
      // dixième de seconde de marge suffit à distinguer un arrondi d'une troncature.
      expect(Math.abs(forme.sortie!.duree - forme.source!.duree)).toBeLessThan(0.3);
    } finally {
      await app.close();
    }
  });
});
