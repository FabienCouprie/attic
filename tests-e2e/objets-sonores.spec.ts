// tests-e2e/objets-sonores.spec.ts — Découpage en objets, réordonnancement et montage, dans l'application.
//
// CE QUI EST VERIFIE NE SE TESTE PAS HORS DE REACT : le rendu depend de l etat du GRAPHE — une
// arete branchee ou non sur un port de type courbe —, pas des seules donnees du noeud. Les deux
// cas sont donc joues dans l application, avec le meme graphe a une arete pres.
import { test, expect } from "@playwright/test";
import { spawn } from "child_process";

let devServer: ReturnType<typeof spawn> | null = null;
let devUrl = process.env.DEV_URL || "http://localhost:5175";

async function waitForServer(url: string, retries = 120): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try { const res = await fetch(url); if (res.ok) return; } catch { /* pas encore la */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server did not start at ${url}`);
}

test.beforeAll(async () => {
  if (process.env.DEV_URL) { await waitForServer(devUrl); return; }
  const port = 5175;
  devUrl = `http://localhost:${port}`;
  devServer = spawn("cmd", ["/c", "npm", "run", "dev", "--", "--port", String(port)], { cwd: process.cwd(), stdio: "pipe" });
  let log = "";
  devServer.stdout?.on("data", (d) => { log += d.toString(); });
  devServer.stderr?.on("data", (d) => { log += d.toString(); });
  for (let i = 0; i < 160; i++) {
    if (log.includes(`http://localhost:${port}`)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await waitForServer(devUrl);
});

test.afterAll(async () => {
  if (devServer) {
    devServer.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1000));
    if (devServer.exitCode === null) devServer.kill("SIGKILL");
  }
});

// Exécute un graphe et rend, pour chaque nœud nommé, son message et la durée de son aperçu.
async function executer(page: any, graphe: { nodes: any[]; edges: any[] }, attendre: string) {
  await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(graphe)]);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 20000 });
  await page.waitForFunction((n: number) => document.querySelectorAll(".react-flow__node").length >= n, graphe.nodes.length, { timeout: 15000 });
  await page.keyboard.press(" ");
  await page.waitForFunction((id: string) => !!(document.querySelector(`.react-flow__node[data-id="${id}"] audio`) as HTMLAudioElement | null)?.src,
    attendre, { timeout: 90000 });
  await page.waitForTimeout(500);
  return page.evaluate(async (ids: string[]) => {
    const r: Record<string, { texte: string; duree: number | null; erreur: boolean }> = {};
    for (const id of ids) {
      const n = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
      const a = n.querySelector("audio") as HTMLAudioElement | null;
      let duree: number | null = null;
      if (a?.src) {
        const b = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await (await fetch(a.src)).arrayBuffer());
        duree = b.duration;
      }
      r[id] = { texte: n.innerText, duree, erreur: n.className.includes("erreur") };
    }
    return r;
  }, graphe.nodes.map((x) => x.id));
}

const n = (id: string, ficheId: string, x: number, y: number, parametres: Record<string, unknown> = {}) =>
  ({ id, position: { x, y }, data: { ficheId, parametres } });
const e = (source: string, target: string, sortie: number, entree: number) =>
  ({ id: `${source}-${sortie}-${target}-${entree}`, source, target, sourceHandle: `out:${sortie}`, targetHandle: `in:${entree}` });

