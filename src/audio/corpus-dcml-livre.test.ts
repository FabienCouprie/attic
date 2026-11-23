// audio/corpus-dcml-livre.test.ts — Le corpus livré : les chorals du DCML, corrigés d'après Sapp.
//
// GARDÉ PAR `CORPUS_CHORALS`, comme le relevé dont il prend la liste des écarts :
//   CORPUS_CHORALS=work/corpus npx vitest run src/audio/corpus-chorals-releve.test.ts
//   CORPUS_CHORALS=work/corpus npx vitest run src/audio/corpus-dcml-livre.test.ts
// Il écrit `public/oonx/corpus-chorals-bach-dcml-2.json`, qui entre ensuite au manifeste des modèles
// (`npm run modeles:generer`) et se publie sur la release `assets` (`npm run modeles:publier`).
//
// LA SECONDE VERSION, ET LA PREMIÈRE RESTE PUBLIÉE. Celle du 2026-11-22 portait les tonalités de
// Krumhansl seul, fausses pour un choral sur cinq ; celle-ci les lit avec la basse finale
// (`corpus-tonalite.ts`). Un asset publié ne se remplace pas : il change de nom.
//
// DÉCISIONS DE FABIEN DU 2026-11-22. Les écarts relevés hors des six chorals que Sapp n'apparie pas
// sûrement prennent la hauteur de Sapp ; chacun est écrit dans le fichier, avant et après. Les six
// sont livrés tels quels, et nommés avec leur concordance. Aucune note de Sapp n'est ajoutée : seules
// des hauteurs changent, et seulement là où les deux encodages ont une note à la même place.

import { describe, expect, it } from "vitest";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { lireTableDcml } from "./dcml-tsv";
import { tonaliteDesNotes } from "./corpus-tonalite";
import { corpusDepuisJson, corpusVersJson, type EnteteCorpus } from "./corpus-fichier";
import type { PieceDuCorpus } from "./corpus";
import { NOMS_SATB } from "./tessitures-satb";

const RACINE = process.env.CORPUS_CHORALS;
const SORTIE = join(process.cwd(), "public", "oonx", "corpus-chorals-bach-dcml-2.json");

/**
 * Les six chorals que le relevé du 2026-11-22 n'apparie pas sûrement, sous 80 % de notes
 * concordantes, avec le choral de Sapp le plus proche et sa concordance (`releve-dcml-sapp.md`).
 */
const INCERTAINS: Record<string, string> = {
  "043": "apparié au choral 43 de Sapp à 35,2 % de notes concordantes",
  "057": "apparié au choral 369 de Sapp à 32,7 % de notes concordantes, d'un autre titre",
  "086": "apparié au choral 87 de Sapp à 65,5 % de notes concordantes",
  "130": "apparié au choral 130 de Sapp à 73,8 % de notes concordantes",
  "150": "apparié au choral 11 de Sapp à 17,5 % de notes concordantes, d'un autre titre",
  "259": "apparié au choral 259 de Sapp à 31,6 % de notes concordantes",
};

/** Le premier sous-dossier qui contient `nom`, les archives se déballant dans un dossier daté. */
const trouver = (dossier: string, nom: string): string | undefined => {
  if (existsSync(join(dossier, nom))) return join(dossier, nom);
  for (const d of readdirSync(dossier, { withFileTypes: true })) if (d.isDirectory() && existsSync(join(dossier, d.name, nom))) return join(dossier, d.name, nom);
  return undefined;
};

