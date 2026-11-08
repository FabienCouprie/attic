// tests-e2e/montage-piste-branchee.spec.ts — Une piste branchée du montage apparaît et sonne, quoi
// que porte le projet et quoi qu'on fasse de sa dernière barre.
//
// ═══ POURQUOI CE CAS EXISTE ═══
//
// Relevé par Fabien le 2026-11-06, sur son propre projet : « la troisième piste branchée fait
// apparaître sa place réservée mais pas la piste ». Le montage portait `pistesVidees: [2]`, écrit le
// jour où la dernière barre de cette piste avait été retirée — le Suppr qui suit un glissement de
// barre part vers la ligne de temps, qui garde le focus. Cette liste la tenait cachée quoi qu'on y
// branche ensuite. Sa règle, du même jour : « une source est branchée ou pas, branchée elle
// apparaît, non branchée elle n'apparaît pas ».
//
// CE CAS PASSE PAR LES GESTES : un projet semé tel qu'il l'enregistrait, la barre choisie au clic et
// retirée par Suppr, un câble tiré de poignée à poignée. Il mesure ce que la ligne de temps dessine
// ET ce que le montage fait entendre. La règle pure est tenue par `src/audio/montage-morceaux.test.ts`.
import { expect, test, type Page } from "@playwright/test";

import { serveurDeVerification } from "./serveur-de-developpement";
import { apercusEnWav, relancerEtAttendre, semer } from "./pilote-graphe";
import { niveauxParTranche } from "../src/audio/empreinte-wav";

const devUrl = serveurDeVerification(5279);

/** Un sinus de `duree` secondes, assez fort pour qu'une tranche où il sonne se lise sans ambiguïté. */
const sinus = (id: string, y: number, hz: number, duree: number) => ({
  id, type: "atelier", position: { x: 0, y }, width: 260, height: 170,
  data: { ficheId: "oscillateur", parametres: { Forme: "Sinus", "Fréquence": hz, "Durée": duree, Volume: 80 } },
});

/**
 * Trois sinus sur les pistes 1 à 3, le montage portant la liste d'un projet enregistré avant la
 * règle, et un quatrième sinus qui attend sur le côté.
 *
 * LES DÉBUTS PAR DÉFAUT SÉPARENT LES PISTES DANS LE TEMPS — `Début k` vaut `k × 2` secondes —, et
 * c'est ce qui rend la mesure lisible : la piste 3 sonne de 4 à 5,5 s, seule. LA SOURCE NEUVE DURE
 * UNE SECONDE ET NON UNE ET DEMIE : sa barre et sa dernière tranche disent donc laquelle des deux
 * arrive sur la piste. Elle est branchée sur une sortie à elle, pour que le graphe n'ait pas de nœud
 * orphelin.
 */
const GRAPHE = JSON.stringify({
  nodes: [
    sinus("src-1", 0, 220, 1.5), sinus("src-2", 200, 440, 1.5), sinus("src-3", 400, 880, 1.5),
    sinus("src-4", 640, 1320, 1),
    { id: "mont", type: "atelier", position: { x: 380, y: 60 }, width: 460, height: 300,
      data: { ficheId: "montage", parametres: {}, pistesVidees: [2] } },
    { id: "out", type: "atelier", position: { x: 920, y: 100 }, width: 260, height: 200,
      data: { ficheId: "sortie-audio", parametres: {} } },
    { id: "out-4", type: "atelier", position: { x: 380, y: 640 }, width: 260, height: 200,
      data: { ficheId: "sortie-audio", parametres: {} } },
  ],
  edges: [
    { id: "e1", source: "src-1", target: "mont", sourceHandle: "out:0", targetHandle: "in:0" },
    { id: "e2", source: "src-2", target: "mont", sourceHandle: "out:0", targetHandle: "in:1" },
    { id: "e3", source: "src-3", target: "mont", sourceHandle: "out:0", targetHandle: "in:2" },
    { id: "eo", source: "mont", target: "out", sourceHandle: "out:0", targetHandle: "in:0" },
    { id: "e4", source: "src-4", target: "out-4", sourceHandle: "out:0", targetHandle: "in:0" },
  ],
  viewport: { x: 20, y: 20, zoom: 0.62 },
  date: new Date().toISOString(),
});

