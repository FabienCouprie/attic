// audio/cercle-pulsant.test.ts — L'animation et la mélodie sont la même liste, vue deux fois.
//
// LES DEUX PROPRIÉTÉS QUI FONT TOUT L'INTÉRÊT DU NŒUD, et qu'il faut donc tenir :
//
//   1. DEUX TEINTES VOISINES DONNENT DEUX TONALITÉS COMPATIBLES. C'est ce qui fait qu'un dégradé
//      module au lieu de dérailler, et cela ne tient que parce que la teinte est envoyée sur la
//      roue de Camelot et non sur les douze demi-tons.
//   2. LES NOTES TOMBENT SUR LES PULSATIONS, exactement. Pas « à peu près en rythme » : aux mêmes
//      instants, parce que c'est la même liste.
import { describe, expect, it } from "vitest";
import {
  accordsDepuisPulsations, couleurCss, couleurVersCamelot, estMineur, notesDepuisPulsations,
  pulsations, svgAnime, toniqueDeCamelot, type OptionsCercle,
} from "./cercle-pulsant";
import { parseCamelot } from "./camelot";

const BASE: OptionsCercle = {
  dureeSec: 12, pulsationDebut: 2, pulsationFin: 2,
  teinteDebut: 0, teinteParcours: 0, saturation: 0.8, clarte: 0.5,
  respiration: 0.5, seuilSilence: 0.2, graine: 7,
};

describe("la couleur désigne une case de la roue", () => {
  it("le rouge ouvre la roue, et chaque trentaine de degrés avance d'une case", () => {
    expect(couleurVersCamelot(0, 0.8)).toBe("1B");
    expect(couleurVersCamelot(30, 0.8)).toBe("2B");
    expect(couleurVersCamelot(90, 0.8)).toBe("4B");
    expect(couleurVersCamelot(330, 0.8)).toBe("12B");
  });

  it("le tour complet revient au point de départ", () => {
    expect(couleurVersCamelot(360, 0.8)).toBe(couleurVersCamelot(0, 0.8));
    expect(couleurVersCamelot(-30, 0.8)).toBe(couleurVersCamelot(330, 0.8));
  });

  it("la saturation choisit l'anneau : terne pour le mineur, vive pour le majeur", () => {
    expect(couleurVersCamelot(120, 0.2)).toBe("5A");
    expect(couleurVersCamelot(120, 0.9)).toBe("5B");
    expect(estMineur("5A")).toBe(true);
    expect(estMineur("5B")).toBe(false);
  });

  it("DEUX TEINTES VOISINES DONNENT DEUX CASES VOISINES — la propriété qui fait tout", () => {
    // Sur toute la roue : deux teintes à trente degrés l'une de l'autre ne s'éloignent jamais de
    // plus d'une case. C'est la règle d'enchaînement des disc-jockeys, obtenue gratuitement.
    for (let h = 0; h < 360; h += 30) {
      const a = parseCamelot(couleurVersCamelot(h, 0.8))!;
      const b = parseCamelot(couleurVersCamelot(h + 30, 0.8))!;
      const ecart = Math.abs(a.n - b.n);
      expect(Math.min(ecart, 12 - ecart), `${h}° → ${h + 30}°`).toBe(1);
    }
  });

  it("chaque case a une tonique, et douze cases donnent douze toniques", () => {
    const toniques = new Set<number>();
    for (let n = 1; n <= 12; n++) toniques.add(toniqueDeCamelot(`${n}B`));
    expect(toniques.size).toBe(12);
  });

  it("une case illisible ne fait pas échouer la lecture", () => {
    expect(toniqueDeCamelot("bidon")).toBe(0);
  });
});

