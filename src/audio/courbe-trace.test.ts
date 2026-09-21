// audio/courbe-trace.test.ts — Ce qu'un tracé de courbe doit garantir pour être utile.
//
// LE TEST QUI COMPTE EST CELUI DE LA POINTE. Une courbe porte deux cents valeurs par seconde ; le
// tracé en a six cents colonnes. Si la réduction prenait une valeur sur vingt, une pointe brève —
// un transitoire suivi par un suiveur de caractéristique, exactement ce qu'on vient regarder —
// disparaîtrait sans laisser de trace, et le nœud mentirait en silence. La réduction garde donc le
// minimum et le maximum de chaque colonne, et c'est cela qui se vérifie ici.
//
// LE SECOND : L'ÉCHELLE NE S'AJUSTE PAS AU CONTENU. Une courbe qui ne va que de 0,48 à 0,52 doit
// paraître plate, parce que c'est ce que l'effet en fera.
import { describe, expect, it } from "vitest";
import { constante, type Courbe } from "./courbe";
import { enveloppe, genererSvgCourbe, mesurerCourbe } from "./courbe-trace";

const courbe = (valeurs: number[], cadence = 200): Courbe =>
  ({ valeurs: Float32Array.from(valeurs), cadence });

const rampe = (n = 2000, cadence = 200): Courbe =>
  courbe(Array.from({ length: n }, (_, i) => i / (n - 1)), cadence);

describe("mesurer une courbe", () => {
  it("une rampe : de zéro à un, moyenne au milieu", () => {
    const m = mesurerCourbe(rampe());
    expect(m.min).toBeCloseTo(0, 6);
    expect(m.max).toBeCloseTo(1, 6);
    expect(m.moyenne).toBeCloseTo(0.5, 3);
    expect(m.dureeSec).toBeCloseTo(10, 6);
    expect(m.nombre).toBe(2000);
  });

  it("L'AGITATION DISTINGUE CE QUE LES EXTRÊMES CONFONDENT", () => {
    // Deux courbes de mêmes minimum et maximum, l'une qui monte une fois, l'autre qui zigzague.
    const lente = rampe(2000);
    const zigzag = courbe(Array.from({ length: 2000 }, (_, i) => (i % 2 === 0 ? 0 : 1)));
    expect(mesurerCourbe(lente).min).toBeCloseTo(mesurerCourbe(zigzag).min, 6);
    expect(mesurerCourbe(lente).max).toBeCloseTo(mesurerCourbe(zigzag).max, 6);
    // Une rampe de un sur dix secondes : un dixième par seconde.
    expect(mesurerCourbe(lente).agitation).toBeCloseTo(0.1, 2);
    expect(mesurerCourbe(zigzag).agitation).toBeGreaterThan(100);
  });

  it("une courbe plate n'a aucune agitation", () => {
    expect(mesurerCourbe(constante(0.3, 2)).agitation).toBeCloseTo(0, 6);
    expect(mesurerCourbe(constante(0.3, 2)).moyenne).toBeCloseTo(0.3, 5);
  });

  it("ce qui n'est pas une courbe ne fait pas lever, et ne prétend rien mesurer", () => {
    for (const rien of [null, undefined, 42, "x", new Float32Array(3)]) {
      expect(mesurerCourbe(rien).nombre).toBe(0);
    }
  });

  it("une courbe vide ne divise pas par zéro", () => {
    const m = mesurerCourbe(courbe([]));
    expect(m.nombre).toBe(0);
    expect(Number.isFinite(m.dureeSec)).toBe(true);
  });
});

describe("réduire pour dessiner", () => {
  it("UNE POINTE BRÈVE SURVIT À LA RÉDUCTION — c'est toute la raison de la méthode", () => {
    const valeurs = new Array(4000).fill(0.2);
    valeurs[1999] = 1;       // une seule valeur haute sur quatre mille
    const env = enveloppe(courbe(valeurs), 600);
    expect(env.length).toBe(600);
    expect(Math.max(...env.map((c) => c.max))).toBeCloseTo(1, 6);
  });

  it("un creux bref survit aussi", () => {
    const valeurs = new Array(4000).fill(0.8);
    valeurs[10] = 0;
    expect(Math.min(...enveloppe(courbe(valeurs), 600).map((c) => c.min))).toBeCloseTo(0, 6);
  });

  it("chaque colonne encadre bien ses valeurs", () => {
    for (const c of enveloppe(rampe(1000), 50)) expect(c.min).toBeLessThanOrEqual(c.max);
  });

  it("moins de valeurs que de colonnes : une colonne par valeur, pas de trou", () => {
    expect(enveloppe(courbe([0, 0.5, 1]), 600).length).toBe(3);
  });

  it("les cas limites rendent une liste vide plutôt qu'une erreur", () => {
    expect(enveloppe(courbe([]), 100)).toEqual([]);
    expect(enveloppe(rampe(10), 0)).toEqual([]);
    expect(enveloppe(null, 100)).toEqual([]);
  });
});

describe("le tracé", () => {
  const m = mesurerCourbe(rampe());
  const svg = genererSvgCourbe(m, enveloppe(rampe(), 400), { largeur: 640, hauteur: 200 });

  it("est un SVG autonome : ni script, ni ressource extérieure", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 640 200"');
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("http://www.w3.org/1999/xlink");
    expect(svg.includes("http")).toBe(svg.includes("http://www.w3.org/2000/svg"));
  });

  it("porte la bande de la courbe et la ligne de moyenne", () => {
    expect(svg).toContain("<polygon");
    expect(svg).toContain("stroke-dasharray");
  });

  it("annonce les trois chiffres et la durée", () => {
    expect(svg).toContain("min 0.00");
    expect(svg).toContain("max 1.00");
    expect(svg).toContain("10.0 s");
  });

  it("L'ÉCHELLE NE S'AJUSTE PAS : une courbe étroite reste étroite", () => {
    // De 0,48 à 0,52 : la bande doit rester mince, et non remplir la hauteur.
    const etroite = courbe(Array.from({ length: 400 }, (_, i) => 0.48 + 0.04 * (i / 399)));
    const trace = genererSvgCourbe(mesurerCourbe(etroite), enveloppe(etroite, 200), { hauteur: 200 });
    const ys = [...trace.matchAll(/<polygon points="([^"]+)"/g)][0][1]
      .split(" ").map((p) => Number(p.split(",")[1]));
    const amplitude = Math.max(...ys) - Math.min(...ys);
    expect(amplitude).toBeLessThan(20);   // quatre centièmes de 162 pixels
  });

  it("une courbe vide donne un tracé vide mais valide", () => {
    const trace = genererSvgCourbe(mesurerCourbe(courbe([])), [], {});
    expect(trace.startsWith("<svg")).toBe(true);
    expect(trace).not.toContain("<polygon");
    expect(trace).not.toContain("NaN");
  });

  it("aucune coordonnée n'est NaN, quelle que soit la taille demandée", () => {
    for (const taille of [{ largeur: 1, hauteur: 1 }, { largeur: 1280, hauteur: 480 }, {}]) {
      expect(genererSvgCourbe(m, enveloppe(rampe(), 300), taille)).not.toContain("NaN");
    }
  });
});
