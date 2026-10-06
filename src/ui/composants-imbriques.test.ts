// ui/composants-imbriques.test.ts — Aucun composant n'est déclaré dans le corps d'un autre.
//
// LE DÉFAUT QUE CE FICHIER EXISTE POUR EMPÊCHER. `BarreOutils` déclarait `Groupe` dans son corps.
// Un composant déclaré là est un TYPE NEUF à chaque rendu : React ne reconnaît pas l'ancien, démonte
// tout le sous-arbre et le remonte. Les conséquences ne ressemblent pas à leur cause, et c'est ce qui
// rend ce défaut coûteux à trouver :
//
//   L'ÉTAT DES ENFANTS EST PERDU à chaque rendu du parent. `BoutonModeles` vit dans l'un de ces
//   groupes : il repartait de son état vide et redemandait l'inventaire au processus principal.
//
//   ET LE PARENT RENDAIT SOUVENT. La barre se relève en mémoire toutes les deux secondes sous
//   Electron. Constaté par Fabien : « un processus qui fait vibrer le menu du haut et clignoter le
//   témoin de téléchargement ». Mesuré dans l'application : sur un seul rendu de la barre, l'élément
//   du groupe changeait d'identité, ses enfants avec ; corrigé, les deux la gardent.
//
// LE GARDE CHERCHE UNE FORME, ET NON UN NOM : une déclaration INDENTÉE dont le nom commence par une
// majuscule et dont le corps porte du JSX. Un composant du module est à la colonne zéro ; tout ce
// qui est indenté est dans le corps de quelque chose.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RACINE = join(process.cwd(), "src");

function sources(dossier: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dossier)) {
    const chemin = join(dossier, e);
    if (statSync(chemin).isDirectory()) out.push(...sources(chemin));
    else if (e.endsWith(".tsx") && !e.endsWith(".test.tsx")) out.push(chemin);
  }
  return out;
}

/** Une déclaration indentée dont le nom pourrait être celui d'un composant. */
const DECLARATION = /^[ \t]+(?:const ([A-Z][A-Za-z0-9_]+) = (?:\(|function)|function ([A-Z][A-Za-z0-9_]+)\()/;

/** Ce qui fait d'une déclaration un COMPOSANT : du JSX dans ce qui suit, avant la prochaine. */
const JSX = /<[A-Za-z][A-Za-z0-9.]*[\s/>]|React\.ReactNode|JSX\.Element/;

function imbriques(texte: string): string[] {
  const lignes = texte.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lignes.length; i++) {
    const m = DECLARATION.exec(lignes[i]);
    if (!m) continue;
    const nom = m[1] ?? m[2];
    // Les douze lignes qui suivent suffisent à voir si la déclaration rend du JSX : au-delà, on
    // serait sorti de la fonction sans l'avoir vu en rendre.
    const corps = lignes.slice(i, i + 12).join("\n");
    if (JSX.test(corps)) out.push(`${nom} (ligne ${i + 1})`);
  }
  return out;
}

describe("aucun composant n'est déclaré dans le corps d'un autre", () => {
  const fichiers = sources(RACINE);

  it("LE BALAYAGE LIT BIEN LES SOURCES, sans quoi le cas passerait à vide", () => {
    expect(fichiers.length).toBeGreaterThan(10);
    expect(fichiers.some((f) => f.endsWith("BarreOutils.tsx"))).toBe(true);
  });

  it("aucun fichier n'en porte", () => {
    const fautifs = fichiers
      .map((f) => ({ f: f.slice(RACINE.length + 1).replace(/\\/g, "/"), n: imbriques(readFileSync(f, "utf8")) }))
      .filter((x) => x.n.length > 0)
      .map((x) => `${x.f} → ${x.n.join(", ")}`);
    expect(fautifs, [
      "Un composant est déclaré dans le corps d'un autre.",
      "À chaque rendu du parent, React le prend pour un type neuf : il démonte le sous-arbre et le",
      "remonte, donc les enfants perdent leur état et refont leurs effets.",
      "Le sortir au niveau du module, et lui passer en propriété ce qu'il prenait de la fermeture.",
    ].join("\n")).toEqual([]);
  });

  it("ET LE GARDE VOIT LE DÉFAUT QU'IL REFUSE, planté sur la forme d'origine", () => {
    // Sans ce cas, une expression régulière devenue trop étroite rendrait le garde muet sans que
    // rien ne le dise.
    const plante = [
      "export function Barre() {",
      "  const Groupe = ({ famille, children }: { famille: string; children: React.ReactNode }) => (",
      '    <div className="attic-groupe">{children}</div>',
      "  );",
      "  return <Groupe famille=\"x\">y</Groupe>;",
      "}",
    ].join("\n");
    expect(imbriques(plante)).toEqual(["Groupe (ligne 2)"]);
  });

  it("et il ne crie pas sur une fonction indentée qui n'est pas un composant", () => {
    // Les échelles d'un tracé s'appellent `X` et `Y` et vivent dans le corps d'un composant : elles
    // ne rendent rien, et les sortir n'aurait aucun sens.
    const echelle = "  const X = (ms: number) => padL + (ms / total) * w;\n  const Y = (n: number) => n;";
    expect(imbriques(echelle)).toEqual([]);
  });
});
