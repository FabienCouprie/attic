// tests-e2e/copies-remises-a-zero-dans-application.spec.ts — Une remise à zéro atteint les copies
// d'une boucle et d'un instrument.
//
// ═══ LE DÉFAUT, LU DANS LE CODE LE 2026-11-16 ═══
//
// Le graphe exécuté n'est pas celui qu'on voit : le corps d'une boucle est recopié une fois par tour,
// sous `debut#k::corps`, et la chaîne d'un instrument une fois par note, sous `fin@k::noeud`. Le cache
// range chaque copie sous cet identifiant. Or la remise à zéro le purgeait par la règle des métas, qui
// coupe la clé au premier `::` : elle n'y voyait que `debut#k` ou `fin@k`, jamais le nœud qu'on avait
// remis à zéro. Les copies restaient en cache, et le Lancer suivant les resservait sans les calculer.
//
// ═══ CE QUE CE CAS EXIGE ═══
//
// LE CORPS TIRE AU HASARD : un « Dither » à quatre bits et graine à zéro, qui tire une graine neuve à
// chaque calcul. Un ↺ sur lui puis Lancer doit donc rendre un autre son, et de même un ↺ sur ce qui
// le précède dans la chaîne : le début de la boucle, la note de l'instrument. Le défaut rendait le
// même son, octet pour octet. Chaque geste est jugé à part, d'où les assertions souples.
//
// ET LE TÉMOIN INVERSE, pour qu'une purge trop large ne passe pas pour la réparation : un ↺ sur la fin
// seule la recalcule à partir des copies, qui n'ont pas été remises à zéro, et le son ne change pas.
//
// LA BOUCLE SE MÈNE SANS L'ÉCONOMIE DE MÉMOIRE. Sous elle, qui est le défaut, le corps d'une boucle est
// lâché à la fin de chaque passe (`lacherLeCorps` de `core/saut-de-boucle.ts`) : ses copies ne sont
// plus en cache quand le ↺ arrive, et le défaut ne se voit pas. Les copies d'un instrument, elles, ne
// sont jamais lâchées : l'instrument se mène au défaut.
import { expect, test, type Page } from "@playwright/test";

import { apercusEnWav, etatDesNoeuds, relancerEtAttendre, semerEtLancer } from "./pilote-graphe";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5286);

const arete = (id: string, source: string, target: string, sortie = 0) =>
  ({ id, source, target, sourceHandle: `out:${sortie}`, targetHandle: "in:0", type: "arete-personnalisee" });

/** Le corps qui tire au hasard : quatre bits, pour que chaque graine s'entende, et un bruit plat. */
const CORPS = { ficheId: "dither", parametres: { "Bits": 4, "Dither": "Triangulaire", "Mise en forme": "Aucune", "Graine": 0 } };

const BOUCLE = JSON.stringify({
  nodes: [
    { id: "source", position: { x: 0, y: 0 }, data: { ficheId: "oscillateur", parametres: { "Fréquence": 220, "Durée": 0.5, "Volume": 30 } } },
    { id: "debut", position: { x: 300, y: 0 }, data: { ficheId: "boucle-graphe-debut", parametres: { "Tours": 3, "Graines": "Identiques" } } },
    { id: "corps", position: { x: 600, y: 0 }, data: CORPS },
    { id: "fin", position: { x: 900, y: 0 }, data: { ficheId: "boucle-graphe-fin", parametres: { "Fondu": 0 } } },
  ],
  edges: [arete("e1", "source", "debut"), arete("e2", "debut", "corps"), arete("e3", "corps", "fin")],
});

/** Deux notes, 62 et 64 : la largeur de zone de deux demi-tons depuis 60. */
const INSTRUMENT = JSON.stringify({
  nodes: [
    { id: "note", position: { x: 0, y: 0 }, data: { ficheId: "frontiere-note", parametres: { "Forme": "Dent de scie", "Durée": 0.3, "Volume": 30 } } },
    { id: "corps", position: { x: 300, y: 0 }, data: CORPS },
    { id: "fin", position: { x: 600, y: 0 }, data: { ficheId: "instrument-fin", parametres: { "Largeur de zone": 2, "Note basse": 60, "Note haute": 64, "Boucle de maintien": "Non" } } },
  ],
  edges: [arete("e1", "note", "corps"), arete("e2", "corps", "fin")],
});

