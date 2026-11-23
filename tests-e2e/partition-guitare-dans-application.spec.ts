// tests-e2e/partition-guitare-dans-application.spec.ts — « Partition guitare » puis « SVG vers PDF », dans
// l'application construite, et le PDF écrit relu.
//
// POURQUOI CETTE ÉPREUVE EST ICI. « Partition guitare » a été demandée le 2026-11-23 pour se brancher sur
// « SVG vers PDF », dont l'impression se fait dans le processus principal, par le Chromium d'Electron :
// aucun test unitaire ne voit la chaîne entière. Le graphe est celui-là : une gamme de do 3 à do 4 en
// ABC, gravée en portée et tablature, dont la sortie « Fichier SVG » entre dans « SVG vers PDF ». Le PDF
// écrit dans le répertoire de travail est relu par `@firecrawl/pdf-inspector-wasm`, et ses flux sont
// décompressés pour compter les tracés.
//
// CE QU'ELLE EXIGE DU PDF :
//   — une page A4, et le titre, en tête de page et dans les propriétés du document ;
//   — les chiffres de case de la tablature, restés du texte, ceux que la main calcule pour cette gamme :
//     en standard, 3 0 2 3 0 2 0 1 ; en Drop D sous un capodastre en case 2, 1 3 0 1 3 0 2 3, et
//     l'indication « Drop D (D A D G B E) · Capo 2 » gravée au-dessus ;
//   — des tracés : les lignes des deux portées, les hampes et les glyphes.
// Les chiffres se comparent en multiensemble : le lecteur de PDF range le texte par lignes, et chaque
// corde est une ligne.
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

const ABC = "X:1\nT:Gamme\nM:4/4\nL:1/4\nK:C\nC, D, E, F, | G, A, B, C |]";
const TITRE = "Gamme pour guitare, épreuve";

/** Le graphe : la gravure pour guitare, son fichier SVG sur « SVG », et le titre branché. */
function graphe(nom: string, reglagesGuitare: Record<string, string | number>): string {
  return JSON.stringify({
    nodes: [
      { id: "guitare", position: { x: 80, y: 60 }, data: { ficheId: "partition-guitare", parametres: { Notation: ABC, ...reglagesGuitare } } },
      { id: "titre", position: { x: 80, y: 520 }, data: { ficheId: "source-texte", parametres: { Texte: TITRE } } },
      { id: "pdf", position: { x: 700, y: 120 }, data: { ficheId: "svg-vers-pdf", parametres: { Nom: nom } } },
    ],
    edges: [
      { id: "e-svg", source: "guitare", target: "pdf", sourceHandle: "out:1", targetHandle: "in:0" },
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

/** Les chiffres du texte, hors du titre et de l'indication, triés. */
const chiffres = (texte: string) => [...texte.replace(TITRE, "").replace(/Capo \d+/, "")].filter((c) => /\d/.test(c)).sort().join("");

test.describe("SVG vers PDF, derrière Partition guitare, dans l'application", () => {
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

  /** Sème, lance, vérifie que les deux nœuds ont fini, et rend le PDF relu. */
  async function imprimer(nom: string, reglagesGuitare: Record<string, string | number>) {
    const chemin = join(TRAVAIL, `${nom}.pdf`);
    rmSync(chemin, { force: true });
    ecrits.push(chemin);
    await semerEtLancer(page, page.url(), graphe(nom, reglagesGuitare));
    const etats = await etatDesNoeuds(page);
    const guitare = etats.find((n) => n.id === "guitare"), pdf = etats.find((n) => n.id === "pdf");
    expect(guitare?.statut, `« Partition guitare » : ${guitare?.cause ?? guitare?.message}`).toBe("termine");
    expect(pdf?.statut, `« SVG vers PDF » : ${pdf?.cause ?? pdf?.message}`).toBe("termine");
    expect(existsSync(chemin), `le PDF doit être écrit sous ${chemin}`).toBe(true);
    return { message: guitare?.message ?? "", pdf: await lirePdf(chemin) };
  }

  test("PORTÉE ET TABLATURE : le titre, les cases de la gamme en première position et les tracés sont dans le PDF", async () => {
    const { message, pdf } = await imprimer(`epreuve-partition-guitare-${process.pid}`, {});
    console.log(message, JSON.stringify(pdf));
    expect(message).toContain("ABC · Standard · page 1 sur 1");
    expect(pdf.entete).toBe("%PDF-");
    expect(pdf.pages).toBe(1);
    expect(pdf.mm![0]).toBeCloseTo(210, 0);
    expect(pdf.texte, "le titre, en tête").toContain(TITRE);
    expect(pdf.titre, "le titre, dans les propriétés").toBe(TITRE);
    expect(chiffres(pdf.texte), "les cases 3 0 2 3 0 2 0 1").toBe([..."30230201"].sort().join(""));
    expect(pdf.courbes, "les glyphes, en courbes").toBeGreaterThan(30);
    expect(pdf.deplacements, "les deux portées, les hampes et les barres").toBeGreaterThan(20);
  });

  test("TABLATURE SEULE, EN DROP D SOUS UN CAPODASTRE EN CASE 2 : les cases comptées depuis lui, et l'indication", async () => {
    const { message, pdf } = await imprimer(`epreuve-partition-guitare-drop-${process.pid}`,
      { Affichage: "tablature", Accordage: "drop-d", Capodastre: 2 });
    console.log(message, JSON.stringify(pdf));
    expect(message).toContain("ABC · Drop D · page 1 sur 1");
    expect(pdf.pages).toBe(1);
    expect(pdf.texte).toContain("Drop D (D A D G B E) · Capo 2");
    expect(chiffres(pdf.texte), "les cases 1 3 0 1 3 0 2 3").toBe([..."13013023"].sort().join(""));
    expect(pdf.deplacements).toBeGreaterThan(10);
  });
});
