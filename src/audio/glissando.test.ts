// audio/glissando.test.ts — Un agrégat qui glisse vers un autre.
//
// CE QUE CES CAS TIENNENT. D'abord la règle des voix, décidée par Fabien : le compte est celui du
// plus fourni des deux agrégats, et une voix sans vis-à-vis tient sur place. Puis que le glissement
// est linéaire EN DEMI-TONS et non en hertz, ce qui est l'autre décision et s'entend : à mi-chemin
// d'une octave, une voix est au triton et non à une octave et demie de fréquence. Enfin que le son
// produit ne claque pas et n'écrête pas, deux défauts qu'un relevé voit et qu'une écoute confirme.
import { describe, expect, it } from "vitest";
import {
  echantillonsDuGlissando, frequenceDe, hauteurA, partDuGlissement, presenceA, voixDuGlissando,
} from "./glissando";

const OPTIONS = {
  tenueDepart: 0.1, glissement: 0.4, tenueArrivee: 0.1,
  richesse: 3, niveau: 0.8, sampleRate: 22050,
};

/** Une voix présente d'un bout à l'autre, le cas ordinaire. */
const tenue = (de: number, vers: number) => ({ de, vers, auDepart: true, aLArrivee: true });

describe("les voix d'un glissement", () => {
  it("SE CORRESPONDENT RANG PAR RANG", () => {
    expect(voixDuGlissando([60, 64, 67], [62, 65, 69]))
      .toEqual([tenue(60, 62), tenue(64, 65), tenue(67, 69)]);
  });

  it("LE COMPTE EST CELUI DU PLUS FOURNI, et les surnuméraires TIENNENT SUR PLACE", () => {
    // Une triade vers un accord de sept notes : quatre voix n'ont pas d'origine et gardent la leur.
    const sept = [60, 63, 67, 70, 74, 77, 81];
    const v = voixDuGlissando([60, 64, 67], sept);
    expect(v.length).toBe(7);
    expect(v.slice(0, 3)).toEqual([tenue(60, 60), tenue(64, 63), tenue(67, 67)]);
    for (const x of v.slice(3)) expect(x.de).toBe(x.vers);
    // Et dans l'autre sens : une voix sans destination garde sa hauteur de départ.
    const w = voixDuGlissando(sept, [60, 64, 67]);
    expect(w.length).toBe(7);
    for (const x of w.slice(3)) expect(x.de).toBe(x.vers);
  });

  it("UNE VOIX SANS ORIGINE N'EST PAS DANS L'AGRÉGAT DE DÉPART, et réciproquement", () => {
    // LE DÉFAUT RELEVÉ PAR FABIEN : « si je fixe un point de départ et que je fais bouger le point
    // d'arrivée, à l'oreille le point de départ bouge ». Tenir sa hauteur n'est pas sonner.
    const v = voixDuGlissando([60, 64, 67], [63, 66, 70, 73]);
    expect(v.map((x) => x.auDepart)).toEqual([true, true, true, false]);
    expect(v.map((x) => x.aLArrivee)).toEqual([true, true, true, true]);
    const w = voixDuGlissando([60, 63, 67, 70], [60, 64, 67]);
    expect(w.map((x) => x.auDepart)).toEqual([true, true, true, true]);
    expect(w.map((x) => x.aLArrivee)).toEqual([true, true, true, false]);
  });

  it("LA PRÉSENCE SE DÉPLACE SUR LE GLISSEMENT, et non d'un coup", () => {
    const entrante = { de: 73, vers: 73, auDepart: false, aLArrivee: true };
    expect(presenceA(entrante, 0)).toBe(0);
    expect(presenceA(entrante, 0.5)).toBe(0.5);
    expect(presenceA(entrante, 1)).toBe(1);
    const sortante = { de: 73, vers: 73, auDepart: true, aLArrivee: false };
    expect(presenceA(sortante, 0)).toBe(1);
    expect(presenceA(sortante, 1)).toBe(0);
    expect(presenceA(tenue(60, 64), 0.3)).toBe(1);
  });

  it("UNE VOIX QUI TIENT SUR PLACE NE GLISSE PAS, à aucun instant du trajet", () => {
    const v = voixDuGlissando([60, 64, 67], [62]);
    for (const part of [0, 0.25, 0.5, 0.75, 1]) {
      expect(hauteurA(v[1], part), `voix 1 à ${part}`).toBe(64);
      expect(hauteurA(v[2], part), `voix 2 à ${part}`).toBe(67);
    }
  });

  it("deux agrégats vides ne font aucune voix", () => {
    expect(voixDuGlissando([], [])).toEqual([]);
  });
});

