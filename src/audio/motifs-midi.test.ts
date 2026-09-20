// audio/motifs-midi.test.ts — Ce que quatre transformations doivent garder intact.
//
// Chacune de ces opérations ne touche qu'à UNE dimension : imposer un rythme change les
// départs sans toucher aux hauteurs, tourner change les hauteurs sans toucher aux départs,
// répéter remplit une grille sans la déplacer, éclaircir retire des événements entiers.
// Les tests ci-dessous vérifient d'abord cette invariance-là — c'est elle qui rend les
// nœuds composables — puis les cas où l'on préfère une note en moins à une note fausse.
import { describe, expect, it } from "vitest";
import {
  eclaircir,
  echoNotes,
  evenements,
  imposerRythme,
  palindrome,
  repeterEtTourner,
  retrograderMotif,
  type NoteMotif,
} from "./motifs-midi";

const ligne = (hauteurs: number[], pas = 0.5, duree = 0.4): NoteMotif[] =>
  hauteurs.map((note, i) => ({ note, velocite: 90, debut: i * pas, fin: i * pas + duree }));

const accord = (hauteurs: number[], debut: number, fin: number): NoteMotif[] =>
  hauteurs.map((note) => ({ note, velocite: 90, debut, fin }));

/** Générateur déterministe : un test qui tire au sort doit être rejouable. */
function hasardFixe(graine: number) {
  let x = graine >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

describe("découpage en événements", () => {
  it("fait un événement d'un accord et non trois", () => {
    const groupes = evenements([...accord([60, 64, 67], 0, 1), ...ligne([72], 0).map((n) => ({ ...n, debut: 1, fin: 2 }))]);
    expect(groupes.length).toBe(2);
    expect(groupes[0].map((n) => n.note)).toEqual([60, 64, 67]);
  });

  it("tolère un plaqué joué à la main", () => {
    const presque: NoteMotif[] = [
      { note: 60, velocite: 90, debut: 0, fin: 1 },
      { note: 64, velocite: 90, debut: 0.008, fin: 1 },
      { note: 67, velocite: 90, debut: 0.015, fin: 1 },
    ];
    expect(evenements(presque).length).toBe(1);
  });

  it("sépare ce qui est franchement décalé", () => {
    expect(evenements(ligne([60, 62], 0.25)).length).toBe(2);
  });
});

describe("imposer un rythme", () => {
  it("prend les hauteurs d'un côté, les départs de l'autre", () => {
    const hauteurs = ligne([60, 64, 67]);
    const grille = ligne([36, 36, 36, 36], 0.25, 0.1);
    const sortie = imposerRythme(hauteurs, grille);
    expect(sortie.map((n) => n.note)).toEqual([60, 64, 67, 60]);
    expect(sortie.map((n) => n.debut)).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it("tourne en boucle sur les hauteurs, jamais sur la grille", () => {
    // Deux hauteurs, cinq frappes : la grille commande, et elle ne se répète pas.
    const sortie = imposerRythme(ligne([60, 67]), ligne(Array(5).fill(36), 0.25, 0.1));
    expect(sortie.map((n) => n.note)).toEqual([60, 67, 60, 67, 60]);
  });

  it("garde l'accentuation de la grille, pas celle des hauteurs", () => {
    const hauteurs = ligne([60]).map((n) => ({ ...n, velocite: 20 }));
    const grille = ligne([36, 36], 0.5, 0.1).map((n, i) => ({ ...n, velocite: i === 0 ? 120 : 50 }));
    expect(imposerRythme(hauteurs, grille).map((n) => n.velocite)).toEqual([120, 50]);
  });

  it("plaque un accord entier sur une frappe", () => {
    const sortie = imposerRythme(accord([60, 64, 67], 0, 1), ligne([36, 36], 0.25, 0.1));
    expect(sortie.length).toBe(6);
    expect(sortie.filter((n) => n.debut === 0).map((n) => n.note)).toEqual([60, 64, 67]);
  });

  it("prend la durée de la grille : c'est elle qui fait le rythme", () => {
    const sortie = imposerRythme(ligne([60], 0.5, 2), ligne([36], 0, 0.05));
    expect(sortie[0].fin).toBe(0.05);
  });

  it("ne rend rien s'il manque l'un des deux côtés", () => {
    expect(imposerRythme([], ligne([36]))).toEqual([]);
    expect(imposerRythme(ligne([60]), [])).toEqual([]);
  });
});

describe("écho de notes", () => {
  const une = [{ note: 60, velocite: 100, debut: 0, fin: 0.4 }];

  it("ajoute des copies décalées sans toucher à l'original", () => {
    const sortie = echoNotes(une, { repetitions: 3, decalage: 0.25, attenuation: 0.6, transposition: 0 });
    expect(sortie.length).toBe(4);
    expect(sortie[0]).toEqual(une[0]);
    expect(sortie.map((n) => +n.debut.toFixed(3))).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it("fait décroître la vélocité de façon multiplicative", () => {
    const sortie = echoNotes(une, { repetitions: 3, decalage: 0.25, attenuation: 0.6, transposition: 0 });
    // 100 → 60 → 36 → 21,6 arrondi à 22.
    expect(sortie.map((n) => n.velocite)).toEqual([100, 60, 36, 22]);
  });

  it("s'arrête quand l'écho deviendrait inaudible plutôt que d'écrire une note muette", () => {
    const sortie = echoNotes(une, { repetitions: 8, decalage: 0.1, attenuation: 0.1, transposition: 0 });
    // 100 → 10 → 1 → 0,1 qui s'arrondirait à 0 : on s'arrête là.
    expect(sortie.map((n) => n.velocite)).toEqual([100, 10, 1]);
  });

  it("transpose chaque écho en cumulant", () => {
    const sortie = echoNotes(une, { repetitions: 3, decalage: 0.25, attenuation: 0.9, transposition: 7 });
    expect(sortie.map((n) => n.note)).toEqual([60, 67, 74, 81]);
  });

  it("s'arrête au bord du clavier au lieu de rendre des notes hors MIDI", () => {
    const haut = [{ note: 120, velocite: 100, debut: 0, fin: 0.4 }];
    const sortie = echoNotes(haut, { repetitions: 4, decalage: 0.2, attenuation: 0.9, transposition: 12 });
    expect(sortie.every((n) => n.note <= 127)).toBe(true);
    expect(sortie.map((n) => n.note)).toEqual([120]);
  });

  it("rend le motif inchangé quand on ne demande aucun écho", () => {
    expect(echoNotes(ligne([60, 62]), { repetitions: 0, decalage: 0.25, attenuation: 0.6, transposition: 0 }))
      .toEqual(ligne([60, 62]));
  });

  it("échoue chaque note d'un accord, donc l'accord entier", () => {
    const sortie = echoNotes(accord([60, 64, 67], 0, 0.5), {
      repetitions: 1, decalage: 0.5, attenuation: 0.7, transposition: 0,
    });
    expect(sortie.length).toBe(6);
    expect(sortie.filter((n) => n.debut === 0.5).map((n) => n.note)).toEqual([60, 64, 67]);
  });
});

describe("éclaircir", () => {
  const dense = ligne([60, 62, 64, 65, 67, 69, 71, 72], 0.125);

  it("ne retire rien à zéro pour cent", () => {
    expect(eclaircir(dense, 0, hasardFixe(1))).toEqual(dense);
  });

  it("retire tout à cent pour cent", () => {
    expect(eclaircir(dense, 1, hasardFixe(1))).toEqual([]);
  });

  it("retire une part plausible et garde le reste intact", () => {
    const reste = eclaircir(dense, 0.5, hasardFixe(7));
    expect(reste.length).toBeGreaterThan(0);
    expect(reste.length).toBeLessThan(dense.length);
    // Ce qui reste n'a pas bougé : éclaircir retire, il ne déplace pas.
    for (const n of reste) expect(dense).toContainEqual(n);
  });

  it("rejoue le même éclaircissement à graine égale", () => {
    expect(eclaircir(dense, 0.4, hasardFixe(11))).toEqual(eclaircir(dense, 0.4, hasardFixe(11)));
    expect(eclaircir(dense, 0.4, hasardFixe(11))).not.toEqual(eclaircir(dense, 0.4, hasardFixe(12)));
  });

  it("ne défait pas les accords : un événement part entier ou reste entier", () => {
    const suite = [
      ...accord([60, 64, 67], 0, 0.5),
      ...accord([62, 65, 69], 0.5, 1),
      ...accord([64, 67, 71], 1, 1.5),
    ];
    for (let graine = 1; graine <= 20; graine++) {
      const reste = eclaircir(suite, 0.5, hasardFixe(graine));
      expect(reste.length % 3, `graine ${graine}`).toBe(0);
    }
  });

  it("garde les temps forts quand on le lui demande", () => {
    const reste = eclaircir(dense, 1, hasardFixe(3), { preserverPremierTemps: true, dureeTemps: 0.5 });
    // Tout est retiré sauf ce qui tombe sur un demi-temps : 0 et 0,5.
    expect(reste.map((n) => n.debut)).toEqual([0, 0.5]);
  });

  it("ne rend rien d'un motif vide", () => {
    expect(eclaircir([], 0.5, hasardFixe(1))).toEqual([]);
  });
});

describe("rétrograde", () => {
  it("renverse l'ordre des notes sans toucher à leurs durées", () => {
    // Trois notes de durées différentes : 0,4 s, 0,2 s puis 0,6 s.
    const motif: NoteMotif[] = [
      { note: 60, velocite: 90, debut: 0, fin: 0.4 },
      { note: 62, velocite: 90, debut: 0.5, fin: 0.7 },
      { note: 64, velocite: 90, debut: 1, fin: 1.6 },
    ];
    const r = retrograderMotif(motif);
    expect(r.map((n) => n.note)).toEqual([64, 62, 60]);
    expect(r.map((n) => +(n.fin - n.debut).toFixed(3))).toEqual([0.6, 0.2, 0.4]);
    // La longue tenue finale ouvre maintenant la figure.
    expect(r[0].debut).toBe(0);
    expect(r[0].fin).toBeCloseTo(0.6, 6);
  });

  it("garde l'étendue du motif : le rétrograde ne le déplace pas", () => {
    const motif = ligne([60, 62, 64], 0.5, 0.3);
    const r = retrograderMotif(motif);
    expect(Math.min(...r.map((n) => n.debut))).toBeCloseTo(0, 6);
    expect(Math.max(...r.map((n) => n.fin))).toBeCloseTo(1.3, 6);
  });

  it("rend le motif d'origine quand on l'applique deux fois", () => {
    const motif = ligne([60, 62, 64, 65], 0.5, 0.35);
    const aller = retrograderMotif(retrograderMotif(motif));
    aller.forEach((n, i) => {
      expect(n.note).toBe(motif[i].note);
      expect(n.debut).toBeCloseTo(motif[i].debut, 6);
      expect(n.fin).toBeCloseTo(motif[i].fin, 6);
    });
  });

  it("garde les accords plaqués, et dans le bon ordre", () => {
    const suite = [...accord([60, 64, 67], 0, 0.5), ...accord([65, 69, 72], 0.5, 1)];
    const r = retrograderMotif(suite);
    expect(evenements(r).map((g) => g.map((n) => n.note)))
      .toEqual([[65, 69, 72], [60, 64, 67]]);
  });

  it("ne rend rien d'un motif vide", () => {
    expect(retrograderMotif([])).toEqual([]);
  });
});

describe("aller-retour", () => {
  const notes = (sortie: NoteMotif[]) => evenements(sortie).map((g) => g[0].note);

  it("écrit un vrai palindrome, sans rejouer la charnière", () => {
    expect(notes(palindrome(ligne([60, 62, 64]), "aller-retour", false)))
      .toEqual([60, 62, 64, 62, 60]);
  });

  it("rejoue la charnière quand on le demande", () => {
    expect(notes(palindrome(ligne([60, 62, 64]), "aller-retour", true)))
      .toEqual([60, 62, 64, 64, 62, 60]);
  });

  it("se lit pareil dans les deux sens — c'est la définition", () => {
    for (const pivot of [false, true]) {
      const suite = notes(palindrome(ligne([60, 64, 67, 72]), "aller-retour", pivot));
      expect(suite, `pivot ${pivot}`).toEqual([...suite].reverse());
    }
  });

  it("commence par le rétrograde en retour-aller", () => {
    expect(notes(palindrome(ligne([60, 62, 64]), "retour-aller", false)))
      .toEqual([64, 62, 60, 62, 64]);
  });

  it("ne laisse ni trou ni chevauchement à la charnière", () => {
    const sortie = palindrome(ligne([60, 62, 64], 0.5, 0.5), "aller-retour", false);
    const departs = evenements(sortie).map((g) => g[0].debut);
    expect(departs.map((d) => +d.toFixed(3))).toEqual([0, 0.5, 1, 1.5, 2]);
  });

  it("rend le seul rétrograde quand on ne demande pas l'aller-retour", () => {
    const r = palindrome(ligne([60, 62, 64]), "retrograde", false);
    expect(notes(r)).toEqual([64, 62, 60]);
  });

  it("garde les accords entiers de part et d'autre", () => {
    const suite = [...accord([60, 64, 67], 0, 0.5), ...accord([65, 69, 72], 0.5, 1)];
    const sortie = palindrome(suite, "aller-retour", false);
    expect(evenements(sortie).map((g) => g.length)).toEqual([3, 3, 3]);
  });

  it("rend une note seule telle quelle : elle est son propre palindrome", () => {
    const une = ligne([60]);
    expect(palindrome(une, "aller-retour", false).map((n) => n.note)).toEqual([60]);
  });

  it("ne rend rien d'un motif vide", () => {
    expect(palindrome([], "aller-retour", false)).toEqual([]);
    expect(palindrome([], "retrograde", true)).toEqual([]);
  });
});

describe("répéter et tourner", () => {
  it("subdivise la durée sans déplacer la grille", () => {
    const sortie = repeterEtTourner(ligne([60, 62], 0.5, 0.4), 2, 0);
    expect(sortie.length).toBe(4);
    expect(sortie.map((n) => +n.debut.toFixed(3))).toEqual([0, 0.2, 0.5, 0.7]);
    // Le premier départ de chaque événement d'origine est resté en place.
    expect(sortie[0].debut).toBe(0);
    expect(sortie[2].debut).toBe(0.5);
  });

  it("répète la hauteur, pas autre chose", () => {
    expect(repeterEtTourner(ligne([60, 67]), 3, 0).map((n) => n.note))
      .toEqual([60, 60, 60, 67, 67, 67]);
  });

  it("laisse le motif intact quand on ne répète ni ne tourne", () => {
    const entree = ligne([60, 62, 64]);
    const sortie = repeterEtTourner(entree, 1, 0);
    expect(sortie.map((n) => n.note)).toEqual([60, 62, 64]);
    expect(sortie.map((n) => n.debut)).toEqual([0, 0.5, 1]);
  });

  it("décale les hauteurs sur la grille, sans toucher aux départs", () => {
    const entree = ligne([60, 62, 64]);
    const sortie = repeterEtTourner(entree, 1, 1);
    expect(sortie.map((n) => n.note)).toEqual([62, 64, 60]);
    expect(sortie.map((n) => n.debut)).toEqual([0, 0.5, 1]);
  });

  it("tourne dans les deux sens et boucle sur la longueur", () => {
    const entree = ligne([60, 62, 64]);
    expect(repeterEtTourner(entree, 1, -1).map((n) => n.note)).toEqual([64, 60, 62]);
    expect(repeterEtTourner(entree, 1, 3).map((n) => n.note)).toEqual([60, 62, 64]);
    expect(repeterEtTourner(entree, 1, 4).map((n) => n.note)).toEqual([62, 64, 60]);
  });

  it("tourne un motif déjà densifié, pas le motif d'origine", () => {
    // Deux notes répétées deux fois font quatre pas ; tourner d'un pas décale d'un demi-pas.
    const sortie = repeterEtTourner(ligne([60, 67], 0.5, 0.4), 2, 1);
    expect(sortie.map((n) => n.note)).toEqual([60, 67, 67, 60]);
  });

  it("garde les accords entiers en les répétant", () => {
    const sortie = repeterEtTourner(accord([60, 64, 67], 0, 0.4), 2, 0);
    expect(sortie.length).toBe(6);
    expect(sortie.filter((n) => n.debut === 0).map((n) => n.note)).toEqual([60, 64, 67]);
  });

  it("ne rend rien d'un motif vide", () => {
    expect(repeterEtTourner([], 4, 2)).toEqual([]);
  });
});
