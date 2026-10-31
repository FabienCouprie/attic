// docs/options-lues.test.ts — Garde-fou : un champ du type des options d'un module audio a un
// lecteur.
//
// POURQUOI CE GARDE EXISTE. `OptionsContinuationSpectrale` annonçait deux activations, « relu » et
// « tanh », du 2026-08-09 au 2026-10-31, et aucune n'a jamais agi : le module déstructurait le champ
// sans le passer à personne, et les deux valeurs rendaient le même son à l'octet près. Ce n'était
// pas un réglage de nœud, donc le contrat de nœud ne pouvait pas le voir ; et un commentaire du
// 2026-10-21 comptait « trente tirages, graines et activations variées » sur la foi de ce type.
//
// IL CHERCHE UNE FORME, ET NON UN NOM. Une sonde qui demandait si le nom du champ paraît ailleurs
// dans le module a laissé passer ce cas même : `activation: "linear"`, dans la configuration des
// couches tfjs, porte le même nom. Ce garde lit sur l'arbre syntaxique les LECTURES faites sur un
// objet qui porte le type : un paramètre ou une variable annotés de ce type, puis `o.champ`,
// `o["champ"]`, ou une déstructuration `const { champ } = o` dont la variable sert ensuite. Un champ
// déstructuré qu'on n'emploie plus n'est pas lu : c'était l'état du 2026-08-09.
//
// LE LECTEUR PEUT ÊTRE AILLEURS QUE DANS LE MODULE : un plugin qui bâtit les options et en relit
// deux champs pour lui-même les fait agir. Les porteurs se cherchent donc dans tout `src`, hors
// tests, le type suivi par les imports. Et ce qui se transmet n'est pas une fuite quand l'objet va,
// tel quel ou étalé dans un littéral, à une fonction de `src` dont le paramètre porte ce type ou l'un
// de ses parents ; la lecture se rend alors au type qui déclare le champ, à travers `extends`,
// `Omit`, `Partial` et les intersections.
//
// CE QU'IL NE VOIT PAS, et il le compte. Un type dont un objet s'échappe (vers un worker, une
// bibliothèque, un retour, une méthode) est INDÉCIDABLE : ce qu'on en fait là ne se lit pas d'ici.
// Une constante exportée qui porte le type n'est suivie que dans son fichier. Un type d'options qui
// ne s'appelle pas `Options…`, la convention de `src/audio` pour ce qu'un appelant donne à une
// fonction, n'est pas examiné : un type de données y laisserait des champs lus de mille façons.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative, resolve } from "node:path";
import ts from "typescript";

const RACINE = resolve(__dirname, "../..");

/**
 * LA DETTE : les champs qu'aucun lecteur ne prend, relevés le 2026-10-31 quand ce garde est né.
 * Elle ne peut que décroître : un champ qui retrouve un lecteur, ou qui sort du type, doit en sortir.
 */
const DETTE = new Set([
  // Le plugin calcule lui-même `regle` depuis « Règle personnalisée » ; ce champ en est le doublon.
  "src/audio/automate-cellulaire.ts OptionsAutomateCellulaire.reglePersonnalisee",
  // Deux bornes optionnelles que le rendu n'emploie pas.
  "src/audio/spectrogramme-fractal.ts OptionsSpectrogrammeFractal.minFreq",
  "src/audio/spectrogramme-fractal.ts OptionsSpectrogrammeFractal.maxFreq",
  // `ecrireMp4` ne s'abonne pas à l'annulation, là où ses deux voisines du fichier le font.
  "src/audio/video-sortie.ts OptionsSortie.signal",
]);

const EST_TYPE_D_OPTIONS = /^Options/;
const ENVELOPPES = new Set(["Partial", "Readonly", "Required", "Omit", "Pick"]);

interface TypeOptions { champs: Set<string>; parents: string[] }
interface Bilan { champs: Set<string>; lus: Set<string>; porteurs: number; fuites: string[] }

