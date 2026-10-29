// docs/vues-anglais.test.ts — Garde-fou : aucun texte écrit en dur dans une vue ne reste en
// français dans l'interface anglaise.
//
// POURQUOI CE GARDE EXISTE. Le 2026-10-29, en filmant la présentation anglaise d'Attic, le VU-mètre
// affichait « Plage dyn. (LRA) » au milieu de « Crest factor » et de « LUFS max ». Le libellé était
// écrit dans le JSX, sans passer par le dictionnaire : `anglais-registre.test.ts` ne lit que les
// fiches et le dictionnaire, et ce texte n'était ni l'un ni l'autre. Un texte en dur s'affiche dans
// les deux langues, et c'est en anglais qu'il se voit.
//
// IL CHERCHE UNE FORME, ET NON UN NOM : les positions où un littéral est AFFICHÉ, lues sur l'arbre
// syntaxique de TypeScript. Le texte entre deux balises ; un littéral posé seul entre accolades, ou
// au bout d'une condition (`ok ? "Terminé" : "Erreur"`, `n && "aucun"`) ; et les attributs qu'on lit
// à l'écran, `title`, `placeholder`, `aria-label`, `alt`. Une condition sur la langue est la
// traduction elle-même, et ses deux branches ne sont pas relevées. Un littéral passé à une fonction,
// un nom de réglage lu dans `parametres`, une classe CSS ne sont pas des positions d'affichage : un
// garde qui fouillerait toutes les chaînes accentuées des vues crierait sur les noms de réglages,
// qui sont français par construction, et on apprendrait à ne plus le lire.
//
// ET CE QU'IL EXIGE NE TIENT PAS À UNE LISTE DE MOTS FRANÇAIS. La première écriture passait chaque
// texte au détecteur du registre, et la faute plantée, « Plage dyn. (LRA) », est restée verte : sans
// accent, et « plage » absent de la liste. La relecture à la main des cinquante-cinq textes à lettres
// des soixante-sept vues en a trouvé treize autres que la liste laissait passer, « Erreur », « Pic »,
// « Mo », « Pochette », « autres ». Un texte en dur ne passe donc que s'il n'est fait que de mots qui
// s'écrivent de même dans les deux langues, et chacun de ces mots est déclaré plus bas. Un mot neuf
// demande une décision : le dictionnaire, ou la liste, avec sa raison.
//
// CE QU'IL NE VOIT PAS. Un texte composé ailleurs puis affiché par une variable, et le texte dessiné
// dans un canevas : il n'y a là aucune forme qui dise « ceci s'affiche ».
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

import { virguleDecimale } from "./detecteur-francais";

const RACINE = resolve(__dirname, "../..");

/**
 * Les mots qu'un texte en dur a le droit de porter : ceux qui s'écrivent de même dans les deux
 * langues. La casse ne compte pas.
 */
const MOTS_DES_DEUX_LANGUES = new Set([
  // Unités et sigles.
  "db", "hz", "khz", "ms", "fft", "lufs", "midi", "svg",
  // Abréviations et mots communs aux deux langues.
  "lin", "log", "max", "min", "note", "vol", "zoom",
  // Noms propres : deux langages, un outil.
  "julia", "python", "songsee",
  // « CREST FACTOR » EST DE L'ANGLAIS, QUE L'INTERFACE FRANÇAISE AFFICHE AUSSI, dans le VU-mètre.
  // Relevé le 2026-10-29 et laissé tel quel : ce garde porte sur ce que l'anglais montre.
  "crest", "factor",
]);

/**
 * Les mots d'un texte qui ne sont pas communs aux deux langues. Une lettre seule ne compte pas, ni
 * un code de couleur : « #8e6fce » n'est pas le mot « fce ».
 */
const motsPropresAUneLangue = (texte: string) =>
  (texte.replace(/#[0-9a-f]{3,8}\b/gi, "").match(/[a-zà-ÿœæ]{2,}/gi) ?? [])
    .filter((m) => !MOTS_DES_DEUX_LANGUES.has(m.toLowerCase()));

/** Les attributs dont la valeur se lit à l'écran, ou se dit au lecteur d'écran. */
const ATTRIBUTS_AFFICHES = new Set(["title", "placeholder", "aria-label", "alt"]);

/** Une condition sur la langue : ses deux branches sont la traduction, non une faute. */
const CONDITION_DE_LANGUE = /\blang\b|\blangue\b|\ben\(\)|\banglais\b|["'](?:en|fr)["']/;

/** Les vues et l'interface : tout `.tsx` de `src/`, hors tests. */
function fichiersTsx(dossier: string): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) out.push(...fichiersTsx(chemin));
    else if (nom.endsWith(".tsx") && !nom.endsWith(".test.tsx")) out.push(chemin);
  }
  return out;
}

/** Le texte qu'un littéral montre : un gabarit ne montre que ses parties fixes. */
function texteDuLitteral(n: ts.Node): string | null {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isTemplateExpression(n)) return [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(" ");
  return null;
}

