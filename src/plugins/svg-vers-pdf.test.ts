// plugins/svg-vers-pdf.test.ts — Ce que « SVG vers PDF » demande à l'impression, et ce qu'il écrit.
//
// CE QUE CES CAS TIENNENT, ET CE QU'ILS NE TIENNENT PAS. L'impression elle-même vit dans le processus
// principal et demande Chromium : elle est éprouvée dans l'application, par
// `tests-e2e/svg-vers-pdf-dans-application.spec.ts`, qui relit le PDF. Ici, le pont est simulé et
// enregistre ce qu'on lui demande : le SVG tel qu'il est entré, le titre retenu, le format et
// l'orientation, puis le fichier écrit et le chemin rendu. Chaque réglage y est déplacé pour montrer
// qu'il agit.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fiches, nomAvecExtensionPdf } from "./svg-vers-pdf";
import { ctxDEssai } from "../core/contexte-essai";

const SVG_TEXTE = "<?xml version=\"1.0\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 40 10\"><text x=\"1\" y=\"8\">Allegro</text></svg>";
const SVG = new File([SVG_TEXTE], "gravure.svg", { type: "image/svg+xml" });
// Un PNG annoncé SVG : le format se lit sur les octets, et ceux-ci sont la signature d'un PNG.
const PNG = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], "faux.svg", { type: "image/svg+xml" });
/** Ce que le pont simulé rend pour toute impression : des octets reconnaissables. */
const PDF = new TextEncoder().encode("%PDF-1.4 essai");

const noeud = fiches.find((f) => f.id === "svg-vers-pdf")!;

type PontSimule = {
  svgVersPdf: (d: Record<string, unknown>) => Promise<unknown>;
  ecrireFichier: (chemin: string, donnees: Uint8Array) => Promise<string | null>;
};

let dossier: string;
let demandes: Record<string, unknown>[];
let reponse: unknown;
let api: PontSimule;
beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), "attic-svg-vers-pdf-"));
  demandes = [];
  reponse = { pdf: PDF };
  api = {
    svgVersPdf: async (d) => { demandes.push(d); if (reponse instanceof Error) throw reponse; return reponse; },
    ecrireFichier: async (chemin, donnees) => { writeFileSync(chemin, donnees); return chemin; },
  };
  (globalThis as { window?: unknown }).window = { api };
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  rmSync(dossier, { recursive: true, force: true });
});

/** Lance le nœud : `titre` sur la seconde entrée, les réglages par leur nom ou leur identifiant. */
async function lancer(entree: unknown, titre: unknown = null, reglages: Record<string, string> = {}) {
  const r = await noeud.executer(ctxDEssai([entree, titre], reglages, { repertoireTravail: dossier }) as never) as
    { valeurs: unknown[]; message: string; erreur?: boolean };
  return { ...r, ecrits: readdirSync(dossier) };
}

describe("SVG vers PDF : ce qui part à l'impression", () => {
  it("LE SVG PART TEL QU'IL EST ENTRÉ, et le PDF rendu s'écrit, octet pour octet, sous le chemin rendu", async () => {
    const r = await lancer(SVG, "Gamme");
    expect(r.erreur).toBeUndefined();
    expect(demandes).toEqual([{ svg: SVG_TEXTE, titre: "Gamme", nom: "partition", format: "a4", orientation: "portrait" }]);
    expect(r.ecrits).toEqual(["partition.pdf"]);
    expect(r.valeurs).toEqual([`${dossier}/partition.pdf`]);
    expect(new Uint8Array(readFileSync(join(dossier, "partition.pdf")))).toEqual(PDF);
    expect(r.message).toContain("partition.pdf");
  });

  it("LE TITRE BRANCHÉ L'EMPORTE SUR LE RÉGLAGE, et le réglage le donne quand rien n'est branché", async () => {
    await lancer(SVG, "  Branché  ", { Titre: "Réglé" });
    await lancer(SVG, null, { Titre: "  Réglé  " });
    await lancer(SVG, "   ", { Titre: "Réglé" });
    await lancer(SVG, null);
    expect(demandes.map((d) => d.titre)).toEqual(["Branché", "Réglé", "Réglé", ""]);
  });

  it("LE FORMAT ET L'ORIENTATION PARTENT TELS QUE RÉGLÉS", async () => {
    await lancer(SVG, null, { Format: "lettre", Orientation: "paysage" });
    expect(demandes[0]).toMatchObject({ format: "lettre", orientation: "paysage" });
  });

  it("LE NOM DONNE LE FICHIER, son extension forcée à .pdf, et le document prend ce nom sans extension", async () => {
    const r = await lancer(SVG, null, { Nom: "Ma gamme.PDF" });
    expect(r.ecrits).toEqual(["Ma gamme.pdf"]);
    expect(demandes[0].nom).toBe("Ma gamme");
    expect(nomAvecExtensionPdf("gravure")).toBe("gravure.pdf");
    expect(nomAvecExtensionPdf("gravure.svg")).toBe("gravure.svg.pdf");
    expect(nomAvecExtensionPdf("  .pdf ")).toBe("partition.pdf");
  });
});

describe("SVG vers PDF : ce qui est refusé", () => {
  it("UNE IMAGE QUI N'EST PAS UN SVG EST REFUSÉE EN NOMMANT CE QU'ELLE EST, sans rien imprimer ni écrire", async () => {
    const r = await lancer(PNG, "Gamme");
    expect(r.erreur).toBe(true);
    expect(r.message).toContain("image/png");
    expect(demandes).toEqual([]);
    expect(r.ecrits).toEqual([]);
  });

  it("rien de branché sur « SVG » : il le demande", async () => {
    const r = await lancer(null);
    expect(r.valeurs).toEqual([null]);
    expect(r.message).toMatch(/SVG/);
    expect(demandes).toEqual([]);
  });

  it("le refus et l'échec du processus principal arrivent au message, et rien n'est écrit", async () => {
    reponse = { refus: "titre" };
    const refus = await lancer(SVG);
    expect(refus.erreur).toBe(true);
    expect(refus.message).toContain("« titre »");
    reponse = { echec: "chargement de la page : plus de 60 s" };
    const echec = await lancer(SVG);
    expect(echec.erreur).toBe(true);
    expect(echec.message).toContain("plus de 60 s");
    expect(echec.ecrits).toEqual([]);
  });

  it("un canal absent du processus principal en cours dit de redémarrer, et non l'erreur brute d'Electron", async () => {
    reponse = new Error("Error invoking remote method 'pdf:depuis-svg': Error: No handler registered for 'pdf:depuis-svg'");
    const r = await lancer(SVG);
    expect(r.erreur).toBe(true);
    expect(r.message).not.toContain("No handler registered");
  });

  it("une écriture refusée par le pont est une erreur, et la sortie reste vide", async () => {
    api.ecrireFichier = async () => null;
    const r = await lancer(SVG);
    expect(r.erreur).toBe(true);
    expect(r.valeurs).toEqual([null]);
  });

  it("hors d'Electron, il le dit", async () => {
    delete (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {};
    const r = await lancer(SVG);
    expect(r.valeurs).toEqual([null]);
    expect(r.message).toMatch(/Electron/);
  });
});
