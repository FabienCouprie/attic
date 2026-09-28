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
  accordsDepuisPulsations, couleurCss, couleurVersCamelot, estMineur, frappesDuCercle,
  notesDepuisPulsations, pulsations, pulsationsDepuisNotes, svgAnime, toniqueDeCamelot,
  type OptionsCercle, type OptionsPulsations,
} from "./cercle-pulsant";
import { parseCamelot } from "./camelot";
import { intervallesDaccord } from "./qualites-accords";
import { degresDeGamme } from "./gammes";

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

// Ce qui justifie que `OptionsPulsations` soit un type à part, et ce qui le tiendra tel.
//
// LE GÉNÉRATEUR VIDÉO PORTAIT UN CURSEUR « Seuil de silence » QUI NE POUVAIT RIEN CHANGER : il est
// lu par les notes, par les accords et par l'animation SVG, jamais par `pulsations`, et ce
// composant est muet. Le réglage était visible et documenté, avec une plage et un défaut, et le
// déplacer n'avait aucun effet. Le type interdit désormais de le fournir sans son.
describe("les champs de OptionsPulsations agissent tous, et eux seuls", () => {
  const empreinte = (o: OptionsPulsations) =>
    pulsations(o).map((p) => `${p.temps.toFixed(6)}/${p.rayon.toFixed(6)}/${p.teinte.toFixed(4)}`
      + `/${p.saturation.toFixed(4)}/${p.clarte.toFixed(4)}`).join("|");

  const AUTRE: { [K in keyof OptionsPulsations]: number } = {
    dureeSec: 8, pulsationDebut: 5, pulsationFin: 0.5, teinteDebut: 137,
    teinteParcours: 240, saturation: 0.25, clarte: 0.9, respiration: 1, graine: 99,
  };

  // Chaque champ du type, sans en nommer un seul à la main : un champ ajouté sans effet échoue ici.
  for (const champ of Object.keys(AUTRE) as (keyof OptionsPulsations)[]) {
    it(`« ${champ} » change la suite de pulsations`, () => {
      const base: OptionsPulsations = { ...BASE };
      expect(empreinte({ ...base, [champ]: AUTRE[champ] })).not.toBe(empreinte(base));
    });
  }

  it("« seuilSilence » n'y change rien, puisqu'il ne decide que de ce qui sonne", () => {
    const sans: OptionsPulsations = { ...BASE };
    expect(empreinte({ ...sans, seuilSilence: 0.9 } as OptionsPulsations)).toBe(empreinte(sans));
  });
});

