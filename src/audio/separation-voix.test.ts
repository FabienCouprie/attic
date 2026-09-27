// audio/separation-voix.test.ts — Retrouve-t-on les lignes qu'on a mêlées ?
//
// L'ALLER-RETOUR EST LE CONTRÔLE, ET IL EST EXACT. Les métriques de la littérature sur ce problème
// supposent un corpus annoté voix par voix, que nous n'avons pas. Nous disposons mieux : la
// polyphonie se construit ici, donc on connaît la bonne réponse. Mêler deux lignes puis les séparer
// doit rendre à chaque note la voix dont elle vient, et l'écart se compte en notes mal rangées.
//
// CE QU'IL NE PROUVE PAS. Qu'une pièce réelle serait bien séparée. Deux lignes fabriquées se
// croisent moins, se taisent moins et respirent moins qu'une écriture de Bach ; les cas durs sont
// donc écrits à la main, croisement compris, et le test dit ce que le procédé en fait plutôt que de
// les éviter.
import { describe, expect, it } from "vitest";

import type { Note } from "./note";
import { alignerVoix, separerVoix } from "./separation-voix";

const n = (hauteur: number, debut: number, duree = 1): Note =>
  ({ note: hauteur, velocite: 90, debut, fin: debut + duree });

/** Deux lignes mêlées, et la voix d'où chaque note vient. */
function meler(lignes: Note[][]): { notes: Note[]; attendu: Map<Note, number> } {
  const attendu = new Map<Note, number>();
  const notes: Note[] = [];
  lignes.forEach((ligne, v) => {
    for (const note of ligne) { notes.push(note); attendu.set(note, v); }
  });
  notes.sort((a, b) => a.debut - b.debut || a.note - b.note);
  return { notes, attendu };
}

/** Combien de notes se retrouvent dans une autre voix que la leur, aux renumérotations près. */
function malRangees(res: { notes: Note[] }, notes: Note[], attendu: Map<Note, number>): number {
  // Les numéros rendus n'ont pas à être ceux d'origine ; c'est le REGROUPEMENT qui compte. On
  // apparie donc chaque voix rendue à la voix d'origine qu'elle recouvre le plus.
  const parRendue = new Map<number, number[]>();
  res.notes.forEach((sortie, i) => {
    const v = sortie.voix ?? 0;
    if (!parRendue.has(v)) parRendue.set(v, []);
    (parRendue.get(v) as number[]).push(attendu.get(notes[i]) as number);
  });
  let justes = 0;
  for (const [, origines] of parRendue) {
    const comptes = new Map<number, number>();
    for (const o of origines) comptes.set(o, (comptes.get(o) ?? 0) + 1);
    justes += Math.max(...comptes.values());
  }
  return notes.length - justes;
}

describe("l'alignement de deux tranches", () => {
  it("APPARIE AU PLUS PROCHE quand les deux ont le même nombre de voix", () => {
    expect(alignerVoix([60, 72], [62, 74], 12)).toEqual([0, 1]);
  });

  it("NE CROISE JAMAIS, même quand croiser serait plus court", () => {
    // Apparier 60 à 71 et 72 à 61 coûterait 22 ; l'ordre est tenu, donc 60 à 61 et 72 à 71.
    expect(alignerVoix([60, 72], [61, 71], 12)).toEqual([0, 1]);
  });

  it("UNE VOIX QUI COMMENCE N'EST RELIÉE À RIEN", () => {
    const lien = alignerVoix([60], [60, 72], 4);
    expect(lien[0]).toBe(0);
    expect(lien[1]).toBeNull();
  });

  it("UNE VOIX QUI S'ARRÊTE LAISSE L'AUTRE SE PROLONGER", () => {
    expect(alignerVoix([60, 72], [71], 4)).toEqual([1]);
  });

  it("LE FORFAIT ARBITRE : bas, la ligne se coupe ; haut, elle se prolonge", () => {
    // Un saut d'une octave : au forfait 2, couper coûte 4 et prolonger 12, donc on coupe.
    expect(alignerVoix([60], [72], 2)).toEqual([null]);
    expect(alignerVoix([60], [72], 12)).toEqual([0]);
  });

  it("deux listes vides ne cassent rien", () => {
    expect(alignerVoix([], [], 12)).toEqual([]);
    expect(alignerVoix([60], [], 12)).toEqual([]);
    expect(alignerVoix([], [60], 12)).toEqual([null]);
  });
});

describe("l'aller-retour sur des lignes connues", () => {
  it("DEUX LIGNES BIEN SÉPARÉES EN REGISTRE se retrouvent toutes les deux", () => {
    const dessus = [72, 74, 76, 77].map((h, i) => n(h, i));
    const basse = [48, 50, 52, 53].map((h, i) => n(h, i));
    const { notes, attendu } = meler([dessus, basse]);
    const res = separerVoix(notes);
    expect(res.voix).toBe(2);
    expect(malRangees(res, notes, attendu)).toBe(0);
  });

  it("TROIS LIGNES AUSSI", () => {
    const lignes = [[79, 81, 83, 84], [67, 69, 71, 72], [55, 57, 59, 60]]
      .map((suite) => suite.map((h, i) => n(h, i)));
    const { notes, attendu } = meler(lignes);
    const res = separerVoix(notes);
    expect(res.voix).toBe(3);
    expect(malRangees(res, notes, attendu)).toBe(0);
  });

  it("DES RYTHMES DIFFÉRENTS NE GÊNENT PAS : une blanche contre deux noires", () => {
    const lent = [60, 64].map((h, i) => n(h, i * 2, 2));
    const vif = [72, 74, 76, 77].map((h, i) => n(h, i, 1));
    const { notes, attendu } = meler([vif, lent]);
    const res = separerVoix(notes);
    expect(malRangees(res, notes, attendu)).toBe(0);
  });

  it("UN SILENCE DANS UNE VOIX NE LA COUPE PAS EN DEUX, le forfait l'en empêche", () => {
    // La voix grave se tait au troisième temps ; les deux morceaux doivent rester une seule voix.
    const dessus = [72, 74, 76, 77].map((h, i) => n(h, i));
    const basse = [n(48, 0), n(50, 1), n(53, 3)];
    const { notes, attendu } = meler([dessus, basse]);
    const res = separerVoix(notes);
    expect(res.voix).toBe(2);
    expect(malRangees(res, notes, attendu)).toBe(0);
  });

  it("UN ACCORD EST RÉPARTI SUR LES VOIX, une note par voix", () => {
    const notes = [n(60, 0), n(64, 0), n(67, 0), n(62, 1), n(65, 1), n(69, 1)];
    const res = separerVoix(notes);
    expect(res.voix).toBe(3);
    // Chaque instant donne une note à chacune des trois voix.
    for (const t of [0, 1]) {
      const a = res.notes.filter((x) => x.debut === t).map((x) => x.voix);
      expect([...a].sort()).toEqual([0, 1, 2]);
    }
  });
});

