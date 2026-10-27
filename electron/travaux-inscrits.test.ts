// electron/travaux-inscrits.test.ts — Aucun processus enfant n'échappe au registre.
//
// ═══ POURQUOI CE GARDE EXISTE ═══
//
// Le 2026-10-26, une revue a relevé que les travaux du processus principal ne s'arrêtaient pas :
// douze canaux de progression, un seul canal d'annulation, aucun `.kill(` dans `electron/`. La
// réparation a posé un registre — `travaux.cjs` — et inscrit les quatre sites d'engendrement.
//
// MAIS UN SITE AJOUTÉ DEMAIN NE S'INSCRIRAIT PAS TOUT SEUL, et c'est exactement la faute qui
// vient de coûter un chantier : un travail non inscrit est un travail qu'« Arrêter » ne peut pas
// tuer, et rien ne le dirait — le nœud s'arrête, le binaire continue, la carte graphique reste
// occupée, et l'ordonnanceur attend une fin que personne n'a demandée. Aucun run ne révèle ça.
//
// ═══ LE GARDE CHERCHE UNE FORME, ET IL FORCE UNE DÉCISION ═══
//
// Chaque appel qui engendre un enfant doit être dans l'un des trois cas :
//
//   1. il est DANS `travaux.cjs`, qui est le registre lui-même ;
//   2. il est SUIVI de `inscrireTravail`, qui l'y met ;
//   3. il porte la marque `TRAVAIL NON INSCRIT`, suivie de la raison.
//
// UN SITE NEUF N'A DONC PAS DE QUATRIÈME CHOIX : il s'inscrit, ou il écrit pourquoi il ne le fait
// pas. La marque n'est pas une échappatoire — c'est une phrase à défendre en revue, là où un
// oubli n'en est pas une.
//
// ET LES FORMES SYNCHRONES SONT HORS SUJET, non par indulgence : `execSync` et ses pareils
// bloquent le fil qui les appelle, de sorte qu'il n'y a personne pour les tuer pendant qu'ils
// tournent. Ce sont les trois sondes de version, bornées à trois secondes.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";

const dossier = new URL(".", import.meta.url);

/** Les sources du processus principal, préchargement exclu : il n'engendre rien. */
const sources = readdirSync(dossier)
  .filter((f) => f.endsWith(".cjs") && f !== "preload.cjs")
  .map((f) => ({ fichier: f, texte: readFileSync(new URL(f, dossier), "utf8") }));

/**
 * Les appels qui engendrent un enfant qu'on peut tuer.
 *
 * `exec(` N'Y EST PAS PAR UNE DÉCISION, ET NON PAR OUBLI : le dépôt n'emploie que `.exec(` de
 * `RegExp`, cinq fois, et chercher `exec(` les dénoncerait toutes. C'est la faute du garde qui
 * cherche un nom plutôt qu'une forme, que ce dépôt a déjà payée. Le jour où `child_process.exec`
 * entrerait, il entrerait par un `require` que le cas du bas surveille.
 */
