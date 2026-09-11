// electron/sauvegarde-maj.test.ts — La sauvegarde des données utilisateur
// autour d'une mise à jour.
//
// Ce que ces tests protègent : les méta-composants, le workflow en cours et les
// nœuds installés. Du travail, pas des préférences. Et le moment où la
// sauvegarde est prise est le pire possible — juste avant qu'electron-updater
// installe et relance, donc juste avant que le process soit tué.
//
// Les deux scénarios qui comptent sont ceux où la sauvegarde sert vraiment :
// un fichier corrompu, et une écriture interrompue. Les deux étaient perdants.
//
// Aucun `fs` simulé ici : on écrit dans un dossier temporaire réel, parce que
// l'atomicité de `rename` est une propriété du système de fichiers, pas du code.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { ecrireSauvegarde, lireSauvegarde } = require_("./sauvegarde-maj.cjs");

/** Ce que l'application sauvegarde réellement (cf. BarreOutils.tsx). */
const DONNEES = {
  metas: '[{"id":"synthe-soustractif","nom":"Synthétiseur soustractif"}]',
  encours: '{"nodes":[{"id":"n1"}],"edges":[]}',
  lang: "fr",
  nodesInstalles: '["couleur-suno-ia"]',
};

let racine: string;
let chemin: string;

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), "attic-maj-"));
  chemin = join(racine, "attic-backup.json");
});
afterEach(() => rmSync(racine, { recursive: true, force: true }));

describe("aller-retour", () => {
  it("restitue exactement ce qui a été sauvegardé", () => {
    expect(ecrireSauvegarde(chemin, DONNEES)).toBe(true);
    expect(lireSauvegarde(chemin)).toEqual({ donnees: DONNEES, erreur: null });
  });

  it("consomme la sauvegarde : une seconde restauration ne rend rien", () => {
    // Comportement voulu — restaurer deux fois écraserait le travail fait
    // depuis la mise à jour.
    ecrireSauvegarde(chemin, DONNEES);
    lireSauvegarde(chemin);
    expect(existsSync(chemin)).toBe(false);
    expect(lireSauvegarde(chemin)).toEqual({ donnees: null, erreur: null });
  });

  it("l'absence de sauvegarde n'est pas une erreur", () => {
    // Le cas normal : premier lancement, ou lancement sans mise à jour.
    expect(lireSauvegarde(chemin)).toEqual({ donnees: null, erreur: null });
  });

  it("ne laisse aucun fichier temporaire derrière elle", () => {
    ecrireSauvegarde(chemin, DONNEES);
    expect(existsSync(`${chemin}.tmp`)).toBe(false);
  });
});

describe("sauvegarde corrompue", () => {
  it("CONSERVE le fichier quand le contenu est illisible", () => {
    // LE défaut corrigé. L'ancienne version supprimait avant d'analyser : sur
    // un JSON tronqué, `JSON.parse` levait, le catch rendait null, et la
    // sauvegarde n'existait plus. L'échec de la restauration détruisait ce
    // qu'elle protégeait, précisément quand elle aurait servi.
    writeFileSync(chemin, '{"metas":"[{\\"id\\":\\"synthe', "utf-8");

    const r = lireSauvegarde(chemin);
    expect(r.donnees).toBeNull();
    expect(r.erreur).toMatch(/conservée/i);
    expect(existsSync(chemin), "la sauvegarde doit survivre à l'échec").toBe(true);
  });

  it("le contenu conservé est intact, récupérable à la main", () => {
    const tronque = '{"metas":"[{\\"id\\":\\"synthe';
    writeFileSync(chemin, tronque, "utf-8");
    lireSauvegarde(chemin);
    expect(readFileSync(chemin, "utf-8")).toBe(tronque);
  });

  it("un fichier vide est traité comme corrompu, pas comme absent", () => {
    // Un fichier de zéro octet est la trace typique d'une écriture interrompue :
    // le distinguer de « pas de sauvegarde » évite de le balayer en silence.
    writeFileSync(chemin, "", "utf-8");
    const r = lireSauvegarde(chemin);
    expect(r.donnees).toBeNull();
    expect(r.erreur).toBeTruthy();
    expect(existsSync(chemin)).toBe(true);
  });
});

describe("écriture — ce qui est vérifiable, et ce qui ne l'est pas", () => {
  // CE QUI N'EST PAS VÉRIFIÉ ICI, et qu'il serait malhonnête de laisser croire :
  // l'atomicité elle-même. Elle repose sur `rename`, garanti atomique par le
  // système de fichiers sur un même volume, et le scénario qu'elle couvre — le
  // process tué en pleine écriture — ne se reproduit pas dans un test unitaire.
  //
  // Une première version de ce bloc s'intitulait « écriture atomique » et
  // prétendait la démontrer en passant une donnée que `JSON.stringify` refuse.
  // Le test passait avec l'ANCIEN code comme avec le nouveau : `stringify` lève
  // avant toute écriture, donc le fichier n'est touché dans aucun des deux cas.
  // Il ne distinguait rien.
  //
  // Restent trois propriétés réellement observables, et qui ont leur valeur :
  // l'échec ne détruit pas la sauvegarde précédente, il ne laisse pas de résidu,
  // et il rend un booléen plutôt qu'une exception.
  it("un échec d'écriture laisse la sauvegarde précédente intacte et lisible", () => {
    ecrireSauvegarde(chemin, DONNEES);

    const cyclique: any = { a: 1 };
    cyclique.soi = cyclique;
    expect(ecrireSauvegarde(chemin, cyclique)).toBe(false);

    expect(lireSauvegarde(chemin)).toEqual({ donnees: DONNEES, erreur: null });
  });

  it("ne laisse pas de fichier temporaire après un échec", () => {
    // Un .tmp partiel abandonné pourrait être pris pour une sauvegarde par une
    // reprise ultérieure.
    const cyclique: any = {};
    cyclique.soi = cyclique;
    ecrireSauvegarde(chemin, cyclique);
    expect(existsSync(`${chemin}.tmp`)).toBe(false);
  });

  it("écrase une sauvegarde précédente sans étape intermédiaire vide", () => {
    ecrireSauvegarde(chemin, { lang: "fr" });
    ecrireSauvegarde(chemin, DONNEES);
    expect(lireSauvegarde(chemin).donnees).toEqual(DONNEES);
  });

  it("rend false plutôt que de lever quand le dossier n'existe pas", () => {
    // L'appelant est un gestionnaire IPC : il doit recevoir un booléen, pas une
    // exception à propager au renderer.
    expect(ecrireSauvegarde(join(racine, "absent", "b.json"), DONNEES)).toBe(false);
  });
});
