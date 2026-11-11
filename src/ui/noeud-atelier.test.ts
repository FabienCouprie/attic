// src/ui/noeud-atelier.test.ts — Le type d'un nœud, tenu aux sources qui déclarent ce qu'il porte.
//
// POURQUOI CE GARDE. Deux types `DonneesNoeud` coexistaient jusqu'au 2026-11-11, vingt-quatre champs
// d'un côté, quarante-trois de l'autre, sans qu'aucun contienne l'autre ; et aucun ne nommait tout ce
// que la table des saisies déclare. Rien ne les comparait, ni entre eux ni aux tables : une liste
// tenue à la main vieillit, et celle-ci avait vieilli deux fois.
//
// CE QU'IL LIT, ET COMMENT. Le type est rangé en quatre sections, une par classe de champ. Le garde lit
// chaque section PAR SA FORME, dans le texte de `ui/noeud-atelier.ts`, et la compare à sa source :
//   SaisiesDuNoeud     = `CHAMPS_DE_SAISIE` de `core/saisies.ts`, dans les deux sens ;
//   ResultatsDuNoeud   ⊂ `CHAMPS_RESULTAT` de `core/classes-de-champs.ts` ;
//   RappelsDuNoeud     = les clés que `callbacksNoeud` d'`App.tsx` pose, dans les deux sens ;
//   StructureDuNoeud   = `CHAMPS_DE_STRUCTURE` de `core/saisies.ts`, dans les deux sens.
// La cinquième, l'état d'une passe, a disparu à la pièce 3 : le statut, la progression et la priorité
// vivent dans des magasins, et le type ne doit plus les nommer.
// Une ligne qu'il ne sait pas lire le fait échouer, au lieu de passer sans la voir.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CHAMPS_DE_SAISIE, CHAMPS_DE_STRUCTURE } from "../core/saisies";
import { CHAMPS_RESULTAT } from "../core/classes-de-champs";

const SRC = resolve(__dirname, "..");
const lire = (f: string) => readFileSync(resolve(SRC, f), "utf8");

/** L'état d'une passe et la priorité, sortis de `data` à la pièce 3, et que le type ne nomme plus. */
const ETAT_HORS_DE_DATA = ["statut", "progression", "progressionDuNoeud", "prioritaire"];

/**
 * LES ALIAS EN `any` QUI PORTENT ENCORE LE NOM. Quatre fichiers déclarent `type NoeudAtelier = any`,
 * par choix écrit : ils ont été extraits d'un crochet sans en resserrer les types. Les pointer sur le
 * vrai type, mesuré le 2026-11-11, donne six erreurs de `tsc`, dont deux mensonges que le `any`
 * cachait : `setEdges` y est déclaré comme posant des nœuds, et `useCopierColler` passe à
 * `rechargerFichiersPersistes` des nœuds sans identifiant ni position. Les corriger change des
 * lecteurs ; ce n'est pas l'objet de ce garde. La liste ne doit que rétrécir.
 */
const ALIAS_EN_ANY = [
  "ui/hooks/useImportProjet.ts", "ui/hooks/usePersistance.ts", "ui/projet-a-ecrire.ts", "ui/rechargerFichiers.ts",
];

