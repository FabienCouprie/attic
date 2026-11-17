// tests-e2e/paquet-attic-dans-application.spec.ts — Un paquet `.attic` exporté d'une application s'ouvre
// dans une autre avec ses résultats, sans qu'un seul nœud ne se recalcule.
//
// ═══ POURQUOI CETTE ÉPREUVE ═══
//
// Demandée le 2026-11-16 avec le paquet : « exporter un graphe exécuté en `.attic`, le rouvrir dans
// une autre instance, et constater les résultats présents sans recalcul ». Les tests unitaires du
// paquet tiennent la vraie boucle du moteur, mais ni le pont d'Electron, ni le dialogue, ni la passe
// de repose de l'atelier, ni les lecteurs qu'elle refait. C'est ici que les cinq se rencontrent.
//
// ═══ CE QU'ELLE TIENT, profils et dossier jetables, dialogues remplacés par un témoin ═══
//
// 1. DANS UNE PREMIÈRE APPLICATION, ouvrir un graphe dont la source est un fichier du disque, le
//    lancer, relever ce que chaque lecteur fait entendre, et l'exporter AVEC SES DONNÉES.
// 2. LE FICHIER SOURCE EST EFFACÉ DU DISQUE : le paquet doit le porter, sans quoi la source se
//    recalculerait sur rien, et tout l'aval avec elle.
// 3. DANS UNE SECONDE APPLICATION, sur un profil neuf, ouvrir le paquet : aucun nœud ne passe « en
//    cours », chaque lecteur rend LES MÊMES OCTETS, et le projet n'a pas de fichier courant.
// 4. OUVRIR UNE COPIE TRONQUÉE DU PAQUET : elle est refusée, le projet ouvert reste à l'écran, et
//    presser Lancer ne recalcule toujours rien — le refus n'a pas même vidé le cache.
// 5. LA RÈGLE DES VERSIONS, décidée par Fabien le 2026-11-16, sur deux copies dont seul le manifeste
//    change : celle d'un Attic plus récent est refusée et dit sa version ; celle d'un Attic plus
//    ancien s'ouvre avec ses résultats, sans un nœud recalculé.
//
// LES APERÇUS SONT EN FLOTTANTS 32 BITS (`attic-profondeur-export`), comme ceux du pilote de graphe :
// des octets égaux y sont des échantillons égaux.
import { test, expect, _electron as electron, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apercusEnWav, apercusPoses, etatDesNoeuds, lireLesRelances, observerLesRelances, relancerEtAttendre } from "./pilote-graphe";
import { ecrireZip, extraire, lireRepertoire, type EntreeAEcrire } from "../src/ui/paquet/zip";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const EXEMPLE = join(RACINE, "exemples", "une-chanson-elargie.json");
const SON = join(RACINE, "tests-e2e", "son-de-reference.wav");
const BOUTON_IMPORTER = 'button[aria-label^="Importer un projet"], button[aria-label^="Import a project"]';
const BOUTON_PAQUET = 'button[aria-label^="Exporter le projet avec ses données"], button[aria-label^="Export the project with its data"]';

async function lancer(profil: string, ouvrir: string[], enregistrer: string[]) {
  const app = await electron.launch({
    args: [RACINE, `--user-data-dir=${profil}`],
    env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1" },
  });
  await app.evaluate(({ dialog }, files) => {
    const aOuvrir = [...files.ouvrir];
    const aEnregistrer = [...files.enregistrer];
    const d = dialog as unknown as Record<string, unknown>;
    d.showOpenDialog = async () => {
      const p = aOuvrir.shift();
      return p ? { canceled: false, filePaths: [p] } : { canceled: true, filePaths: [] };
    };
    d.showSaveDialog = async () => {
      const p = aEnregistrer.shift();
      return p ? { canceled: false, filePath: p } : { canceled: true };
    };
  }, { ouvrir, enregistrer });
  const page = await app.firstWindow();
  const journal: string[] = [];
  page.on("console", (m) => { if (m.text().startsWith("[attic]") || m.text().startsWith("[lancer]")) journal.push(m.text()); });
  await page.waitForSelector(".attic-app", { timeout: 60_000 });
  await page.evaluate(() => {
    const w = window as unknown as { __alertes__: string[]; alert: (m: unknown) => void };
    w.__alertes__ = [];
    w.alert = (m) => { w.__alertes__.push(String(m)); };
    localStorage.setItem("attic-profondeur-export", "32");
  });
  return { app, page, journal };
}

