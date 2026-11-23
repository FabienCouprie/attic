// tests-e2e/svg-vers-pdf-dans-application.spec.ts — « Partition gravée » puis « SVG vers PDF », dans
// l'application construite, et le PDF écrit relu.
//
// POURQUOI CETTE ÉPREUVE EST ICI. L'impression se fait dans le processus principal, par le Chromium
// d'Electron (`electron/ipc-pdf.cjs`) : aucun test unitaire ne la voit. Le graphe est celui pour
// lequel le nœud est fait : une gamme gravée par Verovio, avec un tempo, deux nuances et des paroles,
// dont la sortie « Fichier SVG » entre dans « SVG vers PDF ». Le PDF écrit dans le répertoire de
// travail est relu par le lecteur du nœud « Extraction PDF », `@firecrawl/pdf-inspector-wasm`, et ses
// flux sont décompressés pour compter les tracés.
//
// CE QU'ELLE EXIGE DU PDF :
//   — une page, à la taille du format et de l'orientation réglés ;
//   — le titre, en tête de page et dans les propriétés du document ;
//   — le texte du SVG, le tempo et les huit syllabes : le contenu est là, et il est resté du texte ;
//   — des tracés : la portée, les hampes et les glyphes, que la gravure dessine en chemins. Relevé le
//     2026-11-23 sur cette gamme, dans l'application : 209 courbes et 47 déplacements ; la même page
//     sans le SVG en porte une courbe et aucun déplacement.
//
// VUE ROUGE sur trois fautes plantées dans `ipc-pdf.cjs`, une à la fois : l'image retirée de la page,
// le titre retiré de la page, l'orientation inversée. Les deux cas tombent chaque fois.
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

const ABC = "X:1\nT:Gamme\nM:4/4\nL:1/4\nQ:\"Allegro\" 1/4=120\nK:C\n!p!C D E F | !f!G A B c |\nw: do re mi fa sol la si do";
const SYLLABES = "do re mi fa sol la si do";
/** Un titre qui porte une apostrophe, une virgule et un accent : ce qu'un titre a de plus courant. */
const TITRE_BRANCHE = "Gamme d'essai, épreuve";
const TITRE_REGLE = "Gamme réglée";

/** Le graphe : la gravure, son fichier SVG sur « SVG », et le titre branché s'il y en a un. */
function graphe(nom: string, titreBranche: string | null, reglages: Record<string, string>): string {
  const nodes = [
    { id: "gravure", position: { x: 80, y: 60 }, data: { ficheId: "partition-verovio", parametres: { Notation: ABC } } },
    { id: "pdf", position: { x: 700, y: 120 }, data: { ficheId: "svg-vers-pdf", parametres: { Nom: nom, ...reglages } } },
  ];
  const edges = [{ id: "e-svg", source: "gravure", target: "pdf", sourceHandle: "out:1", targetHandle: "in:0" }];
  if (titreBranche !== null) {
    nodes.push({ id: "titre", position: { x: 80, y: 520 }, data: { ficheId: "source-texte", parametres: { Texte: titreBranche } } });
    edges.push({ id: "e-titre", source: "titre", target: "pdf", sourceHandle: "out:0", targetHandle: "in:1" });
  }
  return JSON.stringify({ nodes, edges });
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
    // En points : 72 au pouce, 25,4 mm au pouce.
    mm: boite ? [Number(boite[1]) * 25.4 / 72, Number(boite[2]) * 25.4 / 72] : null, ...traces,
  };
}

test.describe("SVG vers PDF, derrière Partition gravée, dans l'application", () => {
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

  /** Sème, lance, vérifie que le nœud a fini sur son fichier, et rend le PDF relu. */
  async function imprimer(nom: string, titreBranche: string | null, reglages: Record<string, string>) {
    const chemin = join(TRAVAIL, `${nom}.pdf`);
    rmSync(chemin, { force: true });
    ecrits.push(chemin);
    await semerEtLancer(page, page.url(), graphe(nom, titreBranche, reglages));
    const etat = (await etatDesNoeuds(page)).find((n) => n.id === "pdf");
    expect(etat?.statut, `« SVG vers PDF » : ${etat?.cause ?? etat?.message}`).toBe("termine");
    expect(etat?.message).toContain(`${nom}.pdf`);
    expect(existsSync(chemin), `le PDF doit être écrit sous ${chemin}`).toBe(true);
    return lirePdf(chemin);
  }

  test("LE TITRE BRANCHÉ, LE CONTENU DU SVG ET SES TRACÉS SONT DANS LE PDF, sur une page A4 en portrait", async () => {
    const pdf = await imprimer(`epreuve-svg-vers-pdf-a4-${process.pid}`, TITRE_BRANCHE, {});
    console.log(JSON.stringify(pdf));
    expect(pdf.entete).toBe("%PDF-");
    expect(pdf.pages).toBe(1);
    expect(pdf.mm![0]).toBeCloseTo(210, 0);
    expect(pdf.mm![1]).toBeCloseTo(297, 0);
    expect(pdf.texte, "le titre, en tête").toContain(TITRE_BRANCHE);
    expect(pdf.titre, "le titre, dans les propriétés").toBe(TITRE_BRANCHE);
    expect(pdf.texte, "le tempo du SVG").toContain("Allegro");
    expect(pdf.texte, "les paroles du SVG").toContain(SYLLABES);
    expect(pdf.courbes, "les glyphes, en courbes").toBeGreaterThan(100);
    expect(pdf.deplacements, "la portée, les hampes et les barres").toBeGreaterThan(20);
  });

  test("SANS TITRE BRANCHÉ, LE RÉGLAGE LE DONNE ; et la Lettre US en paysage a sa taille", async () => {
    const pdf = await imprimer(`epreuve-svg-vers-pdf-lettre-${process.pid}`, null,
      { Titre: TITRE_REGLE, Format: "lettre", Orientation: "paysage" });
    console.log(JSON.stringify(pdf));
    expect(pdf.pages).toBe(1);
    expect(pdf.mm![0]).toBeCloseTo(279.4, 0);
    expect(pdf.mm![1]).toBeCloseTo(215.9, 0);
    expect(pdf.texte).toContain(TITRE_REGLE);
    expect(pdf.titre).toBe(TITRE_REGLE);
    expect(pdf.texte).toContain(SYLLABES);
    expect(pdf.courbes).toBeGreaterThan(100);
  });
});
