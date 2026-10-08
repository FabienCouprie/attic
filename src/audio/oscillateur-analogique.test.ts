// audio/oscillateur-analogique.test.ts — Les quatre gestes, et le repliement qu'ils coûtent.
//
// POURQUOI LA MESURE DU REPLIEMENT EST ICI LE CAS PRINCIPAL. Les quatre gestes de cet
// oscillateur produisent un spectre qui ne s'arrête pas à Nyquist, et tout l'intérêt de la
// façon dont il est écrit est de le redescendre proprement. Un test qui se contenterait de
// vérifier qu'une scie monte de moins un à un passerait au vert sur un oscillateur qui
// replie tout.
//
// LA FRÉQUENCE D'ÉPREUVE EST CHOISIE POUR QU'AUCUN REPLI NE PUISSE SE CACHER SUR UNE
// HARMONIQUE. Elle vaut 743 cycles dans une fenêtre de 16 384 échantillons : 743 est
// premier et la fenêtre est une puissance de deux, donc ni un multiple de 743 ni son reflet
// ne retombe jamais sur un autre multiple de 743. Toute énergie hors des bins multiples de
// 743 est donc du repliement, et non une harmonique mal placée ni une fuite de fenêtre,
// le signal étant exactement périodique dans la fenêtre.
import { describe, expect, it } from "vitest";
import { fft } from "./fft";
import {
  COUPURE, LARGEUR_MAX, LARGEUR_MIN, SUR_ECHANTILLONNAGE, decimer, echantillonVco,
  noyauDecimation, ondeVco, retirerLeContinu, synthetiserVco, type ReglagesVco,
} from "./oscillateur-analogique";

const FS = 44100;
const FENETRE = 16384;
const CYCLES = 743;
const F0 = (FS * CYCLES) / FENETRE;

const reglages = (p: Partial<ReglagesVco> = {}): ReglagesVco => ({
  forme: "sawtooth", frequence: F0, duree: 1, largeur: 0.5, modulationLargeur: 0,
  vitesseModulation: 1, voix: 1, desaccord: 0, sync: 1, distorsion: 0, ...p,
});

function spectre(x: Float32Array, debut: number, n: number): Float64Array {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = x[debut + i] ?? 0;
  fft(re, im, false);
  const module = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) module[k] = Math.hypot(re[k], im[k]);
  return module;
}

/** La part d'énergie posée ailleurs que sur les multiples de `bin`, en décibels. */
function partHorsHarmonique(module: Float64Array, bin: number): number {
  let total = 0;
  let harmonique = 0;
  for (let k = 1; k < module.length; k++) {
    const e = module[k] * module[k];
    total += e;
    if (k % bin === 0) harmonique += e;
  }
  return 10 * Math.log10(Math.max(1e-20, (total - harmonique) / Math.max(1e-20, total)));
}

/**
 * LE TÉMOIN : la même scie écrite naïvement, échantillon par échantillon à la cadence de
 * sortie, sans correction de rupture ni suréchantillonnage. C'est ce que le module doit
 * battre, et le construire ici plutôt que de l'obtenir par une option du module garantit
 * qu'il ne partage avec lui aucun chemin de code.
 */
function scieNaive(n: number): Float32Array {
  const x = new Float32Array(n);
  const pas = F0 / FS;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    x[i] = echantillonVco("sawtooth", phase, 0.5, 0);
    phase += pas;
    if (phase >= 1) phase -= 1;
  }
  return x;
}

/** La part du cycle passée en haut, relevée sur l'onde avant décimation. */
function partEnHaut(r: ReglagesVco, echantillonnage = FS * SUR_ECHANTILLONNAGE): number {
  const onde = ondeVco(r, echantillonnage);
  let haut = 0;
  for (let i = 0; i < onde.length; i++) if (onde[i] > 0) haut++;
  return haut / onde.length;
}

