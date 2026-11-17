// tests-e2e/graphe-complexite-dans-application.spec.ts — Trois boucles emboîtées, une bulle dans une
// bulle, puis un méta-composant : le son rendu doit être celui que le calcul annonce.
//
// ═══ LA DEMANDE, ET CE QU'ELLE ÉPROUVE ═══
//
// Demandé par Fabien le 2026-11-16 : « Fabrique un test avec trois boucles imbriquées dont une de
// cercle, à la fin un listening point comme node terminal. [...] Si ça passe et produit bien un son
// attendu, alors il est très probable que notre graphe fonctionne comme il doit fonctionner, sinon,
// nous pointerons un problème de conception. » Le graphe est `exemples/gestion_graphe_complexite.json`.
//
// LES DEUX CHOIX SONT DE LUI. Les boucles sont par créneau, par voix et par cercle, trois boucles
// par passes : une boucle par passes posée dans une boucle de graphe est refusée, et aucun composant
// ne fait d'un son ou d'une séquence un cercle, de sorte que c'est le seul trio de sortes
// différentes où chaque boucle remonte dans la suivante. Et le fichier livré garde ses deux bulles :
// « Grouper en outil » développe les bulles avant de construire le méta (`ui/App.tsx`,
// `grouperAvecBulles`), et ce spec fait le geste au lieu d'écrire un méta à la main.
//
// ═══ CE QU'IL TIENT, DANS L'ORDRE ═══
//
//   1. BULLES OUVERTES : chaque début et chaque fin de boucle annonce son dernier tour, et le point
//      d'écoute rend le son calculé dans `graphe-complexite-attendu.ts`.
//   2. BULLES REPLIÉES, le fichier tel qu'il est livré : le même son, échantillon pour échantillon.
//   3. « GROUPER EN OUTIL » sur la bulle des boucles et le point d'écoute : les deux bulles sont
//      développées et le méta les remplace. Il n'expose aucune sortie, donc ne montre aucun lecteur
//      sur le canevas, par la règle écrite le 2026-09-20 ; ouvert, son point d'écoute sélectionné,
//      il rend le même son, échantillon pour échantillon.
//   4. L'ALLER-RETOUR PAR UN FICHIER : le projet exporté, rouvert dans un navigateur neuf où le méta
//      n'est pas connu, relancé, puis ouvert de même : le même son.
//
// LE SON EST MESURÉ, et non le seul fait que l'exécution aille au bout : la durée à l'échantillon,
// les hauteurs de chacun des vingt-trois segments, les silences, la crête et la valeur efficace.
import { expect, test, type Page } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { apercusEnWav, etatDesNoeuds, relancerEtAttendre, semer } from "./pilote-graphe";
import { serveurDeVerification } from "./serveur-de-developpement";
import { tamponDepuisWav } from "../src/audio/empreinte-wav";
import {
  CRETE, decrire, FREQUENCE, MESSAGES, PASSES, releverSegments, RMS_DB, TRAMES,
} from "./graphe-complexite-attendu";

const devUrl = serveurDeVerification(5283);
const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXEMPLE = readFileSync(join(RACINE, "exemples", "gestion_graphe_complexite.json"), "utf8");
/** Douze exécutions du graphe entier : le délai d'un run ordinaire n'y suffit pas toujours. */
const PILOTE = { delaiRunMs: 420_000 };

const B1 = "bulle-cercle";
const B2 = "bulle-boucles";

/** Le même graphe, les deux bulles ouvertes : leurs membres paraissent, et leurs messages avec. */
function bullesOuvertes(): string {
  const g = JSON.parse(EXEMPLE) as { nodes: { id: string; data: Record<string, unknown> }[] };
  for (const n of g.nodes) if (n.id === B1 || n.id === B2) n.data.bulleOuverte = true;
  return JSON.stringify(g);
}

/** L'AudioBuffer qu'un navigateur fournit, réduit à ce que le lecteur de WAV emploie. */
class TamponNu {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  private readonly canaux: Float32Array[];
  constructor(o: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = o.numberOfChannels;
    this.length = o.length;
    this.sampleRate = o.sampleRate;
    this.canaux = Array.from({ length: o.numberOfChannels }, () => new Float32Array(o.length));
  }
  getChannelData(c: number): Float32Array { return this.canaux[c]; }
}

interface Son { taux: number; trames: number; canaux: Float32Array[] }

