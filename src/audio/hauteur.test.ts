// audio/hauteur.test.ts — Le suiveur de hauteur doit rendre la hauteur, et tenir la ligne.
//
// Deux promesses à éprouver, et elles ne sont pas de même nature. La première est une mesure :
// sur un son dont on connaît la hauteur, la hauteur trouvée doit être la bonne, au cent près.
// La seconde est la raison d'être de pYIN : sur des trames ambiguës — trop faibles, trop
// bruitées —, YIN rend quelque chose de toute façon, et ce quelque chose est n'importe quoi. Le
// décodage doit tenir la ligne. C'est un écart qu'on COMPTE, et non un progrès qu'on affirme.
import { describe, expect, it } from "vitest";
import {
  candidats, courbeDeConfiance, courbeDepuisHauteur, differenceNormalisee,
  hauteurMediane, partVoisee, suivreHauteur,
} from "./hauteur";

const SR = 16000;

/** Une sinusoïde, éventuellement avec des harmoniques. */
function ton(hertz: number, dureeSec: number, harmoniques = 1, amplitude = 0.8): Float32Array {
  const n = Math.round(dureeSec * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let h = 1; h <= harmoniques; h++) v += Math.sin((2 * Math.PI * hertz * h * i) / SR) / h;
    x[i] = amplitude * v / 2;
  }
  return x;
}

function bruit(dureeSec: number, amplitude = 0.3, graine = 7): Float32Array {
  const n = Math.round(dureeSec * SR);
  const x = new Float32Array(n);
  let g = graine;
  for (let i = 0; i < n; i++) { g = (g * 1103515245 + 12345) & 0x7fffffff; x[i] = amplitude * (g / 0x3fffffff - 1); }
  return x;
}

const concatener = (...morceaux: Float32Array[]): Float32Array => {
  const total = morceaux.reduce((s, m) => s + m.length, 0);
  const x = new Float32Array(total);
  let o = 0;
  for (const m of morceaux) { x.set(m, o); o += m.length; }
  return x;
};

/** Écart en demi-tons entre deux hauteurs. */
const demiTons = (a: number, b: number) => Math.abs(12 * Math.log2(a / b));