describe("le repliement, qui est ce que cet oscillateur a de particulier", () => {
  const repliement = (p: Partial<ReglagesVco>, facteur = SUR_ECHANTILLONNAGE) =>
    partHorsHarmonique(spectre(synthetiserVco(reglages(p), FS, facteur).signal, 8192, FENETRE), CYCLES);

  it("LA SCIE NAÏVE REPLIE À 12,8 DÉCIBELS SOUS LE SIGNAL, et c'est ce qu'il faut battre", () => {
    expect(partHorsHarmonique(spectre(scieNaive(FENETRE + 8192), 0, FENETRE), CYCLES))
      .toBeGreaterThan(-20);
  });

  it("LA CORRECTION DE RUPTURE SEULE VAUT PRÈS DE VINGT DÉCIBELS, sans un échantillon de plus", () => {
    const naif = partHorsHarmonique(spectre(scieNaive(FENETRE + 8192), 0, FENETRE), CYCLES);
    // À la cadence de sortie, sans suréchantillonnage : tout le gain vient du polyBLEP.
    expect(naif - repliement({}, 1)).toBeGreaterThan(15);
  });

  it("ET LE SURÉCHANTILLONNAGE S'Y COMPOSE, chaque doublement valant encore une dizaine de décibels", () => {
    expect(repliement({}, 2)).toBeLessThan(repliement({}, 1) - 15);
    expect(repliement({}, 4)).toBeLessThan(repliement({}, 2) - 15);
    expect(repliement({}, 8)).toBeLessThan(repliement({}, 4) - 15);
  });

  it("les trois gestes à rupture franche descendent sous 80 décibels", () => {
    expect(repliement({})).toBeLessThan(-80);
    expect(repliement({ forme: "impulsion", largeur: 0.1 })).toBeLessThan(-80);
    expect(repliement({ sync: 3 })).toBeLessThan(-80);
    expect(repliement({ forme: "impulsion", largeur: 0.3, sync: 5 })).toBeLessThan(-80);
  });

  it("LA PHASE DÉFORMÉE EST LE GESTE LE PLUS EXIGEANT, et c'est elle qui fixe le facteur", () => {
    // Sa rupture est dans la DÉRIVÉE et non dans la valeur : le saut est nul, donc le
    // polyBLEP ne lui apporte rien et seul le suréchantillonnage travaille. Elle reste de
    // trente décibels au-dessus de la scie, et c'est son chiffre, non celui de la scie, qui
    // a décidé du facteur retenu.
    const dure = { forme: "phase" as const, largeur: 0.1, distorsion: 1 };
    expect(repliement(dure, 4)).toBeGreaterThan(-55);
    expect(repliement(dure, 8)).toBeLessThan(-50);
    expect(repliement(dure)).toBeGreaterThan(repliement({}) + 20);
  });

  it("ET LA MESURE NE S'APPLIQUE PAS À UN CRÉNEAU BALAYÉ, ce qu'il faut dire pour ne pas lire son chiffre", () => {
    // Un créneau dont la largeur bouge n'est pas périodique sur la période de la
    // fondamentale : son spectre porte des bandes latérales autour de chaque harmonique,
    // que cette mesure compte comme du repliement. Elle rend alors moins d'un décibel pour
    // un son parfaitement propre. Le cas est ici pour que ce chiffre ne soit jamais pris
    // pour un défaut, et le balayage s'éprouve par la largeur relevée, non par le spectre.
    const balaye = { forme: "impulsion" as const, largeur: 0.5, modulationLargeur: 1, vitesseModulation: 4 };
    expect(repliement(balaye)).toBeGreaterThan(-5);
    expect(repliement(balaye, 2)).toBeCloseTo(repliement(balaye, 8), 0);
  });
});

