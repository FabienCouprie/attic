// audio/suites-entieres.test.ts — Un invariant publié par suite, et il doit se retrouver.
//
// POURQUOI CES CAS SONT CE QU'ILS SONT. « Ça sonne mathématique » ne prouverait rien, et c'est le
// piège de toute sonification : n'importe quelle suite de nombres fait des notes. Ce qui prouve
// qu'une suite est calculée juste est qu'une propriété PUBLIÉE d'elle se retrouve dans ce qui sort.
// Chaque suite de la table porte donc ici son invariant, et le rapport du module en rend un qui
// vaut pour toutes, la période trouvée dans la suite des notes.
import { describe, expect, it } from "vitest";
import {
  OEIS, SUITES, decimalesDePi, fibonacci, notesDeSuite, periodeDePisano, periodeDesNotes,
  premiers, recaman, suiteDeNorgard, syracuse, thueMorse,
} from "./suites-entieres";
import { terme as termeNorgard } from "./norgard";

const NOTES = {
  moduloHauteur: 88, decalageHauteur: 21, moduloDuree: 1, decalageDuree: 1, noireSec: 0.5,
};

describe("les suites entières", () => {
  it("LA TABLE EST COMPLÈTE : chaque suite a sa référence dans l'Encyclopédie", () => {
    for (const s of SUITES) {
      expect(OEIS[s], `${s} doit citer sa suite`).toMatch(/^A\d{6}$/);
    }
    expect(new Set(Object.values(OEIS)).size, "deux suites ne citent pas la même référence")
      .toBe(SUITES.length);
  });

  it("FIBONACCI : SON INVARIANT EST LA PÉRIODE DE PISANO, et elle est publiée", () => {
    // Les seize premières, relevées sur l'Encyclopédie et sur MathWorld.
    expect(Array.from({ length: 16 }, (_, k) => periodeDePisano(k + 1)))
      .toEqual([1, 3, 8, 6, 20, 24, 16, 12, 24, 60, 10, 24, 28, 48, 40, 24]);
    // Lagrange, 1774 : le dernier chiffre se répète toutes les soixante fois.
    expect(periodeDePisano(10)).toBe(60);
    // Et le modulo de 88, qui est celui des touches d'un piano, a la même période.
    expect(periodeDePisano(88)).toBe(60);
    expect(periodeDePisano(128)).toBe(192);
    // Le modulo de un est dégénéré : il rend un, sans boucler.
    expect(periodeDePisano(1)).toBe(1);
    expect(periodeDePisano(0)).toBe(1);
  });

  it("ET LA PÉRIODE SE RETROUVE DANS LES NOTES RENDUES, ce qui est le témoin", () => {
    for (const modulo of [10, 12, 88, 128]) {
      const attendue = periodeDePisano(modulo);
      // Trois périodes de termes, pour que la répétition tienne deux fois pleines.
      const termes = fibonacci(3 * attendue);
      const { rapport } = notesDeSuite(termes, { ...NOTES, moduloHauteur: modulo, decalageHauteur: 0 });
      expect(rapport.periode, `modulo ${modulo} : période ${rapport.periode} pour ${attendue}`)
        .toBe(attendue);
    }
  });

  it("FIBONACCI SORT DE LA PRÉCISION EXACTE DU DOUBLE AU RANG 79, et c'est pour cela qu'il est en entiers exacts", () => {
    const f = fibonacci(80);
    // Les rangs comptent depuis zéro : F(0) vaut zéro, F(1) un.
    expect(f[78].toString()).toBe("8944394323791464");
    expect(f[79].toString()).toBe("14472334024676221");
    const LIMITE = 2n ** 53n;
    expect(f[78] < LIMITE, "F(78) tient encore dans la précision exacte").toBe(true);
    expect(f[79] > LIMITE, "F(79) la dépasse").toBe(true);
    // ET LE DOUBLE S'Y TROMPE DÉJÀ, d'exactement un.
    //
    // LA COMPARAISON SE FAIT SUR L'ENTIER EXACT, non sur sa conversion en double : une première
    // version comparait le calcul flottant à `Number(f[79])`, et les deux tombaient d'accord sur
    // 14472334024676220 parce que la conversion arrondit la valeur exacte de la même façon. On
    // comparait donc deux arrondis, ce qui ne pouvait rien montrer.
    let a = 0;
    let b = 1;
    for (let i = 0; i < 79; i++) { const s = a + b; a = b; b = s; }
    expect(BigInt(a)).not.toBe(f[79]);
    expect((f[79] - BigInt(a)).toString(), "le double est faux d'exactement un").toBe("1");
  });

  it("LES DÉCIMALES DE PI SONT CELLES QU'ON CONNAÎT, sur cinquante rangs", () => {
    const attendu = "31415926535897932384626433832795028841971693993751";
    expect(decimalesDePi(50).join("")).toBe(attendu);
    // ET LE CALCUL TIENT AU MILLIER, éprouvé sur le point de Feynman : six neuf de suite à partir
    // de la 762e décimale. C'est l'ancre la plus citée du développement, et elle est vérifiable
    // ailleurs, là où le millième chiffre que j'avais d'abord annoncé venait de ma mémoire et était
    // faux.
    const mille = decimalesDePi(1000);
    expect(mille.length).toBe(1000);
    expect(mille.slice(762, 768).join("")).toBe("999999");
    // Et les chiffres sont des chiffres, tous les mille.
    for (const c of mille) expect(Number(c)).toBeGreaterThanOrEqual(0);
    for (const c of mille) expect(Number(c)).toBeLessThanOrEqual(9);
  });

  it("ET ELLES N'ONT PAS DE PÉRIODE, là où celles d'un rationnel en ont une", () => {
    // C'est le cas de contrôle, et c'est un théorème : un rationnel a un développement périodique,
    // et pi est conjecturé normal. Sans ce contrôle, l'absence de période ne prouverait rien.
    const { rapport } = notesDeSuite(decimalesDePi(400), { ...NOTES, moduloHauteur: 10, decalageHauteur: 60 });
    expect(rapport.periode, "aucune période ne doit se trouver dans les décimales de pi").toBe(0);
    // Un septième donne 142857 sans fin, de période six.
    const septieme = "142857".repeat(40).split("").map((c) => BigInt(c));
    const r7 = notesDeSuite(septieme, { ...NOTES, moduloHauteur: 10, decalageHauteur: 60 });
    expect(r7.rapport.periode).toBe(6);
    // Un tiers donne un seul chiffre répété, de période un.
    const tiers = Array.from({ length: 40 }, () => 3n);
    expect(notesDeSuite(tiers, NOTES).rapport.periode).toBe(1);
  });

  it("SYRACUSE : 27 PREND 111 PAS ET CULMINE À 9232, les deux chiffres étant publiés", () => {
    const t = syracuse(27, 10000);
    // La trajectoire compte le départ, donc 111 pas font 112 termes.
    expect(t.length).toBe(112);
    expect(t[0].toString()).toBe("27");
    expect(t[t.length - 1].toString()).toBe("1");
    const pic = t.reduce((m, v) => (v > m ? v : m), 0n);
    expect(pic.toString()).toBe("9232");
    // ET LE PIC N'EST PAS LE NOMBRE DE PAS : les deux diffèrent de deux ordres de grandeur, et les
    // confondre est l'erreur que ce cas écarte.
    expect(Number(pic)).toBeGreaterThan(80 * (t.length - 1));
  });

  it("ET LES PLUS LONGS TRAJETS SOUS MILLE SONT CEUX QU'ON CONNAÎT", () => {
    const pas = (n: number) => syracuse(n, 10000).length - 1;
    expect(pas(871)).toBe(178);
    expect(pas(937)).toBe(173);
    expect(pas(703)).toBe(170);
    expect(pas(775)).toBe(152);
    expect(pas(1)).toBe(0);
    expect(pas(2)).toBe(1);
  });

  it("LES PREMIERS SONT LES PREMIERS, et il y en a 168 sous mille", () => {
    expect(premiers(20).map((v) => Number(v)))
      .toEqual([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71]);
    const sousMille = premiers(168);
    expect(Number(sousMille[167])).toBe(997);
    expect(Number(premiers(169)[168])).toBeGreaterThan(1000);
    // Le mille-et-unième premier vaut 7927, ce qui éprouve la borne du crible bien au-delà.
    expect(Number(premiers(1001)[1000])).toBe(7927);
  });

  it("THUE-MORSE EST AUTOSIMILAIRE PAR DOUBLEMENT, et sans cube", () => {
    const t = thueMorse(512).map((v) => Number(v));
    expect(t.slice(0, 16)).toEqual([0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0]);
    // Le terme de rang deux n vaut celui de rang n, celui de rang deux n plus un son complément.
    for (let n = 0; n < 256; n++) {
      expect(t[2 * n], `rang ${2 * n}`).toBe(t[n]);
      expect(t[2 * n + 1], `rang ${2 * n + 1}`).toBe(1 - t[n]);
    }
    // SANS CUBE : aucun bloc n'y apparaît trois fois de suite.
    for (let p = 1; p <= 40; p++) {
      for (let i = 0; i + 3 * p <= t.length; i++) {
        const un = t.slice(i, i + p).join("");
        const deux = t.slice(i + p, i + 2 * p).join("");
        const trois = t.slice(i + 2 * p, i + 3 * p).join("");
        expect(un === deux && deux === trois, `cube de longueur ${p} au rang ${i}`).toBe(false);
      }
    }
  });

  it("RECAMÁN RECULE SI ELLE PEUT, et ses premiers termes sont connus", () => {
    expect(recaman(18).map((v) => Number(v)))
      .toEqual([0, 1, 3, 6, 2, 7, 13, 20, 12, 21, 11, 22, 10, 23, 9, 24, 8, 25]);
    // CHAQUE PAS VAUT EXACTEMENT SON RANG, en avant ou en arrière : c'est la règle même.
    const r = recaman(500).map((v) => Number(v));
    for (let k = 1; k < r.length; k++) {
      expect(Math.abs(r[k] - r[k - 1]), `pas ${k}`).toBe(k);
    }
    // ET ELLE REVIENT SUR SES PAS, ce que j'avais affirmé impossible et qui est faux. La règle
    // n'interdit de retomber sur une valeur déjà vue que lorsqu'on RECULE ; en avançant, rien ne
    // l'empêche, et 42 y figure deux fois dès les premiers rangs. Sur cinq cents termes, il n'y en
    // a que 401 de distincts.
    expect(new Set(r).size).toBe(401);
    expect(new Set(r).size).toBeLessThan(r.length);
    // Et le recul n'est pris que s'il est permis : positif et jamais vu.
    const vus = new Set<number>([0]);
    for (let k = 1; k < r.length; k++) {
      const arriere = r[k - 1] - k;
      const permis = arriere > 0 && !vus.has(arriere);
      expect(r[k], `rang ${k}`).toBe(permis ? arriere : r[k - 1] + k);
      vus.add(r[k]);
    }
  });

  it("NØRGÅRD EST LE TÉMOIN CROISÉ : la table s'accorde au module qui la porte déjà", () => {
    const parLaTable = suiteDeNorgard(256, termeNorgard).map((v) => Number(v));
    const parLeModule = Array.from({ length: 256 }, (_, k) => termeNorgard(k));
    expect(parLaTable).toEqual(parLeModule);
  });

  it("LA PÉRIODE N'EST DÉCLARÉE QUE SI ELLE TIENT DEUX FOIS", () => {
    // Sans cette condition, une coïncidence passerait pour une loi : une suite vue sur trois
    // termes se répète toujours de période trois.
    expect(periodeDesNotes([1, 2, 3])).toBe(0);
    expect(periodeDesNotes([1, 2, 3, 1, 2, 3])).toBe(3);
    expect(periodeDesNotes([1, 2, 3, 1, 2, 3, 1])).toBe(3);
    expect(periodeDesNotes([5, 5, 5, 5])).toBe(1);
    expect(periodeDesNotes([1, 2, 3, 4, 5, 6])).toBe(0);
  });

  it("LA CONVENTION DE L'OEIS EST RESPECTÉE DANS SES DEUX BORNES", () => {
    // Un décalage de 21 avec un modulo de 88 couvre les quatre-vingt-huit touches, de 21 à 108.
    const { notes } = notesDeSuite(Array.from({ length: 200 }, (_, k) => BigInt(k)), NOTES);
    for (const n of notes) {
      expect(n.note).toBeGreaterThanOrEqual(21);
      expect(n.note).toBeLessThanOrEqual(108);
    }
    // Le modulo de durée à un donne des notes toutes égales ; au-delà, elles varient.
    const egales = notesDeSuite(Array.from({ length: 20 }, (_, k) => BigInt(k)), NOTES).notes;
    const durees = new Set(egales.map((n) => +(n.fin - n.debut).toFixed(6)));
    expect(durees.size).toBe(1);
    const variees = notesDeSuite(Array.from({ length: 20 }, (_, k) => BigInt(k)),
      { ...NOTES, moduloDuree: 4 }).notes;
    expect(new Set(variees.map((n) => +(n.fin - n.debut).toFixed(6))).size).toBeGreaterThan(1);
  });

  it("UN TERME NÉGATIF RESTE SUR LE CLAVIER, le reste gardant le signe du dividende", () => {
    // Nørgård descend sous zéro, et un modulo naïf y rendrait une note hors clavier.
    const negatifs = [-1n, -5n, -87n, -88n, -89n, -1000n];
    const { notes } = notesDeSuite(negatifs, NOTES);
    for (const n of notes) {
      expect(n.note, `note ${n.note}`).toBeGreaterThanOrEqual(21);
      expect(n.note).toBeLessThanOrEqual(108);
    }
    // Et la suite de Nørgård elle-même, qui descend, tient sur le clavier.
    const norgard = notesDeSuite(suiteDeNorgard(512, termeNorgard), NOTES);
    for (const n of norgard.notes) expect(n.note).toBeGreaterThanOrEqual(21);
  });
});