const ENGENDRE = /\b(spawn|execFile|fork)\(/g;

/** Les lignes d'un fichier, numérotées à partir de 1. */
const lignesDe = (t: string) => t.split(/\r?\n/);

interface Site { fichier: string; ligne: number; appel: string; texte: string }

/** Tous les sites d'engendrement du dossier, avec de quoi juger leur voisinage. */
function sitesDEngendrement(): Site[] {
  const trouves: Site[] = [];
  for (const { fichier, texte } of sources) {
    const lignes = lignesDe(texte);
    lignes.forEach((l, i) => {
      // Une ligne de commentaire ne lance rien : la citer ne doit pas compter pour un site.
      if (/^\s*(\/\/|\*)/.test(l)) return;
      for (const m of l.matchAll(ENGENDRE)) {
        trouves.push({ fichier, ligne: i + 1, appel: m[1], texte: lignes.slice(Math.max(0, i - 6), i + 25).join("\n") });
      }
    });
  }
  return trouves;
}

describe("les travaux du processus principal", () => {
  const sites = sitesDEngendrement();

  it("ENGENDRENT QUELQUE PART, sinon ce garde ne garde rien", () => {
    // UN GARDE QUI NE TROUVE RIEN EST VERT POUR RIEN, et c'est le faux vert le plus courant de ce
    // dépôt : le motif cesse de correspondre, la boucle ne tourne jamais, et le cas passe.
    expect(sites.length).toBeGreaterThanOrEqual(4);
  });

  it("N'ENGENDRENT PAR `spawn` QUE DANS `travaux.cjs`, qui est le registre", () => {
    const ailleurs = sites.filter((s) => s.appel === "spawn" && s.fichier !== "travaux.cjs");
    expect(ailleurs.map((s) => `${s.fichier}:${s.ligne}`)).toEqual([]);
  });

  it("SONT TOUS INSCRITS, OU DISENT POURQUOI ILS NE LE SONT PAS", () => {
    const orphelins = sites
      .filter((s) => s.fichier !== "travaux.cjs")
      .filter((s) => !/inscrireTravail/.test(s.texte))
      .filter((s) => !/TRAVAIL NON INSCRIT/.test(s.texte));
    expect(
      orphelins.map((s) => `${s.fichier}:${s.ligne} (${s.appel})`),
      "un travail non inscrit est un travail qu'« Arrêter » ne peut pas tuer",
    ).toEqual([]);
  });

  it("ET LE REGISTRE EST LE SEUL À PRENDRE `child_process`, hors les sondes synchrones", () => {
    // UN `require` EST PLUS DUR À CONTOURNER QU'UN NOM D'APPEL : un module qui renomme `spawn` en
    // `lancerVite` passerait le cas du dessus, pas celui-ci. Les deux fichiers nommés prennent
    // `execFile` ou `execSync`, et leurs sites sont jugés par le cas précédent.
    const preneurs = sources
      .filter(({ texte }) => /require\(["']child_process["']\)/.test(texte))
      .map(({ fichier }) => fichier)
      .sort();
    expect(preneurs).toEqual(["main.cjs", "songsee.cjs", "travaux.cjs"]);
  });

  it("ET `travaux.cjs` EXPOSE DE QUOI TOUT ARRÊTER", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const registre = require("./travaux.cjs");
    for (const nom of ["lancerTravail", "inscrireTravail", "annulerLesTravaux", "travauxEnCours"]) {
      expect(typeof registre[nom], nom).toBe("function");
    }
  });

  it("ET LE CANAL D'ANNULATION EST BRANCHÉ DES DEUX CÔTÉS", () => {
    // `pont-canaux.test.ts` apparie déjà tous les canaux ; ce cas-ci nomme celui-là, parce qu'un
    // canal d'annulation absent est une panne silencieuse — le bouton répond, et rien ne meurt.
    const main = sources.map(({ texte }) => texte).join("\n");
    const preload = readFileSync(new URL("preload.cjs", dossier), "utf8");
    expect(main, "le principal n'écoute pas `travail:annuler`").toMatch(/ipcMain\.handle\("travail:annuler"/);
    expect(preload, "le préchargement ne l'invoque pas").toMatch(/invoke\("travail:annuler"\)/);
    // AU NOM DE LA FENÊTRE QUI LE DEMANDE, et jamais nu : un appel sans propriétaire tue ce qui
    // tourne dans TOUTES les fenêtres, qui partagent ce processus. Relevé par une revue le
    // 2026-10-27 ; ce cas exigeait auparavant l'appel nu.
    expect(main, "le canal n'appelle pas le registre au nom de sa fenêtre")
      .toMatch(/annulerLesTravaux\(fenetre\)/);
    expect(main, "un appel nu à `annulerLesTravaux()` tuerait les travaux des autres fenêtres")
      .not.toMatch(/annulerLesTravaux\(\)/);
    expect(main, "la fenêtre ne vient pas de l'appelant").toMatch(/const fenetre = event\.sender\.id/);
  });

  it("ET CHAQUE GESTIONNAIRE S'EXÉCUTE AU NOM DE SA FENÊTRE", () => {
    // Sans cet emballage, aucun enfant n'aurait de propriétaire, et l'annulation par fenêtre ne
    // tuerait plus rien : le bouton répondrait, et rien ne mourrait.
    const main = readFileSync(new URL("main.cjs", dossier), "utf8");
    const emballage = main.indexOf("avecProprietaire(event?.sender?.id");
    const premier = main.indexOf("ipcMain.handle(\"");
    expect(emballage, "`ipcMain.handle` n'est plus emballé par `avecProprietaire`").toBeGreaterThan(-1);
    expect(emballage, "l'emballage vient après un gestionnaire, qui lui échappe").toBeLessThan(premier);
  });
});