const nomDePropriete = (n: ts.PropertyName) => ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : null;

/** L'analyse d'un ensemble de fichiers, chemins relatifs en barres obliques : un bilan par type. */
function analyserOptions(sources: Map<string, string>): Map<string, Bilan> {
  const arbres = new Map([...sources].map(([c, s]) =>
    [c, ts.createSourceFile(c, s, ts.ScriptTarget.Latest, true, c.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)]));

  const cheminDe = (depuis: string, specifieur: string): string | null => {
    if (!specifieur.startsWith(".")) return null;
    const base = posix.join(posix.dirname(depuis), specifieur);
    return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base].find((c) => arbres.has(c)) ?? null;
  };
  // Ce que chaque fichier déclare à son niveau : types d'options et fonctions.
  const declares = new Map<string, Set<string>>();
  for (const [c, sf] of arbres) {
    const noms = new Set<string>();
    for (const s of sf.statements) {
      if ((ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s) || ts.isFunctionDeclaration(s)) && s.name) noms.add(s.name.text);
      if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name)) noms.add(d.name.text);
    }
    declares.set(c, noms);
  }
  /** Le fichier qui déclare `nom` exporté par `chemin`, à travers `export … from`. */
  const origine = (chemin: string, nom: string, vus = new Set<string>()): string | null => {
    if (vus.has(chemin)) return null;
    vus.add(chemin);
    if (declares.get(chemin)?.has(nom)) return `${chemin}#${nom}`;
    for (const s of arbres.get(chemin)!.statements) {
      if (!ts.isExportDeclaration(s) || !s.moduleSpecifier || !ts.isStringLiteral(s.moduleSpecifier)) continue;
      const cible = cheminDe(chemin, s.moduleSpecifier.text);
      if (!cible) continue;
      if (!s.exportClause) { const o = origine(cible, nom, vus); if (o) return o; }
      else if (ts.isNamedExports(s.exportClause)) {
        const e = s.exportClause.elements.find((x) => x.name.text === nom);
        if (e) return origine(cible, (e.propertyName ?? e.name).text, vus);
      }
    }
    return null;
  };
  /** Les noms qu'un fichier emploie, rendus à leur déclaration : les siens, puis ses imports. */
  const portees = new Map<string, Map<string, string>>();
  for (const [c, sf] of arbres) {
    const m = new Map<string, string>();
    for (const n of declares.get(c)!) m.set(n, `${c}#${n}`);
    for (const s of sf.statements) {
      if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier)) continue;
      const cible = cheminDe(c, s.moduleSpecifier.text);
      const liens = s.importClause?.namedBindings;
      if (!cible || !liens || !ts.isNamedImports(liens)) continue;
      for (const e of liens.elements) {
        const o = origine(cible, (e.propertyName ?? e.name).text);
        if (o) m.set(e.name.text, o);
      }
    }
    portees.set(c, m);
  }

  // Les types d'options : déclarés dans `src/audio`, avec leurs champs propres et leurs parents.
  const types = new Map<string, TypeOptions>();
  const heritages = new Map<string, ts.TypeNode[]>();
  for (const [c, sf] of arbres) {
    if (!c.startsWith("src/audio/")) continue;
    for (const s of sf.statements) {
      if (!(ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) || !EST_TYPE_D_OPTIONS.test(s.name.text)) continue;
      const membres = ts.isInterfaceDeclaration(s) ? s.members : ts.isTypeLiteralNode(s.type) ? s.type.members : [];
      const champs = new Set<string>();
      for (const m of membres) if ((ts.isPropertySignature(m) || ts.isMethodSignature(m)) && nomDePropriete(m.name)) champs.add(nomDePropriete(m.name)!);
      const cle = `${c}#${s.name.text}`;
      types.set(cle, { champs, parents: [] });
      heritages.set(cle, ts.isInterfaceDeclaration(s)
        ? (s.heritageClauses ?? []).flatMap((h) => h.types as unknown as ts.TypeNode[])
        : ts.isTypeLiteralNode(s.type) ? [] : [s.type]);
    }
  }
  /** Les types d'options qu'une annotation désigne, à travers enveloppes, unions et intersections. */
  const designes = (t: ts.TypeNode | undefined, fichier: string): string[] => {
    if (!t) return [];
    if (ts.isParenthesizedTypeNode(t)) return designes(t.type, fichier);
    if (ts.isUnionTypeNode(t) || ts.isIntersectionTypeNode(t)) return t.types.flatMap((u) => designes(u, fichier));
    const nom = ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) ? t.typeName.text
      : ts.isExpressionWithTypeArguments(t) && ts.isIdentifier(t.expression) ? t.expression.text : null;
    if (!nom) return [];
    const cle = portees.get(fichier)!.get(nom);
    if (cle && types.has(cle)) return [cle];
    const args = (t as ts.TypeReferenceNode).typeArguments;
    return ENVELOPPES.has(nom) && args?.length ? designes(args[0], fichier) : [];
  };
  for (const [cle, h] of heritages) types.get(cle)!.parents = h.flatMap((p) => designes(p, cle.split("#")[0]));
  const lignee = (cle: string, vus = new Set<string>()): Set<string> => {
    if (!vus.has(cle)) { vus.add(cle); for (const p of types.get(cle)?.parents ?? []) lignee(p, vus); }
    return vus;
  };

  // Les fonctions de `src`, et les types d'options que porte chacun de leurs paramètres.
  const signatures = new Map<string, string[][]>();
  for (const [c, sf] of arbres) {
    const visite = (n: ts.Node) => {
      const f = ts.isFunctionDeclaration(n) && n.name ? { nom: n.name.text, s: n as ts.SignatureDeclaration }
        : ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer
          && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) ? { nom: n.name.text, s: n.initializer } : null;
      if (f) signatures.set(`${c}#${f.nom}`, f.s.parameters.map((p) => designes(p.type, c)));
      ts.forEachChild(n, visite);
    };
    visite(sf);
  }

  const bilans = new Map<string, Bilan>();
  for (const [cle, t] of types) bilans.set(cle, { champs: t.champs, lus: new Set(), porteurs: 0, fuites: [] });
  const lire = (vises: string[], champ: string) => {
    for (const t of vises) for (const a of lignee(t)) if (types.get(a)!.champs.has(champ)) bilans.get(a)!.lus.add(champ);
  };
  const fuir = (vises: string[], raison: string) => { for (const t of vises) for (const a of lignee(t)) bilans.get(a)!.fuites.push(raison); };
  const couvre = (attendus: string[], vises: string[]) => attendus.length > 0 && attendus.every((a) => vises.some((t) => lignee(t).has(a)));

  for (const [fichier, sf] of arbres) {
    const ou = (n: ts.Node) => `${fichier}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
    /** L'objet va à une fonction de `src` dont ce paramètre attend ce type ou un parent. */
    const resteDansSrc = (vises: string[], appel: ts.Node, rang: number) => {
      if (!ts.isCallExpression(appel) || !ts.isIdentifier(appel.expression) || rang < 0) return false;
      const f = portees.get(fichier)!.get(appel.expression.text) ?? `${fichier}#${appel.expression.text}`;
      return couvre(signatures.get(f)?.[rang] ?? [], vises);
    };
    /** Les identifiants qui nomment `nom` dans `portee`, hors noms de propriété et hors `exclu`. */
    const references = (portee: ts.Node, nom: string, exclu: ts.Node): ts.Identifier[] => {
      const out: ts.Identifier[] = [];
      const visite = (n: ts.Node) => {
        if (ts.isIdentifier(n) && n.text === nom && n !== exclu) {
          const p = n.parent;
          const propriete = ((ts.isPropertyAccessExpression(p) || ts.isPropertyAssignment(p) || ts.isPropertySignature(p)
            || ts.isMethodSignature(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p)) && p.name === n)
            || (ts.isBindingElement(p) && p.propertyName === n);
          if (!propriete) out.push(n);
        }
        ts.forEachChild(n, visite);
      };
      visite(portee);
      return out;
    };
    const lireMotif = (vises: string[], motif: ts.ObjectBindingPattern, portee: ts.Node) => {
      for (const e of motif.elements) {
        if (e.dotDotDotToken) { fuir(vises, `reste déstructuré, ${ou(e)}`); continue; }
        const champ = e.propertyName ? nomDePropriete(e.propertyName) : ts.isIdentifier(e.name) ? e.name.text : null;
        if (!champ) { fuir(vises, `clé calculée, ${ou(e)}`); continue; }
        // Déstructuré puis jamais employé : ce n'est pas une lecture.
        if (!ts.isIdentifier(e.name) || references(portee, e.name.text, e.name).length > 0) lire(vises, champ);
      }
    };
    const porteur = (vises: string[], nom: ts.BindingName, portee: ts.Node) => {
      for (const t of vises) for (const a of lignee(t)) bilans.get(a)!.porteurs++;
      if (ts.isObjectBindingPattern(nom)) return lireMotif(vises, nom, portee);
      if (!ts.isIdentifier(nom)) return fuir(vises, `porteur en tableau, ${ou(nom)}`);
      for (const r of references(portee, nom.text, nom)) {
        const p = r.parent;
        if (ts.isPropertyAccessExpression(p) && p.expression === r) lire(vises, p.name.text);
        else if (ts.isElementAccessExpression(p) && p.expression === r && ts.isStringLiteral(p.argumentExpression)) lire(vises, p.argumentExpression.text);
        else if (ts.isVariableDeclaration(p) && p.initializer === r && ts.isObjectBindingPattern(p.name)) lireMotif(vises, p.name, portee);
        else if (ts.isCallExpression(p) && resteDansSrc(vises, p, p.arguments.indexOf(r))) continue;
        else if (ts.isSpreadAssignment(p) && ts.isObjectLiteralExpression(p.parent)) {
          const lit = p.parent;
          const dest = lit.parent;
          const versUnPorteur = ts.isVariableDeclaration(dest) && dest.initializer === lit && couvre(designes(dest.type, fichier), vises);
          if (!versUnPorteur && !resteDansSrc(vises, dest, ts.isCallExpression(dest) ? dest.arguments.indexOf(lit) : -1)) {
            fuir(vises, `étalé ailleurs, ${ou(r)}`);
          }
        } else fuir(vises, `${ts.SyntaxKind[p.kind]}, ${ou(r)}`);
      }
    };
    const visite = (n: ts.Node) => {
      // Un paramètre de signature sans corps (un type de fonction, une surcharge) ne lit rien.
      if (ts.isParameter(n) && (n.parent as ts.FunctionLikeDeclaration).body) {
        const vises = designes(n.type, fichier);
        if (vises.length > 0) porteur(vises, n.name, n.parent);
      } else if (ts.isVariableDeclaration(n) && n.type && n.parent?.parent?.parent) {
        const vises = designes(n.type, fichier);
        if (vises.length > 0) porteur(vises, n.name, n.parent.parent.parent);
      }
      ts.forEachChild(n, visite);
    };
    visite(sf);
  }
  return bilans;
}

