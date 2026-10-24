// tests-e2e/metronome-signatures.spec.ts — Les signatures du métronome, dans l'application.
//
// CE QUI NE SE VÉRIFIE QUE LÀ. Le groupement est éprouvé sur le son dans `plugins/metronome.test.ts`
// et sur l'arithmétique dans `audio/signatures.test.ts`. Ce qui reste, et qu'aucun cas unitaire ne
// peut voir, c'est LA LISTE RÉELLEMENT OFFERTE DANS L'INSPECTEUR : une table partagée peut être
// juste et n'arriver jamais jusqu'au menu déroulant, auquel cas le manque de complétude demeure
// entier à l'écran.
//
// Un port différent de celui de Fabien (5175), dont le serveur ne doit pas être touché.
import { test, expect } from "@playwright/test";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5220);

const GRAPHE = {
  nodes: [{
    id: "metro", position: { x: 0, y: 0 },
    data: { ficheId: "metronome", parametres: { Tempo: 120, Signature: "9/8", "Durée": 5, Timbre: "Bip", Volume: 80 } },
  }],
  edges: [],
};

async function ouvrir(page: any) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(GRAPHE)]);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length >= 1, { timeout: 15000 });
}

test.describe("les signatures du métronome dans l'application", () => {
  test("L'INSPECTEUR OFFRE TOUTE LA TABLE, 9/8 ET 12/8 COMPRIS", async ({ page }) => {
    test.setTimeout(180000);
    await ouvrir(page);
    await page.evaluate(() => {
      const n = document.querySelector(".react-flow__node") as HTMLElement;
      const r = n.getBoundingClientRect();
      for (const type of ["mousedown", "mouseup", "click"]) {
        n.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + 10 }));
      }
    });
    await page.waitForSelector(".inspecteur-entete", { timeout: 5000 });

    // La liste est cherchée par SON CONTENU et non par son rang : l'ordre des réglages du composant
    // ne doit pas décider de ce que ce cas lit.
    const offertes = await page.evaluate(() => {
      for (const s of [...document.querySelectorAll(".inspecteur select")]) {
        const opts = [...s.querySelectorAll("option")].map((o) => o.textContent?.trim() ?? "");
        if (opts.includes("4/4")) return opts;
      }
      return null;
    });

    expect(offertes, "la liste des signatures doit être dans l'inspecteur").not.toBe(null);
    for (const attendue of ["9/8", "12/8", "2/2", "3/2", "15/8", "5/16", "15/16", "1/4", "6/4"]) {
      expect(offertes, `${attendue} doit être offerte`).toContain(attendue);
    }
    // Trente signatures : trois à la blanche, sept à la noire, treize à la croche, sept à la double.
    expect(offertes!.length).toBe(30);

    // LE MÊME PASSAGE SERT POUR LE SON, et c'est voulu : le serveur de développement ne survit pas
    // toujours à deux visites, et la liste offerte et ce qui est joué sont le même sujet.
    await page.click(".attic-btn-lancer");
    const noeud = page.locator('.react-flow__node[data-id="metro"]');
    await expect(noeud).toContainText(/\d+\s*clics/, { timeout: 60000 });

    const rendu = await noeud.innerText();
    // Cinq secondes à 0,25 s la croche : vingt clics, deux mesures entières de neuf, six temps.
    expect(rendu).toContain("9/8");
    expect(rendu, "deux mesures entières").toMatch(/2 mesure\(s\)/);
    expect(rendu, "trois temps par mesure, donc six").toMatch(/6 temps/);
    expect(rendu, "une croche par clic").toMatch(/20 clics/);

    // ET LE SON EXISTE VRAIMENT, lu dans le résultat du moteur plutôt que sur l'écran.
    const duree = await page.evaluate(() => {
      const r = (globalThis as unknown as { __attic_execution__?: { resultats?: Map<string, unknown> } })
        .__attic_execution__?.resultats;
      const v = r instanceof Map ? r.get("metro") : null;
      const b = (Array.isArray(v) ? v[0] : v) as AudioBuffer | null;
      return b && typeof b.duration === "number" ? b.duration : null;
    });
    expect(duree).toBeCloseTo(5, 1);
  });
});
