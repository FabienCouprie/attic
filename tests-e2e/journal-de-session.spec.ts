// tests-e2e/journal-de-session.spec.ts — Le travail survit à une fermeture, DANS L'APPLICATION.
//
// ═══ POURQUOI CE CAS EXISTE ═══
//
// Point 9 de la revue critique : sans fichier ouvert, fermer l'application perdait tout depuis le
// dernier enregistrement manuel. Vérifié plus grave que décrit — il n'y avait ni `beforeunload`, ni
// `pagehide`, ni minuteur, et `window-all-closed` appelle `app.quit()` sans rien demander au rendu.
//
// LES CAS UNITAIRES ÉPROUVENT LA RÈGLE, PAS SON CÂBLAGE. `journal-de-session.test.ts` tient
// l'armement, le délai et le vidage ; rien n'y dit que l'application s'en sert. Ce cas-ci fait le
// geste : on pose un nœud, on recharge la page — ce qui est, pour le rendu, exactement une
// fermeture —, et l'on regarde si le nœud est encore là.
//
// ET IL ÉPROUVE LA RÈGLE DANGEREUSE DANS LE BON SENS : qu'un démarrage sur un en-cours existant ne
// l'écrase pas par du vide avant la fin de la restauration, qui est asynchrone. C'est la faute que
// ce journal pouvait introduire, et elle aurait détruit du travail au lieu d'en sauver.
import { expect, test } from "@playwright/test";

import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5247);

/** Un graphe d'un nœud, dans la forme de l'en-cours relu au démarrage. */
const UN_NOEUD = JSON.stringify({
  nodes: [{
    id: "noeud-1", type: "atelier", position: { x: 120, y: 120 }, width: 300, height: 200,
    data: { ficheId: "oscillateur", parametres: { Forme: "Sinus" } },
  }],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  date: new Date().toISOString(),
});

