// tests-e2e/plafond-paquet-dans-electron.spec.ts — Le plafond d'un paquet `.attic`, réglé par
// `config.json`, tient à l'ouverture dans l'application elle-même.
//
// ═══ CE QUE CETTE ÉPREUVE TIENT, ET QU'AUCUN CAS UNITAIRE NE PEUT TENIR ═══
//
// Pièce C1 du plan du fichier de configuration (2026-11-19). `ui/paquet/plafond-du-paquet.test.ts`
// tient l'export et l'import derrière un pont témoin ; reste le chemin entier : la clé
// `plafondPaquetMio` lue par le processus principal au démarrage, reçue par l'interface, et appliquée
// au paquet que le dialogue d'ouverture rend. Dans les deux sens :
//   — sans fichier, le plafond est de 1024 Mio, et un paquet qui en déclare 1500 est refusé, le
//     message disant les deux nombres ;
//   — sous 2000 Mio, LE MÊME PAQUET PASSE LE PLAFOND, et tombe plus loin, sur ce qu'il est : ses
//     octets ne sont pas ceux qu'il déclare ;
//   — sous 256 Mio, un paquet qui en déclare 300 est refusé.
//
// LES PAQUETS SONT FABRIQUÉS, et pèsent quelques centaines d'octets : une entrée y déclare des
// centaines de Mio sans les porter, ce qu'est une bombe zip. Aucun ne se décompresse au-delà de sa
// première entrée de données : le plafond se juge sur ce qui est déclaré. Ainsi l'épreuve ne coûte
// pas la mémoire d'un vrai paquet de 1,5 Gio.
//
// UN PROFIL JETABLE PAR LANCEMENT, et le dialogue d'ouverture remplacé par un témoin, comme
// `paquet-attic-dans-application.spec.ts`. L'interface vient de `dist/`.
import { test, expect, _electron as electron } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ecrireZip } from "../src/ui/paquet/zip";
import { effacerProfil, profilAvec } from "./demarrage-electron";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const VERSION = JSON.parse(readFileSync(join(RACINE, "package.json"), "utf8")).version as string;
const BOUTON_IMPORTER = 'button[aria-label^="Importer un projet"], button[aria-label^="Import a project"]';
const MIO = 1024 ** 2;
const ATOME = "donnees/000000.bin";

/**
 * Un paquet qui déclare `mio` Mio décompressés en tout, et dont l'unique atome n'en porte que seize octets.
 *
 * LE TOTAL EST EXACT : l'atome déclare `mio` Mio moins le projet et les données. Relevé à la première
 * passe, un atome de `mio` Mio rond faisait lire « 1501 Mio » : le message arrondit vers le haut.
 * LE MANIFESTE ET LE RÉPERTOIRE DISENT LA MÊME TAILLE, sans quoi la lecture refuserait avant le
 * plafond. Le projet et les données sont sains : sous un plafond assez haut, c'est l'atome qui tombe.
 */
async function paquetQuiDeclare(mio: number): Promise<Uint8Array> {
  const texte = new TextEncoder();
  const projet = texte.encode(JSON.stringify({ formatVersion: 1, nodes: [], edges: [] }));
  const donnees = texte.encode(JSON.stringify({ cache: [], medias: [], partages: [] }));
  const atome = mio * MIO - projet.length - donnees.length;
  const sha = (o: Uint8Array) => createHash("sha256").update(o).digest("hex");
  const manifeste = texte.encode(JSON.stringify({
    format: "attic-paquet", version: 1, application: VERSION,
    entrees: [
      { nom: "projet.json", octets: projet.length, sha256: sha(projet) },
      { nom: "donnees.json", octets: donnees.length, sha256: sha(donnees) },
      { nom: ATOME, octets: atome, sha256: "0".repeat(64) },
    ],
  }));
  const zip = await ecrireZip([
    { nom: "paquet.json", octets: manifeste, compresser: true },
    { nom: "projet.json", octets: projet, compresser: true },
    { nom: "donnees.json", octets: donnees, compresser: true },
    { nom: ATOME, octets: new Uint8Array(16), compresser: true },
  ]);
  // LA TAILLE DÉCLARÉE DE L'ATOME, au répertoire central (+24) et à son en-tête local (+22).
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const fin = zip.length - 22;
  let o = dv.getUint32(fin + 16, true);
  for (let k = 0; k < dv.getUint16(fin + 10, true); k++) {
    const l = dv.getUint16(o + 28, true);
    if (new TextDecoder().decode(zip.subarray(o + 46, o + 46 + l)) === ATOME) {
      dv.setUint32(o + 24, atome, true);
      dv.setUint32(dv.getUint32(o + 42, true) + 22, atome, true);
    }
    o += 46 + l;
  }
  return zip;
}