// ── Les nomenclatures communes, et la boucle qui se referme ──
//
// CE QUI EST TENU ICI, et pourquoi ces cas existent. Les intervalles des accords étaient CALCULÉS
// dans ce fichier, `[0, tierce, 7]` avec une tierce qui valait 3 ou 4 : pire qu'une table cachée,
// puisqu'un garde qui cherche la FORME d'un accord ne peut pas voir une triade qu'aucune liste ne
// porte. Les degrés des gammes venaient déjà de la table commune. Les deux en viennent désormais,
// et ces cas tiennent que le branchement est réel : une qualité nommée change ce qui sort.
describe("les accords et les gammes viennent des tables communes", () => {
  const p = pulsations(BASE);
  const notes = (o: Partial<OptionsCercle>) => accordsDepuisPulsations(p, { ...BASE, ...o }, "tenus", 0.55);

  it("sans qualite imposee, la roue donne la triade de son anneau, comme avant", () => {
    const sortant = notes({}).slice(0, 3).map((n) => n.note);
    const racine = sortant[0];
    expect(sortant.map((n) => n - racine)).toEqual(intervallesDaccord("maj"));
  });

  it("UNE QUALITÉ NOMMÉE OUVRE LES TRENTE-TROIS : cinq sons pour une neuvieme majeure", () => {
    const sortant = notes({ qualite: "maj9" }).slice(0, 5).map((n) => n.note);
    const racine = sortant[0];
    expect(sortant.map((n) => n - racine)).toEqual(intervallesDaccord("maj9"));
    expect(sortant.length).toBe(5);
  });

  it("et une septieme mineure donne bien ses quatre sons", () => {
    const sortant = notes({ qualite: "m7" }).slice(0, 4).map((n) => n.note);
    expect(sortant.map((n) => n - sortant[0])).toEqual(intervallesDaccord("m7"));
  });

  it("la fondamentale reste celle de la case : seule la qualite change", () => {
    expect(notes({ qualite: "m7" })[0].note).toBe(notes({})[0].note);
  });

  it("UNE GAMME NOMMÉE CHANGE LES DEGRÉS, et le lydien se reconnait a sa quarte", () => {
    // Respiration pleine : le rayon balaie toute l'étendue, donc tous les degrés. Sans cela les
    // deux gammes rendraient les mêmes hauteurs, leur seule différence étant au quatrième degré.
    const o: OptionsCercle = { ...BASE, respiration: 1, seuilSilence: 0, dureeSec: 30 };
    const q = pulsations(o);
    const hauteurs = (gamme?: string) =>
      [...new Set(notesDepuisPulsations(q, { ...o, gamme }).notes.map((n) => n.note))].sort((a, b) => a - b);
    const majeur = hauteurs();
    const lydien = hauteurs("lydien");
    expect(lydien).not.toEqual(majeur);
    // La quarte monte d'un demi-ton, et rien d'autre ne bouge.
    expect(majeur.filter((n) => !lydien.includes(n))).toEqual([majeur[3]]);
    expect(lydien.filter((n) => !majeur.includes(n))).toEqual([majeur[3] + 1]);
  });

  it("une gamme plus courte rend moins de hauteurs, une plus longue davantage", () => {
    // LA PIÈCE EST LONGUE À DESSEIN, et elle a dû l'être davantage : tant que le rayon saturait au
    // plafond, onze pour cent des pulsations tombaient sur le même degré et la couverture était
    // acquise en trente secondes. Le rayon corrigé se répartit, donc atteindre les douze degrés de
    // la chromatique demande d'en tirer davantage. C'est une question d'échantillon et non de règle.
    const o: OptionsCercle = { ...BASE, respiration: 1, seuilSilence: 0, dureeSec: 120 };
    const q = pulsations(o);
    const combien = (gamme?: string) =>
      new Set(notesDepuisPulsations(q, { ...o, gamme }).notes.map((n) => n.note)).size;
    expect(combien("pentatonique-majeure")).toBe(degresDeGamme("pentatonique-majeure").length);
    expect(combien("chromatique")).toBe(degresDeGamme("chromatique").length);
    expect(combien()).toBe(7);
  });
});

