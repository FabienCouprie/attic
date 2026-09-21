// audio/multicanal.test.ts — Les propriétés qui font qu'un espace composé est juste.
//
// TROIS INVARIANTS COMMANDENT TOUT LE RESTE, et aucun ne se juge à l'oreille :
//  - la normalisation SN3D : pour toute direction, les composantes d'un même degré ont une somme
//    des carrés égale à un. Un coefficient faux à l'ordre deux ne s'entend presque pas — le champ
//    est seulement un peu tordu — et ce test l'attrape à coup sûr ;
//  - la puissance constante du panoramique : une source qui passe entre deux haut-parleurs ne doit
//    ni perdre ni gagner de puissance, faute de quoi l'on entend un trou au milieu ;
//  - l'ordre des canaux : il doit suivre l'ordre croissant des bits du masque WAV, sans quoi un
//    lecteur envoie le centre dans le caisson de graves.
import { describe, expect, it } from "vitest";
import {
  DISPOSITIONS, anneau, decoder, degreACN, dispositionDe, dispositionParId, etiqueter,
  gainsPourDirection, harmoniques, heriterDisposition, matriceDecodage, nombreDeCanaux,
  normaliserAzimut, rendreObjets, replierEnStereo, spatialiser, sphereVirtuelle, vbapPlan, versMono,
  type ObjetSonore,
} from "./multicanal";

const somme2 = (v: number[]) => v.reduce((s, x) => s + x * x, 0);
const directions: [number, number][] = [];
for (let az = -180; az < 180; az += 23) for (let el = -80; el <= 80; el += 20) directions.push([az, el]);

describe("les harmoniques sphériques (AmbiX)", () => {
  it("SN3D : POUR TOUTE DIRECTION, CHAQUE DEGRÉ A UNE SOMME DES CARRÉS ÉGALE À UN", () => {
    for (const [az, el] of directions) {
      const y = harmoniques(az, el, 3);
      expect(y).toHaveLength(16);
      for (let l = 0; l <= 3; l++) {
        const degre = y.filter((_, n) => degreACN(n) === l);
        expect(degre).toHaveLength(2 * l + 1);
        expect(somme2(degre), `az ${az} el ${el} degré ${l}`).toBeCloseTo(1, 9);
      }
    }
  });

  it("l'ordre ACN du premier degré est Y, Z, X, et W vaut un partout", () => {
    // Devant : X = 1 ; à gauche : Y = 1 ; au zénith : Z = 1.
    expect(harmoniques(0, 0, 1).map((v) => +v.toFixed(9))).toEqual([1, 0, 0, 1]);
    expect(harmoniques(90, 0, 1).map((v) => +v.toFixed(9))).toEqual([1, 1, 0, 0]);
    expect(harmoniques(0, 90, 1).map((v) => +v.toFixed(9))).toEqual([1, 0, 1, 0]);
    for (const [az, el] of directions) expect(harmoniques(az, el, 3)[0]).toBe(1);
  });

  it("le nombre de composantes suit l'ordre : (N + 1)²", () => {
    expect(harmoniques(10, 10, 0)).toHaveLength(1);
    expect(harmoniques(10, 10, 1)).toHaveLength(4);
    expect(harmoniques(10, 10, 2)).toHaveLength(9);
    expect(harmoniques(10, 10, 3)).toHaveLength(16);
  });
});

