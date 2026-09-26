// audio/harmonie-spectrale.test.ts — Les écarts au tempérament sont des valeurs connues, pas des
// opinions : c'est par elles qu'on vérifie qu'un spectre est juste.
//
// UN SPECTRE SE CONTRÔLE PAR SES CENTS. Dire « le septième partiel est un si bémol » ne prouve
// rien ; dire qu'il tombe à trente et un cents sous le si bémol tempéré est une valeur publiée
// depuis deux siècles, et une erreur d'un demi-ton comme d'un centième s'y verrait aussitôt.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import { frequenceDeNoteMidi, noteMidiDeFrequence } from "./commun";
import { rendreSequence } from "./midi";
import {
  besselJ, decrirePartiels, ecartAuTempere, fondamentaleVirtuelle, modulationEnAnneau,
  partielsVersNotes, serieHarmonique, spectreDistordu, spectreFM,
} from "./harmonie-spectrale";

const LA2 = 110;

describe("la conversion dans les deux sens", () => {
  it("SE REFERME SUR UNE FRACTION, ce qui est la condition de tout le reste", () => {
    for (const h of [69, 69.5, 60.37, 21, 108, 44.99]) {
      expect(noteMidiDeFrequence(frequenceDeNoteMidi(h))).toBeCloseTo(h, 9);
    }
  });

  it("refuse une fréquence qui n'a pas de hauteur, au lieu de rendre l'infini", () => {
    // Un partiel replié peut tomber à zéro, une différence peut s'annuler : sans ce refus,
    // `log2(0)` donnerait moins l'infini, et une note impossible partirait dans le graphe.
    expect(Number.isNaN(noteMidiDeFrequence(0))).toBe(true);
    expect(Number.isNaN(noteMidiDeFrequence(-100))).toBe(true);
  });
});

describe("la série harmonique", () => {
  it("place ses partiels aux multiples entiers de la fondamentale", () => {
    const s = serieHarmonique(LA2, 8);
    expect(s.length).toBe(8);
    expect(s.map((p) => p.frequence)).toEqual([110, 220, 330, 440, 550, 660, 770, 880]);
  });

  it("RETROUVE LES ÉCARTS PUBLIÉS, et c'est le contrôle qui compte", () => {
    const s = serieHarmonique(LA2, 16);
    // Les octaves sont justes par construction : rangs 1, 2, 4, 8, 16.
    for (const rang of [1, 2, 4, 8, 16]) expect(ecartAuTempere(s[rang - 1].frequence)).toBe(0);
    // La quinte du troisième partiel est deux cents au-dessus de la quinte tempérée.
    expect(ecartAuTempere(s[2].frequence)).toBe(2);
    // La tierce majeure du cinquième est quatorze cents en dessous.
    expect(ecartAuTempere(s[4].frequence)).toBe(-14);
    // LE SEPTIÈME PARTIEL, la septième harmonique, est trente et un cents sous la septième
    // mineure tempérée : c'est l'écart le plus cité de toute la série.
    expect(ecartAuTempere(s[6].frequence)).toBe(-31);
    // Le onzième tombe entre la quarte et la quarte augmentée, cinquante et un cents sous elle.
    expect(ecartAuTempere(s[10].frequence)).toBe(-49);
    // Le treizième est quarante cents sous la sixte mineure.
    expect(ecartAuTempere(s[12].frequence)).toBe(41);
  });

  it("décroît en 1/k, et la fondamentale est la plus forte", () => {
    const s = serieHarmonique(LA2, 4);
    expect(s[0].amplitude).toBe(1);
    expect(s[3].amplitude).toBeCloseTo(0.25, 9);
  });
});