describe("la fonction de différence de YIN", () => {
  it("s'annule à la période du signal, et pas ailleurs", () => {
    const x = ton(200, 0.2, 4);
    const d = differenceNormalisee(x, 1000, 640, 400);
    const periode = Math.round(SR / 200); // 80 échantillons
    expect(d[periode]).toBeLessThan(0.1);
    // À une demi-période, le signal ne se ressemble pas : la différence doit être haute.
    expect(d[Math.round(periode / 2)]).toBeGreaterThan(0.5);
  });

  it("ne confond pas la période et son double — c'est ce que la normalisation apporte", () => {
    const x = ton(200, 0.2, 4);
    const d = differenceNormalisee(x, 1000, 640, 400);
    const periode = Math.round(SR / 200);
    // L'autocorrélation seule serait tout aussi basse au double ; la moyenne cumulée l'en empêche.
    expect(d[periode]).toBeLessThan(d[2 * periode]);
  });

  it("reste définie sur du silence, sans division par zéro", () => {
    const d = differenceNormalisee(new Float32Array(2000), 0, 640, 400);
    expect([...d].every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe("les candidats d'une trame", () => {
  it("donnent la hauteur vraie le plus gros poids", () => {
    const x = ton(220, 0.2, 5);
    const d = differenceNormalisee(x, 1000, 582, 291);
    const { liste, voisement } = candidats(d, 9, 291, SR, 0.6);
    expect(liste.length).toBeGreaterThan(0);
    expect(demiTons(liste[0].hertz, 220)).toBeLessThan(0.3);
    expect(voisement).toBeGreaterThan(0.9);
  });

  it("ne retiennent presque rien sur du bruit : c'est la mesure du non-voisement", () => {
    const x = bruit(0.2);
    const d = differenceNormalisee(x, 1000, 582, 291);
    const { voisement } = candidats(d, 9, 291, SR, 0.6);
    expect(voisement).toBeLessThan(0.5);
  });
});

describe("suivre la hauteur d'un son", () => {
  it("trouve la hauteur d'un son tenu, au dixième de demi-ton", () => {
    const s = suivreHauteur(ton(220, 0.6, 5), SR, { cadence: 100 });
    expect(demiTons(hauteurMediane(s), 220)).toBeLessThan(0.1);
    expect(partVoisee(s)).toBeGreaterThan(0.8);
  });

  it("trouve aussi une hauteur grave, où la fenêtre est longue", () => {
    const s = suivreHauteur(ton(82.4, 0.8, 6), SR, { cadence: 100 });
    expect(demiTons(hauteurMediane(s), 82.4)).toBeLessThan(0.2);
  });

  it("suit un glissando de bas en haut sans le lisser à plat", () => {
    const n = Math.round(1.0 * SR);
    const x = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const f = 110 * Math.pow(4, i / n); // 110 Hz → 440 Hz
      phase += (2 * Math.PI * f) / SR;
      x[i] = 0.8 * (Math.sin(phase) + Math.sin(2 * phase) / 2 + Math.sin(3 * phase) / 3) / 2;
    }
    const s = suivreHauteur(x, SR, { cadence: 100 });
    // La hauteur attendue est celle qui est DANS la fenêtre d'analyse, et non celle de l'instant
    // où la trame commence : la fenêtre couvre deux périodes de la plus grave des hauteurs
    // cherchées, soit 36 ms ici, pendant lesquelles ce glissando monte déjà de près d'un demi-ton.
    // Comparer au début de la trame ferait échouer un suivi pourtant juste.
    const fenetreSec = (2 * Math.ceil(SR / 55)) / SR;
    const attendueEn = (t: number) => 110 * Math.pow(4, t / s.cadence / 1.0 + fenetreSec / 2);
    let pires = 0;
    for (let t = 2; t < s.hauteurs.length - 2; t++) {
      if (demiTons(s.hauteurs[t], attendueEn(t)) > 1) pires++;
    }
    expect(pires, `${pires} trames à plus d'un demi-ton de la hauteur présente dans la fenêtre`).toBeLessThan(4);
    // Et la montée est bien monotone, à quelques trames près.
    let descentes = 0;
    for (let t = 6; t < s.hauteurs.length - 6; t++) if (s.hauteurs[t] < s.hauteurs[t - 1] * 0.98) descentes++;
    expect(descentes).toBeLessThan(5);
  });

  it("dit qu'il n'y a pas de note quand il n'y en a pas", () => {
    const s = suivreHauteur(bruit(0.6), SR, { cadence: 100 });
    expect(partVoisee(s)).toBeLessThan(0.3);
  });

  it("ne rend ni NaN ni infini sur du silence", () => {
    const s = suivreHauteur(new Float32Array(SR / 2), SR, { cadence: 100 });
    expect([...s.hauteurs].every(Number.isFinite)).toBe(true);
    expect([...s.confiances].every(Number.isFinite)).toBe(true);
    expect(partVoisee(s)).toBe(0);
  });

  it("garde le fil de la mélodie à travers un silence, au lieu de retomber à zéro", () => {
    // Deux fois la même note, séparées par un silence : la hauteur doit continuer au milieu.
    const x = concatener(ton(220, 0.4, 5), new Float32Array(Math.round(0.3 * SR)), ton(220, 0.4, 5));
    const s = suivreHauteur(x, SR, { cadence: 100 });
    const milieu = Math.round(0.55 * s.cadence);
    expect(demiTons(s.hauteurs[milieu], 220)).toBeLessThan(1);
    // Mais la confiance, elle, dit bien que rien n'était joué.
    expect(s.confiances[milieu]).toBeLessThan(0.5);
  });
});

describe("ce que le décodage apporte, mesuré et non affirmé", () => {
  it("tient la ligne là où YIN part en morceaux", () => {
    // Une note tenue, deux passages faibles et bruités au milieu : sur ces trames-là, YIN rend
    // quelque chose de toute façon — le plus bas minimum d'un signal qui n'en a pas.
    const x = concatener(
      ton(220, 0.35, 5), bruit(0.12, 0.05, 3),
      ton(220, 0.25, 5), bruit(0.12, 0.05, 11),
      ton(220, 0.35, 5),
    );
    const compterEcarts = (h: Float32Array) =>
      [...h].filter((f) => f > 0 && demiTons(f, 220) > 1).length;

    const avec = suivreHauteur(x, SR, { cadence: 100 });
    const sans = suivreHauteur(x, SR, { cadence: 100, viterbi: false });
    const nAvec = compterEcarts(avec.hauteurs), nSans = compterEcarts(sans.hauteurs);

    // On n'affirme pas que le décodage est parfait : on vérifie qu'il fait STRICTEMENT mieux,
    // et le message du test porte les deux nombres pour qu'un jour on les relise.
    expect(nAvec, `pYIN ${nAvec} trames fautives, YIN ${nSans}`).toBeLessThan(nSans);
    expect(demiTons(hauteurMediane(avec), 220)).toBeLessThan(0.2);
  });
});

describe("la courbe rendue", () => {
  it("place les hauteurs sur une échelle logarithmique, l'octave valant partout autant", () => {
    const s = { hauteurs: Float32Array.from([55, 110, 220, 440, 880, 1760]), confiances: new Float32Array(6).fill(1), cadence: 100 };
    const c = courbeDepuisHauteur(s, 55, 1760);
    // Cinq octaves de 55 à 1760 : chaque octave vaut un cinquième de la courbe, exactement.
    for (let i = 0; i < 6; i++) expect(c.valeurs[i]).toBeCloseTo(i / 5, 5);
  });

  it("reste entre zéro et un, même hors de la plage demandée", () => {
    const s = { hauteurs: Float32Array.from([20, 55, 5000]), confiances: new Float32Array(3).fill(1), cadence: 100 };
    const c = courbeDepuisHauteur(s, 55, 1760);
    expect([...c.valeurs].every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it("rend la confiance comme une courbe branchable telle quelle", () => {
    const s = suivreHauteur(ton(330, 0.4, 5), SR, { cadence: 100 });
    const c = courbeDeConfiance(s);
    expect(c.cadence).toBe(s.cadence);
    expect(c.valeurs.length).toBe(s.confiances.length);
    expect([...c.valeurs].every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it("garde la cadence demandée, puisque c'est elle qui décide du coût", () => {
    const s = suivreHauteur(ton(220, 0.5, 4), SR, { cadence: 50 });
    expect(s.cadence).toBe(50);
    expect(s.hauteurs.length).toBeCloseTo(0.5 * 50, 0);
  });
});
