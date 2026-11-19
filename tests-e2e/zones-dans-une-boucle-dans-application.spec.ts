// tests-e2e/zones-dans-une-boucle-dans-application.spec.ts — Une zone retirée dans le corps d'une
// boucle s'entend au Lancer suivant, à chaque tour.
//
// ═══ LE DÉFAUT, RELEVÉ LE 2026-11-19 ═══
//
// Le corps d'une boucle est recopié une fois par tour, et chaque copie a son entrée de cache. Les zones
// d'un « Sélecteur multi-zones » sont posées à la main sur le nœud, et n'entraient pas dans l'empreinte
// de ses réglages (`empreinteParametres` de `core/graphe.ts`). Retirer une zone oublie le nœud visible
// et remet son aval à zéro, mais les copies du sélecteur, inchangées pour le cache, rendaient encore
// les anciennes zones. Mesuré : après le retrait et Lancer, le son n'était ni celui d'une zone ni celui
// de deux. Le premier tour servait sa copie périmée, et le second était refait, parce qu'il reboucle
// sur le premier tour du masque, remis à zéro.
//
// ═══ CE QUE CE CAS EXIGE ═══
//
// L'ATTENDU EST CALCULÉ DE ZÉRO : le même graphe semé avec la seule zone qui restera, puis lancé. Le
// geste, deux zones lancées puis la seconde retirée par son « × », doit rendre ce son-là, octet pour
// octet. Comparer au son d'avant le geste ne prouverait rien : il change aussi quand un tour seul est
// refait.
//
// SANS L'ÉCONOMIE DE MÉMOIRE, qui lâcherait sinon le corps de la boucle à chaque fin de passe : les
// copies ne seraient plus en cache, et le défaut ne se verrait pas.
import { expect, test, type Page } from "@playwright/test";

import { apercusEnWav, relancerEtAttendre, semerEtLancer } from "./pilote-graphe";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5292);

const arete = (id: string, source: string, target: string, sortie = 0, entree = 0) =>
  ({ id, source, target, sourceHandle: `out:${sortie}`, targetHandle: `in:${entree}`, type: "arete-personnalisee" });

/** Une source, une boucle de deux tours dont le corps choisit des zones et les masque, une fin. */
const graphe = (zones: { debut: number; duree: number }[]) => JSON.stringify({
  nodes: [
    { id: "src", position: { x: 0, y: 0 }, data: { ficheId: "oscillateur", parametres: { "Fréquence": 220, "Durée": 1, "Volume": 30 } } },
    { id: "debut", position: { x: 300, y: 0 }, data: { ficheId: "boucle-graphe-debut", parametres: { "Tours": 2, "Graines": "Identiques" } } },
    { id: "sel", position: { x: 600, y: 0 }, data: { ficheId: "selecteur-multi-zones", parametres: {}, zonesSelectionnees: zones } },
    { id: "masque", position: { x: 950, y: 0 }, data: { ficheId: "masque-zones", parametres: {} } },
    { id: "fin", position: { x: 1250, y: 0 }, data: { ficheId: "boucle-graphe-fin", parametres: { "Fondu": 0 } } },
  ],
  edges: [
    arete("e1", "src", "debut"), arete("e2", "debut", "sel"), arete("e3", "sel", "masque"),
    arete("e4", "sel", "masque", 1, 1), arete("e5", "masque", "fin"),
  ],
});

const UNE = [{ debut: 0.1, duree: 0.2 }];
const DEUX = [{ debut: 0.1, duree: 0.2 }, { debut: 0.5, duree: 0.2 }];
/** Le début de boucle reste « en attente » par décision écrite : voir `attentesAdmises`. */
const ATTENTES = ["debut"];

const sonDeLaFin = async (page: Page) => (await apercusEnWav(page)).find((a) => a.id === "fin")?.base64 ?? "";

test("UNE ZONE RETIRÉE DANS LE CORPS D'UNE BOUCLE S'ENTEND À CHAQUE TOUR AU LANCER SUIVANT", async ({ page }) => {
  test.setTimeout(300_000);
  // SANS L'ÉCONOMIE DE MÉMOIRE, posée avant le chargement : elle se lit au démarrage. Voir l'en-tête.
  await page.addInitScript(() => { localStorage.setItem("attic-economie-memoire", "0"); });
  await page.setViewportSize({ width: 1800, height: 1000 });

  await semerEtLancer(page, devUrl, graphe(UNE), { attentesAdmises: ATTENTES });
  const attendu = await sonDeLaFin(page);
  expect(attendu, "la fin ne fait rien entendre").not.toBe("");

  await semerEtLancer(page, devUrl, graphe(DEUX), { attentesAdmises: ATTENTES });
  expect(await sonDeLaFin(page) === attendu, "les deux zones doivent s'entendre : sinon le cas n'éprouve rien").toBe(false);
  await page.locator('[data-id="sel"] .attic-node-zones-retirer').nth(1).click({ timeout: 15_000 });
  await expect(page.locator('[data-id="sel"] .attic-node-zones-item')).toHaveCount(1);
  await relancerEtAttendre(page, { attentesAdmises: ATTENTES });

  expect(await sonDeLaFin(page) === attendu, [
    "",
    "APRÈS LE RETRAIT D'UNE ZONE, LE SON N'EST PAS CELUI DE LA SEULE ZONE RESTANTE.",
    "",
    "Une copie du sélecteur a rendu les anciennes zones depuis le cache : elles doivent entrer dans",
    "l'empreinte de ses réglages. Voir `empreinteParametres` de `core/graphe.ts`.",
    "",
  ].join("\n")).toBe(true);
});