/** Les littéraux qu'une expression placée dans le JSX finit par afficher. */
function litterauxAffiches(e: ts.Expression): ts.Node[] {
  if (texteDuLitteral(e) !== null) return [e];
  if (ts.isParenthesizedExpression(e)) return litterauxAffiches(e.expression);
  if (ts.isConditionalExpression(e)) {
    if (CONDITION_DE_LANGUE.test(e.condition.getText())) return [];
    return [...litterauxAffiches(e.whenTrue), ...litterauxAffiches(e.whenFalse)];
  }
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      return CONDITION_DE_LANGUE.test(e.left.getText()) ? [] : litterauxAffiches(e.right);
    }
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      return [...litterauxAffiches(e.left), ...litterauxAffiches(e.right)];
    }
  }
  return [];
}

/** Tout ce qu'un fichier `.tsx` affiche en dur, avec sa ligne. */
function textesAffiches(source: string, nomFichier = "vue.tsx"): { ligne: number; texte: string }[] {
  const sf = ts.createSourceFile(nomFichier, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: { ligne: number; texte: string }[] = [];
  const ajoute = (n: ts.Node, texte: string) => {
    const t = texte.replace(/\s+/g, " ").trim();
    if (t) out.push({ ligne: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, texte: t });
  };
  const visite = (n: ts.Node) => {
    if (ts.isJsxText(n)) ajoute(n, n.text);
    else if (ts.isJsxExpression(n) && n.expression && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
      for (const l of litterauxAffiches(n.expression)) ajoute(l, texteDuLitteral(l)!);
    } else if (ts.isJsxAttribute(n) && n.initializer && ATTRIBUTS_AFFICHES.has(n.name.getText())) {
      const i = n.initializer;
      if (ts.isStringLiteral(i)) ajoute(i, i.text);
      else if (ts.isJsxExpression(i) && i.expression) {
        for (const l of litterauxAffiches(i.expression)) ajoute(l, texteDuLitteral(l)!);
      }
    }
    ts.forEachChild(n, visite);
  };
  visite(sf);
  return out;
}

/** Un texte en dur qui ne s'écrit pas de même dans les deux langues. */
const fautif = (texte: string) => motsPropresAUneLangue(texte).length > 0 || virguleDecimale(texte);

describe("le texte en dur des vues, dans l'interface anglaise", () => {
  const fichiers = fichiersTsx(join(RACINE, "src"));
  const releve = fichiers.flatMap((f) =>
    textesAffiches(readFileSync(f, "utf8"), f).map((t) => ({ ...t, fichier: relative(RACINE, f).replace(/\\/g, "/") })));

  it("relève bien du texte à vérifier", () => {
    // UN GARDE QUI NE LIRAIT PLUS RIEN PASSERAIT AU VERT : un plancher sur ce qu'il a réellement lu.
    expect(fichiers.length).toBeGreaterThan(50);
    expect(releve.length).toBeGreaterThan(150);
  });

  it("aucun texte affiché en dur ne dépend de la langue", () => {
    const fautifs = releve.filter((t) => fautif(t.texte))
      .map((t) => `${t.fichier}:${t.ligne} « ${t.texte.slice(0, 90)} » (${motsPropresAUneLangue(t.texte).join(", ") || "virgule décimale"})`);
    expect(fautifs, [
      "texte en dur dans une vue : le passer par le dictionnaire (`useI18n`, `traduire`),",
      "ou, s'il s'écrit de même dans les deux langues, inscrire ses mots dans MOTS_DES_DEUX_LANGUES avec leur raison",
    ].join(" ")).toEqual([]);
  });

  it("reconnaît la faute qu'il est censé attraper, et seulement elle", () => {
    const fautes = (source: string) => textesAffiches(source).filter((t) => fautif(t.texte)).map((t) => t.texte);
    // La faute du 2026-10-29, telle qu'elle était écrite, et celles que la relecture a trouvées.
    expect(fautes(`const V = () => <div style={{ color: "red" }}>Plage dyn. (LRA)</div>;`)).toEqual(["Plage dyn. (LRA)"]);
    expect(fautes(`const V = () => <button title="Regénérer">↻</button>;`)).toEqual(["Regénérer"]);
    expect(fautes(`const V = ({ n }) => <span>{n.toFixed(1)} Mo</span>;`)).toEqual(["Mo"]);
    expect(fautes(`const V = ({ ok }) => <span>{ok ? "Erreur" : "Done"}</span>;`)).toEqual(["Erreur", "Done"]);
    expect(fautes("const V = ({ d }) => <span>{`${d} s · 8,0 ×`}</span>;")).toEqual(["s · 8,0 ×"]);
    expect(fautes("const V = ({ a }) => <svg aria-label={`Courbe de ${a}`} />;")).toEqual(["Courbe de"]);
    // Ce qui n'en est pas une : la traduction, une condition sur la langue, un réglage lu, une
    // classe, et un texte que les deux langues écrivent de même.
    expect(fautes(`const V = () => <div>{t("vumetre.plage")}</div>;`)).toEqual([]);
    expect(fautes(`const V = ({ lang }) => <div>{lang === "en" ? "Range" : "Plage"}</div>;`)).toEqual([]);
    expect(fautes(`const V = ({ p }) => <div>{p["Fréquence"]} Hz</div>;`)).toEqual([]);
    expect(fautes(`const V = () => <div className="vue-écran">LUFS max</div>;`)).toEqual([]);
  });
});