describe.skipIf(!RACINE)("le corpus livré des chorals du DCML", () => {
  it("lit les 361 tables, applique les 489 corrections hors des six incertains, et s'écrit", () => {
    const dcml = trouver(join(RACINE!, "dcml"), "notes")!;
    const metadonnees = readFileSync(join(dcml, "..", "metadata.tsv"), "utf8").replace(/\r/g, "").split("\n").filter(Boolean);
    const entete = metadonnees[0].split("\t");
    const metriques = new Map<string, string>();
    for (const l of metadonnees.slice(1)) {
      const c = l.split("\t");
      const signatures = (c[entete.indexOf("TimeSig")] ?? "").split(",").map((s) => s.split(":")[1]?.trim()).filter(Boolean);
      if (signatures.length) metriques.set(`DCML ${c[entete.indexOf("piece")]}`, [...new Set(signatures)].join(", "));
    }

    const fichiers = readdirSync(dcml).filter((f) => f.endsWith(".notes.tsv")).sort();
    expect(fichiers).toHaveLength(361);
    const pieces: PieceDuCorpus[] = fichiers.map((f) => {
      const { sequence } = lireTableDcml(readFileSync(join(dcml, f), "utf8"), 60);
      const nVoix = new Set(sequence.notes.map((n) => n.voix ?? 0)).size;
      const source = `DCML ${f.replace(/\.notes\.tsv$/, "")}`;
      return {
        source, tonalite: null,
        sequence: { ...sequence, titre: source, ...(nVoix === 4 ? { voix: NOMS_SATB.map((n, numero) => ({ numero, nom: n.fr })) } : {}) },
      };
    });
    // L'IDENTIFIANT ENTIER : le DCML a un « 283bis » à côté du 283.
    const ident = (p: PieceDuCorpus) => /^DCML (\d+\w*)/.exec(p.source)?.[1] ?? "";

    // LES CORRECTIONS, une à une : la note doit exister, à sa voix et à son attaque, avec la hauteur
    // que le relevé a lue dans le DCML. Une correction qui ne trouve pas sa note fait tomber le cas.
    const lignes = readFileSync(join(RACINE!, "corrections-dcml.tsv"), "utf8").replace(/\r/g, "").split("\n").filter(Boolean).slice(1);
    const corrections: [string, number, number, number, number][] = [];
    let ecartees = 0;
    for (const l of lignes) {
      const [choral, ...reste] = l.split("\t");
      const [, voix, noire, avant, apres] = reste.map(Number);
      if (INCERTAINS[choral]) { ecartees++; continue; }
      const piece = pieces.find((p) => ident(p) === choral)!;
      const visees = piece.sequence.notes.filter((n) => (n.voix ?? 0) === voix && Math.abs(n.debut - noire) < 1e-6 && n.note === avant);
      expect(visees, `${piece.source}, voix ${voix}, noire ${noire}`).toHaveLength(1);
      visees[0].note = apres;
      corrections.push([piece.source, voix, noire, avant, apres]);
    }
    expect(corrections).toHaveLength(489);
    expect(ecartees).toBe(710);

    for (const p of pieces) p.tonalite = tonaliteDesNotes(p.sequence);
    const description: EnteteCorpus = {
      nom: "Chorals de Bach (DCML corrigé)",
      source: "DCMLab/bach_chorales v2.0, d'après les fichiers Capella d'Ulrich Kaiser ; 489 hauteurs corrigées d'après craigsapp/bach-370-chorales",
      licence: "CC0-1.0",
      corrections,
      nonVerifiees: Object.entries(INCERTAINS).map(([n, raison]) => ({ source: pieces.find((p) => ident(p) === n)!.source, raison })),
    };
    const texte = corpusVersJson({ pieces }, description, metriques);
    mkdirSync(join(process.cwd(), "public", "oonx"), { recursive: true });
    writeFileSync(SORTIE, texte, "utf8");

    // LA RELECTURE REND CE QUI A ÉTÉ ÉCRIT, corrections comprises.
    const relu = corpusDepuisJson(readFileSync(SORTIE, "utf8"));
    expect(relu.corpus.pieces).toHaveLength(361);
    expect(relu.entete.corrections).toHaveLength(489);
    const [source, voix, noire, , apres] = corrections[0];
    expect(relu.corpus.pieces.find((p) => p.source === source)!.sequence.notes.find((n) => n.voix === voix && Math.abs(n.debut - noire) < 1e-6)!.note).toBe(apres);
    const octets = Buffer.byteLength(texte);
    console.log(`corpus livré : ${relu.corpus.pieces.length} pièces, ${octets} octets, sha256 ${createHash("sha256").update(texte).digest("hex")}`);
    const parVoix = new Map<number, number>();
    for (const p of relu.corpus.pieces) { const n = new Set(p.sequence.notes.map((x) => x.voix)).size; parVoix.set(n, (parVoix.get(n) ?? 0) + 1); }
    console.log(`pièces par nombre de voix : ${[...parVoix].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n} voix ×${c}`).join(", ")}`);
  }, 120_000);
});
