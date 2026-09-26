// audio/voix.test.ts — Un arbre porté par une séquence est-il encore le sien ?
//
// CE QUE CE FICHIER GARDE. Une séquence qui porte son écriture rend une erreur possible que le
// port de texte rendait seulement probable : graver un rythme qui n'est plus celui des notes. Le
// remède est la concordance, et il ne vaut que s'il attrape les cas où elle est rompue. Ce sont
// eux que ce fichier éprouve, plus encore que le cas juste.
import { describe, expect, it } from "vitest";

import { derouler, lireArbre } from "./arbre-rythmique";
import type { Note } from "./note";
import type { Sequence } from "./sequence";
import { arbreDe, concorde, instantsDAttaque, poserArbre } from "./voix";

const TEMPO = 120;

/** Les notes que cet arbre produit, comme le nœud les produirait. */
function jouer(texte: string, hauteurs = [60, 62, 64, 65, 67, 69, 71]): Note[] {
  return derouler(lireArbre(texte), TEMPO)
    .filter((e) => !e.silence)
    .map((e, i) => ({
      note: hauteurs[i % hauteurs.length], velocite: 90,
      debut: e.debut, fin: e.debut + e.duree,
    }));
}

const sequenceDe = (texte: string): Sequence => ({ notes: jouer(texte), tempo: TEMPO });

describe("les instants d'attaque", () => {
  it("UN ACCORD N'EN COMPTE QU'UN : trois notes ensemble sont une feuille", () => {
    const notes: Note[] = [0, 0, 0, 1].map((d, i) => ({ note: 60 + i, velocite: 90, debut: d, fin: d + 1 }));
    expect(instantsDAttaque(notes)).toEqual([0, 1]);
  });

  it("ils sont rendus dans l'ordre, quel que soit celui des notes", () => {
    const notes: Note[] = [2, 0, 1].map((d) => ({ note: 60, velocite: 90, debut: d, fin: d + 0.5 }));
    expect(instantsDAttaque(notes)).toEqual([0, 1, 2]);
  });
});

describe("la concordance", () => {
  const CAS = [
    "(4/4 (1 1 1 1))",
    "(4/4 (1 (1 (1 1 1)) 1 1))",
    "(4/4 ((4 (1 1 1 1 1))))",
    "(4/4 (1 -1 1 -1))",
    "(4/4 (1 1.0 1 1))",
    "(3/4 (1 1 1))",
  ];

  for (const texte of CAS) {
    it(`« ${texte} » concorde avec les notes qu'il vient de produire`, () => {
      const c = concorde(texte, jouer(texte), TEMPO);
      expect(c.juste, `${texte} : ${c.raison}`).toBe(true);
      expect(c.prescrits).toBe(c.attaques);
    });
  }

  it("UNE ATTAQUE DÉPLACÉE ROMPT LA CONCORDANCE, et la raison le dit", () => {
    const notes = jouer("(4/4 (1 1 1 1))");
    notes[2] = { ...notes[2], debut: notes[2].debut + 0.03 };
    const c = concorde("(4/4 (1 1 1 1))", notes, TEMPO);
    expect(c.juste).toBe(false);
    expect(c.raison).toBe("une attaque a bougé");
  });

  it("UNE NOTE RETIRÉE LA ROMPT AUSSI", () => {
    const notes = jouer("(4/4 (1 1 1 1))").slice(0, 3);
    const c = concorde("(4/4 (1 1 1 1))", notes, TEMPO);
    expect(c.juste).toBe(false);
    expect(c.raison).toBe("le compte des attaques ne suit plus");
    expect(c.prescrits).toBe(4);
    expect(c.attaques).toBe(3);
  });

  it("UN AUTRE TEMPO LA ROMPT : les secondes de l'arbre en dépendent", () => {
    const texte = "(4/4 (1 1 1 1))";
    expect(concorde(texte, jouer(texte), TEMPO).juste).toBe(true);
    expect(concorde(texte, jouer(texte), TEMPO * 2).juste).toBe(false);
  });

  it("SANS TEMPO, rien n'est cru", () => {
    expect(concorde("(4/4 (1 1 1 1))", jouer("(4/4 (1 1 1 1))"), 0).raison).toBe("tempo inconnu");
  });

  it("un texte fautif est écarté avec son message, sans jeter", () => {
    const c = concorde("(4/4 (1 1", jouer("(4/4 (1 1 1 1))"), TEMPO);
    expect(c.juste).toBe(false);
    expect(c.raison.length).toBeGreaterThan(0);
  });

  it("UN ACCORD CONCORDE : trois notes sur une feuille ne comptent qu'une attaque", () => {
    const notes: Note[] = [];
    for (const [i, debut] of [0, 0.5, 1, 1.5].entries()) {
      for (const h of [60, 64, 67]) notes.push({ note: h + i, velocite: 90, debut, fin: debut + 0.5 });
    }
    expect(concorde("(4/4 (1 1 1 1))", notes, TEMPO).juste).toBe(true);
  });
});

describe("poser et relire une écriture", () => {
  it("UNE ÉCRITURE JUSTE EST POSÉE, et se relit", () => {
    const texte = "(4/4 (1 (1 (1 1 1)) 1 1))";
    const s = poserArbre(sequenceDe(texte), texte);
    expect(s.arbre).toBe(texte);
    expect(arbreDe(s)?.mesures).toHaveLength(1);
  });

  it("UNE ÉCRITURE QUI NE DÉCRIT PLUS LES NOTES N'EST PAS POSÉE", () => {
    // L'arbre d'avant une transformation qui a retiré une note : c'est l'erreur muette qu'on veut
    // rendre impossible, et elle doit échouer ici plutôt qu'à la gravure.
    const s: Sequence = { notes: jouer("(4/4 (1 1 1 1))").slice(0, 2), tempo: TEMPO };
    expect(poserArbre(s, "(4/4 (1 1 1 1))").arbre).toBeUndefined();
  });

  it("UNE SÉQUENCE DONT L'ARBRE A VIEILLI NE LE REND PLUS", () => {
    const texte = "(4/4 (1 1 1 1))";
    const s = poserArbre(sequenceDe(texte), texte);
    expect(arbreDe(s)).not.toBeNull();
    // Une transformation déplace une attaque sans toucher au champ : la relecture doit refuser.
    const apres: Sequence = { ...s, notes: s.notes.map((n, i) => (i === 1 ? { ...n, debut: n.debut + 0.1 } : n)) };
    expect(arbreDe(apres)).toBeNull();
  });

  it("une séquence sans arbre n'en invente pas", () => {
    expect(arbreDe(sequenceDe("(4/4 (1 1 1 1))"))).toBeNull();
    expect(poserArbre(sequenceDe("(4/4 (1 1 1 1))"), undefined).arbre).toBeUndefined();
    expect(poserArbre(sequenceDe("(4/4 (1 1 1 1))"), "   ").arbre).toBeUndefined();
  });

  it("POSER NE MODIFIE PAS LA SÉQUENCE REÇUE, il en rend une autre", () => {
    const texte = "(4/4 (1 1 1 1))";
    const avant = sequenceDe(texte);
    const apres = poserArbre(avant, texte);
    expect(avant.arbre).toBeUndefined();
    expect(apres.arbre).toBe(texte);
  });
});
