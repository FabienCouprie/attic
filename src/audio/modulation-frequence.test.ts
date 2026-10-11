// audio/modulation-frequence.test.ts — Les fréquences d'oscillateur ouvertes à une courbe.
//
// CE QU'UNE FRÉQUENCE D'OSCILLATEUR A DE PARTICULIER, et pourquoi elle ne se lit pas comme un gain.
// Un gain multiplie l'échantillon qu'il rencontre : le lire par échantillon suffit. Une fréquence,
// elle, ne se lit pas, elle s'INTÈGRE : c'est la phase qui fait le son, et la phase est la somme
// des fréquences rencontrées depuis le début. Poser la phase à `2π · f · t` n'est juste que pour
// une fréquence CONSTANTE ; sous une courbe, la fréquence instantanée d'un tel sinus vaut
// `f(t) + t · f'(t)`, et l'écart grandit avec le temps.
//
// LES DEUX COMPOSANTS DE CE LOT N'EN SONT PAS AU MÊME POINT, et c'est tout l'objet de ces cas :
//
//   · `synthetiserTable` accumulait DÉJÀ sa phase. Un pas qui varie y est donc exact, et le chemin
//     du nombre garde son calcul unique : une courbe plate y rend le scalaire AU BIT.
//   · `ringModulator` posait `2π · f · t`. Il lui faut une phase intégrée, donc DEUX CHEMINS, le
//     calcul direct restant recopié tel quel sans courbe. Une courbe plate n'y rend donc pas le
//     scalaire au bit, et le cas ci-dessous mesure l'écart réel plutôt que de le supposer.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { ringModulator } from "./effets-etirement";
import { banqueEngendree, synthetiserTable } from "./table-onde";
import { resonateurs } from "./concret";
import { peignesVoie } from "./peigne";
import { fft } from "./fft";

const SR = 16000;

/** Un tampon de uns : à mélange plein, la sortie EST la porteuse, et se mesure directement. */
const uns = (n: number): AudioBuffer => {
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  b.getChannelData(0).fill(1);
  return b;
};

const rampe = (n: number, a: number, b: number): Float32Array =>
  Float32Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

/** Les montées par zéro : une par cycle de la porteuse. */
const montees = (x: Float32Array): number => {
  let k = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) k++;
  return k;
};

describe("la porteuse du ring modulator", () => {
  it("SUIT LA FRÉQUENCE DEMANDÉE, et le calcul direct en rendrait presque le double", () => {
    // Une rampe de 100 à 1000 hertz sur une seconde. Le nombre de cycles parcourus est l'INTÉGRALE
    // de la fréquence, soit la moyenne des deux bouts : cinq cent cinquante. Le calcul direct, lui,
    // poserait la phase finale à `2π · 1000 · 1`, soit mille cycles — presque le double.
    const n = SR;
    const f = rampe(n, 100, 1000);
    const y = ringModulator(uns(n), f, 100).getChannelData(0);
    const integrale = f.reduce((s, v) => s + v, 0) / SR;

    expect(integrale).toBeCloseTo(550, 0);
    expect(montees(y), "la porteuse ne suit pas l'intégrale de la fréquence").toBeGreaterThan(545);
    expect(montees(y)).toBeLessThan(555);
    // Et le voici bien loin de ce que le calcul direct aurait rendu.
    expect(montees(y), "la phase n'est pas intégrée : on retrouve la fréquence finale")
      .toBeLessThan(800);
  });

  it("UNE COURBE PLATE REND LE SCALAIRE, mais pas au bit, et l'écart est mesuré", () => {
    // DEUX CHEMINS NE PEUVENT PAS ÊTRE ÉGAUX AU BIT, et ce cas le dit plutôt que de l'éviter. Le
    // chemin direct calcule le sinus d'un argument qui CROÎT jusqu'à `2π · f · durée` ; le chemin
    // intégré le calcule sur un argument ramené dans un tour. Les deux sont congrus en
    // mathématiques, non en virgule flottante. Relevé sur une seconde : l'écart ne dépasse pas
    // 1,3·10⁻¹², soit cinq ordres de grandeur sous ce qu'un flottant simple distingue.
    const n = SR;
    const scalaire = ringModulator(uns(n), 256, 100).getChannelData(0);
    const plate = ringModulator(uns(n), new Float32Array(n).fill(256), 100).getChannelData(0);
    let ecart = 0;
    for (let i = 0; i < n; i++) ecart = Math.max(ecart, Math.abs(scalaire[i] - plate[i]));
    expect(ecart, "les deux chemins de la porteuse ont divergé").toBeLessThan(1e-9);
  });
});

