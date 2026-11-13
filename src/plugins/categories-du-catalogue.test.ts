// src/plugins/categories-du-catalogue.test.ts — Aucun fichier de fiches n'est oublié, aucun n'est compté deux fois.
//
// ÉCRIT QUAND `plugins/index.ts` A ÉTÉ COUPÉ EN CATÉGORIES, le 2026-11-13. Le catalogue se recoud
// désormais en deux étages : un fichier de plugins porte ses fiches, une catégorie de `categories/`
// en reprend une tranche, et `index.ts` reprend les catégories. Un fichier qu'aucune catégorie ne
// reprend ne casse rien : ses composants manquent à la palette, et c'est tout. Un fichier repris
// deux fois en donne deux exemplaires, que seul le garde des identifiants verrait, et sous un autre
// nom que la cause.
//
// LA REPRISE SE LIT PAR L'ANALYSEUR DE TYPESCRIPT : un module reprend les fiches d'un autre quand il
// importe sa liaison `fiches`, sous quelque nom que ce soit, ET la verse dans une liste. Dix-sept
// fichiers sont repris par un autre fichier de plugins et non par une catégorie
// (`restaurer-compresse` par `debruitage-ia`, `boucle-plan` par `montage`…) : la règle les couvre,
// puisque la chaîne des reprises doit aboutir à une catégorie.
//
// CE QU'IL NE VOIT PAS : des fiches versées sous une autre forme que les trois du dépôt (une
// boucle, un `push`) ne compteraient pas, et le cas tomberait en les disant oubliées ; c'est un
// faux rouge qui se lit. Un module qui verserait des fiches dans une liste qui n'est pas la sienne
// passerait pour une reprise : le cas de l'ordre (`ordre-du-catalogue.test.ts`) verrait les fiches
// manquer.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const PLUGINS = resolve(__dirname);
const CATEGORIES = join(PLUGINS, "categories");
const INDEX = join(PLUGINS, "index.ts");
const SRC = resolve(PLUGINS, "..");

const nomCourt = (f: string) => relative(PLUGINS, f).replace(/\\/g, "/").replace(/\.ts$/, "");
const lire = (f: string) => ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true);
const estModule = (n: string) => n.endsWith(".ts") && !n.includes(".test.");

/** Le chemin qu'une spécification relative désigne depuis ce fichier, ou null pour un paquet. */
const cible = (depuis: string, spec: string) =>
  spec.startsWith(".") ? resolve(dirname(depuis), spec).replace(/\.ts$/, "") + ".ts" : null;

/** Exporte-t-il une liaison nommée `fiches` ? */
function exporteDesFiches(sf: ts.SourceFile): boolean {
  return sf.statements.some((s) =>
    (ts.isVariableStatement(s) && s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      && s.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === "fiches"))
    || (ts.isExportDeclaration(s) && !!s.exportClause && ts.isNamedExports(s.exportClause)
      && s.exportClause.elements.some((e) => e.name.text === "fiches")));
}

/** L'expression sous ses parenthèses et ses affirmations de type : `(f as FicheAudio[])` est `f`. */
function nue(e: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isTypeAssertionExpression(e)
    || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e)) e = e.expression;
  return e;
}

/**
 * Les noms versés dans une liste de ce fichier, autant de fois qu'ils le sont : étalés (`...f`,
 * `...(f as FicheAudio[])`) ou concaténés (`.concat(f)`). Ce sont les trois formes du dépôt.
 */
function verses(sf: ts.SourceFile): string[] {
  const noms: string[] = [];
  const voir = (e: ts.Expression) => { const x = nue(e); if (ts.isIdentifier(x)) noms.push(x.text); };
  const visiter = (n: ts.Node) => {
    if (ts.isSpreadElement(n)) voir(n.expression);
    else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "concat") {
      n.arguments.forEach(voir);
    }
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return noms;
}