/** Les barres de la piste 3, avec leur instant et leur durée relus sur l'échelle de la règle. */
async function barresP3(page: Page): Promise<{ debut: number; duree: number }[]> {
  return await page.evaluate(() => {
    const n = document.querySelector('.react-flow__node[data-id="mont"]')!;
    const textes = [...n.querySelectorAll("svg text.ligne-temps-texte")];
    const rangees = textes.filter((t) => /^[PT]\d+$/.test(t.textContent ?? ""))
      .map((t) => ({ nom: t.textContent!, y: Number(t.getAttribute("y")) }));
    // LA RÈGLE DONNE L'ÉCHELLE : la graduation « 4 s » est posée à X(4) + 3. Deux graduations qui
    // portent des secondes différentes, la plus à gauche et la plus à droite.
    const grads = textes.map((t) => ({ m: /^(-?[\d\s,.]+) s$/.exec(t.textContent ?? ""), x: Number(t.getAttribute("x")) - 3 }))
      .filter((g) => g.m).map((g) => ({ s: Number(g.m![1].replace(/\s/g, "").replace(",", ".")), x: g.x }))
      .sort((p, q) => p.x - q.x);
    const a = grads[0], b = [...grads].reverse().find((g) => g.s !== a.s)!;
    const pxParS = (b.x - a.x) / (b.s - a.s);
    return [...n.querySelectorAll("rect.ligne-temps-barre")].flatMap((r) => {
      const milieu = Number(r.getAttribute("y")) + Number(r.getAttribute("height")) / 2;
      // L'étiquette d'une rangée est posée deux pixels sous le milieu de ses barres.
      const proche = rangees.reduce((m, e) => (Math.abs(e.y - 2 - milieu) < Math.abs(m.y - 2 - milieu) ? e : m));
      return proche.nom !== "P3" ? [] : [{
        debut: Math.round((a.s + (Number(r.getAttribute("x")) - a.x) / pxParS) * 100) / 100,
        duree: Math.round((Number(r.getAttribute("width")) / pxParS) * 100) / 100,
      }];
    });
  });
}

/**
 * Les niveaux de 4 à 5,5 s, par demi-seconde, de ce que le montage fait entendre.
 *
 * UNE TRANCHE AU-DELÀ DU SON VAUT LE SILENCE, et elle se dit comme telle : le montage dure jusqu'à
 * la fin de son dernier morceau, si bien qu'une piste 3 absente le ramène à 3,5 s.
 */
async function niveauxPiste3(page: Page): Promise<number[]> {
  const a = (await apercusEnWav(page)).find((x) => x.id === "out");
  expect(a, "la sortie du montage n'a pas d'aperçu").toBeTruthy();
  const db = niveauxParTranche(Uint8Array.from(Buffer.from(a!.base64, "base64")).buffer, 0.5).map((t) => t.db);
  return [8, 9, 10].map((i) => db[i] ?? -Infinity);
}
const dits = (n: number[]) => n.map((d) => d.toFixed(1)).join(" / ");

/** Ce que le montage annonce, « 3 morceaux · 3 pistes · 5.50 s », sans l'icône de copie qui le précède. */
const message = async (page: Page) => ((await page
  .locator('.react-flow__node[data-id="mont"] .attic-node-message').textContent()) ?? "").replace(/^⧉/, "").trim();

/** Le montage tel que l'en-cours le garde, c'est-à-dire tel qu'il s'enregistrerait. */
const enregistre = (page: Page) => page.evaluate(() => {
  const g = JSON.parse(localStorage.getItem("attic-encours") ?? "{}");
  const d = (g.nodes ?? []).find((n: { id: string }) => n.id === "mont")?.data ?? {};
  return "pistesVidees" in d ? JSON.stringify(d.pistesVidees) : "absente";
});

