// electron/telechargement-reprise.test.ts — Interrompre un téléchargement, le reprendre, et exiger
// que l'empreinte tombe juste.
//
// LE DÉFAUT, RELEVÉ PAR FABIEN : cliquer sur l'icône pendant un téléchargement le relançait depuis
// le début. Le clic interrompt — c'est voulu — mais ce qui était téléchargé était perdu en entier :
// le `.partiel` était effacé à l'abandon, et aucune requête ne portait d'en-tête `Range`. Sur un
// modèle de 1,7 Go, une seconde d'inattention coûtait tout.
//
// CE QUE CE TEST TIENT, ET POURQUOI IL LUI FAUT UN SERVEUR. La reprise ne se vérifie pas sur une
// fonction pure : elle se joue entre deux requêtes, un fichier sur le disque et un serveur qui
// honore — ou non — une plage d'octets. Le serveur est donc monté ici, et il sait se comporter de
// trois façons que le vrai monde présente :
//
//   1. il honore la plage, et rend `206` avec la suite ;
//   2. il l'ignore et rend `200` avec le fichier entier, ce qu'un miroir mal configuré fait ;
//   3. il redirige, ce que fait GitHub — mesuré le 2026-10-19, c'est l'hôte final qui honore la
//      plage, jamais `github.com`, de sorte qu'un en-tête perdu en route donne le cas 2.
//
// LE CAS 2 EST CELUI QUI CORROMPT. Ajouter un fichier entier à la suite d'un `.partiel` donne un
// fichier du double, dont l'empreinte est fausse — et on ne le découvrirait qu'après avoir tout
// téléchargé. La règle est donc : une plage demandée qui revient en `200` fait repartir de zéro.
import { createRequire } from "module";
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { telechargerFichier } = createRequire(import.meta.url)("./telechargement-modeles.cjs") as {
  telechargerFichier: (url: string, destination: string, o?: {
    onProgress?: (recus: number) => void; signal?: AbortSignal; deja?: number;
  }) => Promise<{ ok: boolean; sha256?: string; octets?: number; erreur?: string; annule?: boolean; temporaire?: string }>;
};

/** Un corps déterministe, assez gros pour être coupé en deux et assez petit pour un test. */
const TAILLE = 120_000;
const CORPS = Buffer.alloc(TAILLE);
for (let i = 0; i < TAILLE; i++) CORPS[i] = (i * 7 + 13) & 0xff;
const EMPREINTE = createHash("sha256").update(CORPS).digest("hex");

/** Les plages que le serveur a vraiment reçues, pour pouvoir dire ce qui a été demandé. */
const plagesRecues: string[] = [];
let serveur: Server;
let base = "";
let dossier = "";

beforeAll(async () => {
  serveur = createServer((req, res) => {
    const chemin = (req.url ?? "/").split("?")[0];
    plagesRecues.push(`${chemin} ${req.headers.range ?? "sans plage"}`);

    if (chemin === "/redirige") {
      res.writeHead(302, { location: "/honore" });
      return res.end();
    }
    const plage = chemin === "/ignore" ? null : /^bytes=(\d+)-/.exec(String(req.headers.range ?? ""));
    const debut = plage ? Number(plage[1]) : 0;
    const morceau = CORPS.subarray(debut);
    res.writeHead(plage ? 206 : 200, {
      "content-length": String(morceau.length),
      "accept-ranges": "bytes",
      ...(plage ? { "content-range": `bytes ${debut}-${TAILLE - 1}/${TAILLE}` } : {}),
    });
    // Par petits morceaux et avec un souffle, pour qu'une interruption tombe au milieu.
    let pose = 0;
    const envoyer = () => {
      if (pose >= morceau.length) return res.end();
      const fin = Math.min(pose + 8_000, morceau.length);
      res.write(morceau.subarray(pose, fin));
      pose = fin;
      setTimeout(envoyer, 12);
    };
    envoyer();
  });
  await new Promise<void>((pret) => serveur.listen(0, "127.0.0.1", pret));
  base = `http://127.0.0.1:${(serveur.address() as { port: number }).port}`;
  dossier = mkdtempSync(join(tmpdir(), "attic-reprise-"));
});

afterAll(async () => {
  await new Promise<void>((fini) => serveur.close(() => fini()));
  rmSync(dossier, { recursive: true, force: true });
});

/** Lance un téléchargement et l'interrompt dès que `seuil` octets sont arrivés. */
async function interrompreApres(url: string, destination: string, seuil: number) {
  const arret = new AbortController();
  return telechargerFichier(url, destination, {
    signal: arret.signal,
    onProgress: (recus) => { if (recus >= seuil) arret.abort(); },
  });
}

