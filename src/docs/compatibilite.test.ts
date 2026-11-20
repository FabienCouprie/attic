// src/docs/compatibilite.test.ts — Le garde des ruptures de contrat, et la régénération du manifeste.
//
// `COMPATIBILITE.json` est la mémoire du contrat de chaque composant au dernier commit : ports par
// rang, réglages par nom, valeurs de choix, migrations, alias, version. Ce garde compare le registre
// vivant à cette mémoire et range chaque écart dans l'une de deux classes :
//
//   · COMPATIBLE : un graphe enregistré s'ouvre comme avant. Il suffit de régénérer :
//
//       npm run docs:compatibilite
//
//   · RUPTURE : un graphe enregistré perd ou change quelque chose en s'ouvrant. Le garde échoue tant
//     qu'elle n'a ni sa migration dans le code ni sa déclaration dans `ruptures-declarees.json`, et
//     la régénération refuse d'écrire le manifeste par-dessus : sans ce refus, le générateur serait
//     la porte de sortie du garde qu'il nourrit.
//
// CE QUE CE GARDE NE VOIT PAS, ET IL FAUT LE SAVOIR :
//
//   · LE SON. Un réglage ajouté est compatible quand son défaut rend l'ancien son ; un manifeste ne
//     le dit pas. Les deux bases d'empreintes le mesurent.
//   · UN MANIFESTE RETOUCHÉ À LA MAIN pour suivre le registre : le fichier serait égal à ce que le
//     générateur rend, et la rupture passerait. Il se relit au diff, comme `empreintes.json`.
//   · LES MÉTA-COMPOSANTS ET LES NŒUDS INSTALLÉS, qui ne sont pas au socle : un projet porte la
//     définition de ses métas, et un nœud installé tient son contrat de son propre paquet.
import "node-web-audio-api/polyfill.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { registre } from "../audio/adaptateur";
import { ALIAS } from "../audio/alias";
import { toutesLesFiches } from "../plugins";
import {
  homonymesDuContrat, manifesteDuRegistre, manifesteEnTexte, relecteurDuRegistre,
  type FicheContrat, type Manifeste,
} from "./compatibilite";
import { comparerManifestes, type Ecart } from "./compatibilite-ecarts";
import { lireJournal, modeleDeDeclaration, verifierJournal, versionsDuJournal } from "./compatibilite-journal";

const RACINE = resolve(__dirname, "../..");
const CHEMIN = resolve(RACINE, "COMPATIBILITE.json");
const CHEMIN_JOURNAL = resolve(__dirname, "ruptures-declarees.json");
const ecrire = process.env.ECRIRE_COMPATIBILITE === "1";

const fiches = registre.tousLesInscrits() as unknown as FicheContrat[];
const trouver = (id: string) => registre.trouverDef(id) as unknown as FicheContrat | undefined;
const journal = lireJournal(readFileSync(CHEMIN_JOURNAL, "utf8"));
const courant = manifesteDuRegistre(fiches, ALIAS, versionsDuJournal(journal));
const texteCourant = manifesteEnTexte(courant);
const texteFichier = existsSync(CHEMIN) ? readFileSync(CHEMIN, "utf8").replace(/\r\n/g, "\n") : null;
const fichier = texteFichier === null ? null : (JSON.parse(texteFichier) as Manifeste);
const ecarts = fichier ? comparerManifestes(fichier, courant, relecteurDuRegistre(trouver)) : [];
const verdict = fichier
  ? verifierJournal(journal, fichier, ecarts.filter((e) => e.rupture))
  : { nonDeclarees: [], problemes: [] };

function parComposant(liste: Ecart[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const e of liste) m.set(e.composant, [...(m.get(e.composant) ?? []), e.texte]);
  return m;
}

/** Le rapport d'une rupture non déclarée : ce qu'elle casse, et les deux façons d'en sortir. */
function rapportDesRuptures(liste: Ecart[]): string {
  const groupes = parComposant(liste);
  const date = new Date().toISOString().slice(0, 10);
  const version = (id: string) => (fichier?.composants[id]?.version ?? fichier?.retires[id]?.version ?? 1) + 1;
  return [
    "",
    "DES RUPTURES DE CONTRAT NE SONT PAS DÉCLARÉES.",
    "",
    "Un graphe enregistré avant ce changement perdrait ou changerait ceci en s'ouvrant :",
    ...[...groupes].flatMap(([id, textes]) => textes.map((t) => `  ${id} · ${t}`)),
    "",
    "PREMIÈRE SORTIE, LA BONNE QUAND ELLE EXISTE : poser la migration, qui rend le changement compatible.",
    "  · un réglage renommé : l'ancien nom dans `nomsHerites` du nouveau ;",
    "  · une valeur de choix retirée : `optionsHeritees`, de l'ancienne valeur vers l'identifiant qui la remplace ;",
    "  · un réglage retiré que l'exécuteur relit encore : `anciensReglages` de la fiche ;",
    "  · un composant retiré : la table `ALIAS` de `src/audio/alias.ts`.",
    "",
    "SECONDE SORTIE : déclarer la rupture dans `src/docs/ruptures-declarees.json`, raison écrite, puis",
    "« npm run docs:compatibilite ». La version de contrat du composant monte d'un cran.",
    ...[...groupes].map(([id, textes]) => modeleDeDeclaration(id, version(id), textes, date)),
    "",
  ].join("\n");
}

