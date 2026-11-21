// src/docs/frontiere-identifiants.test.ts — Le cœur ne nomme aucun composant du domaine.
//
// POURQUOI CE GARDE, ET C'EST LA DEUXIÈME FOIS QUE LE CONTRAT DE DÉPART TOMBE SANS QU'UN GARDE LE DISE.
// La table `ALIAS` a vécu dans `core/registre.ts` : quatorze anciens identifiants audio et leurs
// quatorze cibles, en chaînes, au cœur du cœur. `frontiere-domaine.test.ts` ne la voyait pas, et ne
// pouvait pas la voir : il cherche des IMPORTS du domaine, puis des MOTS du domaine (`AudioBuffer`,
// `"stereo"`), et une table de chaînes n'importe rien et ne contient aucun de ces mots. La table a
// été remise au domaine le 2026-11-20 (`audio/alias.ts`) ; ce garde est né le même jour, à la demande
// de Fabien, pour que la prochaine ne passe pas.
//
// LA RÈGLE SE LIT SUR UNE FORME : une chaîne du code de `src/core/` qui vaut l'identifiant d'une
// fiche du domaine, ou un de ses anciens identifiants. Une liste de mots à surveiller vieillirait à
// mesure que le catalogue grandit ; l'ensemble des identifiants se relit, lui, du catalogue même.
//
// LES CHAÎNES SE LISENT PAR L'ARBRE SYNTAXIQUE DE TYPESCRIPT, et non par une expression régulière.
// Un commentaire écarté par motif tronque la ligne à la première `//`, celle d'une adresse
// `https://` comprise, et ce qui suit disparaît sans bruit. L'arbre sait ce qui est une chaîne, un
// commentaire ou un chemin d'import : le cas de calibrage ci-dessous le tient.
//
// CE QU'IL NE VOIT PAS, et il vaut mieux le savoir : un identifiant fabriqué par morceaux
// (`"reponse-" + "filtre"`, ou un gabarit à trous), et les méta-composants embarqués, qui ne sont
// pas des fiches du catalogue mais des graphes que `plugins/meta-exemples.ts` installe au démarrage.
//
// LES FICHES QUE LE CŒUR DÉCLARE LUI-MÊME NE SONT PAS DES IDENTIFIANTS DU DOMAINE, depuis la pièce P1
// du 2026-11-21 : les deux nœuds-frontière d'un méta, que `core/fiches-du-coeur.ts` fournit et que
// le catalogue audio inclut. Leur identifiant est au cœur, avec sa fiche. Pour qu'une fiche du
// domaine ne s'y cache pas afin d'échapper à ce garde, un cas tient la forme de ce qu'il accepte : une
// fiche du cœur ne porte que des ports de types que le cœur déclare, et aucune fiche audio n'est faite
// ainsi.
import "node-web-audio-api/polyfill.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { ALIAS } from "../audio/alias";
import { fichesDuCoeur, typesFluxDuCoeur } from "../core/fiches-du-coeur";
import { toutesLesFiches } from "../plugins";

const RACINE = resolve(__dirname, "..");
const COEUR = join(RACINE, "core");

/** Tous les fichiers de source du cœur, tests exclus : trois d'entre eux lisent le domaine pour l'éprouver. */
function sourcesDuCoeur(): string[] {
  const out: string[] = [];
  const parcourir = (d: string) => {
    for (const nom of readdirSync(d)) {
      const chemin = join(d, nom);
      if (statSync(chemin).isDirectory()) { parcourir(chemin); continue; }
      if (!/\.tsx?$/.test(nom) || /\.test\.tsx?$/.test(nom)) continue;
      out.push(chemin);
    }
  };
  parcourir(COEUR);
  return out.sort();
}

/**
 * Les chaînes écrites dans un source : littéraux entre guillemets, et gabarits sans trou.
 *
 * LES CHEMINS D'IMPORT N'EN SONT PAS. `from "./boucle-graphe"` désigne un module, et non un composant ;
 * le compter ferait crier le garde sur chaque fichier du cœur qui en importe un autre.
 */