describe("le spectre distordu", () => {
  it("à coefficient un, C'EST EXACTEMENT LA SÉRIE HARMONIQUE", () => {
    const a = spectreDistordu(LA2, 10, 1).map((p) => p.frequence);
    const b = serieHarmonique(LA2, 10).map((p) => p.frequence);
    a.forEach((f, i) => expect(f).toBeCloseTo(b[i], 9));
  });

  it("comprimé, les partiels se resserrent ; dilaté, ils s'écartent", () => {
    const serre = spectreDistordu(LA2, 8, 0.8);
    const large = spectreDistordu(LA2, 8, 1.2);
    const droit = serieHarmonique(LA2, 8);
    // La fondamentale ne bouge jamais : 1 élevé à n'importe quelle puissance vaut un.
    expect(serre[0].frequence).toBeCloseTo(LA2, 9);
    expect(large[0].frequence).toBeCloseTo(LA2, 9);
    // Et l'écart s'ouvre avec le rang, dans un sens puis dans l'autre.
    expect(serre[7].frequence).toBeLessThan(droit[7].frequence);
    expect(large[7].frequence).toBeGreaterThan(droit[7].frequence);
  });

  it("SORT DU TEMPÉRAMENT, ce qui est la raison d'être du procédé", () => {
    const s = spectreDistordu(LA2, 6, 1.1);
    const hors = s.filter((p) => ecartAuTempere(p.frequence) !== 0);
    expect(hors.length, "un spectre distordu ne doit pas tomber sur le clavier").toBeGreaterThan(3);
  });
});

describe("la modulation en anneau", () => {
  it("rend les sommes et les différences, sans signe", () => {
    const r = modulationEnAnneau([300], [200]).map((p) => Math.round(p.frequence));
    expect(r).toEqual([100, 500]);
  });

  it("replie la différence négative au lieu de la perdre", () => {
    const r = modulationEnAnneau([200], [500]).map((p) => Math.round(p.frequence));
    expect(r).toEqual([300, 700]);
  });

  it("FOND LES PARTIELS QUI SE CONFONDENT, sinon la liste enfle pour rien", () => {
    // 300 et 200 d'un côté, 100 de l'autre : 300−100 et 200+0… les recouvrements sont la règle,
    // et deux hauteurs à moins d'un cent l'une de l'autre ne s'entendent ni ne se notent à part.
    const r = modulationEnAnneau([300, 200], [100]);
    const frequences = r.map((p) => Math.round(p.frequence));
    expect(new Set(frequences).size, "aucun doublon ne doit rester").toBe(frequences.length);
    expect(frequences).toEqual([100, 200, 300, 400]);
  });

  it("écarte la différence nulle, qui n'est pas une hauteur", () => {
    const r = modulationEnAnneau([440], [440]).map((p) => Math.round(p.frequence));
    expect(r).toEqual([880]);
  });
});

describe("la modulation de fréquence, d'après Chowning", () => {
  it("LA FONCTION DE BESSEL RETROUVE SES VALEURS TABULÉES", () => {
    // Valeurs de référence des tables usuelles, à cinq décimales.
    expect(besselJ(0, 0)).toBeCloseTo(1, 9);
    expect(besselJ(1, 0)).toBeCloseTo(0, 9);
    expect(besselJ(0, 1)).toBeCloseTo(0.765198, 5);
    expect(besselJ(1, 1)).toBeCloseTo(0.440051, 5);
    expect(besselJ(2, 1)).toBeCloseTo(0.114903, 5);
    expect(besselJ(0, 2.4048)).toBeCloseTo(0, 4); // le premier zéro de J0
    expect(besselJ(3, 5)).toBeCloseTo(0.364831, 5);
  });

  it("l'ordre négatif suit la symétrie J(−n) = (−1)^n J(n)", () => {
    expect(besselJ(-1, 1)).toBeCloseTo(-besselJ(1, 1), 9);
    expect(besselJ(-2, 1)).toBeCloseTo(besselJ(2, 1), 9);
  });

  it("à indice nul, IL NE RESTE QUE LA PORTEUSE", () => {
    const s = spectreFM(440, 110, 0);
    expect(s.length).toBe(1);
    expect(s[0].frequence).toBeCloseTo(440, 9);
  });

  it("les bandes tombent à porteuse plus ou moins k fois la modulante", () => {
    const s = spectreFM(440, 110, 2).map((p) => Math.round(p.frequence));
    for (const f of s) expect(Math.abs(f - 440) % 110, `${f} Hz`).toBeLessThan(1);
    expect(s).toContain(440);
    expect(s).toContain(550);
    expect(s).toContain(330);
  });

  it("REPLIE LES FRÉQUENCES NÉGATIVES autour de zéro, comme le décrit l'article", () => {
    // Porteuse 100, modulante 200, indice 3 : la bande k = −1 tombe à −100, et se replie à 100.
    const s = spectreFM(100, 200, 3).map((p) => Math.round(p.frequence));
    expect(s.every((f) => f > 0), "aucune fréquence négative ne doit sortir").toBe(true);
    expect(s).toContain(100);
  });

  it("l'indice élargit le spectre, et c'est à cela qu'il sert", () => {
    expect(spectreFM(440, 110, 5).length).toBeGreaterThan(spectreFM(440, 110, 1).length);
  });
});

