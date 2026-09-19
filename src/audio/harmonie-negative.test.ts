// audio/harmonie-negative.test.ts — Les deux résultats que tout le monde cite.
//
// La littérature sur l'harmonie négative donne toujours les mêmes exemples, en do : do
// majeur devient do mineur, et sol septième devient fa mineur sixte. Ces deux-là sont
// vérifiables ailleurs qu'ici, et ce sont eux qu'on teste d'abord. Le reste tient aux
// propriétés de toute réflexion : appliquée deux fois elle ne fait rien, et elle conserve
// la somme des hauteurs.
import { describe, expect, it } from "vitest";
import {
  axeAbsolu, notesDeLAxe, refleterAutourDe, refleterClasse, refleterDansOctave,
  refleterNotes, tableReflets,
} from "./harmonie-negative";

const suite = (hauteurs: number[]) =>
  hauteurs.map((note, i) => ({ note, velocite: 90, debut: i * 0.5, fin: i * 0.5 + 0.4 }));

const plaque = (hauteurs: number[]) =>
  hauteurs.map((note) => ({ note, velocite: 90, debut: 0, fin: 1 }));

const classes = (notes: { note: number }[]) =>
  [...new Set(notes.map((n) => ((n.note % 12) + 12) % 12))].sort((a, b) => a - b);

describe("l'axe", () => {
  it("tombe entre la tierce mineure et la tierce majeure", () => {
    expect(notesDeLAxe(0)).toEqual([3, 4]);   // en do : mi bémol et mi
    expect(notesDeLAxe(7)).toEqual([10, 11]); // en sol : si bémol et si
  });

  it("échange la tonique et la dominante", () => {
    expect(refleterClasse(0, 0)).toBe(7);
    expect(refleterClasse(7, 0)).toBe(0);
    expect(refleterClasse(9, 9)).toBe(4); // en la : la ↔ mi
  });

  it("échange les deux notes qui l'encadrent", () => {
    expect(refleterClasse(3, 0)).toBe(4);
    expect(refleterClasse(4, 0)).toBe(3);
  });

  it("ne fait rien quand on l'applique deux fois", () => {
    for (let tonique = 0; tonique < 12; tonique++) {
      for (let x = 0; x < 12; x++) {
        expect(refleterClasse(refleterClasse(x, tonique), tonique), `${tonique}/${x}`).toBe(x);
      }
    }
  });

  it("n'a aucun point fixe : six paires, toujours", () => {
    for (let tonique = 0; tonique < 12; tonique++) {
      expect(tableReflets(tonique).split(" · ").length, `tonique ${tonique}`).toBe(6);
      for (let x = 0; x < 12; x++) expect(refleterClasse(x, tonique)).not.toBe(x);
    }
  });
});

describe("les substitutions citées", () => {
  it("change do majeur en do mineur", () => {
    const reflete = refleterNotes(plaque([60, 64, 67]), 0, "miroir");
    expect(reflete.map((n) => n.note).sort((a, b) => a - b)).toEqual([60, 63, 67]);
  });

  it("change sol septième en fa mineur sixte", () => {
    // Sol-si-ré-fa devient ré-fa-la♭-do : fa, la♭, do, ré.
    const reflete = refleterNotes(plaque([55, 59, 62, 65]), 0, "miroir");
    expect(classes(reflete)).toEqual([0, 2, 5, 8]);
  });

  it("change do mineur en do majeur : la substitution marche dans les deux sens", () => {
    const aller = refleterNotes(plaque([60, 63, 67]), 0, "miroir");
    expect(classes(aller)).toEqual([0, 4, 7]);
  });

  it("laisse la cadence sur la tonique : sol et do s'échangent", () => {
    expect(refleterClasse(7, 0)).toBe(0);
  });
});

describe("miroir vrai", () => {
  it("conserve la somme de chaque note et de son reflet", () => {
    const notes = suite([60, 62, 64, 67, 72]);
    const axe = axeAbsolu(notes.map((n) => n.note), 0);
    const reflete = refleterNotes(notes, 0, "miroir");
    notes.forEach((n, i) => expect(n.note + reflete[i].note).toBeCloseTo(2 * axe, 6));
  });

  it("retourne le contour : ce qui montait descend", () => {
    const reflete = refleterNotes(suite([60, 62, 64, 65, 67]), 0, "miroir");
    const hauteurs = reflete.map((n) => n.note);
    for (let i = 1; i < hauteurs.length; i++) expect(hauteurs[i]).toBeLessThan(hauteurs[i - 1]);
  });

  it("place l'axe au milieu du morceau plutôt qu'au hasard", () => {
    // Un morceau aigu ne doit pas ressortir dans les graves.
    const aigu = suite([84, 86, 88, 91]);
    const reflete = refleterNotes(aigu, 0, "miroir");
    const moyenne = reflete.reduce((s, n) => s + n.note, 0) / reflete.length;
    expect(moyenne).toBeGreaterThan(72);
    expect(moyenne).toBeLessThan(96);
  });

  it("garde les départs, les durées et les vélocités", () => {
    const notes = suite([60, 64, 67]);
    const reflete = refleterNotes(notes, 0, "miroir");
    notes.forEach((n, i) => {
      expect(reflete[i].debut).toBe(n.debut);
      expect(reflete[i].fin).toBe(n.fin);
      expect(reflete[i].velocite).toBe(n.velocite);
    });
  });
});

describe("classes réfléchies dans le registre", () => {
  it("garde chaque note dans son octave", () => {
    for (const note of [48, 55, 60, 64, 71, 84]) {
      const reflete = refleterDansOctave(note, 0);
      expect(Math.floor(reflete / 12), `note ${note}`).toBe(Math.floor(note / 12));
    }
  });

  it("donne les mêmes classes que le miroir vrai", () => {
    const notes = plaque([60, 64, 67]);
    expect(classes(refleterNotes(notes, 0, "registre")))
      .toEqual(classes(refleterNotes(notes, 0, "miroir")));
  });

  it("ne retourne pas le contour d'une gamme entière", () => {
    // La réflexion par classes garde le registre : une gamme montante reste globalement
    // montante, là où le miroir vrai la renverse.
    const reflete = refleterNotes(suite([60, 62, 64, 65, 67, 69, 71, 72]), 0, "registre");
    const premier = reflete[0].note, dernier = reflete[reflete.length - 1].note;
    expect(dernier).toBeGreaterThan(premier);
  });
});

describe("bornes du clavier", () => {
  it("ne sort jamais du MIDI, même sur les extrêmes", () => {
    for (const mode of ["miroir", "registre"] as const) {
      for (const tonique of [0, 5, 11]) {
        const reflete = refleterNotes(suite([0, 6, 21, 108, 126, 127]), tonique, mode);
        for (const n of reflete) {
          expect(n.note, `${mode}/${tonique}`).toBeGreaterThanOrEqual(12);
          expect(n.note).toBeLessThanOrEqual(115);
        }
      }
    }
  });

  it("ne rend rien d'un morceau vide, sans planter sur l'axe", () => {
    expect(refleterNotes([], 0, "miroir")).toEqual([]);
    expect(axeAbsolu([], 0)).toBeCloseTo(63.5, 6);
  });

  it("réfléchit autour d'un axe fractionnaire sans perdre le demi-ton", () => {
    expect(refleterAutourDe(60, 63.5)).toBe(67);
    expect(refleterAutourDe(67, 63.5)).toBe(60);
  });
});