const alertes = (page: Page) => page.evaluate(() => (window as unknown as { __alertes__: string[] }).__alertes__.splice(0));

/**
 * Les blocs `fmt ` et `data` d'un WAV : son format et ses échantillons, sans ses métadonnées.
 *
 * L'APERÇU QU'UN NŒUD LIVRE PORTE L'HEURE DE SON ÉCRITURE dans son bloc `bext`, décidé par Fabien le
 * 2026-10-09 (`audio/metadonnees.ts`) : deux rendus du même son diffèrent par ces dix-huit octets, et
 * comparer le fichier entier mesurerait l'horloge. Relevé à la première passe de cette épreuve.
 */
function formatEtEchantillons(wav: Buffer): Buffer {
  const blocs: Buffer[] = [];
  for (let o = 12; o + 8 <= wav.length;) {
    const id = wav.toString("latin1", o, o + 4);
    const taille = wav.readUInt32LE(o + 4);
    if (id === "fmt " || id === "data") blocs.push(wav.subarray(o, o + 8 + taille));
    o += 8 + taille + (taille & 1);
  }
  expect(blocs.length, "un aperçu sans format ou sans échantillons").toBe(2);
  return Buffer.concat(blocs);
}

/** Ce que chaque lecteur fait entendre, en empreintes : un nœud, un SHA-256 de son format et de ses échantillons. */
async function cequonEntend(page: Page): Promise<Record<string, string>> {
  const rendu: Record<string, string> = {};
  for (const a of await apercusEnWav(page)) {
    rendu[a.id] = createHash("sha256").update(formatEtEchantillons(Buffer.from(a.base64, "base64"))).digest("hex");
  }
  return rendu;
}

/**
 * Attend que les lecteurs cessent de bouger, PAR LE PILOTE, puis exige leur nombre.
 *
 * LE NOMBRE MANQUANT DIT CE QU'ON VOYAIT : l'état de chaque nœud et ce qui s'est recalculé. Relevé en
 * plantant les fautes : un cache non rendu ou un média perdu ne se lisaient sinon que comme un délai.
 */
async function lecteursPoses(page: Page, nombre: number) {
  await apercusPoses(page);
  const vus = await page.locator("[data-id] audio[src]").count();
  const etats = (await etatDesNoeuds(page)).map((e) => `${e.id}:${e.statut}`).join(", ");
  expect(vus, `${vus} lecteur(s) au lieu de ${nombre} ; nœuds : ${etats} ; recalculés : ${(await lireLesRelances(page).catch(() => [])).join(", ")}`).toBe(nombre);
}

const ABSOLU = /[A-Za-z]:[\\/]|\\\\|file:\/\//;

/** Le même paquet, son manifeste disant une autre version d'Attic. Le manifeste ne s'empreint pas lui-même. */
async function ecritPar(octets: Uint8Array, application: string): Promise<Uint8Array> {
  const entrees: EntreeAEcrire[] = [];
  for (const [nom, e] of lireRepertoire(octets)) {
    let contenu = await extraire(octets, e, 1e9);
    if (nom === "paquet.json") contenu = new TextEncoder().encode(JSON.stringify({ ...JSON.parse(new TextDecoder().decode(contenu)), application }));
    entrees.push({ nom, octets: contenu, compresser: nom.endsWith(".json") });
  }
  return await ecrireZip(entrees);
}

/** Ouvre le fichier suivant du dialogue et attend sa passe de repose, que le journal dit d'une ligne `[lancer]`. */
async function ouvrirEtAttendreLaRepose(app: { page: Page; journal: string[] }) {
  const avant = app.journal.filter((l) => l.startsWith("[lancer]")).length;
  await app.page.locator(BOUTON_IMPORTER).first().click();
  await expect.poll(() => app.journal.filter((l) => l.startsWith("[lancer]")).length, { timeout: 30_000, message: "aucune passe de repose" }).toBe(avant + 1);
}

