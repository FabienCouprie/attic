// audio/grains.test.ts — La détection, éprouvée sur des sons dont on connaît la réponse.
//
// TOUT LE NŒUD REPOSE SUR CE TEST. Les manipulations sont triviales — filtrer, inverser, répéter
// une liste — et ne valent rien si les frontières sont fausses : retirer « une frappe sur deux »
// d'un rythme où l'on a détecté treize frappes pour huit ne retire rien de reconnaissable. La
// détection est donc mesurée sur des signaux construits, où le nombre de grains est connu d'avance.
//
// LE CAS QUI COMPTE EST CELUI DU ROULEMENT. Huit frappes dont les queues ne redescendent jamais
// sous le seuil : la règle de niveau, seule, rend UN grain de deux secondes — réponse juste et
// inutile. C'est exactement là que le procédé sert, et c'est pour cela que la règle d'attaque
// existe. Le test le vérifie dans les deux sens : avec la règle, huit ; sans elle, un.
//
// LE SECOND : CE QUI NE DOIT PAS ÊTRE DÉCOUPÉ. Une sinusoïde tenue est un grain, pas huit cent
// quatre-vingts — c'est la faute qu'un examen échantillon par échantillon commettrait. Du bruit
// blanc est un grain aussi, malgré une enveloppe qui tremble sans cesse.
import { describe, expect, it } from "vitest";
import {
  ESPACEMENTS, OPERATIONS, detecterGrains, monter, planMontage, rapportGrains, transformerGrains,
  type Grain,
} from "./grains";

const SR = 44100;

const DETECTION = { frequence: SR, seuilDb: -45, ecartMinMs: 30, monteeDb: 9 };

/** Un signal vide de `dureeSec` secondes. */
const vide = (dureeSec: number) => new Float32Array(Math.round(dureeSec * SR));

/** Pose une frappe : une sinusoïde de 200 Hz sous une décroissance exponentielle. */
function frappe(x: Float32Array, instantSec: number, dureeSec: number, amplitude = 0.8, tenue = 0.05) {
  const debut = Math.round(instantSec * SR);
  const n = Math.round(dureeSec * SR);
  for (let i = 0; i < n && debut + i < x.length; i++) {
    x[debut + i] += amplitude * Math.exp(-i / (tenue * SR)) * Math.sin((2 * Math.PI * 200 * i) / SR);
  }
}

/** Huit frappes bien séparées : du silence entre chacune. */
function huitFrappesSeparees(): Float32Array {
  const x = vide(2);
  for (let k = 0; k < 8; k++) frappe(x, 0.05 + k * 0.24, 0.12, 0.8, 0.02);
  return x;
}

/** Huit frappes dont les queues se rejoignent : l'enveloppe ne redescend jamais au silence. */
function roulement(): Float32Array {
  const x = vide(2);
  for (let k = 0; k < 8; k++) frappe(x, 0.05 + k * 0.24, 0.30, 0.8, 0.25);
  return x;
}