describe("le filtre de décimation", () => {
  const noyau = noyauDecimation(SUR_ECHANTILLONNAGE);

  it("laisse passer le continu à son niveau, sa somme valant EXACTEMENT un", () => {
    // NEUF DÉCIMALES ET NON SIX, et c'est un plantage qui l'a imposé. Un passe-bas idéal a
    // par construction un gain unité au continu, et la fenêtre de Blackman ne l'écarte que
    // de trois dix-millionièmes : à six décimales, retirer la normalisation ne se voyait
    // pas. Elle n'est pas une correction mais une garantie, et c'est à cette précision-là
    // qu'elle se tient.
    let somme = 0;
    for (let i = 0; i < noyau.length; i++) somme += noyau[i];
    expect(somme).toBeCloseTo(1, 9);
  });

  it("EST À PHASE LINÉAIRE, ce qui est la raison de le prendre symétrique", () => {
    // Un filtre non symétrique retarderait les fréquences inégalement et déformerait l'attaque.
    for (let i = 0; i < noyau.length; i++) {
      expect(noyau[i]).toBeCloseTo(noyau[noyau.length - 1 - i], 12);
    }
  });

  it("atténue au-delà de sa coupure, et laisse passer en dessous", () => {
    const reponse = (hz: number) => {
      let re = 0;
      let im = 0;
      const w = (2 * Math.PI * hz) / (FS * SUR_ECHANTILLONNAGE);
      for (let i = 0; i < noyau.length; i++) {
        re += noyau[i] * Math.cos(w * i);
        im -= noyau[i] * Math.sin(w * i);
      }
      return 20 * Math.log10(Math.max(1e-12, Math.hypot(re, im)));
    };
    expect(reponse(1000)).toBeGreaterThan(-1);
    expect(reponse(COUPURE)).toBeLessThan(-3);
    expect(reponse(30000)).toBeLessThan(-60);
    expect(reponse(60000)).toBeLessThan(-60);
  });

  it("un échantillon sur le facteur est gardé", () => {
    const plat = new Float32Array(800).fill(1);
    expect(decimer(plat, SUR_ECHANTILLONNAGE, noyau).length).toBe(100);
  });
});

describe("la largeur du créneau", () => {
  it("EST LA PART DU CYCLE PASSÉE EN HAUT, et c'est ce qui se règle", () => {
    expect(partEnHaut(reglages({ forme: "impulsion", largeur: 0.25 }))).toBeCloseTo(0.25, 2);
    expect(partEnHaut(reglages({ forme: "impulsion", largeur: 0.75 }))).toBeCloseTo(0.75, 2);
  });

  it("le créneau étroit fabrique un continu, qui est retiré", () => {
    const r = synthetiserVco(reglages({ forme: "impulsion", largeur: 0.1 }), FS, SUR_ECHANTILLONNAGE);
    // Un créneau qui passe un dixième du cycle en haut a pour moyenne 2 × 0,1 moins 1.
    expect(r.continu).toBeCloseTo(-0.8, 1);
    let somme = 0;
    for (let i = 0; i < r.signal.length; i++) somme += r.signal[i];
    expect(Math.abs(somme / r.signal.length)).toBeLessThan(1e-6);
  });

  it("la profondeur nulle ne balaie pas, et une profondeur la fait balayer", () => {
    const fixe = partEnHaut(reglages({ forme: "impulsion", largeur: 0.5, modulationLargeur: 0 }));
    const balayé = ondeVco(
      reglages({ forme: "impulsion", largeur: 0.5, modulationLargeur: 1, vitesseModulation: 4 }),
      FS * SUR_ECHANTILLONNAGE);
    // La moyenne sur un balayage symétrique revient au milieu : c'est la part en haut SUR UN
    // CYCLE DE BALAYAGE qui bouge, et elle se relève par tranches.
    expect(fixe).toBeCloseTo(0.5, 2);
    const parts: number[] = [];
    const tranche = Math.floor(balayé.length / 16);
    for (let t = 0; t < 16; t++) {
      let haut = 0;
      for (let i = t * tranche; i < (t + 1) * tranche; i++) if (balayé[i] > 0) haut++;
      parts.push(haut / tranche);
    }
    expect(Math.max(...parts) - Math.min(...parts)).toBeGreaterThan(0.5);
  });

  it("ET LE BALAYAGE NE FRANCHIT PAS LES BORNES, sous peine d'ajouter sa propre rupture", () => {
    const onde = ondeVco(
      reglages({ forme: "impulsion", largeur: 0.5, modulationLargeur: 1, vitesseModulation: 4 }),
      FS * SUR_ECHANTILLONNAGE);
    const tranche = Math.floor(onde.length / 64);
    const parts: number[] = [];
    for (let t = 0; t < 64; t++) {
      let haut = 0;
      for (let i = t * tranche; i < (t + 1) * tranche; i++) if (onde[i] > 0) haut++;
      parts.push(haut / tranche);
    }
    // LA TOLÉRANCE EST PLUS PETITE QUE LA BORNE ELLE-MÊME, et c'est un plantage qui l'a
    // imposé : à plus ou moins deux centièmes, une largeur écrêtée à zéro passait, zéro
    // étant au-dessus de moins un centième. Un créneau qui disparaît ou qui reste en haut
    // tout le cycle est précisément ce que cette borne existe pour empêcher.
    expect(Math.min(...parts)).toBeGreaterThan(LARGEUR_MIN / 2);
    expect(Math.max(...parts)).toBeLessThan(1 - LARGEUR_MIN / 2);
    expect(Math.min(...parts)).toBeLessThan(0.1);
    expect(Math.max(...parts)).toBeGreaterThan(0.9);
  });
});

