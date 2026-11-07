// electron/fichiers-entiers-ipc.test.ts — Un handler IPC ne lit ni n'écrit un fichier entier d'un bloc.
//
// POURQUOI CETTE RÈGLE. Le processus principal sert la fenêtre, les menus et tous les IPC. Un
// `readFileSync` de 258 Mo le rendait sourd jusqu'à 411 ms, relevé le 2026-11-07 : neuf handlers
// lisaient ou écrivaient ainsi des fichiers entiers, et sont passés par `fs.promises` (PR 306). Ce
// test empêche qu'un dixième revienne. Il complète `politique-non-bloquante.test.ts`, qui ne vise que
// les lancements de processus et les IPC synchrones.
//
// CE QU'IL REGARDE, ET CE QU'IL NE REGARDE PAS. Le corps de chaque `ipcMain.handle(` et
// `ipcMain.on(` des fichiers d'`electron/`, découpé en comptant les parenthèses hors des chaînes et
// des commentaires. Il y cherche les quatre appels qui prennent un fichier entier d'un bloc. Il ne
// suit pas une fonction appelée par le handler : un appel synchrone caché dans une aide passerait.
// Les vérifications d'existence, les créations de dossier et les lectures de répertoire, brèves,
// ne sont pas visées.
//
// UNE EXCEPTION SE DÉCLARE, elle ne se devine pas : l'une des trois lignes précédentes porte
// `// fichier entier accepté : <raison>`, et leur nombre est compté ici à la main.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const DOSSIER = resolve(__dirname);
const APPELS = /\b(readFileSync|writeFileSync|copyFileSync|appendFileSync)\s*\(/;
const OUVERTURE = /\bipcMain\.(handle|on)\s*\(/g;
const MARQUEUR = /\/\/\s*fichier entier accepté\s*:\s*\S/;

/** L'indice de la parenthèse qui ferme celle ouverte en `debut`, hors chaînes et commentaires. */
function fermeture(source: string, debut: number): number {
  let profondeur = 0;
  for (let i = debut; i < source.length; i++) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") { i = source.indexOf("\n", i); if (i < 0) return -1; continue; }
    if (c === "/" && source[i + 1] === "*") { i = source.indexOf("*/", i + 2) + 1; continue; }
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < source.length && source[i] !== c; i++) if (source[i] === "\\") i++;
      continue;
    }
    if (c === "(") profondeur++;
    else if (c === ")" && --profondeur === 0) return i;
  }
  return -1;
}

interface Handler { fichier: string; canal: string; debut: number; fin: number; lignes: string[]; premiere: number }

function handlers(): Handler[] {
  const out: Handler[] = [];
  for (const f of readdirSync(DOSSIER).filter((x) => x.endsWith(".cjs"))) {
    const source = readFileSync(resolve(DOSSIER, f), "utf8");
    for (const m of source.matchAll(OUVERTURE)) {
      const parenthese = m.index! + m[0].length - 1;
      const fin = fermeture(source, parenthese);
      const canal = /^\(\s*["'`]([^"'`]+)/.exec(source.slice(parenthese, parenthese + 120))?.[1] ?? "?";
      const premiere = source.slice(0, m.index).split("\n").length;
      out.push({ fichier: f, canal, debut: m.index!, fin, lignes: source.slice(m.index, fin + 1).split("\n"), premiere });
    }
  }
  return out;
}

interface Infraction { ou: string; canal: string; texte: string; acceptee: boolean }

function infractions(): Infraction[] {
  const out: Infraction[] = [];
  for (const h of handlers()) {
    h.lignes.forEach((ligne, i) => {
      if (/^\s*(\/\/|\*)/.test(ligne) || !APPELS.test(ligne)) return;
      const precedentes = h.lignes.slice(Math.max(0, i - 3), i);
      out.push({
        ou: `${h.fichier}:${h.premiere + i}`, canal: h.canal, texte: ligne.trim().slice(0, 100),
        acceptee: precedentes.some((l) => MARQUEUR.test(l)),
      });
    });
  }
  return out;
}

describe("les handlers IPC et les fichiers entiers", () => {
  it("découpe bien chaque handler, sans qu'un corps déborde sur le suivant", () => {
    const tous = handlers();
    expect(tous.length, "aucun handler trouvé : la lecture est cassée").toBeGreaterThan(60);
    expect(tous.filter((h) => h.fin < 0).map((h) => h.canal), "un handler ne se referme pas").toEqual([]);
    const parFichier = new Map<string, Handler[]>();
    for (const h of tous) parFichier.set(h.fichier, [...(parFichier.get(h.fichier) ?? []), h]);
    for (const liste of parFichier.values()) {
      for (let i = 1; i < liste.length; i++) {
        expect(liste[i - 1].fin, `« ${liste[i - 1].canal} » déborde sur « ${liste[i].canal} »`).toBeLessThan(liste[i].debut);
      }
    }
  });

  it("ne lit ni n'écrit un fichier entier d'un bloc, sauf exception déclarée", () => {
    const fautes = infractions().filter((f) => !f.acceptee);
    expect(fautes.map((f) => `${f.ou} « ${f.canal} » — ${f.texte}`),
      fautes.length === 0 ? "" :
      "Passez par `fs.promises`, ou déclarez l'exception par « // fichier entier accepté : <raison> ».")
      .toEqual([]);
  });

  it("garde les exceptions comptées : une liste qui grossit doit se voir", () => {
    const acceptees = infractions().filter((f) => f.acceptee);
    expect(acceptees.map((f) => `${f.ou} « ${f.canal} »`)).toHaveLength(EXCEPTIONS_ATTENDUES);
  });
});

/**
 * Le nombre d'exceptions déclarées, écrit à la main : le faire monter est une décision.
 *
 * QUATRE, CELLES DE PYTHON ET DE JULIA, décidées par Fabien le 2026-11-07 : leur chemin
 * d'exécutable et le script tapé dans le nœud s'écrivent en synchrone, et ces deux familles restent
 * telles quelles, comme leurs sondes au lancement. Ce sont de petits fichiers.
 */
const EXCEPTIONS_ATTENDUES = 4;
