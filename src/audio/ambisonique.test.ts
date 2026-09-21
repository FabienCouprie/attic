// audio/ambisonique.test.ts — Un champ sonore encodé, tourné, redescendu en stéréo.
//
// CE QUI SE VÉRIFIE ICI, ET QUI NE VA PAS DE SOI. Qu'une source encodée à gauche ressorte à
// gauche ; qu'une rotation d'un quart de tour l'amène devant ; et surtout qu'une rotation NULLE
// rende exactement la stéréo d'origine — sans quoi le nœud abîmerait tout enregistrement qui le
// traverse, même réglé sur « ne rien faire ».
import { describe, expect, it } from "vitest";
import { decoderStereo, encoder, encoderStereo, microphoneVirtuel, partDirectionnelle, tourner } from "./ambisonique";

const N = 512;
const PI = Math.PI;

/** Un signal simple à suivre. */
const son = (niveau = 1) => Float32Array.from({ length: N }, () => niveau);
const angles = (a: number) => new Float32Array(N).fill(a);
const zero = new Float32Array(N);

const moyenne = (x: Float32Array) => {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i];
  return s / Math.max(1, x.length);
};

describe("encoder une source", () => {
  it("la pression ne dépend pas de la direction", () => {
    const devant = encoder(son(), angles(0), zero);
    const derriere = encoder(son(), angles(PI), zero);
    expect(moyenne(devant.W)).toBeCloseTo(moyenne(derriere.W), 6);
  });

  it("devant : toute la direction est dans X", () => {
    const c = encoder(son(), angles(0), zero);
    expect(moyenne(c.X)).toBeCloseTo(1, 5);
    expect(moyenne(c.Y)).toBeCloseTo(0, 5);
    expect(moyenne(c.Z)).toBeCloseTo(0, 5);
  });

  it("à gauche : toute la direction est dans Y", () => {
    const c = encoder(son(), angles(PI / 2), zero);
    expect(moyenne(c.X)).toBeCloseTo(0, 5);
    expect(moyenne(c.Y)).toBeCloseTo(1, 5);
  });

  it("au-dessus : toute la direction est dans Z, et le plan est vide", () => {
    const c = encoder(son(), angles(0), angles(PI / 2));
    expect(moyenne(c.Z)).toBeCloseTo(1, 5);
    expect(moyenne(c.X)).toBeCloseTo(0, 5);
    expect(moyenne(c.Y)).toBeCloseTo(0, 5);
  });

  it("la convention du facteur 1/√2 sur la pression est respectée", () => {
    expect(moyenne(encoder(son(), angles(0), zero).W)).toBeCloseTo(1 / Math.SQRT2, 6);
  });
});

describe("tourner le champ", () => {
  it("un quart de tour amène la gauche devant", () => {
    const gauche = encoder(son(), angles(PI / 2), zero);
    const tourne = tourner(gauche, angles(-PI / 2));
    expect(moyenne(tourne.X)).toBeCloseTo(1, 5);
    expect(moyenne(tourne.Y)).toBeCloseTo(0, 5);
  });

  it("un tour complet revient au point de départ", () => {
    const c = encoder(son(), angles(0.7), angles(0.3));
    const t = tourner(c, angles(2 * PI));
    expect(moyenne(t.X)).toBeCloseTo(moyenne(c.X), 5);
    expect(moyenne(t.Y)).toBeCloseTo(moyenne(c.Y), 5);
  });

  it("la pression et la hauteur ne tournent pas : l'une n'a pas de direction, l'autre est l'axe", () => {
    const c = encoder(son(), angles(0.4), angles(0.9));
    const t = tourner(c, angles(1.3));
    expect(moyenne(t.W)).toBeCloseTo(moyenne(c.W), 6);
    expect(moyenne(t.Z)).toBeCloseTo(moyenne(c.Z), 6);
  });

  it("l'énergie du plan est conservée : une rotation ne crée ni ne détruit", () => {
    const c = encoder(son(), angles(0.4), zero);
    const t = tourner(c, angles(1.1));
    const plan = (ch: { X: Float32Array; Y: Float32Array }) =>
      Math.hypot(moyenne(ch.X), moyenne(ch.Y));
    expect(plan(t)).toBeCloseTo(plan(c), 5);
  });
});