describe("la remise à zéro forcée", () => {
  const fondamentale = (x: Float32Array) => {
    const m = spectre(x, 8192, FENETRE);
    let meilleur = 1;
    for (let k = 2; k < m.length; k++) if (m[k] > m[meilleur]) meilleur = k;
    return meilleur;
  };

  it("À 1, LE MAÎTRE N'INTERVIENT PAS, et la voix garde son propre désaccord", () => {
    // Deux cents de désaccord déplacent la fréquence : sous remise à zéro, ce déplacement
    // disparaîtrait, le maître imposant sa période.
    const r = synthetiserVco(reglages({ voix: 2, desaccord: 1200, sync: 1 }), FS, SUR_ECHANTILLONNAGE);
    const m = spectre(r.signal, 8192, FENETRE);
    // Une voix une octave au-dessous, une une octave au-dessus : les deux sont là.
    expect(m[Math.round(CYCLES / 2)]).toBeGreaterThan(m[CYCLES] * 0.1);
  });

  it("LA REMISE À ZÉRO IMPOSE LA PÉRIODE DU MAÎTRE, et c'est de là que vient la hauteur", () => {
    // Le son se répète à la période du maître : toute son énergie tombe donc sur des
    // multiples de sa fréquence, et le repliement reste bas alors que l'esclave est trois
    // fois plus haut et n'a aucun rapport simple avec la fenêtre d'analyse.
    const avec = synthetiserVco(reglages({ frequence: F0, sync: 3 }), FS, SUR_ECHANTILLONNAGE);
    expect(partHorsHarmonique(spectre(avec.signal, 8192, FENETRE), CYCLES)).toBeLessThan(-80);
  });

  it("ET LE RELIEF SE POSE SUR LA FRÉQUENCE DE L'ESCLAVE, ce qui est le timbre de la synchronisation", () => {
    // La période vient du maître, le relief du spectre vient de l'esclave : c'est cette
    // dissociation qui s'entend, une hauteur fixe sous un timbre qu'on déplace.
    const sans = synthetiserVco(reglages({ frequence: F0, sync: 1 }), FS, SUR_ECHANTILLONNAGE);
    const avec = synthetiserVco(reglages({ frequence: F0, sync: 3 }), FS, SUR_ECHANTILLONNAGE);
    expect(fondamentale(sans.signal)).toBe(CYCLES);
    expect(fondamentale(avec.signal)).toBe(CYCLES * 3);
    const m = spectre(avec.signal, 8192, FENETRE);
    const mSans = spectre(sans.signal, 8192, FENETRE);
    expect(m[CYCLES * 3] / m[CYCLES]).toBeGreaterThan(mSans[CYCLES * 3] / mSans[CYCLES] * 10);
  });
});

