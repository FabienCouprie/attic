// tests-e2e/assaisonnement.spec.ts — L'assaisonnement déplace-t-il le son dans l'application ?
//
// Les tests unitaires le mesurent déjà sur des tampons ; ce qui se vérifie ici est la chaîne
// entière dans le vrai moteur : un son généré, assaisonné, puis REMESURÉ PAR UN AUTRE NŒUD que
// celui qui l'a transformé. Le nœud de mesure n'a pas connaissance de la transformation, et son
// verdict est donc indépendant de celle-ci.
//
// Un port différent de celui de Fabien (5175), dont le serveur ne doit pas être touché.
import { test, expect } from "@playwright/test";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5202);

/** Un son tenu, ni très haut ni très bas : de la place pour bouger dans les deux sens. */
const GEN = { ficheId: "generateur-frequence", parametres: { "Durée": 3, "Fréquence": 330 } };

const GRAPHE = {
  nodes: [
    { id: "gen", position: { x: 0, y: 200 }, data: GEN },
    { id: "temoin", position: { x: 320, y: 0 }, data: { ficheId: "gout-du-son", parametres: {} } },
    // LE RÉGLAGE « GOÛT » N'EXISTE PLUS, ET N'A JAMAIS EXISTÉ SOUS CE NOM ICI : le nœud porte QUATRE
    // curseurs, un par goût, et une dose. Le régler par un nom inconnu ne faisait rien dire à
    // personne — `paramTexte` rendait le défaut, et les deux branches produisaient le MÊME son,
    // « sucré 100 % », mesuré identique à 88/7/3/2 par les deux nœuds de goût. D'où l'échec : ce qui
    // devait monter vers l'acide ne montait nulle part.
    { id: "ass-acide", position: { x: 320, y: 200 }, data: { ficheId: "assaisonnement-sonore", parametres: { "Sucré": 0, "Acide": 100, "Amer": 0, "Salé": 0, "Dose": 100 } } },
    { id: "gout-acide", position: { x: 640, y: 200 }, data: { ficheId: "gout-du-son", parametres: {} } },
    { id: "ass-amer", position: { x: 320, y: 400 }, data: { ficheId: "assaisonnement-sonore", parametres: { "Sucré": 0, "Acide": 0, "Amer": 100, "Salé": 0, "Dose": 100 } } },
    { id: "gout-amer", position: { x: 640, y: 400 }, data: { ficheId: "gout-du-son", parametres: {} } },
  ],
  edges: [
    { id: "e1", source: "gen", target: "temoin", sourceHandle: "out:0", targetHandle: "in:0" },
    { id: "e2", source: "gen", target: "ass-acide", sourceHandle: "out:0", targetHandle: "in:0" },
    { id: "e3", source: "ass-acide", target: "gout-acide", sourceHandle: "out:0", targetHandle: "in:0" },
    { id: "e4", source: "gen", target: "ass-amer", sourceHandle: "out:0", targetHandle: "in:0" },
    { id: "e5", source: "ass-amer", target: "gout-amer", sourceHandle: "out:0", targetHandle: "in:0" },
  ],
};

