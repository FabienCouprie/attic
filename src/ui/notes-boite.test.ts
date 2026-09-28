// ui/notes-boite.test.ts — Les notes d'une boîte dans sa barre.
//
// CE QUE CES CAS ATTRAPENT. Le sens de l'axe des hauteurs, d'abord : une boîte dessinée à l'envers se
// lirait comme une mélodie qui descend là où elle monte, et rien dans le dessin ne le dirait. Puis le
// débordement : un rectangle qui sort de sa barre se poserait sur la boîte voisine, et l'on croirait
// une note là où il n'y en a pas. Enfin la note brève, qui vaut moins d'un pixel sur une boîte longue
// et disparaîtrait du dessin alors qu'elle sonne.
import { describe, expect, it } from "vitest";
import { rectsNotes, type NoteBoite } from "./notes-boite";

const n = (debut: number, duree: number, note: number): NoteBoite => ({ debut, duree, note });

describe("les rectangles des notes", () => {
  it("sont vides quand la barre n'a pas de place", () => {
    expect(rectsNotes([n(0, 1, 60)], 0, 0, 0, 20)).toEqual([]);
    expect(rectsNotes([n(0, 1, 60)], 0, 100, 0, 0)).toEqual([]);
  });

  it("sont vides quand la boite n'a pas de note", () => {
    expect(rectsNotes([], 0, 100, 0, 20)).toEqual([]);
  });

  it("posent une note pleine boite sur toute la largeur", () => {
    const [r] = rectsNotes([n(0, 1, 60)], 10, 100, 5, 20);
    expect(r.x).toBe(10);
    expect(r.w).toBe(100);
  });

  it("mettent la plus haute en haut et la plus basse en bas", () => {
    // LE CAS QUI COMPTE : une boîte dessinée à l'envers se lirait comme une mélodie inversée.
    const rs = rectsNotes([n(0, 0.3, 72), n(0.5, 0.3, 48)], 0, 100, 0, 30);
    expect(rs[0].y).toBeLessThan(rs[1].y);
    expect(rs[0].y).toBeCloseTo(0, 6);
    expect(rs[1].y + rs[1].h).toBeCloseTo(30, 6);
  });

  it("posent une boite d'une seule hauteur au milieu de sa barre", () => {
    const [r] = rectsNotes([n(0, 0.5, 60)], 0, 100, 10, 30);
    expect(r.h).toBeCloseTo(10, 6);
    expect(r.y).toBeCloseTo(20, 6);
  });

  it("gardent chaque rectangle dans la barre", () => {
    const notes = [n(0, 2, 60), n(0.99, 0.5, 64), n(1, 0.01, 55), n(-0.2, 0.1, 70)];
    for (const r of rectsNotes(notes, 20, 80, 0, 26)) {
      expect(r.x).toBeGreaterThanOrEqual(20);
      expect(r.x + r.w).toBeLessThanOrEqual(100.000001);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y + r.h).toBeLessThanOrEqual(26.000001);
    }
  });

  it("gardent une note breve visible", () => {
    // Un millième de boîte sur cent pixels vaut un dixième de pixel : sans plancher, rien ne paraît.
    const [r] = rectsNotes([n(0.5, 0.001, 60)], 0, 100, 0, 20);
    expect(r.w).toBe(1);
  });

  it("eclaircissent une boite trop dense, sans la vider", () => {
    // Mille notes sur une barre de quelques centaines de pixels : une sur trois suffit à en montrer
    // la densité, et les mille rectangles seraient retracés soixante fois par seconde.
    const notes = Array.from({ length: 1000 }, (_, i) => n(i / 1000, 0.0005, 48 + (i % 24)));
    const rs = rectsNotes(notes, 0, 300, 0, 26);
    expect(rs.length).toBeLessThanOrEqual(400);
    expect(rs.length).toBeGreaterThan(100);
  });

  it("suivent le contour de la boite", () => {
    // Une gamme montante : chaque note doit être plus haute dans la barre que la précédente.
    const notes = Array.from({ length: 8 }, (_, i) => n(i / 8, 1 / 8, 60 + i));
    const rs = rectsNotes(notes, 0, 160, 0, 32);
    for (let i = 1; i < rs.length; i++) expect(rs[i].y).toBeLessThan(rs[i - 1].y);
    expect(rs[0].x).toBeCloseTo(0, 6);
    expect(rs[7].x).toBeCloseTo(140, 6);
  });
});
