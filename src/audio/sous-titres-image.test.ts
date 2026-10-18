// Poser un sous-titre sur une image : la mesure et l'ordre du dessin, sans canevas réel.
import { describe, expect, it } from "vitest";
import {
  dessinerSousTitre, metriquesSousTitre, type ContexteTexte, type StyleSousTitre,
} from "./sous-titres-image";

const STYLE: StyleSousTitre = {
  corpsPourCent: 5, margePourCent: 6, position: "bas", fond: "contour",
};

/** Un contexte qui note ce qu'on lui demande, dans l'ordre. */
function espion(): ContexteTexte & { appels: string[] } {
  const appels: string[] = [];
  return {
    appels,
    save: () => appels.push("save"),
    restore: () => appels.push("restore"),
    fillRect: (x, y, l, h) => appels.push(`fillRect ${Math.round(x)} ${Math.round(y)} ${Math.round(l)} ${Math.round(h)}`),
    fillText: (t, x, y) => appels.push(`fillText ${t} ${Math.round(x)} ${Math.round(y)}`),
    strokeText: (t, x, y) => appels.push(`strokeText ${t} ${Math.round(x)} ${Math.round(y)}`),
    measureText: (t) => ({ width: t.length * 10 }),
    font: "", fillStyle: "", strokeStyle: "", lineWidth: 0,
    lineJoin: "miter", textAlign: "start", textBaseline: "alphabetic",
  };
}

describe("la mesure", () => {
  // LE CAS QUI TIENT LA DÉCISION 1 : le même réglage sur deux tailles d'image.
  it("prend le corps et la marge en part de la hauteur, jamais en pixels", () => {
    expect(metriquesSousTitre(720, 1, STYLE).corps).toBe(36);
    expect(metriquesSousTitre(2160, 1, STYLE).corps).toBe(108);
    expect(metriquesSousTitre(720, 1, STYLE).marge).toBe(43);
  });

  it("ne descend pas sous un corps lisible, même sur une image minuscule", () => {
    expect(metriquesSousTitre(40, 1, STYLE).corps).toBe(8);
  });

  // LE CAS QUI TIENT LA DÉCISION 3 : le bloc est ancré par son bord.
  it("fait finir une et deux lignes à la même hauteur, en bas", () => {
    const une = metriquesSousTitre(720, 1, STYLE);
    const deux = metriquesSousTitre(720, 2, STYLE);
    expect(une.premiereLigne).toBe(677);
    expect(deux.premiereLigne + deux.interligne).toBe(une.premiereLigne);
  });

  it("ancre par le haut quand la position est haute", () => {
    const m = metriquesSousTitre(720, 2, { ...STYLE, position: "haut" });
    expect(m.premiereLigne).toBe(m.marge + m.corps);
  });
});

describe("le dessin", () => {
  it("trace le contour avant le texte, pour que le texte reste net", () => {
    const cx = espion();
    dessinerSousTitre(cx, 1280, 720, ["bonjour"], STYLE);
    const trace = cx.appels.filter((a) => a.startsWith("strokeText") || a.startsWith("fillText"));
    expect(trace).toEqual(["strokeText bonjour 640 677", "fillText bonjour 640 677"]);
  });

  it("pose le bandeau avant le texte, et pas de contour avec lui", () => {
    const cx = espion();
    dessinerSousTitre(cx, 1280, 720, ["un", "deux"], { ...STYLE, fond: "bandeau" });
    expect(cx.appels[cx.appels.findIndex((a) => a.startsWith("fillRect"))]).toContain("fillRect");
    expect(cx.appels.findIndex((a) => a.startsWith("fillRect")))
      .toBeLessThan(cx.appels.findIndex((a) => a.startsWith("fillText")));
    expect(cx.appels.some((a) => a.startsWith("strokeText"))).toBe(false);
  });

  it("ne trace ni contour ni bandeau quand le fond est « aucun »", () => {
    const cx = espion();
    dessinerSousTitre(cx, 1280, 720, ["nu"], { ...STYLE, fond: "aucun" });
    expect(cx.appels.some((a) => a.startsWith("strokeText") || a.startsWith("fillRect"))).toBe(false);
    expect(cx.appels.some((a) => a.startsWith("fillText"))).toBe(true);
  });

  it("centre chaque ligne et les empile d'un interligne", () => {
    const cx = espion();
    dessinerSousTitre(cx, 800, 720, ["haut", "bas"], { ...STYLE, fond: "aucun" });
    expect(cx.appels.filter((a) => a.startsWith("fillText")))
      .toEqual(["fillText haut 400 632", "fillText bas 400 677"]);
  });

  it("rend la main sans rien tracer quand il n'y a aucune ligne", () => {
    const cx = espion();
    dessinerSousTitre(cx, 800, 720, [], STYLE);
    expect(cx.appels).toEqual([]);
  });
});
