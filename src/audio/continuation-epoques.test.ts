// audio/continuation-epoques.test.ts — Le mode automatique borne le travail, et non le temps.
//
// Relevé le 2026-10-27 par `tests-e2e/graines-tenues.spec.ts` : « Continuation AR », à graine 4242,
// rendait deux sons selon la charge de la machine. Son mode automatique coupait l'entraînement sur
// l'horloge — 3 époques sur 100 sur l'entrée du banc au repos, une autre sous charge. Il compte
// désormais un travail. Ces cas tiennent que le compte ne dépend que des dimensions du calcul.
import { describe, expect, it } from "vitest";
import { TRAVAIL_AUTO, coutParEpoque, epoquesAutomatiques } from "./continuation-spectrale";

describe("les époques du mode automatique", () => {
  it("SUR L'ENTRÉE DU BANC, ELLES VALENT LES 3 QUE L'HORLOGE LAISSAIT AU REPOS", () => {
    // 3 s à 48 kHz, FFT 2048 (1025 cases), saut de 25 % (512), historique 4 : environ 282 trames,
    // donc 278 échantillons d'entraînement. Mesuré au banc avant et après : 3/100 époques, valeur
    // efficace 0,244886279 dans les deux cas — le son par défaut n'a pas changé.
    for (const nSamples of [276, 278, 281]) {
      expect(epoquesAutomatiques(coutParEpoque("ar", nSamples, 4, 1025, 0), 100)).toBe(3);
    }
  });

  it("NE DÉPEND QUE DES DIMENSIONS : deux appels égaux rendent le même compte", () => {
    const cout = coutParEpoque("lstm", 500, 8, 513, 128);
    expect(epoquesAutomatiques(cout, 100)).toBe(epoquesAutomatiques(cout, 100));
  });

  it("RESTE ENTRE UNE ÉPOQUE ET CELLES QU'ON A DEMANDÉES", () => {
    expect(epoquesAutomatiques(TRAVAIL_AUTO * 10, 100), "un calcul énorme doit faire au moins une époque").toBe(1);
    expect(epoquesAutomatiques(1, 100), "un calcul minuscule ne dépasse pas la demande").toBe(100);
    expect(epoquesAutomatiques(0, 40)).toBe(40);
    expect(epoquesAutomatiques(Number.NaN, 40)).toBe(40);
  });

  it("UN CALCUL PLUS LOURD FAIT MOINS D'ÉPOQUES", () => {
    const leger = epoquesAutomatiques(coutParEpoque("ar", 100, 4, 513, 0), 1000);
    const lourd = epoquesAutomatiques(coutParEpoque("ar", 100, 4, 2049, 0), 1000);
    expect(lourd).toBeLessThan(leger);
  });
});
