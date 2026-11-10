// tests-e2e/demonstration.spec.ts — Le nœud Démonstration rend une vraie vidéo, dans l'application.
//
// CE QUI NE SE TESTE PAS HORS DU NAVIGATEUR : le dessin sur une toile et l'encodage WebCodecs. On
// pose donc un petit graphe — un son, un tremolo, une courbe, un texte, et la démonstration —, on
// le lance, et on relit la vidéo produite avec une balise <video> : durée, taille, piste son.
import { test, expect, type Page } from "@playwright/test";
import { serveurDeVerification } from "./serveur-de-developpement";

// Le partage de l'onglet accepté sans demander, et une fenêtre VISIBLE : Chromium sans affichage ne
// peint la page que quand on lui demande une capture d'écran, et un film de la fenêtre n'y reçoit
// presque aucune image. Constaté : 13 s de film pour 27 s filmées.
test.use({ channel: "chromium", headless: false, launchOptions: { args: ["--auto-accept-this-tab-capture", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"] }, viewport: { width: 1280, height: 800 } });

const devUrl = serveurDeVerification(5209);

const arete = (source: string, target: string, port = 0) =>
  ({ id: `${source}-${target}-${port}`, source, target, sourceHandle: "out:0", targetHandle: `in:${port}` });

test.describe("démonstration, dans l'application", () => {
  test("QUATRE NŒUDS, QUATRE SEGMENTS : une vidéo WebM de la bonne durée, avec son et image", async ({ page }) => {
    test.setTimeout(240000);
    const graphe = {
      nodes: [
        { id: "demo", position: { x: 0, y: 400 }, data: { ficheId: "demonstration", parametres: { "Durée par nœud": 3, "Titre": "Essai", "Résolution": "480p" } } },
        { id: "koch", position: { x: 0, y: 0 }, data: { ficheId: "arpege-koch", parametres: {} } },
        { id: "trem", position: { x: 300, y: 0 }, data: { ficheId: "tremolo", parametres: {} } },
        { id: "courbe", position: { x: 600, y: 0 }, data: { ficheId: "generateur-courbe", parametres: {} } },
        { id: "texte", position: { x: 900, y: 0 }, data: { ficheId: "source-texte", parametres: {} } },
      ],
      edges: [arete("koch", "trem")],
    };
    await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(graphe)]);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length >= 5, { timeout: 15000 });
    const debut = Date.now();
    await page.keyboard.press(" ");
    await page.waitForFunction(() => !!(document.querySelector('.react-flow__node[data-id="demo"] video') as HTMLVideoElement | null)?.src, null, { timeout: 200000 });
    const rendu = (Date.now() - debut) / 1000;
    const r = await page.evaluate(async () => {
      const v = document.querySelector('.react-flow__node[data-id="demo"] video') as HTMLVideoElement;
      const blob = await (await fetch(v.src)).blob();
      const tete = Array.from(new Uint8Array(await blob.slice(0, 4).arrayBuffer()));
      if (v.readyState < 1) await new Promise((ok) => v.addEventListener("loadedmetadata", ok, { once: true }));
      // Un WebM écrit d'un trait annonce sa durée ; on la lit, puis on vérifie qu'une image se décode.
      let duree = v.duration;
      if (!Number.isFinite(duree)) { v.currentTime = 1e9; await new Promise((ok) => v.addEventListener("durationchange", ok, { once: true })); duree = v.duration; }
      v.currentTime = 7.5;
      await new Promise((ok) => v.addEventListener("seeked", ok, { once: true }));
      const toile = document.createElement("canvas"); toile.width = v.videoWidth; toile.height = v.videoHeight;
      const c = toile.getContext("2d")!; c.drawImage(v, 0, 0);
      const px = c.getImageData(0, 0, toile.width, toile.height).data;
      let clairs = 0; for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 300) clairs++;
      const noeud = document.querySelector('.react-flow__node[data-id="demo"]') as HTMLElement;
      return {
        taille: blob.size, type: blob.type, tete, duree, largeur: v.videoWidth, hauteur: v.videoHeight,
        clairs, message: noeud.innerText, erreur: noeud.className.includes("erreur"),
        son: (v as any).mozHasAudio ?? ((v as any).webkitAudioDecodedByteCount ?? -1),
      };
    });
    console.log(JSON.stringify({ ...r, rendu }));
    // Des images de chaque segment, pour les regarder : carton, son, son traité, courbe, texte.
    const images: string[] = await page.evaluate(async () => {
      const v = document.querySelector('.react-flow__node[data-id="demo"] video') as HTMLVideoElement;
      const sorties: string[] = [];
      for (const t of [1.5, 4.5, 7.5, 10.5, 13.5]) {
        v.currentTime = t;
        await new Promise((ok) => v.addEventListener("seeked", ok, { once: true }));
        const toile = document.createElement("canvas"); toile.width = v.videoWidth; toile.height = v.videoHeight;
        toile.getContext("2d")!.drawImage(v, 0, 0);
        sorties.push(toile.toDataURL("image/png"));
      }
      return sorties;
    });
    const fs = await import("fs");
    fs.mkdirSync("test-results/demonstration", { recursive: true });
    images.forEach((u, i) => fs.writeFileSync(`test-results/demonstration/segment-${i}.png`, Buffer.from(u.split(",")[1], "base64")));
    expect(r.erreur).toBe(false);
    expect(r.type).toBe("video/webm");
    expect(r.tete).toEqual([0x1a, 0x45, 0xdf, 0xa3]); // en-tête EBML d'un WebM
    expect(r.largeur).toBe(854);
    expect(r.hauteur).toBe(480);
    // Carton de 3 s, puis koch, tremolo, courbe, texte : 3 + 4 × 3 = 15 s.
    expect(Math.abs(r.duree - 15)).toBeLessThan(0.1);
    expect(r.message).toContain("4");
    // À 7,5 s, le segment du tremolo : du texte et une forme d'onde claire sur fond sombre.
    expect(r.clairs).toBeGreaterThan(500);
  });
});

