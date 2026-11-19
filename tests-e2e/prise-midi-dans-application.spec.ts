// tests-e2e/prise-midi-dans-application.spec.ts — Une prise MIDI refaite dans l'inspecteur remet le
// nœud à zéro, comme la prise au micro.
//
// ═══ LE DÉFAUT, RELEVÉ LE 2026-11-19 ═══
//
// La « Capture MIDI » s'enregistre depuis l'inspecteur. Son geste, dans `ui/InspecteurDuCanevas.tsx`,
// oubliait le nœud au cache et posait le fichier, sans le remettre à zéro : le nœud gardait son
// « Terminé » et le résultat de la prise précédente jusqu'au Lancer suivant, son aval aussi. C'est le
// défaut que la prise au micro avait, et que `urls-medias-dans-application.spec.ts` garde depuis le
// 2026-11-10 : une prise refaite doit remettre le nœud en attente.
//
// ═══ LE CLAVIER EST SIMULÉ ═══
//
// Chromium n'a pas de périphérique MIDI. `navigator.requestMIDIAccess` est remplacé avant le
// chargement par un accès qui porte une entrée, et `__jouer__` lui fait jouer une note : c'est le
// chemin réel de la capture, de l'événement `onmidimessage` au fichier rendu à l'inspecteur.
import { expect, test, type Page } from "@playwright/test";

import { etatDesNoeuds, relancerEtAttendre, semer } from "./pilote-graphe";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5289);

const GRAPHE = JSON.stringify({
  nodes: [
    { id: "cap", type: "atelier", position: { x: 0, y: 0 }, data: { ficheId: "capture-midi", parametres: { "Synthèse": "FM", "Volume": 30 } } },
    { id: "ecoute", type: "atelier", position: { x: 450, y: 0 }, data: { ficheId: "point-ecoute", parametres: {} } },
  ],
  edges: [{ id: "e1", source: "cap", target: "ecoute", sourceHandle: "out:0", targetHandle: "in:0", type: "arete-personnalisee" }],
});

/** Un accès MIDI à une entrée, posé avant que la page ne le demande. */
async function clavierSimule(page: Page) {
  await page.addInitScript(() => {
    const entree: { id: string; name: string; onmidimessage: ((e: { data: Uint8Array }) => void) | null } =
      { id: "simule", name: "Clavier simulé", onmidimessage: null };
    const inputs = new Map([["simule", entree]]);
    (navigator as unknown as { requestMIDIAccess: () => Promise<unknown> }).requestMIDIAccess =
      async () => ({ inputs, onstatechange: null });
    (window as unknown as { __jouer__: (note: number, appui: boolean) => void }).__jouer__ = (note, appui) => {
      entree.onmidimessage?.({ data: new Uint8Array(appui ? [0x90, note, 100] : [0x80, note, 0]) });
    };
  });
}

/** Une prise d'une note depuis l'inspecteur, le nœud étant sélectionné. */
async function prendre(page: Page, note: number) {
  const panneau = page.locator(".inspecteur");
  await panneau.locator(".attic-node-btn-record").first().click({ timeout: 10_000 });
  await expect(panneau.locator(".attic-node-btn-stop")).toBeVisible({ timeout: 10_000 });
  await page.evaluate((n) => { (window as unknown as { __jouer__: (n: number, a: boolean) => void }).__jouer__(n, true); }, note);
  await page.waitForTimeout(400);
  await page.evaluate((n) => { (window as unknown as { __jouer__: (n: number, a: boolean) => void }).__jouer__(n, false); }, note);
  await panneau.locator(".attic-node-btn-stop").click();
  await expect(panneau.locator(".attic-node-fichier-nom")).toBeVisible({ timeout: 10_000 });
}

const statutDe = async (page: Page, id: string) => (await etatDesNoeuds(page)).find((e) => e.id === id)?.statut;

test("UNE PRISE MIDI REFAITE DANS L'INSPECTEUR REMET LE NŒUD ET SON AVAL À ZÉRO", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await clavierSimule(page);
  await semer(page, devUrl, GRAPHE);
  await page.locator('.react-flow__node[data-id="cap"]').click({ position: { x: 12, y: 12 } });
  await prendre(page, 60);
  await relancerEtAttendre(page);
  expect(await statutDe(page, "cap"), "la première prise lancée").toBe("termine");
  expect(await statutDe(page, "ecoute")).toBe("termine");

  await prendre(page, 72);
  await expect.poll(() => statutDe(page, "cap"), {
    message: "la prise refaite doit remettre le nœud en attente : il montrerait le résultat de la précédente",
    timeout: 5000,
  }).toBe("attente");
  expect(await statutDe(page, "ecoute"), "et son aval avec lui").toBe("attente");

  // ET LE LANCER SUIVANT REND LA PRISE NEUVE.
  await relancerEtAttendre(page);
  expect(await statutDe(page, "cap")).toBe("termine");
});