describe("la fondamentale virtuelle", () => {
  it("retrouve la fondamentale d'une série harmonique à laquelle elle manque", () => {
    // Les partiels 3, 4 et 5 d'un la à 110 Hz : la fondamentale n'est pas jouée, et s'entend.
    const f = fondamentaleVirtuelle([330, 440, 550]);
    expect(f).toBeCloseTo(110, 6);
  });

  it("rend la note elle-même quand il n'y en a qu'une", () => {
    expect(fondamentaleVirtuelle([440])).toBe(440);
  });

  it("NE DESCEND PAS INDÉFINIMENT, ce qui est le piège du procédé", () => {
    // Divisée encore et encore, une fondamentale explique toujours mieux : la pénalité doit
    // faire préférer la plus haute des explications acceptables.
    expect(fondamentaleVirtuelle([220, 440, 660])).toBeCloseTo(220, 6);
  });

  it("rend zéro plutôt que n'importe quoi sur une liste vide", () => {
    expect(fondamentaleVirtuelle([])).toBe(0);
  });
});

describe("des partiels aux notes", () => {
  it("GARDE LA FRACTION : c'est tout l'objet du flux partition", () => {
    const notes = partielsVersNotes(serieHarmonique(LA2, 7));
    const septieme = notes[6];
    expect(Number.isInteger(septieme.note), "le septième partiel ne tombe pas sur une touche").toBe(false);
    expect(septieme.note).toBeCloseTo(noteMidiDeFrequence(770), 9);
    expect(Math.round((septieme.note - Math.round(septieme.note)) * 100)).toBe(-31);
  });

  it("écarte ce qui sort du clavier plutôt que de le replier", () => {
    // Sur un la0 à 27,5 Hz, il faut aller loin avant de dépasser le do8 : ce dernier est à
    // 4186 Hz, soit le rang 152. Le rang 153 le franchit, et doit disparaître au lieu d'être
    // replié à l'octave, ce qui inventerait une hauteur que le procédé n'a pas produite.
    const notes = partielsVersNotes(serieHarmonique(27.5, 200));
    expect(notes.every((n) => n.note >= 21 && n.note <= 108)).toBe(true);
    expect(notes.length).toBe(152);
  });

  it("LES PARTIELS AIGUS S'ÉTEIGNENT LES PREMIERS, ET LES DÉPARTS NE BOUGENT PAS", () => {
    // Avec une seule enveloppe pour tous, l'agrégat sonne comme un jeu d'orgue. Un son réel évolue
    // parce que ses partiels hauts s'amortissent plus vite. Ce qui ne doit surtout PAS bouger, ce
    // sont les départs : l'attaque commune est ce qui fait entendre un son et non un accord.
    const notes = partielsVersNotes(serieHarmonique(LA2, 12), { duree: 3, decroissance: 1 });
    expect(new Set(notes.map((n) => n.debut)).size, "un seul départ").toBe(1);
    // À une décroissance de un, le partiel de rang k dure la durée divisée par k.
    expect(notes[0].fin - notes[0].debut).toBeCloseTo(3, 6);
    expect(notes[1].fin - notes[1].debut).toBeCloseTo(1.5, 6);
    expect(notes[11].fin - notes[11].debut).toBeCloseTo(0.25, 6);
    // Et les durées décroissent sans exception.
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i].fin, `rang ${i + 1}`).toBeLessThan(notes[i - 1].fin);
    }
  });

  it("à décroissance nulle, RIEN NE CHANGE : l'agrégat reste plat", () => {
    const notes = partielsVersNotes(serieHarmonique(LA2, 8), { duree: 3, decroissance: 0 });
    expect(new Set(notes.map((n) => n.fin)).size).toBe(1);
    expect(notes[0].fin).toBeCloseTo(3, 9);
  });

  it("ne réduit pas un partiel à un clic, si haut soit-il", () => {
    // Sur un spectre très étendu et une décroissance forte, les derniers rangs tomberaient sous la
    // milliseconde et le rendu les sauterait sans rien dire.
    const notes = partielsVersNotes(serieHarmonique(LA2, 40), { duree: 1, decroissance: 2 });
    for (const n of notes) expect(n.fin - n.debut).toBeGreaterThanOrEqual(0.05);
  });

  it("l'amortissement se prend sur la fréquence, donc il vaut aussi pour un spectre inharmonique", () => {
    const notes = partielsVersNotes(spectreDistordu(LA2, 6, 1.3), { duree: 2, decroissance: 1 });
    const durees = notes.map((n) => n.fin - n.debut);
    for (let i = 1; i < durees.length; i++) expect(durees[i]).toBeLessThan(durees[i - 1]);
  });

  it("étale les notes quand on le demande, et les empile sinon", () => {
    const accord = partielsVersNotes(serieHarmonique(LA2, 4), { duree: 1 });
    expect(new Set(accord.map((n) => n.debut)).size).toBe(1);
    const arpege = partielsVersNotes(serieHarmonique(LA2, 4), { duree: 1, etalement: 0.25 });
    expect(arpege.map((n) => n.debut)).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it("donne une nuance qui suit l'amplitude, et jamais zéro", () => {
    const notes = partielsVersNotes(serieHarmonique(LA2, 12), { velocite: 100 });
    expect(notes[0].velocite).toBe(100);
    expect(notes[11].velocite).toBeGreaterThanOrEqual(1);
    expect(notes[11].velocite).toBeLessThan(notes[0].velocite);
  });
});

