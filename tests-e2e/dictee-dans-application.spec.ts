// tests-e2e/dictee-dans-application.spec.ts — Ce qu'une phrase dictée fait au canevas.
//
// ═══ LA PREMIÈRE ÉPREUVE DE BOUT EN BOUT QUE LA DICTÉE AIT JAMAIS EUE ═══
//
// Ses trois morceaux étaient éprouvés séparément : la grammaire dans `commandes-dictee.test.ts`,
// les règles de placement dans `pose-dictee.test.ts`, et l'application depuis qu'elle est sortie
// d'`App.tsx`. LEUR COMPOSITION NE L'ÉTAIT PAS, et c'est elle qui porte les défauts qu'un cas
// unitaire ne voit pas : que le catalogue passé au découpage soit celui du registre VIVANT, que la
// langue suive l'interface, que l'apparieur soit monté sur ce catalogue-là.
//
// Ce dépôt en a mesuré un ce mois-ci, du même genre : un garde vert parce qu'il n'importait que
// l'adaptateur, et recevait donc des réponses neutres sans que rien ne le dise.
//
// LA COUTURE PREND DU TEXTE, ce que le micro produit. Le modèle acoustique et le flux audio sont
// les deux seules choses sautées, et les deux seules qu'une épreuve ne peut pas fournir : tout le
// reste est le chemin que l'on parle.
import { expect, test, type Page } from "@playwright/test";

import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5256);

/**
 * Un canevas vide, et ce fichier n'emploie PAS le pilote de graphe.
 *
 * Mon premier jet passait par `semerEtLancer`, et il n'a jamais rendu la main : le pilote attend
 * que toutes les pastilles de statut soient au repos, et un canevas VIDE n'en porte aucune — la
 * condition ne pouvait pas devenir vraie. La dictée n'a de toute façon rien à lancer : elle pose,
 * et c'est ce qu'on regarde.
 */
async function canevasVide(page: Page): Promise<void> {
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 20_000 });
  await page.evaluate(() => localStorage.setItem("attic-encours", JSON.stringify({ nodes: [], edges: [] })));
  await page.reload();
  await page.waitForSelector(".attic-app", { timeout: 20_000 });
  await page.waitForTimeout(2000);
}

interface Dicte { commandes: { quoi: string; ficheId?: string }[]; avis: string }

/** Dicte une phrase, exactement comme le micro la rendrait, et laisse le canevas se poser. */
async function dicter(page: Page, phrase: string): Promise<Dicte> {
  const r = await page.evaluate(async (t) => {
    const f = (window as unknown as { __attic_dictee__?: (t: string) => Promise<unknown> }).__attic_dictee__;
    if (!f) return null;
    return await f(t);
  }, phrase);
  expect(r, [
    "",
    "LA COUTURE DE DICTÉE N'EST PAS JOIGNABLE DEPUIS LA PAGE.",
    "",
    "`ui/dictee/useDictee.ts` pose `window.__attic_dictee__` pour qu'une épreuve exerce la chaîne",
    "entière sans micro. Sans elle, rien de ce fichier ne prouve quoi que ce soit.",
    "",
  ].join("\n")).toBeTruthy();
  await page.waitForTimeout(400);
  return r as Dicte;
}

/**
 * Les composants posés sur le canevas, dans l'ordre du DOM.
 *
 * `.react-flow__node` ET NON `[data-id]` : chaque POIGNÉE porte aussi un `data-id`, de sorte qu'un
 * canevas de deux nœuds en rendait douze. Mon premier jet comptait les ports.
 */
const poses = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll(".react-flow__node")]
    .map((n) => (n as HTMLElement).dataset.id)
    .filter((id): id is string => !!id));

/**
 * Les câbles dessinés sur le canevas.
 *
 * ON LES COMPTE SUR LE DOM, et non sur `__attic_graphe__` : celui-ci n'est publié qu'au LANCEMENT
 * d'un run, et la dictée ne lance rien. Mon premier jet le lisait et trouvait toujours zéro, ce qui
 * aurait fait passer le cas « en parallèle » pour la mauvaise raison.
 */
const cables = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll(".react-flow__edge")].map((e) => (e as HTMLElement).dataset.id ?? "?"));