describe("décoder en stéréo", () => {
  it("une source à gauche ressort plus fort à gauche", () => {
    const [g, d] = decoderStereo(encoder(son(), angles(PI / 2), zero), PI / 2);
    expect(moyenne(g)).toBeGreaterThan(moyenne(d));
  });

  it("une source devant ressort également des deux côtés", () => {
    const [g, d] = decoderStereo(encoder(son(), angles(0), zero), PI / 2);
    expect(moyenne(g)).toBeCloseTo(moyenne(d), 6);
  });

  it("le microphone virtuel est bien cardioïde : maximum devant, minimum derrière", () => {
    const c = encoder(son(), angles(0), zero);
    const devant = moyenne(microphoneVirtuel(c, 0));
    const cote = moyenne(microphoneVirtuel(c, PI / 2));
    const derriere = moyenne(microphoneVirtuel(c, PI));
    expect(devant).toBeGreaterThan(cote);
    expect(cote).toBeGreaterThan(derriere);
  });

  it("une ouverture large sépare davantage les deux côtés", () => {
    const c = encoder(son(), angles(PI / 2), zero);
    const etroite = decoderStereo(c, PI / 4);
    const large = decoderStereo(c, PI);
    const ecart = ([g, d]: [Float32Array, Float32Array]) => moyenne(g) - moyenne(d);
    expect(ecart(large)).toBeGreaterThan(ecart(etroite));
  });
});

describe("faire tourner une prise stéréo", () => {
  const gauche = Float32Array.from({ length: N }, (_, i) => Math.sin(i / 7));
  const droite = Float32Array.from({ length: N }, (_, i) => Math.cos(i / 11));

  it("SANS ROTATION, LES DEUX CANAUX RESSORTENT DANS LE BON ORDRE", () => {
    // Le décodage n'est pas l'identité — il rend une image plus étroite —, mais le canal qui
    // portait le plus de gauche doit encore en porter le plus.
    const champ = encoderStereo(gauche, new Float32Array(N), PI / 2);
    const [g, d] = decoderStereo(champ, PI / 2);
    let energieG = 0, energieD = 0;
    for (let i = 0; i < N; i++) { energieG += g[i] * g[i]; energieD += d[i] * d[i]; }
    expect(energieG).toBeGreaterThan(energieD * 2);
  });

  it("un demi-tour échange la gauche et la droite", () => {
    const champ = encoderStereo(gauche, new Float32Array(N), PI / 2);
    const [g, d] = decoderStereo(tourner(champ, angles(PI)), PI / 2);
    let energieG = 0, energieD = 0;
    for (let i = 0; i < N; i++) { energieG += g[i] * g[i]; energieD += d[i] * d[i]; }
    expect(energieD).toBeGreaterThan(energieG * 2);
  });

  it("deux canaux différents donnent un champ non nul dans les deux directions", () => {
    const champ = encoderStereo(gauche, droite, PI / 2);
    expect(champ.W.some((v) => Math.abs(v) > 1e-6)).toBe(true);
    expect(champ.Y.some((v) => Math.abs(v) > 1e-6)).toBe(true);
  });

  it("des longueurs différentes ne font pas échouer l'encodage", () => {
    const champ = encoderStereo(gauche, droite.subarray(0, 100), PI / 2);
    expect(champ.W.length).toBe(N);
    expect([...champ.W].every(Number.isFinite)).toBe(true);
  });
});

