// ui/cercle-disposition.test.ts — La pastille sous le doigt est-elle celle qu'on vise ?
//
// POURQUOI CE FICHIER EXISTE. Un cercle de quarante-huit places a des pastilles de quelques pixels,
// et rien ne se voit à l'œil quand le calcul en désigne une à côté : on clique, une autre s'allume,
// et l'on croit avoir mal visé. Le même défaut a déjà coûté au clavier, dont le test de position ne
// parcourait que les touches blanches. La géométrie est donc ici, hors du dessin, et elle est
// éprouvée.
import { describe, expect, it } from "vitest";

import {
  ajusterMotif, angleDeLaPlace, disposerCercle, ecrireMotif, lireMotif, nettoyerMotif,
  nomsTiennent, placeSousLePoint, rayonPastille, TAILLE_NOM,
} from "./cercle-disposition";

/** Le rayon d'une pastille dans les unités du dessin, comme la vue le calcule. */
const rayonDessine = (positions: number) => rayonPastille(positions) * 500 * 0.82;

describe("où se posent les pastilles", () => {
  it("LA PLACE ZÉRO EST EN HAUT, comme sur une horloge", () => {
    const d = disposerCercle(4, []);
    expect(d.pastilles[0].x).toBeCloseTo(0, 12);
    expect(d.pastilles[0].y).toBeCloseTo(-1, 12);
  });

  it("LE TOUR SE FAIT DANS LE SENS DES AIGUILLES : le quart suivant est à droite", () => {
    const d = disposerCercle(4, []);
    expect(d.pastilles[1].x).toBeCloseTo(1, 12);
    expect(d.pastilles[1].y).toBeCloseTo(0, 12);
    expect(d.pastilles[2].y).toBeCloseTo(1, 12);
    expect(d.pastilles[3].x).toBeCloseTo(-1, 12);
  });

  it("toutes les pastilles sont sur le cercle unité", () => {
    for (const p of disposerCercle(13, []).pastilles) expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 12);
  });

  it("il y a exactement une pastille par place", () => {
    expect(disposerCercle(17, []).pastilles).toHaveLength(17);
    expect(new Set(disposerCercle(17, []).pastilles.map((p) => p.place)).size).toBe(17);
  });

  it("le polygone ne retient que les places qui sonnent, dans l'ordre du tour", () => {
    const d = disposerCercle(8, [6, 0, 3]);
    expect(d.polygone).toHaveLength(3);
    expect(d.pastilles.filter((p) => p.sonne).map((p) => p.place)).toEqual([0, 3, 6]);
  });
});

describe("la taille des pastilles", () => {
  it("ELLE DÉCROÎT QUAND LE CERCLE SE REMPLIT : c'est ce qui permet d'en mettre plus", () => {
    // Elle ne décroît jamais à l'envers, et décroît vraiment une fois le plafond quitté. Celui-ci
    // gouverne jusqu'à une vingtaine de places : en deçà, quatre et huit ont la même taille, et
    // c'est voulu — trois pastilles à leur écart naturel rempliraient tout le dessin.
    const tailles = [4, 8, 16, 24, 32, 48].map(rayonPastille);
    for (let i = 1; i < tailles.length; i++) expect(tailles[i]).toBeLessThanOrEqual(tailles[i - 1]);
    for (const [a, b] of [[24, 32], [32, 48]]) expect(rayonPastille(b)).toBeLessThan(rayonPastille(a));
  });

  it("DEUX VOISINES NE SE TOUCHENT JAMAIS, quel que soit le nombre de places", () => {
    for (const n of [2, 3, 5, 8, 12, 16, 24, 32, 48]) {
      const d = disposerCercle(n, []);
      const a = d.pastilles[0], b = d.pastilles[1 % n];
      if (n < 2) continue;
      const ecart = Math.hypot(a.x - b.x, a.y - b.y);
      expect(2 * d.rayonPastille, `${n} places`).toBeLessThan(ecart);
    }
  });

  it("sur un petit cercle c'est le plafond qui s'applique, sinon trois pastilles rempliraient tout", () => {
    expect(rayonPastille(3)).toBeLessThanOrEqual(0.13);
  });
});

