// tests-e2e/conteneurs-dans-application.spec.ts — Une bulle ou un méta dit l'état de TOUT ce qu'il contient.
//
// ═══ LE DÉFAUT QUI L'A FAIT NAÎTRE ═══
//
// Relevé par Fabien le 2026-10-30 sur son graphe « bubble error_1 », une bulle de huit composants :
// « le principe des bulles ne fonctionne pas. It stays at waiting. Un seul composant exécuté à
// l'intérieur suffit à le taguer comme exécuté. » Les deux se sont mesurés dans l'application.
//
//   1. LE ▶ D'UNE BULLE NE LANÇAIT RIEN. Le périmètre d'un run ciblé est l'amont du nœud visé, et
//      une bulle n'a aucune arête réelle : `ordreFiltre=n15(bulle::n15)`, aussitôt écartée comme
//      décorative. Elle restait « En attente » pour toujours.
//   2. UN SEUL MEMBRE EXÉCUTÉ LA DÉCLARAIT TERMINÉE. Son statut final était pris sur les membres de
//      CE run : un ▶ en aval d'une branche en faisait tourner deux sur huit, et la bulle passait à
//      « Terminé » sur six membres en attente.
//
// LES MÉTAS AVAIENT LES DEUX, mesuré de même : le ▶ d'un méta sans sortie exposée ne lançait rien,
// et un méta dont une chaîne sur deux avait tourné se disait terminé. Le soupçon d'une erreur
// d'attribution des ports de sortie, lui, ne s'est pas vérifié : les huit câbles du graphe de Fabien
// partaient des bonnes poignées, et chaque sortie portait la zone voulue, à la milliseconde.
//
// ═══ POURQUOI DE BOUT EN BOUT ═══
//
// La règle vit dans `core/conteneurs.ts` et ses cas unitaires l'éprouvent. Mais le périmètre d'un run
// ciblé, le report des statuts et la mémoire des nœuds aplatis sont dans `useExecutionGraphe.ts` et
// `ui/statuts.ts` : c'est leur rencontre qui faisait le défaut, et elle ne se voit que dans
// l'application.
import { expect, test, type Page } from "@playwright/test";

import { serveurDeVerification } from "./serveur-de-developpement";
import { apercusEnWav, etatDesNoeuds, lancerLeNoeudEtAttendre, relancerEtAttendre, semer } from "./pilote-graphe";
import { lireWav } from "../src/audio/empreinte-wav";

const devUrl = serveurDeVerification(5273);

const ecoute = (id: string, x: number, y: number, bulle?: string) =>
  ({ id, position: { x, y }, data: { ficheId: "point-ecoute", parametres: {}, ...(bulle ? { bulle } : {}) } });
// DEUX SONS QUI NE SE CONFONDENT PAS, une seconde et deux : c'est la durée qui dit à l'arrivée quelle
// branche a traversé quelle sortie.
const ton = (id: string, y: number, duree: number) =>
  ({ id, position: { x: 0, y }, data: { ficheId: "generateur-frequence", parametres: { "Durée": duree } } });
const arete = (source: string, target: string, so = 0, ti = 0) =>
  ({ id: `e-${source}-${target}-${so}-${ti}`, source, target, sourceHandle: `out:${so}`, targetHandle: `in:${ti}` });

/** Une bulle de deux branches parallèles, chacune de deux membres, et une écoute au bout de chacune. */
function grapheBulle(ouverte: boolean): string {
  return JSON.stringify({
    nodes: [
      ton("t1", 0, 1), ton("t2", 300, 2),
      ecoute("a1", 350, 0, "b"), ecoute("a2", 700, 0, "b"), ecoute("c1", 350, 300, "b"), ecoute("c2", 700, 300, "b"),
      ecoute("sa", 1050, 0), ecoute("sc", 1050, 300),
      { id: "b", position: { x: 525, y: 600 }, data: { ficheId: "bulle::b", parametres: {}, bulleOuverte: ouverte } },
    ],
    edges: [arete("t1", "a1"), arete("a1", "a2"), arete("a2", "sa"), arete("t2", "c1"), arete("c1", "c2"), arete("c2", "sc")],
  });
}

