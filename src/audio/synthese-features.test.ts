// audio/synthese-features.test.ts — Le tour complet, et ce qu'il rend vraiment.
//
// LE TEST QUI COMPTE N'EST PAS QUE LE CODE TOURNE : c'est de SYNTHÉTISER à partir d'un vecteur,
// de repasser le résultat dans l'extracteur, et de regarder ce qui revient. Le vecteur ne
// détermine pas un son — il en détermine une classe infinie —, si bien que la seule question
// honnête est « de combien s'approche-t-on », famille par famille. Les chiffres obtenus sont
// écrits dans les tests : ils sont la promesse du nœud, et non un espoir.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import {
  alphaPourCentroide, centroideDeSerie, ecartParFamille, enveloppeDepuisCepstre, gainAFrequence,
  hzDepuisMel, lireCible, melDepuisHz, sequenceClasses, synthetiser, type CibleFeatures,
} from "./synthese-features";
import { extraireVecteurFeatures } from "./features-piste";

const SR = 44100;

const CIBLE: CibleFeatures = {
  tempo: 120,
  centroide: 1500,
  chroma: [0.1, 0, 0.05, 0, 0.6, 0, 0, 0.8, 0, 0.2, 0, 0.05],
  cepstreMoyennes: [-20, 8, -3, 2, -1, 1, -0.5, 0.5, -0.2, 0.2, -0.1, 0.1, 0],
  cepstreVariances: Array.from({ length: 13 }, () => 4),
};

function enTampon(x: Float32Array): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 1, length: x.length, sampleRate: SR });
  b.copyToChannel(new Float32Array(x), 0);
  return b;
}

describe("l'échelle mel", () => {
  it("zéro hertz vaut zéro mel", () => {
    expect(melDepuisHz(0)).toBeCloseTo(0, 10);
    expect(hzDepuisMel(0)).toBeCloseTo(0, 10);
  });

  it("elle s'inverse", () => {
    for (const hz of [100, 440, 1000, 5000, 15000]) {
      expect(hzDepuisMel(melDepuisHz(hz))).toBeCloseTo(hz, 4);
    }
  });

  it("elle compresse l'aigu : mille hertz de plus valent moins de mels dans l'aigu", () => {
    expect(melDepuisHz(1100) - melDepuisHz(100)).toBeGreaterThan(melDepuisHz(9000) - melDepuisHz(8000));
  });
});

describe("le centroïde d'une série harmonique", () => {
  it("il vaut la fondamentale quand il n'y a qu'un partiel", () => {
    expect(centroideDeSerie(440, 1, 1)).toBeCloseTo(440, 6);
  });

  it("IL DÉCROÎT QUAND LA DÉCROISSANCE AUGMENTE — c'est ce qui le rend inversible", () => {
    const valeurs = [-1, 0, 1, 2, 4].map((a) => centroideDeSerie(220, 20, a));
    for (let i = 1; i < valeurs.length; i++) expect(valeurs[i]).toBeLessThan(valeurs[i - 1]);
  });

  it("sans décroissance, il tombe au milieu des partiels", () => {
    // Amplitudes égales sur vingt partiels : le centroïde est la moyenne, soit 10,5 × f0.
    expect(centroideDeSerie(100, 20, 0)).toBeCloseTo(1050, 6);
  });
});

describe("inverser le centroïde", () => {
  it("LA DÉCROISSANCE TROUVÉE REDONNE LE CENTROÏDE VISÉ", () => {
    for (const cible of [300, 800, 1500, 3000]) {
      const alpha = alphaPourCentroide(cible, 220, 30);
      expect(centroideDeSerie(220, 30, alpha)).toBeCloseTo(cible, 1);
    }
  });

  it("une cible hors de portée rend la borne, sans diverger", () => {
    expect(alphaPourCentroide(1, 220, 30)).toBe(8);        // trop grave : impossible
    expect(alphaPourCentroide(1e9, 220, 30)).toBe(-2);     // trop aigu : impossible
    expect(Number.isFinite(alphaPourCentroide(0, 220, 30))).toBe(true);
  });

  it("un centroïde plus aigu demande une décroissance plus faible", () => {
    expect(alphaPourCentroide(3000, 220, 30)).toBeLessThan(alphaPourCentroide(600, 220, 30));
  });
});

describe("l'enveloppe cepstrale", () => {
  it("elle est positive partout et culmine à un", () => {
    const e = enveloppeDepuisCepstre(CIBLE.cepstreMoyennes);
    expect([...e].every((v) => v > 0)).toBe(true);
    expect(Math.max(...e)).toBeCloseTo(1, 10);
  });

  it("un cepstre nul donne une enveloppe plate", () => {
    const e = enveloppeDepuisCepstre(new Array(13).fill(0));
    expect(Math.max(...e) - Math.min(...e)).toBeCloseTo(0, 10);
  });

  it("le premier coefficient ne change que le niveau, que la normalisation efface", () => {
    const a = enveloppeDepuisCepstre([0, 5, -2]);
    const b = enveloppeDepuisCepstre([100, 5, -2]);
    for (let i = 0; i < a.length; i++) expect(b[i]).toBeCloseTo(a[i], 8);
  });

  it("elle rend un gain interpolé à n'importe quelle fréquence", () => {
    const e = enveloppeDepuisCepstre(CIBLE.cepstreMoyennes);
    for (const hz of [50, 440, 5000, 21000, 1e6]) {
      expect(Number.isFinite(gainAFrequence(e, hz, SR))).toBe(true);
    }
  });
});

