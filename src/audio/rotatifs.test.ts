// audio/rotatifs.test.ts — Ce que les deux effets déplacent, et ce qu'ils ne déplacent pas.
//
// LES DEUX PROPRIÉTÉS QUI COMPTENT SONT CELLES QU'UN ESSAI À L'OREILLE NE DIRAIT PAS. La
// première est que la séparation en deux bandes ne creuse pas à la coupure : à modulation
// nulle, le son doit ressortir tel quel, et un creux de trois décibels au milieu du spectre
// serait pris pour une couleur de l'effet plutôt que pour un défaut du filtre. La seconde
// est que l'écart de hauteur du rotatif n'est pas un réglage mais une conséquence : il sort
// du rayon et de la vitesse par la dérivée du retard, et il doit se retrouver en cents.
import { describe, expect, it } from "vitest";
import {
  RAYON_AIGU, VITESSE_SON, hautParleurRotatif, moduleSpectre, passeBas, passeHaut,
  separerEnDeuxBandes, tremoloHarmonique,
} from "./rotatifs";

const SR = 44100;
const N = 16384;

const impulsion = (n: number): Float32Array => {
  const x = new Float32Array(n);
  x[0] = 1;
  return x;
};

const sinus = (f: number, n: number, amplitude = 0.5): Float32Array => {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amplitude * Math.sin((2 * Math.PI * f * i) / SR);
  return x;
};

const melange = (a: Float32Array, b: Float32Array): Float32Array => {
  const x = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) x[i] = a[i] + b[i];
  return x;
};

/** Les fréquences instantanées, relevées sur les passages par zéro interpolés. */
function frequencesInstantanees(x: Float32Array): number[] {
  const passages: number[] = [];
  for (let i = 1; i < x.length; i++) {
    if (x[i - 1] < 0 && x[i] >= 0) passages.push(i - 1 + x[i - 1] / (x[i - 1] - x[i]));
  }
  const f: number[] = [];
  for (let k = 1; k < passages.length; k++) f.push(SR / (passages[k] - passages[k - 1]));
  return f;
}

describe("la séparation en deux bandes", () => {
  it("LA SOMME DES DEUX BANDES EST PLATE, ce qui est toute la raison du Linkwitz-Riley", () => {
    // Deux sections en cascade de chaque côté mettent les bandes en phase à la coupure. Une
    // seule section de chaque côté laisserait un creux que l'oreille prendrait pour la
    // couleur de l'effet.
    const { grave, aigu } = separerEnDeuxBandes(impulsion(N), 800, SR);
    const somme = melange(grave, aigu);
    const m = moduleSpectre(somme, 0, N);
    for (let k = 4; k < m.length / 2; k++) {
      expect(m[k]).toBeGreaterThan(0.97);
      expect(m[k]).toBeLessThan(1.03);
    }
  });

  it("ET UNE SEULE SECTION DE CHAQUE CÔTÉ CREUSERAIT, ce qui dit que la cascade sert", () => {
    // Le témoin est bâti ici, avec les mêmes sections, mais sans la cascade : la somme
    // d'un passe-bas et d'un passe-haut d'ordre deux perd trois décibels à la coupure.
    const x = impulsion(N);
    const pb = passeBas(800, SR);
    const ph = passeHaut(800, SR);
    const naif = melange(
      (() => { const y = new Float32Array(N); let a1 = 0, a2 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < N; i++) {
          const v = pb.b0 * x[i] + pb.b1 * a1 + pb.b2 * a2 - pb.a1 * b1 - pb.a2 * b2;
          a2 = a1; a1 = x[i]; b2 = b1; b1 = v; y[i] = v;
        } return y; })(),
      (() => { const y = new Float32Array(N); let a1 = 0, a2 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < N; i++) {
          const v = ph.b0 * x[i] + ph.b1 * a1 + ph.b2 * a2 - ph.a1 * b1 - ph.a2 * b2;
          a2 = a1; a1 = x[i]; b2 = b1; b1 = v; y[i] = v;
        } return y; })());
    const binCoupure = Math.round((800 * N) / SR);
    expect(moduleSpectre(naif, 0, N)[binCoupure]).toBeLessThan(0.8);
  });

  it("chaque bande garde ce qui lui revient et écarte l'autre", () => {
    const { grave, aigu } = separerEnDeuxBandes(melange(sinus(200, N), sinus(5000, N)), 800, SR);
    const mg = moduleSpectre(grave, 2000, 8192);
    const ma = moduleSpectre(aigu, 2000, 8192);
    const bas = Math.round((200 * 8192) / SR);
    const haut = Math.round((5000 * 8192) / SR);
    expect(mg[bas] / mg[haut]).toBeGreaterThan(100);
    expect(ma[haut] / ma[bas]).toBeGreaterThan(100);
  });
});

