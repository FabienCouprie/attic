// audio/theorie-serielle.test.ts — Les vérifications qu'on faisait à la main.
//
// Une matrice dodécaphonique écrite à la main se contrôle par trois signes : la première
// ligne est la série, la diagonale ne change jamais, et chaque ligne comme chaque colonne
// contient les douze classes une fois. Ces tests reprennent ces contrôles-là, sur la série
// du Concerto de Berg, et tiennent ensuite les identités du contrepoint : rétrograder deux
// fois ne fait rien, inverser deux fois non plus.
import { describe, expect, it } from "vitest";
import {
  estSerieComplete, forme, inverser, lireSuite, matrice, matriceEnTexte, nomClasse,
  placerDansRegistre, retrograde, retrogradeInversion, transposer,
} from "./theorie-serielle";

/** Concerto pour violon de Berg : sol, si♭, ré, fa♯, la, do, mi, sol♯, si, do♯, ré♯, fa. */
const BERG = [7, 10, 2, 6, 9, 0, 4, 8, 11, 1, 3, 5];

describe("lecture d'une suite", () => {
  it("lit les noms de notes, les chiffres, et les deux mélangés", () => {
    expect(lireSuite("C E G")).toEqual([0, 4, 7]);
    expect(lireSuite("0 4 7")).toEqual([0, 4, 7]);
    expect(lireSuite("C 4 G")).toEqual([0, 4, 7]);
  });

  it("lit les bémols et les noms français", () => {
    expect(lireSuite("Bb Eb Ab")).toEqual([10, 3, 8]);
    expect(lireSuite("do mi sol")).toEqual([0, 4, 7]);
  });

  it("ignore l'octave : on lit des classes, pas des hauteurs", () => {
    expect(lireSuite("C4 C5 C-1")).toEqual([0, 0, 0]);
  });

  it("ramène les chiffres hors de zéro-onze dans le tour", () => {
    expect(lireSuite("12 13 -1")).toEqual([0, 1, 11]);
  });

  it("passe ce qui n'est pas lisible au lieu de perdre le reste", () => {
    expect(lireSuite("C zzz G")).toEqual([0, 7]);
    expect(lireSuite("")).toEqual([]);
  });
});

describe("les quatre formes", () => {
  it("rétrograde en renversant l'ordre, sans toucher aux hauteurs", () => {
    expect(retrograde(BERG)).toEqual([5, 3, 1, 11, 8, 4, 0, 9, 6, 2, 10, 7]);
  });

  it("inverse autour de la première note, qui ne bouge donc pas", () => {
    const i = inverser(BERG);
    expect(i[0]).toBe(BERG[0]);
    // Les intervalles changent de sens : +3 devient −3.
    expect(i[1]).toBe(4);
    expect(i[2]).toBe(0);
  });

  it("ne fait rien quand on applique deux fois la même opération", () => {
    expect(retrograde(retrograde(BERG))).toEqual(BERG);
    expect(inverser(inverser(BERG))).toEqual(BERG);
  });

  it("compose le rétrograde de l'inversion dans cet ordre", () => {
    expect(retrogradeInversion(BERG)).toEqual(retrograde(inverser(BERG)));
  });

  it("transpose sans changer les intervalles", () => {
    const t = transposer(BERG, 5);
    const ecarts = (s: number[]) => s.slice(1).map((n, i) => ((n - s[i] + 12) % 12));
    expect(ecarts(t)).toEqual(ecarts(BERG));
    expect(t[0]).toBe(0);
  });

  it("nomme la forme demandée", () => {
    expect(forme(BERG, "originale")).toEqual(BERG);
    expect(forme(BERG, "retrograde")).toEqual(retrograde(BERG));
    expect(forme(BERG, "inversion")).toEqual(inverser(BERG));
    expect(forme(BERG, "retrograde-inversion")).toEqual(retrogradeInversion(BERG));
  });

  it("reconnaît une vraie série, et refuse ce qui n'en est pas une", () => {
    expect(estSerieComplete(BERG)).toBe(true);
    expect(estSerieComplete([0, 1, 2])).toBe(false);
    expect(estSerieComplete([...BERG.slice(0, 11), 7])).toBe(false); // un doublon
  });
});