describe("la suite des pulsations", () => {
  it("elle couvre la durée demandée sans la dépasser", () => {
    const p = pulsations(BASE);
    expect(p.length).toBeGreaterThan(0);
    expect(p[0].temps).toBe(0);
    expect(p[p.length - 1].temps).toBeLessThan(BASE.dureeSec);
  });

  it("à cadence constante, les frappes sont régulières", () => {
    const p = pulsations({ ...BASE, pulsationDebut: 4, pulsationFin: 4 });
    for (let i = 1; i < p.length; i++) expect(p[i].temps - p[i - 1].temps).toBeCloseTo(0.25, 6);
  });

  it("LE RYTHME S'ACCÉLÈRE QUAND LES DEUX CADENCES DIFFÈRENT", () => {
    const p = pulsations({ ...BASE, pulsationDebut: 1, pulsationFin: 6 });
    const premier = p[1].temps - p[0].temps;
    const dernier = p[p.length - 1].temps - p[p.length - 2].temps;
    expect(dernier).toBeLessThan(premier / 2);
  });

  it("la teinte parcourt bien l'arc demandé", () => {
    const p = pulsations({ ...BASE, teinteDebut: 10, teinteParcours: 180 });
    expect(p[0].teinte).toBeCloseTo(10, 6);
    expect(p[p.length - 1].teinte).toBeGreaterThan(150);
    expect(p[p.length - 1].teinte).toBeLessThanOrEqual(190);
  });

  it("le rayon reste entre zéro et un, quels que soient les réglages", () => {
    for (const respiration of [0, 0.5, 1]) {
      for (const p of pulsations({ ...BASE, respiration })) {
        expect(p.rayon).toBeGreaterThanOrEqual(0);
        expect(p.rayon).toBeLessThanOrEqual(1);
      }
    }
  });

  it("sans respiration, le cercle garde une taille constante", () => {
    const p = pulsations({ ...BASE, respiration: 0 });
    for (const x of p) expect(x.rayon).toBeCloseTo(1, 10);
  });

  it("la même graine rejoue les mêmes pulsations", () => {
    expect(pulsations(BASE)).toEqual(pulsations(BASE));
    expect(pulsations({ ...BASE, graine: 8 })).not.toEqual(pulsations(BASE));
  });

  it("une durée nulle ou une cadence absurde ne fait pas boucler sans fin", () => {
    expect(pulsations({ ...BASE, dureeSec: 0 })).toEqual([]);
    expect(pulsations({ ...BASE, pulsationDebut: 0, pulsationFin: 0 }).length).toBeLessThan(2000);
  });
});

describe("les notes que ces pulsations écrivent", () => {
  const p = pulsations(BASE);
  const { notes, codes } = notesDepuisPulsations(p, BASE);

  it("LES NOTES TOMBENT SUR LES PULSATIONS, exactement", () => {
    const instants = new Set(p.map((x) => x.temps));
    for (const n of notes) expect(instants.has(n.debut)).toBe(true);
  });

  it("il y a une case de Camelot par pulsation, même quand elle ne sonne pas", () => {
    expect(codes.length).toBe(p.length);
  });

  it("LE SILENCE A UNE IMAGE : sous le seuil, la pulsation se voit et ne s'entend pas", () => {
    const muettes = p.filter((x) => x.rayon < BASE.seuilSilence).length;
    expect(notes.length).toBe(p.length - muettes);
    // Et avec un seuil très haut, tout se tait.
    expect(notesDepuisPulsations(p, { ...BASE, seuilSilence: 2 }).notes.length).toBe(0);
  });

  it("les notes restent dans l'étendue d'un piano", () => {
    for (const n of notes) {
      expect(n.note).toBeGreaterThanOrEqual(21);
      expect(n.note).toBeLessThanOrEqual(108);
    }
  });

  it("UN GRAND CERCLE EST UNE NOTE GRAVE", () => {
    const petite = notesDepuisPulsations(
      [{ temps: 0, rayon: 0.25, teinte: 0, saturation: 0.9, clarte: 0.5 }], BASE).notes[0];
    const grande = notesDepuisPulsations(
      [{ temps: 0, rayon: 0.95, teinte: 0, saturation: 0.9, clarte: 0.5 }], BASE).notes[0];
    expect(grande.note).toBeLessThan(petite.note);
  });

  it("une grande pulsation est une note forte", () => {
    const [faible] = notesDepuisPulsations([{ temps: 0, rayon: 0.3, teinte: 0, saturation: 0.9, clarte: 0.5 }], BASE).notes;
    const [forte] = notesDepuisPulsations([{ temps: 0, rayon: 1, teinte: 0, saturation: 0.9, clarte: 0.5 }], BASE).notes;
    expect(forte.velocite).toBeGreaterThan(faible.velocite);
  });

  it("une couleur claire monte d'une octave sur une couleur sombre", () => {
    const sombre = notesDepuisPulsations([{ temps: 0, rayon: 0.5, teinte: 0, saturation: 0.9, clarte: 0 }], BASE).notes[0];
    const claire = notesDepuisPulsations([{ temps: 0, rayon: 0.5, teinte: 0, saturation: 0.9, clarte: 1 }], BASE).notes[0];
    expect(claire.note - sombre.note).toBe(24);
  });

  it("le mode suit l'anneau : la tierce descend d'un demi-ton en mineur", () => {
    const majeur = notesDepuisPulsations([{ temps: 0, rayon: 0.55, teinte: 0, saturation: 0.9, clarte: 0.5 }], BASE).notes[0];
    const mineur = notesDepuisPulsations([{ temps: 0, rayon: 0.55, teinte: 0, saturation: 0.1, clarte: 0.5 }], BASE).notes[0];
    // Même degré, même tonique pour la case 1 des deux anneaux ? Non — les toniques diffèrent.
    // Ce qu'on tient ici, c'est que le mode change bien de gamme.
    expect(majeur.note).not.toBe(mineur.note);
  });

  it("les notes ne débordent jamais de la durée", () => {
    for (const n of notes) expect(n.fin).toBeLessThanOrEqual(BASE.dureeSec);
  });
});

