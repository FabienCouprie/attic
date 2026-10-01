// audio/paradoxe-triton.test.ts — Le stimulus est-il vraiment indécidable ?
//
// CE QUE CE FICHIER DOIT PROUVER, ET POURQUOI C'EST LE CŒUR DU SUJET. Le paradoxe ne tient qu'à une
// chose : que RIEN DANS LE SIGNAL ne dise le sens du mouvement. Deux propriétés l'assurent, et elles
// se vérifient l'une et l'autre par la mesure.
//
//   — l'enveloppe des amplitudes NE SUIT PAS la classe de hauteur : si elle la suivait, la seconde
//     note serait spectralement plus haute ou plus basse que la première, et le timbre trancherait ;
//   — le triton est la MOITIÉ EXACTE d'une octave : la seconde classe est à six demi-tons dans un
//     sens comme dans l'autre.
//
// Un stimulus qui manquerait l'une des deux sonnerait comme un intervalle ordinaire, et l'on
// n'entendrait plus qu'une montée ou une descente, la même pour tout le monde.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import {
  classeAuTriton, composantesDuTon, echantillonsDeLaPaire, echantillonsDuTon, NOMS_DE_CLASSE,
} from "./paradoxe-triton";

const REGLAGES = { composantes: 6, centre: 523, largeur: 1 };

describe("le son à octaves", () => {
  it("EMPILE SES COMPOSANTES PAR OCTAVES, et pas autrement", () => {
    const c = composantesDuTon({ ...REGLAGES, classe: 0 });
    expect(c.length).toBe(6);
    for (let k = 1; k < c.length; k++) {
      expect(c[k].frequence / c[k - 1].frequence).toBeCloseTo(2, 6);
    }
  });

  it("ET SA CLASSE DE HAUTEUR EST CELLE QU'ON DEMANDE", () => {
    // Un demi-ton au-dessus de do : le rapport des fréquences vaut la racine douzième de deux.
    const doo = composantesDuTon({ ...REGLAGES, classe: 0 });
    const doD = composantesDuTon({ ...REGLAGES, classe: 1 });
    expect(doD[0].frequence / doo[0].frequence).toBeCloseTo(Math.pow(2, 1 / 12), 6);
  });

  it("L'ENVELOPPE NE SUIT PAS LA CLASSE, et c'est ce qui prive le son d'octave", () => {
    // LA PROPRIÉTÉ QUI FAIT LE PARADOXE. Le barycentre du spectre, en octaves, doit rester le même
    // d'une classe à l'autre : s'il se déplaçait, la seconde note d'une paire serait spectralement
    // plus haute ou plus basse, et le sens du mouvement serait donné par le timbre.
    const centreDeGravite = (classe: number) => {
      const c = composantesDuTon({ ...REGLAGES, classe });
      const poids = c.reduce((s, x) => s + x.amplitude, 0);
      return c.reduce((s, x) => s + Math.log2(x.frequence) * x.amplitude, 0) / poids;
    };
    const tous = Array.from({ length: 12 }, (_, i) => centreDeGravite(i));
    const ecart = Math.max(...tous) - Math.min(...tous);
    // MESURÉ : 0,0237 octave entre les douze classes, soit un quart de demi-ton. C'est le résidu
    // qu'aucune construction ne supprime, la grille des composantes glissant sous une enveloppe qui
    // ne bouge pas ; Deutsch déplace le sommet de l'enveloppe d'un essai à l'autre pour montrer que
    // la réponse ne le suit pas. Le seuil est posé au double du relevé : il laisse passer ce résidu
    // et arrête tout empilement qui recommencerait à suivre la classe, lequel donnait 0,37.
    expect(ecart).toBeLessThan(0.05);
  });

  it("ET LES AMPLITUDES SONT NORMALISÉES, faute de quoi le niveau désignerait le sens", () => {
    for (let classe = 0; classe < 12; classe++) {
      const somme = composantesDuTon({ ...REGLAGES, classe }).reduce((s, c) => s + c.amplitude, 0);
      expect(somme, `classe ${NOMS_DE_CLASSE[classe]}`).toBeCloseTo(1, 6);
    }
  });

  it("UNE ENVELOPPE ÉTROITE REDONNE UNE OCTAVE, ce qui lève le paradoxe", () => {
    // Le réglage a donc un effet, et la notice le dit : resserrée, l'enveloppe ne laisse qu'une ou
    // deux composantes, et le son retrouve une hauteur absolue.
    const large = composantesDuTon({ ...REGLAGES, classe: 0, largeur: 2 });
    const etroite = composantesDuTon({ ...REGLAGES, classe: 0, largeur: 0.3 });
    const dominante = (c: { amplitude: number }[]) => Math.max(...c.map((x) => x.amplitude));
    expect(dominante(etroite)).toBeGreaterThan(dominante(large) * 2);
  });
});

describe("la paire au triton", () => {
  it("VA À SIX DEMI-TONS, ce qui est la même chose en montant et en descendant", () => {
    for (let classe = 0; classe < 12; classe++) {
      const suivante = classeAuTriton(classe);
      const enMontant = (suivante - classe + 12) % 12;
      const enDescendant = (classe - suivante + 12) % 12;
      expect(enMontant, `classe ${NOMS_DE_CLASSE[classe]}`).toBe(6);
      expect(enDescendant, `classe ${NOMS_DE_CLASSE[classe]}`).toBe(6);
    }
  });

  it("ET REVIENT SUR ELLE-MÊME : deux tritons font une octave", () => {
    for (let classe = 0; classe < 12; classe++) {
      expect(classeAuTriton(classeAuTriton(classe))).toBe(classe);
    }
  });

  it("SE REND EN DEUX SONS À LA SUITE, du bon nombre d'échantillons", () => {
    const x = echantillonsDeLaPaire({
      ...REGLAGES, classe: 0, duree: 0.4, silence: 0.1, niveau: 0.7, sampleRate: 8000,
    });
    expect(x.length).toBe(Math.round(0.4 * 8000) * 2 + Math.round(0.1 * 8000));
    // Le silence du milieu est bien silencieux.
    const milieu = Math.round(0.4 * 8000) + Math.round(0.05 * 8000);
    expect(Math.abs(x[milieu])).toBeLessThan(1e-6);
  });

  it("ET LE SON PORTE BIEN L'ÉNERGIE AUX FRÉQUENCES ANNONCÉES", () => {
    // La preuve par le signal : chaque composante annoncée se retrouve dans le rendu, et une
    // fréquence intercalée d'un demi-ton n'y est pas.
    const sr = 16000;
    const c = composantesDuTon({ ...REGLAGES, classe: 0 }).filter((x) => x.frequence < sr / 2);
    const x = echantillonsDuTon(c, 0.5, 1, sr);
    const goertzel = (hz: number) => {
      const w = (2 * Math.PI * hz) / sr;
      const k = 2 * Math.cos(w);
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < x.length; i++) { const s = x[i] + k * s1 - s2; s2 = s1; s1 = s; }
      return s1 * s1 + s2 * s2 - k * s1 * s2;
    };
    const forte = c.reduce((m, y) => Math.max(m, y.amplitude), 0);
    const laPlusForte = c.find((y) => y.amplitude === forte)!;
    expect(goertzel(laPlusForte.frequence))
      .toBeGreaterThan(goertzel(laPlusForte.frequence * Math.pow(2, 1 / 12)) * 10);
  });
});
