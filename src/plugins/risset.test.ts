// plugins/risset.test.ts — Câblage du nœud : les paramètres de l'inspecteur
// doivent réellement atteindre le moteur. Le DSP lui-même est couvert par
// audio/risset.test.ts.
import { describe, it, expect } from "vitest";
import "node-web-audio-api/polyfill.js";
import { registre } from "../audio/adaptateur";

const fiche = registre.trouverDef("glissando-risset")!;

function source(sr = 8000, dureeSec = 0.5): AudioBuffer {
  const n = Math.round(sr * dureeSec);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.sin((2 * Math.PI * 300 * i) / sr);
  return b;
}

function ctxDe(params: Record<string, string | number> = {}, entree: unknown = source()) {
  return {
    entree: () => entree,
    paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
    paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
    onProgress: () => {},
  } as any;
}

describe("nœud Glissando de Risset", () => {
  it("refuse poliment une entrée absente", async () => {
    const res = await fiche.executer(ctxDe({}, null));
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toBeTruthy();
  });

  it("la Durée pilote bien la longueur du son produit", async () => {
    const res = await fiche.executer(ctxDe({ "Durée": 3 }));
    expect((res.valeurs[0] as AudioBuffer).duration).toBeCloseTo(3, 3);
  });

  it("le Mode atteint le moteur : les deux réglages ne produisent pas le même son", async () => {
    // Sans ce test, une faute de frappe sur le nom du paramètre laisserait le
    // nœud toujours en mode « bande » sans que rien ne le signale.
    const bande = (await fiche.executer(ctxDe({ "Mode": "bande", "Durée": 1 }))).valeurs[0] as AudioBuffer;
    const hauteur = (await fiche.executer(ctxDe({ "Mode": "hauteur", "Durée": 1 }))).valeurs[0] as AudioBuffer;
    const a = bande.getChannelData(0), b = hauteur.getChannelData(0);
    let ecart = 0;
    for (let i = 0; i < a.length; i++) ecart += Math.abs(a[i] - b[i]);
    expect(ecart / a.length).toBeGreaterThan(1e-3);
  });

  it("le message rend compte du sens et du mode choisis", async () => {
    const res = await fiche.executer(ctxDe({ "Sens": "ascendant", "Mode": "hauteur", "Durée": 1 }));
    expect(res.message).toMatch(/ascendant/i);
    expect(res.message).toMatch(/hauteur/i);
    // Le marqueur brut d'une clé à variable non substituée ne doit jamais sortir.
    expect(res.message).not.toMatch(/__VAR_/);
  });

  it("tous les paramètres de choix portent des identifiants stables", () => {
    for (const p of fiche.parametres ?? []) {
      if (p.type === "choix") expect(p.optionIds, `${p.nom} sans optionIds`).toBeDefined();
    }
  });
});

const ficheRythme = registre.trouverDef("rythme-risset")!;

describe("nœud Rythme de Risset", () => {
  it("refuse poliment une entrée absente", async () => {
    const res = await ficheRythme.executer(ctxDe({}, null));
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toBeTruthy();
  });

  it("la Durée pilote la longueur du son produit", async () => {
    const res = await ficheRythme.executer(ctxDe({ "Durée": 2 }));
    expect((res.valeurs[0] as AudioBuffer).duration).toBeCloseTo(2, 3);
  });

  it("le Sens atteint le moteur", async () => {
    const a = (await ficheRythme.executer(ctxDe({ "Sens": "accelerant", "Durée": 1 }))).valeurs[0] as AudioBuffer;
    const b = (await ficheRythme.executer(ctxDe({ "Sens": "ralentissant", "Durée": 1 }))).valeurs[0] as AudioBuffer;
    const x = a.getChannelData(0), y = b.getChannelData(0);
    let ecart = 0;
    for (let i = 0; i < x.length; i++) ecart += Math.abs(x[i] - y[i]);
    expect(ecart / x.length).toBeGreaterThan(1e-3);
  });

  it("le message rend compte du sens, sans marqueur brut", async () => {
    const res = await ficheRythme.executer(ctxDe({ "Sens": "ralentissant", "Durée": 1 }));
    expect(res.message).toMatch(/ralentissant/i);
    expect(res.message).not.toMatch(/__VAR_/);
  });

  it("tous ses paramètres de choix portent des identifiants stables", () => {
    for (const p of ficheRythme.parametres ?? []) {
      if (p.type === "choix") expect(p.optionIds, `${p.nom} sans optionIds`).toBeDefined();
    }
  });
});

const ficheCloche = registre.trouverDef("cloche-risset")!;

describe("nœud Cloche de Risset", () => {
  /** Ce nœud est un générateur : pas d'entrée, mais un AudioContext dans `runtime`. */
  function ctxCloche(params: Record<string, number> = {}, sampleRate = 22050) {
    return {
      runtime: { sampleRate },
      entree: () => null,
      paramTexte: (_: string, d: string) => d,
      paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
      onProgress: () => {},
    } as any;
  }

  it("génère sans aucune entrée", async () => {
    expect(ficheCloche.entrees).toHaveLength(0);
    const res = await ficheCloche.executer(ctxCloche({ "Durée": 1 }));
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
  });

  it("génère à la fréquence d'échantillonnage du graphe, pas à une valeur figée", async () => {
    // Le nœud lisait `ctx.sampleRate`, absent du contexte : il retombait
    // silencieusement sur 44 100 quelle que soit la carte son.
    const res = await ficheCloche.executer(ctxCloche({ "Durée": 1 }, 48000));
    expect((res.valeurs[0] as AudioBuffer).sampleRate).toBe(48000);
  });

  it("la Durée pilote la longueur produite", async () => {
    const res = await ficheCloche.executer(ctxCloche({ "Durée": 2 }, 22050));
    expect((res.valeurs[0] as AudioBuffer).duration).toBeCloseTo(2, 3);
  });

  it("l'Inharmonicité atteint le moteur : à 0 %, le son change du tout au tout", async () => {
    const cloche = (await ficheCloche.executer(ctxCloche({ "Durée": 1, "Inharmonicité": 100 }))).valeurs[0] as AudioBuffer;
    const orgue = (await ficheCloche.executer(ctxCloche({ "Durée": 1, "Inharmonicité": 0 }))).valeurs[0] as AudioBuffer;
    const a = cloche.getChannelData(0), b = orgue.getChannelData(0);
    let ecart = 0;
    for (let i = 0; i < a.length; i++) ecart += Math.abs(a[i] - b[i]);
    expect(ecart / a.length).toBeGreaterThan(1e-3);
  });

  it("le message rend compte des réglages, sans marqueur brut", async () => {
    const res = await ficheCloche.executer(ctxCloche({ "Fréquence": 523, "Durée": 1 }));
    expect(res.message).toMatch(/523/);
    expect(res.message).not.toMatch(/__VAR_/);
  });
});
