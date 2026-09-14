// plugins/geometrie.test.ts — Les six nœuds géométriques par le registre, comme
// le moteur les appelle. Chaque propriété est testée sur le signal dans
// audio/*.test.ts ; ici on vérifie l'enregistrement, la lecture des réglages
// (dont les choix passés par leur id canonique), les messages et les refus.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";

const SR = 44100;

const ctxParams = (entree: unknown, params: Record<string, string | number>) => ({
  entree: () => entree,
  entrees: () => [entree],
  paramTexte: (nom: string, def: string) => String(params[nom] ?? def),
  paramNombre: (nom: string, def: number) => Number(params[nom] ?? def),
  onProgress: () => {},
  noeud: { data: {} },
  runtime: null,
});

const son = (secondes: number) => {
  const b = new AudioBuffer({ numberOfChannels: 1, length: Math.round(secondes * SR), sampleRate: SR });
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = 0.3 * Math.sin((2 * Math.PI * 330 * i) / SR) + 0.2 * Math.sin((2 * Math.PI * 3300 * i) / SR);
  return b;
};

const IDS = ["tore", "bouteille-klein", "tresse", "ceinture-dirac", "miroir-inversion", "poussiere-cantor"];

describe("les nœuds géométriques", () => {
  it.each(IDS)("%s est enregistré, avec notice et documentation de chaque paramètre dans les deux langues", (id) => {
    const f = registre.trouverDef(id)!;
    expect(f).toBeDefined();
    expect(f.notice!.length).toBeGreaterThan(200);
    expect(f.noticeEn!.length).toBeGreaterThan(200);
    for (const p of f.parametres ?? []) {
      expect(p.doc, `${id} · ${p.nom}`).toBeTruthy();
      expect(p.docEn, `${id} · ${p.nom}`).toBeTruthy();
    }
  });

  it.each(IDS)("%s signale l'absence d'entrée", async (id) => {
    const res = await registre.trouverDef(id)!.executer(ctxParams(null, {}) as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBeNull();
  });

  it.each(IDS)("%s rend de l'audio avec ses réglages par défaut", async (id) => {
    // Klein et Dirac demandent une durée : on la raccourcit pour le test.
    const res = await registre.trouverDef(id)!.executer(ctxParams(son(1), { "Durée": 4 }) as any);
    expect(res.erreur).toBeFalsy();
    const out = res.valeurs[0] as AudioBuffer;
    expect(out).toBeInstanceOf(AudioBuffer);
    expect(out.length).toBeGreaterThan(0);
    expect(typeof res.message).toBe("string");
    let pic = 0;
    for (let c = 0; c < out.numberOfChannels; c++) for (const v of out.getChannelData(c)) pic = Math.max(pic, Math.abs(v));
    expect(pic).toBeGreaterThan(0.01);
    expect(Number.isFinite(pic)).toBe(true);
  });
});

describe("messages et refus", () => {
  it("Tore : dit « jamais » pour le nombre d'or, avec le tour du plus proche retour", async () => {
    const res = await registre.trouverDef("tore")!.executer(ctxParams(son(0.5), { Rapport: "or", Tours: 8 }) as any);
    expect(res.message).toMatch(/jamais/);
    expect(res.message).toMatch(/tour 8/);
  });

  it("Tore : dit « refermée » quand les tours sont un multiple de q", async () => {
    const res = await registre.trouverDef("tore")!.executer(ctxParams(son(0.5), { Rapport: "2:3", Tours: 6 }) as any);
    expect(res.message).toMatch(/refermée/);
  });

  it("Tresse : refuse un mot invalide en nommant le jeton fautif", async () => {
    const res = await registre.trouverDef("tresse")!.executer(ctxParams(son(1), { Mot: "1 5" }) as any);
    expect(res.erreur).toBe(true);
    expect(res.message).toContain("« 5 »");
  });

  it("Tresse : lit 4 brins par l'id canonique", async () => {
    const res = await registre.trouverDef("tresse")!.executer(ctxParams(son(1), { Brins: "4", Mot: "1 2 3", "Répétitions": 4 }) as any);
    expect(res.message).toMatch(/^4 brins/);
    expect(res.message).toMatch(/revenus/);
  });

  it("Bouteille de Klein : prévient quand la durée coupe le retour complet", async () => {
    const res = await registre.trouverDef("bouteille-klein")!.executer(ctxParams(son(1), { "Durée": 5, Cycle: 3, Octaves: 4 }) as any);
    expect(res.message).toMatch(/trop courte/);
    expect(res.message).toMatch(/24\.0 s/);
  });

  it("Ceinture de Dirac : dit que sans témoin le changement de signe est inaudible", async () => {
    const res = await registre.trouverDef("ceinture-dirac")!.executer(ctxParams(son(1), { "Témoin": 0 }) as any);
    expect(res.message).toMatch(/inaudible/);
  });

  it("Miroir : chiffre l'énergie perdue", async () => {
    const res = await registre.trouverDef("miroir-inversion")!.executer(ctxParams(son(1), {}) as any);
    expect(res.message).toMatch(/% de l'énergie perdue/);
  });

  it("Poussière de Cantor : donne fragments, durée et part gardée", async () => {
    const res = await registre.trouverDef("poussiere-cantor")!.executer(ctxParams(son(1), { "Étages": 3, Mode: "dernier" }) as any);
    expect(res.message).toMatch(/^3 étages · 8 fragments de 37\.0 ms · 30 %/);
    expect((res.valeurs[0] as AudioBuffer).length).toBe(SR);
  });

  it("Tore, Dirac et Cantor refusent une sortie de plus de 20 minutes avant d'allouer", async () => {
    const long = new AudioBuffer({ numberOfChannels: 1, length: 300 * SR, sampleRate: SR });
    for (const [id, p] of [["tore", { Tours: 13 }], ["ceinture-dirac", { Tours: 8 }], ["poussiere-cantor", { "Étages": 7 }]] as const) {
      const res = await registre.trouverDef(id)!.executer(ctxParams(long, p) as any);
      expect(res.erreur, id).toBe(true);
      expect(res.message, id).toMatch(/min/);
    }
  });
});