/** Le même schéma en méta : deux chaînes dedans, deux sorties exposées. */
const META_DEUX = {
  id: "meta-deux-chaines", nom: "Deux chaînes",
  entrees: [{ nom: "In 1", type: "audio" }, { nom: "In 2", type: "audio" }],
  sorties: [{ nom: "Out 1", type: "audio" }, { nom: "Out 2", type: "audio" }],
  mapEntrees: [{ noeudInterne: "a1", portIndex: 0 }, { noeudInterne: "c1", portIndex: 0 }],
  mapSorties: [{ noeudInterne: "a2", portIndex: 0 }, { noeudInterne: "c2", portIndex: 0 }],
  sousNoeuds: [ecoute("a1", 0, 0), ecoute("a2", 300, 0), ecoute("c1", 0, 300), ecoute("c2", 300, 300)],
  sousAretes: [arete("a1", "a2"), arete("c1", "c2")],
};
/** Un méta posé en bout de chaîne : une entrée, AUCUNE sortie exposée. */
const META_PUITS = {
  id: "meta-puits", nom: "Puits",
  entrees: [{ nom: "In 1", type: "audio" }], sorties: [],
  mapEntrees: [{ noeudInterne: "k1", portIndex: 0 }], mapSorties: [],
  sousNoeuds: [ecoute("k1", 0, 0), ecoute("k2", 300, 0)],
  sousAretes: [arete("k1", "k2")],
};
const GRAPHE_META = JSON.stringify({
  nodes: [ton("t1", 0, 1), ton("t2", 300, 2), { id: "m", position: { x: 400, y: 150 }, data: { ficheId: META_DEUX.id, parametres: {} } },
    ecoute("sa", 800, 0), ecoute("sc", 800, 300)],
  edges: [arete("t1", "m", 0, 0), arete("t2", "m", 0, 1), arete("m", "sa", 0, 0), arete("m", "sc", 1, 0)],
});
const GRAPHE_PUITS = JSON.stringify({
  nodes: [ton("t1", 0, 1), { id: "p", position: { x: 400, y: 0 }, data: { ficheId: META_PUITS.id, parametres: {} } }],
  edges: [arete("t1", "p", 0, 0)],
});

/** Sème le graphe, et le montre en entier : un ▶ caché sous la palette ne reçoit pas le clic. */
async function poser(page: Page, graphe: string): Promise<void> {
  // Les métas vivent au catalogue, que le graphe en cours ne transporte pas : ils se sèment à côté.
  await page.addInitScript((m: string) => { localStorage.setItem("attic-metas", m); },
    JSON.stringify([META_DEUX, META_PUITS]));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await semer(page, devUrl, graphe, { profondeurExport: 32 });
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(500);
}

/** Le ▶ d'un nœud, et la cause dite en clair s'il ne finit pas. */
async function lancerLeNoeud(page: Page, id: string): Promise<void> {
  try {
    await lancerLeNoeudEtAttendre(page, id, { delaiRunMs: 30_000 });
  } catch {
    throw new Error([
      "",
      `LE ▶ DE « ${id} » N'A PAS FINI EN TRENTE SECONDES : il est resté en attente.`,
      "C'est le défaut d'un conteneur visé par son seul identifiant, qui n'a aucune arête réelle :",
      "le périmètre se réduit à lui, le moteur l'écarte comme décoratif, et rien ne tourne.",
      "",
      JSON.stringify(await etatDesNoeuds(page)),
      "",
    ].join("\n"));
  }
}

const statutDe = async (page: Page, id: string) => (await etatDesNoeuds(page)).find((e) => e.id === id)?.statut;

/**
 * Refaire la seule écoute `sa` après un run global, ce qui refait une branche et pas l'autre.
 *
 * ELLE EST D'ABORD REMISE À ZÉRO : terminée, son ▶ ne se distinguerait pas de son état d'avant, et
 * l'attente rendrait la main avant le run. Elle est en aval du conteneur, qui n'en est pas touché.
 */
async function refaireUneBranche(page: Page): Promise<void> {
  await page.locator('[data-id="sa"] .attic-node-btn-reset').click();
  await expect.poll(() => statutDe(page, "sa"), { timeout: 10_000 }).toBe("attente");
  await lancerLeNoeud(page, "sa");
}

/** La durée de l'aperçu de chaque nœud qui en a un, lue dans les octets du WAV. */
async function durees(page: Page): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const a of await apercusEnWav(page)) {
    const o = Buffer.from(a.base64, "base64");
    const m = lireWav(o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength) as ArrayBuffer);
    out[a.id] = Math.round((m.trames / m.taux) * 1000) / 1000;
  }
  return out;
}

