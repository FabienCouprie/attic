// audio/batterie-midi.test.ts — Le rythme doit survivre au changement de sons.
//
// CE QUI SE VÉRIFIE ICI, et ce n'est pas une évidence : que les instants du MIDI soient les MÊMES que
// ceux du rendu audio, swing compris. Une grille traduite sans son swing donne le même rythme sur le
// papier et une autre musique à l'oreille, et rien ne le signale — les deux fichiers ont le même
// nombre de notes.
//
// La formule d'instant est donc comparée à celle du rendu, recopiée ici depuis `batterie.ts` : si
// l'une des deux change, le test tombe.
import { describe, expect, it } from "vitest";
import {
  CANAL_PERCUSSION, DUREE_NOTE_MAX, NOTES_PERCUSSION_GM, NUANCE_MAX, dureeDuPas,
  frappesDeGrilleVelocite, frappesDePistesBooleennes, instantDuPas, notesDepuisFrappes,
  velociteMidiDepuisNuance,
} from "./batterie-midi";
import { VOIX_KIT } from "./kit-batterie";

/** Une grille de vélocité : huit pistes, `pas` colonnes, remplie de zéros. */
const grilleVide = (pas: number) => Array.from({ length: 8 }, () => new Array(pas).fill(0));

describe("la correspondance avec le General MIDI", () => {
  it("est la MÊME que celle du kit embarqué — un seul endroit, aucune dérive possible", () => {
    expect(VOIX_KIT.map((v) => v.note)).toEqual([...NOTES_PERCUSSION_GM]);
    VOIX_KIT.forEach((v, i) => expect(v.piste, v.fichier).toBe(i));
  });

  it("suit les numéros de la norme : 36 grosse caisse, 38 caisse claire, 42 charley fermé", () => {
    expect(NOTES_PERCUSSION_GM[0]).toBe(36);
    expect(NOTES_PERCUSSION_GM[1]).toBe(38);
    expect(NOTES_PERCUSSION_GM[2]).toBe(42);
    expect(NOTES_PERCUSSION_GM[3]).toBe(46);
    expect(CANAL_PERCUSSION).toBe(9); // le canal 10 pour qui le lit
  });
});

describe("la vélocité", () => {
  it("traduit les neuf nuances sur la plage MIDI, la plus forte au maximum", () => {
    expect(velociteMidiDepuisNuance(9)).toBe(127);
    expect(velociteMidiDepuisNuance(NUANCE_MAX)).toBe(127);
    // La conversion est celle du rendu, qui multiplie le niveau par nuance/9.
    expect(velociteMidiDepuisNuance(1)).toBe(Math.round(127 / 9));
    expect(velociteMidiDepuisNuance(5)).toBe(Math.round((5 / 9) * 127));
  });

  it("ne rend jamais zéro : une note de vélocité nulle est un silence, pas une frappe", () => {
    expect(velociteMidiDepuisNuance(0)).toBe(1);
    expect(velociteMidiDepuisNuance(-3)).toBe(1);
    expect(velociteMidiDepuisNuance(99)).toBe(127);
  });
});

describe("les instants, et le swing", () => {
  // La formule du rendu, recopiée de `batterie.ts` pour que les deux soient comparées :
  //   stepDur = (60 / tempo) * 4 / nbPas
  //   t = pas * stepDur ; si (pas % nbPas) est impair, t += (swing / 100) * stepDur * 0.6
  const instantDuRendu = (pas: number, nbPas: number, tempo: number, swing: number) => {
    const stepDur = ((60 / tempo) * 4) / nbPas;
    const s = pas % nbPas;
    let t = pas * stepDur;
    if (s % 2 === 1) t += (swing / 100) * stepDur * 0.6;
    return t;
  };

  it("donne EXACTEMENT les instants du rendu, à tous les pas et à tous les swings", () => {
    for (const tempo of [60, 96, 120, 200]) {
      for (const nbPas of [16, 32, 64]) {
        for (const swing of [0, 20, 60]) {
          for (let pas = 0; pas < nbPas * 2; pas++) {
            expect(instantDuPas(pas, nbPas, dureeDuPas(tempo, nbPas), swing),
              `tempo ${tempo}, ${nbPas} pas, swing ${swing}, pas ${pas}`)
              .toBeCloseTo(instantDuRendu(pas, nbPas, tempo, swing), 12);
          }
        }
      }
    }
  });

  it("ne déplace QUE les contretemps, et vers l'avant", () => {
    const dp = dureeDuPas(120, 16);
    for (let pas = 0; pas < 32; pas++) {
      const sans = instantDuPas(pas, 16, dp, 0);
      const avec = instantDuPas(pas, 16, dp, 60);
      if ((pas % 16) % 2 === 0) expect(avec).toBeCloseTo(sans, 12);
      else expect(avec).toBeGreaterThan(sans);
    }
  });

  it("un pas dure bien une double croche à quatre temps", () => {
    // 120 BPM, 16 pas par mesure : la mesure fait deux secondes, le pas un huitième de seconde.
    expect(dureeDuPas(120, 16)).toBeCloseTo(0.125, 12);
    expect(dureeDuPas(60, 64)).toBeCloseTo(0.0625, 12);
  });
});