describe("le glissement est linéaire en demi-tons", () => {
  it("À MI-CHEMIN D'UNE OCTAVE, LA VOIX EST AU TRITON", () => {
    const v = tenue(60, 72);
    expect(hauteurA(v, 0.5)).toBe(66);
    // En hertz, elle y serait à 60 + 12·log2(1,5) soit 67,02 : ce n'est pas la même musique.
    const enHertz = frequenceDe(60) + (frequenceDe(72) - frequenceDe(60)) * 0.5;
    const enDemiTons = frequenceDe(hauteurA(v, 0.5));
    expect(enHertz).toBeGreaterThan(enDemiTons);
    expect(69 + 12 * Math.log2(enHertz / 440)).toBeCloseTo(67.02, 1);
  });

  it("CHAQUE QUART DU TRAJET VAUT LE MÊME INTERVALLE", () => {
    const v = tenue(60, 72);
    const pas = [0, 0.25, 0.5, 0.75, 1].map((p) => hauteurA(v, p));
    const ecarts = pas.slice(1).map((h, i) => h - pas[i]);
    for (const e of ecarts) expect(e).toBeCloseTo(3, 10);
  });

  it("LES BORNES SONT EXACTES, et une part hors du trajet est ramenée dedans", () => {
    const v = tenue(55, 71.5);
    expect(hauteurA(v, 0)).toBe(55);
    expect(hauteurA(v, 1)).toBe(71.5);
    expect(hauteurA(v, -3)).toBe(55);
    expect(hauteurA(v, 9)).toBe(71.5);
  });

  it("LE MICROTON PASSE, une hauteur d'arrivée à virgule restant à virgule", () => {
    expect(hauteurA(tenue(60, 63.5), 1)).toBe(63.5);
    expect(hauteurA(tenue(60, 63.5), 0.5)).toBe(61.75);
  });
});

describe("les tenues encadrent le glissement", () => {
  it("L'AGRÉGAT DE DÉPART EST TENU AVANT, CELUI D'ARRIVÉE APRÈS", () => {
    expect(partDuGlissement(0, 1, 2)).toBe(0);
    expect(partDuGlissement(1, 1, 2)).toBe(0);
    expect(partDuGlissement(2, 1, 2)).toBe(0.5);
    expect(partDuGlissement(3, 1, 2)).toBe(1);
    expect(partDuGlissement(9, 1, 2)).toBe(1);
  });

  it("un glissement de durée nulle bascule d'un agrégat à l'autre", () => {
    expect(partDuGlissement(1, 1, 0)).toBe(0);
    expect(partDuGlissement(1.001, 1, 0)).toBe(1);
  });
});