describe("la détection des grains", () => {
  it("compte huit frappes séparées par du silence", () => {
    expect(detecterGrains(huitFrappesSeparees(), DETECTION)).toHaveLength(8);
  });

  it("LE ROULEMENT : huit frappes dont les queues se touchent, et la règle d'attaque les retrouve", () => {
    const x = roulement();
    // Les frappes tombent toutes les 240 ms sous une décroissance de 250 ms : entre deux d'entre
    // elles, l'enveloppe ne retombe que de 8,4 décibels. La sensibilité doit donc être RÉGLÉE SOUS
    // CET ÉCART pour les séparer, et c'est tout l'objet de ce réglage : il se tend vers le son
    // qu'on lui donne, il ne devine pas.
    expect(detecterGrains(x, { ...DETECTION, monteeDb: 6 })).toHaveLength(8);
    // À neuf décibels, une frappe se cache dans la queue de la précédente : sept au lieu de huit.
    expect(detecterGrains(x, { ...DETECTION, monteeDb: 9 }).length).toBeLessThan(8);
    // Sans la règle d'attaque, le niveau seul n'en voit qu'un : c'est la raison d'être de la règle.
    expect(detecterGrains(x, { ...DETECTION, monteeDb: 0 })).toHaveLength(1);
  });

  it("UNE SINUSOÏDE TENUE EST UN GRAIN, et non huit cent quatre-vingts", () => {
    const x = vide(1);
    for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / SR);
    expect(detecterGrains(x, DETECTION)).toHaveLength(1);
  });

  it("du bruit est un grain aussi, malgré une enveloppe qui tremble", () => {
    const x = vide(1);
    let graine = 1;
    for (let i = 0; i < x.length; i++) {
      graine = (graine * 16807) % 2147483647;
      x[i] = (graine / 2147483647 - 0.5) * 0.6;
    }
    expect(detecterGrains(x, DETECTION).length).toBeLessThanOrEqual(2);
  });

  it("le silence ne contient aucun grain, et ne fait pas lever", () => {
    expect(detecterGrains(vide(1), DETECTION)).toEqual([]);
    expect(detecterGrains(new Float32Array(0), DETECTION)).toEqual([]);
  });

  it("L'ÉCART MINIMAL EMPÊCHE UNE FRAPPE DE SE COUPER EN TROIS : l'enveloppe tremble à l'attaque", () => {
    const x = huitFrappesSeparees();
    // À écart minimal presque nul, la montée de l'attaque se relit plusieurs fois.
    expect(detecterGrains(x, { ...DETECTION, ecartMinMs: 0.1 }).length).toBeGreaterThanOrEqual(8);
    expect(detecterGrains(x, DETECTION)).toHaveLength(8);
  });

  it("un seuil trop haut ne trouve que les frappes fortes", () => {
    const x = vide(1);
    frappe(x, 0.1, 0.2, 0.8);
    frappe(x, 0.5, 0.2, 0.02);
    expect(detecterGrains(x, DETECTION)).toHaveLength(2);
    expect(detecterGrains(x, { ...DETECTION, seuilDb: -20 })).toHaveLength(1);
  });

  it("les grains se suivent sans se chevaucher, et chacun porte sa crête", () => {
    for (const g of detecterGrains(huitFrappesSeparees(), DETECTION)) {
      expect(g.fin).toBeGreaterThan(g.debut);
      expect(g.creteDb).toBeGreaterThan(-45);
      expect(g.creteDb).toBeLessThan(0);
    }
    const grains = detecterGrains(roulement(), DETECTION);
    for (let i = 1; i < grains.length; i++) expect(grains[i].debut).toBeGreaterThanOrEqual(grains[i - 1].fin);
  });
});

describe("ce qu'on fait de la liste", () => {
  const grains: Grain[] = Array.from({ length: 8 }, (_, i) => ({ debut: i * 1000, fin: i * 1000 + 500, creteDb: -6 }));
  const sansHasard = { garder: 1, sur: 2, repetitions: 2, aleatoire: () => 0.5 };

  it("compter ne change rien : c'est déjà un service", () => {
    expect(transformerGrains(grains, { ...sansHasard, operation: "compter" })).toEqual(grains);
  });

  it("garder un sur deux en laisse la moitié, dans l'ordre", () => {
    const r = transformerGrains(grains, { ...sansHasard, operation: "garder", garder: 1, sur: 2 });
    expect(r).toHaveLength(4);
    expect(r.map((g) => g.debut)).toEqual([0, 2000, 4000, 6000]);
  });

  it("garder deux sur trois, et les cas absurdes bornés plutôt que transmis", () => {
    expect(transformerGrains(grains, { ...sansHasard, operation: "garder", garder: 2, sur: 3 })).toHaveLength(6);
    expect(transformerGrains(grains, { ...sansHasard, operation: "garder", garder: 9, sur: 2 })).toHaveLength(8);
    expect(transformerGrains(grains, { ...sansHasard, operation: "garder", garder: 0, sur: 2 })).toHaveLength(0);
  });

  it("inverser rend l'ordre à l'envers, chaque grain restant à l'endroit", () => {
    const r = transformerGrains(grains, { ...sansHasard, operation: "inverser" });
    expect(r[0].debut).toBe(7000);
    expect(r[7].debut).toBe(0);
    // Le grain lui-même n'est pas retourné : on inverse la suite, pas le son.
    expect(r[0].fin - r[0].debut).toBe(500);
  });

  it("répéter n'en perd aucun et les multiplie", () => {
    const r = transformerGrains(grains, { ...sansHasard, operation: "repeter", repetitions: 3 });
    expect(r).toHaveLength(24);
    expect(r.slice(0, 3).every((g) => g.debut === 0)).toBe(true);
  });

  it("MÉLANGER NE PERD NI NE DOUBLE AUCUN GRAIN", () => {
    let graine = 7;
    const aleatoire = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
    const r = transformerGrains(grains, { ...sansHasard, operation: "melanger", aleatoire });
    expect(r).toHaveLength(8);
    expect([...r].sort((a, b) => a.debut - b.debut)).toEqual(grains);
  });

  it("la liste vide traverse toutes les opérations sans erreur", () => {
    for (const o of OPERATIONS) {
      expect(transformerGrains([], { ...sansHasard, operation: o.id }), o.id).toEqual([]);
    }
  });
});

