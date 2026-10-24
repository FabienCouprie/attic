// scripts/imports-declares.test.ts — Un paquet importé sans être déclaré ne tient qu'à un hasard.
//
// CE QUE CE FICHIER GARDE, ET CE QUI L'A RENDU NÉCESSAIRE. Deux paquets étaient importés par des
// scripts du dépôt sans figurer nulle part dans `package.json` : `sharp` dans
// `scripts/generate-icon.cjs` et `tar` dans `scripts/download-vosk-models.cjs`. Ils marchaient
// parce que npm les avait hissés à la racine de `node_modules` depuis des dépendances indirectes,
// `@huggingface/transformers` pour le premier, `electron-builder` et `onnxruntime-node` pour le
// second. Relevé en remontant l'arbre : aucun des deux n'était à nous.
//
// POURQUOI C'EST UNE FAUTE ET NON UNE COMMODITÉ. Le jour où `electron-builder` cesse de dépendre
// de `tar`, ou le hisse ailleurs, le script tombe. Et celui-là tourne au `postinstall`, derrière
// un drapeau `--tolerant` qui avale son échec : l'installation paraîtrait réussie, et il manquerait
// des modèles. Rien dans l'ordre de vérification ne l'aurait dit, puisque ces fichiers sont en
// CommonJS, que `tsconfig` ne couvre pas.
//
// L'AUTRE SENS EST GARDÉ À PART, dans `arbre-des-dependances.test.ts` : celui-là vérifie que tout
// ce qui est déclaré est installé. Les deux fautes sont symétriques et n'ont pas la même cause.
//
// LES COMMENTAIRES SONT RETIRÉS AVANT DE LIRE, par un automate et non par une expression. Le dépôt
// contient plusieurs commentaires qui montrent du code, `import("x")` compris, et les compter pour
// des imports donnait cinq fausses alertes sur sept.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { builtinModules } from "module";

const RACINE = process.cwd();
const DOSSIERS = ["src", "electron", "scripts", "tests-e2e"];
const EXTENSIONS = /\.(ts|tsx|js|cjs|mjs)$/;
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

/** La grammaire d'un nom de paquet npm. Ce qui n'y répond pas n'est pas un paquet. */
const NOM_NPM = /^(?:@[a-z0-9~][a-z0-9-._~]*\/)?[a-z0-9~][a-z0-9-._~]*$/;

/** La marque qui remplace une chaîne dans le code découpé. Elle ne peut pas être écrite à la main. */
const MARQUE = "\u0001";

/**
 * La source découpée : son code d'un côté, ses chaînes de l'autre.
 *
 * UN AUTOMATE PLUTÔT QU'UNE EXPRESSION, parce qu'une expression ne sait pas si un `//` est un
 * commentaire ou le milieu d'une adresse, ni si un guillemet est ouvert.
 *
 * ET LES CHAÎNES SORTENT DU CODE, ce qui est le point décisif. Un spécificateur est une chaîne,
 * mais une chaîne peut aussi CONTENIR du code : ce fichier même porte `import("...")` dans ses
 * exemples, et les compter pour des imports faisait tomber le garde sur lui-même. Chaque chaîne
 * est donc remplacée par une marque numérotée, et seule celle qui suit un `from`, un `import(` ou
 * un `require(` du code est relue.
 *
 * LES GABARITS SONT TRAITÉS COMME DES CHAÎNES ENTIÈRES, interpolations comprises. Un import écrit
 * dans un `${}` échapperait donc au relevé ; le dépôt n'en contient pas, et un import qu'on
 * assemble à l'exécution n'est de toute façon pas un import déclarable.
 */