describe("le trémolo harmonique", () => {
  const AIGU = 3000;
  const GRAVE = 200;

  /** L'enveloppe d'une raie, relevée par tranches. */
  const enveloppe = (x: Float32Array, f: number): number[] => {
    const tranche = 2048;
    const out: number[] = [];
    for (let d = 0; d + tranche <= x.length; d += tranche) {
      const m = moduleSpectre(x, d, tranche);
      out.push(m[Math.round((f * tranche) / SR)]);
    }
    return out;
  };

  const source = melange(sinus(GRAVE, N), sinus(AIGU, N));

  it("LES DEUX BANDES VONT EN SENS CONTRAIRE, et c'est ce qui le distingue d'une pulsation", () => {
    const [y] = tremoloHarmonique([source], SR,
      { vitesse: 2, profondeur: 1, coupure: 800, melange: 1 });
    const bas = enveloppe(y, GRAVE);
    const haut = enveloppe(y, AIGU);
    // La corrélation des deux enveloppes doit être franchement négative : quand l'une monte,
    // l'autre descend.
    const moy = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
    const mb = moy(bas), mh = moy(haut);
    let num = 0, db = 0, dh = 0;
    for (let i = 0; i < bas.length; i++) {
      num += (bas[i] - mb) * (haut[i] - mh);
      db += (bas[i] - mb) ** 2;
      dh += (haut[i] - mh) ** 2;
    }
    expect(num / Math.sqrt(db * dh)).toBeLessThan(-0.9);
  });

  it("à profondeur nulle, le son ressort avec le même spectre", () => {
    const [y] = tremoloHarmonique([source], SR,
      { vitesse: 2, profondeur: 0, coupure: 800, melange: 1 });
    const avant = moduleSpectre(source, 4000, 8192);
    const apres = moduleSpectre(y, 4000, 8192);
    for (const f of [GRAVE, AIGU]) {
      const k = Math.round((f * 8192) / SR);
      expect(apres[k] / avant[k]).toBeGreaterThan(0.97);
      expect(apres[k] / avant[k]).toBeLessThan(1.03);
    }
  });

  it("à mélange nul, le son ressort à l'identique, échantillon par échantillon", () => {
    const [y] = tremoloHarmonique([source], SR,
      { vitesse: 2, profondeur: 1, coupure: 800, melange: 0 });
    for (let i = 0; i < 500; i++) expect(y[i]).toBeCloseTo(source[i], 6);
  });
});

