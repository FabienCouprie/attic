// tests-e2e/partition-piano-dans-application.spec.ts — « Partition piano » puis « SVG vers PDF », dans
// l'application construite : la gravure relue dans le nœud, et le PDF écrit relu.
//
// POURQUOI CETTE ÉPREUVE EST ICI. « Partition piano » a été demandée le 2026-11-23, avec les mêmes entrées
// et la même sortie que « Partition gravée », pour se brancher sur « SVG vers PDF », dont l'impression se
// fait dans le processus principal, par le Chromium d'Electron : aucun test unitaire ne voit la chaîne
// entière. Le graphe est celui-là : un ABC à une seule voix, gravé pour piano, dont la sortie « Fichier
// SVG » entre dans « SVG vers PDF ».
//
// CE QU'ELLE EXIGE :
//   — DANS LE NŒUD, la gravure affichée : l'accolade, la clé de sol puis la clé de fa, et le nombre de
//     notes de chaque portée que la main calcule. Le menuet par la main : la mélodie à droite, ré do si la
//     sol fa♯, et le si sol de l'accord final, huit notes ; les trois accords de trois sons et le sol ré de
//     l'accord final à gauche, onze. La ligne mi ré do si la si do ré mi fa sol au point fixe du do 4 :
//     si la si à gauche, trois notes ; les huit autres à droite ;
//   — DANS LE PDF, une page A4, le titre, en tête de page et dans les propriétés du document, et des
//     tracés : les lignes des deux portées, l'accolade, les hampes et les glyphes.
//
// UN PROFIL JETABLE, TOUJOURS. Le répertoire de travail d'une application non empaquetée est `work/`
// de la racine, ignoré par git : les PDF y sont écrits, puis effacés.
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";

import { etatDesNoeuds, semerEtLancer } from "./pilote-graphe";
import { effacerProfil, profilAvec } from "./demarrage-electron";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const TRAVAIL = join(RACINE, "work");

const MENUET = "X:1\nT:Menuet\nM:3/4\nL:1/4\nK:G\n[G,,B,,D,] d c | [C,E,G,] B A | [D,^F,A,] G F | [G,,D,B,G]3 |]";
const LIGNE = "X:1\nT:Ligne\nM:4/4\nL:1/4\nK:C\nE D C B, | A, B, C D | E F G2 |]";
const TITRE = "Menuet pour piano, épreuve";

/** Le graphe : la gravure pour piano, son fichier SVG sur « SVG », et le titre branché. */
function graphe(nom: string, abc: string, reglages: Record<string, string | number>): string {
  return JSON.stringify({
    nodes: [
      { id: "piano", position: { x: 80, y: 60 }, data: { ficheId: "partition-piano", parametres: { Notation: abc, ...reglages } } },
      { id: "titre", position: { x: 80, y: 520 }, data: { ficheId: "source-texte", parametres: { Texte: TITRE } } },
      { id: "pdf", position: { x: 700, y: 120 }, data: { ficheId: "svg-vers-pdf", parametres: { Nom: nom } } },
    ],
    edges: [
      { id: "e-svg", source: "piano", target: "pdf", sourceHandle: "out:1", targetHandle: "in:0" },
      { id: "e-titre", source: "titre", target: "pdf", sourceHandle: "out:0", targetHandle: "in:1" },
    ],
  });
}

/** Le PDF relu : son texte et ses propriétés par le lecteur du dépôt, sa page et ses tracés par ses octets. */
async function lirePdf(chemin: string) {
  const dossier = dirname(createRequire(import.meta.url).resolve("@firecrawl/pdf-inspector-wasm"));
  const mod = await import(pathToFileURL(join(dossier, "pdf_inspector_wasm.js")).href);
  await mod.default({ module_or_path: readFileSync(join(dossier, "pdf_inspector_wasm_bg.wasm")) });
  const octets = readFileSync(chemin);
  const lu = mod.processPdf(new Uint8Array(octets)) as { markdown: string; pageCount: number; title: string };
  const brut = octets.toString("latin1");
  const boite = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(brut);
  const traces = { courbes: 0, deplacements: 0 };
  for (const m of brut.matchAll(/stream\r?\n/g)) {
    const debut = m.index! + m[0].length;
    const fin = brut.indexOf("endstream", debut);
    let flux = "";
    try { flux = inflateSync(octets.subarray(debut, fin)).toString("latin1"); } catch { continue; }
    traces.courbes += (flux.match(/\sc(?=\s)/g) ?? []).length;
    traces.deplacements += (flux.match(/\sm(?=\s)/g) ?? []).length;
  }
  return {
    entete: brut.slice(0, 5), pages: lu.pageCount, texte: lu.markdown.replace(/\s+/g, " "), titre: lu.title,
    mm: boite ? [Number(boite[1]) * 25.4 / 72, Number(boite[2]) * 25.4 / 72] : null, ...traces,
  };
}

