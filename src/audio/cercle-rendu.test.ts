// audio/cercle-rendu.test.ts — Le cercle devient-il les notes qu'on attend, aux instants qu'on attend ?
//
// CE QUI SE VÉRIFIE ICI EST LE PASSAGE DU COMBINATOIRE AU DATÉ, et c'est le seul endroit du chantier
// où une seconde apparaît. Deux choses s'y jouent qu'aucun test de géométrie ne pouvait dire : que
// les instants tombent juste, et que les deux bases de temps donnent bien deux musiques différentes.
//
// LA DIFFÉRENCE ENTRE LES DEUX BASES NE S'ENTEND PAS SUR UN CERCLE SEUL, elle ne se voit qu'à
// plusieurs. C'est pourquoi les contrôles qui comptent portent sur seize contre douze : à cycle
// partagé ils se retrouvent à chaque tour, à pulsation partagée ils se décalent.
import { describe, expect, it } from "vitest";

import type { Cercle } from "./cercle";
import { dureeDUnePlace, rendreCercles } from "./cercle-rendu";

const perc = (positions: number, places: number[], valeur = 38): Cercle => ({
  positions, sorte: "percussion", sommets: places.map((position) => ({ position, valeur })),
});
const melo = (positions: number, paires: [number, number][]): Cercle => ({
  positions, sorte: "hauteur", sommets: paires.map(([position, valeur]) => ({ position, valeur })),
});

describe("un cercle seul", () => {
  it("POSE SES ATTAQUES AUX INSTANTS JUSTES : quatre places à soixante tours la minute", () => {
    // Un tour dure une seconde ; quatre places, donc une place par quart de seconde.
    const s = rendreCercles([perc(4, [0, 1, 2, 3])], { tempo: 60, tours: 1 });
    expect(s.notes.map((n) => +n.debut.toFixed(6))).toEqual([0, 0.25, 0.5, 0.75]);
    expect(s.duree).toBeCloseTo(1, 9);
  });

  it("UNE ATTAQUE DURE UNE PLACE, et ne tient pas jusqu'à la suivante", () => {
    const s = rendreCercles([perc(4, [0, 2])], { tempo: 60, tours: 1 });
    expect(s.notes.map((n) => +(n.fin - n.debut).toFixed(6))).toEqual([0.25, 0.25]);
  });

  it("le nombre de tours multiplie les attaques et la durée", () => {
    const s = rendreCercles([perc(8, [0, 3, 6])], { tempo: 60, tours: 4 });
    expect(s.notes).toHaveLength(12);
    expect(s.duree).toBeCloseTo(4, 9);
  });

  it("une percussion part sur le canal de batterie, une hauteur n'en porte aucun", () => {
    expect(rendreCercles([perc(4, [0])]).notes[0].canal).toBe(9);
    expect(rendreCercles([melo(4, [[0, 60]])]).notes[0].canal).toBeUndefined();
  });

  it("la hauteur d'un sommet mélodique passe telle quelle, microton compris", () => {
    const s = rendreCercles([melo(4, [[0, 60.5], [2, 67.25]])], { tours: 1 });
    expect(s.notes.map((n) => n.note)).toEqual([60.5, 67.25]);
  });

  it("la nuance est celle du réglage, un cercle n'en portant pas", () => {
    expect(rendreCercles([perc(4, [0, 2])], { velocite: 77 }).notes.every((n) => n.velocite === 77)).toBe(true);
  });
});

describe("plusieurs cercles, à cycle partagé", () => {
  const seize = perc(16, [0, 8], 36);
  const douze = perc(12, [0, 6], 38);

  it("LES DEUX FONT UN TOUR DANS LE MÊME TEMPS, et se retrouvent à chaque tour", () => {
    const s = rendreCercles([seize, douze], { tempo: 60, base: "cycle", tours: 2 });
    expect(s.duree).toBeCloseTo(2, 9);
    // Chacun a deux attaques par tour, deux tours : quatre chacun, huit en tout.
    expect(s.notes).toHaveLength(8);
    // Et les deux se retrouvent au départ de chaque tour.
    const debuts = new Set(s.notes.map((n) => +n.debut.toFixed(6)));
    expect(debuts.has(0)).toBe(true);
    expect(debuts.has(1)).toBe(true);
  });

  it("MAIS LEURS PLACES N'ONT PAS LA MÊME DURÉE, le cercle le plus fin ayant les plus courtes", () => {
    const s = rendreCercles([seize, douze], { tempo: 60, base: "cycle", tours: 1 });
    const duree = (voix: number) => {
      const n = s.notes.find((x) => x.voix === voix)!;
      return n.fin - n.debut;
    };
    expect(duree(0)).toBeCloseTo(1 / 16, 9);
    expect(duree(1)).toBeCloseTo(1 / 12, 9);
  });
});

describe("plusieurs cercles, à pulsation partagée", () => {
  const seize = perc(16, [0], 36);
  const douze = perc(12, [0], 38);

  it("LA PLACE DURE PARTOUT LE MÊME TEMPS, et c'est le tour qui change", () => {
    const s = rendreCercles([seize, douze], { tempo: 60, base: "pulsation", tours: 1 });
    for (const n of s.notes) expect(+(n.fin - n.debut).toFixed(9)).toBeCloseTo(1 / 16, 9);
  });

  it("ILS SE DÉCALENT : le plus court revient avant l'autre, ce qui est le déphasage", () => {
    // Le plus grand cercle garde le tour nominal d'une seconde ; celui de douze places le boucle en
    // douze seizièmes, donc il repart avant, et ses attaques ne retombent plus sur celles du grand.
    const s = rendreCercles([seize, douze], { tempo: 60, base: "pulsation", tours: 1 });
    const ceuxDe12 = s.notes.filter((n) => n.voix === 1).map((n) => +n.debut.toFixed(6));
    expect(ceuxDe12).toEqual([0, +(12 / 16).toFixed(6)]);
    const ceuxDe16 = s.notes.filter((n) => n.voix === 0).map((n) => +n.debut.toFixed(6));
    expect(ceuxDe16).toEqual([0]);
  });

  it("LES DEUX BASES NE RENDENT PAS LA MÊME CHOSE, et c'est tout l'intérêt de l'option", () => {
    const a = rendreCercles([seize, douze], { tempo: 60, base: "cycle", tours: 2 });
    const b = rendreCercles([seize, douze], { tempo: 60, base: "pulsation", tours: 2 });
    expect(a.notes.map((n) => n.debut)).not.toEqual(b.notes.map((n) => n.debut));
  });
});

