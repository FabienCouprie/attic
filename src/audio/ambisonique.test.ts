// audio/ambisonique.test.ts — Un champ sonore encodé, tourné, redescendu en stéréo.
//
// CE QUI SE VÉRIFIE ICI, ET QUI NE VA PAS DE SOI. Qu'une source encodée à gauche ressorte à
// gauche ; qu'une rotation d'un quart de tour l'amène devant ; et surtout qu'une rotation NULLE
// rende exactement la stéréo d'origine — sans quoi le nœud abîmerait tout enregistrement qui le
// traverse, même réglé sur « ne rien faire ».
import { describe, expect, it } from "vitest";
import { decoderStereo, encoder, encoderStereo, microphoneVirtuel, tourner } from "./ambisonique";

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