type Rappel = (erreur: unknown, valeur?: unknown) => void;
type Appel = (...a: unknown[]) => unknown;

/**
 * Tient en vol la `rang`-ième écriture du flux ouvert sur `chemin`, puis la rend au vrai disque.
 *
 * POURQUOI CET INSTRUMENT. La course qu'éprouve le cas « L'ARRÊT ATTEND L'ÉCRITURE EN VOL » ne
 * s'ouvrait que sous charge : la CI de la PR 295 l'a vue le 2026-11-06, une sonde de trente
 * interruptions au repos jamais. Une écriture partie dans le pool de libuv s'y achève sur un fil de
 * travail, quand elle le peut, et le fil principal ne l'attend pas. Le flux d'écriture de Node
 * relit `write` et `writev` sur le module `fs` à chaque écriture : les envelopper tient une
 * écriture en vol aussi longtemps que le cas le décide, ce que la charge fait au hasard.
 *
 * Seul le descripteur ouvert sur `chemin` est touché, et `tenue` ne se règle qu'une fois une
 * écriture retenue : un cas qui ne retiendrait rien finirait son téléchargement et ne dirait rien.
 */
function retenirEcriture(chemin: string, rang: number) {
  const fs = createRequire(import.meta.url)("node:fs") as Record<"open" | "write" | "writev", Appel>;
  const origine = { open: fs.open, write: fs.write, writev: fs.writev };
  const descripteurs = new Set<unknown>();
  let vues = 0;
  let rendre: (() => void) | null = null;
  let signalerTenue = () => {};
  let signalerAchevee: (octets: number) => void = () => {};
  const tenue = new Promise<void>((r) => { signalerTenue = r; });
  const achevee = new Promise<number>((r) => { signalerAchevee = r; });

  fs.open = (...a) => {
    const rappel = a.pop() as Rappel;
    return origine.open(...a, (erreur: unknown, fd: unknown) => {
      if (!erreur && String(a[0]) === chemin) descripteurs.add(fd);
      rappel(erreur, fd);
    });
  };
  const envelopper = (vraie: Appel): Appel => (...a) => {
    if (!descripteurs.has(a[0]) || ++vues !== rang) return vraie(...a);
    const rappel = a.pop() as Rappel;
    rendre = () => vraie(...a, (erreur: unknown, octets: unknown) => {
      signalerAchevee(Number(octets));
      rappel(erreur, octets);
    });
    signalerTenue();
  };
  fs.write = envelopper(origine.write);
  fs.writev = envelopper(origine.writev);

  const liberer = () => { const r = rendre; rendre = null; r?.(); };
  return { tenue, achevee, liberer, restaurer: () => { Object.assign(fs, origine); liberer(); } };
}

