// src/docs/frontiere-moteur.test.ts — L'interface ne tient pas le cache du moteur : elle lui envoie des
// commandes.
//
// POURQUOI CE TEST. Pièces P3a et P3b du plan de l'architecture par messages entre l'interface et le
// moteur. Le cache était une `Map` tenue par `App.tsx` dans une référence de React, et prêtée à treize
// fichiers de l'interface qui l'écrivaient chacun à sa façon. Il est maintenant un objet du moteur
// (`ui/moteur/cache.ts`), et l'interface ne lui parle que par les commandes du protocole
// (`ui/moteur/commandes.ts`). Rien, dans le compilateur, n'empêcherait d'y revenir : une `Map` de plus
// dans une référence, ou un import de l'objet, et tout redevient comme avant sans un rouge.
//
// IL CHERCHE UNE FORME, ET NON UN NOM. Un garde qui chercherait `cacheExec` laisserait passer la même
// table sous un autre nom ; celui-ci compte les références de React qui tiennent une `Map`, quel que
// soit leur nom, et les imports du module du cache, quel que soit ce qu'ils en tirent, types compris.
//
// ET SEUL LE RÉCEPTEUR POSE DANS LES MAGASINS, depuis la pièce P4a. La boucle d'une passe recevait la
// pose des statuts et `quandUnNoeudAFini`, et le ménage importait `poserResultat` : ils disent
// maintenant des événements au récepteur (`ui/recepteur-moteur.ts`). Le garde relève qui importe une
// pose des magasins, sous son nom, son alias ou en bloc.
//
// ET LE RÉCEPTEUR NE LIT PAS LES TABLES DU MOTEUR, depuis la pièce P4b : ce que le nœud visible
// montre est choisi au cœur et lui arrive dans les événements. Le garde relève les deux sens, par les
// modules importés : ceux qui posent n'importent aucun module qui tient ou nomme les tables d'une
// passe, et le moteur n'importe aucun des trois magasins.
//
// ET LE MOTEUR EST DANS SON DOSSIER, SANS REACT, depuis la pièce P5a : l'ordonnanceur, les pilotes de
// passes, la passe, son ménage et ses tables sont sous `ui/moteur/`. Le garde suit les imports
// TRANSITIFS, types compris, et non les seuls imports directs : `ui/statuts.ts` et `ui/resultats.ts`
// importent `react`, et un module du moteur qui importerait un fichier qui les importe passerait un
// contrôle des imports directs. Rien du dossier n'atteint React, React Flow ni les trois magasins.
//
// ET L'INTERFACE N'EN IMPORTE QUE L'INDEX, depuis la pièce P5b : le pont construit le moteur, et le
// reste lui envoie des commandes. Ni le cache, ni la passe, ni l'ordonnanceur ne s'importent hors du
// dossier, pas même pour un type.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "..");
const UI = join(SRC, "ui");
const MOTEUR = join(UI, "moteur");
const MODULE_DU_CACHE = join(MOTEUR, "cache");

/** Tous les fichiers TypeScript d'un sous-arbre, tests compris : un test qui tiendrait le cache compte aussi. */
function fichiers(dossier: string): string[] {
  const out: string[] = [];
  const parcourir = (d: string) => {
    for (const nom of readdirSync(d)) {
      const chemin = join(d, nom);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (/\.tsx?$/.test(nom)) out.push(chemin);
    }
  };
  parcourir(dossier);
  return out.sort();
}

/** Le chemin d'un fichier depuis `src/`, en barres obliques. */
const nomDe = (chemin: string) => relative(SRC, chemin).split(sep).join("/");
const estDuMoteur = (chemin: string) => chemin.startsWith(MOTEUR + sep);

/**
 * UNE RÉFÉRENCE DE REACT QUI TIENT UNE TABLE : la forme que le cache avait, sous ses trois écritures.
 * `useRef<Map<…>>(…)` et `useRef(new Map…)` la créent, `MutableRefObject<Map<…>>` la prête. Une
 * `ReadonlyMap` compte aussi.
 */