describe("la place sous le point", () => {
  it("TROUVE CELLE QU'ON VISE, à son centre exact", () => {
    for (const n of [4, 12, 16, 48]) {
      for (const p of [0, 1, Math.floor(n / 2), n - 1]) {
        const a = angleDeLaPlace(p, n);
        expect(placeSousLePoint(Math.cos(a), Math.sin(a), n), `${p} sur ${n}`).toBe(p);
      }
    }
  });

  it("NE REND RIEN AU CENTRE NI AU LOIN : un clic dans le vide n'allume pas une place au hasard", () => {
    expect(placeSousLePoint(0, 0, 16)).toBeNull();
    expect(placeSousLePoint(3, 3, 16)).toBeNull();
    expect(placeSousLePoint(0.5, 0, 16)).toBeNull();
  });

  it("CHAQUE PLACE EST ATTEIGNABLE, même à quarante-huit : aucune n'est masquée par sa voisine", () => {
    const n = 48;
    const atteintes = new Set<number>();
    for (let p = 0; p < n; p++) {
      const a = angleDeLaPlace(p, n);
      const t = placeSousLePoint(Math.cos(a), Math.sin(a), n);
      if (t !== null) atteintes.add(t);
    }
    expect(atteintes.size).toBe(n);
  });

  it("un point entre deux pastilles va à la plus proche, ou à aucune", () => {
    const n = 8;
    const a = angleDeLaPlace(0, n), b = angleDeLaPlace(1, n);
    const milieu = placeSousLePoint((Math.cos(a) + Math.cos(b)) / 2, (Math.sin(a) + Math.sin(b)) / 2, n);
    expect(milieu === null || milieu === 0 || milieu === 1).toBe(true);
  });
});

describe("le nom d'une note dans sa pastille", () => {
  it("UN DIÈSE NE TIENT PLUS À QUARANTE-HUIT PLACES, et c'est là que le défaut a été relevé", () => {
    // Mesuré dans le navigateur : la pastille faisait 13,3 pixels de large, « G#4 » en faisait 15,8.
    expect(nomsTiennent(rayonDessine(48), "G#4".length)).toBe(false);
    // Deux caractères y tiennent encore, et c'est pour cela que le verdict se prend sur le plus long
    // nom du cercle : sans quoi « C4 » paraîtrait et « C#4 » non, sur le même dessin.
    expect(nomsTiennent(rayonDessine(48), "C4".length)).toBe(true);
  });

  it("IL TIENT SUR UN CERCLE ORDINAIRE : la règle ne cache pas les noms qu'on vient lire", () => {
    for (const n of [4, 8, 12, 16, 24, 32]) {
      expect(nomsTiennent(rayonDessine(n), "G#4".length), `${n} places`).toBe(true);
    }
  });

  it("le verdict ne se retourne jamais quand le cercle se remplit", () => {
    let precedent = true;
    for (const n of [4, 8, 12, 16, 24, 32, 36, 40, 44, 48]) {
      const tient = nomsTiennent(rayonDessine(n), 3);
      expect(tient && !precedent, `${n} places`).toBe(false);
      precedent = tient;
    }
  });

  it("LA RÈGLE SUIT LA TAILLE DU TEXTE : c'est pour cela que celle-ci ne vit plus dans le style", () => {
    // À rayon égal, le verdict se retourne quand le nom s'allonge, et il se retournerait de même si
    // l'on grossissait le texte. Une taille écrite dans la feuille de style aurait pu changer sans
    // que cette règle le sache, et les noms auraient débordé sans qu'aucun test ne bouge.
    const rayon = 1.4 * TAILLE_NOM;
    expect(nomsTiennent(rayon, 3)).toBe(true);
    expect(nomsTiennent(rayon, 5)).toBe(false);
  });

  it("UN MICROTON NE MONTRE PLUS SON NOM, et son écart est la raison", () => {
    // « A#4−50 » fait sept caractères là où « A#4 » en fait trois : aucun cercle ne peut l'écrire.
    // Le nom reste dans l'infobulle, et l'écart n'est jamais tu — c'est la règle de `nom-note.ts`.
    for (const n of [4, 8, 16, 48]) expect(nomsTiennent(rayonDessine(n), 7), `${n} places`).toBe(false);
  });
});

describe("le motif, tel qu'il se range dans un réglage", () => {
  it("se lit et se réécrit à l'identique", () => {
    const motif = "1001001000101000";
    expect(ecrireMotif(16, lireMotif(motif))).toBe(motif);
  });

  it("le son se lit bien comme ses cinq attaques", () => {
    expect(lireMotif("1001001000101000")).toEqual([0, 3, 6, 10, 12]);
  });

  it("CHANGER LE NOMBRE DE PLACES N'EFFACE PAS LE TRAVAIL : on complète, on coupe", () => {
    expect(ajusterMotif("10010010", 16)).toBe("1001001000000000");
    expect(ajusterMotif("1001001000101000", 8)).toBe("10010010");
    expect(ajusterMotif("10010010", 8)).toBe("10010010");
  });

  it("une saisie à la main est tolérée, tout ce qui n'est pas binaire étant écarté", () => {
    expect(nettoyerMotif("1 0 0 1 · 0010")).toBe("10010010");
    expect(nettoyerMotif("x y z")).toBe("");
  });

  it("un motif vide ne casse rien", () => {
    expect(lireMotif("")).toEqual([]);
    expect(ecrireMotif(4, [])).toBe("0000");
    expect(ajusterMotif("", 4)).toBe("0000");
  });
});
