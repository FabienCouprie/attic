// plugins/moebius.test.ts — Le nœud « Anneau de Möbius » par le registre, comme
// le moteur l'appelle. La géométrie elle-même est testée dans audio/moebius.test.ts.
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

const mono = (secondes: number) => {
  const b = new AudioBuffer({ numberOfChannels: 1, length: Math.round(secondes * SR), sampleRate: SR });
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * 330 * i) / SR);
  return b;
};

describe("nœud Anneau de Möbius", () => {
  const fiche = () => registre.trouverDef("anneau-moebius")!;

  it("est enregistré, avec sa notice dans les deux langues", () => {
    const f = fiche();
    expect(f).toBeDefined();
    expect(f.notice!.length).toBeGreaterThan(100);
    expect(f.noticeEn!.length).toBeGreaterThan(100);
  });

  it("rend de la stéréo à partir d'un son mono, sur la durée des tours et coutures", async () => {
    const res = await fiche().executer(ctxParams(mono(2), { Tours: 2, Fondu: 30 }) as any);
    const out = res.valeurs[0] as AudioBuffer;
    expect(out.numberOfChannels).toBe(2);
    const fondu = Math.round(0.03 * SR);
    expect(out.length).toBe(2 * (2 * SR - fondu) + fondu);
    expect(res.message).toContain("anneau refermé");
    expect(res.message).toContain("bord");
  });

  it("annonce un nombre impair de tours comme finissant sur l'autre face", async () => {
    const res = await fiche().executer(ctxParams(mono(1), { Tours: 3 }) as any);
    expect(res.message).toContain("autre face");
  });

  it("donne sur la face Phase le décalage de fréquence équivalent", async () => {
    // Accepter le libellé affiché comme l'id : c'est ce que reçoit un projet
    // enregistré dans l'autre langue, avant canonisation.
    const res = await fiche().executer(ctxParams(mono(2), { Face: "phase", Tours: 2, Fondu: 0 }) as any);
    expect((res.valeurs[0] as AudioBuffer).numberOfChannels).toBe(1);
    expect(res.message).toMatch(/0\.250 Hz/);
  });

  it("refuse une sortie trop longue avant d'allouer quoi que ce soit", async () => {
    // Un buffer de 5 minutes sur 8 tours : 40 minutes de sortie.
    const long = new AudioBuffer({ numberOfChannels: 1, length: 300 * SR, sampleRate: SR });
    const res = await fiche().executer(ctxParams(long, { Tours: 8 }) as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toMatch(/40 min/);
  });

  it("signale l'absence d'entrée", async () => {
    const res = await fiche().executer(ctxParams(null, {}) as any);
    expect(res.erreur).toBe(true);
  });
});