describe("le haut-parleur rotatif", () => {
  const TON = 2000;
  const VITESSE = 6.7;

  const auRotor = (p: Partial<Parameters<typeof hautParleurRotatif>[2]> = {}) =>
    hautParleurRotatif([sinus(TON, N)], SR, {
      vitesseAigu: VITESSE, vitesseGrave: 1.2, coupure: 300, profondeurAmplitude: 0,
      profondeurDoppler: 1, largeur: 1, melange: 1, ...p,
    });

  it("L'ÉCART DE HAUTEUR SORT DU RAYON ET DE LA VITESSE, il n'est pas posé à la main", () => {
    // Un rotor de rayon R tournant à f hertz allonge et raccourcit le trajet de R : la
    // hauteur suit la dérivée du retard, donc l'écart vaut deux pi f R sur la vitesse du son.
    const attendu = 1200 * Math.log2(1 + (2 * Math.PI * VITESSE * RAYON_AIGU) / VITESSE_SON);
    const [g] = auRotor();
    const f = frequencesInstantanees(g.subarray(2000));
    const cents = (x: number) => 1200 * Math.log2(x / TON);
    expect(cents(Math.max(...f))).toBeGreaterThan(attendu * 0.8);
    expect(cents(Math.max(...f))).toBeLessThan(attendu * 1.2);
    expect(-cents(Math.min(...f))).toBeGreaterThan(attendu * 0.8);
  });

  it("et il suit la vitesse : deux fois plus vite, deux fois plus d'écart", () => {
    const ecart = (v: number) => {
      const [g] = auRotor({ vitesseAigu: v });
      const f = frequencesInstantanees(g.subarray(2000));
      return 1200 * Math.log2(Math.max(...f) / TON);
    };
    expect(ecart(2 * VITESSE) / ecart(VITESSE)).toBeGreaterThan(1.8);
    expect(ecart(2 * VITESSE) / ecart(VITESSE)).toBeLessThan(2.2);
  });

  it("à profondeur de Doppler nulle, la hauteur ne bouge plus", () => {
    const [g] = auRotor({ profondeurDoppler: 0 });
    const f = frequencesInstantanees(g.subarray(2000));
    expect(1200 * Math.abs(Math.log2(Math.max(...f) / Math.min(...f)))).toBeLessThan(1);
  });

  it("LE NIVEAU PULSE AU RYTHME DU ROTOR, et sa profondeur le commande", () => {
    // LE CAS VIENT D'UN PLANTAGE. Retirer entièrement la variation de niveau ne faisait rien
    // tomber : les deux canaux différaient encore par le Doppler, et c'est tout ce qu'un cas
    // regardait. Le Doppler est donc mis à zéro ici, de sorte que seule l'amplitude reste.
    const relief = (x: Float32Array) => {
      const tranche = 512;
      const cretes: number[] = [];
      for (let t = 4; (t + 1) * tranche < x.length; t++) {
        let c = 0;
        for (let i = t * tranche; i < (t + 1) * tranche; i++) c = Math.max(c, Math.abs(x[i]));
        cretes.push(c);
      }
      return (Math.max(...cretes) - Math.min(...cretes)) / Math.max(1e-9, Math.max(...cretes));
    };
    const [plein] = auRotor({ profondeurDoppler: 0, profondeurAmplitude: 1 });
    const [moitie] = auRotor({ profondeurDoppler: 0, profondeurAmplitude: 0.5 });
    const [aucun] = auRotor({ profondeurDoppler: 0, profondeurAmplitude: 0 });
    expect(relief(plein)).toBeGreaterThan(0.9);
    expect(relief(moitie)).toBeGreaterThan(0.3);
    expect(relief(moitie)).toBeLessThan(relief(plein) - 0.2);
    expect(relief(aucun)).toBeLessThan(0.02);
  });

  it("LA SORTIE EST STÉRÉOPHONIQUE SUR UNE ENTRÉE MONO, la rotation la fabriquant", () => {
    const [g, d] = auRotor({ profondeurAmplitude: 1 });
    let ecart = 0;
    for (let i = 3000; i < 12000; i++) ecart = Math.max(ecart, Math.abs(g[i] - d[i]));
    expect(ecart).toBeGreaterThan(0.1);
  });

  it("et à largeur nulle les deux micros sont au même endroit, donc les canaux se confondent", () => {
    const [g, d] = auRotor({ profondeurAmplitude: 1, largeur: 0 });
    for (let i = 3000; i < 3500; i++) expect(g[i]).toBeCloseTo(d[i], 6);
  });

  it("à mélange nul, une entrée mono ressort à l'identique sur les deux canaux", () => {
    const source = sinus(TON, N);
    const [g, d] = auRotor({ melange: 0 });
    for (let i = 0; i < 500; i++) {
      expect(g[i]).toBeCloseTo(source[i], 6);
      expect(d[i]).toBeCloseTo(source[i], 6);
    }
  });

  it("ET UNE ENTRÉE STÉRÉOPHONIQUE AUSSI, chaque canal gardant le sien", () => {
    // LE CAS VIENT D'UN BALAYAGE DANS L'APPLICATION. Le chemin sec était sommé en mono comme
    // le chemin traité, de sorte qu'à mélange nul deux canaux différents rendaient leur
    // moyenne, plus faible que l'un ou l'autre. Une entrée mono ne pouvait pas le montrer,
    // sa moyenne étant elle-même.
    const gauche = sinus(TON, N);
    const droite = sinus(TON * 1.5, N, 0.3);
    const [g, d] = hautParleurRotatif([gauche, droite], SR, {
      vitesseAigu: VITESSE, vitesseGrave: 1.2, coupure: 300, profondeurAmplitude: 1,
      profondeurDoppler: 1, largeur: 1, melange: 0,
    });
    for (let i = 0; i < 500; i++) {
      expect(g[i]).toBeCloseTo(gauche[i], 6);
      expect(d[i]).toBeCloseTo(droite[i], 6);
    }
  });
});
