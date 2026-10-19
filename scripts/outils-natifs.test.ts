// scripts/outils-natifs.test.ts — Garde-fous des exécutables tiers embarqués.
//
// CE QUE CES CAS TIENNENT, et pourquoi ils cherchent une FORME et jamais un nom : la release
// clonait un dépôt amont sans étiquette et compilait ce qu'elle y trouvait. Rien ne disait quelle
// version partait dans l'installeur. Un garde qui chercherait « songsee » ne verrait pas le
// deuxième outil ; celui-ci regarde ce que `extraResources` embarque et exige qu'il soit épinglé.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RACINE = join(import.meta.dirname, "..");
const manifeste = JSON.parse(readFileSync(join(RACINE, "scripts/outils-manifest.json"), "utf8")) as {
  outils: {
    id: string;
    amont: { depot: string; version: string };
    licence: { nom: string; credit: string };
    destination: string;
    plateformes: Record<string, {
      asset: string; fichiers: string[]; url: string | null; sha256: string | null; octets: number | null;
    }>;
  }[];
};
const paquet = JSON.parse(readFileSync(join(RACINE, "package.json"), "utf8")) as {
  build: { extraResources: { from: string; to: string }[] };
};

/** Une branche n'est pas une version : elle bouge sous les pieds de celui qui la cite. */
const BRANCHES = ["main", "master", "dev", "develop", "HEAD", "latest"];

describe("les exécutables tiers sont épinglés", () => {
  it("en trouve assez pour que le contrôle ait un sens", () => {
    expect(manifeste.outils.length).toBeGreaterThanOrEqual(2);
  });

  it("chaque outil cite un dépôt et une version qui ne bouge pas", () => {
    for (const o of manifeste.outils) {
      expect(o.amont.depot, o.id).toMatch(/^https:\/\/\S+\.git$/);
      expect(o.amont.version, o.id).toBeTruthy();
      expect(BRANCHES, `${o.id} épingle une branche`).not.toContain(o.amont.version);
      // Une étiquette ou un commit : les deux se reconnaissent à leur forme.
      expect(o.amont.version, o.id).toMatch(/^(v?\d+[\w.+-]*|[0-9a-f]{7,40})$/i);
    }
  });

  // LA RÈGLE QUI VIENT DE `gh release upload` SANS `--clobber` : un contenu qui change doit
  // changer de nom, sans quoi une installation déjà faite vérifie une empreinte caduque.
  it("chaque asset porte la version et la plateforme dans son nom", () => {
    for (const o of manifeste.outils) {
      for (const [plateforme, p] of Object.entries(o.plateformes)) {
        const court = o.amont.version.replace(/^v/, "").slice(0, 8);
        expect(p.asset, `${o.id}/${plateforme}`).toContain(court);
        expect(p.asset, `${o.id}/${plateforme}`).toContain(plateforme);
      }
    }
  });

  it("une adresse va toujours avec une empreinte et une taille", () => {
    for (const o of manifeste.outils) {
      for (const [plateforme, p] of Object.entries(o.plateformes)) {
        if (!p.url) continue;
        expect(p.sha256, `${o.id}/${plateforme}`).toMatch(/^[0-9a-f]{64}$/);
        expect(p.octets, `${o.id}/${plateforme}`).toBeGreaterThan(0);
      }
    }
  });

  it("chaque outil déclare au moins un fichier à poser, et sa licence", () => {
    for (const o of manifeste.outils) {
      expect(o.licence.nom, o.id).toBeTruthy();
      expect(o.licence.credit, o.id).toBeTruthy();
      for (const [plateforme, p] of Object.entries(o.plateformes)) {
        expect(p.fichiers.length, `${o.id}/${plateforme}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("ce que l'installeur embarque est épinglé", () => {
  // LE CAS QUI TIENT TOUT LE RESTE. Un binaire ajouté aux ressources sans entrée au manifeste
  // repartirait dans le défaut d'avant : embarqué sans qu'on sache d'où il vient.
  it("tout dossier d'exécutables embarqué a son entrée au manifeste", () => {
    const destinations = new Set(manifeste.outils.map((o) => o.destination.replace(/\\/g, "/")));
    const embarques = paquet.build.extraResources
      .map((r) => r.from.replace(/\\/g, "/"))
      .filter((f) => f.startsWith("bin/"));
    expect(embarques.length).toBeGreaterThan(0);
    for (const e of embarques) {
      expect(destinations, `${e} est embarqué sans être épinglé`).toContain(e);
    }
  });
});
