// plugins/esthetique.test.ts — Nœuds « Score esthétique » et « Comparaison esthétique », modèle simulé.
import "node-web-audio-api/polyfill.js";
import { afterEach, describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";

const fiche = (id: string) => registre.trouverDef(id)!;

function tampon(secondes: number, sr = 48000, valeur = 0.1): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 2, length: Math.round(secondes * sr), sampleRate: sr });
  b.getChannelData(0).fill(valeur);
  b.getChannelData(1).fill(valeur);
  return b;
}

/** Faux modèle : note chaque tranche selon sa part réelle, pour vérifier ce qui lui est passé. */
function fausseApi(options: { absent?: boolean } = {}) {
  const appels: { longueur: number; utiles: number }[] = [];
  return {
    appels,
    noterTrancheEsthetique: async ({ signal, utiles }: { signal: Float32Array; utiles: number }) => {
      appels.push({ longueur: signal.length, utiles });
      if (options.absent) return { ok: false, modeleAbsent: true, erreur: "introuvable" };
      const p = utiles / 160000;
      return { ok: true, scores: [5 + p, 6, 3 * p, 7] };
    },
  };
}

const ctx = (entrees: unknown[], signal?: AbortSignal) => {
  const progres: string[] = [];
  return {
    progres,
    entree: (i: number) => entrees[i],
    entrees: () => entrees,
    paramTexte: (_: string, d: string) => d,
    paramNombre: (_: string, d: number) => d,
    onProgress: (t: string) => progres.push(t),
    noeud: { data: {} as Record<string, any> },
    signal,
    runtime: null,
  };
};

afterEach(() => { delete (globalThis as any).window; });

describe("nœud Score esthétique", () => {
  it("est rangé dans Visualisation → Descripteurs et documenté dans les deux langues", () => {
    for (const id of ["score-esthetique", "comparaison-esthetique"]) {
      const f = fiche(id);
      // Il rend un chiffre sur le son plutôt qu'une image à regarder : sa place est avec les
      // descripteurs, où Fabien l'a rangé le 2026-09-23.
      expect([f.univers, f.famille]).toEqual(["Visualisation", "Descripteurs"]);
      expect(f.notice!.length).toBeGreaterThan(400);
      expect(f.noticeEn!.length).toBeGreaterThan(400);
    }
  });

  it("envoie une tranche de 10 s par appel et agrège en pondérant la dernière, partielle", async () => {
    const api = fausseApi();
    (globalThis as any).window = { api };
    const c = ctx([tampon(25)]);
    const r = await fiche("score-esthetique").executer(c as any);
    expect(r.erreur, r.message).toBeFalsy();
    expect(api.appels).toEqual([
      { longueur: 160000, utiles: 160000 }, { longueur: 160000, utiles: 160000 }, { longueur: 160000, utiles: 80000 },
    ]);
    const analyse = c.noeud.data._esthetique;
    // CE = 5 + p par tranche, poids 1, 1, 0,5 : (6 + 6 + 0,5 · 5,5) / 2,5 = 5,9 ; PC = 3p : (3 + 3 + 0,5 · 1,5) / 2,5 = 2,7.
    expect(analyse.global.CE).toBeCloseTo(5.9, 10);
    expect(analyse.tranches.map((t: any) => t.finSec)).toEqual([10, 20, 25]);
    expect(r.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(r.valeurs[1]).toContain("0:20–0:25");
    expect(r.message).toMatch(/CE 5\.90 · CU 6\.00 · PC 2\.70 · PQ 7\.00/);
    expect(c.progres.length).toBe(3);
  });

  it("dit que le modèle manque, avec la commande pour le récupérer", async () => {
    (globalThis as any).window = { api: fausseApi({ absent: true }) };
    const r = await fiche("score-esthetique").executer(ctx([tampon(3)]) as any);
    expect(r.erreur).toBe(true);
    expect(r.message).toMatch(/audiobox-aesthetics/);
  });

  it("refuse de tourner hors de l'application de bureau", async () => {
    const r = await fiche("score-esthetique").executer(ctx([tampon(3)]) as any);
    expect(r.erreur).toBe(true);
    expect(r.valeurs).toEqual([null, null]);
  });

  it("s'arrête entre deux tranches quand l'exécution est annulée", async () => {
    const api = fausseApi();
    (globalThis as any).window = { api };
    const controleur = new AbortController();
    const c = ctx([tampon(35)], controleur.signal);
    const original = api.noterTrancheEsthetique;
    api.noterTrancheEsthetique = async (o) => { if (api.appels.length === 1) controleur.abort(); return original(o); };
    const r = await fiche("score-esthetique").executer(c as any);
    expect(r.erreur).toBe(true);
    expect(api.appels.length).toBe(2);
  });
});

describe("nœud Comparaison esthétique", () => {
  it("note A puis B et donne l'écart B − A", async () => {
    const api = fausseApi();
    (globalThis as any).window = { api };
    const c = ctx([tampon(10), tampon(5)]);
    const r = await fiche("comparaison-esthetique").executer(c as any);
    expect(r.erreur, r.message).toBeFalsy();
    // A : une tranche pleine (CE 6, PC 3) ; B : une demi-tranche (CE 5,5, PC 1,5).
    expect(r.message).toMatch(/CE −0\.50 · CU \+0\.00 · PC −1\.50 · PQ \+0\.00/);
    expect(c.noeud.data._comparaisonEsthetique.b.dureeSec).toBe(5);
    expect(c.progres[0]).toMatch(/^A · /);
    expect(c.progres[1]).toMatch(/^B · /);
  });

  it("demande les deux versions", async () => {
    (globalThis as any).window = { api: fausseApi() };
    const r = await fiche("comparaison-esthetique").executer(ctx([tampon(3), null]) as any);
    expect(r.erreur).toBe(true);
  });
});