function lireSon(base64: string): Son {
  const octets = Buffer.from(base64, "base64");
  const ab = octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) as ArrayBuffer;
  const t = tamponDepuisWav(ab, TamponNu as unknown as typeof AudioBuffer);
  return {
    taux: t.sampleRate, trames: t.length,
    canaux: Array.from({ length: t.numberOfChannels }, (_, c) => t.getChannelData(c)),
  };
}

/**
 * Ce que fait entendre chaque lecteur de la page, par nœud.
 *
 * TOUT NŒUD QUI REND DE L'AUDIO MONTRE SON LECTEUR, et la fin par créneau en rend un par sa sortie
 * Audio : bulles ouvertes, elle paraît à côté du point d'écoute. La liste est donc relevée et dite,
 * et chaque étape nomme le lecteur qu'elle juge.
 */
async function lesSons(page: Page): Promise<Map<string, Son>> {
  const apercus = await apercusEnWav(page);
  console.log(`lecteurs : ${apercus.map((a) => a.id).join(", ") || "aucun"}`);
  return new Map(apercus.map((a) => [a.id, lireSon(a.base64)]));
}

function pris(sons: Map<string, Son>, id: string): Son {
  const son = sons.get(id);
  expect(son, `aucun lecteur sur « ${id} » ; lecteurs : ${[...sons.keys()].join(", ") || "aucun"}`).toBeTruthy();
  return son!;
}

/** Le son mesuré contre le calcul. Un échec dit le segment, ce qu'on attendait et ce qu'on entend. */
function verifier(son: Son, etape: string): void {
  expect(son.taux, `${etape} : fréquence`).toBe(FREQUENCE);
  expect(son.canaux.length, `${etape} : canaux`).toBe(2);
  expect(son.trames, `${etape} : durée, ${TRAMES} trames attendues soit 11,75 s`).toBe(TRAMES);
  const [g, d] = son.canaux;
  let ecartLR = 0, crete = 0, carre = 0;
  for (let i = 0; i < g.length; i++) {
    ecartLR = Math.max(ecartLR, Math.abs(g[i] - d[i]));
    crete = Math.max(crete, Math.abs(g[i]));
    carre += g[i] * g[i];
  }
  const rmsDb = 10 * Math.log10(carre / g.length);
  const releves = releverSegments(g, son.taux);
  console.log([
    `── ${etape} ──`, ...releves.map(decrire),
    `crête ${crete.toFixed(4)} · valeur efficace ${rmsDb.toFixed(2)} dBFS · écart gauche-droite ${ecartLR}`,
  ].join("\n"));
  expect(ecartLR, `${etape} : la synthèse rend deux canaux égaux`).toBe(0);
  expect(releves.filter((r) => r.entendues.join("+") !== r.attendues.join("+")).map(decrire),
    `${etape} : les segments où le son s'écarte du calcul`).toEqual([]);
  expect(crete, `${etape} : crête`).toBeGreaterThanOrEqual(CRETE.min);
  expect(crete, `${etape} : crête`).toBeLessThanOrEqual(CRETE.max);
  expect(Math.abs(rmsDb - RMS_DB.attendu), `${etape} : valeur efficace ${rmsDb.toFixed(2)} dBFS`)
    .toBeLessThanOrEqual(RMS_DB.tolerance);
}

/** Le plus grand écart entre deux sons, échantillon par échantillon. */
function ecart(a: Son, b: Son): number {
  if (a.trames !== b.trames || a.canaux.length !== b.canaux.length) return Infinity;
  let m = 0;
  for (let c = 0; c < a.canaux.length; c++) {
    for (let i = 0; i < a.trames; i++) m = Math.max(m, Math.abs(a.canaux[c][i] - b.canaux[c][i]));
  }
  return m;
}

/**
 * Entendre ce que le méta contient, par le chemin que l'application prévoit : l'ouvrir, sélectionner
 * le point d'écoute, lancer. « Ouvert, [...] seule la sélection désigne ce qu'on veut entendre »
 * (CHANGELOG, 2026-09-20). Rend la main à la racine du graphe.
 */