// LE FILM DE L'APPLICATION : la vraie fenêtre filmée pendant que le graphe se reconstruit puis se joue.
// Chromium accepte ici le partage de l'onglet sans demander (drapeau de lancement), ce qu'un
// utilisateur fait d'un clic ; dans Electron, la fenêtre se filme elle-même sans rien demander.
test.describe("démonstration filmée de l'application", () => {
  test("CONSTRUCTION PUIS VISITE : un film WebM de la fenêtre, et le graphe rendu intact", async ({ page }) => {
    test.setTimeout(240000);
    const graphe = {
      nodes: [
        { id: "film", position: { x: 0, y: 420 }, data: { ficheId: "film-application", parametres: { "Durée par nœud": 2, "Titre": "Essai" } } },
        { id: "koch", position: { x: 0, y: 0 }, data: { ficheId: "arpege-koch", parametres: {} } },
        { id: "trem", position: { x: 340, y: 0 }, data: { ficheId: "tremolo", parametres: {} } },
        { id: "courbe", position: { x: 680, y: 0 }, data: { ficheId: "generateur-courbe", parametres: {} } },
      ],
      edges: [arete("koch", "trem")],
    };
    await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(graphe)]);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length >= 4, { timeout: 15000 });

    page.on("dialog", async (d) => { console.log("DIALOGUE :", d.message()); await d.dismiss(); });
    // Pendant le film, les légendes successives. Pas de capture d'écran ici : elle ralentirait la
    // page filmée.
    const debut = Date.now();
    await page.locator('.react-flow__node[data-id="film"] .attic-demo-filmer').click();
    const legendes: string[] = [];
    while (Date.now() - debut < 200000) {
      const fini = await page.evaluate(() => !!document.querySelector('.react-flow__node[data-id="film"] .attic-demo-bloc video'));
      if (fini) break;
      const l = await page.evaluate(() => document.querySelector(".demo-legende")?.textContent ?? "");
      if (l && legendes[legendes.length - 1] !== l) legendes.push(l);
      await page.waitForTimeout(250);
    }
    const duree = (Date.now() - debut) / 1000;
    console.log("LÉGENDES :", legendes.length, legendes.slice(-2).join(" | "));
    const r = await page.evaluate(async () => {
      const v = document.querySelector('.react-flow__node[data-id="film"] .attic-demo-bloc video') as HTMLVideoElement;
      const blob = await (await fetch(v.src)).blob();
      if (v.readyState < 1) await new Promise((ok) => v.addEventListener("loadedmetadata", ok, { once: true }));
      return {
        taille: blob.size, type: blob.type, duree: v.duration, largeur: v.videoWidth, hauteur: v.videoHeight,
        noeuds: document.querySelectorAll(".react-flow__node").length,
        aretes: document.querySelectorAll(".react-flow__edge").length,
        calque: !!document.querySelector(".demo-calque"),
      };
    });
    console.log(JSON.stringify({ ...r, duree_reelle: duree, legendes }));
    // Planche contact du film : une image par seconde, pour le regarder.
    const planche: string = await page.evaluate(async () => {
      const v = document.querySelector('.react-flow__node[data-id="film"] .attic-demo-bloc video') as HTMLVideoElement;
      const n = Math.max(1, Math.floor(v.duration)), col = 5, w = 320, h = Math.round(320 * v.videoHeight / v.videoWidth);
      const toile = document.createElement("canvas"); toile.width = col * w; toile.height = Math.ceil(n / col) * (h + 18);
      const c = toile.getContext("2d")!; c.fillStyle = "#000"; c.fillRect(0, 0, toile.width, toile.height);
      for (let i = 0; i < n; i++) {
        v.currentTime = i + 0.5;
        await new Promise((ok) => v.addEventListener("seeked", ok, { once: true }));
        const x = (i % col) * w, y = Math.floor(i / col) * (h + 18);
        c.drawImage(v, x, y, w, h); c.fillStyle = "#fff"; c.font = "13px sans-serif"; c.fillText(`${i + 0.5} s`, x + 4, y + h + 14);
      }
      return toile.toDataURL("image/png");
    });
    const fs = await import("fs");
    fs.mkdirSync("test-results/demonstration-app", { recursive: true });
    fs.writeFileSync("test-results/demonstration-app/planche.png", Buffer.from(planche.split(",")[1], "base64"));

    expect(r.type).toBe("video/webm");
    expect(r.largeur).toBeGreaterThan(0);
    // Réindexé : la durée est connue, et proche du temps réellement filmé.
    expect(Number.isFinite(r.duree)).toBe(true);
    expect(r.duree).toBeGreaterThan(duree * 0.6);
    // Le graphe est rendu tel qu'il était : quatre nœuds, un câble, plus de calque.
    expect(r.noeuds).toBe(4);
    expect(r.aretes).toBe(1);
    expect(r.calque).toBe(false);
    // Les légendes ont raconté la construction puis la visite, dans l'ordre du signal.
    const texte = legendes.join(" | ");
    expect(texte).toMatch(/On ajoute « Arpège flocon de Koch »/);
    expect(texte.indexOf("On relie « Arpège flocon de Koch » à « Tremolo »")).toBeGreaterThan(texte.indexOf("On ajoute « Tremolo »"));
    expect(texte).toMatch(/On lance le graphe/);
    expect(texte.indexOf("« Tremolo » : son résultat")).toBeGreaterThan(texte.indexOf("On lance le graphe"));
  });
});