test.describe("la dictée, dans l'application", () => {
  test.setTimeout(300_000);

  test("UNE SUITE DE NOMS POSE UNE CHAINE, sans un seul mot de liaison", async ({ page }) => {
    await canevasVide(page);
    const r = await dicter(page, "réverbération compresseur sortie audio");
    console.log(`commandes : ${r.commandes.map((c) => `${c.quoi}:${c.ficheId ?? ""}`).join(" ")}`);
    console.log(`avis : ${r.avis || "(aucun)"}`);

    // ═══ 1. LE DÉCOUPAGE A RECONNU TROIS COMPOSANTS DU CATALOGUE VIVANT ═══
    //
    // C'est ici que se verrait un catalogue mal passé : la grammaire rendrait « inconnu » sur des
    // noms que l'application affiche pourtant dans sa palette.
    expect(r.commandes.filter((c) => c.quoi === "poser").length, [
      "",
      "LA DICTÉE N'A PAS RECONNU LES COMPOSANTS DE SA PROPRE PALETTE.",
      "",
      "Le découpage reçoit le catalogue du registre VIVANT, par `nomsDeDictee`. Trois noms dits en",
      "toutes lettres doivent donner trois gestes « poser ». S'il rend « inconnu », c'est le",
      "catalogue qui n'est pas arrivé, ou la langue qui ne suit pas celle de l'interface.",
      "",
    ].join("\n")).toBe(3);
    expect(r.avis, "aucun geste ne devait échouer").toBe("");

    // ═══ 2. ET LE CANEVAS PORTE LA CHAÎNE ═══
    const ids = await poses(page);
    const liens = await cables(page);
    console.log(`posés : ${ids.join(",")} · câbles : ${liens.join(" ")}`);
    expect(ids.length, [
      "",
      "LES COMPOSANTS DICTÉS NE SONT PAS SUR LE CANEVAS.",
      "",
      "Les gestes ont été rendus par le découpage, mais le canevas ne les porte pas : c'est le",
      "versement qui n'a pas eu lieu. Voir `appliquerDictee` dans `ui/App.tsx`, qui verse le lot que",
      "`dictee/appliquer-commandes.ts` calcule.",
      "",
    ].join("\n")).toBe(3);
    expect(liens.length, [
      "",
      "LES COMPOSANTS DICTÉS NE S'ENCHAÎNENT PLUS.",
      "",
      "Nommer un composant doit le poser ET le relier au courant : c'est ce qui dispense de dire le",
      "lien. Deux câbles pour trois composants.",
      "",
    ].join("\n")).toBe(2);
  });

  test("ET « EN PARALLELE » POSE SANS RELIER", async ({ page }) => {
    await canevasVide(page);
    await dicter(page, "réverbération");
    await dicter(page, "en parallèle compresseur");
    expect(await poses(page), "les deux composants doivent être posés").toHaveLength(2);
    expect(await cables(page), [
      "",
      "« EN PARALLÈLE » A RELIÉ QUAND MÊME.",
      "",
      "C'est le seul mot qui dispense de l'enchaînement : sans lui, toute une grammaire de liaison",
      "serait nécessaire pour poser deux branches côte à côte.",
      "",
    ].join("\n")).toEqual([]);
  });

  test("ET UN COMPOSANT AU NOM IMPRONONCABLE SE DIT PAR SON NOM PARLE", async ({ page }) => {
    // ═══ LE DÉFAUT RELEVÉ PAR FABIEN ═══
    //
    // « Réverbération à convolution » n'était jamais détectée : « convolution » manque au lexique
    // du moteur vocal, et un nom qui en porte un est écarté de la grammaire — sans quoi il y
    // entrerait AMPUTÉ, « réverbération à » concurrençant « Réverbération ». Le composant
    // n'existait donc pas pour la dictée.
    //
    // ET LE DIRE SOUS SON NOM PARLÉ NE DOIT PAS VOLER « RÉVERBÉRATION » au composant qui le porte :
    // c'est l'autre moitié du cas, et c'est elle qui vérifie que les deux se distinguent.
    await canevasVide(page);
    const r = await dicter(page, "réverbération à réponse");
    console.log(`« réverbération à réponse » -> ${r.commandes.map((c) => `${c.quoi}:${c.ficheId ?? ""}`).join(" ")}`);
    expect(r.commandes.map((c) => c.ficheId), [
      "",
      "UN COMPOSANT AU NOM IMPRONONÇABLE N'EST PAS ATTEIGNABLE PAR SON NOM PARLÉ.",
      "",
      "Sa fiche déclare un `nomDicte`, que `nomsDeDictee` doit retenir à la place du nom quand",
      "celui-ci porte un mot absent du lexique. Voir `plugins/noms-parles.test.ts`, qui tient la",
      "règle, et `plugins/lexique-vosk.ts`, qui porte la liste des mots manquants.",
      "",
    ].join("\n")).toEqual(["reverbe-convolution"]);

    const simple = await dicter(page, "réverbération");
    console.log(`« réverbération » -> ${simple.commandes.map((c) => c.ficheId ?? "").join(" ")}`);
    expect(simple.commandes.map((c) => c.ficheId),
      "le nom parlé de l'une ne doit pas prendre la place de l'autre").toEqual(["reverberation"]);
  });

  test("ET UN MOT QUI N EST PAS DU CATALOGUE NE POSE RIEN", async ({ page }) => {
    // La reconnaissance est à vocabulaire fermé, mais la couture reçoit du texte libre : c'est donc
    // le découpage qui doit refuser, et non poser un composant au hasard.
    await canevasVide(page);
    const r = await dicter(page, "bonjour comment allez vous");
    console.log(`commandes sur une phrase hors catalogue : ${r.commandes.map((c) => c.quoi).join(" ") || "(aucune)"}`);
    expect(r.commandes.some((c) => c.quoi === "poser"), [
      "",
      "UNE PHRASE QUI NE NOMME AUCUN COMPOSANT EN A POSÉ UN.",
      "",
      "Le défaut connu de ce moteur est de recomposer un faux nom à partir de mots de la liste ; le",
      "découpage doit donc refuser ce qu'il ne reconnaît pas plutôt que d'approcher.",
      "",
    ].join("\n")).toBe(false);
    expect(await poses(page)).toHaveLength(0);
  });
});