const totalReglages = () => Object.values(courant.composants).reduce((n, c) => n + c.reglages.length, 0);
const totalPorts = () => Object.values(courant.composants).reduce((n, c) => n + c.entrees.length + c.sorties.length, 0);

it.skipIf(!ecrire)("écrit COMPATIBILITE.json, quand plus rien n'est à déclarer", () => {
  expect(homonymesDuContrat(fiches, ALIAS), "le contrat est ambigu : voir le cas des homonymes").toEqual([]);
  expect(verdict.nonDeclarees.map((e) => `${e.composant} · ${e.texte}`),
    `${rapportDesRuptures(verdict.nonDeclarees)}\nLE MANIFESTE N'A PAS ÉTÉ RÉÉCRIT.`).toEqual([]);
  expect(verdict.problemes, "le journal des ruptures est faux : le manifeste n'a pas été réécrit").toEqual([]);
  writeFileSync(CHEMIN, texteCourant, "utf8");
  console.log(`COMPATIBILITE.json : ${Object.keys(courant.composants).length} composants, `
    + `${totalReglages()} réglages, ${totalPorts()} ports, ${ecarts.length} écarts au précédent.`);
});

describe.skipIf(ecrire)("le manifeste de compatibilité", () => {
  it("AUCUNE RUPTURE NE PASSE SANS SA MIGRATION OU SA DÉCLARATION", () => {
    expect(fichier, "COMPATIBILITE.json est absent : lancez « npm run docs:compatibilite »").not.toBeNull();
    expect(verdict.nonDeclarees.map((e) => `${e.composant} · ${e.texte}`),
      rapportDesRuptures(verdict.nonDeclarees)).toEqual([]);
  });

  it("LE JOURNAL DES RUPTURES SE TIENT : versions qui se suivent, déclarations qui ont un objet", () => {
    expect(verdict.problemes, [
      "",
      "LE JOURNAL DES RUPTURES EST FAUX.",
      "",
      ...verdict.problemes.map((p) => `  · ${p}`),
      "",
      "Une déclaration en attente couvre exactement les ruptures que le garde trouve, ni moins ni plus ;",
      "une déclaration passée ne se retire pas, la version de contrat redescendrait.",
      "",
    ].join("\n")).toEqual([]);
  });

  it("IL EST À JOUR DU REGISTRE", () => {
    const compatibles = ecarts.filter((e) => !e.rupture);
    expect(texteFichier, [
      "",
      "COMPATIBILITE.json NE CORRESPOND PLUS AU REGISTRE.",
      "",
      compatibles.length > 0
        ? `Écarts compatibles (${compatibles.length}), qu'un graphe enregistré ne voit pas :`
        : "Aucun écart de contrat : une version a changé par le journal, ou le fichier a été retouché à la main.",
      ...compatibles.slice(0, 30).map((e) => `  ${e.composant} · ${e.texte}`),
      ...(compatibles.length > 30 ? [`  … ${compatibles.length - 30} de plus`] : []),
      "",
      "Lancez « npm run docs:compatibilite », puis relisez le diff. Ne corrigez pas le fichier à la main.",
      "",
    ].join("\n")).toBe(texteCourant);
  });

  it("RIEN N'Y EST AMBIGU : ni réglage en double, ni ancien réglage vivant, ni alias trompeur", () => {
    // LA LISTE EST DANS LE MESSAGE, et pas seulement dans le diff : un rapporteur qui ne rend que le
    // message, celui de la CI en JSON par exemple, dirait « un tableau d'un élément » et rien d'autre.
    const fautes = homonymesDuContrat(fiches, ALIAS);
    expect(fautes, ["", "LE CONTRAT EST AMBIGU :", ...fautes.map((f) => `  · ${f}`), ""].join("\n")).toEqual([]);
  });

  it("IL REGARDE TOUT LE SOCLE : chaque fiche du catalogue y est, et rien d'autre", () => {
    // L'INSTRUMENT DIT CE QU'IL BALAIE. Un registre chargé à moitié rendrait un manifeste à moitié,
    // et la comparaison annoncerait cent composants retirés ; un registre qui aurait reçu des
    // fiches dérivées les figerait dans un contrat qui n'est pas le leur.
    expect(Object.keys(courant.composants).sort()).toEqual(toutesLesFiches.map((f) => f.id).sort());
    expect(totalReglages(), "le manifeste ne voit plus les réglages").toBeGreaterThan(1500);
    expect(totalPorts(), "le manifeste ne voit plus les ports").toBeGreaterThan(1000);
  });
});
