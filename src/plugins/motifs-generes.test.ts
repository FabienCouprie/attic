// plugins/motifs-generes.test.ts — Les trois générateurs de motifs : ce qu'ils rendent se lit comme un
// motif, à la longueur du plan, la graine fixe le tirage, et une voix le joue par son entrée.
//
// Ce que chaque générateur garantit est éprouvé dans `audio/soundhelix-generateurs.test.ts`, le
// crescendo contre le programme original. Ici on vérifie le CÂBLAGE : les réglages lus, la sortie
// branchée sur « Voix sur l'accord », le message et la faute dans les deux langues.

import { parseMidi } from "midi-file";
import { describe, expect, it } from "vitest";
import { lancerFiche } from "../audio/lancer-fiche";
import { lireMotif, ticsDuMotif } from "../audio/soundhelix-motifs";
import { motifEnCrescendo } from "../audio/soundhelix-generateurs";
import { fiches as fichesHarmonie } from "./harmonie-motifs";
import { fiches as fichesVoix } from "./voix-sur-accord";
import { fiches } from "./motifs-generes";

const hasard = fiches.find((f) => f.id === "motif-au-hasard")!;
const fragments = fiches.find((f) => f.id === "motif-par-fragments")!;
const crescendo = fiches.find((f) => f.id === "motif-crescendo")!;
const ficheVoix = fichesVoix.find((f) => f.id === "voix-sur-accord")!;
const ficheHarmonie = fichesHarmonie.find((f) => f.id === "harmonie-motifs")!;

const longueur = (t: unknown) => ticsDuMotif(lireMotif(t as string, { jokers: "+#*", velociteMax: 1000, ticsParTemps: 4 }));

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

describe("les générateurs de motifs", () => {
  it("« Motif au hasard » rend le plan à sa longueur, la graine fixe le tirage, et une voix le joue", async () => {
    const r = await lancerFiche(hasard, { Plan: "A1,A2,B1", Tics: 8, Graine: 4 }, { entrees: [] });
    expect(r.erreurRendue).toBe(false);
    expect(longueur(r.valeurs[0])).toBe(24);
    expect(r.message).toMatch(/^3 parties · 24 tics · \d+ notes · graine 4$/);
    expect((await lancerFiche(hasard, { Plan: "A1,A2,B1", Tics: 8, Graine: 4 }, { entrees: [] })).valeurs[0]).toBe(r.valeurs[0]);
    expect((await lancerFiche(hasard, { Plan: "A1,A2,B1", Tics: 8, Graine: 5 }, { entrees: [] })).valeurs[0]).not.toBe(r.valeurs[0]);
    const h = (await lancerFiche(ficheHarmonie, { "Motifs d'accords": "Am/4,+F/4", Mesures: 4 }, { entrees: [] })).valeurs[0];
    const v = await lancerFiche(ficheVoix, {}, { entrees: [h, null, r.valeurs[0]] });
    expect(v.erreurRendue).toBe(false);
    const departs = parseMidi(new Uint8Array(await (v.valeurs[0] as File).arrayBuffer())).tracks[0].filter((e) => e.type === "noteOn").length;
    expect(departs).toBeGreaterThan(0);
  });

  it("« Motif par fragments » n'assemble que les fragments écrits, à la longueur du plan", async () => {
    const r = await lancerFiche(fragments, { Plan: "A1,A1", Tics: 4, Fragments: "A : 0/4 | 1/4", Graine: 2 }, { entrees: [] });
    // Les fragments passent tels qu'ils sont écrits ; une partie nommée deux fois se répète.
    expect(r.valeurs[0]).toMatch(/^([01])\/4,\1\/4$/);
    expect(longueur(r.valeurs[0])).toBe(8);
  });

  it("« Motif en crescendo » rend ce que le module calcule, et le dit", async () => {
    const r = await lancerFiche(crescendo, { Tics: 12, "Vélocité min": 300, "Vélocité max": 900, Exposant: 1, "Préfixe": "-/2", Motif: "0/2", Suffixe: "0,0" },
      { entrees: [] });
    expect(r.valeurs[0]).toBe(motifEnCrescendo({ tics: 12, velocite: { min: 300, max: 900 }, exposant: 1, prefixe: "-/2", motif: "0/2", suffixe: "0,0" }));
    expect(r.message).toBe("12 tics · 6 notes");
  });

  it("CHAQUE RÉGLAGE CHANGE CE QUE LE COMPOSANT REND, ce que le banc de croisement, qui ne lance que les nœuds à choix, ne voit pas", async () => {
    const cas: [typeof hasard, Record<string, string | number>, Record<string, string | number>][] = [
      [hasard, { Graine: 7, "Tics joués max": 16 }, { Plan: "A1,B1", Tics: 12, "Probabilité de note": 90, "Probabilité de liaison": 80, "Vélocité min": 100,
        "Vélocité max": 600, "Tics joués min": 11, "Tics joués max": 7, "Décalages": "0,5", "Longueurs de note": "3",
        "Longueurs de silence": "3", "Corrélation hauteur et vélocité": 0, "Exposant de vélocité": 3, Graine: 8 }],
      [fragments, { Graine: 7 }, { Plan: "B1,B2", Tics: 12, Fragments: "A : 0/4 | 1/4\nB : 2/2 | 3/1", Graine: 8 }],
      [crescendo, {}, { Tics: 9, "Vélocité min": 500, "Vélocité max": 700, Exposant: 1, "Préfixe": "-/1", Motif: "1/2", Suffixe: "2/1" }],
    ];
    // Les bornes de tics joués n'agissent que si elles excluent le tirage de référence : elles se
    // prennent juste au-dessus et juste au-dessous de ce que sa première partie joue.
    const premiere = lireMotif((await lancerFiche(hasard, cas[0][1], { entrees: [] })).valeurs[0] as string,
      { velociteMax: 1000, ticsParTemps: 4 });
    let t = 0;
    let joues = 0;
    for (const e of premiere) { if (t >= 16) break; if (e.decalage !== null) joues += e.tics; t += e.tics; }
    cas[0][2]["Tics joués min"] = joues + 1;
    cas[0][2]["Tics joués max"] = joues - 1;
    for (const [f, base, variantes] of cas) {
      const reference = (await lancerFiche(f, base, { entrees: [] })).valeurs[0];
      for (const [nom, valeur] of Object.entries(variantes)) {
        const r = await lancerFiche(f, { ...base, [nom]: valeur }, { entrees: [] });
        expect(r.erreurRendue, `${f.id} · ${nom} : ${r.message}`).toBe(false);
        expect(r.valeurs[0], `${f.id} · ${nom}`).not.toBe(reference);
      }
    }
  });

  it("une faute se dit dans la langue de l'interface", async () => {
    const plan = await lancerFiche(hasard, { Plan: "A1,B" }, { entrees: [] });
    expect(plan.erreurRendue).toBe(true);
    expect(plan.message).toMatch(/partie de plan illisible/);
    const anglais = await avecLangue("en", () => lancerFiche(fragments, { Plan: "C1" }, { entrees: [] }));
    expect(anglais.message).toMatch(/no fragment for « C »/);
    const trop = await lancerFiche(crescendo, { Tics: 2, "Préfixe": "-/3" }, { entrees: [] });
    expect(trop.message).toMatch(/dépassent 2 tics/);
  });
});
