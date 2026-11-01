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
// LE ↺ AVAIT LE MÊME DÉFAUT, relevé en lisant le code puis mesuré avant d'être corrigé. Celui d'une
// bulle ne suivait que ses substituts vers l'aval : ses quatre membres restaient terminés. Celui
// d'un méta n'effaçait du cache que son identifiant visible : le run suivant reprenait ses quatre
// nœuds aplatis, rangés sous `m::…`, et ne refaisait que l'aval.
//
// « DÉVELOPPER » FAISAIT TOUT REFAIRE APRÈS UN RUN REPLIÉ, relevé le 2026-11-01 en tournant la vidéo
// des bulles. Le run replié sortait du cache, puis le ménage de fin de run lâchait les membres sous
// l'économie de mémoire, quelle que soit leur durée : au run suivant, quatre membres et les deux
// écoutes d'aval repartaient. Économie coupée, rien. Fabien a gardé le ménage à partir du seuil des
// aperçus, dix minutes, et l'a levé en deçà : voir `resultatRetenu` dans `core/memoire.ts`.
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

/**
 * Une bulle de deux branches parallèles dont les entrées n'ont PAS le même type : un point d'écoute
 * attend de l'audio, une sortie texte du texte. Aucun câble au départ, donc deux ports libres.
 */
const GRAPHE_TYPES = JSON.stringify({
  nodes: [
    { id: "t", position: { x: 0, y: 0 }, data: { ficheId: "generateur-frequence", parametres: { "Durée": 1 } } },
    { id: "x", position: { x: 0, y: 320 }, data: { ficheId: "source-texte", parametres: {} } },
    ecoute("A", 500, 0, "b"),
    { id: "B", position: { x: 500, y: 320 }, data: { ficheId: "sortie-texte", parametres: {}, bulle: "b" } },
    { id: "b", position: { x: 500, y: 160 }, data: { ficheId: "bulle::b", parametres: {}, bulleOuverte: false } },
  ],
  edges: [],
});

/** Une bulle OUVERTE de deux écoutes que rien ne relie : deux entrées libres, deux sorties libres. */
const GRAPHE_OUVERT = JSON.stringify({
  nodes: [ecoute("A1", 0, 0, "b"), ecoute("A2", 450, 0, "b"),
    { id: "b", position: { x: 200, y: 300 }, data: { ficheId: "bulle::b", parametres: {}, bulleOuverte: true } }],
  edges: [],
});

/** Tirer un câble à la souris, d'une poignée à l'autre, comme on le fait. */
async function tirer(page: Page, de: string, vers: string): Promise<void> {
  const a = await page.locator(de).boundingBox();
  const b = await page.locator(vers).boundingBox();
  if (!a || !b) throw new Error(`poignée introuvable : ${!a ? de : vers}`);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 8 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
}

/** Le type qu'affiche chaque poignée d'entrée de la bulle, dans l'ordre. */
const typesAffiches = (page: Page, bulle: string): Promise<string[]> =>
  page.locator(`[data-id="${bulle}"] .react-flow__handle.target`).evaluateAll((hs) => hs.map((h) => h.getAttribute("title") ?? ""));

/**
 * Pour chaque câble qui arrive sur la bulle, le type qu'affiche la poignée où son tracé aboutit.
 *
 * C'EST LA GÉOMÉTRIE QUI TRANCHE, et non l'identifiant de poignée de l'arête : c'est ce que l'œil
 * voit, un câble posé sur un port d'une certaine couleur. Une arête substituée porte l'identifiant de
 * l'arête réelle, `sub::e-<source>-<cible>-…`, qui dit vers quel membre elle va vraiment.
 */
async function poigneesDesCables(page: Page, bulle: string): Promise<Record<string, string>> {
  return await page.evaluate((b) => {
    const poignees = [...document.querySelectorAll(`[data-id="${b}"] .react-flow__handle.target`)] as HTMLElement[];
    const out: Record<string, string> = {};
    for (const g of [...document.querySelectorAll(".react-flow__edge")] as SVGGElement[]) {
      const chemin = g.querySelector("path") as SVGPathElement | null;
      const ctm = chemin?.getScreenCTM();
      if (!chemin || !ctm) continue;
      const p = chemin.getPointAtLength(chemin.getTotalLength());
      const fin = new DOMPoint(p.x, p.y).matrixTransform(ctm);
      for (const h of poignees) {
        const r = h.getBoundingClientRect();
        if (Math.hypot(r.x + r.width / 2 - fin.x, r.y + r.height / 2 - fin.y) < 12) {
          out[g.getAttribute("data-id") ?? ""] = h.getAttribute("title") ?? "";
        }
      }
    }
    return out;
  }, bulle);
}

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