describe("ce dont il faut se méfier, et qui est dit", () => {
  it("UN CROISEMENT N'EST PAS RETROUVÉ, et l'information n'est pas dans les données", () => {
    // Deux lignes qui se traversent, l'une montant et l'autre descendant. Elles laissent EXACTEMENT
    // les mêmes hauteurs que deux lignes qui se touchent et rebroussent chemin : aucune mesure prise
    // sur les seules hauteurs ne saurait dire laquelle des deux a été jouée. Le procédé rend la
    // seconde lecture, donc la moitié des notes changent de ligne, et c'est mesuré ici plutôt que
    // découvert un jour à la lecture d'une partition.
    const montante = [60, 64, 68, 72].map((h, i) => n(h, i));
    const descendante = [72, 68, 64, 60].map((h, i) => n(h, i));
    const { notes, attendu } = meler([montante, descendante]);
    const res = separerVoix(notes);
    expect(res.voix).toBe(2);
    expect(malRangees(res, notes, attendu)).toBe(4);
    // Et rien ne le signale, parce qu'il n'y a rien à signaler : aucune voix n'est à l'unisson.
    expect(res.unissons).toBe(0);
  });

  it("UN UNISSON EST COMPTÉ, lui, parce que l'ordre n'y décide plus rien", () => {
    // Les deux voix se rejoignent sur le même do au troisième temps : elles peuvent en repartir
    // dans un sens comme dans l'autre, et le nombre rendu dit qu'il y a là de quoi relire.
    const dessus = [67, 65, 64, 65, 67].map((h, i) => n(h, i));
    const dessous = [60, 62, 64, 62, 60].map((h, i) => n(h, i));
    const { notes } = meler([dessus, dessous]);
    const res = separerVoix(notes);
    expect(res.unissons).toBe(1);
  });

  it("SANS UNISSON NI AMBIGUÏTÉ, l'indicateur reste muet", () => {
    const lignes = [[79, 81, 79, 77], [64, 65, 67, 65]].map((s) => s.map((h, i) => n(h, i)));
    const { notes } = meler(lignes);
    expect(separerVoix(notes).unissons).toBe(0);
  });

  it("LE NOMBRE DE VOIX SE BORNE quand on le demande", () => {
    const lignes = [[79, 81], [67, 69], [55, 57]].map((s) => s.map((h, i) => n(h, i)));
    const { notes } = meler(lignes);
    expect(separerVoix(notes, { voixMax: 2 }).voix).toBe(2);
  });

  it("LES VOIX SONT NUMÉROTÉES DU PLUS AIGU AU PLUS GRAVE, sans trou", () => {
    const lignes = [[55, 57], [79, 81], [67, 69]].map((s) => s.map((h, i) => n(h, i)));
    const { notes } = meler(lignes);
    const res = separerVoix(notes);
    expect([...new Set(res.notes.map((x) => x.voix))].sort()).toEqual([0, 1, 2]);
    const moyenne = (v: number) => {
      const s = res.notes.filter((x) => x.voix === v);
      return s.reduce((t, x) => t + x.note, 0) / s.length;
    };
    expect(moyenne(0)).toBeGreaterThan(moyenne(1));
    expect(moyenne(1)).toBeGreaterThan(moyenne(2));
  });
});

describe("ce qui ne doit pas casser", () => {
  it("aucune note rend une séparation vide", () => {
    expect(separerVoix([])).toEqual({ notes: [], voix: 0, contigs: 0, unissons: 0 });
  });

  it("UNE SEULE LIGNE RESTE UNE SEULE VOIX", () => {
    const res = separerVoix([60, 62, 64, 65].map((h, i) => n(h, i)));
    expect(res.voix).toBe(1);
    expect(res.notes.every((x) => x.voix === 0)).toBe(true);
  });

  it("une note seule ne casse rien", () => {
    const res = separerVoix([n(60, 0)]);
    expect(res.voix).toBe(1);
    expect(res.notes[0].voix).toBe(0);
  });

  it("LES NOTES RENDUES SONT LES MÊMES, dans le même ordre et sans rien perdre", () => {
    const lignes = [[72, 74, 76], [48, 50, 52]].map((s) => s.map((h, i) => n(h, i)));
    const { notes } = meler(lignes);
    const res = separerVoix(notes);
    expect(res.notes).toHaveLength(notes.length);
    res.notes.forEach((sortie, i) => {
      expect(sortie.note).toBe(notes[i].note);
      expect(sortie.debut).toBe(notes[i].debut);
      expect(sortie.fin).toBe(notes[i].fin);
    });
  });
});
