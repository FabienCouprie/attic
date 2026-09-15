// audio/moebius.test.ts — L'anneau de Möbius, mesuré sur le signal produit.
//
// Les assertions portent sur ce que la géométrie promet, et non sur la formule :
// après UN tour gauche et droite sont échangées, après DEUX tours tout revient,
// et à mi-tour l'image ne s'écrase pas au centre. Chaque propriété se mesure en
// énergie ou en corrélation sur une fenêtre de la sortie.
import { describe, it, expect } from "vitest";
import { planMoebius, tordre, DUREE_SORTIE_MAX_SEC } from "./moebius";
import { quadrature, bouclerAvecFondu } from "./geometrie-sonore";

const SR = 44100;

const sinus = (f: number, n: number, sr = SR) => {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.sin((2 * Math.PI * f * i) / sr);
  return a;
};

const bruit = (n: number, graine = 12345) => {
  const a = new Float32Array(n);
  let g = graine;
  for (let i = 0; i < n; i++) { g = (g * 1103515245 + 12345) & 0x7fffffff; a[i] = 0.5 * (g / 0x3fffffff - 1); }
  return a;
};

/** Énergie d'une fenêtre centrée sur `centre`. */
const energie = (a: Float32Array, centre: number, demi = 1024) => {
  let s = 0;
  for (let i = Math.max(0, centre - demi); i < Math.min(a.length, centre + demi); i++) s += a[i] * a[i];
  return s;
};

const correlation = (a: Float32Array, b: Float32Array, centre: number, demi = 1024) => {
  let ab = 0, aa = 0, bb = 0;
  for (let i = centre - demi; i < centre + demi; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return ab / Math.sqrt(aa * bb);
};

/** Amplitude d'une fréquence dans une fenêtre, par projection sur sin et cos. */
const amplitude = (a: Float32Array, f: number, centre: number, demi = 2048) => {
  let s = 0, c = 0, n = 0;
  for (let i = centre - demi; i < centre + demi; i++) {
    const w = (2 * Math.PI * f * i) / SR;
    s += a[i] * Math.sin(w); c += a[i] * Math.cos(w); n++;
  }
  return (2 * Math.hypot(s, c)) / n;
};

const dB = (x: number) => 10 * Math.log10(x);

describe("quadrature", () => {
  // La brique sur laquelle tout repose. Mesurée ici plutôt que supposée : des
  // coefficients mal recopiés donneraient un effet plausible et faux.
  it.each([40, 100, 1000, 5000, 15000])("déphase de 90° à %i Hz, sans changer le gain", (f) => {
    const x = sinus(f, SR * 2);
    const { p, q } = quadrature(x);
    const ap = amplitude(p, f, SR, 8192), aq = amplitude(q, f, SR, 8192);
    expect(ap).toBeCloseTo(1, 2);
    expect(aq).toBeCloseTo(1, 2);
    // Deux sinus de même fréquence en quadrature ont une corrélation nulle.
    expect(Math.abs(correlation(p, q, SR, 8192))).toBeLessThan(0.02);
  });

  it("met q en avance de 90° sur p — le sens décide du sens de rotation", () => {
    // Avec q en avance, p·cos φ + q·sin φ est p tourné de +φ. Inverser les
    // chaînes ferait tourner l'anneau à l'envers sans que rien d'autre ne casse.
    const f = 1000, x = sinus(f, SR);
    const { p, q } = quadrature(x);
    // Avancer p d'un quart de période doit le superposer à q.
    const quart = Math.round(SR / f / 4);
    const pAvance = p.slice(quart);
    expect(correlation(pAvance, q, SR / 2, 4096)).toBeGreaterThan(0.99);
  });
});

describe("plan et couture", () => {
  it("fait démarrer chaque tour avant la fin du précédent, de la durée du fondu", () => {
    const plan = planMoebius(SR, SR, { tours: 3, fonduSec: 0.1 });
    expect(plan.fondu).toBe(4410);
    expect(plan.pas).toBe(SR - 4410);
    expect(plan.total).toBe(3 * (SR - 4410) + 4410);
  });

  it("borne le fondu au quart du son", () => {
    expect(planMoebius(1000, SR, { tours: 2, fonduSec: 10 }).fondu).toBe(250);
  });

  it("recoud un son qui ne se boucle pas, sans saut à la couture", () => {
    // Un sinus coupé en milieu de période : sa fin ne rejoint pas son début. Sans
    // fondu la couture saute ; avec, le plus grand écart entre deux échantillons
    // voisins reste celui du sinus lui-même.
    const x = sinus(441.3, 10000);
    const sautMax = (a: Float32Array) => { let m = 0; for (let i = 1; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - a[i - 1])); return m; };
    const pente = (2 * Math.PI * 441.3) / SR; // écart maximal naturel du sinus
    expect(sautMax(bouclerAvecFondu(x, 3, 0))).toBeGreaterThan(5 * pente);
    expect(sautMax(bouclerAvecFondu(x, 3, 500))).toBeLessThan(2 * pente);
  });
});

