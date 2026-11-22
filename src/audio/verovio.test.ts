// audio/verovio.test.ts — Reconnaître une notation, et les options de gravure.
import { describe, expect, it } from "vitest";
import { detecterFormat, entreeVerovio, optionsGravure, pageDemandee, racineXml } from "./verovio";

describe("detecterFormat", () => {
  it("reconnaît l'ABC à ses champs d'en-tête", () => {
    expect(detecterFormat("X:1\nT:Essai\nM:4/4\nK:C\nCDEF|GABc|")).toBe("abc");
    expect(detecterFormat("  K:G\n GABc")).toBe("abc");
  });

  it("reconnaît MusicXML à sa racine, quelle que soit la déclaration qui précède", () => {
    const xml = `<?xml version="1.0"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN">\n<score-partwise version="3.1"><part-list/></score-partwise>`;
    expect(detecterFormat(xml)).toBe("musicxml");
    expect(detecterFormat("<score-timewise><part-list/></score-timewise>")).toBe("musicxml");
  });

  it("reconnaît MEI à son élément ou à son espace de noms", () => {
    expect(detecterFormat('<mei xmlns="http://www.music-encoding.org/ns/mei"><music/></mei>')).toBe("mei");
    expect(detecterFormat('<?xml version="1.0"?><mei><music/></mei>')).toBe("mei");
  });

  it("reconnaît le Humdrum à sa première ligne de données, et non à « **kern » n'importe où", () => {
    expect(detecterFormat("**kern\n*M4/4\n4c\n4d\n*-")).toBe("humdrum");
    expect(detecterFormat("!! un commentaire\n**kern\t**kern\n4c\t4e\n*-\t*-")).toBe("humdrum");
    // Revue des notations en texte, 2026-11-22 : cet ABC était refusé comme Humdrum.
    expect(detecterFormat("X:1\nT:Etude **kern\nK:C\nCDEF|")).toBe("abc");
  });

  // CE CAS TENAIT LE CONTRAIRE : « un XML inconnu est tenté en MusicXML ». Écrit avec le nœud, il
  // décrivait le comportement d'alors, sans décision. Mesuré le 2026-11-22 : Verovio gravait en vert
  // une page vide pour un SVG ou pour un opus MusicXML. Un XML qui n'est ni MusicXML ni MEI n'est
  // donc rien, et le nœud le refuse en nommant sa racine.
  it("un XML qui n'est ni MusicXML ni MEI n'est rien ; un texte vide ou quelconque non plus", () => {
    expect(detecterFormat("<partition><note/></partition>")).toBeNull();
    expect(detecterFormat('<?xml version="1.0"?><opus><score/></opus>')).toBeNull();
    expect(detecterFormat("   ")).toBeNull();
    expect(detecterFormat("do ré mi fa sol")).toBeNull();
  });

  it("la racine d'un document XML, après la déclaration, les commentaires et le DOCTYPE", () => {
    expect(racineXml('<?xml version="1.0"?>\n<!-- x -->\n<!DOCTYPE score-partwise PUBLIC "x">\n<score-partwise/>')).toBe("score-partwise");
    expect(racineXml('<svg:svg xmlns:svg="http://www.w3.org/2000/svg"/>')).toBe("svg");
    expect(racineXml("pas de XML")).toBeNull();
    expect(racineXml('<!DOCTYPE score-partwise [<!ENTITY x "y">]>\n<score-partwise/>')).toBe("score-partwise");
  });

  // Relevé par CodeQL le 2026-11-22 : le retrait des commentaires par expression régulière laissait un
  // commentaire jamais refermé derrière lui, et la racine qu'il cachait était lue.
  it("un commentaire jamais refermé ne laisse lire aucune racine", () => {
    expect(racineXml("<!-- <score-partwise/>")).toBeNull();
    expect(racineXml("<?xml version=\"1.0\"")).toBeNull();
    expect(detecterFormat("<!-- <score-partwise/>")).toBeNull();
  });

  it("le nom du format tel que Verovio l'attend", () => {
    expect(entreeVerovio("abc")).toBe("abc");
    expect(entreeVerovio("musicxml")).toBe("musicxml");
    expect(entreeVerovio("mei")).toBe("mei");
  });
});

describe("optionsGravure", () => {
  const base = { largeur: 1800, echelle: 40, marge: 50, deroule: false };

  it("coupe le blanc du bas de page et cache en-tête et pied", () => {
    const o = optionsGravure(base);
    expect(o).toMatchObject({ adjustPageHeight: true, header: "none", footer: "none", pageWidth: 1800, scale: 40 });
  });

  it("« déroulé » : aucun saut de système, et une page assez large pour tout tenir", () => {
    const o = optionsGravure({ ...base, deroule: true });
    expect(o.breaks).toBe("none");
    expect(o.pageWidth as number).toBeGreaterThan(50000);
  });

  it("borne l'échelle et la largeur à ce que Verovio accepte", () => {
    expect(optionsGravure({ ...base, echelle: 500 }).scale).toBe(200);
    expect(optionsGravure({ ...base, echelle: 1 }).scale).toBe(10);
    expect(optionsGravure({ ...base, largeur: 10 }).pageWidth).toBe(600);
  });
});

describe("pageDemandee", () => {
  it("reste dans les pages produites", () => {
    expect(pageDemandee(3, 5)).toBe(3);
    expect(pageDemandee(9, 2)).toBe(2);
    expect(pageDemandee(0, 4)).toBe(1);
    expect(pageDemandee(1, 0)).toBe(1);
  });
});
