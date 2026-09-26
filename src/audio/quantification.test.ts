// audio/quantification.test.ts — L'aller-retour est le seul controle a notre portee.
//
// POURQUOI L'ALLER-RETOUR. Les metriques de la litterature — F1 des attaques, exactitude des valeurs
// de note, MUSTER — supposent un corpus d'executions alignees sur leurs partitions, que nous n'avons
// pas. Le controle dont nous disposons est interne et il est fort : derouler un arbre en durees,
// requantifier ces durees, et retrouver l'arbre. Le catalogue en donne des centaines de cas, et une
// boucle dit immediatement sur lesquels le compromis se trompe.
//
// CE QU'IL NE PROUVE PAS. Qu'une execution humaine serait bien transcrite : un aller-retour part de
// durees exactes, sans les irregularites d'un jeu. Il prouve que le procede ne se perd pas sur ce
// qu'il devrait reconnaitre du premier coup, ce qui est la condition minimale.
import { describe, expect, it } from "vitest";

import { derouler, ecrireArbre, lireArbre, type Mesure } from "./arbre-rythmique";
import { catalogueArbres } from "./arbres-catalogue";
import { POIDS_DEFAUT, quantifier } from "./quantification";
import type { Note } from "./note";

const TEMPO = 120;

/** Les notes qu'un arbre produit, telles que la quantification les recevra. */
function jouer(mesures: readonly Mesure[], tempo = TEMPO): Note[] {
  return derouler(mesures, tempo)
    .filter((e) => !e.silence)
    .map((e) => ({ note: 60, velocite: 90, debut: e.debut, fin: e.debut + e.duree }));
}

const requantifier = (mesures: readonly Mesure[], o = {}) =>
  quantifier(jouer(mesures), { tempo: TEMPO, ...o });

describe("l'aller-retour sur des rythmes simples", () => {
  const CAS: [string, string][] = [
    ["quatre noires", "(4/4 (1 1 1 1))"],
    ["deux blanches", "(4/4 (1 1))"],
    ["huit croches", "(4/4 ((1 (1 1)) (1 (1 1)) (1 (1 1)) (1 (1 1))))"],
    ["un triolet au deuxieme temps", "(4/4 (1 (1 (1 1 1)) 1 1))"],
    ["un quintolet sur la mesure", "(4/4 ((4 (1 1 1 1 1))))"],
    ["trois temps", "(3/4 (1 1 1))"],
  ];

  for (const [nom, texte] of CAS) {
    it(`« ${nom} » se retrouve`, () => {
      const attendu = lireArbre(texte);
      const metrique = attendu[0].metrique;
      const solutions = requantifier(attendu, { metrique });
      expect(solutions.length, nom).toBeGreaterThan(0);
      // LES ATTAQUES DOIVENT RETOMBER AU MEME ENDROIT : c'est ce qui compte, plus que l'identite
      // litterale de l'arbre, deux ecritures pouvant donner les memes instants.
      const avant = derouler(attendu, TEMPO).filter((e) => !e.silence).map((e) => e.debut);
      const apres = derouler(solutions[0].mesures, TEMPO).filter((e) => !e.silence).map((e) => e.debut);
      expect(apres.length, `${nom} : ${ecrireArbre(solutions[0].mesures)}`).toBe(avant.length);
      avant.forEach((t, i) => expect(apres[i], `${nom} attaque ${i}`).toBeCloseTo(t, 6));
    });
  }

  it("LA DISTANCE EST NULLE sur une entree deja exacte", () => {
    for (const [, texte] of CAS) {
      const s = requantifier(lireArbre(texte), { metrique: lireArbre(texte)[0].metrique });
      expect(s[0].distance, texte).toBeCloseTo(0, 9);
    }
  });
});