function chainesDuCode(nom: string, source: string): string[] {
  const fichier = ts.createSourceFile(nom, source, ts.ScriptTarget.Latest, true,
    nom.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const visite = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) return;
    if (ts.isImportTypeNode(n)) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text);
    ts.forEachChild(n, visite);
  };
  visite(fichier);
  return out;
}

/** Les fiches que le cœur déclare lui-même : leur identifiant est au cœur, avec elles. */
const DU_COEUR = new Set(fichesDuCoeur().map((f) => f.id));

/** Les identifiants du domaine : chaque fiche du catalogue que le cœur ne déclare pas, et chaque ancien identifiant. */
const IDENTIFIANTS = new Set<string>([
  ...toutesLesFiches.map((f) => f.id).filter((id) => !DU_COEUR.has(id)), ...Object.keys(ALIAS),
]);

/**
 * LES DETTES DU JOUR, RELEVÉES PAR CE GARDE À SA NAISSANCE, LE 2026-11-20 : seize chaînes, quatre
 * fichiers. Il ne les arbitre pas, il les COMPTE : la liste refuse de grandir, et une dette payée
 * doit en sortir. Chacune porte sa raison, et la sortie est la même pour toutes : la fiche dit son
 * rôle et le cœur le lit, ou le domaine remet la liste au cœur, comme `audio/alias.ts` au registre.
 *
 * TROIS CHAÎNES ET DEUX FICHIERS DEPUIS LE 2026-11-21. Les deux de `core/meta.ts` sont sorties par
 * l'autre porte : les fiches-frontière sont entrées dans le cœur (`core/fiches-du-coeur.ts`). Les
 * onze de `core/boucle-graphe.ts` par la première : la fiche déclare `debutDeBoucle`, `finDeBoucle`
 * ou `boucleParPasses`, et le dépliage le lit par `trouverDef`.
 */
const DETTES: Readonly<Record<string, { chaines: readonly string[]; raison: string }>> = {
  "core/instrument-graphe.ts": {
    chaines: ["frontiere-note", "instrument-fin"],
    raison: "un instrument rejoué touche par touche, de La0 à Do8, est une notion audio logée dans le cœur",
  },
  "core/reglages-lies.ts": {
    chaines: ["generateur-courbe"],
    raison: "la liaison « Forme » → « Fréquence » est la règle d'un seul composant du domaine, « Courbe »",
  },
};

/** Ce que le cœur nomme aujourd'hui, fichier par fichier : chaque chaîne qui vaut un identifiant du domaine. */
function relever(): { fichiers: number; chaines: number; nommes: Map<string, Set<string>> } {
  const fichiers = sourcesDuCoeur();
  const nommes = new Map<string, Set<string>>();
  let chaines = 0;
  for (const f of fichiers) {
    const lues = chainesDuCode(f, readFileSync(f, "utf8"));
    chaines += lues.length;
    const ici = lues.filter((c) => IDENTIFIANTS.has(c));
    if (ici.length) nommes.set(relative(RACINE, f).replace(/\\/g, "/"), new Set(ici));
  }
  return { fichiers: fichiers.length, chaines, nommes };
}

