// workers/graphe-imports.test.ts — Ce qu'un worker a le droit d'importer.
//
// CE QUI EST ARRIVÉ, ET QUE CE TEST EMPÊCHE DE REVENIR. Un import ajouté dans `magenta-helpers.ts`
// — une fonction de comparaison de douze lignes — a fait entrer `audio/midi.ts` dans le graphe du
// worker Magenta, et avec lui `i18n.tsx`. Or Vite équipe tout module `.tsx` du préambule de React
// Fast Refresh en développement, lequel touche `window` : dans un worker, `window` n'existe pas au
// moment où les imports sont évalués — le shim `self.window = self` posé en tête du worker arrive
// trop tard, les imports d'un module ES étant évalués AVANT son corps.
//
// Le worker mourait donc à l'import, ne postait plus rien, et les SEPT nœuds Magenta restaient
// « en cours » indéfiniment : aucune erreur, aucun message, rien à lire. Un import de trop, invisible
// à la compilation comme aux tests, et toute une famille de nœuds hors service.
//
// Le graphe est parcouru À LA LECTURE DES FICHIERS, sans rien exécuter : c'est ce qui permet de
// l'éprouver hors d'un navigateur.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const RACINE = resolve(__dirname, "..");

/** Les spécificateurs importés par un fichier — `import … from "x"`, `import "x"`, `import("x")`. */
function specificateurs(source: string): string[] {
  const out: string[] = [];
  const motifs = [
    /\bimport\s+[^"';]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bexport\s+[^"';]*?\bfrom\s*["']([^"']+)["']/g,
  ];
  for (const m of motifs) for (const r of source.matchAll(m)) out.push(r[1]);
  return out;
}

/** Le fichier désigné par un import relatif, extension devinée comme le ferait le bundler. */
function resoudre(depuis: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null; // paquet npm : hors du code d'Attic
  const base = resolve(dirname(depuis), spec);
  for (const essai of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existsSync(essai) && !essai.endsWith("/")) {
      // Un dossier existant n'est pas un module : on continue vers son index.
      try { if (readFileSync(essai).length >= 0 && !essai.endsWith(".ts") && !essai.endsWith(".tsx")) continue; } catch { continue; }
      return essai;
    }
  }
  return null;
}

/** Tous les fichiers d'Attic qu'un point d'entrée atteint, avec le chemin qui y mène. */
function grapheDepuis(entree: string): Map<string, string[]> {
  const vus = new Map<string, string[]>([[entree, [entree]]]);
  const file = [entree];
  while (file.length) {
    const courant = file.shift()!;
    let source: string;
    try { source = readFileSync(courant, "utf8"); } catch { continue; }
    for (const spec of specificateurs(source)) {
      const cible = resoudre(courant, spec);
      if (!cible || vus.has(cible)) continue;
      vus.set(cible, [...vus.get(courant)!, cible]);
      file.push(cible);
    }
  }
  return vus;
}

const relatif = (p: string) => p.slice(RACINE.length + 1).replace(/\\/g, "/");

/** Les workers d'Attic, tels que les plugins les créent. Sherpa vit dans `public/`, hors du graphe. */
const WORKERS = [
  "magenta-worker.ts", "asr-worker.js", "image-to-text-worker.js", "kokoro-francais-worker.js",
  "kokoro-tts-worker.js", "musicgen-worker.js", "opus-worker.js", "piper-tts-worker.js",
  "textgen-worker.js", "tts-worker.js",
];

describe.each(WORKERS)("le graphe d'imports de %s", (nom) => {
  const entree = resolve(RACINE, "workers", nom);
  const graphe = grapheDepuis(entree);

  it("est bien lu — sans quoi le test ne prouverait rien", () => {
    expect(existsSync(entree), nom).toBe(true);
    expect(readFileSync(entree, "utf8").length).toBeGreaterThan(200);
  });

  it("n'atteint AUCUN module React : un `.tsx` y tue le worker à l'import", () => {
    const fautifs = [...graphe.entries()].filter(([f]) => f.endsWith(".tsx"));
    const explique = fautifs.map(([, chemin]) => chemin.map(relatif).join("\n    → ")).join("\n\n");
    expect(fautifs.map(([f]) => relatif(f)), `chaîne d'imports fautive :\n    ${explique}`).toEqual([]);
  });

  it("n'atteint ni l'internationalisation ni l'interface", () => {
    const interdits = [...graphe.entries()]
      .filter(([f]) => {
        const r = relatif(f);
        return r === "i18n.ts" || r === "i18n.tsx" || r.startsWith("ui/");
      });
    const explique = interdits.map(([, chemin]) => chemin.map(relatif).join("\n    → ")).join("\n\n");
    expect(interdits.map(([f]) => relatif(f)), `chaîne d'imports fautive :\n    ${explique}`).toEqual([]);
  });

  it("ne touche pas `window` hors d'une fonction : le shim du worker arrive après les imports", () => {
    // Le corps d'un worker peut poser `self.window = self`, mais un module importé s'évalue AVANT.
    // Un accès à `window` au premier niveau d'un module du graphe casse donc le worker, même sans
    // React — c'est la forme générale de la panne, dont le préambule de Fast Refresh n'est qu'un cas.
    const fautifs: string[] = [];
    for (const fichier of graphe.keys()) {
      if (fichier === entree) continue; // c'est lui qui pose le leurre
      const lignes = readFileSync(fichier, "utf8").split("\n");
      let profondeur = 0;
      for (const ligne of lignes) {
        const nue = ligne.replace(/\/\/.*$/, "");
        if (profondeur === 0 && /(^|[^.\w])window\s*[.[]/.test(nue)) fautifs.push(`${relatif(fichier)} : ${ligne.trim().slice(0, 80)}`);
        profondeur += (nue.match(/\{/g)?.length ?? 0) - (nue.match(/\}/g)?.length ?? 0);
        if (profondeur < 0) profondeur = 0;
      }
    }
    expect(fautifs).toEqual([]);
  });
});

describe("le worker Magenta en particulier", () => {
  const graphe = grapheDepuis(resolve(RACINE, "workers/magenta-worker.ts"));

  it("atteint bien le code d'Attic : c'est le seul worker qui en importe", () => {
    expect(graphe.size).toBeGreaterThan(5);
    expect([...graphe.keys()].map(relatif)).toContain("plugins/magenta-helpers.ts");
  });
});

describe("les enveloppes de worker", () => {
  // Tout endroit qui crée un Worker doit poser le garde-fou : sans lui, la mort du worker ne se
  // traduit par rien et le nœud attend indéfiniment — ou, quand il existe un chien de garde, annonce
  // une expiration alors que le worker était mort depuis longtemps. Aucune exception.
  const PLUGINS = resolve(RACINE, "plugins");
  const EXCEPTIONS = new Set<string>();

  it("posent toutes `installerGardeWorker` là où elles créent un worker", () => {
    const manquants: string[] = [];
    for (const f of readdirSync(PLUGINS)) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts") || EXCEPTIONS.has(f)) continue;
      const source = readFileSync(resolve(PLUGINS, f), "utf8");
      const creations = (source.match(/new Worker\(/g) ?? []).length;
      if (creations === 0) continue;
      const gardes = (source.match(/installerGardeWorker\(/g) ?? []).length;
      if (gardes < creations) manquants.push(`${f} : ${creations} worker(s), ${gardes} garde(s)`);
    }
    expect(manquants).toEqual([]);
  });
});