test.describe("un paquet .attic d'une application à l'autre", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.setTimeout(360_000);

  test("SES RÉSULTATS S'OUVRENT SANS RECALCUL, SA SOURCE EFFACÉE DU DISQUE ; UNE COPIE ABÎMÉE OU PLUS RÉCENTE N'Y TOUCHE PAS", async () => {
    const d = mkdtempSync(join(tmpdir(), "attic-paquet-"));
    const profils = [mkdtempSync(join(tmpdir(), "attic-paquet-profil-")), mkdtempSync(join(tmpdir(), "attic-paquet-profil-"))];
    const voix = join(d, "voix.wav"), projet = join(d, "projet.json"), paquet = join(d, "projet.attic"), abime = join(d, "abime.attic");
    const recent = join(d, "recent.attic"), ancien = join(d, "ancien.attic");
    copyFileSync(SON, voix);
    const g = JSON.parse(readFileSync(EXEMPLE, "utf8")) as { nodes: { id: string; data: Record<string, any> }[] };
    const source = g.nodes.find((n) => n.data.ficheId === "entree-audio")!;
    source.data.parametres = { ...source.data.parametres, Chemin: voix };
    source.data.audioNom = "voix.wav";
    writeFileSync(projet, JSON.stringify(g, null, 2), "utf8");
    const mesures: Record<string, unknown> = {};
    try {
      // ═══ 1. OUVRIR, LANCER, ÉCOUTER, EXPORTER AVEC LES DONNÉES ═══
      let entendu: Record<string, string>;
      const un = await lancer(profils[0], [projet], [paquet]);
      try {
        await un.page.locator(BOUTON_IMPORTER).first().click();
        await un.page.waitForSelector('.react-flow__node[data-id="large"]', { timeout: 30_000 });
        await un.page.waitForTimeout(1000);
        await relancerEtAttendre(un.page);
        const etats = await etatDesNoeuds(un.page);
        expect(etats.filter((e) => e.statut === "erreur"), "un nœud a échoué au premier run").toEqual([]);
        const nbLecteurs = await un.page.locator("[data-id] audio[src]").count();
        expect(nbLecteurs, "le graphe doit faire entendre quelque chose").toBeGreaterThan(0);
        entendu = await cequonEntend(un.page);
        const t1 = Date.now();
        await un.page.locator(BOUTON_PAQUET).first().click();
        await expect.poll(() => existsSync(paquet) && statSync(paquet).size > 0, { timeout: 30_000, message: "le paquet n'a pas été écrit" }).toBe(true);
        await expect.poll(() => un.journal.some((l) => l.startsWith("[attic] Paquet exporté")), { timeout: 30_000 }).toBe(true);
        mesures.exportA_ms = Date.now() - t1;
        mesures.journalA = un.journal.filter((l) => l.startsWith("[attic] Paquet"));
        expect(await alertes(un.page), "une alerte a paru à l'export").toEqual([]);
        expect(await un.page.evaluate(() => localStorage.getItem("attic-current-file-path")), "l'export a changé le fichier courant").not.toBe(paquet);
      } finally {
        await un.app.close();
      }

      // ═══ CE QUE LE PAQUET PORTE, lu hors de l'application ═══
      const octets = new Uint8Array(readFileSync(paquet));
      mesures.paquet_octets = octets.length;
      const r = lireRepertoire(octets);
      const noms = [...r.keys()];
      expect(noms.slice(0, 3)).toEqual(["paquet.json", "projet.json", "donnees.json"]);
      const donnees = new TextDecoder().decode(await extraire(octets, r.get("donnees.json")!, 1e8));
      const manifeste = JSON.parse(new TextDecoder().decode(await extraire(octets, r.get("paquet.json")!, 1e8)));
      mesures.entrees = manifeste.entrees.length;
      expect(manifeste.format).toBe("attic-paquet");
      // LES EMPREINTES DE RÉGLAGES MISES À PART, qui reprennent `projet.json`, AUCUN CHEMIN ABSOLU NE PART.
      const sansEmpreintes = donnees.replace(/"(hashParams|empreinteBoucle)":"(?:[^"\\]|\\.)*"/g, "");
      expect(sansEmpreintes.match(ABSOLU), "un chemin absolu est parti dans les données").toBeNull();
      const lu = JSON.parse(donnees) as { cache: [string, unknown][]; medias: [string, unknown][] };
      mesures.cache = lu.cache.map(([id]) => id);
      expect(lu.medias.map(([id]) => id), "le son chargé est dans le paquet").toEqual([source.id]);

      // ═══ 2. LA SOURCE DISPARAÎT DU DISQUE ═══
      unlinkSync(voix);
      writeFileSync(abime, octets.subarray(0, octets.length - 40));
      writeFileSync(recent, await ecritPar(octets, "99.0.0"));
      writeFileSync(ancien, await ecritPar(octets, "0.0.1"));

      // ═══ 3. UNE SECONDE APPLICATION OUVRE LE PAQUET ═══
      const deux = await lancer(profils[1], [paquet, abime, recent, ancien], []);
      try {
        await observerLesRelances(deux.page);
        const t2 = Date.now();
        await deux.page.locator(BOUTON_IMPORTER).first().click();
        await deux.page.waitForSelector('.react-flow__node[data-id="large"]', { timeout: 30_000 });
        await lecteursPoses(deux.page, Object.keys(entendu).length);
        // LE TEMPS COMPTE LES TROIS SECONDES OÙ LE PILOTE ATTEND QUE LES LECTEURS NE BOUGENT PLUS.
        mesures.ouvertureB_ms = Date.now() - t2;
        expect(await lireLesRelances(deux.page), "un nœud s'est recalculé à l'ouverture").toEqual([]);
        expect(await cequonEntend(deux.page), "les lecteurs ne rendent pas les mêmes octets").toEqual(entendu);
        expect(await alertes(deux.page), "une alerte a paru à l'ouverture").toEqual([]);
        expect(await deux.page.evaluate(() => localStorage.getItem("attic-current-file-path")), "un paquet ouvert est devenu le fichier courant").not.toBe(paquet);
        const etats = await etatDesNoeuds(deux.page);
        expect(etats.filter((e) => e.statut !== "termine").map((e) => e.id), "un nœud n'a pas son résultat").toEqual([]);

        // ═══ 4. UNE COPIE ABÎMÉE EST REFUSÉE, ET LE PROJET OUVERT NE BOUGE PAS ═══
        await deux.page.locator(BOUTON_IMPORTER).first().click();
        await expect.poll(async () => (await deux.page.evaluate(() => (window as unknown as { __alertes__: string[] }).__alertes__.length)), { timeout: 15_000 }).toBe(1);
        const refus = await alertes(deux.page);
        expect(refus[0]).toMatch(/n'a pas été ouvert|was not opened/);
        expect(await cequonEntend(deux.page), "le refus a touché au projet ouvert").toEqual(entendu);
        await relancerEtAttendre(deux.page);
        expect(await deux.page.locator("[data-id] audio[src]").count(), "Lancer a perdu un lecteur").toBe(Object.keys(entendu).length);
        expect(await lireLesRelances(deux.page), "Lancer a recalculé un nœud du paquet").toEqual([]);
        expect(await cequonEntend(deux.page)).toEqual(entendu);

        // ═══ 5. UN ATTIC PLUS RÉCENT EST REFUSÉ, UN PLUS ANCIEN S'OUVRE AVEC SES RÉSULTATS ═══
        await deux.page.locator(BOUTON_IMPORTER).first().click();
        await expect.poll(async () => (await deux.page.evaluate(() => (window as unknown as { __alertes__: string[] }).__alertes__.length)), { timeout: 15_000 }).toBe(1);
        const plusRecent = await alertes(deux.page);
        mesures.refusPlusRecent = plusRecent[0];
        expect(plusRecent[0]).toMatch(/Attic 99\.0\.0/);
        expect(await cequonEntend(deux.page), "le refus d'un Attic plus récent a touché au projet ouvert").toEqual(entendu);
        await ouvrirEtAttendreLaRepose(deux);
        await lecteursPoses(deux.page, Object.keys(entendu).length);
        expect(await alertes(deux.page), "une alerte a paru à l'ouverture d'un paquet plus ancien").toEqual([]);
        expect(await lireLesRelances(deux.page), "un paquet d'un Attic plus ancien a fait recalculer un nœud").toEqual([]);
        expect(await cequonEntend(deux.page)).toEqual(entendu);
        mesures.journalB = deux.journal.filter((l) => l.startsWith("[lancer]") || l.startsWith("[attic] Import"));
      } finally {
        await deux.app.close();
      }
      mesures.lecteurs = Object.keys(entendu);
      console.log(`[paquet] ${JSON.stringify(mesures)}`);
    } finally {
      for (const p of [d, ...profils]) rmSync(p, { recursive: true, force: true });
    }
  });
});