test.describe("assaisonnement sonore", () => {
  test("un autre nœud mesure que le son a bougé vers le goût demandé", async ({ page }) => {
    test.setTimeout(180000);
    await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(GRAPHE)]);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length >= 6, { timeout: 15000 });

    await page.click(".attic-btn-lancer");
    // Les trois mesures sont faites quand les trois nœuds de goût ont dessiné leurs barres.
    await page.waitForFunction(
      () => ["temoin", "gout-acide", "gout-amer"]
        .every((id) => document.querySelectorAll(`.react-flow__node[data-id="${id}"] .attic-gout-ligne`).length === 4),
      null, { timeout: 150000 },
    );

    const parts = (id: string) => page.evaluate((n: string) => {
      const lignes = [...document.querySelectorAll(`.react-flow__node[data-id="${n}"] .attic-gout-ligne`)];
      return Object.fromEntries(lignes.map((l) => [
        l.querySelector(".attic-gout-nom")?.textContent ?? "",
        parseInt(l.querySelector(".attic-gout-part")?.textContent ?? "0", 10),
      ])) as Record<string, number>;
    }, id);

    const temoin = await parts("temoin");
    const versAcide = await parts("gout-acide");
    const versAmer = await parts("gout-amer");
    console.log("témoin      ", JSON.stringify(temoin));
    console.log("vers l'acide", JSON.stringify(versAcide));
    console.log("vers l'amer ", JSON.stringify(versAmer));

    // Ce qui est demandé monte…
    expect(versAcide["acide"]).toBeGreaterThan(temoin["acide"]);
    expect(versAmer["amer"]).toBeGreaterThan(temoin["amer"]);
    // …et les deux assaisonnements ne mènent pas au même endroit.
    expect(versAcide["acide"]).toBeGreaterThan(versAmer["acide"]);
    expect(versAmer["amer"]).toBeGreaterThan(versAcide["amer"]);

    // Le nœud dit lui-même de combien il a déplacé le son, et il dit vrai.
    const message = async (id: string) => (await page.textContent(`.react-flow__node[data-id="${id}"] .attic-node-message`))?.trim() ?? "";
    const msgAcide = await message("ass-acide");
    console.log("message acide :", msgAcide);
    // Le bloc du message porte aussi le bouton de copie (⧉) : on ne l'ancre donc pas au début.
    // LE NŒUD NE DIT PLUS UNE PART AVANT ET APRÈS, MAIS UNE DISTANCE. Il écrivait « acide N % →
    // M % » ; il écrit « acide 100 % · distance 1,37 → 0,99 », c'est-à-dire ce qu'on lui a demandé,
    // puis de combien le son s'est RAPPROCHÉ du goût vise dans l'espace des quatre. Le cas garde son
    // intention — le nœud dit de combien il a déplacé le son, et il dit vrai — en la portant sur la
    // grandeur qu'il annonce désormais.
    expect(msgAcide).toMatch(/acide 100 % · distance [\d,]+ → [\d,]+$/);
    const [avant, apres] = [...msgAcide.matchAll(/([\d,]+) → ([\d,]+)/g)][0]
      .slice(1).map((x) => Number(x.replace(",", ".")));
    // LA DISTANCE DIMINUE : c'est le sens du geste, et c'est ce qu'il faut vérifier. Une part qui
    // monte ne dirait rien d'un assaisonnement qui aurait rapproché le son d'un AUTRE goût.
    expect(apres).toBeLessThan(avant);
    // Et le nœud d'à côté voit le même déplacement : l'acide a bien monté chez lui.
    expect(versAcide["acide"]).toBeGreaterThan(temoin["acide"]);
  });

  test("à dose nulle, le son ressort où il était", async ({ page }) => {
    test.setTimeout(180000);
    const graphe = {
      nodes: [
        { id: "gen", position: { x: 0, y: 0 }, data: GEN },
        { id: "ass", position: { x: 320, y: 0 }, data: { ficheId: "assaisonnement-sonore", parametres: { "Goût": "Acide", "Dose": 0 } } },
        { id: "gout", position: { x: 640, y: 0 }, data: { ficheId: "gout-du-son", parametres: {} } },
        { id: "temoin", position: { x: 320, y: 240 }, data: { ficheId: "gout-du-son", parametres: {} } },
      ],
      edges: [
        { id: "a", source: "gen", target: "ass", sourceHandle: "out:0", targetHandle: "in:0" },
        { id: "b", source: "ass", target: "gout", sourceHandle: "out:0", targetHandle: "in:0" },
        { id: "c", source: "gen", target: "temoin", sourceHandle: "out:0", targetHandle: "in:0" },
      ],
    };
    await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(graphe)]);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    await page.click(".attic-btn-lancer");
    await page.waitForFunction(
      () => ["gout", "temoin"].every((id) => document.querySelectorAll(`.react-flow__node[data-id="${id}"] .attic-gout-ligne`).length === 4),
      null, { timeout: 150000 },
    );
    const lire = (id: string) => page.evaluate((n: string) => [...document.querySelectorAll(`.react-flow__node[data-id="${n}"] .attic-gout-part`)].map((e) => e.textContent), id);
    expect(await lire("gout")).toEqual(await lire("temoin"));
  });
});