test.describe("objets sonores et montage", () => {
  test("HUIT CLICS, HUIT OBJETS ; réordonnés, ils redonnent un son de même durée", async ({ page }) => {
    test.setTimeout(120000);
    const r = await executer(page, {
      nodes: [
        n("src", "metronome", 0, 0, { Tempo: 120, "Durée": 4 }),
        n("dec", "decoupage-objets", 340, 0, { "Critère": "attaques" }),
        n("ord", "reordonner-objets", 700, 0, { Ordre: "sonie", Espace: 0 }),
      ],
      edges: [e("src", "dec", 0, 0), e("dec", "ord", 0, 0), e("dec", "ord", 1, 1)],
    }, "ord");
    console.log(JSON.stringify(r, null, 1));
    expect(r.dec.erreur).toBe(false);
    expect(r.dec.texte).toMatch(/8\sobjets/);
    expect(r.ord.erreur).toBe(false);
    expect(r.ord.texte).toMatch(/8\sobjets/);
    // Les objets vont d'une attaque à la suivante : sans espace, ils recouvrent le son depuis la
    // première attaque — à la durée du début muet près.
    expect(Math.abs(r.ord.duree! - r.dec.duree!)).toBeLessThan(0.1);
  });

  test("LE MONTAGE POSE CHAQUE PISTE À SON INSTANT", async ({ page }) => {
    test.setTimeout(120000);
    const r = await executer(page, {
      nodes: [
        n("a", "metronome", 0, 0, { "Durée": 2 }),
        n("b", "metronome", 0, 300, { "Durée": 3 }),
        n("mon", "montage", 360, 0, { "Début 1": 0, "Début 2": 5.5 }),
        // LA DURÉE SE MESURE EN AVAL, ET NON SUR LE MONTAGE LUI-MÊME. Sa vue est une LIGNE DE
        // TEMPS, avec son propre transport : elle ne rend aucun élément `audio`, et ce cas
        // attendait donc quatre-vingt-dix secondes un `src` qui ne viendrait jamais. Le montage
        // produit bien son son — « Sortie audio » le reçoit et l'expose.
        n("out", "sortie-audio", 720, 0),
      ],
      edges: [e("a", "mon", 0, 0), e("b", "mon", 0, 1), e("mon", "out", 0, 0)],
    }, "out");
    console.log(JSON.stringify(r, null, 1));
    expect(r.mon.erreur).toBe(false);
    expect(r.mon.texte).toMatch(/2\spistes/);
    // La seconde piste commence à 5,5 s et dure 3 s : 8,5 s en tout.
    expect(Math.abs(r.out.duree! - 8.5)).toBeLessThan(0.02);
  });

  test("LA LIGNE DE TEMPS MONTRE LES PISTES À LEUR PLACE, ET SE RÈGLE À LA SOURIS", async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1600, height: 900 });
    // L'INSPECTEUR RESTE ÉTROIT : déployé à 900 px sur un viewport de 1600, son panneau RECOUVRE le
    // nœud, et le glisser plus bas tombait sur un de ses curseurs au lieu de la ligne de temps. Les
    // libellés qu'on relit ici sont dans le document quelle que soit la largeur.
    await page.addInitScript(() => { try { localStorage.setItem("attic-inspecteur-largeur", "360"); } catch { /* */ } });
    await executer(page, {
      nodes: [
        n("a", "metronome", 0, 0, { "Durée": 2 }),
        n("b", "metronome", 0, 300, { "Durée": 3 }),
        n("mon", "montage", 360, 0, { "Début 1": 0, "Début 2": 5.5, "Fondu entrée 2": 200 }),
        // Même raison que ci-dessus : on attend l'audio en aval, le montage n'en rendant pas.
        n("out", "sortie-audio", 720, 0),
      ],
      edges: [e("a", "mon", 0, 0), e("b", "mon", 0, 1), e("mon", "out", 0, 0)],
    }, "out");
    await page.evaluate(() => {
      const nd = document.querySelector('.react-flow__node[data-id="mon"]') as HTMLElement;
      const r = nd.getBoundingClientRect();
      for (const type of ["mousedown", "mouseup", "click"]) nd.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + 10 }));
    });
    await page.waitForSelector(".ligne-temps-barre", { timeout: 5000 });
    const etat = () => page.evaluate(() => ({
      barres: [...document.querySelectorAll(".ligne-temps-barre")].map((b) => ({ x: +(b.getAttribute("x") ?? 0), w: +(b.getAttribute("width") ?? 0) })),
      inconnues: document.querySelectorAll(".ligne-temps-inconnue").length,
      labels: [...document.querySelectorAll(".inspecteur-param label")].map((l) => (l as HTMLElement).innerText.trim()),
      valeurs: Object.fromEntries([...document.querySelectorAll(".inspecteur-param")].map((d) => [
        (d.querySelector("label") as HTMLElement)?.innerText.trim(),
        (d.querySelector('input[type="number"], input:not([type="range"])') as HTMLInputElement | null)?.value])),
    }));
    const avant = await etat();
    console.log("avant:", JSON.stringify(avant));
    expect(avant.barres).toHaveLength(2);
    expect(avant.inconnues).toBe(0);
    // Durées réelles, 2 s et 3 s : des largeurs dans le rapport 2/3 ; la seconde commence à 5,5 s.
    const pxParS = avant.barres[0].w / 2;
    expect(Math.abs(avant.barres[1].w / avant.barres[0].w - 1.5)).toBeLessThan(0.02);
    expect(Math.abs((avant.barres[1].x - avant.barres[0].x) / pxParS - 5.5)).toBeLessThan(0.02);
    // Les réglages des pistes vides sont cachés.
    expect(avant.labels).toContain("Début 2");
    expect(avant.labels).toContain("Fondu sortie 2");
    expect(avant.labels).not.toContain("Début 3");
    expect(avant.labels).not.toContain("Fondu");

    // ═══ LE GLISSER, ET LE GARDE QUI MANQUAIT ═══
    //
    // LA CIBLE DOIT ÊTRE LA PREMIÈRE DE LA PILE SOUS LE POINTEUR. `boundingBox()` rend la géométrie
    // d'un élément sans regarder ce qui est posé dessus, et `page.mouse` n'a pas le contrôle
    // d'accessibilité de `locator.click()` : le glisser partait donc dans ce qui RECOUVRAIT la barre
    // — un curseur de l'inspecteur, large de 900 px sur un viewport de 1600 — et n'atteignait jamais
    // la ligne de temps. Mesuré : `ligne-temps-prise` restait à zéro, la prise ne se faisait pas, et
    // le cas accusait l'application d'un geste qu'il ne lui avait pas envoyé. C'est la raison de
    // l'inspecteur étroit posé plus haut, et de ce contrôle avant chaque geste.
    const dessus = async (x: number, y: number, classe: string) => page.evaluate(([px, py, cl]: [number, number, string]) => {
      const el = document.elementFromPoint(px, py);
      if (!el) return { pris: false, quoi: "rien" };
      const brut = el.className as unknown;
      const c = typeof brut === "string" ? brut : String((brut as { baseVal?: string })?.baseVal ?? "");
      return { pris: el.classList.contains(cl), quoi: `${el.tagName.toLowerCase()}.${c}` };
    }, [x, y, classe] as [number, number, string]);

    // Tirer la seconde barre de 100 px vers la gauche.
    const barre = page.locator(".ligne-temps-barre").nth(1);
    const b = (await barre.boundingBox())!;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const surLaBarre = await dessus(cx, cy, "ligne-temps-barre");
    expect(surLaBarre.pris, `la barre est recouverte par ${surLaBarre.quoi} : le glisser irait dessus`).toBe(true);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    // LA PRISE SE VÉRIFIE AVANT DE BOUGER : `saisir` pose l'état, et `bouger` ne fait rien sans lui.
    await expect(page.locator(".ligne-temps-prise")).toHaveCount(1);
    await page.mouse.move(cx - 50, cy, { steps: 3 });
    await page.mouse.move(cx - 100, cy, { steps: 3 });
    await page.mouse.up();

    // CE QUE LE GESTE A ÉCRIT SE LIT SUR LE DESSIN, ET NON DANS LES RÉGLAGES. Le montage tient ses
    // pièces dans un modèle de MORCEAUX : `LigneDeTemps.lacher` écrit
    // `onMorceaux(remplacerMorceau(...))` dès que la prise porte un morceau, et ne retombe sur
    // `onChanger(nom, valeur)` que sinon. « Début 2 » garde donc sa valeur de DÉPART, et c'est la
    // légende de la pièce qui porte sa position courante. Ce cas relisait le réglage : il ne pouvait
    // plus voir le geste.
    const debutDessine = async () => {
      const t = (await page.locator(".ligne-temps-legende").nth(1).textContent()) ?? "";
      const m = /^\s*([\d,]+)\s*s/.exec(t);
      expect(m, `la légende de la seconde pièce ne se lit pas : « ${t} »`).not.toBeNull();
      return Number(m![1].replace(",", "."));
    };
    const apres = await debutDessine();
    console.log("début 2 dessiné :", apres, "— réglage :", (await etat()).valeurs["Début 2"]);
    // LE SENS ET L'ORDRE DE GRANDEUR, ET NON LA SECONDE EXACTE : `bouger` divise l'écart par
    // `echelleDuDessin()`, l'échelle que React Flow applique au nœud. Cent pixels d'écran ne valent
    // donc pas cent pixels de dessin, et le compte dépend du zoom du canevas au moment du geste.
    // Mesuré ici : 5,50 s devient 3,47 s, soit 2,03 s pour cent pixels à l'échelle 0,93.
    expect(5.5 - apres).toBeGreaterThan(1.5);
    expect(5.5 - apres).toBeLessThan(2.5);

    // Tirer la poignée du fondu d'entrée de la seconde piste de 50 px vers la droite. SON EFFET
    // N'EST PAS TENU ICI, ET C'EST SIGNALÉ : un fondu ne change pas la durée du montage, et
    // l'éprouver demande d'écouter le son. Le geste reste joué — il ne doit rien casser, et
    // l'assertion de durée qui suit le prouve.
    const poignee = page.locator(".ligne-temps-piste").nth(1).locator(".ligne-temps-poignee").first();
    const q = (await poignee.boundingBox())!;
    const qx = q.x + q.width / 2;
    const qy = q.y + q.height / 2;
    const surLaPoignee = await dessus(qx, qy, "ligne-temps-poignee");
    expect(surLaPoignee.pris, `la poignée est recouverte par ${surLaPoignee.quoi}`).toBe(true);
    await page.mouse.move(qx, qy);
    await page.mouse.down();
    await page.mouse.move(qx + 50, qy, { steps: 3 });
    await page.mouse.up();

    // ET LE DESSIN S'ACCORDE AU SON : relancé, le montage va de zéro à la fin de la seconde pièce,
    // qui tient 3 s. C'est l'assertion qui lie le geste à ce qu'on ENTEND, et elle ne dépend
    // d'aucune échelle. Mesuré : 8,50 s avant le geste, 6,47 s après.
    //
    // LE BOUTON, NON LA BARRE D'ESPACE : prendre un morceau donne le focus à la ligne de temps, ce
    // qui ARME SES RACCOURCIS. L'espace lui parle alors, au lieu de lancer le graphe.
    await page.click(".attic-btn-lancer");
    await page.waitForFunction((attendue: number) => {
      const t = document.querySelector('.react-flow__node[data-id="mon"]')?.textContent ?? "";
      const m = /·\s*([\d.]+)\s*s/.exec(t);
      return !!m && Math.abs(Number(m[1]) - attendue) < 0.05;
    }, apres + 3, { timeout: 30000 });
    await page.screenshot({ path: "test-results/ligne-de-temps.png" });
  });
});