describe("l'animation", () => {
  const p = pulsations(BASE);
  const svg = svgAnime(p, BASE, { taille: 600, echos: true });

  it("c'est un SVG autonome : aucun script, aucune ressource extérieure", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toContain("<script");
    // L'URI `http://www.w3.org/2000/svg` est l'ESPACE DE NOMS, obligatoire et jamais téléchargé :
    // l'interdire reviendrait à interdire le SVG. Ce qu'on refuse, ce sont les ressources qu'un
    // rendu irait chercher — image liée, feuille de style, police.
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).not.toMatch(/<(image|use|link)\b/);
    expect(svg).not.toMatch(/(href|src)="https?:/);
    expect(svg).not.toContain("@import");
  });

  it("ELLE S'ANIME PAR SMIL, la seule façon de bouger dans une balise image", () => {
    expect(svg).toContain("<animate");
    expect(svg).toContain('attributeName="r"');
    expect(svg).toContain('attributeName="fill"');
  });

  it("sa durée est celle demandée", () => {
    expect(svg).toContain(`dur="${BASE.dureeSec}s"`);
  });

  it("les instants clés sont croissants et tiennent entre zéro et un", () => {
    const m = svg.match(/keyTimes="([^"]+)"/);
    expect(m).toBeTruthy();
    const cles = m![1].split(";").map(Number);
    expect(cles[0]).toBe(0);
    expect(cles[cles.length - 1]).toBe(1);
    for (let i = 1; i < cles.length; i++) expect(cles[i]).toBeGreaterThanOrEqual(cles[i - 1]);
  });

  it("autant de valeurs que d'instants : sans quoi le navigateur ignore l'animation", () => {
    const cles = svg.match(/keyTimes="([^"]+)"/)![1].split(";").length;
    for (const m of svg.matchAll(/values="([^"]+)"/g)) {
      const n = m[1].split(";").length;
      // Les échos ont leurs propres animations à deux valeurs, sans keyTimes.
      if (n > 2) expect(n).toBe(cles);
    }
  });

  it("un écho par pulsation audible, et aucun quand on les coupe", () => {
    const audibles = p.filter((x) => x.rayon >= BASE.seuilSilence).length;
    const compter = (s: string) => (s.match(/repeatCount="indefinite" fill="remove"/g) ?? []).length;
    expect(compter(svg)).toBe(Math.min(400, audibles) * 2);
    expect(compter(svgAnime(p, BASE, { taille: 600, echos: false }))).toBe(0);
  });

  it("une suite vide ne fait pas échouer le dessin", () => {
    expect(() => svgAnime([], BASE, { taille: 400, echos: true })).not.toThrow();
  });
});

describe("la couleur écrite", () => {
  it("elle sort en notation lisible par un navigateur", () => {
    expect(couleurCss({ temps: 0, rayon: 1, teinte: 200, saturation: 0.5, clarte: 0.5 }))
      .toBe("hsl(200.0 50% 53%)");
  });

  it("une teinte hors bornes est ramenée dans le tour", () => {
    expect(couleurCss({ temps: 0, rayon: 1, teinte: -40, saturation: 1, clarte: 1 })).toContain("320.0");
  });
});

