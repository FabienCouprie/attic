// tests-e2e/mandelbrot.spec.ts — Le mappeur Mandelbrot, dans l application.
//
// CE QUI EST VERIFIE NE SE TESTE PAS HORS DE REACT : le rendu depend de l etat du GRAPHE — une
// arete branchee ou non sur un port de type courbe —, pas des seules donnees du noeud. Les deux
// cas sont donc joues dans l application, avec le meme graphe a une arete pres.
import { test, expect } from "@playwright/test";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5218);

async function rendre(page: any, parametres: Record<string, unknown>) {
  const graphe = { nodes: [{ id: "x", position: { x: 0, y: 0 }, data: { ficheId: "mappeur-mandelbrot", parametres } }], edges: [] };
  await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(graphe)]);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length >= 1, { timeout: 15000 });
  await page.keyboard.press(" ");
  await page.waitForFunction(() => !!(document.querySelector('.react-flow__node[data-id="x"] audio') as HTMLAudioElement | null)?.src, null, { timeout: 90000 });
  return page.evaluate(async () => {
    const a = document.querySelector('.react-flow__node[data-id="x"] audio') as HTMLAudioElement;
    const b = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await (await fetch(a.src)).arrayBuffer());
    const x = b.getChannelData(0);
    // La fréquence dominante de la première note, par passages par zéro : Do4 = 261,6 Hz.
    let passages = 0;
    const fin = Math.round(0.2 * b.sampleRate);
    for (let i = 1; i < fin; i++) if (x[i - 1] < 0 && x[i] >= 0) passages++;
    const n = document.querySelector('.react-flow__node[data-id="x"]') as HTMLElement;
    return { duree: b.duration, f0: passages / 0.2, erreur: n.className.includes("erreur"), empreinte: Array.from(x.subarray(4000, 4100)) };
  });
}

test.describe("mappeur Mandelbrot, dans l'application", () => {
  test("RÉGLAGES PAR DÉFAUT : ça sonne, sans erreur, dans le registre de Do4 et au-dessus", async ({ page }) => {
    test.setTimeout(120000);
    const r = await rendre(page, {});
    console.log(JSON.stringify({ duree: r.duree, f0: r.f0 }));
    expect(r.erreur).toBe(false);
    expect(r.duree).toBeGreaterThan(5);
    // « Octave 4 » sonne bien en Do4 (261,6 Hz) : l'ancien calcul le plaçait une octave plus bas.
    expect(Math.abs(r.f0 - 261.6)).toBeLessThan(15);
  });

  test("LE TIMBRE CHANGE LE SON", async ({ browser }) => {
    test.setTimeout(120000);
    const douce = await rendre(await browser.newPage(), { Timbre: "douce" });
    const perc = await rendre(await browser.newPage(), { Timbre: "percutante" });
    const ecart = Math.max(...douce.empreinte.map((v: number, i: number) => Math.abs(v - perc.empreinte[i])));
    console.log("écart douce / percutante :", ecart);
    expect(ecart).toBeGreaterThan(0.01);
  });
});