describe("reprendre un téléchargement interrompu", () => {
  it("UNE INTERRUPTION GARDE CE QUI EST DÉJÀ LÀ", async () => {
    const destination = join(dossier, "garde.bin");
    const r = await interrompreApres(`${base}/honore`, destination, 30_000);
    expect(r.annule, r.erreur).toBe(true);
    expect(existsSync(`${destination}.partiel`),
      "le .partiel a été effacé : tout est à retélécharger").toBe(true);
    const taille = statSync(`${destination}.partiel`).size;
    expect(taille).toBeGreaterThan(0);
    expect(taille).toBeLessThan(TAILLE);
  });

  it("ET LA REPRISE DEMANDE LA SUITE, PUIS REND L'EMPREINTE JUSTE", async () => {
    const destination = join(dossier, "reprise.bin");
    const premier = await interrompreApres(`${base}/honore`, destination, 30_000);
    expect(premier.annule).toBe(true);
    const deja = statSync(`${destination}.partiel`).size;

    plagesRecues.length = 0;
    const second = await telechargerFichier(`${base}/honore`, destination);
    expect(second.ok, second.erreur).toBe(true);
    expect(second.sha256).toBe(EMPREINTE);
    expect(second.octets).toBe(TAILLE);
    expect(plagesRecues.join(" "), "la reprise n'a pas demandé de plage")
      .toContain(`bytes=${deja}-`);
    expect(readFileSync(second.temporaire!).length).toBe(TAILLE);
  });

  it("L'ARRÊT ATTEND L'ÉCRITURE EN VOL : la taille rendue est celle que la reprise relira", async () => {
    // LE DÉFAUT QUE CE CAS TIENT, vu par la CI de la PR 295 le 2026-11-06 sur le cas précédent :
    // 16 000 octets mesurés au retour de l'interruption, 24 000 relus par la reprise un instant
    // plus tard, et une plage demandée qui n'était plus la bonne. L'interruption rendait la main
    // pendant qu'une écriture s'achevait encore. Ici l'écriture est tenue exprès, au lieu
    // d'attendre que la charge la tienne.
    const destination = join(dossier, "en-vol.bin");
    const partiel = `${destination}.partiel`;
    const retenue = retenirEcriture(partiel, 2);
    let tailleRendue = -1;
    try {
      const arret = new AbortController();
      let rendu = false;
      const course = telechargerFichier(`${base}/honore`, destination, { signal: arret.signal })
        .then((r) => { rendu = true; tailleRendue = statSync(partiel).size; return r; });
      await Promise.race([retenue.tenue, course.then(() => {
        throw new Error("aucune écriture retenue : l'instrument n'a rien éprouvé");
      })]);
      const surDisque = statSync(partiel).size;
      arret.abort();
      // Un tour de boucle, pour qu'une réponse rendue à l'arrêt mesure le partiel avant que
      // l'écriture retenue ne reparte : c'est la fenêtre que la charge ouvrait.
      await new Promise((r) => setImmediate(r));
      const renduEnVol = rendu;
      retenue.liberer();
      const r = await course;
      const octetsRetenus = await retenue.achevee;
      expect(r.annule, r.erreur).toBe(true);
      expect(surDisque, "la première écriture n'est pas arrivée sur le disque").toBeGreaterThan(0);
      expect(octetsRetenus, "l'écriture retenue ne portait rien").toBeGreaterThan(0);
      expect(tailleRendue, "le partiel a grandi après le retour de l'interruption")
        .toBe(surDisque + octetsRetenus);
      expect(renduEnVol, "l'interruption a rendu la main avec une écriture encore en vol").toBe(false);
    } finally {
      retenue.restaurer();
    }

    plagesRecues.length = 0;
    const second = await telechargerFichier(`${base}/honore`, destination);
    expect(second.ok, second.erreur).toBe(true);
    expect(second.sha256).toBe(EMPREINTE);
    expect(plagesRecues.join(" "), "la reprise n'a pas demandé la suite de ce qui était rendu")
      .toContain(`bytes=${tailleRendue}-`);
  });

  it("UNE ÉCRITURE IMPOSSIBLE REND SON ERREUR, et l'attente de la fermeture ne pend pas", async () => {
    // C'EST LE CHEMIN OÙ LE FLUX EST DÉJÀ FERMÉ QUAND L'ARRÊT S'EN MÊLE. Relevé sur Node 26.5 le
    // 2026-11-07 : à l'émission de `error`, `closed` vaut déjà vrai et `close` n'est pas encore
    // parti ; et une fois `close` passé, un second `destroy` ne le réémet pas. Un `.partiel` qui
    // est un dossier fait échouer l'ouverture, et le cas exige une réponse au lieu d'un délai.
    const destination = join(dossier, "bloque.bin");
    mkdirSync(`${destination}.partiel`);
    const r = await telechargerFichier(`${base}/honore`, destination);
    expect(r.ok).toBe(false);
    expect(r.annule).toBe(false);
    expect(r.erreur).toMatch(/EISDIR|EPERM|EACCES/);
  });

  it("UN SERVEUR QUI IGNORE LA PLAGE NE CORROMPT RIEN : on repart de zéro", async () => {
    const destination = join(dossier, "ignore.bin");
    // Un `.partiel` déjà là, comme après une interruption.
    writeFileSync(`${destination}.partiel`, CORPS.subarray(0, 40_000));
    const r = await telechargerFichier(`${base}/ignore`, destination);
    expect(r.ok, r.erreur).toBe(true);
    expect(r.octets, "le fichier entier a été ajouté à la suite du partiel").toBe(TAILLE);
    expect(r.sha256).toBe(EMPREINTE);
  });

  it("LA PLAGE TRAVERSE LA REDIRECTION, sinon le cas précédent se produirait tout seul", async () => {
    const destination = join(dossier, "redirige.bin");
    writeFileSync(`${destination}.partiel`, CORPS.subarray(0, 50_000));
    plagesRecues.length = 0;
    const r = await telechargerFichier(`${base}/redirige`, destination);
    expect(r.ok, r.erreur).toBe(true);
    expect(r.sha256).toBe(EMPREINTE);
    const apresRedirection = plagesRecues.filter((p) => p.startsWith("/honore"));
    expect(apresRedirection.join(" "), "la plage a été perdue en chemin").toContain("bytes=50000-");
  });

  it("un téléchargement sans partiel se comporte comme avant", async () => {
    const destination = join(dossier, "neuf.bin");
    plagesRecues.length = 0;
    const r = await telechargerFichier(`${base}/honore`, destination);
    expect(r.ok, r.erreur).toBe(true);
    expect(r.sha256).toBe(EMPREINTE);
    expect(plagesRecues.join(" "), "une première prise ne demande pas de plage").toContain("sans plage");
  });
});
