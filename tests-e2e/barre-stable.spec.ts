// tests-e2e/barre-stable.spec.ts — La barre d'outils ne bouge pas quand on change de langue.
//
// POURQUOI CE TEST. Relevé par Fabien : changer de langue déplaçait le menu du haut. La cause est
// ordinaire et se reproduira — un contrôle dont le libellé est traduit se dimensionne sur son texte,
// et tout ce qui le suit glisse d'autant. Trois l'ont fait ensemble : la liste de profondeur
// d'export, dont la plus large option passe de « 32 bits flottants » à « 32-bit float » et qui
// perdait vingt-deux pixels ; le bouton de lancement, « Lancer » contre « Run », dix-huit pixels ; et
// le bouton de langue lui-même, six dixièmes de pixel entre « FR » et « EN ».
//
// CE QUE LE TEST EXIGE, ET POURQUOI C'EST SI STRICT. Aucun élément de la barre ne change de position
// ni de taille, AU PIXEL PRÈS et jusqu'aux icônes. Une tolérance aurait laissé passer les six
// dixièmes du bouton de langue, qui se voient pourtant : le regard suit une barre qui frémit.
//
// IL COUVRE PLUS QUE LA LANGUE. Le bouton de lancement porte aussi « Arrêter » pendant l'exécution :
// sa largeur plancher tient les quatre libellés, si bien que le même réglage empêche le saut qui se
// produisait à chaque lancement.
import { expect, test } from "@playwright/test";

const devUrl = process.env.DEV_URL || "http://localhost:5175";

interface Boite { x: number; y: number; w: number; h: number }

test("la barre d'outils ne bouge pas d'un pixel au changement de langue", async ({ page }) => {
  await page.goto(devUrl);
  await page.waitForSelector(".attic-barre-outils", { timeout: 15000 });

  const releve = () => page.evaluate((): Boite[] =>
    [...document.querySelectorAll(".attic-barre-outils *")].map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }));

  const basculer = () => page.evaluate(() => {
    const b = [...document.querySelectorAll("button")]
      .find((x) => ["FR", "EN"].includes((x.textContent ?? "").trim()));
    if (!b) throw new Error("bouton de langue introuvable");
    b.click();
  });

  const avant = await releve();
  expect(avant.length, "la barre d'outils paraît vide").toBeGreaterThan(20);

  await basculer();
  await page.waitForTimeout(400);
  const apres = await releve();

  expect(apres.length, "le changement de langue a ajouté ou retiré des éléments").toBe(avant.length);
  const bouges = apres
    .map((e, i) => ({
      i,
      dx: +(e.x - avant[i].x).toFixed(3),
      dy: +(e.y - avant[i].y).toFixed(3),
      dw: +(e.w - avant[i].w).toFixed(3),
      dh: +(e.h - avant[i].h).toFixed(3),
    }))
    .filter((d) => d.dx || d.dy || d.dw || d.dh);

  expect(bouges, "des éléments de la barre se déplacent au changement de langue").toEqual([]);

  // On rend la langue d'origine : un test ne laisse pas l'application dans un autre état que celui
  // où il l'a trouvée.
  await basculer();
  await page.waitForTimeout(200);
});