/**
 * L'état de nœuds que l'écran ne montre pas, lu dans le magasin des statuts.
 *
 * LES MEMBRES D'UNE BULLE REPLIÉE ET LES NŒUDS APLATIS D'UN MÉTA N'ONT PAS DE PASTILLE : le magasin
 * est le seul endroit où leur état se lit. Le module importé est celui que l'application emploie,
 * la page étant neuve.
 */
async function statutsDuMagasin(page: Page, ids: string[]): Promise<Record<string, string>> {
  return await page.evaluate(async (liste) => {
    const s = await import("/src/ui/statuts.ts") as { statutDe: (id: string) => { statut: string } };
    return Object.fromEntries(liste.map((id) => [id, s.statutDe(id).statut]));
  }, ids);
}

/**
 * Commence à relever ceux de ces nœuds dont le calcul repart, visibles ou non.
 *
 * « EN COURS » NE SE POSE QU'UNE FOIS LE CACHE ÉCARTÉ : un nœud repris du cache passe directement à
 * « terminé ». C'est donc le passage par « en cours » qui dit qu'un nœud a été refait.
 */
async function suivreLesCalculs(page: Page, ids: string[]): Promise<void> {
  await page.evaluate(async (liste) => {
    const s = await import("/src/ui/statuts.ts") as {
      statutDe: (id: string) => { statut: string }; surStatut: (id: string, f: () => void) => () => void;
    };
    const vus = new Set<string>();
    (window as unknown as { __calcules__: Set<string> }).__calcules__ = vus;
    for (const id of liste) s.surStatut(id, () => { if (s.statutDe(id).statut === "en_cours") vus.add(id); });
  }, ids);
}

const lireLesCalculs = async (page: Page): Promise<string[]> =>
  await page.evaluate(() => [...(window as unknown as { __calcules__: Set<string> }).__calcules__].sort());

/** Un geste du clic droit sur une bulle, par son libellé dans l'une ou l'autre langue. */
async function gesteDeBulle(page: Page, bulle: string, libelle: RegExp): Promise<void> {
  await page.locator(`[data-id="${bulle}"] .attic-node-nom`).click({ button: "right" });
  await page.locator(".attic-menu-contextuel-item").filter({ hasText: libelle }).click();
  await page.waitForTimeout(800);
}