/**
 * Les modules dont ce fichier VERSE les fiches dans les siennes, une entrée par versement.
 *
 * L'IMPORT NE SUFFIT PAS : la liaison importée doit être versée. Un premier jet comptait l'import
 * seul, et une faute plantée l'a montré : retirer `...f_hpss` de sa catégorie en laissant l'import
 * en place retirait les fiches du catalogue, et ce cas restait vert.
 */
function fichesImportees(f: string, sf: ts.SourceFile): string[] {
  const vers: string[] = [];
  const noms = verses(sf);
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier) || s.importClause?.isTypeOnly) continue;
    const liaisons = s.importClause?.namedBindings;
    if (!liaisons || !ts.isNamedImports(liaisons)) continue;
    const c = cible(f, s.moduleSpecifier.text);
    if (!c) continue;
    for (const e of liaisons.elements) {
      if ((e.propertyName ?? e.name).text !== "fiches" || e.isTypeOnly) continue;
      for (const n of noms) if (n === e.name.text) vers.push(c);
    }
  }
  return vers;
}

/** Les modules que ce fichier désigne, et si c'est par un import STATIQUE ou par `import()`. */
function designations(f: string, sf: ts.SourceFile): { cible: string; statique: boolean }[] {
  const vers: { cible: string; statique: boolean }[] = [];
  const voir = (spec: string, statique: boolean) => {
    const c = cible(f, spec);
    if (c) vers.push({ cible: c, statique });
  };
  const visiter = (n: ts.Node) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      voir(n.moduleSpecifier.text, true);
    } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword
      && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      voir(n.arguments[0].text, false);
    }
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return vers;
}

/** Les fichiers de `categories/` que ce fichier désigne, par import statique ou par `import()`. */
const categoriesDesignees = (f: string, sf: ts.SourceFile) =>
  designations(f, sf).filter((d) => dirname(d.cible) === CATEGORIES).map((d) => d.cible);

/** Les catégories que ce fichier verse dans les siennes, ou qu'il charge par `import()`. */
function categoriesChargees(f: string, sf: ts.SourceFile): string[] {
  const dynamiques: string[] = [];
  const visiter = (n: ts.Node) => {
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword
      && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      const c = cible(f, n.arguments[0].text);
      if (c && dirname(c) === CATEGORIES) dynamiques.push(c);
    }
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return [...fichesImportees(f, sf).filter((c) => dirname(c) === CATEGORIES), ...dynamiques];
}