describe("l'aller-retour sur le catalogue", () => {
  // Le catalogue a un etage de division : ce que la quantification doit reconnaitre sans hesiter.
  const catalogue = catalogueArbres({ emplacementsMax: 4, partsMax: 3, silences: false });

  it("RETROUVE LES ATTAQUES DE CHAQUE ARBRE, sur les cent vingt", () => {
    expect(catalogue.length, "le compte annonce doit etre le vrai").toBe(120);
    let manques = 0;
    const exemples: string[] = [];
    for (const m of catalogue) {
      const notes = jouer([m]);
      if (notes.length === 0) continue;
      const s = quantifier(notes, { tempo: TEMPO, metrique: m.metrique, compromis: 0.35 });
      const avant = notes.map((n) => n.debut);
      const apres = derouler(s[0].mesures, TEMPO).filter((e) => !e.silence).map((e) => e.debut);
      const juste = apres.length === avant.length
        && avant.every((t, i) => Math.abs(apres[i] - t) < 1e-6);
      if (!juste) { manques++; if (exemples.length < 5) exemples.push(ecrireArbre([m])); }
    }
    expect(manques, `arbres manques : ${exemples.join(" ")}`).toBe(0);
  });
});

describe("le compromis", () => {
  const presque = (): Note[] => {
    // Quatre noires, dont la troisieme en retard de vingt millisecondes : le genre d'ecart qu'un
    // jeu produit et qu'une partition ne doit pas ecrire.
    const t = [0, 0.5, 1.02, 1.5];
    return t.map((d) => ({ note: 60, velocite: 90, debut: d, fin: d + 0.4 }));
  };

  it("A COMPROMIS ELEVE, L'ECRITURE RESTE SIMPLE malgre l'ecart", () => {
    const s = quantifier(presque(), { tempo: TEMPO, compromis: 0.9 });
    expect(ecrireArbre(s[0].mesures)).toBe("(4/4 (1 1 1 1))");
  });

  it("A COMPROMIS NUL, LA FIDELITE L'EMPORTE et l'ecriture se complique", () => {
    const simple = quantifier(presque(), { tempo: TEMPO, compromis: 0.9 })[0];
    const fidele = quantifier(presque(), { tempo: TEMPO, compromis: 0 })[0];
    expect(fidele.distance).toBeLessThanOrEqual(simple.distance + 1e-9);
    expect(fidele.complexite).toBeGreaterThanOrEqual(simple.complexite);
  });

  it("le reglage ne sort jamais de ses bornes", () => {
    for (const c of [-1, 0, 0.5, 1, 2]) {
      const s = quantifier(presque(), { tempo: TEMPO, compromis: c });
      expect(s.length, String(c)).toBeGreaterThan(0);
      expect(Number.isFinite(s[0].cout)).toBe(true);
    }
  });
});

describe("les solutions de rechange", () => {
  it("SONT CLASSEES, ET DIFFERENTES les unes des autres", () => {
    const notes = jouer(lireArbre("(4/4 (1 (1 (1 1 1)) 1 1))"));
    const s = quantifier(notes, { tempo: TEMPO, combien: 3 });
    expect(s.length).toBeGreaterThan(1);
    for (let i = 1; i < s.length; i++) expect(s[i].cout).toBeGreaterThanOrEqual(s[i - 1].cout);
    expect(new Set(s.map((x) => ecrireArbre(x.mesures))).size).toBe(s.length);
  });

  it("on n'en rend jamais plus qu'on n'en demande", () => {
    const notes = jouer(lireArbre("(4/4 (1 1 1 1))"));
    expect(quantifier(notes, { tempo: TEMPO, combien: 1 })).toHaveLength(1);
  });
});