const TABLE_DANS_UNE_REFERENCE = /\b(?:useRef|MutableRefObject|RefObject)\s*(?:<\s*(?:Readonly)?Map\s*<|\(\s*new\s+Map\b)/g;

/**
 * CE QUI N'EST PAS UN CACHE, mesuré le 2026-11-18 : deux tables, chacune tenue par le composant qui
 * s'en sert et prêtée à personne. Le compte est épinglé par fichier : une table de plus, même là,
 * fait tomber le test.
 */
const TABLES_QUI_NE_SONT_PAS_LE_CACHE: Record<string, number> = {
  // Les notes que le clavier de l'inspecteur tient enfoncées, rangées par numéro MIDI.
  "ui/Inspector.tsx": 1,
  // Les minuteurs de la relance après un réglage, un par nœud réglé : ils restent à l'interface.
  "ui/hooks/useRelanceApresReglage.ts": 1,
};


/** Les quatre poses des magasins d'une passe : les importer, c'est écrire ce que l'interface montre. */
const POSES = ["poserStatut", "poserStatutOmbre", "poserResultat", "poserApercu"];
const MAGASINS = [join(UI, "statuts"), join(UI, "resultats")];

/**
 * CEUX QUI POSENT, mesuré le 2026-11-18 après la pièce P4a : le récepteur, le correctif qu'il appelle
 * pour la pose d'un nœud, et la réparation des aperçus, qu'un geste demande hors de toute passe. La
 * remise à zéro efface et ne pose pas : elle n'importe que `reinitialiserStatuts` et
 * `effacerResultats`. Le moteur, sa boucle, son ménage et ses pilotes, ne pose plus rien lui-même.
 */
const QUI_POSE = [
  "ui/correctif-resultat.ts",
  "ui/recepteur-moteur.ts",
  "ui/refaire-apercus.ts",
];

/**
 * LES MODULES QUI TIENNENT OU NOMMENT LES TABLES D'UNE PASSE : la boucle qui les remplit et le choix
 * qui les lit, au cœur. Le dossier du moteur s'y ajoute, où sont leur type et le ménage. Celui qui
 * pose n'en importe aucun, types compris : il reçoit ce qui est choisi.
 */
const TABLES_DU_MOTEUR = [
  join(SRC, "core", "execution"),
  join(SRC, "core", "rendu-du-visible"),
];

/** Les trois magasins de l'interface : le moteur n'en atteint aucun, ni pour écrire ni pour lire. */
const LES_TROIS_MAGASINS = [join(UI, "statuts"), join(UI, "resultats"), join(UI, "priorite")];

/** Les modules de React et de React Flow, sous-chemins compris : `react/jsx-runtime` en est un. */
const DE_REACT = /^(?:react|react-dom)(?:\/|$)|^@xyflow\//;

/** Le texte sans ses commentaires : un import cité pour raconter une fuite n'en est pas une. */
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/[^\n]*$/gm, "");

/** Le fichier qu'un chemin relatif désigne, extension ou index compris, ou rien. */
function resoudre(depuis: string, cible: string): string | undefined {
  const base = resolve(dirname(depuis), cible);
  return [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]
    .find((c) => existsSync(c) && statSync(c).isFile());
}

/**
 * Tout ce que ces fichiers atteignent par leurs imports, de proche en proche, types compris.
 *
 * Chaque fichier atteint garde celui qui l'a fait atteindre, et chaque module nu le premier fichier
 * qui l'importe : un rouge dit la chaîne entière, et non le seul dernier maillon.
 */
function atteints(entrees: readonly string[]) {
  const parents = new Map<string, string | undefined>(entrees.map((e) => [e, undefined]));
  const externes = new Map<string, string>();
  const aVoir = [...entrees];
  for (let f = aVoir.shift(); f !== undefined; f = aVoir.shift()) {
    for (const cible of importsDe(sansCommentaires(readFileSync(f, "utf8")))) {
      if (!cible.startsWith(".")) { if (!externes.has(cible)) externes.set(cible, f); continue; }
      const r = resoudre(f, cible);
      if (r && !parents.has(r)) { parents.set(r, f); aVoir.push(r); }
    }
  }
  const chaine = (f: string) => {
    const c: string[] = [];
    for (let x: string | undefined = f; x; x = parents.get(x)) c.unshift(nomDe(x));
    return c.join(" → ");
  };
  /** Ce qui, de ce qu'on a atteint, est React, React Flow ou l'un des trois magasins, avec sa chaîne. */
  const interdits = [
    ...[...externes].filter(([m]) => DE_REACT.test(m)).map(([m, f]) => `${m} ← ${chaine(f)}`),
    ...[...parents.keys()].filter((f) => LES_TROIS_MAGASINS.includes(f.replace(/\.tsx?$/, ""))).map(chaine),
  ];
  return { fichiers: [...parents.keys()], interdits };
}

/** Les modules qu'un fichier importe, chemins relatifs résolus, sans extension. */
const modulesImportes = (chemin: string) =>
  importsDe(readFileSync(chemin, "utf8"))
    .filter((cible) => cible.startsWith("."))
    .map((cible) => resolve(dirname(chemin), cible).replace(/\.tsx?$/, ""));

/** Les poses qu'un fichier importe des magasins : par leur nom, en bloc par `* as`, ou par `import()`. */
const posesImportees = (chemin: string) => posesDans(readFileSync(chemin, "utf8"), chemin);