async function entendreLeMeta(page: Page, meta: string, etape: string, reference: Son): Promise<void> {
  await page.dblclick(`.react-flow__node[data-id="${meta}"] .attic-node-nom`);
  await expect.poll(async () => (await etatDesNoeuds(page)).length, "le méta s'ouvre sur ses dix-sept nœuds")
    .toBe(17);
  await page.click('.react-flow__node[data-id="ecoute"] .attic-node-nom');
  await relancerEtAttendre(page, PILOTE);
  const etats = await etatDesNoeuds(page);
  expect(etats.filter((e) => e.statut !== "termine").map((e) => e.id), `${etape} : l'intérieur a abouti`).toEqual([]);
  const son = pris(await lesSons(page), "ecoute");
  verifier(son, etape);
  expect(ecart(son, reference), `${etape} : le même son qu'aux bulles ouvertes`).toBe(0);
  await page.locator(".attic-filariane button").first().click();
  await expect.poll(async () => (await etatDesNoeuds(page)).map((e) => e.id), "retour à la racine").toEqual([meta]);
}

/** Les alertes de la page, gardées pour être lues : un geste peut parler, un chargement ne doit pas. */
function alertes(page: Page): string[] {
  const vues: string[] = [];
  page.on("dialog", (d) => { vues.push(d.message()); void d.accept(); });
  return vues;
}

test.describe.configure({ mode: "serial" });