describe("le panoramique par vecteurs", () => {
  const plan = anneau(8);

  it("PUISSANCE CONSTANTE : la somme des carrés des gains vaut un, partout sur le cercle", () => {
    for (let az = -180; az < 180; az += 3.7) {
      expect(somme2(vbapPlan(az, plan)), `az ${az}`).toBeCloseTo(1, 9);
    }
  });

  it("UNE SOURCE SUR UN HAUT-PARLEUR NE SORT QUE PAR LUI", () => {
    for (const [k, h] of plan.entries()) {
      const g = vbapPlan(h.azimut, plan);
      expect(g[k], `haut-parleur ${h.nom}`).toBeCloseTo(1, 9);
      expect(g.filter((_, i) => i !== k).every((v) => Math.abs(v) < 1e-9)).toBe(true);
    }
  });

  it("UNE SOURCE ENTRE DEUX HAUT-PARLEURS NE SORT QUE PAR CES DEUX-LÀ", () => {
    const g = vbapPlan(0, plan); // pile entre les canaux 1 (+22,5°) et 2 (−22,5°)
    expect(g.filter((v) => v > 1e-9)).toHaveLength(2);
    expect(g[0]).toBeCloseTo(g[1], 9);
    expect(g[0]).toBeCloseTo(Math.SQRT1_2, 9);
  });

  it("aucun gain n'est jamais négatif", () => {
    for (let az = -180; az < 180; az += 1.3) for (const v of vbapPlan(az, plan)) expect(v).toBeGreaterThanOrEqual(-1e-12);
  });

  it("une disposition frontale seule panoramique quand même derrière, sans gain négatif", () => {
    const stereo = dispositionParId("stereo")!.hautParleurs;
    for (let az = -180; az < 180; az += 10) {
      const g = vbapPlan(az, stereo);
      expect(somme2(g)).toBeCloseTo(1, 9);
      for (const v of g) expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("les dispositions à canaux", () => {
  it("LE CAISSON DE GRAVES NE REÇOIT JAMAIS DE PANORAMIQUE", () => {
    for (const id of ["5.1", "7.1", "7.1.4"]) {
      const d = dispositionParId(id)!;
      const lfe = d.hautParleurs.findIndex((h) => h.lfe);
      expect(lfe).toBeGreaterThanOrEqual(0);
      for (const [az, el] of directions) expect(gainsPourDirection(d, az, el)[lfe]).toBe(0);
    }
  });

  it("puissance constante partout, hauteurs comprises, en 7.1.4", () => {
    const d = dispositionParId("7.1.4")!;
    for (const [az, el] of directions) expect(somme2(gainsPourDirection(d, az, el)), `az ${az} el ${el}`).toBeCloseTo(1, 9);
  });

  it("UNE SOURCE AU PLAFOND PASSE PAR LA COUCHE HAUTE, une source à l'horizon par la basse", () => {
    const d = dispositionParId("7.1.4")!;
    const hauts = d.hautParleurs.map((h, i) => (h.elevation > 0 ? i : -1)).filter((i) => i >= 0);
    const enHaut = gainsPourDirection(d, 0, 45);
    const aHorizon = gainsPourDirection(d, 0, 0);
    expect(somme2(hauts.map((i) => enHaut[i]))).toBeCloseTo(1, 9);
    expect(somme2(hauts.map((i) => aHorizon[i]))).toBeCloseTo(0, 9);
  });

  it("une source devant, en 5.1, sort par le centre seul", () => {
    const d = dispositionParId("5.1")!;
    const g = gainsPourDirection(d, 0, 0);
    expect(g[2]).toBeCloseTo(1, 9);
    expect(somme2(g.filter((_, i) => i !== 2))).toBeCloseTo(0, 9);
  });

  it("L'ORDRE DES CANAUX SUIT L'ORDRE CROISSANT DES BITS DU MASQUE", () => {
    // Le nombre de bits du masque égale le nombre de canaux, et le masque est non nul.
    for (const d of DISPOSITIONS.filter((x) => x.famille === "canaux")) {
      const bits = d.masque.toString(2).split("").filter((b) => b === "1").length;
      expect(bits, d.id).toBe(d.hautParleurs.length);
    }
    // Et en 7.1, les arrière (bits 0x10 et 0x20) précèdent les côtés (0x200 et 0x400).
    const noms = dispositionParId("7.1")!.hautParleurs.map((h) => h.nom);
    expect(noms).toEqual(["L", "R", "C", "LFE", "Lrs", "Rrs", "Lss", "Rss"]);
  });

  it("les anneaux et l'ambisonie n'ont pas de masque : aucun haut-parleur standard ne correspond", () => {
    for (const id of ["octo", "anneau-16", "foa", "hoa2", "hoa3"]) expect(dispositionParId(id)!.masque).toBe(0);
  });

  it("le nombre de canaux de chaque disposition", () => {
    const n = (id: string) => nombreDeCanaux(dispositionParId(id)!);
    expect([n("stereo"), n("quad"), n("5.1"), n("7.1"), n("7.1.4")]).toEqual([2, 4, 6, 8, 12]);
    expect([n("octo"), n("anneau-16"), n("foa"), n("hoa2"), n("hoa3")]).toEqual([8, 16, 4, 9, 16]);
  });

  it("l'anneau de huit se répartit tous les 45°, le canal un juste à gauche de l'axe", () => {
    const az = anneau(8).map((h) => h.azimut);
    expect(az[0]).toBeCloseTo(22.5, 9);
    expect(az[1]).toBeCloseTo(-22.5, 9);
    for (let i = 1; i < az.length; i++) {
      expect(Math.abs(normaliserAzimut(az[i] - az[i - 1]))).toBeCloseTo(45, 9);
    }
  });
});

describe("le décodage ambisonique", () => {
  it("UNE SOURCE ENCODÉE PUIS DÉCODÉE CULMINE SUR LE HAUT-PARLEUR LE PLUS PROCHE", () => {
    for (const ordre of [1, 2, 3]) {
      const cibles = anneau(16);
      for (const [k, h] of cibles.entries()) {
        const y = harmoniques(h.azimut, 0, ordre);
        const champ = y.map((v) => Float32Array.of(v));
        const s = decoder(champ, ordre, cibles).map((c) => c[0]);
        const max = s.indexOf(Math.max(...s));
        expect(max, `ordre ${ordre}, haut-parleur ${h.nom}`).toBe(k);
      }
    }
  });

  it("L'ORDRE SUPÉRIEUR LOCALISE MIEUX : l'énergie se concentre davantage autour de la source", () => {
    const cibles = anneau(16);
    const concentration = (ordre: number) => {
      const s = decoder(harmoniques(0, 0, ordre).map((v) => Float32Array.of(v)), ordre, cibles).map((c) => c[0] ** 2);
      const total = s.reduce((a, b) => a + b, 0);
      // La part d'énergie dans les quatre haut-parleurs les plus proches de l'axe.
      return (s[0] + s[1] + s[15] + s[2]) / total;
    };
    expect(concentration(3)).toBeGreaterThan(concentration(1));
  });

  it("le caisson de graves ne reçoit rien du décodeur", () => {
    const d = dispositionParId("5.1")!;
    const m = matriceDecodage(1, d.hautParleurs);
    expect(m[3].every((v) => v === 0)).toBe(true);
  });

  it("la sphère virtuelle compte vingt-six directions, sans doublon", () => {
    const s = sphereVirtuelle();
    expect(s).toHaveLength(26);
    const cles = new Set(s.map((h) => `${h.azimut.toFixed(3)}|${h.elevation.toFixed(3)}`));
    // Les deux pôles ont tous leurs azimuts confondus : on compte les directions, pas les angles.
    expect(cles.size).toBeGreaterThanOrEqual(24);
  });
});

describe("le rendu", () => {
  const SR = 48000;
  const sinus = (n: number) => Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / SR));

  it("UNE SOURCE IMMOBILE REND EXACTEMENT LES GAINS DU PANORAMIQUE", () => {
    const d = dispositionParId("quad")!;
    const x = sinus(1000);
    const out = spatialiser(x, d, { azimut: 45, elevation: 0 });
    expect(out).toHaveLength(4);
    for (let i = 0; i < x.length; i++) expect(out[0][i]).toBeCloseTo(x[i], 6);
    expect(out[1].every((v) => Math.abs(v) < 1e-9)).toBe(true);
  });

  it("UNE TRAJECTOIRE FAIT TOURNER LE SON : l'énergie passe d'un canal à l'autre", () => {
    const d = dispositionParId("octo")!;
    const n = SR;
    const x = sinus(n);
    // Un demi-tour, de devant-gauche vers derrière.
    const az = Float32Array.from({ length: n }, (_, i) => 22.5 + (135 * i) / (n - 1));
    const out = spatialiser(x, d, { azimut: az, elevation: 0 });
    const energie = (c: Float32Array, a: number, b: number) => { let s = 0; for (let i = a; i < b; i++) s += c[i] ** 2; return s; };
    // Au début, le canal un domine ; à la fin, il est silencieux.
    expect(energie(out[0], 0, n / 10)).toBeGreaterThan(energie(out[0], n - n / 10, n) * 100);
  });

  it("la puissance totale ne dépend pas de la direction", () => {
    const d = dispositionParId("7.1.4")!;
    const x = sinus(2000);
    const puissance = (az: number, el: number) =>
      spatialiser(x, d, { azimut: az, elevation: el }).reduce((s, c) => s + c.reduce((a, v) => a + v * v, 0), 0);
    const ref = puissance(0, 0);
    for (const [az, el] of [[37, 0], [-120, 20], [180, 45], [90, 10]]) expect(puissance(az, el) / ref).toBeCloseTo(1, 6);
  });

  it("la distance suit la loi en 1/r, et plafonne à la référence", () => {
    const d = dispositionParId("stereo")!;
    const x = sinus(1000);
    const pic = (dist: number) => Math.max(...spatialiser(x, d, { azimut: 30, elevation: 0, distance: dist })[0].map(Math.abs));
    expect(pic(2) / pic(1)).toBeCloseTo(0.5, 3);
    expect(pic(0.1)).toBeCloseTo(pic(1), 6);
  });

  it("DES OBJETS SE RENDENT DANS N'IMPORTE QUELLE DISPOSITION, sans rien réécrire", () => {
    const o: ObjetSonore = { genre: "objet-sonore", son: sinus(500), frequence: SR, trajectoire: { azimut: 90, elevation: 0 } };
    for (const d of DISPOSITIONS) {
      const out = rendreObjets([o], d);
      expect(out, d.id).toHaveLength(nombreDeCanaux(d));
      expect(out.some((c) => c.some((v) => Math.abs(v) > 0.1)), d.id).toBe(true);
    }
  });

  it("deux objets s'additionnent, et le plus long fixe la durée", () => {
    const d = dispositionParId("quad")!;
    const a: ObjetSonore = { genre: "objet-sonore", son: sinus(300), frequence: SR, trajectoire: { azimut: 45, elevation: 0 } };
    const b: ObjetSonore = { genre: "objet-sonore", son: sinus(700), frequence: SR, trajectoire: { azimut: 45, elevation: 0 } };
    const out = rendreObjets([a, b], d);
    expect(out[0].length).toBe(700);
    expect(out[0][100]).toBeCloseTo(2 * a.son[100], 6);
  });

  it("le mono est la moyenne des canaux", () => {
    expect(Array.from(versMono([Float32Array.of(1, 0), Float32Array.of(0, 1)]))).toEqual([0.5, 0.5]);
    expect(versMono([])).toHaveLength(0);
  });
});

describe("la disposition attachée au tampon", () => {
  const faux = (n: number) => ({ numberOfChannels: n });

  it("s'attache, se lit, et ne s'invente pas", () => {
    const t = etiqueter(faux(6), "5.1");
    expect(dispositionDe(t)?.id).toBe("5.1");
    expect(dispositionDe(faux(6))).toBeUndefined();
    expect(dispositionDe(null)).toBeUndefined();
  });

  it("UNE SORTIE DE MÊME NOMBRE DE CANAUX HÉRITE DE L'ÉTIQUETTE — c'est ce qui la fait voyager", () => {
    const entree = etiqueter(faux(12), "7.1.4");
    const sortie = faux(12);
    heriterDisposition([sortie], [entree]);
    expect(dispositionDe(sortie)?.id).toBe("7.1.4");
  });

  it("ELLE NE DEVINE JAMAIS À PARTIR DU SEUL NOMBRE : quatre canaux restent sans étiquette", () => {
    // Quadriphonie ou ambisonie d'ordre un : personne ne peut le savoir.
    const sortie = faux(4);
    heriterDisposition([sortie], [faux(4)]);
    expect(dispositionDe(sortie)).toBeUndefined();
  });

  it("un nombre différent n'hérite pas, et une étiquette posée n'est pas écrasée", () => {
    const entree = etiqueter(faux(6), "5.1");
    const reduite = faux(2);
    heriterDisposition([reduite], [entree]);
    expect(dispositionDe(reduite)).toBeUndefined();
    const deja = etiqueter(faux(6), "5.1");
    heriterDisposition([deja], [etiqueter(faux(6), "hoa2")]);
    expect(dispositionDe(deja)?.id).toBe("5.1");
  });
});

describe("le repliement stéréo de l'aperçu", () => {
  const SR = 48000;
  const x = Float32Array.from({ length: 2000 }, (_, i) => Math.sin(i / 7));
  const niveau = (c: Float32Array) => c.reduce((s, v) => s + v * v, 0);

  it("REND DEUX CANAUX, quelle que soit la disposition — c'est ce qui divise le poids par six à huit", () => {
    for (const d of DISPOSITIONS) {
      const plie = replierEnStereo(spatialiser(x, d, { azimut: 30, elevation: 0 }), d);
      expect(plie, d.id).toHaveLength(2);
      expect(plie[0]).toHaveLength(x.length);
      for (const c of plie) expect(c.every((v) => Number.isFinite(v)), d.id).toBe(true);
    }
  });

  it("UNE SOURCE À GAUCHE RESTE À GAUCHE, dans les quatre familles — ambisonie comprise", () => {
    for (const id of ["octo", "7.1.4", "quad", "foa", "hoa3"]) {
      const d = dispositionParId(id)!;
      const [g, dr] = replierEnStereo(spatialiser(x, d, { azimut: 70, elevation: 0 }), d);
      expect(niveau(g), id).toBeGreaterThan(niveau(dr) * 2);
      const [g2, dr2] = replierEnStereo(spatialiser(x, d, { azimut: -70, elevation: 0 }), d);
      expect(niveau(dr2), id).toBeGreaterThan(niveau(g2) * 2);
    }
  });

  it("le caisson de graves va aux deux oreilles, également", () => {
    const d = dispositionParId("5.1")!;
    const canaux = d.hautParleurs.map((h) => (h.lfe ? Float32Array.from(x) : new Float32Array(x.length)));
    const [g, dr] = replierEnStereo(canaux, d);
    expect(niveau(g)).toBeCloseTo(niveau(dr), 9);
    expect(niveau(g)).toBeGreaterThan(0);
  });

  it("une source devant se répartit également entre les deux côtés", () => {
    const d = dispositionParId("7.1")!;
    const [g, dr] = replierEnStereo(spatialiser(x, d, { azimut: 0, elevation: 0 }), d);
    expect(niveau(g) / niveau(dr)).toBeCloseTo(1, 6);
  });

  void SR;
});