describe("la pile désaccordée", () => {
  const relief = (x: Float32Array) => {
    const tranche = 2048;
    const cretes: number[] = [];
    for (let t = 0; (t + 1) * tranche < x.length; t++) {
      let c = 0;
      for (let i = t * tranche; i < (t + 1) * tranche; i++) c = Math.max(c, Math.abs(x[i]));
      cretes.push(c);
    }
    return (Math.max(...cretes) - Math.min(...cretes)) / Math.max(1e-9, Math.max(...cretes));
  };

  it("SEPT VOIX DÉSACCORDÉES BATTENT, une voix seule ne bat pas", () => {
    const seule = synthetiserVco(reglages({ voix: 1 }), FS, SUR_ECHANTILLONNAGE);
    const pile = synthetiserVco(reglages({ voix: 7, desaccord: 30 }), FS, SUR_ECHANTILLONNAGE);
    expect(relief(seule.signal)).toBeLessThan(0.02);
    expect(relief(pile.signal)).toBeGreaterThan(0.1);
  });

  it("et le désaccord nul ne bat pas davantage, les voix restant à la même fréquence", () => {
    const pile = synthetiserVco(reglages({ voix: 7, desaccord: 0 }), FS, SUR_ECHANTILLONNAGE);
    expect(relief(pile.signal)).toBeLessThan(0.02);
  });

  it("UNE PILE NE SORT PAS PLUS FORT QU'UNE VOIX, les voix étant moyennées et non sommées", () => {
    // Le signal ne quitte pas l'intervalle de l'onde, quel que soit le nombre de voix. La
    // marge laisse passer le léger dépassement du polyBLEP et celui du filtre, et rien de
    // plus : neuf voix sommées sortiraient bien au-delà.
    const crete = (x: Float32Array) => {
      let c = 0;
      for (let i = 0; i < x.length; i++) c = Math.max(c, Math.abs(x[i]));
      return c;
    };
    for (const voix of [1, 2, 7, 9]) {
      expect(crete(synthetiserVco(reglages({ voix, desaccord: 30 }), FS, SUR_ECHANTILLONNAGE).signal))
        .toBeLessThan(1.1);
    }
  });

  it("ET LES PHASES DE DÉPART SONT RÉPARTIES, sans quoi une pile sans désaccord ne serait qu'une voix", () => {
    // Les phases réparties font d'une pile sans désaccord un peigne, et non une copie plus
    // forte de la même onde ; c'est la documentation du réglage « Voix », et sans ce cas
    // mettre toutes les phases à zéro ne se verrait nulle part.
    const seule = synthetiserVco(reglages({ voix: 1, desaccord: 0 }), FS, SUR_ECHANTILLONNAGE).signal;
    const pile = synthetiserVco(reglages({ voix: 7, desaccord: 0 }), FS, SUR_ECHANTILLONNAGE).signal;
    let ecart = 0;
    for (let i = 2000; i < 8000; i++) ecart = Math.max(ecart, Math.abs(seule[i] - pile[i]));
    expect(ecart).toBeGreaterThan(0.2);
  });
});

