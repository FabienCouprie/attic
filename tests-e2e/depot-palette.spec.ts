// tests-e2e/depot-palette.spec.ts — Un composant tiré de la palette tombe sous le pointeur.
//
// POURQUOI CE TEST. Il ne tombait pas dessous : il tombait **260 px à gauche**, c'est-à-dire
// exactement la largeur de la palette. La cause était au point d'appel. `screenToFlowPosition` de
// React Flow attend des coordonnées CLIENT et retire elle-même la position du canevas à l'écran ;
// `App.tsx` lui retirait d'avance le rectangle de l'enveloppe du canevas, de sorte que cette
// position était comptée deux fois.
//
// ET LA MESURE S'EST D'ABORD TROMPÉE, ce qui vaut d'être écrit. Relever le rectangle du nœud À
// L'ÉCRAN ne dit rien : React Flow cadre le graphe après l'ajout, si bien que le nœud se retrouve
// là où le cadrage le met, et non là où le dépôt l'a posé. Le premier relevé donnait ainsi un écart
// de (−240, −118,5) qui n'était que l'effet du cadrage. Ce qu'il faut lire est la position DANS LE
// GRAPHE, que React Flow écrit dans le `transform` du nœud lui-même, et que le cadrage ne touche
// pas. L'écart est alors (−260, 0) avant correction et (0, 0) après.
//
// POURQUOI IL EST PERMANENT. L'erreur verticale était NULLE par accident : `.attic-canevas`
// commençait à y = 0, parce que la barre d'outils vivait dedans. Le jour où la barre est montée sur
// toute la largeur de l'application, ce rectangle a commencé 51 px plus bas, et la même faute se
// serait mise à décaler aussi en hauteur. Un calcul de dépôt ne doit rien devoir à la mise en page,
// et c'est ce que ce test tient.
import { expect, test } from "@playwright/test";

const devUrl = process.env.DEV_URL || "http://localhost:5175";

test("un composant déposé se pose exactement sous le pointeur", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(() => { localStorage.setItem("attic-encours", JSON.stringify({ nodes: [], edges: [] })); });
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 20000 });
  await page.waitForSelector(".react-flow__pane", { timeout: 15000 });

  const releve = await page.evaluate(async () => {
    const canevas = document.querySelector(".attic-canevas") as HTMLElement;
    const pane = document.querySelector(".react-flow__pane") as HTMLElement;
    const vp = document.querySelector(".react-flow__viewport") as HTMLElement;
    const rp = pane.getBoundingClientRect();
    const m = new DOMMatrix(getComputedStyle(vp).transform);
    const z = m.a, tx = m.e, ty = m.f;

    // On vise un point franchement à l'intérieur, et surtout PAS le centre : un point décalé des
    // deux axes distingue un décalage réel d'une symétrie heureuse.
    const cible = { x: Math.round(rp.x + rp.width * 0.62), y: Math.round(rp.y + rp.height * 0.38) };
    // Ce que ce point VAUT dans le graphe, avec la transformation d'avant le dépôt.
    const attendu = { x: ((cible.x - rp.x) - tx) / z, y: ((cible.y - rp.y) - ty) / z };

    const dt = new DataTransfer();
    dt.setData("application/attic-fiche-id", "generateur-frequence");
    for (const type of ["dragover", "drop"]) {
      canevas.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: cible.x, clientY: cible.y, dataTransfer: dt }));
    }
    await new Promise((r) => setTimeout(r, 1200));

    const n = document.querySelector(".react-flow__node") as HTMLElement | null;
    if (!n) return { noeudCree: false, cible, attendu, pose: null, ecart: null };
    // La position DU GRAPHE, et non celle à l'écran : le cadrage ne la déplace pas.
    const mn = new DOMMatrix(getComputedStyle(n).transform);
    return {
      noeudCree: true, cible, attendu,
      pose: { x: mn.e, y: mn.f },
      ecart: { dx: +(mn.e - attendu.x).toFixed(2), dy: +(mn.f - attendu.y).toFixed(2) },
    };
  });

  expect(releve.noeudCree, "aucun nœud n'a été créé par le dépôt").toBe(true);
  // Au pixel près : le dépôt arrondit, et un pixel de graphe ne se voit pas. Deux cent soixante,
  // qui était l'écart, se voient.
  expect(Math.abs(releve.ecart!.dx), `le nœud est posé à ${releve.ecart!.dx} px en x du pointeur`).toBeLessThanOrEqual(1);
  expect(Math.abs(releve.ecart!.dy), `le nœud est posé à ${releve.ecart!.dy} px en y du pointeur`).toBeLessThanOrEqual(1);
});
