// plugins/abc-reprise.test.ts — Le nœud « Reprise ABC » par le registre.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";
import { lireMorceau } from "../audio/abc";
import { ctxDEssai } from "../core/contexte-essai";
import { valeurCanoniqueChoix } from "../i18n";
import { ACCORDS_TENUS } from "../audio/abc-reprise";
import { optionsPatrons } from "./patrons-rythme";
import { STYLES_HERITES } from "./abc-reprise";

const ctx = (entree: unknown, params: Record<string, string | number>) => ctxDEssai([entree], params);
const fiche = () => registre.trouverDef("reprise-abc")!;
const reglageStyle = () => fiche().parametres.find((p) => p.nom === "Style")!;
const AIR = `X:1\nT:Essai\nM:4/4\nL:1/8\nQ:1/4=100\nK:G\n"G"GABG DGBG|"C"cBcd "G"efge|"D"dcBA GFGA|"G"BGAF "D"G4|]`;
const VALSE = `X:1\nM:3/4\nL:1/4\nK:C\n"C"E G c | "G7"B2 G | "Am"A "F"F A | "C"c3 |]`;

/**
 * Exécute quelque chose avec l'interface dans une langue donnée. `langueCourante` lit
 * `localStorage`, absent sous vitest : même procédé que `plugins/messages-langue.test.ts`.
 */
async function avecLangue<T>(langue: string, f: () => Promise<T>): Promise<T> {
  const avant = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (c: string) => (c === "attic-lang" ? langue : null), setItem: () => {} },
    configurable: true, writable: true,
  });
  try { return await f(); } finally {
    if (avant) Object.defineProperty(globalThis, "localStorage", avant);
    else delete (globalThis as unknown as Record<string, unknown>).localStorage;
  }
}

describe("nœud Reprise ABC", () => {
  it("est documenté dans les deux langues", () => {
    const f = fiche();
    expect(f.notice!.length).toBeGreaterThan(300);
    for (const p of f.parametres ?? []) { expect(p.doc, p.nom).toBeTruthy(); expect(p.docEn, p.nom).toBeTruthy(); }
  });

  it("rend audio, MIDI, ABC à trois voix et rapport", async () => {
    const r = await fiche().executer(ctx(AIR, { "Synthèse": "FM/Oscillateurs", Style: "Rock" }) as any);
    expect(r.erreur, r.message).toBeFalsy();
    const [audio, midi, abc, rapport] = r.valeurs as [AudioBuffer, File, string, string];
    // Quatre mesures de 4/4 à 100 : 9,6 s, plus la queue du rendu.
    expect(audio.duration).toBeGreaterThanOrEqual(9.6);
    expect(midi).toBeInstanceOf(File);
    expect(lireMorceau(abc).voix.length).toBe(3);
    expect(rapport).toMatch(/mélodie et accords vérifiés intacts/);
    expect(r.message).toMatch(/^Reprise « Rock » · 100 BPM/);
  });

  it("dit pourquoi il refuse une partition sans accords", async () => {
    const r = await fiche().executer(ctx("X:1\nM:4/4\nL:1/4\nK:C\nC D E F|]", {}) as any);
    expect(r.erreur).toBe(true);
    expect(r.message).toMatch(/pas d'accords chiffrés/);
    expect(r.valeurs[3]).toMatch(/pas d'accords chiffrés/);
  });
});

describe("le réglage Style suit la nomenclature des patrons rythmiques", () => {
  it("OFFRE « Accords tenus » PUIS LA LISTE ENTIÈRE DES PATRONS, dans leur ordre et sous leurs libellés", () => {
    const p = reglageStyle();
    const patrons = optionsPatrons();
    expect(p.optionIds).toEqual([ACCORDS_TENUS, ...patrons.optionIds]);
    expect(p.options).toEqual(["Accords tenus", ...patrons.options]);
    expect(p.optionsEn).toEqual(["Held chords", ...patrons.optionsEn]);
    expect(p.defaut).toBe("Pop ballade");
  });

  it("CHAQUE VALEUR D'AVANT SE LIT, et mène au style qui joue son motif", () => {
    const p = reglageStyle();
    const lu = (v: string) => valeurCanoniqueChoix(p, v);
    // Les six identifiants d'avant, et un libellé de chaque langue.
    expect(["blocs", "ballade", "pop", "valse", "marche", "bossa"].map(lu))
      .toEqual([ACCORDS_TENUS, "Pop ballade", "Rock", "Valse", "Marche militaire", "Bossa Nova"]);
    expect(lu("Pop (accords sur les temps)")).toBe("Rock");
    expect(lu("Waltz (bass – chord – chord)")).toBe("Valse");
    // Et chaque écriture déclarée mène à un style offert.
    const perdues = Object.entries(STYLES_HERITES).filter(([v]) => !p.optionIds!.includes(String(lu(v))));
    expect(perdues).toEqual([]);
  });

  it("CHAQUE STYLE AGIT AU RUN : aucun ne rend le fichier MIDI d'un autre", async () => {
    // Le contrat de composant, réglage par réglage : changer la valeur doit changer le résultat. Le
    // chemin entier est éprouvé, la fiche lue par l'exécuteur et le fichier rendu sur la sortie
    // MIDI. Bolero, écrit pour le 3/4, est lancé sur une valse, et les quatre autres styles qui
    // jouent le 3/4 avec lui.
    const p = reglageStyle();
    const octets = async (style: string, air: string) => {
      const r = await fiche().executer(ctx(air, { "Synthèse": "FM/Oscillateurs", Style: style }) as any);
      expect(r.erreur, `${style} : ${r.message}`).toBeFalsy();
      return Buffer.from(await (r.valeurs[1] as File).arrayBuffer()).toString("base64");
    };
    const rendus = new Map<string, string[]>();
    const lancer = async (style: string, air: string, metrique: string) => {
      const cle = `${metrique}·${await octets(style, air)}`;
      rendus.set(cle, [...(rendus.get(cle) ?? []), style]);
    };
    for (const id of p.optionIds!) if (id !== "Bolero") await lancer(id, AIR, "4/4");
    for (const id of [ACCORDS_TENUS, "Pop ballade", "Rock", "Valse", "Bolero"]) await lancer(id, VALSE, "3/4");
    expect([...rendus.values()].filter((s) => s.length > 1)).toEqual([]);
    expect(rendus.size).toBe(p.optionIds!.length - 1 + 5);
  }, 120_000);

  it("refuse un style que la métrique n'admet pas, et le nomme dans la langue de l'interface", async () => {
    const r = await fiche().executer(ctx(VALSE, { Style: "Reggae" }) as any);
    expect(r.erreur).toBe(true);
    expect(r.message).toMatch(/le style « Reggae » ne s'applique pas à une mesure en 3\/4/);
    const en = await avecLangue("en", () => fiche().executer(ctx(VALSE, { Style: "Marche militaire" }) as any));
    expect(en.message).toMatch(/the « Military march » style does not apply to a bar in 3\/4/);
  });

  it("nomme le style joué dans la langue de l'interface", async () => {
    const lancer = () => fiche().executer(ctx(AIR, { "Synthèse": "FM/Oscillateurs", Style: "Pop ballade" }) as any);
    expect((await lancer()).message).toMatch(/^Reprise « Pop ballade » ·/);
    expect((await avecLangue("en", lancer)).message).toMatch(/^« Pop ballad » cover ·/);
  });
});