/** Ce que la fin fait entendre, et ce que dit le corps : sa graine tirée, quand il l'annonce. */
async function releve(page: Page): Promise<{ son: string; corps: string | null }> {
  const son = (await apercusEnWav(page)).find((a) => a.id === "fin")?.base64 ?? "";
  expect(son, "la fin ne fait rien entendre").not.toBe("");
  const corps = (await etatDesNoeuds(page)).find((e) => e.id === "corps")?.message ?? null;
  return { son, corps };
}

/** Le ↺ d'un nœud, puis Lancer, et ce qu'on entend ensuite. */
async function remettreAZeroPuisLancer(page: Page, id: string, attentes: readonly string[]) {
  await page.locator(`[data-id="${id}"] .attic-node-btn-reset`).click({ timeout: 15_000 });
  await relancerEtAttendre(page, { attentesAdmises: attentes });
  return await releve(page);
}

/**
 * Les gestes, dans l'ordre : la fin seule, qui garde le son, puis chacun de ceux qui doivent le
 * changer, comparé au son du geste d'avant.
 */
async function eprouver(page: Page, graphe: string, attentes: readonly string[], quiRefont: readonly string[]): Promise<void> {
  await page.setViewportSize({ width: 1800, height: 1000 });
  await semerEtLancer(page, devUrl, graphe, { attentesAdmises: attentes });
  const avant = await releve(page);
  console.log(`premier Lancer : corps « ${avant.corps} »`);

  const finSeule = await remettreAZeroPuisLancer(page, "fin", attentes);
  console.log(`après ↺ de la fin : corps « ${finSeule.corps} »`);
  expect(finSeule.son === avant.son, [
    "",
    "UN ↺ SUR LA FIN SEULE A CHANGÉ LE SON.",
    "",
    "Les copies du corps n'ont pas été remises à zéro : la fin devait se recalculer à partir de",
    "ce qu'elles avaient rendu. Une purge trop large les a lâchées avec elle.",
    "",
  ].join("\n")).toBe(true);

  let precedent = finSeule;
  for (const id of quiRefont) {
    const apres = await remettreAZeroPuisLancer(page, id, attentes);
    console.log(`après ↺ de « ${id} » : corps « ${apres.corps} »`);
    expect.soft(apres.son === precedent.son, [
      "",
      `UN ↺ SUR « ${id} » N'A RIEN REFAIT : le son est celui d'avant, octet pour octet.`,
      "",
      "Le corps tire une graine neuve à chaque calcul. Ses copies sont restées en cache : la purge de",
      "la remise à zéro ne les rattache pas au nœud qu'on voit. Voir `oublierAvecMetas` dans",
      "`ui/moteur/cache.ts`.",
      "",
    ].join("\n")).toBe(false);
    precedent = apres;
  }
}

test.describe("une remise à zéro atteint les copies d'un nœud", () => {
  test.setTimeout(300_000);

  test("UNE BOUCLE : le ↺ du début ou du corps refait ses tours, le ↺ de la fin les reprend", async ({ page }) => {
    // SANS L'ÉCONOMIE DE MÉMOIRE, posée avant le chargement : elle se lit au démarrage. Voir l'en-tête.
    await page.addInitScript(() => { localStorage.setItem("attic-economie-memoire", "0"); });
    // Le début de boucle reste « en attente » par décision écrite : voir `attentesAdmises`.
    await eprouver(page, BOUCLE, ["debut"], ["debut", "corps"]);
  });

  test("UN INSTRUMENT : le ↺ de la note ou du corps refait ses notes, le ↺ de la fin les reprend", async ({ page }) => {
    await eprouver(page, INSTRUMENT, [], ["note", "corps"]);
  });
});