test.describe("une piste branchée du montage", () => {
  test.setTimeout(300_000);

  test("APPARAÎT ET SONNE, MÊME DANS UN PROJET QUI LA DISAIT VIDÉE, ET MÊME APRÈS SUPPR", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });

    // ── 1. LE PROJET TEL QU'IL ÉTAIT ENREGISTRÉ : `pistesVidees: [2]`, la piste 3 branchée. ──
    //
    // IL S'OUVRE PAR L'IMPORT, COMME FABIEN OUVRE LE SIEN, et non par la reprise de l'en-cours. La
    // reprise ne recopie que les champs déclarés et laisse donc la liste en route ; l'import recopie
    // tout `data`, si bien que la liste arrive jusqu'au nœud, à la vue et à l'exécuteur. Semé par
    // l'en-cours, ce cas restait vert sur un exécuteur qui relisait la liste.
    page.on("dialog", (d) => { void d.accept(); });
    await semer(page, devUrl, GRAPHE, { profondeurExport: 32 });
    await page.setInputFiles('input[type="file"][accept=".json"]',
      { name: "projet-avec-piste-videe.json", mimeType: "application/json", buffer: Buffer.from(GRAPHE, "utf8") });
    await page.waitForTimeout(2500);
    await relancerEtAttendre(page, { profondeurExport: 32 });
    const ouvert = await barresP3(page), nOuvert = await niveauxPiste3(page);
    console.log(`ouvert : ${await message(page)} · P3=${JSON.stringify(ouvert)} · 4–5,5 s : ${dits(nOuvert)} dB`);
    expect(ouvert, "la piste 3 branchée apparaît").toHaveLength(1);
    expect(ouvert[0].debut).toBeCloseTo(4, 1);
    expect(await message(page)).toMatch(/^3 morceaux · 3 pistes/);
    expect(Math.min(...nOuvert), "et elle s'entend, de 4 à 5,5 s").toBeGreaterThan(-20);
    // ET LA LISTE NE SE RÉENREGISTRE PAS : l'en-cours réécrit par l'application ne la porte plus.
    await expect.poll(() => enregistre(page), { timeout: 15_000 }).toBe("absente");

    // ── 2. SA DERNIÈRE BARRE CHOISIE AU CLIC, ET SUPPR : refusé, et le refus se dit. ──
    await page.locator('.react-flow__node[data-id="mont"] rect.ligne-temps-barre').nth(2).click();
    await page.keyboard.press("Delete");
    await expect(page.locator('.react-flow__node[data-id="mont"] .ligne-temps-refus'), "le refus se dit")
      .toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(1000);
    await relancerEtAttendre(page);
    const apresSuppr = await barresP3(page), nSuppr = await niveauxPiste3(page);
    console.log(`après Suppr : ${await message(page)} · P3=${JSON.stringify(apresSuppr)} · 4–5,5 s : ${dits(nSuppr)} dB`);
    expect(apresSuppr, "une piste branchée garde une barre").toHaveLength(1);
    expect(await message(page)).toMatch(/^3 morceaux · 3 pistes/);
    expect(Math.min(...nSuppr), "et elle s'entend toujours").toBeGreaterThan(-20);

    // ── 3. UNE SOURCE NEUVE SUR LA PISTE : sa barre est la sienne, et c'est elle qu'on entend. ──
    await page.locator('.react-flow__node[data-id="src-4"] .react-flow__handle[data-handleid="out:0"]')
      .dragTo(page.locator('.react-flow__node[data-id="mont"] .react-flow__handle[data-handleid="in:2"]'));
    await page.waitForTimeout(800);
    await relancerEtAttendre(page);
    const neuve = await barresP3(page), nNeuve = await niveauxPiste3(page);
    console.log(`source neuve : ${await message(page)} · P3=${JSON.stringify(neuve)} · 4–5,5 s : ${dits(nNeuve)} dB`);
    expect(neuve).toHaveLength(1);
    expect(neuve[0].duree, "une seconde : c'est bien la source neuve").toBeCloseTo(1, 1);
    expect(Math.min(nNeuve[0], nNeuve[1]), "elle s'entend de 4 à 5 s").toBeGreaterThan(-20);
    expect(nNeuve[2], "et plus de 5 à 5,5 s").toBeLessThan(-80);
  });

  test("LA DERNIÈRE BARRE D'UNE PISTE BRANCHÉE NE SE RETIRE PAS, NI PAR SUPPR NI PAR CTRL+X", async ({ page }) => {
    // UNE BARRE ROGNÉE, ET C'EST CE QUI SÉPARE UN REFUS D'UNE BARRE RENDUE. Une barre qui joue tout
    // son son et qu'on retirerait reviendrait à l'identique, décrite par ses réglages : rien ne dirait
    // si la suppression a été refusée ou défaite. Celle-ci ne joue que 0,5 s, prises à 0,5 s dans le
    // son ; refusée, elle garde ses 0,5 s, rendue, elle en aurait 1,5.
    //
    // Décision de Fabien le 2026-11-06 : « refuser la suppression ». Pour faire taire une piste, on
    // la débranche.
    const g = JSON.parse(GRAPHE);
    const mont = g.nodes.find((n: { id: string }) => n.id === "mont");
    mont.data = { ficheId: "montage", parametres: {},
      morceaux: [{ id: "r", piste: 2, debut: 4, dans: 0.5, duree: 0.5, gain: 0, entree: 10, sortie: 10 }] };
    await page.setViewportSize({ width: 1400, height: 900 });
    page.on("dialog", (d) => { void d.accept(); });
    await semer(page, devUrl, JSON.stringify(g), { profondeurExport: 32 });
    await relancerEtAttendre(page, { profondeurExport: 32 });
    const depart = await barresP3(page);
    console.log(`barre rognée : ${await message(page)} · P3=${JSON.stringify(depart)}`);
    expect(depart).toHaveLength(1);
    expect(depart[0].duree).toBeCloseTo(0.5, 1);

    const barre = page.locator('.react-flow__node[data-id="mont"] rect.ligne-temps-barre').nth(2);
    const refus = page.locator('.react-flow__node[data-id="mont"] .ligne-temps-refus');
    await barre.click();
    await expect(refus, "rien n'est refusé avant qu'on essaie").toHaveCount(0);
    for (const touche of ["Delete", "Delete", "Backspace", "Control+x"]) {
      await page.keyboard.press(touche);
      await expect(refus, `${touche} : le refus se dit`).toBeVisible({ timeout: 5_000 });
      await page.waitForTimeout(600);
      const apres = await barresP3(page);
      // LE MESSAGE RESTE LISIBLE : il se taisait au premier rendu suivant, avant qu'on l'ait lu.
      await expect(refus, `${touche} : le refus se lit encore après coup`).toBeVisible({ timeout: 1_000 });
      console.log(`${touche} : P3=${JSON.stringify(apres)} · « ${(await refus.textContent({ timeout: 2_000 }))?.slice(0, 60)}… »`);
      expect(apres, `${touche} : la barre reste`).toHaveLength(1);
      expect(apres[0].duree, `${touche} : et c'est elle, rognée, et non une barre rendue entière`).toBeCloseTo(0.5, 1);
      // ET LA TOUCHE NE PASSE PAS AU CANEVAS : le nœud Montage, sélectionné par le clic, y serait
      // supprimé — c'est ce que faisait le second Suppr avant ce refus.
      await expect(page.locator('.react-flow__node[data-id="mont"]'), `${touche} : le nœud Montage reste`).toHaveCount(1);
    }

    // ET CE QUI S'ENTEND EST TOUJOURS LA BARRE ROGNÉE : 4 à 4,5 s, puis plus rien.
    await relancerEtAttendre(page, { profondeurExport: 32 });
    const n = await niveauxPiste3(page);
    console.log(`après les quatre touches : ${await message(page)} · 4–5,5 s : ${dits(n)} dB`);
    expect(n[0], "de 4 à 4,5 s, la barre rognée sonne").toBeGreaterThan(-20);
    expect(Math.max(n[1], n[2]), "et plus au-delà").toBeLessThan(-80);
  });
});