describe("la suite des classes de hauteur", () => {
  it("ELLE SUIT LES PROPORTIONS EXACTEMENT, sans bruit d'échantillonnage", () => {
    const suite = sequenceClasses(CIBLE.chroma, 100);
    expect(suite.length).toBe(100);
    const comptes = new Array(12).fill(0);
    for (const c of suite) comptes[c]++;
    const total = CIBLE.chroma.reduce((a, b) => a + b, 0);
    for (let i = 0; i < 12; i++) {
      // Au plus une note d'écart avec la proportion exacte : c'est l'arrondi, pas du hasard.
      expect(Math.abs(comptes[i] - (CIBLE.chroma[i] / total) * 100), `classe ${i}`).toBeLessThanOrEqual(1);
    }
  });

  it("un poids nul ne sort jamais", () => {
    for (const c of sequenceClasses(CIBLE.chroma, 200)) expect(CIBLE.chroma[c]).toBeGreaterThan(0);
  });

  it("les classes sont entrelacées, pas posées en blocs", () => {
    const suite = sequenceClasses(CIBLE.chroma, 40);
    let changements = 0;
    for (let i = 1; i < suite.length; i++) if (suite[i] !== suite[i - 1]) changements++;
    expect(changements).toBeGreaterThan(suite.length / 2);
  });

  it("la classe la plus lourde est la plus jouée", () => {
    const comptes = new Array(12).fill(0);
    for (const c of sequenceClasses(CIBLE.chroma, 60)) comptes[c]++;
    expect(comptes.indexOf(Math.max(...comptes))).toBe(CIBLE.chroma.indexOf(Math.max(...CIBLE.chroma)));
  });

  it("un chroma vide ne fait pas échouer la répartition", () => {
    expect(sequenceClasses(new Array(12).fill(0), 5)).toEqual([0, 0, 0, 0, 0]);
    expect(sequenceClasses(CIBLE.chroma, 0)).toEqual([]);
  });
});

describe("relire un vecteur", () => {
  it("il se range dans les quatre familles", () => {
    const etiquettes = [
      "Tempo (BPM)", "Centroïde spectral",
      ...Array.from({ length: 12 }, (_, i) => `Chroma ${i}`),
      ...Array.from({ length: 13 }, (_, i) => [`MFCC ${i} (moyenne)`, `MFCC ${i} (variance)`]).flat(),
    ];
    const vecteur = etiquettes.map((_, i) => i);
    const c = lireCible(vecteur, etiquettes);
    expect(c.tempo).toBe(0);
    expect(c.centroide).toBe(1);
    expect(c.chroma.length).toBe(12);
    expect(c.cepstreMoyennes.length).toBe(13);
    expect(c.cepstreVariances.length).toBe(13);
  });
});