test.describe("une bulle ou un méta dit l'état de tout son contenu", () => {
  test.setTimeout(300_000);

  test("LE ▶ D'UNE BULLE LANCE TOUT CE QU'ELLE CONTIENT, et elle finit terminée", async ({ page }) => {
    await poser(page, grapheBulle(false));
    await lancerLeNoeud(page, "b");
    expect(await statutDe(page, "b")).toBe("termine");
    // Ce qui est EN AVAL de la bulle n'est pas son contenu : son ▶ ne le lance pas.
    expect(await statutDe(page, "sa")).toBe("attente");
  });

  test("UN ▶ EN AVAL D'UNE SEULE BRANCHE NE LA DÉCLARE PAS TERMINÉE", async ({ page }) => {
    await poser(page, grapheBulle(false));
    await lancerLeNoeud(page, "sa");
    expect(await statutDe(page, "sa")).toBe("termine");
    expect(await statutDe(page, "b"), [
      "",
      "LA BULLE SE DIT TERMINÉE QUAND DEUX DE SES QUATRE MEMBRES ONT TOURNÉ.",
      "Son statut se prend sur TOUT son contenu, et non sur ce que ce run en a touché.",
      "",
    ].join("\n")).toBe("attente");
  });

  test("UNE BULLE ENTIÈREMENT CALCULÉE LE RESTE après un ▶ qui n'en refait qu'une branche", async ({ page }) => {
    await poser(page, grapheBulle(false));
    // La bulle est ADMISE en attente à la fin du run, pour que l'assertion qui suit le dise en clair
    // au lieu d'un délai expiré. Elle ne libère pas le pilote trop tôt : pendant le run, la bulle est
    // « en cours », et c'est l'en-cours qui le retient jusqu'à son statut final.
    await relancerEtAttendre(page, { delaiRunMs: 60_000, attentesAdmises: ["b"] });
    expect(await statutDe(page, "b")).toBe("termine");
    // ET CHAQUE SORTIE PORTE SA BRANCHE : une seconde d'un côté, deux de l'autre.
    const d = await durees(page);
    console.log(`durées après le run global : ${JSON.stringify(d)}`);
    expect([d.sa, d.sc]).toEqual([1, 2]);
    await refaireUneBranche(page);
    expect(await statutDe(page, "b"), [
      "",
      "LA BULLE A OUBLIÉ LA BRANCHE QUI AVAIT TOURNÉ AU RUN PRÉCÉDENT.",
      "Ses membres gardent leur statut d'un run à l'autre : c'est lui qu'il faut lire, et non ce run seul.",
      "",
    ].join("\n")).toBe("termine");
  });

  test("REMETTRE UN MEMBRE À ZÉRO REMET LA BULLE EN ATTENTE", async ({ page }) => {
    await poser(page, grapheBulle(true));
    await relancerEtAttendre(page, { delaiRunMs: 60_000 });
    expect(await statutDe(page, "b")).toBe("termine");
    await page.locator('[data-id="c2"] .attic-node-btn-reset').click();
    await expect.poll(() => statutDe(page, "c2"), { timeout: 10_000 }).toBe("attente");
    expect(await statutDe(page, "b"), [
      "",
      "UN MEMBRE EST REPARTI EN ATTENTE ET LA BULLE SE DIT ENCORE TERMINÉE.",
      "",
    ].join("\n")).toBe("attente");
  });

  test("UN ▶ EN AVAL D'UNE SEULE CHAÎNE NE DÉCLARE PAS UN MÉTA TERMINÉ", async ({ page }) => {
    await poser(page, GRAPHE_META);
    await lancerLeNoeud(page, "sa");
    expect(await statutDe(page, "m"), [
      "",
      "LE MÉTA SE DIT TERMINÉ QUAND UNE CHAÎNE SUR DEUX A TOURNÉ.",
      "Une sortie produite ne suffit pas : son statut se prend sur tous ses nœuds aplatis.",
      "",
    ].join("\n")).toBe("attente");
  });

  test("UN MÉTA ENTIÈREMENT CALCULÉ LE RESTE : il se souvient de ses nœuds aplatis", async ({ page }) => {
    await poser(page, GRAPHE_META);
    await relancerEtAttendre(page, { delaiRunMs: 60_000, attentesAdmises: ["m"] });
    expect(await statutDe(page, "m"), [
      "",
      "LE MÉTA N'EST PAS TERMINÉ APRÈS UN RUN GLOBAL : l'état de ses nœuds aplatis n'a pas été gardé.",
      "Voir `poserStatutOmbre` dans `ui/statuts.ts`.",
      "",
    ].join("\n")).toBe("termine");
    const d = await durees(page);
    expect([d.sa, d.sc], "chaque sortie du méta porte sa chaîne").toEqual([1, 2]);
    await refaireUneBranche(page);
    expect(await statutDe(page, "m"), [
      "",
      "LE MÉTA A OUBLIÉ LA CHAÎNE QUI AVAIT TOURNÉ AU RUN PRÉCÉDENT.",
      "L'état de ses nœuds aplatis vit en ombre dans `ui/statuts.ts` : voir `poserStatutOmbre`.",
      "",
    ].join("\n")).toBe("termine");
  });

  test("LE ▶ D'UN MÉTA SANS SORTIE LANCE SON CONTENU", async ({ page }) => {
    await poser(page, GRAPHE_PUITS);
    await lancerLeNoeud(page, "p");
    expect(await statutDe(page, "p")).toBe("termine");
  });
});