describe("le cœur ne nomme aucun composant du domaine", () => {
  it("L'INSTRUMENT DISTINGUE UNE CHAÎNE D'UN COMMENTAIRE ET D'UN CHEMIN D'IMPORT", () => {
    const source = [
      'import { x } from "./reponse-filtre";',
      'import type { Y } from "./filtre";',
      "// la table nommait \"reponse-filtre\" ici",
      "/* et \"simple-boucle\" là */",
      'const adresse = "https://exemple.org/"; const cible = "reponse-filtre";',
      "const gabarit = `simple-boucle`;",
      "const trou = `meta-${adresse}`;",
      "type T = import(\"./melangeur\").Z;",
      "const charge = import(\"./melangeur\");",
    ].join("\n");
    // L'adresse ne tronque pas la ligne, le gabarit sans trou compte, ni les commentaires ni les
    // chemins d'import ne comptent, et un gabarit à trous n'est pas une chaîne entière.
    expect(chainesDuCode("essai.ts", source)).toEqual(["https://exemple.org/", "reponse-filtre", "simple-boucle"]);
  });

  it("AUCUNE CHAÎNE NEUVE DU CŒUR NE VAUT UN IDENTIFIANT DE FICHE DU DOMAINE, ni un de ses anciens identifiants", () => {
    // L'INSTRUMENT DIT CE QU'IL A LU. Un catalogue chargé à vide, ou un lecteur qui ne trouverait
    // plus de chaîne, rendrait ce cas vert sur un cœur qui porterait le catalogue entier.
    expect(IDENTIFIANTS.size, "le catalogue doit être chargé").toBeGreaterThan(400);
    const { fichiers, chaines, nommes } = relever();
    expect(fichiers, "le cœur doit être lu : 45 fichiers de source le 2026-11-20").toBeGreaterThanOrEqual(40);
    expect(chaines, "le lecteur doit trouver les chaînes du cœur : 613 le 2026-11-20").toBeGreaterThanOrEqual(500);

    const fautes = [...nommes].flatMap(([f, ici]) => [...ici]
      .filter((c) => !DETTES[f]?.chaines.includes(c))
      .map((c) => `  ${f} · "${c}"`));
    expect(fautes, [
      "",
      "LE CŒUR NOMME DES COMPOSANTS DU DOMAINE :",
      ...fautes,
      "",
      "Le cœur ne connaît aucune fiche : ce qu'il doit savoir d'elles, il le lit sur la fiche ou le",
      "reçoit du domaine. Une table d'identifiants va dans le domaine et se remet au cœur, comme",
      "`audio/alias.ts` à `creerRegistre({ alias })`. Voir PORTING-A-DOMAIN.md.",
      "",
    ].join("\n")).toEqual([]);
  });

  it("UNE DETTE PAYÉE SORT DE LA LISTE, sans quoi la liste mentirait sur ce que le cœur nomme", () => {
    const { nommes } = relever();
    const payees = Object.entries(DETTES).flatMap(([f, d]) => d.chaines
      .filter((c) => !nommes.get(f)?.has(c))
      .map((c) => `  ${f} · "${c}"`));
    expect(payees, [
      "",
      "CES DETTES SONT PAYÉES : le cœur ne nomme plus ces chaînes. Retirez-les de `DETTES`.",
      ...payees,
      "",
    ].join("\n")).toEqual([]);
  });

  it("UNE FICHE DU CŒUR NE PORTE QUE DES TYPES DU CŒUR, sans quoi une fiche du domaine s'y cacherait", () => {
    // L'INSTRUMENT DIT CE QU'IL A LU : sans fiche du cœur, ce cas passerait sans rien tenir.
    const fiches = fichesDuCoeur();
    expect(fiches.length, "le cœur doit déclarer des fiches : les deux nœuds-frontière le 2026-11-21").toBeGreaterThan(0);
    const types = new Set(typesFluxDuCoeur().map((t) => t.id));
    const etrangers = fiches.flatMap((f) => [...f.entrees, ...f.sorties]
      .filter((p) => !types.has(p.type))
      .map((p) => `  ${f.id} · port « ${p.nom} » de type « ${p.type} »`));
    expect(etrangers, [
      "",
      "UNE FICHE DU CŒUR PORTE UN TYPE QUE LE CŒUR NE DÉCLARE PAS :",
      ...etrangers,
      "",
      "Le cœur ne déclare que les fiches de ses propres mécanismes. Une fiche qui porte un type du",
      "domaine appartient au domaine, et ce garde la compterait alors parmi ses identifiants.",
      "",
    ].join("\n")).toEqual([]);
  });
});
