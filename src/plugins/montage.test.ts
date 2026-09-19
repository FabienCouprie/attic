// plugins/montage.test.ts — Tests rapides des nœuds de montage.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";

function ctx(audio: AudioBuffer, zones: any[], action: string) {
  return {
    entree: (idx: number) => idx === 0 ? audio : zones,
    entrees: () => [audio, zones],
    paramTexte: (nom: string, def: string) => {
      const params: Record<string, string> = { Action: action };
      return params[nom] ?? def;
    },
    paramNombre: (nom: string, def: number) => {
      const params: Record<string, number> = { Fondu: 0 };
      return params[nom] ?? def;
    },
    onProgress: () => {},
    noeud: { data: {} },
    runtime: null,
  };
}

const SR = 3000;

function makeBuffer(len: number, sampleRate = SR) {
  const b = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate });
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = 1;
  return b;
}

function ctxExtraire(audio: AudioBuffer, zones: any[], mode: string, fondu = 0) {
  return {
    entree: (idx: number) => idx === 0 ? audio : zones,
    entrees: () => [audio, zones],
    paramTexte: (nom: string, def: string) => ({ Mode: mode }[nom] ?? def),
    paramNombre: (nom: string, def: number) => ({ Fondu: fondu }[nom] ?? def),
    onProgress: () => {},
    noeud: { data: {} },
    runtime: null,
  };
}

describe("montage plugin", () => {
  it("Masque de zones : Supprimer les zones coupe l'intérieur des zones", async () => {
    const f = registre.trouverDef("masque-zones")!;
    const audio = makeBuffer(SR);
    const zones = [{ debut: 0.2, duree: 0.1 }]; // samples 600..899
    const res = await f.executer(ctx(audio, zones, "mute") as any);
    expect(res.valeurs.length).toBe(1);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    const out = res.valeurs[0] as AudioBuffer;
    const d = out.getChannelData(0);
    for (let i = 0; i < SR; i++) {
      if (i >= 600 && i < 900) expect(d[i]).toBe(0);
      else expect(d[i]).toBe(1);
    }
  });

  it("Masque de zones : Conserver les zones coupe l'extérieur des zones", async () => {
    const f = registre.trouverDef("masque-zones")!;
    const audio = makeBuffer(SR);
    const zones = [{ debut: 0.2, duree: 0.1 }];
    const res = await f.executer(ctx(audio, zones, "keep") as any);
    expect(res.valeurs.length).toBe(1);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    const out = res.valeurs[0] as AudioBuffer;
    const d = out.getChannelData(0);
    for (let i = 0; i < SR; i++) {
      if (i >= 600 && i < 900) expect(d[i]).toBe(1);
      else expect(d[i]).toBe(0);
    }
  });

  it("Masque de zones : le fondu reste à l'extérieur des zones courtes", async () => {
    const f = registre.trouverDef("masque-zones")!;
    const SR_FADE = 10000;
    const audio = makeBuffer(SR_FADE, SR_FADE);
    const zones = [{ debut: 3000 / SR_FADE, duree: 15 / SR_FADE }];
    const ctxFade = (action: string) => ({
      entree: (idx: number) => idx === 0 ? audio : zones,
      entrees: () => [audio, zones],
      paramTexte: (nom: string, def: string) => ({ Action: action }[nom] ?? def),
      paramNombre: (nom: string, def: number) => ({ Fondu: 20 }[nom] ?? def),
      onProgress: () => {},
      noeud: { data: {} },
      runtime: null,
    });

    const resSupprimer = await f.executer(ctxFade("mute") as any);
    const outSupprimer = resSupprimer.valeurs[0] as AudioBuffer;
    const dSupprimer = outSupprimer.getChannelData(0);
    for (let i = 3000; i < 3015; i++) expect(dSupprimer[i]).toBe(0);
    for (let i = 0; i < 2900; i++) expect(dSupprimer[i]).toBe(1);
    for (let i = 3115; i < SR_FADE; i++) expect(dSupprimer[i]).toBe(1);

    const resConserver = await f.executer(ctxFade("keep") as any);
    const outConserver = resConserver.valeurs[0] as AudioBuffer;
    const dConserver = outConserver.getChannelData(0);
    for (let i = 3000; i < 3015; i++) expect(dConserver[i]).toBe(1);
    for (let i = 0; i < 2900; i++) expect(dConserver[i]).toBe(0);
    for (let i = 3115; i < SR_FADE; i++) expect(dConserver[i]).toBe(0);
  });

  it("Extraire zones : concatène les zones sélectionnées", async () => {
    const f = registre.trouverDef("extraire-zones-selecteur")!;
    const audio = makeBuffer(SR);
    const zones = [{ debut: 0.1, duree: 0.1 }, { debut: 0.5, duree: 0.1 }]; // 300..599, 1500..1799
    const res = await f.executer(ctxExtraire(audio, zones, "selected") as any);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(res.valeurs[1]).toHaveLength(2);
    const out = res.valeurs[0] as AudioBuffer;
    expect(out.duration).toBeCloseTo(0.2, 2);
    const d = out.getChannelData(0);
    for (let i = 0; i < d.length; i++) expect(d[i]).toBe(1);
  });

  it("Extraire zones : mode inverse ne conserve que les zones non sélectionnées", async () => {
    const f = registre.trouverDef("extraire-zones-selecteur")!;
    const audio = makeBuffer(SR);
    const zones = [{ debut: 0.2, duree: 0.1 }]; // 600..899
    const res = await f.executer(ctxExtraire(audio, zones, "unselected") as any);
    const out = res.valeurs[0] as AudioBuffer;
    expect(out.duration).toBeCloseTo(1 - 0.1, 2); // 0.9s
    const d = out.getChannelData(0);
    expect(d.length).toBe(2700);
    expect(d[0]).toBe(1);
    expect(d[599]).toBe(1);
    expect(d[600]).toBe(1);
    expect(d[d.length - 1]).toBe(1);
  });

  it("Extraire zones : retourne une erreur si aucune zone n'est connectée", async () => {
    const f = registre.trouverDef("extraire-zones-selecteur")!;
    const audio = makeBuffer(SR);
    const res = await f.executer(ctxExtraire(audio, [], "selected") as any);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toContain("Aucune zone");
  });
});