describe("les notes d'une grille", () => {
  it("une frappe par case allumée, sur la note de sa piste", () => {
    const grille = grilleVide(16);
    grille[0][0] = 9;   // grosse caisse
    grille[1][4] = 6;   // caisse claire
    grille[2][2] = 3;   // charley
    const notes = notesDepuisFrappes(frappesDeGrilleVelocite(grille, 16, 1), {
      tempo: 120, pasParMesure: 16, mesures: 1,
    });
    expect(notes).toHaveLength(3);
    expect(notes.map((n) => n.note)).toEqual([36, 42, 38]); // triées par instant
    expect(notes[0].velocite).toBe(127);
    expect(notes[2].velocite).toBe(velociteMidiDepuisNuance(6));
  });

  it("répète le motif sur toutes les mesures demandées", () => {
    const grille = grilleVide(16);
    grille[0][0] = 9;
    const notes = notesDepuisFrappes(frappesDeGrilleVelocite(grille, 16, 4), {
      tempo: 120, pasParMesure: 16, mesures: 4,
    });
    expect(notes).toHaveLength(4);
    // Une mesure à 120 BPM fait deux secondes.
    expect(notes.map((n) => n.debut)).toEqual([0, 2, 4, 6]);
  });

  it("LE SWING SE RETROUVE DANS LE MIDI : le contretemps est repoussé", () => {
    const grille = grilleVide(16);
    grille[2][0] = 9;
    grille[2][1] = 9;
    const dp = dureeDuPas(120, 16);
    const sans = notesDepuisFrappes(frappesDeGrilleVelocite(grille, 16, 1), {
      tempo: 120, pasParMesure: 16, mesures: 1, swing: 0,
    });
    const avec = notesDepuisFrappes(frappesDeGrilleVelocite(grille, 16, 1), {
      tempo: 120, pasParMesure: 16, mesures: 1, swing: 60,
    });
    expect(sans[1].debut).toBeCloseTo(dp, 12);
    expect(avec[1].debut).toBeCloseTo(dp + 0.6 * 0.6 * dp, 12);
    // Le temps, lui, ne bouge pas.
    expect(avec[0].debut).toBe(0);
  });

  it("une note tient jusqu'à la frappe SUIVANTE de sa piste", () => {
    // Deux charleys à un pas d'écart : le premier se coupe, ce qu'on veut d'un charley fermé.
    const grille = grilleVide(16);
    grille[2][0] = 9;
    grille[2][1] = 9;
    grille[5][0] = 9;   // un crash seul : il doit sonner longtemps
    const notes = notesDepuisFrappes(frappesDeGrilleVelocite(grille, 16, 1), {
      tempo: 120, pasParMesure: 16, mesures: 1,
    });
    const charleys = notes.filter((n) => n.note === 42);
    expect(charleys[0].fin - charleys[0].debut).toBeCloseTo(dureeDuPas(120, 16), 12);
    const crash = notes.find((n) => n.note === 49)!;
    expect(crash.fin - crash.debut).toBeCloseTo(DUREE_NOTE_MAX, 6);
  });

  it("plafonne la durée d'une note, pour qu'une frappe isolée n'occupe pas tout le morceau", () => {
    const grille = grilleVide(16);
    grille[0][0] = 9;
    const notes = notesDepuisFrappes(frappesDeGrilleVelocite(grille, 16, 8), {
      tempo: 120, pasParMesure: 16, mesures: 8, dureeMax: 0.3,
    });
    for (const n of notes) expect(n.fin - n.debut).toBeLessThanOrEqual(0.3 + 1e-9);
  });

  it("d'une grille vide ne tire aucune note", () => {
    expect(notesDepuisFrappes(frappesDeGrilleVelocite(grilleVide(16), 16, 2), {
      tempo: 120, pasParMesure: 16, mesures: 2,
    })).toEqual([]);
  });

  it("garde la somme : autant de notes que de cases allumées", () => {
    const grille = grilleVide(32);
    let allumees = 0;
    for (let piste = 0; piste < 8; piste++) {
      for (let p = 0; p < 32; p += piste + 2) { grille[piste][p] = 1 + (p % 9); allumees++; }
    }
    const notes = notesDepuisFrappes(frappesDeGrilleVelocite(grille, 32, 3), {
      tempo: 96, pasParMesure: 32, mesures: 3,
    });
    expect(notes).toHaveLength(allumees * 3);
  });
});

describe("les pistes booléennes de la boîte à rythmes", () => {
  it("traduit le niveau de chaque piste en nuance", () => {
    const frappes = frappesDePistesBooleennes([
      { piste: 0, pas: [true, false, true], niveau: 100 },
      { piste: 1, pas: [false, true, false], niveau: 50 },
    ]);
    expect(frappes).toHaveLength(3);
    expect(frappes.filter((f) => f.piste === 0)[0].nuance).toBe(9);
    expect(frappes.find((f) => f.piste === 1)!.nuance).toBe(Math.round(0.5 * 9));
  });

  it("ne rend jamais une nuance nulle, même à niveau zéro : la case est allumée ou pas", () => {
    const frappes = frappesDePistesBooleennes([{ piste: 0, pas: [true], niveau: 0 }]);
    expect(frappes[0].nuance).toBe(1);
  });
});
