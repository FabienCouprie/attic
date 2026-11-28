// audio/soundhelix-batterie.test.ts — La batterie et ses motifs conditionnels égalent ceux de
// SoundHelix, note pour note ; le groove place chaque tic à sa durée relative.
//
// NIVEAU 1, À ENTRÉES ÉGALES. L'essai de batterie a cinq lignes et quatre motifs conditionnels, tous à
// la probabilité 100, dont deux crescendos. Les lignes, leurs voix et les motifs conditionnels sont
// lus dans l'XML, dans son ordre ; la matrice est celle que le programme a tirée, un signe par section.
// Chaque percussion rendue doit égaler, note pour note, la ligne du relevé : tic, durée, vélocité.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { creerAleatoire } from "../core";
import { lireMotif } from "./soundhelix-motifs";
import { harmonieDeLEssai, champ } from "./soundhelix-essais";
import { joueAuTic, type VoixActivite } from "./soundhelix-activite";
import { motifEnCrescendo } from "./soundhelix-generateurs";
import { appliquerConditionnel, lireConditions, placerAuGroove, rendreBatterie, type NoteBatterie } from "./soundhelix-batterie";
import { lireReleveSoundHelix } from "./temoins-soundhelix";

const DOSSIER = join(process.cwd(), "src", "audio", "temoins-soundhelix");
const XML = readFileSync(join(DOSSIER, "essai-batterie.xml"), "utf8");
const RELEVE = lireReleveSoundHelix(readFileSync(join(DOSSIER, "batterie.txt"), "utf8"));
const lire = (t: string) => lireMotif(t, { velociteMax: 1000, ticsParTemps: 4 });

/** La matrice du relevé, un signe par section, lu au milieu de la section. */
const MATRICE: VoixActivite[] = [...RELEVE.voix.entries()].map(([nom, segments]) => ({
  nom, debut: 0, fin: 0,
  sections: RELEVE.sections.map((d, k) => joueAuTic(segments, Math.floor((d + (RELEVE.sections[k + 1] ?? RELEVE.tics)) / 2))),
}));

const moteur = /<sequenceEngine class="DrumSequenceEngine">[\s\S]*?<\/sequenceEngine>/.exec(XML)![0];
const piste = /<instrument>batterie<\/instrument>[\s\S]*?<\/track>/.exec(XML)![0];
const PATTERNS = [...moteur.matchAll(/<pattern>\s*<pitch>(\d+)<\/pitch>[\s\S]*?<string>([^<]*)<\/string>[\s\S]*?<\/pattern>/g)]
  .map((m) => ({ hauteur: Number(m[1]), motif: m[2] }));
const VOIX = [...piste.matchAll(/<activityVector>([^<]+)<\/activityVector>/g)].map((m) => m[1]);
const CONDITIONNELS = [...moteur.matchAll(/<conditionalPattern>([\s\S]*?)<\/conditionalPattern>/g)].map((m) => {
  const b = m[1];
  const crescendo = b.includes("CrescendoPatternEngine");
  const texte = crescendo
    ? motifEnCrescendo({ tics: Number(champ(b, "patternTicks")), velocite: { min: Number(champ(b, "minVelocity")), max: Number(champ(b, "maxVelocity")) },
      exposant: Number(champ(b, "velocityExponent")), prefixe: champ(b, "prefixPattern") ?? "", motif: champ(b, "pattern")!, suffixe: champ(b, "suffixPattern") ?? "" })
    : champ(b, "string")!;
  return {
    cibles: champ(b, "target")!.split(",").map((k) => PATTERNS[Number(k)].hauteur),
    avant: lireConditions(champ(b, "precondition") ?? ""), apres: lireConditions(champ(b, "postcondition") ?? ""),
    remplacer: champ(b, "mode") === "replace", probabilite: Number(champ(b, "probability")), motif: lire(texte),
  };
});