describe("le montage", () => {
  const grains: Grain[] = [
    { debut: 0, fin: 100, creteDb: -6 },
    { debut: 1000, fin: 1100, creteDb: -6 },
    { debut: 2000, fin: 2100, creteDb: -6 },
  ];

  it("SUR PLACE : les grains gardés retombent à LEUR instant, et le trou reste", () => {
    // Le défaut corrigé : sans cela, deux grains gardés sur trois se tassaient sur les deux
    // premières places et la fin du son devenait vide — le rythme disparaît.
    const gardes = [grains[0], grains[2]];
    expect(planMontage(grains, gardes, "origine", true).map((p) => p.instant)).toEqual([0, 2000]);
    // Par cases, au contraire, ils se tassent : c'est ce qu'il faut à un mélange.
    expect(planMontage(grains, gardes, "origine", false).map((p) => p.instant)).toEqual([0, 1000]);
  });

  it("PAR CASES, un mélange change vraiment quelque chose ; sur place, il ne changerait rien", () => {
    const melanges = [grains[2], grains[0], grains[1]];
    expect(planMontage(grains, melanges, "origine", false).map((p) => p.instant)).toEqual([0, 1000, 2000]);
    // Sur place, chaque grain reviendrait à son propre départ : le mélange serait sans effet.
    expect(planMontage(grains, melanges, "origine", true).map((p) => p.instant)).toEqual([2000, 0, 1000]);
  });

  it("les copies d'un même grain bégaient au lieu de s'empiler", () => {
    const deux = [grains[0], grains[0], grains[0]];
    expect(planMontage(grains, deux, "origine", true).map((p) => p.instant)).toEqual([0, 100, 200]);
  });

  it("SERRÉ : les grains se recollent bout à bout, et la durée tombe", () => {
    const plan = planMontage(grains, grains, "serre");
    expect(plan.map((p) => p.instant)).toEqual([0, 100, 200]);
  });

  it("une répétition qui dépasse la liste d'origine continue au rythme connu", () => {
    const joues = [...grains, ...grains];
    const plan = planMontage(grains, joues, "origine");
    // Les trois premiers à leur place, les suivants espacés de l'écart moyen — mille échantillons.
    expect(plan.slice(0, 3).map((p) => p.instant)).toEqual([0, 1000, 2000]);
    expect(plan[3].instant).toBe(3000);
    expect(plan[5].instant).toBe(5000);
  });

  it("LES GRAINS SUPERPOSÉS S'ADDITIONNENT au lieu de se remplacer", () => {
    const canal = new Float32Array(3000).fill(0.25);
    const [sortie] = monter([canal], [
      { grain: grains[0], instant: 0 },
      { grain: grains[1], instant: 0 },
    ]);
    expect(sortie[0]).toBeCloseTo(0.5, 6);
  });

  it("tous les canaux sortent de la même longueur", () => {
    const a = new Float32Array(3000).fill(0.2);
    const b = new Float32Array(3000).fill(-0.2);
    const sorties = monter([a, b], planMontage(grains, grains, "serre"));
    expect(sorties[0].length).toBe(sorties[1].length);
    expect(sorties[0].length).toBe(300);
  });

  it("un plan vide rend du silence plutôt qu'une erreur", () => {
    const [sortie] = monter([new Float32Array(100)], [], 50);
    expect(sortie.length).toBe(50);
  });

  it("les deux espacements sont déclarés, et se distinguent", () => {
    expect(ESPACEMENTS.map((e) => e.id)).toEqual(["origine", "serre"]);
  });
});

describe("le rapport", () => {
  it("dit ce qu'il faut pour juger la détection avant l'effet", () => {
    const grains = detecterGrains(huitFrappesSeparees(), DETECTION);
    const r = rapportGrains(grains, grains, SR);
    expect(r.trouves).toBe(8);
    expect(r.joues).toBe(8);
    // Les frappes sont posées toutes les 240 ms.
    expect(r.ecartMoyenMs).toBeCloseTo(240, 0);
    expect(r.dureeMoyenneMs).toBeGreaterThan(0);
  });

  it("ne divise pas par zéro sur zéro ou un seul grain", () => {
    expect(rapportGrains([], [], SR)).toEqual({ trouves: 0, joues: 0, dureeMoyenneMs: 0, ecartMoyenMs: 0 });
    const un: Grain[] = [{ debut: 0, fin: 441, creteDb: -6 }];
    expect(rapportGrains(un, un, SR).ecartMoyenMs).toBe(0);
    expect(rapportGrains(un, un, SR).dureeMoyenneMs).toBeCloseTo(10, 6);
  });
});
