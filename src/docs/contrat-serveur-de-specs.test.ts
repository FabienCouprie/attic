// src/docs/contrat-serveur-de-specs.test.ts — Un spec allume son serveur par l'aide, sur un port à lui.
//
// POURQUOI CE TEST, ET CE QUE SON ABSENCE A COÛTÉ.
//
// Trente-trois specs recopiaient le même amorçage d'une trentaine de lignes, en SEPT FORMES. Rien ne
// tenait la règle, et le copier-coller a produit exactement ce qu'on attend de lui : une correction
// restée dans un seul fichier — `detacher-fichier.spec.ts` posait le délai du crochet pendant que
// les trente-deux autres gardaient le défaut — et DIX-NEUF SPECS QUI DEMANDAIENT 5175, le port du
// serveur de Fabien. Son serveur y répondant, le spec le trouvait « prêt » et mesurait sur le sien,
// en laissant un vite de plus derrière lui.
//
// CE QUE CE TEST TIENT, et chacune des trois règles répond à une faute mesurée :
//
// 1. AUCUN SPEC N'AMORCE VITE LUI-MÊME. L'aide est le seul endroit où le serveur se lance, donc le
//    seul endroit où `--strictPort`, le délai du crochet et l'extinction se corrigent.
// 2. DEUX SPECS NE PARTAGENT PAS UN PORT. Un orphelin ne peut alors heurter que son propre spec, et
//    l'échec le nomme.
// 3. AUCUN SPEC NE PREND UN PORT RÉSERVÉ — ni 5175, ni 5191.
//
// ET L'AIDE ELLE-MÊME PORTE `--strictPort`, parce que c'est le drapeau dont l'absence a fait dériver
// vite en silence. Un garde qui tiendrait les ports sans tenir le drapeau laisserait revenir la
// faute par où elle est venue.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = resolve(__dirname, "../..");
const DOSSIER = resolve(RACINE, "tests-e2e");
const AIDE = resolve(DOSSIER, "serveur-de-developpement.ts");

/** Les ports qu'aucun spec ne prend : celui de Fabien, et celui du serveur de vérification. */
const RESERVES = [5175, 5191];

const specs = readdirSync(DOSSIER).filter((f) => f.endsWith(".spec.ts")).sort();

/** Le port que chaque spec demande à l'aide, quand il en demande un. */
function portsDemandes(): Map<string, number> {
  const ports = new Map<string, number>();
  for (const nom of specs) {
    const source = readFileSync(resolve(DOSSIER, nom), "utf8");
    const m = /serveurDeVerification\((\d+)\)/.exec(source);
    if (m) ports.set(nom, Number(m[1]));
  }
  return ports;
}

