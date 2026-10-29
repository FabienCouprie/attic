// tests-e2e/boucle-reprise-dans-application.spec.ts — Une boucle terminée ne se refait pas quand on
// pose un nœud après sa fin.
//
// ═══ LE DÉFAUT, SIGNALÉ PAR FABIEN LE 2026-10-28 ═══
//
// « On exécute cette boucle, qui prend fin sans erreur. Si on place un nœud Point d'écoute à sa
// suite, toute la boucle est réexécutée. » Mesuré sur son graphe ramené à trois tours, sous
// l'économie de mémoire qui est le défaut : au second run, les huit nœuds du corps, la fin et le point
// d'écoute repartaient, en 5 s ; sans l'économie, le point d'écoute seul, en 1 s. Le corps d'une
// boucle est lâché en fin de run pour la mémoire, et ses copies sans cache entraînaient la fin.
//
// ═══ CE QUE CE CAS REFAIT, ET CE QU'IL EXIGE ═══
//
// LE GESTE MÊME : une boucle lancée jusqu'au bout, un « Point d'écoute » déposé depuis le catalogue,
// câblé à la souris sur la fin, puis relancé. Au second run, SEUL LE POINT D'ÉCOUTE doit passer
// « en cours » : la fin de boucle reprend son résultat, son corps se saute. Voir
// `core/saut-de-boucle.ts`, qui tient les raisons de ne PAS sauter, une par une.
//
// LE GRAPHE EST À LUI, plus léger que celui de Fabien et du même dessin : une source, une boucle de
// trois tours dont le corps transpose puis ajoute du silence, et une fin qui empile les tours.
import { expect, test, type Page } from "@playwright/test";

import { etatDesNoeuds, lireLesRelances, observerLesRelances, relancerEtAttendre, semerEtLancer } from "./pilote-graphe";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5268);
/** Le début de boucle reste « en attente » par décision écrite : voir `attentesAdmises`. */
const ATTENTES = ["debut"];

const GRAPHE = JSON.stringify({
  nodes: [
    { id: "source", position: { x: 0, y: 0 }, data: { ficheId: "illusion-octave", parametres: { "Alternances": 6 } } },
    { id: "debut", position: { x: 300, y: 0 }, data: { ficheId: "boucle-graphe-debut", parametres: { "Tours": 3, "Graines": "Identiques" } } },
    { id: "transpose", position: { x: 600, y: 0 }, data: { ficheId: "soundtouch-tonalite", parametres: { "Tonalité": 2 } } },
    { id: "silence", position: { x: 900, y: 0 }, data: { ficheId: "ajouter-silence", parametres: { "Avant": 0.2, "Après": 0.2 } } },
    { id: "fin", position: { x: 1200, y: 0 }, data: { ficheId: "boucle-graphe-fin-c", parametres: { "Niveau": 0 } } },
  ],
  edges: [
    { id: "e1", source: "source", target: "debut", sourceHandle: "out:0", targetHandle: "in:0", type: "arete-personnalisee" },
    { id: "e2", source: "debut", target: "transpose", sourceHandle: "out:0", targetHandle: "in:0", type: "arete-personnalisee" },
    { id: "e3", source: "transpose", target: "silence", sourceHandle: "out:0", targetHandle: "in:0", type: "arete-personnalisee" },
    { id: "e4", source: "silence", target: "fin", sourceHandle: "out:0", targetHandle: "in:0", type: "arete-personnalisee" },
  ],
});

/**
 * Déposer un « Point d'écoute » sous la fin de boucle et l'y câbler à la souris. Rend son identifiant.
 *
 * LE GRAPHE DÉBORDE SOUS L'INSPECTEUR une fois recadré, et un glisser du bouton gauche trace une
 * sélection : la vue se déplace donc du bouton droit, sans quoi la souris tirait le câble dans le
 * panneau. Relevé sur des captures, le premier essai n'ayant posé aucun câble.
 */
async function poserUnPointDEcoute(page: Page): Promise<string> {
  await page.locator(".react-flow__controls-fitview").first().click();
  await page.waitForTimeout(500);
  await page.mouse.move(900, 250);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(500, 250, { steps: 10 });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(400);
  const avant = await page.evaluate(() => [...document.querySelectorAll(".react-flow__node")].map((n) => n.getAttribute("data-id")!));
  await page.evaluate(() => {
    const r = document.querySelector('.react-flow__node[data-id="fin"]')!.getBoundingClientRect();
    const dt = new DataTransfer();
    dt.setData("application/attic-fiche-id", "point-ecoute");
    for (const type of ["dragover", "drop"]) {
      document.querySelector(".attic-canevas")!.dispatchEvent(new DragEvent(type,
        { bubbles: true, cancelable: true, clientX: r.left, clientY: r.bottom + 120, dataTransfer: dt }));
    }
  });
  await page.waitForTimeout(1000);
  const id = await page.evaluate((avant) => [...document.querySelectorAll(".react-flow__node")]
    .map((n) => n.getAttribute("data-id")!).find((x) => !avant.includes(x)) ?? "", avant);
  expect(id, "le dépôt n'a créé aucun nœud").not.toBe("");
  const a = (await page.locator('.react-flow__node[data-id="fin"] .react-flow__handle.source').first().boundingBox())!;
  const b = (await page.locator(`.react-flow__node[data-id="${id}"] .react-flow__handle.target`).first().boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  expect(await page.locator(".react-flow__edge").count(), "le point d'écoute n'a pas été câblé").toBe(5);
  return id;
}

test.describe("une boucle terminée, et un nœud posé après sa fin", () => {
  test.setTimeout(300_000);

  test("SEUL LE NŒUD POSÉ REPART : la fin reprend son résultat, le corps se saute", async ({ page }) => {
    await page.setViewportSize({ width: 1800, height: 1000 });
    await semerEtLancer(page, devUrl, GRAPHE, { attentesAdmises: ATTENTES });
    expect((await etatDesNoeuds(page)).find((e) => e.id === "fin")?.statut, "la boucle doit aboutir").toBe("termine");

    const ecoute = await poserUnPointDEcoute(page);
    await observerLesRelances(page);
    await relancerEtAttendre(page, { attentesAdmises: ATTENTES });
    const relances = await lireLesRelances(page);
    console.log(`refaits au second run : ${relances.join(", ") || "aucun"}`);

    expect(relances, [
      "",
      "LA BOUCLE S'EST REFAITE POUR UN NŒUD POSÉ APRÈS SA FIN.",
      "",
      "Le corps d'une boucle dépliée est lâché en fin de run, sous l'économie de mémoire. La fin de",
      "boucle doit ranger l'empreinte de sa boucle avec son résultat, et un corps inchangé se sauter :",
      "voir `core/saut-de-boucle.ts` et son branchement dans `ui/hooks/useExecutionGraphe.ts`.",
      "",
    ].join("\n")).toEqual([ecoute]);
    expect((await etatDesNoeuds(page)).find((e) => e.id === ecoute)?.statut).toBe("termine");
  });
});