/** Les champs sans lecteur d'un bilan décidable. */
const orphelins =(b: Bilan) => b.porteurs > 0 && b.fuites.length === 0 ? [...b.champs].filter((c) => !b.lus.has(c)) : [];

function sourcesDe(dossier: string, out = new Map<string, string>()): Map<string, string> {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) sourcesDe(chemin, out);
    else if (/\.tsx?$/.test(nom) && !/\.test\.tsx?$/.test(nom) && !nom.endsWith(".d.ts")) {
      out.set(relative(RACINE, chemin).replace(/\\/g, "/"), readFileSync(chemin, "utf8"));
    }
  }
  return out;
}

describe("les champs du type des options d'un module audio", () => {
  const releve = [...analyserOptions(sourcesDe(join(RACINE, "src")))].map(([cle, b]) => ({ cle, b }));
  const decides = releve.filter((r) => r.b.porteurs > 0 && r.b.fuites.length === 0);

  it("décide assez de types pour garder quelque chose", () => {
    // UN GARDE QUI NE DÉCIDERAIT PLUS RIEN PASSERAIT AU VERT : un plancher sur ce qu'il a tranché.
    // Relevé le 2026-10-31 : 188 types, 166 décidés, 22 indécidables, aucun sans porteur.
    expect(releve.length).toBeGreaterThan(150);
    expect(decides.length, `${decides.length} types décidés sur ${releve.length}`).toBeGreaterThan(140);
  });

  it("aucun champ ne reste sans lecteur", () => {
    const trouves = decides.flatMap((r) => orphelins(r.b).map((c) => `${r.cle.replace("#", " ")}.${c}`));
    const neufs = trouves.filter((t) => !DETTE.has(t));
    const sortis = [...DETTE].filter((d) => !trouves.includes(d));
    expect(neufs, "un champ du type des options n'est lu par personne : le brancher, ou le retirer du type et de ses appels").toEqual([]);
    expect(sortis, "ce champ n'est plus orphelin : le retirer de DETTE").toEqual([]);
  });

  it("reconnaît la faute qu'il est censé attraper, et seulement elle", () => {
    const sans = (fichiers: Record<string, string>) => [...analyserOptions(new Map(Object.entries(fichiers)))]
      .flatMap(([cle, b]) => orphelins(b).map((c) => `${cle.split("#")[1]}.${c}`));
    const TYPE = `export interface OptionsC { mode: string; activation: "relu" | "tanh" }`;
    // Le 2026-08-09 : déstructurée, jamais passée, et un homonyme dans la configuration d'une couche.
    expect(sans({ "src/audio/c.ts": `${TYPE}
      const couche = () => ({ activation: "linear" });
      export function f(options: OptionsC) { const { mode, activation } = options; return [mode, couche()]; }` }))
      .toEqual(["OptionsC.activation"]);
    // Le 2026-10-31, après le lint : le champ n'est plus même déstructuré.
    expect(sans({ "src/audio/c.ts": `${TYPE}
      export function f(options: OptionsC) { const { mode } = options; return mode; }` })).toEqual(["OptionsC.activation"]);
    // Un parent : la voie lit son champ et passe le reste à la fonction de base, qui en oublie un.
    expect(sans({ "src/audio/c.ts": `${TYPE}
      export interface OptionsVoie extends Omit<OptionsC, "mode"> { mix: number }
      function base(o: OptionsC) { return o.mode; }
      export function voie(o: OptionsVoie) { return base({ ...o, mode: "b" }) + o.mix; }` })).toEqual(["OptionsC.activation"]);
    // Ce qui n'en est pas une : la lecture renommée, et le plugin qui relit un champ pour lui-même.
    expect(sans({ "src/audio/c.ts": `${TYPE}
      export function f(o: OptionsC) { const { mode, activation: a } = o; return mode + a; }` })).toEqual([]);
    expect(sans({
      "src/audio/c.ts": `${TYPE}
      export function f(o: OptionsC) { return o.mode; }`,
      "src/plugins/c.ts": `import { f, type OptionsC } from "../audio/c";
      export function g() { const o: OptionsC = { mode: "a", activation: "relu" }; return f(o) + o.activation; }`,
    })).toEqual([]);
    // Ce qu'il ne tranche pas : l'objet envoyé à un worker rend le type indécidable, et non innocent.
    const echappe = analyserOptions(new Map([["src/audio/c.ts", `${TYPE}
      export function f(o: OptionsC, w: Worker) { w.postMessage({ o }); }`]])).get("src/audio/c.ts#OptionsC")!;
    expect(orphelins(echappe)).toEqual([]);
    expect(echappe.fuites.length).toBeGreaterThan(0);
  });
});
