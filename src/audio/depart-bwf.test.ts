// audio/depart-bwf.test.ts — L'heure d'enregistrement qui voyage avec le son, et quand elle se perd.
//
// CE QUE CES CAS GARDENT. Une heure attachée à un tampon se transmet aux tampons qu'un composant
// fabrique à partir de lui. C'est ce qui permet au Montage de replacer deux prises l'une par
// rapport à l'autre même lorsqu'un effet s'intercale. Mais une heure transmise à tort est pire que
// pas d'heure du tout : elle ne se voit pas, et elle place un son là où il n'a jamais été. Les cas
// ci-dessous tiennent donc surtout les REFUS.
import { describe, expect, it } from "vitest";
import { decalagesDepuisDeparts, departDe, heriterDepart, poserDepart } from "./depart-bwf";

/** Un faux tampon : seules la longueur et la fréquence décident de l'héritage. */
const tampon = (length = 48_000, sampleRate = 48_000) =>
  ({ length, sampleRate, numberOfChannels: 2 }) as unknown as AudioBuffer;

describe("l'heure attachée à un tampon", () => {
  it("se pose et se relit", () => {
    const t = tampon();
    expect(poserDepart(t, 37_800)).toBe(t);
    expect(departDe(t)).toBe(37_800);
  });

  it("UN DÉPART À ZÉRO N'EST PAS UN DÉPART, et ne s'attache pas", () => {
    // La norme fait remplir le champ même sans horloge : la plupart des fichiers de studio y
    // laissent zéro. L'attacher ferait caler des pistes sur un remplissage.
    expect(departDe(poserDepart(tampon(), 0))).toBeUndefined();
    expect(departDe(poserDepart(tampon(), -1))).toBeUndefined();
    expect(departDe(poserDepart(tampon(), NaN))).toBeUndefined();
  });

  it("et rien n'est lu sur ce qui n'est pas un objet", () => {
    expect(departDe(null)).toBeUndefined();
    expect(departDe(42)).toBeUndefined();
    expect(departDe(undefined)).toBeUndefined();
  });
});

describe("l'héritage par un composant", () => {
  it("transmet quand rien du temps n'a bougé", () => {
    const entree = poserDepart(tampon(), 37_800);
    const sortie = tampon();
    heriterDepart([sortie], [entree]);
    expect(departDe(sortie)).toBe(37_800);
  });

  it("REFUSE QUAND LA DURÉE A CHANGÉ : on a rogné ou rallongé, le premier échantillon a bougé", () => {
    const entree = poserDepart(tampon(48_000), 37_800);
    const rognee = tampon(24_000);
    heriterDepart([rognee], [entree]);
    expect(departDe(rognee)).toBeUndefined();
  });

  it("REFUSE QUAND LA FRÉQUENCE A CHANGÉ : on a étiré, une seconde ne vaut plus une seconde", () => {
    const entree = poserDepart(tampon(48_000, 48_000), 37_800);
    const etiree = tampon(48_000, 44_100);
    heriterDepart([etiree], [entree]);
    expect(departDe(etiree)).toBeUndefined();
  });

  it("REFUSE QUAND DEUX ENTRÉES PORTENT UNE HEURE : rien ne dit laquelle le mélange adopte", () => {
    const a = poserDepart(tampon(), 37_800);
    const b = poserDepart(tampon(), 40_000);
    const melange = tampon();
    heriterDepart([melange], [a, b]);
    expect(departDe(melange)).toBeUndefined();
  });

  it("ne touche pas une sortie qui porte déjà la sienne", () => {
    const entree = poserDepart(tampon(), 37_800);
    const sortie = poserDepart(tampon(), 1_000);
    heriterDepart([sortie], [entree]);
    expect(departDe(sortie)).toBe(1_000);
  });

  it("et ne fait rien quand aucune entrée n'en porte", () => {
    const sortie = tampon();
    heriterDepart([sortie], [tampon(), null, "texte"]);
    expect(departDe(sortie)).toBeUndefined();
  });
});

describe("les décalages entre pistes", () => {
  it("LA PLUS ANCIENNE DONNE L'ORIGINE, et non minuit", () => {
    // Une prise de 10 h 30 placée à 37 800 secondes sortirait de toute ligne de temps, et le
    // réglage de départ du Montage ne va que jusqu'à 3 600. Ce qui compte est l'ÉCART.
    const d = decalagesDepuisDeparts(new Map([[0, 37_800], [1, 37_812.5], [2, 37_805]]));
    expect(d.get(0)).toBe(0);
    expect(d.get(1)).toBe(12.5);
    expect(d.get(2)).toBe(5);
  });

  it("l'ordre des pistes ne décide de rien : c'est l'heure qui fait l'origine", () => {
    const d = decalagesDepuisDeparts(new Map([[0, 100], [1, 40]]));
    expect(d.get(1)).toBe(0);
    expect(d.get(0)).toBe(60);
  });

  it("UNE SEULE PISTE DATÉE NE DÉCALE RIEN, faute de quoi la comparer", () => {
    // La poser à zéro reviendrait à annoncer un calage qui n'a pas eu lieu.
    expect(decalagesDepuisDeparts(new Map([[0, 37_800]])).size).toBe(0);
    expect(decalagesDepuisDeparts(new Map()).size).toBe(0);
  });
});
