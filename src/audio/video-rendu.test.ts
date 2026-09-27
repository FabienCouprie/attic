// audio/video-rendu.test.ts — Ce qui se vérifie hors du navigateur.
//
// CE QUE CE FICHIER NE PEUT PAS TENIR, et il vaut mieux l'écrire que de le laisser croire :
// l'encodage lui-même demande `OffscreenCanvas` et `VideoEncoder`, que l'environnement de test n'a
// pas. Il est éprouvé dans l'application, où il a produit un MP4 de 1280 par 720 relu avec ses deux
// pistes. Restent ici les deux calculs qui décident du coût, et ils se vérifient sans peindre.
import { describe, expect, it } from "vitest";

import { nombreDImages, poidsAttendu } from "./video-rendu";

describe("le compte des images", () => {
  it("une seconde à trente images par seconde en compte trente", () => {
    expect(nombreDImages(1, 30)).toBe(30);
    expect(nombreDImages(20, 30)).toBe(600);
    expect(nombreDImages(20, 25)).toBe(500);
  });

  it("IL Y A TOUJOURS AU MOINS UNE IMAGE, un conteneur sans image ne se lisant nulle part", () => {
    expect(nombreDImages(0, 30)).toBe(1);
    expect(nombreDImages(-5, 30)).toBe(1);
    expect(nombreDImages(1, 0)).toBe(1);
  });

  it("une cadence fractionnaire arrondit au plus proche", () => {
    expect(nombreDImages(2, 29.97)).toBe(60);
    expect(nombreDImages(10, 23.976)).toBe(240);
  });
});

describe("le poids attendu", () => {
  it("il se déduit du débit et de la durée, pour annoncer avant de produire", () => {
    // Vingt secondes à six mégabits par seconde : quinze mégaoctets.
    expect(poidsAttendu(20, 6_000_000)).toBe(15_000_000);
    expect(poidsAttendu(0, 6_000_000)).toBe(0);
  });

  it("il ne rend jamais de valeur négative", () => {
    expect(poidsAttendu(-3, 6_000_000)).toBe(0);
    expect(poidsAttendu(10, -1)).toBe(0);
  });
});