describe("la batterie, à entrées égales avec SoundHelix", () => {
  const h = harmonieDeLEssai(XML);
  const lignes = PATTERNS.map((p, i) => ({ hauteur: p.hauteur, motif: lire(p.motif), segments: RELEVE.voix.get(VOIX[i])! }));
  let notes: NoteBatterie[] = rendreBatterie(lignes, h.tics);
  const poses: number[] = [];
  for (const c of CONDITIONNELS) {
    const r = appliquerConditionnel({ notes, sections: h.sections, tics: h.tics, matrice: MATRICE, aleatoire: creerAleatoire(1), ...c });
    notes = r.notes;
    poses.push(r.poses);
  }

  it("lit l'essai : cinq lignes, cinq voix, quatre motifs conditionnels, douze sections", () => {
    expect([PATTERNS.length, VOIX.length, CONDITIONNELS.length, h.sections.length]).toEqual([5, 5, 4, 12]);
    // Le roulement à la grosse caisse, la cymbale à quatre frontières, le silence du charleston, le crescendo.
    expect(poses).toEqual([2, 4, 2, 2]);
  });

  it.each(PATTERNS.map((p, rang) => [p.hauteur, rang]))("la percussion %i égale la ligne du programme, note pour note", (hauteur, rang) => {
    const ref = RELEVE.sequences.filter((s) => s.instrument === "batterie")[rang].entrees
      .filter((e) => e.hauteur !== null).map((e) => [e.tic, e.tics, e.velocite]);
    expect(ref.length).toBeGreaterThan(0);
    expect(notes.filter((n) => n.hauteur === hauteur).map((n) => [n.tic, n.tics, n.velocite])).toEqual(ref);
  });
});

describe("ce que l'essai ne fait pas voir", () => {
  // Tous les décalages de l'essai valent 0, ses ajouts tombent où la ligne visée se tait, et tout y
  // est à la probabilité 100 : quatre fautes plantées y restaient vertes, et ces cas les tiennent.
  const matrice: VoixActivite[] = [{ nom: "a", sections: [true, true, true, true], debut: 0, fin: 0 }];
  const sections = [0, 16, 32, 48];
  const base = { sections, tics: 64, matrice, avant: [], apres: [lireConditions("+a")[0]], aleatoire: creerAleatoire(2) };

  it("un décalage s'ajoute à la hauteur de la percussion", () => {
    const n = rendreBatterie([{ hauteur: 36, motif: lire("0,2,-,-1"), segments: null }], 4);
    expect(n.map((x) => [x.tic, x.hauteur])).toEqual([[0, 36], [1, 38], [3, 35]]);
  });

  it("« Ajouter » garde les notes de la fenêtre, « Remplacer » les retire", () => {
    const notes = rendreBatterie([{ hauteur: 38, motif: lire("0/4"), segments: null }], 64);
    const motif = lire("-/2,0/2");
    const ajout = appliquerConditionnel({ ...base, notes, motif, cibles: [38], remplacer: false, probabilite: 100 }).notes;
    const remplace = appliquerConditionnel({ ...base, notes, motif, cibles: [38], remplacer: true, probabilite: 100 }).notes;
    expect(ajout.filter((x) => x.tic === 12).length).toBe(1);
    expect(ajout.filter((x) => x.tic === 14).length).toBe(1);
    expect(remplace.filter((x) => x.tic === 12).length).toBe(0);
    expect(remplace.filter((x) => x.tic === 14).length).toBe(1);
  });

  it("la probabilité choisit les frontières, à 0 aucune, à 50 une partie", () => {
    const motif = lire("0");
    expect(appliquerConditionnel({ ...base, notes: [], motif, cibles: [49], remplacer: false, probabilite: 0 }).poses).toBe(0);
    const longues = { ...base, sections: Array.from({ length: 64 }, (_, k) => 16 * k), tics: 1024,
      matrice: [{ nom: "a", sections: new Array(64).fill(true), debut: 0, fin: 0 }] };
    const poses = appliquerConditionnel({ ...longues, notes: [], motif, cibles: [49], remplacer: false, probabilite: 50 }).poses;
    expect(poses).toBeGreaterThan(15);
    expect(poses).toBeLessThan(48);
  });

  it("le groove se ramène à sa durée moyenne, quelle qu'elle soit", () => {
    expect(placerAuGroove(120, 120, [3, 1])).toBe(180);
    expect(placerAuGroove(240, 120, [3, 1])).toBe(240);
  });
});

describe("les conditions", () => {
  it("lisent le signe et la voix, et une condition vide n'en pose aucune", () => {
    expect(lireConditions("+a, -b")).toEqual([{ voix: "a", joue: true }, { voix: "b", joue: false }]);
    expect(lireConditions("")).toEqual([]);
    expect(() => lireConditions("a")).toThrow(/illisible/);
  });
});

describe("le groove", () => {
  it("allonge un pas sur deux et raccourcit l'autre, la mesure gardant sa longueur", () => {
    const g = [110, 90];
    expect([0, 1, 2, 3, 4].map((k) => placerAuGroove(k * 120, 120, g))).toEqual([0, 132, 240, 372, 480]);
    expect(placerAuGroove(60, 120, g)).toBe(66);
    expect(placerAuGroove(1920, 120, [125, 75, 115, 85])).toBe(1920);
  });

  it("ne change rien sous un groove égal", () => {
    for (const t of [0, 7, 120, 333, 1919]) expect(placerAuGroove(t, 120, [100, 100])).toBe(t);
  });
});