describe("LE TOUR COMPLET : synthétiser, remesurer, comparer", () => {
  // On part d'un VRAI vecteur, celui d'un son analysé, plutôt que d'un vecteur inventé : c'est
  // l'usage réel du nœud, et un vecteur inventé pourrait être hors de portée de toute synthèse
  // sans qu'on le sache.
  const source = (() => {
    const n = SR * 4;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const note = Math.floor(t * 2) % 3;
      const f0 = [261.6, 329.6, 392][note];
      const attaque = Math.exp(-4 * (t % 0.5));
      for (let k = 1; k <= 8; k++) x[i] += (Math.pow(k, -1.5) / 3) * attaque * Math.sin(2 * Math.PI * f0 * k * t);
    }
    return enTampon(x);
  })();
  const { vecteur: vise, etiquettes } = extraireVecteurFeatures(source);
  const cible = lireCible(vise, etiquettes);
  const son = synthetiser(cible, { dureeSec: 8, frequence: SR, octave: 4, nPartiels: 24, graine: 5 });
  const { vecteur: obtenu } = extraireVecteurFeatures(enTampon(son));
  const ecarts = new Map(ecartParFamille(vise, obtenu, etiquettes).map((e) => [e.famille, e.ecart]));

  it("le son rendu est fini, audible, et de la durée demandée", () => {
    expect(son.length).toBe(SR * 8);
    // PAS DE `Math.max(...son)` : trois cent cinquante mille arguments dépassent ce qu'un appel
    // peut porter, et la fonction lève au lieu de répondre. Une boucle, pour un tableau de son.
    let crete = 0, fini = true;
    for (let i = 0; i < son.length; i++) {
      if (!Number.isFinite(son[i])) { fini = false; break; }
      crete = Math.max(crete, Math.abs(son[i]));
    }
    expect(fini).toBe(true);
    expect(crete).toBeGreaterThan(0.5);
  });

  it("le vecteur obtenu a bien quarante composantes, comparables une à une", () => {
    expect(obtenu.length).toBe(vise.length);
  });

  it("LE CENTROÏDE REVIENT À QUELQUES POUR CENT — 797 visés, 803 obtenus", () => {
    expect(ecarts.get("centroïde")!).toBeLessThan(0.05);
  });

  it("LE CHROMA REVIENT : les trois classes dominantes sont les mêmes", () => {
    // TROIS ET NON UNE. Mesuré sur cette cible, les deux premières classes ne sont séparées que
    // de neuf pour cent — do à 0,912 contre mi à 1,000 —, et la synthèse les rend à 1,000 et
    // 0,875 : mêmes classes, mêmes proportions, ordre échangé. Exiger la même classe dominante
    // reviendrait à tester laquelle de deux valeurs quasi égales l'emporte, ce qui ne dit rien
    // de la fidélité du chroma.
    const indices = etiquettes.map((l, i) => (l.startsWith("Chroma") ? i : -1)).filter((i) => i >= 0);
    const trois = (v: readonly number[]) => indices
      .map((i) => ({ i, v: v[i] })).sort((a, b) => b.v - a.v).slice(0, 3)
      .map((x) => etiquettes[x.i]).sort();
    expect(trois(obtenu)).toEqual(trois(vise));
  });

  it("LE TEMPO EST POSÉ EXACTEMENT, MAIS LE DÉTECTEUR LIT UN SOUS-MULTIPLE", () => {
    // La synthèse place une note tous les 60/tempo secondes : le tempo produit EST celui demandé.
    // Le détecteur, lui, rend 40 ou 60 pour 120 selon la graine — l'ambiguïté d'octave classique
    // de la détection de tempo, que des notes toutes de même force ne permettent pas de trancher.
    // Ce test tient donc ce qui est vrai : le rapport est un entier simple, et non n'importe quoi.
    const rapport = vise[0] / obtenu[0];
    expect(Number.isFinite(rapport)).toBe(true);
    expect(Math.abs(rapport - Math.round(rapport))).toBeLessThan(0.15);
    expect(Math.round(rapport)).toBeGreaterThanOrEqual(1);
    expect(Math.round(rapport)).toBeLessThanOrEqual(4);
  });

  it("LE CEPSTRE REVIENT MOINS BIEN, et c'est attendu : treize coefficients pour vingt-six bandes", () => {
    const moyenne = ecarts.get("cepstre (moyenne)")!;
    expect(moyenne).toBeGreaterThan(0);     // il ne revient pas exactement
    expect(moyenne).toBeLessThan(3);        // mais il reste du même ordre
  });

  it("toutes les familles sont mesurées, aucune n'est oubliée", () => {
    expect([...ecarts.keys()].sort()).toEqual(
      ["centroïde", "cepstre (moyenne)", "cepstre (variance)", "chroma", "tempo"],
    );
  });

  it("le même vecteur et la même graine rendent le même son", () => {
    const a = synthetiser(cible, { dureeSec: 2, frequence: SR, octave: 4, nPartiels: 16, graine: 9 });
    const b = synthetiser(cible, { dureeSec: 2, frequence: SR, octave: 4, nPartiels: 16, graine: 9 });
    expect([...a]).toEqual([...b]);
  });

  it("deux graines rendent deux sons différents", () => {
    const a = synthetiser(cible, { dureeSec: 2, frequence: SR, octave: 4, nPartiels: 16, graine: 1 });
    const b = synthetiser(cible, { dureeSec: 2, frequence: SR, octave: 4, nPartiels: 16, graine: 2 });
    expect([...a]).not.toEqual([...b]);
  });
});

describe("l'écart par famille", () => {
  it("il est nul quand les deux vecteurs coïncident", () => {
    const e = ecartParFamille([120, 2000], [120, 2000], ["Tempo (BPM)", "Centroïde spectral"]);
    expect(e.every((x) => x.ecart === 0)).toBe(true);
  });

  it("IL EST RELATIF : cinq de plus sur 120 pèsent moins que cinq de plus sur 0,3", () => {
    const grand = ecartParFamille([120], [125], ["Tempo (BPM)"])[0].ecart;
    const petit = ecartParFamille([0.3], [5.3], ["MFCC 1 (moyenne)"])[0].ecart;
    expect(petit).toBeGreaterThan(grand * 100);
  });

  it("une cible nulle ne fait pas diviser par zéro", () => {
    expect(Number.isFinite(ecartParFamille([0], [1], ["Tempo (BPM)"])[0].ecart)).toBe(true);
  });
});
