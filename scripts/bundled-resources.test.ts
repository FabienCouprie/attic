// scripts/bundled-resources.test.ts — Garde-fous des ressources embarquées dans l'installeur.
import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { verifierSources, verifierPaquet } = require("./verify-bundled-resources.cjs");
const { lireManifeste, comparerAuManifeste, extraireManquants } = require("./download-music-collection.cjs");
const AdmZip = require("adm-zip");

const temporaires: string[] = [];
function dossierTemp() {
  const d = mkdtempSync(join(tmpdir(), "attic-ressources-"));
  temporaires.push(d);
  return d;
}
afterEach(() => { for (const d of temporaires.splice(0)) rmSync(d, { recursive: true, force: true }); });

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

describe("verifierSources", () => {
  it("signale une source absente — le cas qui a vidé les installeurs 3.x de « music collection »", () => {
    const racine = dossierTemp();
    expect(verifierSources(racine, [{ from: "music collection", to: "music collection" }]))
      .toEqual(["music collection : source absente"]);
  });

  it("tient pour vide un dossier qui n'a qu'un .gitkeep et un README, ou des fichiers de 0 octet", () => {
    const racine = dossierTemp();
    mkdirSync(join(racine, "bin/songsee"), { recursive: true });
    writeFileSync(join(racine, "bin/songsee/.gitkeep"), "");
    writeFileSync(join(racine, "bin/songsee/README.md"), "binaire récupéré au build");
    writeFileSync(join(racine, "bin/songsee/vide.exe"), "");
    expect(verifierSources(racine, [{ from: "bin/songsee", to: "bin/songsee" }])).toEqual(["bin/songsee : source vide"]);
  });

  it("accepte des sources présentes, dossier ou fichier", () => {
    const racine = dossierTemp();
    mkdirSync(join(racine, "col/sous"), { recursive: true });
    writeFileSync(join(racine, "col/sous/a.mp3"), "abc");
    writeFileSync(join(racine, "TERMS.txt"), "conditions");
    expect(verifierSources(racine, [{ from: "col", to: "col" }, { from: "TERMS.txt", to: "TERMS.txt" }])).toEqual([]);
  });
});

describe("verifierPaquet", () => {
  function preparer() {
    const racine = dossierTemp();
    mkdirSync(join(racine, "col"));
    writeFileSync(join(racine, "col/a.mp3"), "aaaa");
    writeFileSync(join(racine, "col/b.mp3"), "bb");
    const res = join(racine, "release/resources");
    mkdirSync(join(res, "collection"), { recursive: true });
    return { racine, res };
  }

  it("signale une ressource absente de l'application construite", () => {
    const { racine, res } = preparer();
    expect(verifierPaquet(racine, [{ from: "col", to: "autre" }], res)).toEqual(["autre : absent de l'application construite"]);
  });

  it("signale une copie incomplète", () => {
    const { racine, res } = preparer();
    writeFileSync(join(res, "collection/a.mp3"), "aaaa");
    expect(verifierPaquet(racine, [{ from: "col", to: "collection" }], res))
      .toEqual(["collection : 1 fichier(s) / 4 octets dans l'application, 2 / 6 dans la source"]);
  });

  it("accepte une copie complète, sans les fichiers cachés qu'electron-builder ne copie pas", () => {
    const { racine, res } = preparer();
    writeFileSync(join(racine, "col/.gitkeep"), "");
    writeFileSync(join(res, "collection/a.mp3"), "aaaa");
    writeFileSync(join(res, "collection/b.mp3"), "bb");
    expect(verifierPaquet(racine, [{ from: "col", to: "collection" }], res)).toEqual([]);
  });
});

