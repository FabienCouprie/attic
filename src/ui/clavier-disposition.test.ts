// ui/clavier-disposition.test.ts — Un clavier dont les touches noires se jouent.
//
// Le nœud « Clavier mélodie » dessinait des touches noires sans les jouer : le test de
// position ne parcourait que les blanches, et les noires n'avaient aucun gestionnaire —
// cliquer un dièse jouait la blanche en dessous. Aucune altération n'était atteignable à
// la souris. Ces tests tiennent la géométrie et, surtout, le choix de la touche sous le
// curseur.
import { describe, expect, it } from "vitest";
import {
  BLANCHES_88, LARGEUR_BLANCHE_MIN, NOTE_MAX, NOTE_MIN, disposition, estNoire, largeurBlanchePour,
  nomNote, noteALaPosition,
} from "./clavier-disposition";

describe("la largeur d'une touche, déduite de la place", () => {
  // À vingt-quatre pixels fixes, les quatre-vingt-huit touches en faisaient 1248, dans des nœuds
  // qui en font six cent soixante : on n'en voyait que la moitié, et il fallait défiler pour
  // trouver une note. La largeur suit maintenant la place offerte.
  it("LES QUATRE-VINGT-HUIT TOUCHES TIENNENT DANS LA PLACE OFFERTE", () => {
    for (const place of [420, 500, 660, 900, 1300]) {
      const d = disposition(NOTE_MIN, NOTE_MAX, largeurBlanchePour(place));
      expect(d.blanches.length).toBe(BLANCHES_88);
      expect(d.largeurTotale, `${place} px`).toBeLessThanOrEqual(place);
    }
  });

  it("emploie la place, à moins d'un pixel par touche près", () => {
    // La largeur est un entier de pixels : l'arrondi perd au plus une fraction de pixel par
    // blanche, donc moins de cinquante-deux en tout. À 660 px il reste 36 px, soit six pour cent
    // de la largeur, invisibles. Répartir ce reste demanderait des touches de largeurs inégales,
    // et le test de position devrait suivre : cela ne vaut pas six pour cent.
    for (const place of [420, 660, 900]) {
      const d = disposition(NOTE_MIN, NOTE_MAX, largeurBlanchePour(place));
      expect(place - d.largeurTotale, `${place} px`).toBeLessThan(BLANCHES_88);
    }
  });

  it("S'ARRÊTE DE RÉTRÉCIR AU LIEU DE RENDRE UN TRAIT, et le clavier redéfile alors", () => {
    // Sous la largeur minimale, mieux vaut un clavier qui dépasse que des touches qu'on ne
    // distingue plus : c'est le seul cas où le défilement garde un rôle.
    const d = disposition(NOTE_MIN, NOTE_MAX, largeurBlanchePour(120));
    expect(d.largeurBlanche).toBe(LARGEUR_BLANCHE_MIN);
    expect(d.largeurTotale).toBeGreaterThan(120);
  });

  it("ne rend pas de largeur absurde sur une mesure absente ou nulle", () => {
    // Le premier rendu précède la mesure : la largeur y vaut zéro, et un zéro propagé donnerait
    // des touches de largeur nulle, donc un clavier invisible jusqu'au premier redimensionnement.
    for (const mauvais of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(largeurBlanchePour(mauvais), String(mauvais)).toBe(LARGEUR_BLANCHE_MIN);
    }
  });
});