/** Le texte sans commentaires ni contenu de chaînes, les sauts de ligne gardés. */
function code(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      const fin = src.indexOf("\n", i);
      const j = fin < 0 ? src.length : fin;
      out += " ".repeat(j - i); i = j; continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const fin = src.indexOf("*/", i + 2);
      const j = fin < 0 ? src.length : fin + 2;
      out += src.slice(i, j).replace(/[^\n]/g, " "); i = j; continue;
    }
    if (c === "\"" || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      out += c + src.slice(i + 1, j).replace(/[^\n]/g, " ") + c; i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

/** Ce qui se trouve entre l'accolade ouvrante d'indice `ouvrante` et celle qui la ferme. */
function corps(texte: string, ouvrante: number): string {
  let p = 0;
  for (let i = ouvrante; i < texte.length; i++) {
    if ("({[".includes(texte[i])) p++;
    if (")}]".includes(texte[i]) && --p === 0) return texte.slice(ouvrante + 1, i);
  }
  throw new Error(`accolade non fermée à ${ouvrante}`);
}

/** Les morceaux d'un corps séparés au premier niveau, les crochets et parenthèses respectés. */
function morceaux(texte: string, separateurs: string): string[] {
  const out: string[] = [];
  let p = 0, tampon = "";
  // LES CHEVRONS NE COMPTENT PAS : la flèche `=>` d'un rappel en fermerait un qui n'est pas ouvert.
  for (const c of texte) {
    if ("({[".includes(c)) p++;
    if (")}]".includes(c)) p--;
    if (p === 0 && separateurs.includes(c)) { out.push(tampon.trim()); tampon = ""; continue; }
    tampon += c;
  }
  out.push(tampon.trim());
  return out.filter((m) => m !== "");
}

interface Section { champs: string[]; etend: string[]; ouverte: boolean }

/** Chaque interface du fichier : ses champs nommés, ce qu'elle étend, et sa signature ouverte. */
function interfaces(src: string): Map<string, Section> {
  const t = code(src);
  const out = new Map<string, Section>();
  for (const m of t.matchAll(/\binterface\s+(\w+)\s*(?:extends\s+([^{]+))?\{/g)) {
    const s: Section = { champs: [], etend: (m[2] ?? "").split(",").map((x) => x.trim()).filter(Boolean), ouverte: false };
    for (const ligne of morceaux(corps(t, m.index + m[0].length - 1), ";\n")) {
      const champ = ligne.match(/^([A-Za-z_$][\w$]*)\??\s*:/);
      if (champ) s.champs.push(champ[1]);
      else if (/^\[\s*\w+\s*:\s*string\s*\]\s*:/.test(ligne)) s.ouverte = true;
      else throw new Error(`${m[1]} : une ligne que le garde ne sait pas lire, « ${ligne} »`);
    }
    out.set(m[1], s);
  }
  return out;
}

/** Les clés de l'objet que `callbacksNoeud` rend, lues dans `App.tsx`. */
function rappelsPoses(): string[] {
  const src = lire("ui/App.tsx");
  const debut = src.search(/const callbacksNoeud = useCallback\(\(\) => \(\{/);
  if (debut < 0) throw new Error("`callbacksNoeud` introuvable dans App.tsx");
  const t = code(src.slice(debut));
  return morceaux(corps(t, t.indexOf("({") + 1), ",").map((m) => {
    const cle = m.match(/^([A-Za-z_$][\w$]*)\s*:/);
    if (!cle) throw new Error(`callbacksNoeud : une entrée que le garde ne sait pas lire, « ${m} »`);
    return cle[1];
  });
}

const trie = (x: Iterable<string>) => [...x].sort();
const TYPE = interfaces(lire("ui/noeud-atelier.ts"));
const section = (nom: string) => {
  const s = TYPE.get(nom);
  if (!s) throw new Error(`section ${nom} absente de ui/noeud-atelier.ts`);
  return s.champs;
};

describe("le type d'un nœud, tenu à ses sources", () => {
  it("DonneesNoeud NE NOMME AUCUN CHAMP EN PROPRE : il étend les quatre sections, et rien d'autre", () => {
    const d = TYPE.get("DonneesNoeud");
    expect(d, "DonneesNoeud doit être une interface de ui/noeud-atelier.ts").toBeDefined();
    expect(d!.champs, "Un champ nommé dans DonneesNoeud même n'a pas de classe : rangez-le dans sa section.").toEqual([]);
    expect(trie(d!.etend)).toEqual(trie(["SaisiesDuNoeud", "StructureDuNoeud", "ResultatsDuNoeud", "RappelsDuNoeud"]));
  });

  it("LES SAISIES DU TYPE SONT CELLES DE LA TABLE, ni plus ni moins", () => {
    expect(trie(section("SaisiesDuNoeud")), [
      "Une saisie se déclare dans `core/saisies.ts`, qui décide de ce qu'une copie, une remise à zéro",
      "et un projet en font ; le type la nomme ensuite. L'une sans l'autre est un champ sans règle.",
    ].join("\n")).toEqual(trie(CHAMPS_DE_SAISIE));
  });

  it("CHAQUE RÉSULTAT NOMMÉ EST DÉCLARÉ PAR CHAMPS_RESULTAT, que la remise à zéro efface", () => {
    expect(section("ResultatsDuNoeud").filter((c) => !CHAMPS_RESULTAT.has(c)),
      "Un résultat absent de CHAMPS_RESULTAT survivrait à la remise à zéro du nœud qui l'a produit.").toEqual([]);
  });

  it("LES RAPPELS DU TYPE SONT CEUX QU'App.tsx POSE, ni plus ni moins", () => {
    const poses = rappelsPoses();
    expect(poses.length, "le garde doit lire les treize rappels de callbacksNoeud").toBeGreaterThanOrEqual(13);
    expect(trie(section("RappelsDuNoeud")), [
      "Un rappel posé sur chaque nœud et absent du type oblige les vues à l'affirmer elles-mêmes ;",
      "un rappel déclaré que rien ne pose est une promesse que personne ne tient.",
    ].join("\n")).toEqual(trie(poses));
  });

  it("AUCUN RAPPEL N'EST PLUS LU SUR UN NŒUD : le nœud et ses vues lisent les gestes du contexte", () => {
    // LA FORME CHERCHÉE EST L'ACCÈS, quel que soit l'objet : `data.onX`, `d.onX` sous un alias,
    // `(data as {…}).onX` sous une affirmation de type, `n?.data.onX` — tous les chemins par lesquels
    // dix-neuf fichiers les lisaient. Seul `gestes.onX` est permis, la valeur de `useGestes()`. Les
    // treize noms sont ceux de la section du type, et non une liste écrite ici.
    const noms = section("RappelsDuNoeud").join("|");
    const acces = new RegExp(String.raw`(?<!\bgestes)(\?\.|\.)(${noms})\b`);
    const fautifs: string[] = [];
    const parcourir = (d: string) => {
      for (const n of readdirSync(d)) {
        const c = join(d, n);
        if (statSync(c).isDirectory()) { parcourir(c); continue; }
        if (!/\.tsx?$/.test(n) || /\.test\.tsx?$/.test(n)) continue;
        code(readFileSync(c, "utf8")).split("\n").forEach((ligne, i) => {
          if (acces.test(ligne)) fautifs.push(`${relative(SRC, c).replace(/\\/g, "/")}:${i + 1}`);
        });
      }
    };
    parcourir(SRC);
    expect(fautifs, [
      "Un rappel lu sur le nœud garde la fermeture du moment où le nœud a été posé, et manque à tout",
      "nœud qu'un chemin a oublié d'en munir. Lisez `useGestes()` de `ui/gestes-noeud.ts`.",
    ].join("\n")).toEqual([]);
  });

  it("LA STRUCTURE DU TYPE EST CELLE DE LA TABLE, ni plus ni moins", () => {
    expect(trie(section("StructureDuNoeud")), [
      "Un champ de structure se déclare dans CHAMPS_DE_STRUCTURE, qui dit si le projet l'écrit ;",
      "le type le nomme ensuite.",
    ].join("\n")).toEqual(trie(Object.keys(CHAMPS_DE_STRUCTURE)));
  });

  it("L'ÉTAT D'UNE PASSE N'EST PLUS DANS LE TYPE, ni le statut, ni la progression, ni la priorité", () => {
    const nommes = [...TYPE.values()].flatMap((s) => s.champs);
    expect(ETAT_HORS_DE_DATA.filter((c) => nommes.includes(c)), [
      "Le statut et la progression vivent dans ui/statuts.ts, la priorité dans ui/priorite.ts :",
      "les remettre dans data ferait réécrire tous les nœuds pour changer l'un d'eux.",
    ].join("\n")).toEqual([]);
  });

  it("AUCUN CHAMP N'EST DE DEUX CLASSES", () => {
    const vus = new Map<string, string>();
    const doubles: string[] = [];
    for (const nom of TYPE.get("DonneesNoeud")!.etend) {
      for (const c of section(nom)) {
        if (vus.has(c)) doubles.push(`${c} : ${vus.get(c)} et ${nom}`);
        vus.set(c, nom);
      }
    }
    expect(doubles).toEqual([]);
  });
});

describe("un seul type pour un nœud du canevas", () => {
  const sources: string[] = [];
  (function parcourir(d: string) {
    for (const n of readdirSync(d)) {
      const c = join(d, n);
      if (statSync(c).isDirectory()) parcourir(c);
      else if (/\.tsx?$/.test(n)) sources.push(c);
    }
  })(SRC);
  const declarations = (motif: RegExp) => sources.flatMap((f) => [...readFileSync(f, "utf8").matchAll(motif)]
    .map((m) => ({ f: relative(SRC, f).replace(/\\/g, "/"), droite: (m[1] ?? "").trim() })));

  it("DonneesNoeud N'EST DÉCLARÉ QU'UNE FOIS, dans ui/noeud-atelier.ts", () => {
    const d = declarations(/^[ \t]*(?:export[ \t]+)?(?:interface|type)[ \t]+DonneesNoeud\b/gm);
    expect(d.map((x) => x.f)).toEqual(["ui/noeud-atelier.ts"]);
  });

  it("NoeudAtelier N'A QU'UNE DÉFINITION, et les alias en any ne font que disparaître", () => {
    const d = declarations(/^[ \t]*(?:export[ \t]+)?type[ \t]+NoeudAtelier[ \t]*=[ \t]*([^;\n]+)/gm);
    expect(d.filter((x) => x.droite !== "any").map((x) => x.f)).toEqual(["ui/noeud-atelier.ts"]);
    expect(trie(d.filter((x) => x.droite === "any").map((x) => x.f)), [
      "Un alias `type NoeudAtelier = any` a été ajouté, ou l'un d'eux a disparu : un nouveau cache ce",
      "que le type déclare, et un disparu doit sortir d'ALIAS_EN_ANY.",
    ].join("\n")).toEqual(trie(ALIAS_EN_ANY));
    expect(declarations(/^[ \t]*(?:export[ \t]+)?interface[ \t]+NoeudAtelier\b/gm)).toEqual([]);
  });
});
