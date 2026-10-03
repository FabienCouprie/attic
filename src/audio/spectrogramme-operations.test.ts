// audio/spectrogramme-operations.test.ts — Ce qu'on fait à un spectrogramme, et ce qu'on n'y fait pas.
//
// CE QUE CES CAS TIENNENT. Deux opérations circulent entre deux câbles, donc elles se chaînent :
// une entrée modifiée sur place changerait ce qu'un autre composant a déjà reçu, et le défaut ne se
// verrait que sur les graphes qui partagent une sortie. Le reste tient les deux promesses écrites
// dans les notices : un flou qui ne creuse pas les bords, et un décalage dont les chiffres de
// fréquence sont ceux que la documentation annonce.
import { describe, expect, it } from "vitest";

import { PARAMETRES_RIFFUSION, hzVersMel, melVersHz } from "./mel";
import type { SpectrogrammeMel } from "./spectrogramme-mel";
import { decalerBandes, flouterSpectrogramme, noyauGaussien } from "./spectrogramme-operations";

const BANDES = 512;

/** Un spectrogramme dont une seule bande est allumée, sur toutes les colonnes. */
function raie(bande: number, colonnes = 8, bandes = BANDES): SpectrogrammeMel {
  const canal = Array.from({ length: colonnes }, () => {
    const t = new Float32Array(bandes);
    t[bande] = 1;
    return t;
  });
  return { canaux: [canal], parametres: { ...PARAMETRES_RIFFUSION, bandes } };
}

/** Un spectrogramme plat, qui révèle un creux de bord s'il y en a un. */
function plat(valeur = 1, colonnes = 8, bandes = 32): SpectrogrammeMel {
  const canal = Array.from({ length: colonnes }, () => new Float32Array(bandes).fill(valeur));
  return { canaux: [canal], parametres: { ...PARAMETRES_RIFFUSION, bandes } };
}

const somme = (t: Float32Array) => t.reduce((a, b) => a + b, 0);

describe("le noyau en cloche", () => {
  it("se somme à un, et il est symétrique", () => {
    const n = noyauGaussien(3);
    let s = 0;
    for (const v of n) s += v;
    expect(s).toBeCloseTo(1, 10);
    for (let i = 0; i < n.length; i++) expect(n[i]).toBeCloseTo(n[n.length - 1 - i], 12);
  });

  it("s'étend à trois écarts-types de part et d'autre", () => {
    expect(noyauGaussien(2).length).toBe(13);
    // Un écart-type nul ne floute rien : le noyau se réduit à un point.
    expect(noyauGaussien(0).length).toBe(1);
  });
});

describe("le flou", () => {
  it("étale une raie sur ses voisines et garde l'énergie", () => {
    const s = raie(200);
    const f = flouterSpectrogramme(s, 0, 4);
    const avant = s.canaux[0][0], apres = f.canaux[0][0];
    expect(apres[200]).toBeLessThan(avant[200]);
    expect(apres[204]).toBeGreaterThan(0);
    // Le noyau se somme à un : l'énergie se répartit sans se perdre.
    expect(somme(apres)).toBeCloseTo(somme(avant), 5);
  });

  it("NE MODIFIE PAS SON ENTRÉE, parce qu'une valeur circule sur plusieurs câbles", () => {
    const s = raie(200);
    const copie = Float32Array.from(s.canaux[0][0]);
    flouterSpectrogramme(s, 2, 4);
    expect([...s.canaux[0][0]]).toEqual([...copie]);
  });

  it("NE CREUSE PAS LES BORDS : un spectrogramme plat reste plat", () => {
    // Border de zéros ferait tomber les bandes extrêmes et les deux bouts du son. C'est le seul
    // cas qui le voit, et c'est pour cela qu'il existe.
    const f = flouterSpectrogramme(plat(1), 3, 5);
    for (const trame of f.canaux[0]) {
      for (let b = 0; b < trame.length; b++) expect(trame[b]).toBeCloseTo(1, 5);
    }
  });

  it("rend l'entrée telle quelle quand les deux largeurs sont nulles", () => {
    const s = raie(200);
    expect(flouterSpectrogramme(s, 0, 0)).toBe(s);
  });

  it("floute le temps et la fréquence séparément", () => {
    const s = raie(200, 9);
    // Une raie allumée sur toutes les colonnes ne change pas par un flou temporel seul.
    const t = flouterSpectrogramme(s, 2, 0);
    expect(t.canaux[0][4][200]).toBeCloseTo(1, 5);
    // Et un flou en fréquence seul ne déplace rien dans le temps.
    const f = flouterSpectrogramme(s, 0, 3);
    expect(somme(f.canaux[0][0])).toBeCloseTo(somme(f.canaux[0][8]), 6);
  });
});

describe("le décalage des bandes", () => {
  it("déplace le contenu du nombre exact de rangs", () => {
    const d = decalerBandes(raie(200), 12);
    expect(d.canaux[0][0][212]).toBe(1);
    expect(d.canaux[0][0][200]).toBe(0);
  });

  it("laisse entrer le silence par le bord, sans enrouler", () => {
    const d = decalerBandes(raie(3), 12);
    // Ce qui était en bas est monté, et rien n'est réapparu par le haut.
    expect(d.canaux[0][0][15]).toBe(1);
    expect(somme(d.canaux[0][0])).toBe(1);
    // Et ce qui sort par le haut est perdu.
    expect(somme(decalerBandes(raie(BANDES - 2), 12).canaux[0][0])).toBe(0);
  });

  it("NE MODIFIE PAS SON ENTRÉE", () => {
    const s = raie(200);
    const copie = Float32Array.from(s.canaux[0][0]);
    decalerBandes(s, 12);
    expect([...s.canaux[0][0]]).toEqual([...copie]);
  });

  it("rend l'entrée telle quelle à zéro", () => {
    const s = raie(200);
    expect(decalerBandes(s, 0)).toBe(s);
  });

  it("CE N'EST NI UNE TRANSPOSITION NI UN DÉCALAGE DE FRÉQUENCE, et les deux chiffres de la notice le disent", () => {
    // LA NOTICE ANNONCE CES NOMBRES, donc ce cas les tient. Monter de douze bandes au paramétrage
    // par défaut porte cent hertz à 152,7 et cinq mille à 5375 : une transposition donnerait le
    // même facteur aux deux, un décalage de fréquence le même nombre de hertz, et ce n'est ni l'un
    // ni l'autre. Mes premiers chiffres, calculés à la main, étaient 152,8 et 5376.
    const p = PARAMETRES_RIFFUSION;
    const mMin = hzVersMel(p.fMin), mMax = hzVersMel(Math.min(p.fMax, p.echantillonnage / 2));
    const parBande = (mMax - mMin) / (p.bandes + 1);
    const apres = (hz: number) => melVersHz(hzVersMel(hz) + 12 * parBande);
    expect(apres(100)).toBeCloseTo(152.69, 1);
    expect(apres(5000)).toBeCloseTo(5375.4, 1);
    // Le facteur du grave est quinze fois plus grand que celui de l'aigu, en proportion de l'écart.
    expect((apres(100) / 100 - 1) / (apres(5000) / 5000 - 1)).toBeGreaterThan(6);
  });
});