export function decouper(source: string): { code: string; chaines: string[] } {
  const chaines: string[] = [];
  let code = "";
  let i = 0;
  while (i < source.length) {
    const c = source[i], d = source[i + 1];
    if (c === "/" && d === "/") { while (i < source.length && source[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i += 2; code += " "; continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const guillemet = c;
      let contenu = "";
      i++;
      while (i < source.length) {
        if (source[i] === "\\") { contenu += source[i + 1] ?? ""; i += 2; continue; }
        if (source[i] === guillemet) { i++; break; }
        contenu += source[i];
        i++;
      }
      code += `"${MARQUE}${chaines.length}${MARQUE}"`;
      chaines.push(contenu);
      continue;
    }
    code += c; i++;
  }
  return { code, chaines };
}

const MOTIFS = [
  /^[ \t]*(?:import|export)\b[\s\S]{0,500}?\bfrom\s*["']([^"']+)["']/gm,
  /^[ \t]*import\s+["']([^"']+)["']/gm,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

/**
 * Le nom du paquet qu'un spécificateur désigne, ou néant quand il n'en désigne aucun.
 *
 * Ce qui est écarté : les chemins relatifs et absolus, les modules de Node, et ce que Vite ajoute
 * après un point d'interrogation. Un sous-chemin est ramené à son paquet, portée comprise.
 */
export function nomDePaquet(specifieur: string): string | null {
  const sans = specifieur.split("?")[0];
  if (!sans || sans.startsWith(".") || sans.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(sans)) return null;
  if (BUILTINS.has(sans) || BUILTINS.has(sans.split("/")[0])) return null;
  const bouts = sans.split("/");
  const nom = sans.startsWith("@") ? bouts.slice(0, 2).join("/") : bouts[0];
  return NOM_NPM.test(nom) ? nom : null;
}

/**
 * Les spécificateurs de paquet qu'une source importe, TELS QU'ILS SONT ÉCRITS.
 *
 * Le sous-chemin est gardé — `tonal/note` et non `tonal` —, parce que l'optimiseur de dépendances
 * de Vite travaille par spécificateur : pré-assembler `tonal` ne couvre pas `tonal/note`, qu'il
 * découvrirait alors en servant le graphe.
 *
 * ET LA QUESTION DE VITE EST GARDÉE AUSSI. `?url`, `?worker`, `?raw` changent la nature de l'import :
 * ce n'est plus un module mais une adresse ou un texte, et l'optimiseur n'y touche jamais. La
 * retirer faisait prendre `libpd-wasm/assets/libpd-worklet.js?url` pour un module à pré-assembler.
 */
export function specificateursImportes(source: string): string[] {
  const { code, chaines } = decouper(source);
  const vus = new Set<string>();
  for (const motif of MOTIFS) {
    for (const m of code.matchAll(motif)) {
      const rang = Number(m[1].replaceAll(MARQUE, ""));
      if (!Number.isInteger(rang) || chaines[rang] === undefined) continue;
      const brut = chaines[rang];
      if (nomDePaquet(brut)) vus.add(brut);
    }
  }
  return [...vus].sort();
}

/** Les extensions qu'un module JavaScript porte. Le reste est un actif, servi tel quel. */
const EXT_MODULE = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json"]);

/**
 * Un spécificateur que l'optimiseur de dépendances peut pré-assembler.
 *
 * CE QUI N'EN EST PAS, et qui l'a fait crier à tort : une CSS (`@xyflow/react/dist/style.css`), et
 * tout import portant une question de Vite — quatre `?url` de worklets dans `pure-data.ts`. Ni l'une
 * ni les autres ne passent par l'optimiseur, et les déclarer n'aurait rien voulu dire.
 */
export function estModule(spec: string): boolean {
  if (spec.includes("?")) return false;
  const ext = /\.[A-Za-z0-9]+$/.exec(spec)?.[0].toLowerCase();
  return !ext || EXT_MODULE.has(ext);
}

/** Tous les paquets qu'une source importe, par quelque forme que ce soit. */
export function paquetsImportes(source: string): string[] {
  return [...new Set(specificateursImportes(source).map((s) => nomDePaquet(s) as string))].sort();
}

function fichiersDe(dossier: string, vus: string[] = []): string[] {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) { fichiersDe(chemin, vus); continue; }
    if (EXTENSIONS.test(entree.name)) vus.push(chemin);
  }
  return vus;
}

const SOURCES = [
  ...DOSSIERS.flatMap((d) => fichiersDe(join(RACINE, d))),
  ...readdirSync(RACINE)
    .filter((f) => EXTENSIONS.test(f) && statSync(join(RACINE, f)).isFile())
    .map((f) => join(RACINE, f)),
];

const PAQUET = JSON.parse(readFileSync(join(RACINE, "package.json"), "utf8")) as
  Record<string, Record<string, string> | undefined>;
const DECLAREES = new Set([
  ...Object.keys(PAQUET.dependencies ?? {}),
  ...Object.keys(PAQUET.devDependencies ?? {}),
]);

/** Chaque paquet importé, et les fichiers qui l'importent. */
const PAR_PAQUET = new Map<string, string[]>();
/** Le même relevé, au spécificateur près : c'est l'unité de l'optimiseur de dépendances. */
const PAR_SPEC = new Map<string, string[]>();
for (const fichier of SOURCES) {
  const source = readFileSync(fichier, "utf8");
  const ou = relative(RACINE, fichier).replace(/\\/g, "/");
  for (const nom of paquetsImportes(source)) {
    PAR_PAQUET.set(nom, [...(PAR_PAQUET.get(nom) ?? []), ou]);
  }
  for (const spec of specificateursImportes(source)) {
    PAR_SPEC.set(spec, [...(PAR_SPEC.get(spec) ?? []), ou]);
  }
}

describe("les imports et les déclarations", () => {
  it("N'IMPORTE RIEN QUI NE SOIT DÉCLARÉ, car le reste ne tient qu'au hissage de npm", () => {
    const orphelins = [...PAR_PAQUET.entries()]
      .filter(([nom]) => !DECLAREES.has(nom))
      .map(([nom, ou]) => `${nom} — importé par ${ou.join(", ")}`)
      .sort();
    expect(orphelins, [
      "Ces paquets sont importés sans figurer dans package.json :",
      orphelins.join("\n"),
      "Ils ne marchent que parce qu'une dépendance indirecte les a hissés à la racine de",
      "node_modules. Le jour où elle cesse d'en dépendre, le code tombe. Les déclarer.",
    ].join("\n")).toEqual([]);
  });

  // UN PAQUET NON DÉCLARÉ À L'OPTIMISEUR FAIT RECHARGER LA PAGE EN PLEINE MESURE.
  //
  // `optimizeDeps.include` en déclarait NEUF là où l'optimiseur en pré-assemble QUARANTE. Les
  // trente et une autres, le serveur de développement les découvrait EN SERVANT le graphe, et une
  // découverte en route lui fait forcer un rechargement complet : `Forced re-optimization of
  // dependencies`. Mesuré le 2026-10-24 sur onze passes à serveur froid — quatre vertes au repos,
  // DEUX ROUGES SUR QUATRE après une compilation, trois vertes sur trois les dépendances
  // pré-assemblées d'avance. L'échec se lisait « Execution context was destroyed, most likely
  // because of a navigation », ou bien un composant ressortait sans son.
  //
  // LA RÈGLE PORTE SUR LE CLIENT SEUL. `electron/`, `scripts/` et `tests-e2e/` ne passent pas par
  // le serveur de développement, et les `.test.ts` de `src/` non plus : ils n'entrent pas dans le
  // graphe que Vite sert. Un paquet qu'eux seuls importent n'a rien à déclarer ici.
  //
  // DÉCLARER, C'EST L'UN OU L'AUTRE. `exclude` compte autant qu'`include` : des paquets y sont
  // exclus avec leur raison mesurée — pré-assemblé, `@csound/browser` empêche l'application de
  // démarrer, et `vosk-browser` ne pose plus son global. Ce qui compte est qu'un choix ait été fait.
  //
  // ET LA RÈGLE PORTE SUR LE SPÉCIFICATEUR, NON SUR LE PAQUET. C'est l'unité de l'optimiseur :
  // pré-assembler `react` ne couvre pas `react/jsx-runtime`. Écrite au paquet, la règle laissait
  // passer un défaut planté — retirer `"react"` d'`include` ne la faisait pas tomber, puisque
  // `react/jsx-runtime` s'y ramenait. `exclude`, lui, se lit au PAQUET : exclure un paquet exclut
  // tous ses sous-chemins.
  it("DÉCLARE À L'OPTIMISEUR TOUT CE QUE LE CLIENT IMPORTE, sans quoi Vite recharge la page", async () => {
    const { audioOptimizeDeps } = await import("../src/audio/build-plugins");
    const inclus = new Set((audioOptimizeDeps.include as string[]).map((s) => s.split("?")[0]));
    const exclus = new Set((audioOptimizeDeps.exclude as string[]).map((s) => nomDePaquet(s) ?? s));
    const duClient = (f: string) => f.startsWith("src/") && !/\.test\.tsx?$/.test(f);
    const absents: string[] = [];
    for (const [spec, ou] of PAR_SPEC) {
      if (!ou.some(duClient) || !estModule(spec)) continue;
      if (inclus.has(spec) || exclus.has(nomDePaquet(spec) ?? spec)) continue;
      absents.push(`${spec} — importé par ${ou.filter(duClient).slice(0, 3).join(", ")}`);
    }
    absents.sort();
    expect(absents, [
      "Ceci est importé par le client sans être déclaré à l'optimiseur de dépendances :",
      absents.join("\n"),
      "Vite le découvrira en servant le graphe et FORCERA UN RECHARGEMENT de la page, ce qui casse",
      "toute mesure en cours. L'ajouter à `include` dans `src/audio/build-plugins.ts`, ou le paquet",
      "à `exclude` avec la raison mesurée de ne pas le pré-assembler.",
    ].join("\n")).toEqual([]);
  });

  it("lit vraiment les sources, et en trouve ce qu'on sait y être", () => {
    // Sans ce cas, une lecture qui ne rendrait rien ferait passer le précédent sans rien vérifier.
    expect(SOURCES.length).toBeGreaterThan(500);
    for (const connu of ["mediabunny", "electron-updater", "onnxruntime-node", "@huggingface/tokenizers"]) {
      expect([...PAR_PAQUET.keys()], `${connu} devrait être vu`).toContain(connu);
    }
  });

  it("ne prend pas pour un import ce qu'un commentaire montre", () => {
    // LE DÉFAUT QUE CE CAS EMPÊCHE : le dépôt commente ses propres gardes en montrant du code.
    // Sans le retrait des commentaires, cinq fausses alertes sur sept venaient de là.
    const source = [
      '// Un await import("paquet-de-commentaire") ne compte pas.',
      '/* import quoi from "autre-paquet-de-commentaire"; */',
      'import { vrai } from "paquet-reel";',
    ].join("\n");
    expect(paquetsImportes(source)).toEqual(["paquet-reel"]);
  });

  it("ne prend pas pour un import le code qu'une chaîne contient", () => {
    // ET CELUI-CI EST CELUI SUR LEQUEL LE GARDE EST TOMBÉ EN NAISSANT : ses propres exemples sont
    // des chaînes qui portent des imports, et il les comptait pour siens.
    const source = [
      'const exemple = "const x = require(\\"paquet-de-chaine\\");";',
      'const autre = `import y from "paquet-de-gabarit"`;',
      'import { vrai } from "paquet-reel";',
    ].join("\n");
    expect(paquetsImportes(source)).toEqual(["paquet-reel"]);
  });

  it("voit les quatre façons d'importer", () => {
    const source = [
      'import a from "un";',
      'export { b } from "deux";',
      'import "trois";',
      'const c = await import("quatre");',
      'const d = require("cinq");',
      'import type { E } from "six";',
    ].join("\n");
    expect(paquetsImportes(source)).toEqual(["cinq", "deux", "quatre", "six", "trois", "un"]);
  });

  it("ramène un sous-chemin à son paquet, portée comprise, et écarte ce qui n'en est pas un", () => {
    expect(nomDePaquet("tonal/note")).toBe("tonal");
    expect(nomDePaquet("@huggingface/tokenizers/dist/x.js")).toBe("@huggingface/tokenizers");
    expect(nomDePaquet("./voisin")).toBeNull();
    expect(nomDePaquet("../../ailleurs")).toBeNull();
    expect(nomDePaquet("node:fs")).toBeNull();
    expect(nomDePaquet("fs/promises")).toBeNull();
    expect(nomDePaquet("C:/absolu/ailleurs")).toBeNull();
    expect(nomDePaquet(" },")).toBeNull();
    expect(nomDePaquet("…")).toBeNull();
  });

  it("garde le paquet quand Vite ajoute sa question au spécificateur", () => {
    expect(nomDePaquet("mon-worker?worker")).toBe("mon-worker");
    expect(nomDePaquet("un-paquet/fichier.wasm?url")).toBe("un-paquet");
  });

  it("rend le spécificateur entier, sous-chemin et question comprises", () => {
    // Sans le sous-chemin, la règle de l'optimiseur ne verrait pas qu'un import profond manque ;
    // sans la question, elle prendrait un actif pour un module.
    const source = [
      'import a from "tonal/note";',
      'import b from "libpd-wasm/assets/w.js?url";',
      'import "@xyflow/react/dist/style.css";',
    ].join("\n");
    expect(specificateursImportes(source))
      .toEqual(["@xyflow/react/dist/style.css", "libpd-wasm/assets/w.js?url", "tonal/note"]);
  });

  it("NE PREND POUR UN MODULE NI UN ACTIF NI UN IMPORT À QUESTION", () => {
    // Les cinq premiers faux signalements de la règle de l'optimiseur étaient exactement ceux-là.
    expect(estModule("tonal")).toBe(true);
    expect(estModule("lamejs/src/js/Lame.js")).toBe(true);
    expect(estModule("@magenta/music/esm/protobuf")).toBe(true);
    expect(estModule("@xyflow/react/dist/style.css")).toBe(false);
    expect(estModule("libpd-wasm/assets/libpd-worklet.js?url")).toBe(false);
    expect(estModule("mon-worker?worker")).toBe(false);
    expect(estModule("un-paquet/fichier.wasm")).toBe(false);
  });
});