describe("le serveur des specs de bout en bout", () => {
  it("AUCUN SPEC N'AMORCE VITE LUI-MÊME : l'aide est le seul endroit où le serveur se lance", () => {
    const coupables = specs.filter((nom) => {
      const source = readFileSync(resolve(DOSSIER, nom), "utf8");
      return /spawn\s*\(/.test(source) || /npm["']?\s*,\s*["']run/.test(source);
    });
    expect(coupables, [
      "Ces specs lancent un serveur eux-mêmes au lieu de passer par `serveurDeVerification`.",
      "C'est le copier-coller qui a produit sept formes divergentes, dix-neuf specs sur le port de",
      "Fabien et un vite orphelin par passe. L'aide est `tests-e2e/serveur-de-developpement.ts`.",
    ].join("\n")).toEqual([]);
  });

  // ET AUCUN SPEC NE NOMME SON SERVEUR, ce qui est le second tour de cette règle.
  //
  // Quatre specs n'amorçaient rien du tout : `barre-stable`, `depot-palette`, `kokoro-provenance` et
  // `mesure-hors-fil` lisaient `process.env.DEV_URL || "http://localhost:5175"` et attendaient qu'un
  // serveur tourne déjà — celui de Fabien. Ils ne pouvaient donc pas entrer en intégration continue,
  // et sur son poste ils mesuraient sur SON serveur. La règle du dessus ne les voyait pas : ils
  // n'amorçaient pas vite, ils ne faisaient rien.
  //
  // MESURÉ AVANT DE LES TOUCHER, puis après : dix cas verts sur un serveur partagé, dix cas verts
  // chacun sur le sien, pour dix secondes de plus — le prix de quatre allumages à froid. Les
  // quarante-trois specs du dossier se répartissent maintenant en trente-sept qui passent par l'aide
  // et six qui lancent Electron, et aucun ne nomme une adresse.
  it("AUCUN SPEC NE NOMME SON SERVEUR : ni `DEV_URL`, ni une adresse en dur", () => {
    const coupables = specs.filter((nom) => {
      const source = readFileSync(resolve(DOSSIER, nom), "utf8");
      return /DEV_URL/.test(source) || /localhost:\d/.test(source);
    });
    expect(coupables, [
      "Ces specs nomment eux-mêmes leur serveur au lieu de le demander à l'aide.",
      "Un spec qui attend qu'un serveur tourne déjà ne peut pas entrer en intégration continue, et",
      "sur un poste de développement il mesure sur le serveur de quelqu'un d'autre.",
      "`serveurDeVerification` est le seul endroit où `DEV_URL` se lit.",
    ].join("\n")).toEqual([]);
  });

  it("DEUX SPECS NE PARTAGENT PAS UN PORT", () => {
    const ports = portsDemandes();
    const parPort = new Map<number, string[]>();
    for (const [nom, port] of ports) parPort.set(port, [...(parPort.get(port) ?? []), nom]);
    const partages = [...parPort.entries()]
      .filter(([, noms]) => noms.length > 1)
      .map(([port, noms]) => `${port} : ${noms.join(", ")}`);
    expect(partages, [
      "Ces specs demandent le même port. Un serveur orphelin laissé par l'un ferait alors échouer",
      "l'autre, et l'échec n'en nommerait pas la cause.",
    ].join("\n")).toEqual([]);
  });

  it("AUCUN SPEC NE PREND UN PORT RÉSERVÉ", () => {
    const fautifs = [...portsDemandes().entries()]
      .filter(([, port]) => RESERVES.includes(port))
      .map(([nom, port]) => `${nom} : ${port}`);
    expect(fautifs, [
      `Les ports ${RESERVES.join(" et ")} sont réservés : le serveur de Fabien et celui de vérification.`,
      "Un spec qui en demande un se mesure sur un serveur qui n'est pas le sien.",
    ].join("\n")).toEqual([]);
  });

  // ET CE CAS-CI A ÉTÉ ÉCRIT DEUX FOIS. La première version cherchait `--strictPort` dans le TEXTE
  // du fichier : les commentaires d'en-tête le contenaient, de sorte qu'elle restait verte après
  // qu'on eut retiré le drapeau de l'appel. Elle porte maintenant sur la LIGNE QUI PASSE LE PORT,
  // les deux arguments devant voyager ensemble. C'est un vert qui ne prouvait rien, trouvé en
  // plantant le défaut.
  it("ET L'AIDE PASSE `--strictPort` DANS LE MÊME APPEL QUE `--port`", () => {
    const source = readFileSync(AIDE, "utf8");
    const passentLePort = source.split("\n").filter((l) => l.includes('"--port"'));
    expect(passentLePort, "l'aide doit passer le port à vite en un seul endroit").toHaveLength(1);
    expect(passentLePort[0], [
      "Sans `--strictPort`, vite passe au port suivant quand le sien est pris, SANS RIEN DIRE.",
      "C'est la faute d'origine : quatre-vingts secondes d'attente, puis un échec muet, ou pire,",
      "une mesure faite sur le serveur de quelqu'un d'autre.",
    ].join("\n")).toContain('"--strictPort"');
  });
});