// LE FILM PRÉCÉDENT ET L'HISTORIQUE, point A6 de la revue du 2026-10-31. Le film remplacé était
// révoqué au tournage suivant, alors qu'une entrée d'annulation le tenait : un Ctrl+Z rendait la
// démonstration sur un film mort. Il naît désormais par le registre de `ui/urls-medias.ts`, qui ne le
// révoque que quand plus rien ne le tient. Le critère : une adresse révoquée ne se lit plus.
test.describe("le film de l'application, et l'annulation", () => {
  // Le presse-papiers, pour couper un nœud.
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });
  const ids = (page: Page) => page.evaluate(() =>
    [...document.querySelectorAll(".react-flow__node")].map((n) => n.getAttribute("data-id")!).sort());
  const lire = (page: Page, url: string) => page.evaluate(async (u) => {
    try { return (await (await fetch(u)).arrayBuffer()).byteLength; } catch { return -1; }
  }, url);
  const filmDe = (page: Page) => page.evaluate(() =>
    (document.querySelector('.react-flow__node[data-id="film"] .attic-demo-bloc video') as HTMLVideoElement | null)?.getAttribute("src") ?? "");
  /** Tourne le film et rend son adresse, une fois le graphe revenu. */
  async function filmer(page: Page, avant: string): Promise<string> {
    await page.locator('.react-flow__node[data-id="film"] .attic-demo-filmer').click();
    await expect.poll(() => filmDe(page), { timeout: 200000, intervals: [500] }).not.toBe(avant);
    await expect.poll(() => page.evaluate(() => !document.querySelector(".demo-calque")), { timeout: 20000 }).toBe(true);
    return filmDe(page);
  }
  /** Le balayage du registre part un quart de seconde après le dernier changement des nœuds. */
  const laisserBalayer = (page: Page) => page.waitForTimeout(1000);
  /**
   * Recadre sur tout le graphe, et attend que la vue soit posée. MESURÉ : après un tournage, la vue
   * n'est pas celle d'avant, et un nœud peut se trouver hors de l'écran.
   */
  async function cadrer(page: Page) {
    await page.locator(".react-flow__controls-fitview").click();
    const transformation = () => page.evaluate(() =>
      (document.querySelector(".react-flow__viewport") as HTMLElement | null)?.style.transform ?? "");
    let avant = "";
    await expect.poll(async () => {
      const maintenant = await transformation();
      const stable = maintenant !== "" && maintenant === avant;
      avant = maintenant;
      return stable;
    }, { timeout: 15000, intervals: [400] }).toBe(true);
  }
  /** Retire un nœud par la touche donnée, Suppr ou Ctrl+X, après l'avoir sélectionné seul. */
  async function retirer(page: Page, id: string, touche: "Delete" | "Control+x") {
    await cadrer(page);
    const p = await page.evaluate((id) => {
      const r = document.querySelector(`.react-flow__node[data-id="${id}"]`)!.getBoundingClientRect();
      for (let fy = 0.05; fy < 1; fy += 0.05) for (let fx = 0.03; fx < 1; fx += 0.05) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy;
        const el = document.elementFromPoint(x, y);
        if (el?.closest(".react-flow__node")?.getAttribute("data-id") === id
          && !el.closest("input,textarea,select,button,label,canvas,audio,video,.react-flow__handle,.nodrag")) return { x, y };
      }
      const centre = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { diag: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} sous le centre : ${centre?.tagName}.${centre?.className}` };
    }, id);
    expect("diag" in p ? p.diag : "", `aucun point libre sur ${id}`).toBe("");
    const { x, y } = p as { x: number; y: number };
    await page.mouse.click(x, y);
    await expect.poll(() => page.evaluate(() =>
      [...document.querySelectorAll(".react-flow__node.selected")].map((n) => n.getAttribute("data-id")).join(",")),
    { message: `seul ${id} est sélectionné`, timeout: 5000 }).toBe(id);
    await page.keyboard.press(touche);
    await expect.poll(() => ids(page)).not.toContain(id);
  }

  test("TENU PAR L'HISTORIQUE, LE FILM PRÉCÉDENT SURVIT : Ctrl+Z le rend lisible ; lâché, le suivant part", async ({ page }) => {
    test.setTimeout(420000);
    const graphe = {
      nodes: [
        { id: "film", position: { x: 0, y: 420 }, data: { ficheId: "film-application", parametres: { "Durée par nœud": 1, "Titre": "" } } },
        { id: "courbe", position: { x: 0, y: 0 }, data: { ficheId: "generateur-courbe", parametres: {} } },
        // Une « Entrée audio », parce qu'elle garde une surface libre où cliquer : la courbe, une fois
        // lancée par le film, est couverte de son dessin.
        { id: "z", position: { x: 400, y: 0 }, data: { ficheId: "entree-audio", parametres: { Chemin: "" } } },
      ],
      edges: [],
    };
    await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(graphe)]);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    await expect.poll(() => ids(page), { timeout: 15000 }).toEqual(["courbe", "film", "z"]);
    page.on("dialog", async (d) => { await d.dismiss(); });

    const premier = await filmer(page, "");
    await retirer(page, "z", "Delete");
    const second = await filmer(page, premier);
    await laisserBalayer(page);
    expect(await lire(page, premier), "l'instantané de la suppression tient le premier film").toBeGreaterThan(0);

    await page.keyboard.press("Control+z");
    await expect.poll(() => ids(page)).toEqual(["courbe", "film", "z"]);
    await laisserBalayer(page);
    expect(await filmDe(page), "Ctrl+Z rend la démonstration avec son premier film").toBe(premier);
    expect(await lire(page, premier), "et il se lit").toBeGreaterThan(0);

    // UNE ACTION NEUVE EFFACE LA PILE DE RÉTABLISSEMENT, seule à tenir le second film : il part.
    // UNE COUPE ET NON UNE SUPPRESSION : MESURÉ, la première pression de Suppr qui suit ce Ctrl+Z est
    // perdue, quel que soit le nœud visé, et la suivante prend. Relevé à part, hors du point A6.
    await retirer(page, "courbe", "Control+x");
    await expect.poll(() => lire(page, second), { message: "lâché par tous, le second film est révoqué", timeout: 5000 }).toBe(-1);
    expect(await lire(page, premier), "le premier, que le canevas tient, se lit toujours").toBeGreaterThan(0);
  });
});