// ── L'ERRANCE : la graine ne pouvait pas atteindre l'harmonie ──
//
// LE DÉFAUT QUE CES CAS GARDENT FERMÉ, relevé par Fabien : « les accords sont peu variables en
// fonction de la graine, on entend à peu près la même progression à chaque fois ». Mesuré sur huit
// graines : la progression était IDENTIQUE aux huit, `8B 9B 10B 11B 12B` à chaque fois. La cause
// était structurelle et non un réglage mal choisi. La teinte se calcule de `teinteDebut` et de
// `teinteParcours` sans un seul tirage, et l'harmonie vient entièrement de la teinte : la graine ne
// touchait que le rayon, donc la nuance, le degré de la mélodie et le silence.
//
// CE QUE L'ERRANCE TIRE AU SORT N'EST PAS UNE TONALITÉ QUELCONQUE, et c'est ce que le dernier cas
// tient. Elle choisit entre les trois mouvements que la roue autorise, et elle REMPLACE le pas du
// parcours au lieu de s'y ajouter : ajoutée, un écart d'une case sur un pas d'une case donnerait un
// saut de deux cases, que la roue n'autorise pas.
describe("l'errance de la tonalité", () => {
  const ERRANT: OptionsCercle = {
    dureeSec: 20, pulsationDebut: 1.6, pulsationFin: 3.2,
    teinteDebut: 210, teinteParcours: 150, saturation: 0.7, clarte: 0.55,
    respiration: 0.8, seuilSilence: 0.45, graine: 7, errance: 0.25,
  };
  const GRAINES = [1, 7, 42, 100, 999, 12345, 55555, 90210];

  /** La suite des cases traversées, sans répéter celles qui durent. */
  const parcours = (o: OptionsCercle): string[] => {
    const etapes: string[] = [];
    for (const p of pulsations(o)) {
      const code = couleurVersCamelot(p.teinte, p.saturation);
      if (etapes[etapes.length - 1] !== code) etapes.push(code);
    }
    return etapes;
  };

  it("À ERRANCE NULLE, LA GRAINE NE TOUCHE PAS L'HARMONIE, et c'est le comportement d'origine", () => {
    const suites = new Set(GRAINES.map((graine) => parcours({ ...ERRANT, graine, errance: 0 }).join(" ")));
    expect(suites.size, "sans errance, la teinte ne dépend que des réglages").toBe(1);
  });

  it("ET AUCUN TIRAGE N'Y EST CONSOMMÉ : le rayon ignore le nombre de cases traversées", () => {
    // LA PREUVE QUE LE COURT-CIRCUIT TIENT. Un tirage consommé à chaque changement de case
    // décalerait la suite des rayons dès qu'on change le parcours de teinte, donc changerait la
    // pièce de quelqu'un qui n'a pas touché à l'errance. Ici les deux suites doivent être égales.
    const rayons = (teinteParcours: number, errance: number) =>
      pulsations({ ...ERRANT, errance, teinteParcours }).map((p) => p.rayon.toFixed(9)).join(",");
    expect(rayons(150, 0), "à errance nulle, le rayon ne doit dépendre que de la graine").toBe(rayons(720, 0));
    expect(rayons(150, 0.25), "et le cas doit mordre : avec errance, les tirages se décalent")
      .not.toBe(rayons(720, 0.25));
  });

  it("AVEC ERRANCE, HUIT GRAINES DONNENT SEPT PROGRESSIONS, là où elles n'en donnaient qu'une", () => {
    const suites = new Set(GRAINES.map((graine) => parcours({ ...ERRANT, graine }).join(" ")));
    expect(suites.size).toBeGreaterThanOrEqual(6);
  });

  it("LA PIÈCE COMMENCE TOUJOURS DANS LA TONALITÉ RÉGLÉE, quelle que soit la graine", () => {
    // La première case ne se tire pas : sans cela, un réglage de teinte ne voudrait plus rien dire.
    for (const graine of GRAINES) {
      expect(parcours({ ...ERRANT, graine })[0], `graine ${graine}`).toBe("8B");
    }
  });

  it("CHAQUE MOUVEMENT EST UN DE CEUX QUE LA ROUE AUTORISE, et jamais un saut de deux cases", () => {
    // Le mouvement entre deux cases : case voisine, sept cases plus loin, ou le même numéro dans
    // l'autre anneau. Tout le reste est un enchaînement que la roue ne prescrit pas, et la suite
    // cesserait alors d'être une suite de modulations qui tiennent.
    const illegaux: string[] = [];
    for (const graine of GRAINES) {
      const etapes = parcours({ ...ERRANT, graine });
      for (let i = 1; i < etapes.length; i++) {
        const a = etapes[i - 1], b = etapes[i];
        const ecart = (((parseInt(b, 10) - parseInt(a, 10)) % 12) + 12) % 12;
        const memeAnneau = a.slice(-1) === b.slice(-1);
        const legal = memeAnneau ? [1, 11, 7, 5].includes(ecart) : ecart === 0;
        if (!legal) illegaux.push(`graine ${graine} : ${a} → ${b}`);
      }
    }
    expect(illegaux).toEqual([]);
  });

  it("LA GRAINE CHANGE CE QU'ON ENTEND EN PREMIER : l'architecture de son et de silence", () => {
    // LE DÉFAUT QUE CE CAS GARDE FERMÉ, et il a fallu que Fabien le redise pour que je le mesure au
    // bon endroit : « ça sonne pareil quelle que soit la graine ». J'avais vérifié la PROGRESSION
    // D'ACCORDS, que le mode par défaut ne fait pas sonner. Ce qu'il fait sonner, c'est une suite de
    // frappes, et deux choses la décidaient sans un seul tirage : les instants, qui venaient du seul
    // glissement de cadence, et le souffle, qui était le MÊME sinus parti de la MÊME phase pour
    // toute graine. Or c'est le souffle qui décide quelles pulsations passent sous le seuil de
    // silence. Mesuré sur huit graines : une seule suite d'instants, et des motifs de silence qui se
    // superposaient à une ou deux places près.
    const motif = (graine: number) => pulsations({ ...ERRANT, graine })
      .map((x) => (x.rayon < ERRANT.seuilSilence ? "." : "x")).join("");
    const motifs = GRAINES.map(motif);
    expect(new Set(motifs).size, "huit graines doivent donner huit architectures").toBe(GRAINES.length);
    // Et pas seulement différents d'une place : les blocs doivent tomber ailleurs. On compare les
    // motifs deux à deux et l'on exige qu'aucune paire ne coïncide sur plus de neuf dixièmes.
    for (let i = 0; i < motifs.length; i++) {
      for (let k = i + 1; k < motifs.length; k++) {
        const communes = [...motifs[i]].filter((c, n) => c === motifs[k][n]).length;
        expect(communes / motifs[i].length, `graines ${GRAINES[i]} et ${GRAINES[k]}`).toBeLessThan(0.9);
      }
    }
  });

  it("ET LA GRILLE RESTE EXACTE TANT QU'ON NE DEMANDE PAS D'IRRÉGULARITÉ", () => {
    // La phase tirée suffit à rendre les pièces différentes ; le rythme, lui, ne bouge que si on le
    // demande. Une pulsation métronomique reste donc possible, et c'est le défaut du réglage.
    const p = pulsations({ ...ERRANT, irregularite: 0, pulsationDebut: 2, pulsationFin: 2 });
    const ecarts = new Set(p.slice(1).map((x, i) => (x.temps - p[i].temps).toFixed(9)));
    expect(ecarts.size, "à cadence constante et sans irrégularité, un seul intervalle").toBe(1);
    expect([...ecarts][0]).toBe((0.5).toFixed(9));
    // Et les instants sont alors les mêmes pour toute graine, ce qui est exact : seul le souffle
    // et la taille des cercles dépendent du tirage.
    const suites = new Set(GRAINES.map((graine) =>
      pulsations({ ...ERRANT, graine, irregularite: 0 }).map((x) => x.temps.toFixed(9)).join(",")));
    expect(suites.size).toBe(1);
  });

  it("AVEC IRRÉGULARITÉ, LES INSTANTS EUX-MÊMES DIFFÈRENT d'une graine à l'autre", () => {
    const suites = new Set(GRAINES.map((graine) =>
      pulsations({ ...ERRANT, graine, irregularite: 0.2 }).map((x) => x.temps.toFixed(9)).join(",")));
    expect(suites.size).toBe(GRAINES.length);
  });

  it("et l'écart est RELATIF à la cadence : une pièce qui accélère garde son irrégularité", () => {
    // Compté en secondes, l'écart paraîtrait s'assagir à mesure que la cadence monte. On compare
    // donc l'écart type des intervalles rapporté à leur moyenne, sur la première moitié et la
    // seconde d'une pièce qui double de cadence.
    // CHAQUE INTERVALLE EST RAPPORTÉ À SA PROPRE PÉRIODE NOMINALE, et il le faut : sur une pièce qui
    // accélère, la période nominale varie DANS la fenêtre de mesure, ce qui gonfle l'écart type du
    // début et ferait conclure à une irrégularité qui s'assagit. C'est le rapport qui isole le
    // tirage, et c'est lui qui doit tenir d'un bout à l'autre.
    const o: OptionsCercle = { ...ERRANT, irregularite: 0.3, pulsationDebut: 1, pulsationFin: 4, dureeSec: 60 };
    const p = pulsations(o);
    const rapports = p.slice(1).map((x, i) => {
      const avancement = p[i].temps / o.dureeSec;
      const nominale = 1 / (o.pulsationDebut + (o.pulsationFin - o.pulsationDebut) * avancement);
      return (x.temps - p[i].temps) / nominale;
    });
    const dispersion = (xs: number[]) => {
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
    };
    const tiers = Math.floor(rapports.length / 3);
    const debut = dispersion(rapports.slice(0, tiers));
    const fin = dispersion(rapports.slice(-tiers));
    // Pour un tirage uniforme d'amplitude 0,3, la dispersion attendue est 0,3/√3, soit 0,173.
    expect(debut).toBeCloseTo(0.3 / Math.sqrt(3), 1);
    expect(fin).toBeCloseTo(0.3 / Math.sqrt(3), 1);
    expect(Math.abs(debut - fin), "l'irrégularité relative doit tenir d'un bout à l'autre").toBeLessThan(0.05);
  });

  it("LE RAYON NE SE FAIT PLUS RABOTER PAR LE PLAFOND, et c'est ce qui rendait la pièce uniforme", () => {
    // RELEVÉ PAR FABIEN À L'OREILLE, puis mesuré : la formule du rayon pouvait rendre jusqu'à 1,25
    // et se faisait écrêter, si bien que **31 pulsations sur 288** tombaient exactement à 1, à
    // TOUTE respiration puisque le dépassement est proportionnel. Le rayon donnant la nuance et le
    // degré, onze pour cent des notes sortaient à la même force et au même degré.
    for (const respiration of [0.2, 0.5, 0.8, 1]) {
      const p = pulsations({ ...ERRANT, dureeSec: 120, respiration });
      const rayons = p.map((x) => x.rayon);
      expect(rayons.filter((r) => r >= 0.99999).length, `respiration ${respiration} : au plafond`).toBe(0);
      expect(new Set(rayons.map((r) => r.toFixed(9))).size,
        `respiration ${respiration} : deux pulsations ne doivent pas partager un rayon`).toBe(rayons.length);
    }
  });

  it("ET LE PLANCHER NE BOUGE PAS : le rayon reste au-dessus de cent moins la respiration", () => {
    // La notice le dit, et un seuil de silence plus bas que cette valeur ne coupe donc rien.
    for (const respiration of [0.2, 0.5, 0.8]) {
      const p = pulsations({ ...ERRANT, dureeSec: 120, respiration });
      for (const x of p) expect(x.rayon).toBeGreaterThanOrEqual(1 - respiration - 1e-9);
      expect(Math.max(...p.map((x) => x.rayon))).toBeLessThanOrEqual(1);
    }
  });

  it("UN CHANGEMENT D'ANNEAU SE VOIT SUR LA COULEUR, la saturation désignant l'anneau", () => {
    // Le composant tient depuis l'origine que la saturation EST l'anneau : un changement d'anneau
    // qui ne toucherait pas la couleur ferait mentir l'image sur ce qu'on entend.
    //
    // AUCUNE GRAINE N'EST FIXÉE ICI, et c'est délibéré : la première écriture de ce cas épinglait
    // la graine 100, qui tirait alors un changement d'anneau ; corriger le générateur l'a fait
    // tomber. Un cas qui dépend d'un tirage précis ne tient pas la propriété, il tient un tirage.
    const avecDeuxAnneaux = GRAINES
      .map((graine) => pulsations({ ...ERRANT, graine }))
      .filter((p) => new Set(p.map((x) => x.saturation.toFixed(3))).size === 2);
    expect(avecDeuxAnneaux.length, "au moins une graine sur huit doit changer d'anneau").toBeGreaterThan(0);
    for (const p of avecDeuxAnneaux) {
      const saturations = [...new Set(p.map((x) => x.saturation.toFixed(3)))].sort();
      expect(saturations, "les deux anneaux sont la saturation et son complément").toEqual(["0.300", "0.700"]);
    }
  });
});