describe("étendue du clavier", () => {
  it("compte 88 touches, dont 52 blanches et 36 noires — un piano complet", () => {
    const d = disposition();
    expect(d.blanches.length).toBe(52);
    expect(d.noires.length).toBe(36);
    expect(d.blanches.length + d.noires.length).toBe(88);
  });

  it("va de La0 à Do8, comme le clavier de référence", () => {
    expect(nomNote(NOTE_MIN)).toBe("A0");
    expect(nomNote(NOTE_MAX)).toBe("C8");
    const d = disposition();
    expect(d.blanches[0].note).toBe(NOTE_MIN);
    expect(d.blanches[d.blanches.length - 1].note).toBe(NOTE_MAX);
  });

  it("nomme les notes comme les musiciens : 60 = C4", () => {
    expect(nomNote(60)).toBe("C4");
    expect(nomNote(69)).toBe("A4");
    expect(nomNote(61)).toBe("C#4");
  });

  it("sait quelles notes sont altérées", () => {
    expect([1, 3, 6, 8, 10].every((n) => estNoire(60 + n))).toBe(true);
    expect([0, 2, 4, 5, 7, 9, 11].some((n) => estNoire(60 + n))).toBe(false);
  });

  it("aligne les blanches bout à bout, sans trou ni chevauchement", () => {
    const d = disposition(60, 72, 20);
    for (let i = 1; i < d.blanches.length; i++) {
      expect(d.blanches[i].x).toBe(d.blanches[i - 1].x + 20);
    }
    expect(d.largeurTotale).toBe(d.blanches.length * 20);
  });

  it("centre chaque noire sur la frontière des deux blanches qui l'encadrent", () => {
    const d = disposition(60, 72, 20);
    const do_ = d.blanches.find((b) => b.note === 60)!;
    const doDiese = d.noires.find((n) => n.note === 61)!;
    expect(doDiese.x + doDiese.largeur / 2).toBe(do_.x + 20);
  });

  it("n'affiche pas de noire orpheline quand l'intervalle commence sur une altération", () => {
    const d = disposition(61, 72, 20);
    expect(d.noires.some((n) => n.note === 61)).toBe(false);
  });
});

describe("touche sous le curseur", () => {
  const d = disposition(60, 72, 20); // do4 → do5
  const H = 100;

  it("joue la NOIRE quand on clique dans sa partie haute — le défaut rapporté", () => {
    const doDiese = d.noires.find((n) => n.note === 61)!;
    const centre = doDiese.x + doDiese.largeur / 2;
    expect(noteALaPosition(centre, 10, H, d)).toBe(61);
    expect(noteALaPosition(centre, H * 0.5, H, d)).toBe(61);
  });

  it("joue la blanche sous la même abscisse dès qu'on descend plus bas", () => {
    const doDiese = d.noires.find((n) => n.note === 61)!;
    const centre = doDiese.x + doDiese.largeur / 2;
    // Plus bas que les noires : on est entre les dièses, comme sur un vrai clavier.
    expect(noteALaPosition(centre, H * 0.9, H, d)).toBe(62);
  });

  it("joue la blanche tout en haut là où aucune noire ne la couvre", () => {
    // Mi et Fa se touchent sans altération entre eux : le bord droit du mi est libre
    // jusqu'en haut. Son bord GAUCHE, lui, est encore sous le ré dièse — c'est le clavier
    // qui est ainsi fait, et le test de position doit le refléter.
    const mi = d.blanches.find((b) => b.note === 64)!;
    expect(noteALaPosition(mi.x + mi.largeur - 2, 5, H, d)).toBe(64);
    expect(noteALaPosition(mi.x + 2, 5, H, d)).toBe(63);
  });

  it("rend chaque touche atteignable : les 12 notes d'une octave sortent du test", () => {
    const vues = new Set<number>();
    for (let x = 0; x < d.largeurTotale; x += 0.5) {
      for (const y of [H * 0.2, H * 0.9]) {
        const n = noteALaPosition(x, y, H, d);
        if (n !== null) vues.add(n);
      }
    }
    for (let note = 60; note <= 72; note++) {
      expect(vues.has(note), `${nomNote(note)} inatteignable`).toBe(true);
    }
  });

  it("ne renvoie rien hors du clavier", () => {
    expect(noteALaPosition(-1, 10, H, d)).toBe(null);
    expect(noteALaPosition(d.largeurTotale + 1, 10, H, d)).toBe(null);
    expect(noteALaPosition(10, -1, H, d)).toBe(null);
    expect(noteALaPosition(10, H + 1, H, d)).toBe(null);
  });
});