describe("matrice", () => {
  const m = matrice(BERG);

  it("porte la série sur sa première ligne", () => {
    expect(m.grille[0]).toEqual(BERG);
  });

  it("porte l'inversion sur sa première colonne", () => {
    expect(m.grille.map((l) => l[0])).toEqual(inverser(BERG));
  });

  it("garde la même note sur toute la diagonale — le contrôle d'écriture", () => {
    for (let i = 0; i < 12; i++) expect(m.grille[i][i]).toBe(BERG[0]);
  });

  it("donne les douze classes sur chaque ligne et chaque colonne", () => {
    for (let i = 0; i < 12; i++) {
      expect(new Set(m.grille[i]).size, `ligne ${i}`).toBe(12);
      expect(new Set(m.grille.map((l) => l[i])).size, `colonne ${i}`).toBe(12);
    }
  });

  it("étiquette les formes par leur niveau de transposition", () => {
    expect(m.lignes[0]).toBe("P0");
    expect(m.colonnes[0]).toBe("I0");
    // La ligne i commence par la note de l'inversion : son niveau est p0 − p[i].
    expect(m.lignes[1]).toBe(`P${(7 - 10 + 12) % 12}`);
  });

  it("donne les rétrogrades en lisant les lignes à l'envers", () => {
    expect([...m.grille[0]].reverse()).toEqual(retrograde(BERG));
  });

  it("s'écrit en colonnes lisibles, avec les étiquettes", () => {
    const texte = matriceEnTexte(BERG);
    const lignes = texte.split("\n");
    expect(lignes.length).toBe(13); // l'en-tête et les douze lignes
    expect(lignes[0]).toContain("I0");
    expect(lignes[1]).toContain("P0");
    expect(lignes[1]).toContain(nomClasse(BERG[0]));
  });

  it("ne rend rien d'une suite vide plutôt que de planter", () => {
    expect(matriceEnTexte([])).toBe("");
    expect(matrice([]).grille).toEqual([]);
  });
});

describe("mise en registre", () => {
  it("range tout dans une octave quand on ne serre pas", () => {
    const notes = placerDansRegistre([0, 4, 7, 11], 60, false);
    expect(notes).toEqual([60, 64, 67, 71]);
  });

  it("choisit l'octave la plus proche de la note précédente", () => {
    // Do puis si : le si du dessous est à un demi-ton, celui du dessus à onze.
    expect(placerDansRegistre([0, 11], 60, true)).toEqual([60, 59]);
    expect(placerDansRegistre([0, 11], 60, false)).toEqual([60, 71]);
  });

  it("ne dépasse jamais six demi-tons d'un pas à l'autre en mode serré", () => {
    const notes = placerDansRegistre(BERG, 60, true);
    for (let i = 1; i < notes.length; i++) {
      expect(Math.abs(notes[i] - notes[i - 1]), `pas ${i}`).toBeLessThanOrEqual(6);
    }
  });

  it("garde les classes de hauteur intactes, quel que soit le registre", () => {
    const notes = placerDansRegistre(BERG, 60, true);
    expect(notes.map((n) => ((n % 12) + 12) % 12)).toEqual(BERG);
  });

  it("reste dans les bornes du clavier même sur une suite qui descend toujours", () => {
    const descendante = Array.from({ length: 60 }, (_, i) => (60 - i * 5) % 12);
    for (const n of placerDansRegistre(descendante, 24, true)) {
      expect(n).toBeGreaterThanOrEqual(12);
      expect(n).toBeLessThanOrEqual(115);
    }
  });
});