test.describe("le journal de session", () => {
  test.setTimeout(180_000);

  test("CE QU ON POSE SURVIT A UN RECHARGEMENT, sans aucun enregistrement manuel", async ({ page }) => {
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 60_000 });
    // ON PART D'UN DISQUE PROPRE : sans cela, ce cas lirait l'en-cours d'une exécution précédente.
    await page.evaluate(() => localStorage.removeItem("attic-encours"));
    await page.reload();
    await page.waitForSelector(".react-flow", { timeout: 60_000 });
    await page.waitForTimeout(2000);
    expect(await page.locator(".react-flow__node").count(), "on démarre bien sur un canevas vide")
      .toBe(0);

    // ═══ LE GESTE : on pose un nœud, et l'on n'enregistre rien ═══
    //
    // On passe par le même chemin que l'ouverture d'un exemple côté rendu : l'en-cours est la forme
    // que l'application relit. Poser un nœud à la souris demanderait de piloter la palette, ce qui
    // mesurerait la palette et non le journal.
    await page.evaluate((g) => localStorage.setItem("attic-encours", g as string), UN_NOEUD);
    await page.reload();
    await page.waitForSelector(".react-flow", { timeout: 60_000 });
    await page.waitForTimeout(2500);
    expect(await page.locator(".react-flow__node").count(), "le nœud est posé").toBe(1);

    // On déplace le nœud : un changement du graphe, et rien d'autre. Puis on recharge SANS rien
    // enregistrer — pour le rendu, un rechargement est une fermeture.
    const avant = await page.evaluate(() => {
      const brut = localStorage.getItem("attic-encours");
      return brut ? (JSON.parse(brut).nodes?.[0]?.position?.x ?? null) : null;
    });
    const transformeAvant = await page.locator(".react-flow__node").first()
      .evaluate((e) => (e as HTMLElement).style.transform);
    // ON SAISIT LE NŒUD PAR SON BORD HAUT, et c'est une correction. Un glisser pris au CENTRE du
    // nœud n'en déplaçait aucun : le corps d'un nœud porte des éléments marqués `nodrag`, qui
    // arrêtent l'événement de pointeur pour que les champs et les lecteurs restent utilisables.
    // La transformée est restée `translate(120px, 120px)` avant comme après, et j'ai failli en
    // accuser le journal.
    const boite = await page.locator(".react-flow__node").first().boundingBox();
    expect(boite, "le nœud n'a pas de boîte").toBeTruthy();
    await page.mouse.move(boite!.x + boite!.width / 2, boite!.y + 6);
    await page.mouse.down();
    await page.mouse.move(600, 420, { steps: 12 });
    await page.mouse.up();
    // Le délai du journal est de 1500 ms : on attend qu'il soit échu.
    await page.waitForTimeout(2500);
    const transformeApres = await page.locator(".react-flow__node").first()
      .evaluate((e) => (e as HTMLElement).style.transform);
    // ON VÉRIFIE D'ABORD QUE LE GESTE A PORTÉ. Sans cela, un glisser qui n'attrape pas le nœud
    // ferait accuser le journal de ne pas écrire — un faux diagnostic, et c'est l'instrument qui
    // serait en cause.
    console.log(`transformée : avant=${transformeAvant} · après=${transformeApres}`);
    expect(transformeApres, "le glisser n'a pas déplacé le nœud : c'est l'instrument, pas le journal")
      .not.toBe(transformeAvant);

    const apres = await page.evaluate(() => {
      const brut = localStorage.getItem("attic-encours");
      return brut ? (JSON.parse(brut).nodes?.[0]?.position?.x ?? null) : null;
    });
    console.log(`position dans l'en-cours : avant=${avant} · après le déplacement=${apres}`);
    expect(apres, [
      "",
      "Le déplacement du nœud n'a pas été journalisé.",
      "",
      "`ui/journal-de-session.ts` doit s'armer sur le premier graphe non vide, puis écrire",
      "`attic-encours` après chaque changement. S'il ne le fait pas, fermer l'application perd tout",
      "ce qui a été fait depuis le dernier enregistrement manuel.",
      "",
    ].join("\n")).not.toBe(avant);

    // ET CE QUI EST JOURNALISÉ REVIENT. C'est la moitié qui compte pour l'utilisateur.
    await page.reload();
    await page.waitForSelector(".react-flow", { timeout: 60_000 });
    await page.waitForTimeout(2500);
    expect(await page.locator(".react-flow__node").count(), "le nœud revient après le rechargement")
      .toBe(1);
    const revenu = await page.evaluate(() => {
      const brut = localStorage.getItem("attic-encours");
      return brut ? (JSON.parse(brut).nodes?.[0]?.position?.x ?? null) : null;
    });
    expect(revenu, "et à la place où on l'avait laissé").toBe(apres);

    // ═══ CE QU'UNE ÉCRITURE COÛTE, puisque c'est ce qui fixe le délai ═══
    //
    // Le délai de 1500 ms est un arbitrage : plus court, on paie plusieurs écritures pour un seul
    // geste ; plus long, ce qu'on risque de perdre se sent. Ce relevé dit l'ordre de grandeur du
    // coût, pour qu'on ne discute pas le délai à l'aveugle.
    const cout = await page.evaluate(() => {
      const brut = localStorage.getItem("attic-encours") ?? "";
      const objet = JSON.parse(brut);
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) localStorage.setItem("attic-mesure-journal", JSON.stringify(objet));
      const ms = (performance.now() - t0) / 20;
      localStorage.removeItem("attic-mesure-journal");
      return { octets: brut.length, ms: Math.round(ms * 1000) / 1000 };
    });
    console.log(`coût d'une écriture : ${cout.octets} octets · ${cout.ms} ms (sérialisation + stockage)`);
    expect(cout.octets, "l'en-cours doit porter quelque chose").toBeGreaterThan(50);
  });

  test("ET UNE FERMETURE DANS LE DELAI NE PERD RIEN : le journal se vide avant de partir", async ({ page }) => {
    // ═══ CE CAS GARDE LE FILET, et sans lui le délai serait une perte garantie ═══
    //
    // Le cas précédent attend 2500 ms, donc le délai de 1500 ms s'écoule tout seul : il n'éprouve
    // pas le vidage. Ici l'on ferme AUSSITÔT après le geste, dans la fenêtre du délai. Ce qui doit
    // sauver le travail est alors `pagehide`/`beforeunload`, et rien d'autre.
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 60_000 });
    await page.evaluate((g) => localStorage.setItem("attic-encours", g as string), UN_NOEUD);
    await page.reload();
    await page.waitForSelector(".react-flow", { timeout: 60_000 });
    await page.waitForTimeout(2500);

    const boite = await page.locator(".react-flow__node").first().boundingBox();
    await page.mouse.move(boite!.x + boite!.width / 2, boite!.y + 6);
    await page.mouse.down();
    await page.mouse.move(640, 300, { steps: 10 });
    await page.mouse.up();
    // PAS D'ATTENTE : on part dans la fenêtre du délai.
    await page.reload();
    await page.waitForSelector(".react-flow", { timeout: 60_000 });
    await page.waitForTimeout(2500);

    const x = await page.evaluate(() => {
      const brut = localStorage.getItem("attic-encours");
      return brut ? (JSON.parse(brut).nodes?.[0]?.position?.x ?? null) : null;
    });
    console.log(`position après une fermeture dans le délai : ${x}`);
    expect(x, [
      "",
      "Le déplacement fait juste avant la fermeture est perdu.",
      "",
      "C'est ce que `pagehide` et `beforeunload` existent pour rattraper : sans eux, tout geste fait",
      "dans les 1500 ms précédant la fermeture part avec elle.",
      "",
    ].join("\n")).not.toBe(120);
  });

  test("ET UN DEMARRAGE N ECRASE PAS L EN-COURS PAR DU VIDE, la restauration etant asynchrone", async ({ page }) => {
    // ═══ LA FAUTE QUE CE JOURNAL POUVAIT INTRODUIRE ═══
    //
    // `App.tsx` restaure l'en-cours dans un effet ASYNCHRONE : au montage, le graphe est vide. Un
    // journal qui écrirait au premier changement écrirait `{ nodes: [] }` par-dessus la session —
    // il détruirait ce qu'il est censé sauver, et en silence.
    //
    // ON MESURE DONC L'INVERSE DU CAS PRÉCÉDENT : que l'en-cours posé AVANT le démarrage soit encore
    // là, intact, une fois l'application montée.
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 60_000 });
    await page.evaluate((g) => localStorage.setItem("attic-encours", g as string), UN_NOEUD);
    await page.reload();
    await page.waitForSelector(".react-flow", { timeout: 60_000 });
    // On laisse passer plusieurs fois le délai du journal, sans toucher à rien.
    await page.waitForTimeout(6000);

    const garde = await page.evaluate(() => {
      const brut = localStorage.getItem("attic-encours");
      if (!brut) return { present: false, noeuds: 0 };
      return { present: true, noeuds: (JSON.parse(brut).nodes ?? []).length };
    });
    console.log(`en-cours après un démarrage sans geste : ${JSON.stringify(garde)}`);
    expect(garde.present, "l'en-cours a été effacé par le démarrage").toBe(true);
    expect(garde.noeuds, [
      "",
      "L'EN-COURS A ÉTÉ ÉCRASÉ PAR UN GRAPHE VIDE.",
      "",
      "C'est la destruction que l'armement du journal existe pour empêcher : il ne doit s'armer que",
      "sur un graphe NON VIDE, parce que le graphe est vide au montage et se remplit ensuite.",
      "",
    ].join("\n")).toBe(1);
    expect(await page.locator(".react-flow__node").count(), "et le nœud est bien à l'écran").toBe(1);
  });
});