describe("la fréquence de l'oscillateur à table d'onde", () => {
  const banque = banqueEngendree("sinus-scie", 8);
  const base = { duree: 0.5, position: 0.5, modulationPosition: 0, vitesseModulation: 0.3 };

  it("UNE COURBE PLATE REND LE SCALAIRE AU BIT, la phase y étant déjà accumulée", () => {
    // Ici un seul chemin suffit : le pas de lecture s'ajoute déjà à une phase, et `valeurTransformee`
    // garde au scalaire son calcul unique. L'exactitude au bit est donc exigible, à la différence
    // du ring modulator.
    const scalaire = synthetiserTable(banque, { ...base, frequence: 256 }, SR);
    const plate = synthetiserTable(banque, {
      ...base, frequence: new Float32Array(8000).fill(256),
    }, SR);
    expect(Array.from(plate)).toEqual(Array.from(scalaire));
  });

  it("LES HARMONIQUES SONT BORNÉES SUR LE SOMMET DE LA COURBE, et le grave y perd", () => {
    // UN PALIER PUIS UNE MONTÉE. Sur le début, la fréquence vaut 110 hertz, exactement celle du
    // scalaire auquel on la compare : seul le nombre d'harmoniques gardées peut les séparer. Borné
    // sur le sommet de 3520 hertz, le palier sort plus sobre que le même 110 hertz fixe. C'est le
    // compromis assumé : une table un peu plus sobre au grave plutôt qu'un repliement à l'aigu,
    // puisque le rang maximal décroît quand la fréquence monte.
    const n = 8192;
    const partiels = (x: Float32Array): number => {
      const re = new Float64Array(n), im = new Float64Array(n);
      for (let i = 0; i < n; i++) re[i] = x[i] ?? 0;
      fft(re, im, false);
      const m: number[] = [];
      let pic = 0;
      for (let k = 1; k < n / 2; k++) {
        const v = Math.hypot(re[k], im[k]);
        m.push(v);
        if (v > pic) pic = v;
      }
      return m.filter((v) => v > pic / 100).length;
    };

    const paliers = new Float32Array(32000);
    paliers.fill(110, 0, 16000);
    paliers.set(rampe(16000, 110, 3520), 16000);
    const borneSurSommet = partiels(synthetiserTable(banque, { ...base, duree: 2, frequence: paliers }, SR));
    const scalaireGrave = partiels(synthetiserTable(banque, { ...base, duree: 2, frequence: 110 }, SR));

    // Relevé : 119 partiels contre 234. La marge est large, le chiffre exact dépendant du seuil.
    expect(scalaireGrave, "le scalaire grave devrait porter beaucoup de partiels")
      .toBeGreaterThan(200);
    expect(borneSurSommet, "le palier n'est pas borné sur le sommet de la courbe")
      .toBeLessThan(scalaireGrave * 0.7);
  });
});

describe("les deux résonances, et la brillance", () => {
  // CES TROIS RÉGLAGES SE DÉDUISENT EN GAIN DE BOUCLE, et non en échelle : un T60 donne le rayon
  // du pôle par `10^(−3/(T60·sr))`, une brillance donne l'exposant qui pèse les rangs. Les deux
  // invariants restent les mêmes : sans courbe pas un bit ne bouge, et une courbe plate rend
  // exactement ce que rend le nombre qu'elle vaut.
  //
  // LES VALEURS SONT DYADIQUES, un quart et deux secondes : seule une fraction dyadique se compare
  // exactement entre le flottant simple d'un tableau et le double d'un nombre.
  const sonDEssai = (n: number): AudioBuffer => {
    const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
    const x = b.getChannelData(0);
    for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * 300 * i) / SR) * 0.5;
    return b;
  };

  it("LE T60 DES RÉSONATEURS : une courbe plate rend le nombre, au bit", () => {
    const base = { fondamentale: 220, rapports: [1, 2, 3, 4], brillance: 50, mix: 100 };
    const a = resonateurs(sonDEssai(4000), { ...base, t60: 0.25 });
    const b = resonateurs(sonDEssai(4000), { ...base, t60: new Float32Array(4000).fill(0.25) });
    expect(b.length, "la queue ne suit pas le maximum de la courbe").toBe(a.length);
    expect(Array.from(b.getChannelData(0))).toEqual(Array.from(a.getChannelData(0)));
  });

  it("ET LA QUEUE SE MESURE SUR LE MAXIMUM, non sur la valeur du moment", () => {
    const base = { fondamentale: 220, rapports: [1, 2, 3, 4], brillance: 50, mix: 100 };
    const monte = Float32Array.from({ length: 4000 }, (_, i) => 0.25 + (1.75 * i) / 3999);
    const rampe = resonateurs(sonDEssai(4000), { ...base, t60: monte });
    const auSommet = resonateurs(sonDEssai(4000), { ...base, t60: 2 });
    const auPlancher = resonateurs(sonDEssai(4000), { ...base, t60: 0.25 });
    expect(rampe.length, "la rampe n'a pas la longueur de son sommet").toBe(auSommet.length);
    expect(rampe.length).toBeGreaterThan(auPlancher.length);
  });

  it("LA BRILLANCE DES RÉSONATEURS : une courbe plate rend le nombre, au bit", () => {
    const base = { fondamentale: 220, rapports: [1, 2, 3, 4], t60: 0.25, mix: 100 };
    const a = resonateurs(sonDEssai(4000), { ...base, brillance: 25 });
    const b = resonateurs(sonDEssai(4000), { ...base, brillance: new Float32Array(4000).fill(25) });
    expect(Array.from(b.getChannelData(0))).toEqual(Array.from(a.getChannelData(0)));
  });

  it("LE T60 DES PEIGNES ACCORDÉS : une courbe plate rend le nombre, au bit", () => {
    const base = { frequences: [110, 165, 220], amortissement: 20, frequence: SR };
    const x = sonDEssai(4000).getChannelData(0);
    const a = peignesVoie(x, { ...base, t60: 0.25 });
    const b = peignesVoie(x, { ...base, t60: new Float32Array(4000).fill(0.25) });
    expect(b.length, "la traîne ne suit pas le maximum de la courbe").toBe(a.length);
    expect(Array.from(b)).toEqual(Array.from(a));
  });

  it("ET LEUR TRAÎNE SE MESURE SUR LE MAXIMUM", () => {
    const base = { frequences: [110, 165, 220], amortissement: 20, frequence: SR };
    const x = sonDEssai(4000).getChannelData(0);
    const monte = Float32Array.from({ length: 4000 }, (_, i) => 0.25 + (1.75 * i) / 3999);
    expect(peignesVoie(x, { ...base, t60: monte }).length)
      .toBe(peignesVoie(x, { ...base, t60: 2 }).length);
  });
});