describe("le son produit", () => {
  const crete = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  it("A LA LONGUEUR DES TROIS PARTIES RÉUNIES", () => {
    const x = echantillonsDuGlissando([tenue(60, 72)], OPTIONS);
    expect(x.length).toBe(Math.round(0.6 * OPTIONS.sampleRate));
  });

  it("N'ÉCRÊTE PAS, MÊME À SEPT VOIX ET HUIT PARTIELS", () => {
    const sept = voixDuGlissando([48, 52, 55, 58, 62, 65, 69], [50, 53, 57, 60, 64, 67, 71]);
    const x = echantillonsDuGlissando(sept, { ...OPTIONS, richesse: 8, niveau: 1 });
    expect(crete(x)).toBeLessThanOrEqual(1);
    // Et il reste du son : un gain trop prudent vaudrait un silence.
    expect(crete(x)).toBeGreaterThan(0.2);
  });

  it("NE CLAQUE À AUCUN BORD, le fondu tenant les extrémités à zéro", () => {
    const x = echantillonsDuGlissando([tenue(60, 72)], OPTIONS);
    expect(Math.abs(x[0])).toBeLessThan(0.01);
    expect(Math.abs(x[x.length - 1])).toBeLessThan(0.01);
    // Le saut le plus grand d'un échantillon à l'autre reste petit : c'est ce qui définit l'absence
    // de clic. Un bord franc vaudrait un saut de l'ordre de la crête.
    let saut = 0;
    for (let i = 1; i < x.length; i++) saut = Math.max(saut, Math.abs(x[i] - x[i - 1]));
    expect(saut).toBeLessThan(crete(x) / 2);
  });

  it("LA VOIX GLISSE VRAIMENT : sa fréquence change entre le début et la fin", () => {
    // Un passage par zéro compté sur une fenêtre donne la fréquence qui y règne.
    const o = { ...OPTIONS, tenueDepart: 0.2, glissement: 0.6, tenueArrivee: 0.2, richesse: 1 };
    const x = echantillonsDuGlissando([tenue(57, 69)], o);
    const frequenceSur = (debut: number, fin: number) => {
      let passages = 0;
      const a = Math.round(debut * o.sampleRate);
      const b = Math.round(fin * o.sampleRate);
      for (let i = a + 1; i < b; i++) if (x[i - 1] < 0 && x[i] >= 0) passages++;
      return passages / (fin - debut);
    };
    // La 3 vaut 220 Hz, le la 4 en vaut 440 : une octave parcourue.
    expect(frequenceSur(0.05, 0.19)).toBeGreaterThan(200);
    expect(frequenceSur(0.05, 0.19)).toBeLessThan(240);
    expect(frequenceSur(0.85, 0.99)).toBeGreaterThan(410);
    expect(frequenceSur(0.85, 0.99)).toBeLessThan(470);
  });

  it("UNE VOIX QUI TIENT SUR PLACE GARDE SA FRÉQUENCE D'UN BOUT À L'AUTRE", () => {
    const o = { ...OPTIONS, tenueDepart: 0.1, glissement: 0.6, tenueArrivee: 0.1, richesse: 1 };
    const x = echantillonsDuGlissando([tenue(69, 69)], o);
    const passagesSur = (debut: number, fin: number) => {
      let p = 0;
      for (let i = Math.round(debut * o.sampleRate) + 1; i < Math.round(fin * o.sampleRate); i++) {
        if (x[i - 1] < 0 && x[i] >= 0) p++;
      }
      return p / (fin - debut);
    };
    expect(passagesSur(0.05, 0.3)).toBeCloseTo(passagesSur(0.5, 0.75), -1);
  });

  it("L'AGRÉGAT DE DÉPART EST LE MÊME, QUELLE QUE SOIT L'ARRIVÉE", () => {
    // LE DÉFAUT RELEVÉ PAR FABIEN, tenu par les échantillons eux-mêmes : « si je fixe un point de
    // départ et que je fais bouger le point d'arrivée, à l'oreille le point de départ bouge ».
    // Son exemple : un do majeur vers un do majeur, puis vers un mi bémol mineur septième.
    const o = { ...OPTIONS, tenueDepart: 0.3, glissement: 0.4, tenueArrivee: 0.2, richesse: 1 };
    const doMajeur = [60, 64, 67];
    const versLuiMeme = echantillonsDuGlissando(voixDuGlissando(doMajeur, doMajeur), o);
    const versMibM7 = echantillonsDuGlissando(voixDuGlissando(doMajeur, [63, 66, 70, 73]), o);

    // Pendant la tenue de départ, bien après le fondu d'entrée, les deux sons sont identiques.
    const a = Math.round(0.1 * o.sampleRate);
    const b = Math.round(0.29 * o.sampleRate);
    let ecartMax = 0;
    for (let i = a; i < b; i++) ecartMax = Math.max(ecartMax, Math.abs(versLuiMeme[i] - versMibM7[i]));
    expect(ecartMax, "la tenue de départ dépend de l'agrégat d'arrivée").toBeLessThan(1e-6);
  });

  it("ET SON NIVEAU NE DÉPEND PAS DU NOMBRE DE VOIX D'EN FACE", () => {
    // La seconde moitié du défaut : le gain divisait par le nombre TOTAL de voix, si bien qu'une
    // triade tenue sonnait plus faible quand l'agrégat d'arrivée en comptait davantage.
    const o = { ...OPTIONS, tenueDepart: 0.3, glissement: 0.4, tenueArrivee: 0.2, richesse: 1 };
    const crete = (x: Float32Array, de: number, a: number) => {
      let m = 0;
      for (let i = Math.round(de * o.sampleRate); i < Math.round(a * o.sampleRate); i++) m = Math.max(m, Math.abs(x[i]));
      return m;
    };
    const doMajeur = [60, 64, 67];
    const seul = crete(echantillonsDuGlissando(voixDuGlissando(doMajeur, doMajeur), o), 0.1, 0.29);
    const versSept = crete(
      echantillonsDuGlissando(voixDuGlissando(doMajeur, [55, 58, 62, 65, 69, 72, 76]), o), 0.1, 0.29,
    );
    expect(Math.abs(seul - versSept), "le niveau du départ dépend de l'arrivée").toBeLessThan(1e-6);
  });

  it("UNE VOIX QUI ENTRE NE CLAQUE PAS, sa présence se déplaçant sur le glissement", () => {
    const o = { ...OPTIONS, tenueDepart: 0.2, glissement: 0.5, tenueArrivee: 0.2, richesse: 1 };
    const x = echantillonsDuGlissando(voixDuGlissando([60], [60, 67]), o);
    let saut = 0;
    for (let i = 1; i < x.length; i++) saut = Math.max(saut, Math.abs(x[i] - x[i - 1]));
    const crete = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(saut).toBeLessThan(crete / 2);
  });

  it("aucune voix ne fait aucun son, et le tampon a tout de même sa longueur", () => {
    const x = echantillonsDuGlissando([], OPTIONS);
    expect(x.length).toBe(Math.round(0.6 * OPTIONS.sampleRate));
    expect(crete(x)).toBe(0);
  });
});