/** Les poses que ce texte importe, lu comme s'il était ce fichier : c'est de lui que partent les chemins. */
function posesDans(texte: string, chemin: string): string[] {
  const versUnMagasin = (cible: string) =>
    cible.startsWith(".") && MAGASINS.includes(resolve(dirname(chemin), cible).replace(/\.tsx?$/, ""));
  const vues: string[] = [];
  for (const m of texte.matchAll(/^[ \t]*(?:import|export)[ \t]+(type[ \t]+)?([^;]*?)\s*from\s*["']([^"']+)["']/gm)) {
    if (m[1] || !versUnMagasin(m[3])) continue;
    if (/\*\s*as\s/.test(m[2])) vues.push("*");
    for (const nom of POSES) if (new RegExp(String.raw`\b${nom}\b`).test(m[2])) vues.push(nom);
  }
  for (const m of texte.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) if (versUnMagasin(m[1])) vues.push("import()");
  return vues;
}

/** Les modules qu'un fichier importe, sous toutes leurs formes : `from`, effet de bord, `import()`. */
function importsDe(texte: string): string[] {
  const motif = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm;
  return [...texte.matchAll(motif)].map((m) => m[1]);
}

/** Vrai si ce fichier importe le module du cache. */
function importeLeCache(chemin: string): boolean {
  return importsDe(readFileSync(chemin, "utf8"))
    .filter((cible) => cible.startsWith("."))
    .some((cible) => resolve(dirname(chemin), cible).replace(/\.tsx?$/, "") === MODULE_DU_CACHE);
}