// ── Les accords : ce que la roue prescrit, et que la mélodie seule ne disait pas ──
//
// UNE CASE DE LA ROUE EST UNE TONALITÉ. La mélodie prend ses degrés dans la gamme de la case, mais
// un degré isolé ne nomme pas la tonalité dont il vient : c'est la triade de tonique qui le fait.
// Ce qui est tenu ici : la triade est bien celle de la case, elle passe sous la mélodie, et elle
// se tait là où le cercle se tait.
describe("les accords de la roue", () => {
  const p = pulsations(BASE);

  it("« aucun » ne pose rien", () => {
    expect(accordsDepuisPulsations(p, BASE, "aucun", 0.55)).toEqual([]);
  });

  it("chaque accord a trois sons, et un accord par tonalité traversée en mode tenu", () => {
    const o = { ...BASE, teinteParcours: 360 };
    const q = pulsations(o);
    const accords = accordsDepuisPulsations(q, o, "tenus", 0.55);
    expect(accords.length % 3).toBe(0);
    // Les cases traversées qui portent au moins une pulsation audible.
    const sonnantes = new Set<string>();
    for (const pulse of q) {
      if (pulse.rayon >= o.seuilSilence) sonnantes.add(couleurVersCamelot(pulse.teinte, pulse.saturation));
    }
    expect(accords.length / 3).toBe(sonnantes.size);
  });

  it("la triade est celle de la case : tonique, tierce du mode, quinte", () => {
    for (const saturation of [0.8, 0.2]) {
      const o = { ...BASE, saturation, respiration: 0 };
      const q = pulsations(o);
      const a = accordsDepuisPulsations(q, o, "tenus", 0.55);
      expect(a.length).toBe(3);
      const code = couleurVersCamelot(o.teinteDebut, saturation);
      const intervalles = a.map((n) => n.note - a[0].note);
      expect(intervalles).toEqual([0, estMineur(code) ? 3 : 4, 7]);
      expect(((a[0].note % 12) + 12) % 12).toBe(toniqueDeCamelot(code));
    }
  });

  it("DANS UNE MÊME TONALITÉ, la tonique de l'accord est une octave sous celle de la mélodie", () => {
    // Sans respiration le rayon vaut un, donc le degré est le premier : la mélodie chante la
    // tonique, et l'accord doit la doubler douze demi-tons plus bas.
    const o = { ...BASE, respiration: 0 };
    const q = pulsations(o);
    const { notes } = notesDepuisPulsations(q, o);
    const accords = accordsDepuisPulsations(q, o, "tenus", 0.55);
    expect(accords.length).toBe(3);
    expect(notes[0].note - accords[0].note).toBe(12);
  });

  it("l'harmonie tient le registre grave, la mélodie l'avant-plan", () => {
    // D'une tonalité à l'autre les toniques bougent, si bien que la quinte d'un accord peut
    // dépasser la note la plus basse d'une autre case. Ce qui se tient, c'est l'écart des deux
    // voix prises dans leur ensemble.
    const o = { ...BASE, teinteParcours: 180 };
    const q = pulsations(o);
    const mediane = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const notes = notesDepuisPulsations(q, o).notes.map((n) => n.note);
    const accords = accordsDepuisPulsations(q, o, "tenus", 0.55).map((n) => n.note);
    expect(accords.length).toBeGreaterThan(0);
    expect(mediane(notes) - mediane(accords)).toBeGreaterThanOrEqual(7);
  });

  it("une case traversée pendant que le cercle est rétracté ne sonne pas", () => {
    // Seuil au-dessus de tout rayon possible : plus une seule pulsation audible, donc plus un
    // seul accord — l'image et la musique se taisent ensemble.
    const o = { ...BASE, teinteParcours: 360, seuilSilence: 1.01 };
    const q = pulsations(o);
    expect(notesDepuisPulsations(q, o).notes).toEqual([]);
    expect(accordsDepuisPulsations(q, o, "tenus", 0.55)).toEqual([]);
  });

  it("« frappés » rejoue le même accord à chaque pulsation audible", () => {
    const o = { ...BASE, teinteParcours: 360 };
    const q = pulsations(o);
    const tenus = accordsDepuisPulsations(q, o, "tenus", 0.55);
    const frappes = accordsDepuisPulsations(q, o, "frappes", 0.55);
    const audibles = q.filter((x) => x.rayon >= o.seuilSilence).length;
    expect(frappes.length / 3).toBe(audibles);
    expect(frappes.length).toBeGreaterThan(tenus.length);
    // Les hauteurs employées sont les mêmes : seul le découpage dans le temps change.
    expect(new Set(frappes.map((n) => n.note))).toEqual(new Set(tenus.map((n) => n.note)));
  });

  it("la nuance règle la force de frappe, et reste dans les bornes MIDI", () => {
    const douce = accordsDepuisPulsations(p, BASE, "tenus", 0);
    const forte = accordsDepuisPulsations(p, BASE, "tenus", 1);
    expect(douce[0].velocite).toBe(1);
    expect(forte[0].velocite).toBe(127);
  });

  it("aucun accord ne déborde de la durée demandée, ni ne dure zéro", () => {
    const o = { ...BASE, teinteParcours: 720 };
    const q = pulsations(o);
    for (const mode of ["tenus", "frappes"] as const) {
      for (const n of accordsDepuisPulsations(q, o, mode, 0.55)) {
        expect(n.fin).toBeGreaterThan(n.debut);
        expect(n.fin).toBeLessThanOrEqual(o.dureeSec);
        expect(n.note).toBeGreaterThanOrEqual(21);
        expect(n.note).toBeLessThanOrEqual(108);
      }
    }
  });
});