describe("la phase déformée", () => {
  it("À DISTORSION NULLE, C'EST UNE SINUSOÏDE, et le genou au milieu en est la raison", () => {
    const r = synthetiserVco(reglages({ forme: "phase", largeur: 0.1, distorsion: 0 }), FS, SUR_ECHANTILLONNAGE);
    const m = spectre(r.signal, 8192, FENETRE);
    let autre = 0;
    for (let k = 1; k < m.length; k++) if (k !== CYCLES) autre = Math.max(autre, m[k]);
    expect(autre / m[CYCLES]).toBeLessThan(0.01);
  });

  it("la distorsion fabrique des harmoniques hautes sans changer la période", () => {
    const douce = synthetiserVco(reglages({ forme: "phase", largeur: 0.1, distorsion: 0 }), FS, SUR_ECHANTILLONNAGE);
    const dure = synthetiserVco(reglages({ forme: "phase", largeur: 0.1, distorsion: 1 }), FS, SUR_ECHANTILLONNAGE);
    const haut = (x: Float32Array) => {
      const m = spectre(x, 8192, FENETRE);
      let s = 0;
      for (let h = 4; h * CYCLES < m.length; h++) s += m[h * CYCLES] * m[h * CYCLES];
      return s / Math.max(1e-20, m[CYCLES] * m[CYCLES]);
    };
    expect(haut(dure.signal)).toBeGreaterThan(haut(douce.signal) * 100);
  });

  it("AU DÉFAUT DE LARGEUR, LA DISTORSION AGIT, ce qu'un balayage dans l'application a imposé", () => {
    // Le défaut de « Largeur » valait cinquante pour cent, et le genou part de la largeur :
    // il était donc déjà au milieu du cycle, de sorte que la distorsion ne déplaçait rien et
    // que zéro et cent rendaient la même empreinte. Le défaut est à vingt-cinq, et ce cas
    // tient les deux côtés de la raison.
    const au = (largeur: number, distorsion: number) =>
      synthetiserVco(reglages({ forme: "phase", largeur, distorsion }), FS, SUR_ECHANTILLONNAGE).signal;
    const differe = (a: Float32Array, b: Float32Array) => {
      let ecart = 0;
      for (let i = 2000; i < 6000; i++) ecart = Math.max(ecart, Math.abs(a[i] - b[i]));
      return ecart;
    };
    expect(differe(au(0.25, 0), au(0.25, 1))).toBeGreaterThan(0.1);
    // ET LE POINT MORT EST RÉEL, non une précaution : à cinquante, les deux sont identiques.
    expect(differe(au(0.5, 0), au(0.5, 1))).toBe(0);
  });

  it("ET LES DEUX SENS DU GENOU ONT LE MÊME SPECTRE, ce qui dit que rien ne manque", () => {
    // Un genou au quart et un genou aux trois quarts donnent deux ondes qui sont l'inverse
    // l'une de l'autre renversée dans le temps, et ces deux opérations laissent le module du
    // spectre inchangé. Offrir la largeur des deux côtés du milieu n'ajoute donc aucun timbre.
    const spectreDe = (largeur: number) =>
      spectre(synthetiserVco(reglages({ forme: "phase", largeur, distorsion: 1 }), FS,
        SUR_ECHANTILLONNAGE).signal, 8192, FENETRE);
    const a = spectreDe(0.25);
    const b = spectreDe(0.75);
    // CHAQUE HARMONIQUE EST RAPPORTÉE À LA FONDAMENTALE, et non comparée telle quelle : une
    // tolérance absolue sur un module de six mille huit cents ne veut rien dire, et c'est
    // elle qui a d'abord fait échouer ce cas sur un écart d'un millionième.
    for (let h = 1; h * CYCLES < a.length; h++) {
      expect(b[h * CYCLES] / b[CYCLES]).toBeCloseTo(a[h * CYCLES] / a[CYCLES], 4);
    }
  });

  it("le genou tient aux deux réglages ensemble, et la largeur seule ne fait rien à distorsion nulle", () => {
    expect(echantillonVco("phase", 0.25, 0.1, 0)).toBeCloseTo(echantillonVco("phase", 0.25, 0.9, 0), 12);
    expect(echantillonVco("phase", 0.25, 0.1, 1)).not.toBeCloseTo(echantillonVco("phase", 0.25, 0.9, 1), 3);
  });
});

describe("le son est déterminé", () => {
  it("DEUX APPELS AUX MÊMES RÉGLAGES RENDENT LE MÊME SON, ce dont le banc d'empreintes a besoin", () => {
    const a = synthetiserVco(reglages({ voix: 7, desaccord: 30, sync: 3 }), FS, SUR_ECHANTILLONNAGE);
    const b = synthetiserVco(reglages({ voix: 7, desaccord: 30, sync: 3 }), FS, SUR_ECHANTILLONNAGE);
    expect([...a.signal.slice(0, 2000)]).toEqual([...b.signal.slice(0, 2000)]);
  });

  it("le continu retiré est rendu, et un signal vide ne casse pas", () => {
    const x = new Float32Array([1, 3]);
    expect(retirerLeContinu(x)).toBe(2);
    expect([...x]).toEqual([-1, 1]);
    expect(retirerLeContinu(new Float32Array(0))).toBe(0);
  });
});