/** Tous les modules de `src/`, hors tests. */
function modulesDeSrc(dossier = SRC, out: string[] = []): string[] {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const p = join(dossier, e.name);
    if (e.isDirectory()) modulesDeSrc(p, out);
    else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

const plugins = readdirSync(PLUGINS).filter(estModule).map((n) => join(PLUGINS, n));
const categories = readdirSync(CATEGORIES).filter(estModule).map((n) => join(CATEGORIES, n));
const arbres = new Map([...plugins, ...categories].map((f) => [f, lire(f)]));
const exportateurs = plugins.filter((f) => exporteDesFiches(arbres.get(f)!));
/** Pour chaque module, ceux qui reprennent ses fiches. */
const repreneurs = new Map<string, string[]>();
for (const [f, sf] of arbres) {
  for (const c of fichesImportees(f, sf)) repreneurs.set(c, [...(repreneurs.get(c) ?? []), f]);
}

describe("les catégories du catalogue", () => {
  it("l'instrument voit les fichiers de fiches et les huit catégories", () => {
    expect(exportateurs.length).toBeGreaterThan(250);
    expect(categories.length).toBe(8);
  });

  it("CHAQUE FICHIER DE FICHES EST REPRIS UNE FOIS, ET UNE SEULE", () => {
    const fautifs = exportateurs.flatMap((f) => {
      const r = repreneurs.get(f) ?? [];
      return r.length === 1 ? [] : [`${nomCourt(f)} — repris par ${r.length ? r.map(nomCourt).join(", ") : "aucun module"}`];
    });
    expect(fautifs, [
      "Ces fichiers de plugins exportent des fiches qu'aucune catégorie ne reprend, ou que deux modules reprennent.",
      "Une fiche oubliée manque à la palette sans rien casser ; reprise deux fois, elle y entre en double.",
      "Ajoutez-la à la catégorie qui convient dans `src/plugins/categories/`, une seule fois.",
    ].join("\n")).toEqual([]);
  });

  it("TOUTE CHAÎNE DE REPRISES ABOUTIT À UNE CATÉGORIE", () => {
    const perdues: string[] = [];
    for (const f of exportateurs) {
      const vus = new Set<string>();
      let m = f;
      while (dirname(m) !== CATEGORIES && !vus.has(m)) {
        vus.add(m);
        const r = repreneurs.get(m) ?? [];
        if (r.length !== 1) break;
        m = r[0];
      }
      if (dirname(m) !== CATEGORIES) perdues.push(`${nomCourt(f)} — la chaîne s'arrête à ${nomCourt(m)}`);
    }
    expect(perdues, "Ces fiches sont reprises par un module qu'aucune catégorie ne reprend à son tour.").toEqual([]);
  });

  it("CHAQUE CATÉGORIE EST CHARGÉE PAR LE CATALOGUE, UNE FOIS", () => {
    const designees = categoriesChargees(INDEX, lire(INDEX));
    const comptes = categories.map((c) => `${nomCourt(c)} : ${designees.filter((d) => d === c).length}`);
    expect(comptes, "`plugins/index.ts` doit charger chaque fichier de `categories/` exactement une fois.")
      .toEqual(categories.map((c) => `${nomCourt(c)} : 1`));
    expect(designees.filter((d) => !categories.includes(d)).map(nomCourt), "catégories inexistantes").toEqual([]);
  });

  it("SEUL LE CATALOGUE CHARGE UNE CATÉGORIE", () => {
    const autres = modulesDeSrc().filter((f) => f !== INDEX && categoriesDesignees(f, lire(f)).length > 0);
    expect(autres.map((f) => relative(SRC, f).replace(/\\/g, "/")), [
      "Ces modules chargent une catégorie du catalogue sans passer par `plugins/index.ts`.",
      "Le catalogue est le seul endroit où l'ordre des catégories est écrit.",
    ].join("\n")).toEqual([]);
  });

  // UN IMPORT STATIQUE D'UNE CATÉGORIE ANNULE LA COUPE EN SILENCE. Le build la remet alors dans le
  // morceau de son importeur, et ne le dit que par un avertissement, `INEFFECTIVE_DYNAMIC_IMPORT`,
  // perdu parmi les autres : l'application marche, et le catalogue est de nouveau d'un bloc.
  it("LE CATALOGUE CHARGE SES CATÉGORIES PAR import(), ET PAR LÀ SEULEMENT", () => {
    const statiques = designations(INDEX, lire(INDEX))
      .filter((d) => d.statique && dirname(d.cible) === CATEGORIES).map((d) => nomCourt(d.cible));
    expect(statiques, "`plugins/index.ts` importe statiquement ces catégories : elles ne sont plus chargées à part.")
      .toEqual([]);
  });

  // SON `await` AU NIVEAU DU MODULE BLOQUERAIT TOUT CE QUI L'IMPORTE, et une catégorie qui
  // réimporterait l'importeur attendrait sa propre fin : voir l'en-tête de `catalogue-pret.ts`.
  it("LE CATALOGUE PRÊT NE SERT QU'AUX TESTS : aucun module de l'application ne l'importe", () => {
    const PRET = join(PLUGINS, "catalogue-pret.ts");
    const fautifs = modulesDeSrc().filter((f) => f !== PRET && designations(f, lire(f)).some((d) => d.cible === PRET));
    expect(fautifs.map((f) => relative(SRC, f).replace(/\\/g, "/")), [
      "Ces modules de l'application importent `plugins/catalogue-pret.ts`, que seuls les tests lisent.",
      "L'application attend le catalogue une fois, dans `main.tsx`, par `domainePret`.",
    ].join("\n")).toEqual([]);
  });
});