describe("la frontière du cache du moteur", () => {
  it("AUCUNE RÉFÉRENCE DE REACT NE TIENT UNE TABLE DANS L'INTERFACE, hors des deux qui ne sont pas le cache", () => {
    const comptes: Record<string, number> = {};
    for (const f of fichiers(UI)) {
      if (estDuMoteur(f)) continue;
      const n = readFileSync(f, "utf8").match(TABLE_DANS_UNE_REFERENCE)?.length ?? 0;
      if (n) comptes[nomDe(f)] = n;
    }
    expect(comptes, "une table dans une référence de React : le cache se parle par `ui/moteur/commandes.ts`").toEqual(TABLES_QUI_NE_SONT_PAS_LE_CACHE);
  });

  it("SEUL LE MOTEUR IMPORTE LE MODULE DU CACHE", () => {
    const importeurs = fichiers(SRC).filter(importeLeCache);
    const horsDuMoteur = importeurs.filter((f) => !estDuMoteur(f)).map(nomDe);
    // UN RELEVÉ QUI NE VERRAIT AUCUN IMPORTEUR SERAIT VERT POUR RIEN : la passe et le ménage en sont.
    expect(importeurs.filter(estDuMoteur).length).toBeGreaterThanOrEqual(3);
    expect(horsDuMoteur, "hors du moteur, on envoie des commandes : `ui/moteur/commandes.ts`").toEqual([]);
  });

  it("SEUL LE RÉCEPTEUR ET CE QU'IL APPELLE POSENT DANS LES MAGASINS : le moteur leur dit des événements", () => {
    const poseurs = fichiers(SRC)
      .filter((f) => !/\.test\.tsx?$/.test(f) && posesImportees(f).length > 0)
      .map(nomDe);
    expect(poseurs, "hors du récepteur, on émet : `ui/recepteur-moteur.ts`").toEqual(QUI_POSE);
  });

  it("CEUX QUI POSENT NE LISENT PAS LES TABLES DU MOTEUR : ce que le nœud visible montre leur est dit", () => {
    const lus: Record<string, string[]> = {};
    for (const f of QUI_POSE) {
      const vus = modulesImportes(join(SRC, f)).filter((m) => TABLES_DU_MOTEUR.includes(m) || m.startsWith(MOTEUR + sep));
      if (vus.length) lus[f] = vus.map(nomDe);
    }
    expect(lus, "le choix des valeurs est au cœur, `core/rendu-du-visible.ts`, et arrive par les événements").toEqual({});
  });

  it("RIEN DU DOSSIER DU MOTEUR N'ATTEINT REACT, REACT FLOW NI LES TROIS MAGASINS, de proche en proche", () => {
    const moteur = fichiers(MOTEUR).filter((f) => !/\.test\.tsx?$/.test(f));
    const { fichiers: vus, interdits } = atteints(moteur);
    // UN RELEVÉ QUI NE VERRAIT RIEN SERAIT VERT POUR RIEN : le moteur compte sept modules, la passe
    // et l'ordonnanceur compris, et il atteint le cœur bien au-delà.
    for (const f of ["passe", "pilotes", "ordonnanceur-runs", "menage-apres-passe"]) {
      expect(moteur.map(nomDe), `ui/moteur/${f}.ts doit être relevé`).toContain(`ui/moteur/${f}.ts`);
    }
    expect(vus.length).toBeGreaterThan(moteur.length * 3);
    expect(interdits, "le moteur dit ce qu'il fait : `ui/recepteur-moteur.ts` pose, et le pont est à React").toEqual([]);
  });

  it("HORS DU DOSSIER DU MOTEUR, ON N'IMPORTE QUE SON INDEX, types compris", () => {
    // PIÈCE P5B : le pont construit le moteur, et le reste de l'interface lui envoie des commandes. Ce
    // que l'interface en connaît est dans `ui/moteur/index.ts`, et rien d'autre du dossier : ni le
    // cache, ni la passe, ni l'ordonnanceur.
    const INDEX = join(MOTEUR, "index");
    const importes = new Map<string, string[]>();
    let versLIndex = 0;
    for (const f of fichiers(SRC)) {
      if (estDuMoteur(f)) continue;
      for (const m of modulesImportes(f)) {
        if (m === INDEX || m === MOTEUR) { versLIndex++; continue; }
        if (m.startsWith(MOTEUR + sep)) importes.set(nomDe(f), [...(importes.get(nomDe(f)) ?? []), nomDe(m)]);
      }
    }
    // UN RELEVÉ QUI NE VERRAIT AUCUN IMPORT DU MOTEUR SERAIT VERT POUR RIEN : le pont et ceux qui envoient
    // des commandes passent par l'index.
    expect(versLIndex).toBeGreaterThanOrEqual(10);
    expect(Object.fromEntries(importes), "on importe `ui/moteur`, son index, et rien d'autre du dossier").toEqual({});
  });

  it("le relevé transitif voit React derrière un intermédiaire, et le magasin qui y mène", () => {
    // `ui/oubli-noeuds.ts` n'importe pas React ; il importe le magasin des résultats, qui l'importe.
    const texte = readFileSync(join(UI, "oubli-noeuds.ts"), "utf8");
    expect(importsDe(sansCommentaires(texte)).some((m) => DE_REACT.test(m)), "le témoin doit rester indirect").toBe(false);
    const { interdits } = atteints([join(UI, "oubli-noeuds.ts")]);
    expect(interdits).toContain("react ← ui/oubli-noeuds.ts → ui/resultats.ts");
    expect(interdits).toContain("ui/oubli-noeuds.ts → ui/resultats.ts");
  });

  it("le motif des poses voit le nom, l'alias, le bloc et l'import dynamique, et laisse le type et l'effacement", () => {
    const vues = (texte: string) => posesDans(texte, join(UI, "essai.ts"));
    expect(vues(`import { poserStatut as poser, statutDe } from "./statuts";`)).toEqual(["poserStatut"]);
    expect(vues(`import {\n  effacerResultats,\n  poserResultat,\n} from "./resultats";`)).toEqual(["poserResultat"]);
    expect(vues(`import * as magasin from "./statuts";`)).toEqual(["*"]);
    expect(vues(`const m = await import("./resultats");`)).toEqual(["import()"]);
    expect(vues(`import type { poserApercu } from "./statuts";`)).toEqual([]);
    expect(vues(`import { reinitialiserStatuts, poserStatutOmbre } from "./statuts";`)).toEqual(["poserStatutOmbre"]);
    expect(vues(`import { poserStatut } from "../core/statuts-de-passe";`)).toEqual([]);
  });

  it("le motif voit les trois écritures d'une table dans une référence, et pas une table seule", () => {
    const vus = (s: string) => s.match(TABLE_DANS_UNE_REFERENCE)?.length ?? 0;
    expect(vus("const c = useRef<Map<string, any>>(new Map());")).toBe(1);
    expect(vus("const c = useRef(new Map<string, number>());")).toBe(1);
    expect(vus("cache: MutableRefObject<ReadonlyMap<string, X>>;")).toBe(1);
    expect(vus("const m = new Map<string, number>(); const r = useRef<number>(0);")).toBe(0);
  });

  it("l'import se voit sous ses formes, type et import dynamique compris", () => {
    expect(importsDe(`import type { CacheDuMoteur } from "../moteur/cache";`)).toEqual(["../moteur/cache"]);
    expect(importsDe(`import "./moteur/cache";`)).toEqual(["./moteur/cache"]);
    expect(importsDe(`const m = await import("../moteur/cache");`)).toEqual(["../moteur/cache"]);
    expect(importsDe(`export { creerCacheDuMoteur } from "./cache";`)).toEqual(["./cache"]);
  });
});