describe("face stéréo : la géométrie de l'anneau", () => {
  // Un son mono de 2 s, posé sur le bord de la bande. Aucun fondu, pour que
  // chaque instant de sortie corresponde à un angle exact.
  const duree = SR * 2;
  const o = { face: "stereo" as const, tours: 3, fonduSec: 0, melange: 1 };
  const r = tordre([bruit(duree)], SR, o);
  const [L, R] = r.canaux;
  const pas = r.plan.pas;

  it("pose un son mono sur un bord : il part à gauche", () => {
    expect(r.poseeSurLeBord).toBe(true);
    const t = Math.round(pas * 0.02); // φ ≈ 0, après la mise en route des filtres
    expect(dB(energie(L, t) / energie(R, t))).toBeGreaterThan(25);
  });

  it("après UN tour, il est passé à droite : l'autre face", () => {
    expect(dB(energie(R, pas) / energie(L, pas))).toBeGreaterThan(25);
  });

  it("après DEUX tours, il est revenu à gauche : l'anneau se referme", () => {
    expect(dB(energie(L, 2 * pas) / energie(R, 2 * pas))).toBeGreaterThan(25);
  });

  it("à mi-tour, il est au centre sans s'être écrasé : l'énergie ne s'effondre pas", () => {
    // LE test du terme en quadrature. Une rotation « plate » S·cos φ ferait passer
    // la bande par la tranche : à φ = π/2, S serait nul et le son mono. Ici les
    // deux canaux ont la même énergie, mais ils restent en quadrature.
    const t = Math.round(pas / 2);
    expect(Math.abs(dB(energie(L, t) / energie(R, t)))).toBeLessThan(1);
    const eBord = energie(L, Math.round(pas * 0.02)) + energie(R, Math.round(pas * 0.02));
    expect(Math.abs(dB((energie(L, t) + energie(R, t)) / eBord))).toBeLessThan(1);
    // Et les deux canaux ne sont pas un même signal recopié : la largeur tient.
    expect(Math.abs(correlation(L, R, t))).toBeLessThan(0.2);
  });

  it("garde l'écart gauche/droite constant tout au long du tour", () => {
    const S = L.map((l, i) => (l - R[i]) / 2);
    const niveaux = [0.1, 0.25, 0.5, 0.75, 0.9].map((f) => dB(energie(S, Math.round(pas * f))));
    expect(Math.max(...niveaux) - Math.min(...niveaux)).toBeLessThan(1.5);
  });
});