describe("configuration réelle", () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

  it("embarque la collection musicale, utilisée par les exemples de formation", () => {
    expect(pkg.build.extraResources).toContainEqual({ from: "music collection", to: "music collection" });
  });

  it("le workflow de release récupère la collection et vérifie les ressources avant et après packaging", () => {
    const wf = readFileSync(join(__dirname, "..", ".github/workflows/release.yml"), "utf8").replace(/\r\n/g, "\n");
    expect(wf).toContain("npm run download:music-collection");
    expect(wf).toContain("node scripts/verify-bundled-resources.cjs\n");
    expect(wf).toContain("node scripts/verify-bundled-resources.cjs --paquet release/win-unpacked/resources");
  });

  it("ET IL NE RAPATRIE PLUS AUCUN MODÈLE, qui ne sont plus embarqués", () => {
    // Le workflow allait chercher GTCRN et Audiobox avant de construire, parce qu'ils partaient
    // dans l'installeur depuis `public/oonx`. Ce dossier a quitté `extraResources` le 2026-10-08
    // et `build.files` exclut `dist/oonx/**/*` : plus rien n'y mène. Les y laisser aurait coûté
    // quatre cents méga-octets de téléchargement par release, pour un fichier que personne
    // n'empaquette.
    const wf = readFileSync(join(__dirname, "..", ".github/workflows/release.yml"), "utf8");
    expect(wf).not.toContain("run: npm run download:audiobox-aesthetics");
    expect(wf).not.toContain("run: npm run download:gtcrn");
    expect(pkg.build.extraResources.map((r: { from: string }) => r.from)).not.toContain("public/oonx");
    expect(pkg.build.files).toContain("!dist/oonx/**/*");
  });

  it("TOUT CE QUI EST EMBARQUÉ ET ABSENT DE GIT SE RÉCUPÈRE, sans quoi un clone est muet", () => {
    // LE DÉFAUT QUE CE CAS EMPÊCHE A DÉJÀ EU LIEU : « music collection » était embarquée et
    // ignorée par git, absente du checkout, et electron-builder l'a sautée avec un simple
    // avertissement — les installeurs 3.x sont partis sans elle. La même forme guette toute
    // ressource qu'on ajoute : si rien ne sait aller la chercher, un clone ne l'a pas.
    let suivis: Set<string>;
    try {
      suivis = new Set(execSync("git ls-files", { cwd: join(__dirname, ".."), encoding: "utf8" })
        .split("\n").filter(Boolean));
    } catch {
      return; // hors dépôt git : le cas ne peut rien dire, et ne prétend rien.
    }
    const dansGit = (source: string) => [...suivis].some((f) => f === source || f.startsWith(`${source}/`));

    // Ce que `npm run assets` sait prendre : les racines du manifeste, plus les deux scripts
    // qu'il enchaîne. La liste se lit dans package.json, elle n'est pas recopiée.
    const assets = pkg.scripts.assets as string;
    const racines = new Set(
      (JSON.parse(readFileSync(join(__dirname, "modeles-manifest.json"), "utf8")) as {
        modeles: { fichiers: { chemin: string }[] }[];
      }).modeles.map((m) => `public/${m.fichiers[0].chemin.split("/")[0]}`),
    );
    const recuperable = (source: string) =>
      racines.has(source)
      || (source === "music collection" && assets.includes("download-music-collection"))
      || (source === "bin/songsee" && assets.includes("ensure-songsee"));

    // LA SEULE EXCEPTION, NOMMÉE AVEC SA RAISON : le SoundFont n'est pas au manifeste et ne
    // voyage que dans `assets.zip`, dont le README donne la commande qui l'en tire.
    //
    // ELLE NE DIT RIEN D'UN DÉPART. Le SoundFont RESTE EMBARQUÉ, décidé par Fabien le
    // 2026-10-08 : ce n'est pas un modèle qu'on choisit de prendre, c'est ce avec quoi tout
    // instrument MIDI du catalogue sonne. Cette ligne ne tombera que le jour où `sf2.zip` sera
    // publié à part, ce qui changerait d'où on le tire et non ce qui part dans l'installeur.
    const HORS_ASSETS: Record<string, string> = {
      "public/sf2": "le SoundFont n'est pas au manifeste : il ne vient que de assets.zip, "
        + "et le README donne la commande qui l'en tire.",
    };

    const muets = (pkg.build.extraResources as { from: string }[])
      .map((r) => r.from)
      .filter((source) => !dansGit(source) && !recuperable(source) && !HORS_ASSETS[source]);
    expect(muets, "embarqué, absent de git, et rien ne sait le récupérer").toEqual([]);
  });

  it("et chaque exception désigne une ressource qui existe encore", () => {
    // Une exception périmée ferait croire à une dette là où il n'y en a plus.
    const sources = (pkg.build.extraResources as { from: string }[]).map((r) => r.from);
    expect(sources).toContain("public/sf2");
  });

  it("le manifeste de la collection est bien formé", () => {
    const m = lireManifeste();
    const noms = m.fichiers.map((f: { nom: string }) => f.nom);
    expect(new Set(noms).size).toBe(noms.length);
    for (const f of m.fichiers) {
      expect(f.octets).toBeGreaterThan(0);
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("modèle Audiobox Aesthetics", () => {
  const { SHA256, OCTETS, NOM } = require("./download-audiobox-aesthetics.cjs");
  const local = join(__dirname, "..", "public", "oonx", NOM);

  // Ignoré sans le modèle (CI avant téléchargement). En local, il garantit que l'empreinte
  // attendue par le script est celle du modèle avec lequel les nœuds ont été vérifiés.
  it.skipIf(!existsSync(local))("l'empreinte attendue par le script est celle du modèle local", () => {
    const octets = readFileSync(local);
    expect(octets.length).toBe(OCTETS);
    expect(sha(octets)).toBe(SHA256);
  });
});

describe("collection musicale et manifeste", () => {
  const A = Buffer.from("piste A"), B = Buffer.from("piste B");
  const manifeste = { fichiers: [{ nom: "a.mp3", octets: A.length, sha256: sha(A) }, { nom: "b.mp3", octets: B.length, sha256: sha(B) }] };

  it("distingue manquants, différents et fichiers hors manifeste", () => {
    const d = dossierTemp();
    writeFileSync(join(d, "a.mp3"), "autre contenu");
    writeFileSync(join(d, "perso.wav"), "x");
    expect(comparerAuManifeste(d, manifeste)).toEqual({ manquants: ["b.mp3"], differents: ["a.mp3"], enTrop: ["perso.wav"] });
  });

  it("n'écrit un fichier de l'archive que s'il correspond au manifeste", () => {
    const d = dossierTemp();
    const zip = new AdmZip();
    zip.addFile("a.mp3", A);
    zip.addFile("b.mp3", Buffer.from("piste B périmée"));
    expect(() => extraireManquants(zip.toBuffer(), d, manifeste, ["a.mp3", "b.mp3"])).toThrow(/b\.mp3.*ne correspond pas/);
    expect(readFileSync(join(d, "a.mp3"))).toEqual(A);
    expect(existsSync(join(d, "b.mp3"))).toBe(false);
  });

  it("refuse une archive à laquelle il manque un fichier du manifeste", () => {
    const d = dossierTemp();
    const zip = new AdmZip();
    zip.addFile("a.mp3", A);
    expect(() => extraireManquants(zip.toBuffer(), d, manifeste, ["b.mp3"])).toThrow(/ne contient pas « b\.mp3 »/);
  });
});