describe("ce qu'on entend est-il ce qu'on a calculé", () => {
  // RELEVÉ PAR FABIEN À L'ÉCOUTE : « le son obtenu ressemble à une explosion ». Il avait raison, et
  // la cause n'était ni le calcul ni la saturation — crête mesurée à 0,445, aucun échantillon
  // saturé. Chaque note était rendue par une modulation de fréquence d'indice trois, qui lui ajoute
  // une huitaine de bandes latérales : douze partiels devenaient une centaine de composantes,
  // attaquées ensemble en cinq millisecondes. Le spectre entendu n'était pas celui qui avait été
  // écrit, ce qui, pour un composant d'harmonie spectrale, est un défaut et non un timbre.
  const energieParBande = (d: Float32Array, sr: number) => {
    const N = Math.min(16384, d.length - Math.floor(0.5 * sr));
    const debut = Math.floor(0.5 * sr);
    let grave = 0, haut = 0;
    for (let k = 0; k < 60; k++) {
      const f = 80 * Math.pow(16000 / 80, k / 59);
      const w = (2 * Math.PI * f) / sr, coef = 2 * Math.cos(w);
      let s1 = 0, s2 = 0;
      for (let i = 0; i < N; i++) { const s0 = d[debut + i] + coef * s1 - s2; s2 = s1; s1 = s0; }
      const p = s1 * s1 + s2 * s2 - coef * s1 * s2;
      if (f < 500) grave += p; else haut += p;
    }
    return grave / (grave + haut);
  };

  it("LA SINUSOÏDE REND LE SPECTRE ÉCRIT, la modulation en rend un autre", async () => {
    // Une série harmonique de douze partiels à 110 Hz a ses amplitudes en 1/k : l'essentiel de son
    // énergie est sous 500 Hz, dans les quatre premiers partiels. C'est un fait du calcul, et le
    // rendu doit le refléter.
    const notes = partielsVersNotes(serieHarmonique(110, 12), { duree: 2, velocite: 100 });
    const sinus = await rendreSequence(notes, "FM/Oscillateurs", 80, undefined, undefined, "pur");
    const partSinus = energieParBande(sinus.getChannelData(0), sinus.sampleRate);
    expect(partSinus, "le grave doit porter l'essentiel, comme dans le calcul").toBeGreaterThan(0.9);

    const module = await rendreSequence(notes, "FM/Oscillateurs", 80, undefined, undefined, "brillante");
    const partModule = energieParBande(module.getChannelData(0), module.sampleRate);
    expect(partModule, "le timbre modulé déplace l'énergie ailleurs").toBeLessThan(0.1);
  });

  it("LE SON ÉVOLUE : à la fin, il ne reste que le grave", async () => {
    // C'est la mesure qui dit si l'amortissement s'entend, et non seulement s'il est calculé. On
    // compare la part du grave au début et à la fin : avec des partiels aigus plus courts, elle
    // doit monter. Sans amortissement, elle ne bouge pas.
    const partiels = serieHarmonique(110, 12);
    const part = (d: Float32Array, sr: number, instant: number) => {
      const N = Math.min(8192, d.length - Math.floor(instant * sr) - 1);
      const debut = Math.floor(instant * sr);
      let grave = 0, haut = 0;
      for (let k = 0; k < 40; k++) {
        const f = 80 * Math.pow(16000 / 80, k / 39);
        const w = (2 * Math.PI * f) / sr, coef = 2 * Math.cos(w);
        let s1 = 0, s2 = 0;
        for (let i = 0; i < N; i++) { const s0 = d[debut + i] + coef * s1 - s2; s2 = s1; s1 = s0; }
        const p = s1 * s1 + s2 * s2 - coef * s1 * s2;
        if (f < 400) grave += p; else haut += p;
      }
      return { grave, haut, part: grave / (grave + haut) };
    };
    const rendre = async (decroissance: number) => {
      const notes = partielsVersNotes(partiels, { duree: 3, decroissance, velocite: 100 });
      const b = await rendreSequence(notes, "FM/Oscillateurs", 80, undefined, undefined, "pur");
      const d = b.getChannelData(0);
      return { debut: part(d, b.sampleRate, 0.2), fin: part(d, b.sampleRate, 2.2) };
    };
    // SANS AMORTISSEMENT, LE SPECTRE EST FIGÉ : l'aigu pèse autant à la fin qu'au début, au
    // millième près. C'est le son d'orgue qu'on cherche à quitter.
    const plat = await rendre(0);
    expect(plat.fin.haut / plat.debut.haut).toBeCloseTo(1, 3);
    expect(plat.fin.part).toBeCloseTo(0.79, 2);
    // AVEC L'AMORTISSEMENT PAR DÉFAUT, l'aigu tombe à trois millièmes de ce qu'il pesait, et il ne
    // reste à la fin que le grave : la part passe de 79 % à plus de 99 %.
    const vivant = await rendre(0.5);
    expect(vivant.debut.part, "au début, rien n'a encore changé").toBeCloseTo(0.79, 2);
    expect(vivant.fin.haut / vivant.debut.haut, "l'aigu s'est éteint").toBeLessThan(0.05);
    expect(vivant.fin.part, "à la fin, il ne reste que le grave").toBeGreaterThan(0.99);
  });

  it("et ce n'était pas une saturation : la crête reste loin de la pleine échelle", async () => {
    const notes = partielsVersNotes(serieHarmonique(110, 12), { duree: 2, velocite: 100 });
    const buf = await rendreSequence(notes, "FM/Oscillateurs", 80, undefined, undefined, "pur");
    const d = buf.getChannelData(0);
    let crete = 0;
    for (const v of d) crete = Math.max(crete, Math.abs(v));
    expect(crete).toBeLessThan(0.95);
    expect(crete, "et le son ne doit pas être inaudible pour autant").toBeGreaterThan(0.05);
  });
});

describe("la description lisible", () => {
  it("dit la fréquence, la hauteur et l'écart de chaque partiel", () => {
    const texte = decrirePartiels(serieHarmonique(LA2, 7));
    expect(texte.split("\n").length).toBe(7);
    expect(texte).toContain("110.00 Hz");
    expect(texte).toContain("−31 cents");
    expect(texte.split("\n")[0]).toContain("juste");
  });
});