// ── La boucle : ce qu'on voit battre est ce qu'on a entendu battre ──
describe("les frappes du cercle, et la pulsation recue", () => {
  const p = pulsations(BASE);

  it("une frappe par pulsation audible, et le seuil decide comme partout ailleurs", () => {
    const audibles = p.filter((x) => x.rayon >= BASE.seuilSilence).length;
    expect(frappesDuCercle(p, BASE).length).toBe(audibles);
    expect(frappesDuCercle(p, { ...BASE, seuilSilence: 1.1 })).toEqual([]);
  });

  it("les frappes tombent sur les pulsations, exactement", () => {
    const f = frappesDuCercle(p, BASE);
    const audibles = p.filter((x) => x.rayon >= BASE.seuilSilence);
    expect(f.map((x) => x.instant)).toEqual(audibles.map((x) => x.temps));
  });

  it("une grande pulsation est une frappe forte, la meme echelle que la melodie", () => {
    const f = frappesDuCercle(p, BASE);
    const melodie = notesDepuisPulsations(p, BASE).notes;
    expect(f.map((x) => x.force)).toEqual(melodie.map((n) => n.velocite));
    expect(Math.max(...f.map((x) => x.force))).toBeGreaterThan(Math.min(...f.map((x) => x.force)));
  });

  it("LA BOUCLE SE FERME EXACTEMENT : les frappes reposees a l'entree redonnent les memes instants", () => {
    const f = frappesDuCercle(p, BASE);
    const recue = f.map((x, i) => ({
      note: 34, velocite: x.force, debut: x.instant,
      fin: i + 1 < f.length ? f[i + 1].instant : x.instant + 0.12,
    }));
    const retour = pulsationsDepuisNotes(recue, BASE);
    expect(retour.length).toBe(f.length);
    for (let i = 0; i < retour.length; i++) expect(retour[i].temps).toBeCloseTo(f[i].instant, 9);
    // Et un second tour ne bouge pas davantage : c'est ce qui permet de rebrancher sans fin.
    const f2 = frappesDuCercle(retour, BASE);
    expect(f2.map((x) => x.instant)).toEqual(f.map((x) => x.instant));
  });

  it("LA NUANCE CONVERGE AU LIEU DE DÉRIVER, et le point fixe s'atteint en quatre tours", () => {
    // Le rayon donne la force, la force redonne le rayon, et les deux formules ne sont pas
    // inverses l'une de l'autre : la nuance se resserre à chaque tour. Ce cas tient que le
    // resserrement est une CONTRACTION et non une dérive. Sans cela, rebrancher le cercle sur
    // lui-même ferait fuir la nuance vers une borne, ou osciller sans jamais se poser.
    const tours: number[][] = [];
    let courant = p;
    for (let k = 0; k < 6; k++) {
      const f = frappesDuCercle(courant, BASE);
      tours.push(f.map((x) => x.force));
      courant = pulsationsDepuisNotes(
        f.map((x) => ({ note: 34, velocite: x.force, debut: x.instant, fin: x.instant + 0.1 })), BASE);
    }
    const ecart = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    expect(ecart(tours[1], tours[0])).toBeGreaterThan(0);
    expect(ecart(tours[2], tours[1])).toBeLessThan(ecart(tours[1], tours[0]));
    expect(tours[5]).toEqual(tours[4]);
  });

  it("la velocite recue donne le rayon, et une suite plate rend un cercle de taille constante", () => {
    const plate = [0, 0.5, 1, 1.5].map((t) => ({ note: 60, velocite: 100, debut: t, fin: t + 0.2 }));
    const q = pulsationsDepuisNotes(plate, BASE);
    expect(q.map((x) => x.temps)).toEqual([0, 0.5, 1, 1.5]);
    expect(new Set(q.map((x) => x.rayon)).size).toBe(1);
    const fort = pulsationsDepuisNotes(plate.map((n) => ({ ...n, velocite: 127 })), BASE);
    expect(fort[0].rayon).toBeGreaterThan(q[0].rayon);
  });

  it("deux notes au meme instant ne font qu'une pulsation : un accord bat une fois", () => {
    const accord = [60, 64, 67].map((note) => ({ note, velocite: 90, debut: 1, fin: 1.5 }));
    expect(pulsationsDepuisNotes(accord, BASE).length).toBe(1);
  });

  it("une suite vide ne rend rien, et n'echoue pas", () => {
    expect(pulsationsDepuisNotes([], BASE)).toEqual([]);
  });

  it("la couleur reste un reglage : elle tourne sur la duree recue, non sur celle du reglage", () => {
    // Prendre aussi la hauteur des notes reçues ferait un second mappage, concurrent de la roue.
    const o: OptionsCercle = { ...BASE, teinteDebut: 0, teinteParcours: 360, dureeSec: 0 };
    const q = pulsationsDepuisNotes(
      [0, 5, 10].map((t) => ({ note: 60, velocite: 100, debut: t, fin: t + 0.1 })), o);
    expect(q[0].teinte).toBeCloseTo(0, 6);
    expect(q[1].teinte).toBeCloseTo(180, 6);
    expect(q[2].teinte).toBeCloseTo(360, 6);
  });
});