test("trois boucles emboîtées, deux bulles, un méta : le son calculé, à chaque étape", async ({ page, browser }) => {
  test.setTimeout(30 * 60_000);
  const erreurs: string[] = [];
  page.on("pageerror", (e) => erreurs.push(String(e)));
  const dites = alertes(page);
  let reference: Son | null = null;

  await test.step("bulles ouvertes : chaque boucle annonce son dernier tour", async () => {
    await semer(page, devUrl, bullesOuvertes());
    await relancerEtAttendre(page, PILOTE);
    const etats = await etatDesNoeuds(page);
    expect(etats.filter((e) => e.statut !== "termine").map((e) => `${e.id} ${e.statut} ${e.cause ?? ""}`),
      "tous les nœuds ont abouti").toEqual([]);
    for (const [id, morceaux] of Object.entries(MESSAGES)) {
      const message = etats.find((e) => e.id === id)?.message ?? "";
      for (const m of morceaux) expect(message, `le message de « ${id} »`).toContain(m);
    }
    console.log(`${PASSES} exécutions attendues ; messages : ${Object.keys(MESSAGES)
      .map((id) => `${id} « ${etats.find((e) => e.id === id)?.message} »`).join(" ; ")}`);
    const sons = await lesSons(page);
    expect([...sons.keys()].sort(), "le point d'écoute, et la fin par créneau qui l'alimente").toEqual(["creneau-fin", "ecoute"]);
    const son = pris(sons, "ecoute");
    verifier(son, "bulles ouvertes");
    expect(ecart(son, pris(sons, "creneau-fin")), "le point d'écoute rend ce qu'il reçoit").toBe(0);
    reference = son;
  });

  await test.step("bulles repliées, le fichier livré : le même son", async () => {
    await semer(page, devUrl, EXEMPLE);
    const visibles = (await etatDesNoeuds(page)).map((e) => e.id).sort();
    expect(visibles, "repliées, seules la bulle du dessus et l'écoute paraissent").toEqual([B2, "ecoute"]);
    await relancerEtAttendre(page, PILOTE);
    const etats = await etatDesNoeuds(page);
    expect(etats.map((e) => `${e.id} ${e.statut}`).sort()).toEqual([`${B2} termine`, "ecoute termine"]);
    const son = pris(await lesSons(page), "ecoute");
    verifier(son, "bulles repliées");
    expect(ecart(son, reference!), "le même son qu'aux bulles ouvertes").toBe(0);
  });

  let meta = "";
  await test.step("« Grouper en outil » sur la bulle des boucles et le point d'écoute", async () => {
    await page.click(`.react-flow__node[data-id="${B2}"] .attic-node-nom`);
    await page.click('.react-flow__node[data-id="ecoute"] .attic-node-nom', { modifiers: ["Control"] });
    const avant = dites.length;
    await page.locator(".attic-meta-actions button", { hasText: "Grouper en outil" }).click();
    await expect.poll(() => dites.length, "le geste annonce les bulles développées").toBeGreaterThan(avant);
    console.log(`alerte du geste : « ${dites.at(-1)} »`);
    // Deux bulles, et dix-sept composants : les treize de la bulle du dessus, ses trois de la bulle
    // intérieure, et l'écoute.
    expect(dites.at(-1)).toMatch(/^2 bulle\(s\) développée\(s\) avant de grouper : le méta-composant contiendra 17 composant\(s\)/);
    const ids = await page.evaluate(() =>
      [...document.querySelectorAll(".react-flow__node")].map((n) => n.getAttribute("data-id") ?? ""));
    expect(ids, "les deux bulles sont parties").not.toContain(B2);
    expect(ids).not.toContain(B1);
    expect(ids, "et l'écoute est dans le méta").not.toContain("ecoute");
    meta = ids.find((i) => i !== "note") ?? "";
    expect(ids.filter((i) => i !== "note"), "un seul nœud reste à côté de la note : le méta").toEqual([meta]);
    await relancerEtAttendre(page, PILOTE);
    const etats = await etatDesNoeuds(page);
    expect(etats.map((e) => `${e.id} ${e.statut}`)).toEqual([`${meta} termine`]);
    // LE MÉTA SE TAIT SUR LE CANEVAS, et c'est la règle écrite le 2026-09-20 (CHANGELOG, « Un
    // méta-composant dispense déjà ses nœuds internes d'aperçu ») : grouper déclare un rouage et non
    // une destination, et un méta ne montre que ce que rendent ses sorties exposées
    // (`ui/correctif-resultat.ts`). Celui-ci enferme le point d'écoute terminal : il n'en expose
    // aucune. Relevé le 2026-11-16, douze passes faites et aucun lecteur. LA QUESTION EST POSÉE À
    // FABIEN : si un méta qui contient son point d'écoute doit se faire entendre de dehors, c'est
    // cette ligne qui change.
    expect([...(await lesSons(page)).keys()], "un méta sans sortie exposée ne montre aucun lecteur").toEqual([]);
    await entendreLeMeta(page, meta, "méta", reference!);
  });

  await test.step("l'aller-retour par un fichier, dans un navigateur neuf", async () => {
    const dossier = mkdtempSync(join(tmpdir(), "attic-graphe-complexite-"));
    try {
      const chemin = join(dossier, "gestion_graphe_complexite.json");
      // LE FOCUS EST RENDU AU DOCUMENT avant le raccourci, comme dans `persistance-aller-retour` : un
      // raccourci frappé dans un champ est ignoré, et le téléchargement ne viendrait pas.
      await page.locator(".attic-titre").click();
      const [telechargement] = await Promise.all([
        page.waitForEvent("download"), page.keyboard.press("Control+Shift+S"),
      ]);
      await telechargement.saveAs(chemin);
      const projet = JSON.parse(readFileSync(chemin, "utf8")) as {
        nodes: { id: string; data: { ficheId: string } }[];
        metas: { id: string; sousNoeuds: { id: string; data: { ficheId: string } }[] }[];
      };
      expect(projet.metas.map((m) => m.sousNoeuds.length), "le fichier emporte le méta, et ses dix-sept nœuds")
        .toEqual([17]);
      const fiches = [...projet.nodes, ...projet.metas[0].sousNoeuds].map((n) => n.data.ficheId);
      expect(fiches.filter((f) => f.startsWith("bulle::")), "aucune bulle n'entre dans le fichier").toEqual([]);

      const contexte = await browser.newContext();
      // LA PROFONDEUR D'EXPORT EST ÉPINGLÉE, comme `semer` le fait : un navigateur neuf écrit ses
      // aperçus en vingt-quatre bits, tramés canal par canal. Relevé le 2026-11-16 : gauche et
      // droite s'y écartaient de deux pas, 2,4e-7, sur un son que la synthèse rend identique.
      await contexte.addInitScript(() => localStorage.setItem("attic-profondeur-export", "32"));
      const neuve = await contexte.newPage();
      neuve.on("pageerror", (e) => erreurs.push(String(e)));
      const ditesNeuve = alertes(neuve);
      await neuve.goto(devUrl);
      await neuve.waitForSelector(".attic-app", { timeout: 15000 });
      // `accept` CONTIENT « .json », il ne l'égale plus : l'import prend aussi les paquets `.attic`
      // depuis la PR 370. Un sélecteur exact a fait attendre ce cas trente minutes, son délai entier.
      await neuve.setInputFiles('input[type="file"][accept*=".json"]', chemin, { timeout: 15000 });
      await expect.poll(async () => (await etatDesNoeuds(neuve)).map((e) => e.id), "le méta est rouvert")
        .toEqual([meta]);
      await relancerEtAttendre(neuve, PILOTE);
      expect((await etatDesNoeuds(neuve)).map((e) => `${e.id} ${e.statut}`)).toEqual([`${meta} termine`]);
      await entendreLeMeta(neuve, meta, "aller-retour", reference!);
      expect(ditesNeuve, "le projet rouvert ne signale aucune perte").toEqual([]);
      await contexte.close();
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  expect(erreurs, "aucune erreur de page").toEqual([]);
});