describe("face stéréo sur une vraie stéréo", () => {
  it("échange les deux canaux au bout d'un tour, puis les rend", () => {
    // Gauche à 440 Hz, droite à 880 Hz : où est chaque fréquence, à chaque angle.
    const n = SR * 2;
    const r = tordre([sinus(440, n), sinus(880, n)], SR, { face: "stereo", tours: 3, fonduSec: 0, melange: 1 });
    const [L, R] = r.canaux;
    const pas = r.plan.pas;
    expect(r.poseeSurLeBord).toBe(false);
    const t0 = Math.round(pas * 0.05);
    expect(amplitude(L, 440, t0)).toBeGreaterThan(5 * amplitude(L, 880, t0));
    expect(amplitude(L, 880, pas)).toBeGreaterThan(5 * amplitude(L, 440, pas));
    expect(amplitude(R, 440, pas)).toBeGreaterThan(5 * amplitude(R, 880, pas));
    expect(amplitude(L, 440, 2 * pas)).toBeGreaterThan(5 * amplitude(L, 880, 2 * pas));
  });

  it("ne pose pas sur le bord un son dont les canaux diffèrent", () => {
    const n = SR;
    expect(tordre([bruit(n, 1), bruit(n, 2)], SR, { face: "stereo", tours: 2, fonduSec: 0, melange: 1 }).poseeSurLeBord).toBe(false);
  });

  it("traite une stéréo aux canaux identiques comme un son mono", () => {
    const x = bruit(SR);
    expect(tordre([x, x.slice()], SR, { face: "stereo", tours: 2, fonduSec: 0, melange: 1 }).poseeSurLeBord).toBe(true);
  });
});

describe("face phase", () => {
  const n = SR * 2;
  const x = sinus(300, n);
  const r = tordre([x], SR, { face: "phase", tours: 3, fonduSec: 0, melange: 1 });
  const y = r.canaux[0];
  const { p } = quadrature(bouclerAvecFondu(x, 3, 0));
  const pas = r.plan.pas;

  it("retourne le signal au bout d'un tour, et le rend au bout de deux", () => {
    expect(correlation(y, p, Math.round(pas * 0.02))).toBeGreaterThan(0.99);
    expect(correlation(y, p, pas)).toBeLessThan(-0.99);
    expect(correlation(y, p, 2 * pas)).toBeGreaterThan(0.99);
  });

  it("annonce le décalage de fréquence équivalent : un demi-hertz par durée de tour", () => {
    expect(r.decalageHz).toBeCloseTo(SR / (2 * pas), 10);
    expect(r.decalageHz).toBeCloseTo(0.25, 2); // tour de 2 s
  });

  it("garde un son mono en mono", () => {
    expect(r.canaux.length).toBe(1);
  });

  it("à 50 % de mélange, s'éteint au bout d'un tour et revient au bout de deux", () => {
    // Ce que fait RÉELLEMENT le mélange, et qu'une première documentation
    // décrivait à tort comme un balayage de peigne. L'original et la face tournée
    // passent par le même déphaseur : leur écart de phase est le même à toutes
    // les fréquences, et c'est le niveau entier qui suit cos²(φ/2). Sur un bruit
    // large bande, un peigne laisserait le niveau global à peu près constant.
    const b = tordre([bruitLarge(SR * 2)], SR, { face: "phase", tours: 3, fonduSec: 0, melange: 0.5 });
    const z = b.canaux[0], k = b.plan.pas;
    const ref = energie(z, Math.round(k * 0.05));
    expect(dB(energie(z, Math.round(k / 2)) / ref)).toBeCloseTo(-3, 0);
    expect(dB(energie(z, k) / ref)).toBeLessThan(-25);
    expect(Math.abs(dB(energie(z, 2 * k) / ref))).toBeLessThan(0.5);
  });
});

function bruitLarge(n: number) {
  const a = new Float32Array(n);
  let g = 3;
  for (let i = 0; i < n; i++) { g = (g * 1103515245 + 12345) & 0x7fffffff; a[i] = 0.5 * (g / 0x3fffffff - 1); }
  return a;
}

describe("mélange", () => {
  it("à 0, ne tourne pas : la sortie reste à gauche d'un bout à l'autre", () => {
    const r = tordre([bruit(SR * 2)], SR, { face: "stereo", tours: 2, fonduSec: 0, melange: 0 });
    const [L, R] = r.canaux;
    expect(dB(energie(L, r.plan.pas) / Math.max(1e-20, energie(R, r.plan.pas)))).toBeGreaterThan(60);
  });
});

describe("garde-fou de durée", () => {
  it("expose la durée maximale de sortie pour que le nœud refuse avant d'allouer", () => {
    // 5 minutes × 8 tours = 40 minutes de stéréo flottante, soit 1,7 Go.
    expect(planMoebius(300 * SR, SR, { tours: 8, fonduSec: 0 }).dureeSec).toBeGreaterThan(DUREE_SORTIE_MAX_SEC);
  });
});