describe("silences et liaisons", () => {
  it("UNE FEUILLE MUETTE EST UN SILENCE quand rien ne sonne", () => {
    // Deux croches aux temps un et trois. Leur valeur tombe sur la grille que la profondeur par
    // defaut atteint, donc l'ecriture juste est a portee : croche et soupir, puis un temps vide.
    const notes: Note[] = [
      { note: 60, velocite: 90, debut: 0, fin: 0.25 },
      { note: 62, velocite: 90, debut: 1, fin: 1.25 },
    ];
    const s = quantifier(notes, { tempo: TEMPO, compromis: 0.9 });
    expect(ecrireArbre(s[0].mesures)).toBe("(4/4 ((1 (1 -1)) -1 (1 (1 -1)) -1))");
  });

  it("LA FIN D'UNE NOTE S'ECRIT, elle n'est pas absorbee par la note", () => {
    // UNE NOIRE PUIS TROIS TEMPS VIDES. Rien dans le calcul ne disait qu'une note s'arrete, les
    // attaques seules etant pesees : la mesure sortait en une ronde.
    const s = quantifier([{ note: 60, velocite: 90, debut: 0, fin: 0.5 }], { tempo: TEMPO, compromis: 0.9 });
    expect(ecrireArbre(s[0].mesures)).toBe("(4/4 (1 -1 -1 -1))");
  });

  const quatreNoires = (part: number): Note[] =>
    [0, 0.5, 1, 1.5].map((d) => ({ note: 60, velocite: 90, debut: d, fin: d + part }));

  it("UN DETACHE N'EST PAS UN SILENCE : quatre noires aux quatre cinquiemes restent quatre noires", () => {
    const s = quantifier(quatreNoires(0.4), { tempo: TEMPO, compromis: 0.9 });
    expect(ecrireArbre(s[0].mesures)).toBe("(4/4 (1 1 1 1))");
    expect(s[0].distance).toBeCloseTo(0, 9);
  });

  it("UN STACCATO EN EST UN : a la moitie de la valeur, le soupir s'ecrit", () => {
    const s = quantifier(quatreNoires(0.25), { tempo: TEMPO, compromis: 0.9 });
    expect(ecrireArbre(s[0].mesures)).toBe("(4/4 ((1 (1 -1 1 -1)) (1 (1 -1 1 -1))))");
  });

  it("A SEUIL PLEIN, aucun vide ne devient un silence", () => {
    const s = quantifier(quatreNoires(0.25), { tempo: TEMPO, compromis: 0.9, seuilSilence: 1 });
    expect(ecrireArbre(s[0].mesures)).toBe("(4/4 (1 1 1 1))");
  });

  it("UNE FEUILLE MUETTE EST UNE LIAISON quand la note precedente sonne encore", () => {
    // Une note de trois temps puis une d'un temps : les temps deux et trois ne sont pas des
    // silences, ils sont tenus. L'arbre ne sachant que des divisions egales, un trois-temps ne
    // s'ecrit que par des liaisons.
    const notes: Note[] = [
      { note: 60, velocite: 90, debut: 0, fin: 1.5 },
      { note: 62, velocite: 90, debut: 1.5, fin: 2 },
    ];
    const s = quantifier(notes, { tempo: TEMPO, compromis: 0.9 });
    const ecrit = ecrireArbre(s[0].mesures);
    expect(ecrit).toBe("(4/4 (1 1.0 1.0 1))");
  });

  it("UNE NOTE QUI TIENT TOUTE LA MESURE S'ECRIT EN UN SEUL MORCEAU", () => {
    // Sans le decoupage en une seule part, elle sortait en deux blanches liees.
    const s = quantifier([{ note: 60, velocite: 90, debut: 0, fin: 2 }], { tempo: TEMPO, compromis: 0.9 });
    expect(ecrireArbre(s[0].mesures)).toBe("(4/4 (1))");
  });
});

describe("ce qui ne doit pas casser", () => {
  it("une entree vide rend une liste vide", () => {
    expect(quantifier([], { tempo: TEMPO })).toEqual([]);
  });

  it("une seule note tient dans une mesure", () => {
    const s = quantifier([{ note: 60, velocite: 90, debut: 0, fin: 2 }], { tempo: TEMPO });
    expect(s[0].mesures).toHaveLength(1);
  });

  it("plusieurs mesures sont decoupees", () => {
    const notes = jouer(lireArbre("((4/4 (1 1 1 1)) (4/4 (1 1 1 1)))"));
    const s = quantifier(notes, { tempo: TEMPO });
    expect(s[0].mesures).toHaveLength(2);
  });

  it("les poids sont exposes, et une division rare coute plus qu'une binaire", () => {
    expect(POIDS_DEFAUT.division[2]).toBeLessThan(POIDS_DEFAUT.division[3]);
    expect(POIDS_DEFAUT.division[3]).toBeLessThan(POIDS_DEFAUT.division[5]);
    expect(POIDS_DEFAUT.division[5]).toBeLessThan(POIDS_DEFAUT.division[7]);
  });
});