/** Ouvre le paquet dans une application lancée sur ce `config.json`, et rend l'alerte qui paraît. */
async function ouvrirSous(config: string | null, mio: number): Promise<string> {
  const profil = profilAvec(config);
  const fichier = join(profil, `declare-${mio}.attic`);
  writeFileSync(fichier, await paquetQuiDeclare(mio));
  const app = await electron.launch({
    args: [RACINE, `--user-data-dir=${profil}`], cwd: RACINE,
    env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1" },
  });
  try {
    await app.evaluate(({ dialog }, chemin) => {
      (dialog as unknown as Record<string, unknown>).showOpenDialog = async () => ({ canceled: false, filePaths: [chemin] });
    }, fichier);
    const page = await app.firstWindow();
    await page.waitForSelector(".attic-app", { timeout: 60_000 });
    await page.evaluate(() => {
      const w = window as unknown as { __alertes__: string[]; alert: (m: unknown) => void };
      w.__alertes__ = [];
      w.alert = (m) => { w.__alertes__.push(String(m)); };
    });
    await page.locator(BOUTON_IMPORTER).first().click();
    const lire = () => page.evaluate(() => (window as unknown as { __alertes__: string[] }).__alertes__);
    await expect.poll(async () => (await lire()).length, { timeout: 30_000, message: "aucune alerte à l'ouverture" }).toBe(1);
    return (await lire())[0];
  } finally {
    await app.close().catch(() => {});
    await effacerProfil(profil);
  }
}

const REFUS = /n'a pas été ouvert|was not opened/;
const PLAFOND = /plafond|limit/;
const TAILLE = /ne fait pas la taille qu'elle déclare|is not the size it declares/;

test.describe("le plafond d'un paquet, réglé par config.json, dans Electron", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.setTimeout(300_000);

  test("SANS FICHIER, 1024 MIO : UN PAQUET QUI EN DÉCLARE 1500 EST REFUSÉ, ET LE MESSAGE DIT LES DEUX NOMBRES", async () => {
    const alerte = await ouvrirSous(null, 1500);
    expect(alerte).toMatch(REFUS);
    expect(alerte).toMatch(/déclare 1500 Mio .* plafond de 1024 Mio|declares 1500 MiB .* limit of 1024 MiB/);
    expect(alerte).toMatch(/plafondPaquetMio/);
  });

  test("SOUS 2000 MIO, LE MÊME PAQUET PASSE LE PLAFOND, ET TOMBE SUR SES OCTETS", async () => {
    const alerte = await ouvrirSous(JSON.stringify({ plafondPaquetMio: 2000 }), 1500);
    expect(alerte).toMatch(REFUS);
    expect(alerte, "le plafond réglé n'a pas atteint la lecture").not.toMatch(PLAFOND);
    expect(alerte).toMatch(TAILLE);
  });

  test("SOUS 256 MIO, UN PAQUET QUI EN DÉCLARE 300 EST REFUSÉ", async () => {
    const alerte = await ouvrirSous(JSON.stringify({ plafondPaquetMio: 256 }), 300);
    expect(alerte).toMatch(/déclare 300 Mio .* plafond de 256 Mio|declares 300 MiB .* limit of 256 MiB/);
  });
});
