// audio/styles-film.test.ts — Douze mains, et aucune muette.
//
// COMMENT ON ÉPROUVE UN DESSIN SANS DESSINER. Un contexte de canevas est une suite d'ordres :
// `beginPath`, `moveTo`, `stroke`, `fill`. Un contexte factice qui les note permet de vérifier ce
// qu'aucun rendu ne dirait sans œil humain : que chaque style trace QUELQUE CHOSE, qu'aucun ne se
// contente de préparer un chemin sans jamais l'encrer, et que deux styles ne donnent pas la même
// suite d'ordres. Le reste, l'allure, se regarde à l'écran et ne se teste pas ici.
import { describe, expect, it } from "vitest";

import { NOMS_STYLES, STYLES, styleNomme, type TraitStyle } from "./styles-film";
import { FIGURES, pointsSuperforme } from "./superforme";

/** Un contexte qui n'écrit rien et retient tout. */
function contexteFactice() {
  const ordres: string[] = [];
  // LES VALEURS, ET NON LE SEUL NOMBRE D'ARGUMENTS : sans elles, deux styles qui tracent le même
  // enchaînement à des endroits différents paraissaient identiques.
  const noter = (nom: string) => (...a: unknown[]) => {
    ordres.push(`${nom}(${a.map((v) => (typeof v === "number" ? v.toFixed(1) : String(v))).join(",")})`);
  };
  const cx = {
    ordres,
    beginPath: noter("beginPath"), closePath: noter("closePath"),
    moveTo: noter("moveTo"), lineTo: noter("lineTo"), arc: noter("arc"),
    stroke: noter("stroke"), fill: noter("fill"), clip: noter("clip"),
    save: noter("save"), restore: noter("restore"),
    strokeStyle: "", fillStyle: "", lineWidth: 1,
  };
  return cx as unknown as TraitStyle["cx"] & { ordres: string[] };
}

function trait(): TraitStyle & { cx: ReturnType<typeof contexteFactice> } {
  const cx = contexteFactice();
  let g = 1;
  return {
    cx, centre: { x: 100, y: 100 },
    forme: pointsSuperforme(FIGURES.Étoile, 120),
    rayon: 60, couleur: "#88ccff", opacite: 0.8, epaisseur: 2,
    alea: () => { g = (g * 1103515245 + 12345) & 0x7fffffff; return g / 0x7fffffff; },
    palette: ["#0a0a0a", "#00f5ff", "#ff00ff"],
  };
}

describe("les douze styles", () => {
  it("il y en a douze, et deux ne portent pas le même nom", () => {
    expect(NOMS_STYLES.length).toBe(12);
    expect(new Set(NOMS_STYLES).size).toBe(12);
  });

  it("AUCUN N'EST MUET : chacun encre ce qu'il prépare", () => {
    for (const nom of NOMS_STYLES) {
      const t = trait();
      STYLES[nom](t);
      const ordres = t.cx.ordres;
      expect(ordres.length, nom).toBeGreaterThan(2);
      expect(ordres.some((o) => o.startsWith("stroke") || o.startsWith("fill")), nom).toBe(true);
    }
  });

  it("DOUZE MAINS DIFFÉRENTES : aucune suite d'ordres n'en répète une autre", () => {
    const empreintes = new Map<string, string>();
    for (const nom of NOMS_STYLES) {
      const t = trait();
      STYLES[nom](t);
      const e = t.cx.ordres.join(" ");
      const deja = [...empreintes.entries()].find(([, v]) => v === e);
      expect(deja?.[0], `${nom} dessine comme ${deja?.[0]}`).toBeUndefined();
      empreintes.set(nom, e);
    }
  });

  it("celui qui découpe remet le contexte en état, sans quoi tout le reste serait rogné", () => {
    const t = trait();
    STYLES["Style 7"](t);
    expect(t.cx.ordres.filter((o) => o.startsWith("save")).length)
      .toBe(t.cx.ordres.filter((o) => o.startsWith("restore")).length);
    expect(t.cx.ordres.some((o) => o.startsWith("clip"))).toBe(true);
  });

  it("un nom inconnu rend le style le plus sobre plutôt que rien", () => {
    expect(styleNomme("Style 1")).toBe(STYLES["Style 1"]);
    expect(styleNomme("n'existe pas")).toBe(STYLES["Style 1"]);
  });

  it("une figure sans point ne fait échouer aucun style", () => {
    for (const nom of NOMS_STYLES) {
      const t = { ...trait(), forme: [] as { x: number; y: number }[] };
      expect(() => STYLES[nom](t), nom).not.toThrow();
    }
  });
});