describe("ce qui est rendu autour des notes", () => {
  it("CHAQUE CERCLE DEVIENT UNE VOIX, nommée par sa taille", () => {
    const s = rendreCercles([perc(16, [0]), perc(12, [0])]);
    expect(s.voix!.map((v) => v.numero)).toEqual([0, 1]);
    expect(s.voix![1].nom).toContain("12");
    expect(new Set(s.notes.map((n) => n.voix))).toEqual(new Set([0, 1]));
  });

  it("la durée voulue tient le silence final, même quand rien ne sonne à la fin", () => {
    const s = rendreCercles([perc(8, [0])], { tempo: 60, tours: 1 });
    expect(s.duree).toBeCloseTo(1, 9);
    expect(Math.max(...s.notes.map((n) => n.fin))).toBeLessThan(s.duree!);
  });

  it("les notes sortent dans l'ordre du temps, tous cercles mêlés", () => {
    const s = rendreCercles([perc(4, [0, 2], 36), perc(4, [1, 3], 38)], { tempo: 60, tours: 1 });
    const debuts = s.notes.map((n) => n.debut);
    expect(debuts).toEqual([...debuts].sort((a, b) => a - b));
  });
});

describe("les cas où un rendu se casse sans le dire", () => {
  it("AUCUN CERCLE NE DONNE UNE SÉQUENCE VIDE, et non une erreur", () => {
    expect(rendreCercles([])).toEqual({ notes: [], duree: 0 });
    expect(rendreCercles([perc(8, [])])).toEqual({ notes: [], duree: 0 });
  });

  it("un tempo nul ne produit ni infini ni division par zéro", () => {
    const s = rendreCercles([perc(4, [0, 2])], { tempo: 0, tours: 1 });
    for (const n of s.notes) {
      expect(Number.isFinite(n.debut)).toBe(true);
      expect(Number.isFinite(n.fin)).toBe(true);
    }
  });

  it("zéro tour rend quand même un tour, plutôt qu'un silence inexplicable", () => {
    expect(rendreCercles([perc(4, [0])], { tours: 0 }).notes.length).toBeGreaterThan(0);
  });

  it("la durée d'une place ne dépend du plus grand cercle qu'à pulsation partagée", () => {
    expect(dureeDUnePlace(12, 16, { tempo: 60, base: "cycle", tours: 1, velocite: 100 })).toBeCloseTo(1 / 12, 9);
    expect(dureeDUnePlace(12, 16, { tempo: 60, base: "pulsation", tours: 1, velocite: 100 })).toBeCloseTo(1 / 16, 9);
  });
});

describe("une entrée qui porte une suite de cercles", () => {
  // Une boucle de variation rend quatre cercles sur une seule sortie. Ils ne sonnent pas ensemble :
  // ils se suivent, un par tour, sur la même voix.
  const a = perc(4, [0], 36), b = perc(4, [1], 36), c = perc(4, [2], 36);

  it("ELLE DEVIENT UNE VOIX QUI SE DÉROULE : un cercle par tour, dans l'ordre", () => {
    const s = rendreCercles([[a, b, c]], { tempo: 60, tours: 1 });
    expect(s.duree).toBeCloseTo(3, 9);
    expect(s.notes.map((n) => +n.debut.toFixed(6))).toEqual([0, 1.25, 2.5]);
    expect(new Set(s.notes.map((n) => n.voix))).toEqual(new Set([0]));
  });

  it("LES TOURS SE COMPTENT PAR VARIATION : deux tours rejouent la suite entière", () => {
    const s = rendreCercles([[a, b]], { tempo: 60, tours: 2 });
    expect(s.duree).toBeCloseTo(4, 9);
    expect(s.notes.map((n) => +n.debut.toFixed(6))).toEqual([0, 1.25, 2, 3.25]);
  });

  it("UN CERCLE SEUL REND EXACTEMENT CE QU'IL RENDAIT, suite ou pas", () => {
    const enSuite = rendreCercles([[a]], { tempo: 60, tours: 3 });
    const toutSeul = rendreCercles([a], { tempo: 60, tours: 3 });
    expect(enSuite.notes).toEqual(toutSeul.notes);
    expect(enSuite.duree).toBe(toutSeul.duree);
  });

  it("une suite plus courte se rejoue depuis son début contre une plus longue", () => {
    const s = rendreCercles([[a, b, c], [a]], { tempo: 60, tours: 1 });
    const voix1 = s.notes.filter((n) => n.voix === 1).map((n) => +n.debut.toFixed(6));
    expect(voix1).toEqual([0, 1, 2]);
  });

  it("la voix porte le nombre de variations dans son nom, et non une taille", () => {
    const s = rendreCercles([[a, b, c]], { tempo: 60, tours: 1 });
    expect(s.voix![0].nom).toContain("3");
    expect(s.voix![0].nom).toContain("variations");
  });
});