/** La gravure affichée dans le nœud : les notes de chaque portée, les clés, l'accolade. */
async function gravureDuNoeud(page: Page, id: string) {
  return await page.evaluate((id) => {
    const svg = document.querySelector(`[data-id="${id}"] .attic-node-vue-gravure-inner svg`);
    if (!svg) return null;
    const classe = (e: Element) => (e.getAttribute("class") ?? "").split(" ")[0];
    const groupes = [...svg.querySelectorAll("g")];
    const notes = [0, 0];
    for (const mesure of groupes.filter((g) => classe(g) === "measure")) {
      [...mesure.children].filter((g) => classe(g) === "staff").forEach((staff, k) => {
        notes[k] += [...staff.querySelectorAll("g")].filter((g) => classe(g) === "note").length;
      });
    }
    const cles = groupes.filter((g) => classe(g) === "clef").flatMap((g) => [...g.querySelectorAll("use")]
      .map((u) => (u.getAttribute("xlink:href") ?? u.getAttribute("href") ?? "").replace(/^#/, "").split("-")[0]));
    return { notes, cles, accolade: groupes.some((g) => classe(g) === "grpSym") };
  }, id);
}

test.describe("SVG vers PDF, derrière Partition piano, dans l'application", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.setTimeout(300_000);

  let profil = "";
  let app: ElectronApplication;
  let page: Page;
  const ecrits: string[] = [];

  test.beforeAll(async () => {
    profil = profilAvec(null);
    app = await electron.launch({ args: [RACINE, `--user-data-dir=${profil}`], cwd: RACINE, env: { ...process.env, NODE_ENV: "", ATTIC_SANS_MAJ: "1" } });
    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
    for (const f of ecrits) rmSync(f, { force: true });
    await effacerProfil(profil);
  });

  /** Sème, lance, vérifie que les deux nœuds ont fini, et rend la gravure du nœud et le PDF relu. */
  async function imprimer(nom: string, abc: string, reglages: Record<string, string | number>) {
    const chemin = join(TRAVAIL, `${nom}.pdf`);
    rmSync(chemin, { force: true });
    ecrits.push(chemin);
    await semerEtLancer(page, page.url(), graphe(nom, abc, reglages));
    const etats = await etatDesNoeuds(page);
    const piano = etats.find((n) => n.id === "piano"), pdf = etats.find((n) => n.id === "pdf");
    expect(piano?.statut, `« Partition piano » : ${piano?.cause ?? piano?.message}`).toBe("termine");
    expect(pdf?.statut, `« SVG vers PDF » : ${pdf?.cause ?? pdf?.message}`).toBe("termine");
    expect(existsSync(chemin), `le PDF doit être écrit sous ${chemin}`).toBe(true);
    return { message: piano?.message ?? "", gravure: await gravureDuNoeud(page, "piano"), pdf: await lirePdf(chemin) };
  }

  test("PAR LA MAIN : le menuet sur deux portées sous accolade, la mélodie à droite, les accords à gauche, et le PDF", async () => {
    const { message, gravure, pdf } = await imprimer(`epreuve-partition-piano-${process.pid}`, MENUET, {});
    console.log(message, JSON.stringify(gravure), JSON.stringify(pdf));
    expect(message).toContain("ABC · partage par la main · page 1 sur 1");
    expect(gravure, "la gravure affichée dans le nœud").not.toBeNull();
    expect(gravure!.accolade).toBe(true);
    expect(gravure!.cles).toEqual(["E050", "E062"]);
    expect(gravure!.notes, "huit notes à droite, onze à gauche").toEqual([8, 11]);
    expect(pdf.entete).toBe("%PDF-");
    expect(pdf.pages).toBe(1);
    expect(pdf.mm![0]).toBeCloseTo(210, 0);
    expect(pdf.texte, "le titre, en tête").toContain(TITRE);
    expect(pdf.titre, "le titre, dans les propriétés").toBe(TITRE);
    expect(pdf.courbes, "l'accolade et les glyphes, en courbes").toBeGreaterThan(30);
    expect(pdf.deplacements, "les deux portées, les hampes et les barres").toBeGreaterThan(20);
  });

  test("AU POINT FIXE DU DO 4 : la ligne change de portée sous lui", async () => {
    const { message, gravure, pdf } = await imprimer(`epreuve-partition-piano-fixe-${process.pid}`, LIGNE, { Partage: "fixe" });
    console.log(message, JSON.stringify(gravure), JSON.stringify(pdf));
    expect(message).toContain("ABC · partage au C4 · page 1 sur 1");
    expect(gravure!.notes, "si la si à gauche, les huit autres à droite").toEqual([8, 3]);
    expect(pdf.pages).toBe(1);
  });
});