/** Ceux de ces nœuds qui portent un lecteur écoutable. */
const avecLecteur = (page: Page, ids: string[]): Promise<string[]> =>
  page.evaluate((liste) => liste.filter((id) => !!document.querySelector(`[data-id="${id}"] audio[src]`)), ids);

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

  test("UNE POIGNÉE DE BULLE AFFICHE LE TYPE DU PORT QU'ELLE DÉSIGNE, même après un câblage qui les réordonne", async ({ page }) => {
    await poser(page, GRAPHE_TYPES);
    const avant = await typesAffiches(page, "b");
    const iTexte = avant.findIndex((t) => /texte|text/i.test(t));
    expect(iTexte, `une poignée d'entrée s'affiche texte : ${JSON.stringify(avant)}`).toBeGreaterThanOrEqual(0);
    // Le câble de texte sur la poignée qui s'affiche texte. Il devient traversant, et passe donc
    // DEVANT le port libre de l'audio : les ports de la bulle se réordonnent.
    await tirer(page, '[data-id="x"] .react-flow__handle.source', `[data-id="b"] .react-flow__handle[data-handleid="in:${iTexte}"]`);
    const apresTexte = await poigneesDesCables(page, "b");
    console.log(`poignées avant : ${JSON.stringify(avant)} · après le texte : ${JSON.stringify(await typesAffiches(page, "b"))} · câbles : ${JSON.stringify(apresTexte)}`);
    const texte = Object.entries(apresTexte).find(([id]) => id.startsWith("sub::e-x-B-"));
    expect(texte, "le câble de texte va à la sortie texte, et se dessine sur une poignée de la bulle").toBeTruthy();
    expect(texte![1], [
      "",
      "LE CÂBLE DE TEXTE ARRIVE SUR UNE POIGNÉE QUI S'AFFICHE D'UN AUTRE TYPE.",
      "Les ports de la bulle se sont réordonnés, le traversant devant le libre, et la poignée dessinée",
      "a gardé la fiche d'avant : c'est le cache des fiches de `AtelierNode.tsx`, qui ne doit pas garder",
      "celle d'une bulle.",
      "",
    ].join("\n")).toMatch(/texte|text/i);
    // L'audio sur la poignée qui s'affiche audio, MAINTENANT : elle doit l'accepter, et le mener au
    // point d'écoute.
    const iAudio = (await typesAffiches(page, "b")).findIndex((t) => /audio/i.test(t));
    await tirer(page, '[data-id="t"] .react-flow__handle.source', `[data-id="b"] .react-flow__handle[data-handleid="in:${iAudio}"]`);
    const apresAudio = await poigneesDesCables(page, "b");
    const audio = Object.entries(apresAudio).find(([id]) => id.startsWith("sub::e-t-A-"));
    expect(audio, `l'audio posé sur la poignée affichée audio est accepté et va au point d'écoute : ${JSON.stringify(apresAudio)}`).toBeTruthy();
    expect(audio![1]).toMatch(/audio/i);
  });

  test("UNE ARÊTE ENTRE DEUX MEMBRES RETIRE LEURS PORTS DE LA BULLE, et ses poignées le montrent", async ({ page }) => {
    // Aucun câble de la bulle ne bouge ici : seule sa fiche change, son nombre de ports avec elle.
    await poser(page, GRAPHE_OUVERT);
    expect(await typesAffiches(page, "b"), "deux entrées libres au départ").toHaveLength(2);
    await tirer(page, '[data-id="A1"] .react-flow__handle.source', '[data-id="A2"] .react-flow__handle.target');
    const apres = await typesAffiches(page, "b");
    console.log(`entrées affichées après l'arête intérieure : ${JSON.stringify(apres)}`);
    expect(apres, [
      "",
      "LA BULLE MONTRE ENCORE L'ENTRÉE QU'UNE ARÊTE INTÉRIEURE VIENT D'OCCUPER.",
      "Sa fiche a été refaite au registre, et le nœud dessine celle d'avant : voir `getDef` dans `AtelierNode.tsx`.",
      "",
    ].join("\n")).toHaveLength(1);
  });

  test("LE ↺ D'UNE BULLE REMET SES MEMBRES À ZÉRO, et le run suivant les refait", async ({ page }) => {
    await poser(page, grapheBulle(false));
    await relancerEtAttendre(page, { delaiRunMs: 60_000, attentesAdmises: ["b"] });
    expect(await statutDe(page, "b")).toBe("termine");
    await page.locator('[data-id="b"] .attic-node-btn-reset').click();
    await expect.poll(() => statutDe(page, "b"), { timeout: 10_000 }).toBe("attente");
    const membres = ["a1", "a2", "c1", "c2"];
    const apres = await statutsDuMagasin(page, membres);
    console.log(`membres après le ↺ de la bulle : ${JSON.stringify(apres)}`);
    expect(Object.values(apres), [
      "",
      "LE ↺ DE LA BULLE A LAISSÉ SES MEMBRES TERMINÉS.",
      "Remettre une bulle à zéro, c'est remettre à zéro ce qu'elle contient : elle ne calcule rien elle-même.",
      "",
    ].join("\n")).toEqual(["attente", "attente", "attente", "attente"]);
    await suivreLesCalculs(page, [...membres, "sa", "sc"]);
    await relancerEtAttendre(page, { delaiRunMs: 60_000, attentesAdmises: ["b"] });
    const refaits = await lireLesCalculs(page);
    console.log(`refaits au run suivant : ${JSON.stringify(refaits)}`);
    expect(refaits, "l'instrument voit les deux écoutes, remises à zéro par le même geste").toEqual(expect.arrayContaining(["sa", "sc"]));
    expect(refaits, "les membres de la bulle sont recalculés, et non repris du cache").toEqual(expect.arrayContaining(membres));
  });

  test("LE ↺ D'UN MÉTA EFFACE LE CACHE DE SES NŒUDS INTERNES, et le run suivant les refait", async ({ page }) => {
    await poser(page, GRAPHE_META);
    await relancerEtAttendre(page, { delaiRunMs: 60_000, attentesAdmises: ["m"] });
    expect(await statutDe(page, "m")).toBe("termine");
    await page.locator('[data-id="m"] .attic-node-btn-reset').click();
    await expect.poll(() => statutDe(page, "m"), { timeout: 10_000 }).toBe("attente");
    const internes = ["m::a1", "m::a2", "m::c1", "m::c2"];
    await suivreLesCalculs(page, [...internes, "sa", "sc"]);
    await relancerEtAttendre(page, { delaiRunMs: 60_000, attentesAdmises: ["m"] });
    const refaits = await lireLesCalculs(page);
    console.log(`refaits au run suivant : ${JSON.stringify(refaits)}`);
    expect(refaits, "l'instrument voit les deux écoutes, remises à zéro par le même geste").toEqual(expect.arrayContaining(["sa", "sc"]));
    expect(refaits, [
      "",
      "LE ↺ DU MÉTA N'A PAS TOUCHÉ À SON CONTENU : ses nœuds internes sont repris du cache.",
      "Le cache est indexé par l'identifiant aplati, `m::a1`, et le ↺ n'effaçait que celui du méta.",
      "",
    ].join("\n")).toEqual(expect.arrayContaining(internes));
  });

  test("REPLIER, LANCER PUIS DÉVELOPPER NE REFAIT RIEN sur un son court, et les membres reviennent écoutables", async ({ page }) => {
    // L'ÉCONOMIE DE MÉMOIRE EST ÉPINGLÉE ACTIVE, comme elle l'est par défaut : coupée, rien n'est
    // jamais lâché, et ce cas passerait sans rien éprouver.
    await page.addInitScript(() => { localStorage.setItem("attic-economie-memoire", "1"); });
    await poser(page, grapheBulle(true));
    const membres = ["a1", "a2", "c1", "c2"];
    const suivis = [...membres, "sa", "sc"];
    await suivreLesCalculs(page, suivis);
    await relancerEtAttendre(page, { delaiRunMs: 60_000, attentesAdmises: ["b"] });
    expect(await lireLesCalculs(page), "l'instrument voit le premier run, bulle ouverte, tout calculer").toEqual([...suivis].sort());

    await gesteDeBulle(page, "b", /^(Refermer|Close)$/);
    await suivreLesCalculs(page, suivis);
    await relancerEtAttendre(page, { delaiRunMs: 60_000, attentesAdmises: ["b"] });
    expect(await lireLesCalculs(page), "replier ne refait rien : le run replié sort du cache").toEqual([]);

    await gesteDeBulle(page, "b", /^(Développer|Expand)$/);
    const ecoutables = await avecLecteur(page, membres);
    await suivreLesCalculs(page, suivis);
    await relancerEtAttendre(page, { delaiRunMs: 60_000 });
    const refaits = await lireLesCalculs(page);
    console.log(`après Développer : lecteurs ${JSON.stringify(ecoutables)} · refaits au run suivant ${JSON.stringify(refaits)}`);
    expect(refaits, [
      "",
      "LE RUN QUI SUIT « DÉVELOPPER » A REFAIT CE QUE LE RUN REPLIÉ AVAIT CALCULÉ.",
      "Le ménage de fin de run a lâché des membres d'une seconde : il ne le doit qu'à partir du seuil",
      "des aperçus. Voir `resultatRetenu` dans `core/memoire.ts` et `valeursLourdes` dans le moteur.",
      "",
    ].join("\n")).toEqual([]);
    expect(ecoutables, [
      "",
      "DÉVELOPPÉS, LES MEMBRES N'ONT PAS DE LECTEUR : le run replié les a dépouillés.",
      "Sous le seuil, un membre caché garde son aperçu comme le cache garde sa valeur : voir `membreReplie`.",
      "",
    ].join("\n")).toEqual(membres);
  });
});