// Les trois fins de boucle reçoivent EXACTEMENT la même chose — une arête par tour, dans
// l'ordre des tours, le dépliage ne les distinguant pas (core/boucle-graphe.ts). Ce qui les
// sépare est ce qu'elles en font, et c'est donc cela, et seulement cela, qu'on éprouve ici,
// sur les mêmes entrées pour les trois.
describe("fins de boucle A, B et C", () => {
  const SR_B = 8000;

  /** Un tour : une valeur constante reconnaissable, et sa propre durée. */
  function tour(valeur: number, duree: number) {
    const b = new AudioBuffer({ numberOfChannels: 1, length: Math.round(duree * SR_B), sampleRate: SR_B });
    b.getChannelData(0).fill(valeur);
    return b;
  }

  const ctxBoucle = (tours: AudioBuffer[], params: Record<string, number> = {}) => ({
    entree: (i: number) => tours[i] ?? null,
    entrees: () => tours,
    paramTexte: (_nom: string, def: string) => def,
    paramNombre: (nom: string, def: number) => params[nom] ?? def,
    onProgress: () => {},
    noeud: { data: {} },
    runtime: null,
  });

  const trois = () => [tour(1, 0.5), tour(0.5, 0.5), tour(0.25, 0.25)];

  it("A met les tours bout à bout : la durée est leur somme", async () => {
    const f = registre.trouverDef("boucle-graphe-fin")!;
    const res = await f.executer(ctxBoucle(trois()) as any);
    const out = res.valeurs[0] as AudioBuffer;
    expect(out.duration).toBeCloseTo(0.5 + 0.5 + 0.25, 2);
    // Et les tours sont dans l'ordre : on retrouve chaque valeur à sa place.
    const d = out.getChannelData(0);
    expect(d[10]).toBeCloseTo(1, 2);
    expect(d[Math.round(0.6 * SR_B)]).toBeCloseTo(0.5, 2);
    expect(d[Math.round(1.1 * SR_B)]).toBeCloseTo(0.25, 2);
    expect(res.message).toContain("3");
  });

  it("B ne garde que le dernier tour — le même objet, sans le retoucher", async () => {
    const f = registre.trouverDef("boucle-graphe-fin-b")!;
    const tours = trois();
    const res = await f.executer(ctxBoucle(tours) as any);
    expect(res.valeurs[0]).toBe(tours[2]);
    const out = res.valeurs[0] as AudioBuffer;
    expect(out.duration).toBeCloseTo(0.25, 2);
    expect(out.getChannelData(0)[0]).toBeCloseTo(0.25, 5);
    expect(res.message).toContain("3");
  });

  it("C empile les tours : la durée est celle du plus long, et les tours s'additionnent", async () => {
    const f = registre.trouverDef("boucle-graphe-fin-c")!;
    const res = await f.executer(ctxBoucle(trois()) as any);
    const out = res.valeurs[0] as AudioBuffer;
    // Le plus long tour fait 0,5 s : la somme ne s'allonge pas, contrairement à A.
    expect(out.duration).toBeCloseTo(0.5, 2);
    const d = out.getChannelData(0);
    expect(d[10]).toBeCloseTo(1 + 0.5 + 0.25, 2);      // les trois sonnent ensemble
    expect(d[Math.round(0.4 * SR_B)]).toBeCloseTo(1 + 0.5, 2); // le troisième est fini
  });

  it("C annonce la crête, parce qu'empiler des tours dépasse 1 sans le dire", async () => {
    const f = registre.trouverDef("boucle-graphe-fin-c")!;
    const res = await f.executer(ctxBoucle([tour(1, 0.2), tour(1, 0.2)]) as any);
    expect(res.message).toContain("2.00");
  });

  it("C baisse la somme quand on le lui demande", async () => {
    const f = registre.trouverDef("boucle-graphe-fin-c")!;
    const res = await f.executer(ctxBoucle([tour(1, 0.2), tour(1, 0.2)], { Niveau: -6 }) as any);
    const out = res.valeurs[0] as AudioBuffer;
    expect(out.getChannelData(0)[10]).toBeCloseTo(2 * Math.pow(10, -6 / 20), 2);
  });

  for (const id of ["boucle-graphe-fin", "boucle-graphe-fin-b", "boucle-graphe-fin-c"]) {
    it(`${id} : le dit plutôt que de rendre du vide quand rien n'arrive`, async () => {
      const f = registre.trouverDef(id)!;
      const res = await f.executer(ctxBoucle([]) as any);
      expect(res.valeurs[0]).toBeNull();
      expect(res.message).toBeTruthy();
    });
  }

  it("l'identifiant historique de A reste résolu, pour les graphes déjà enregistrés", () => {
    expect(registre.trouverDef("boucle-graphe-fin-a")?.id).toBe("boucle-graphe-fin");
  });
});