// CE QUE LE NŒUD NE DISAIT PAS, ET QU'UNE QUESTION D'UTILISATEUR A RÉVÉLÉ : « je n'entends pas la
// différence » derrière un générateur de fréquence. Le nœud tournait bien ce qu'on lui donnait,
// mais ce qu'on lui donnait n'avait rien à tourner. Ces tests fixent les chiffres pour que la
// documentation ne puisse plus s'en écarter — c'est la seule façon d'empêcher une notice de
// redevenir fausse.
describe("CE QU'UNE ROTATION PEUT DÉPLACER", () => {
  const rms = (x: Float32Array) => Math.sqrt([...x].reduce((a, v) => a + v * v, 0) / x.length);
  const sinus = (f: number) => Float32Array.from({ length: N }, (_, i) => 0.5 * Math.sin((2 * PI * f * i) / N));

  it("une source ponctuelle : tout le champ est directionnel", () => {
    const champ = encoder(son(), angles(0.7), zero);
    expect(partDirectionnelle(champ)).toBeCloseTo(1, 6);
  });

  it("UNE PRISE MONO NE DONNE QUE LE COSINUS DE LA MOITIÉ DE L'ÉCART", () => {
    // Les deux Y s'annulent — Y vaut L−R —, et il ne reste que X.
    for (const ecart of [PI / 3, PI / 2, (2 * PI) / 3]) {
      expect(partDirectionnelle(encoderStereo(son(), son(), ecart))).toBeCloseTo(Math.cos(ecart / 2), 6);
    }
  });

  it("À L'ÉCART DE 180°, UNE PRISE MONO NE LAISSE RIEN À TOURNER", () => {
    expect(partDirectionnelle(encoderStereo(son(), son(), PI))).toBeCloseTo(0, 6);
  });

  it("et la sortie ne dépend alors plus de l'angle : c'est ce qu'on n'entendait pas", () => {
    const champ = encoderStereo(son(), son(), PI);
    const a = decoderStereo(tourner(champ, angles(0)), PI / 2);
    const b = decoderStereo(tourner(champ, angles(PI / 2)), PI / 2);
    for (let i = 0; i < N; i += 37) {
      expect(b[0][i]).toBeCloseTo(a[0][i], 6);
      expect(b[1][i]).toBeCloseTo(a[1][i], 6);
    }
  });

  it("une prise mono tournée d'un quart de tour est PANORAMIQUÉE d'un rapport 3", () => {
    // 9,5 dB : c'est audible, et c'est tout ce qu'une rotation peut faire d'un son sans scène.
    const champ = encoderStereo(son(), son(), PI / 2);
    const [g, d] = decoderStereo(tourner(champ, angles(PI / 2)), PI / 2);
    expect(rms(g) / rms(d)).toBeCloseTo(3, 2);
  });

  it("un demi-tour sur une prise mono ne change QUE le niveau", () => {
    const champ = encoderStereo(son(), son(), PI / 2);
    const [g, d] = decoderStereo(tourner(champ, angles(PI)), PI / 2);
    expect(rms(g)).toBeCloseTo(rms(d), 6);              // toujours au centre
    const [g0] = decoderStereo(tourner(champ, angles(0)), PI / 2);
    expect(rms(g) / rms(g0)).toBeCloseTo(1 / 3, 2);      // et trois fois plus faible
  });

  it("SANS ROTATION, LE DÉCODAGE N'EST PAS DE GAIN UNITAIRE : ×1,5 sur une prise mono", () => {
    // La notice l'a d'abord nié en écrivant « les mêmes deux canaux ». C'est 3,5 dB de plus.
    const [g] = decoderStereo(encoderStereo(son(), son(), PI / 2), PI / 2);
    expect(rms(g) / rms(son())).toBeCloseTo(1.5, 6);
  });

  it("UN QUART DE TOUR À L'ÉCART DE 180° ÉCRASE UNE VRAIE STÉRÉO EN MONO", () => {
    // Le piège inverse de celui du mono : là, il y a bien une scène, et la rotation la détruit.
    // À 180° il ne reste que Y ; le quart de tour le verse dans X, qui nourrit les deux
    // cardioïdes à égalité.
    const champ = encoderStereo(sinus(3), sinus(7), PI);
    const [g0, d0] = decoderStereo(tourner(champ, angles(0)), PI / 2);
    const [g, d] = decoderStereo(tourner(champ, angles(PI / 2)), PI / 2);
    const separation = (a: Float32Array, b: Float32Array) =>
      Math.sqrt([...a].reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / N);
    expect(separation(g0, d0)).toBeGreaterThan(0.1);
    expect(separation(g, d)).toBeCloseTo(0, 6);
  });

  it("un champ vide ne fait pas diviser par zéro", () => {
    expect(partDirectionnelle({ W: zero, X: zero, Y: zero, Z: zero })).toBe(0);
    const vide = new Float32Array(0);
    expect(partDirectionnelle({ W: vide, X: vide, Y: vide, Z: vide })).toBe(0);
  });
});
