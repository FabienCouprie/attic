// @vitest-environment jsdom
// electron/ipc-pdf.test.ts — La demande d'impression vérifiée, et la page que Chromium imprimera.
//
// CE QUE CES CAS TIENNENT. L'impression elle-même demande Electron, et elle est éprouvée dans
// l'application par `tests-e2e/svg-vers-pdf-dans-application.spec.ts`, qui relit le PDF. Restent ici
// les deux moitiés pures : ce que le processus principal accepte d'une page, et la page qu'il en fait.
// Celle-ci est relue comme un document, par le DOM de jsdom, et non cherchée en chaîne : un titre
// échappé à moitié s'y verrait comme un élément de trop.
import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { demandeValide, pageDImpression, taillePage, echapperHtml } = require("./ipc-pdf.cjs");

const SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 40 10\"><text x=\"1\" y=\"8\">Allegro é</text></svg>";
const DEMANDE = { svg: SVG, titre: "Gamme", nom: "partition", format: "a4", orientation: "portrait" };

/** La page relue comme un document. */
function lire(demande: Record<string, unknown>) {
  return new DOMParser().parseFromString(pageDImpression(demande), "text/html");
}

/** Le SVG que porte l'image de la page, décodé de son adresse `data:`. */
function svgDeLImage(doc: Document): string {
  const src = doc.querySelector("img")!.getAttribute("src")!;
  expect(src.startsWith("data:image/svg+xml;base64,")).toBe(true);
  return Buffer.from(src.slice("data:image/svg+xml;base64,".length), "base64").toString("utf8");
}

describe("la demande que le processus principal accepte", () => {
  it("accepte une demande juste, et retire les blancs du titre et du nom", () => {
    expect(demandeValide({ ...DEMANDE, titre: "  Gamme  ", nom: " partition " }))
      .toEqual({ ok: true, demande: { ...DEMANDE } });
  });

  it.each([
    ["rien", null, "forme"],
    ["un SVG qui n'en est pas un", { ...DEMANDE, svg: "<html></html>" }, "svg"],
    ["un SVG qui n'est pas du texte", { ...DEMANDE, svg: 42 }, "svg"],
    ["un titre qui n'est pas du texte", { ...DEMANDE, titre: ["Gamme"] }, "titre"],
    ["un titre de plus de trois cents caractères", { ...DEMANDE, titre: "x".repeat(301) }, "titre"],
    ["un format inconnu", { ...DEMANDE, format: "A3" }, "format"],
    ["un format hérité de l'objet", { ...DEMANDE, format: "toString" }, "format"],
    ["une orientation inconnue", { ...DEMANDE, orientation: "Paysage" }, "orientation"],
  ])("REFUSE %s, et nomme le champ", (_titre, demande, champ) => {
    expect(demandeValide(demande)).toEqual({ ok: false, refus: champ });
  });
});

describe("la page que Chromium imprime", () => {
  it("PORTE LE SVG ENTIER, OCTET POUR OCTET, EN IMAGE, et aucun script", () => {
    const doc = lire(DEMANDE);
    expect(svgDeLImage(doc)).toBe(SVG);
    expect(doc.querySelectorAll("img")).toHaveLength(1);
    expect(doc.querySelectorAll("script, svg, iframe, object, embed")).toHaveLength(0);
    expect(doc.querySelector("meta[http-equiv='Content-Security-Policy']")!.getAttribute("content"))
      .toBe("default-src 'none'; img-src data:; style-src 'unsafe-inline'");
  });

  it("ÉCRIT LE TITRE EN TÊTE, et le titre du document est le même", () => {
    const doc = lire(DEMANDE);
    expect(doc.querySelector("h1")!.textContent).toBe("Gamme");
    expect(doc.body.firstElementChild!.tagName).toBe("H1");
    expect(doc.title).toBe("Gamme");
  });

  it("UN TITRE SE LIT, IL NE S'INTERPRÈTE PAS : balises et entités restent du texte", () => {
    const titre = "<img src=x onerror=alert(1)> Do & ré \"majeur\" l'été</h1>";
    const doc = lire({ ...DEMANDE, titre });
    expect(doc.querySelector("h1")!.textContent).toBe(titre);
    expect(doc.querySelector("h1")!.children).toHaveLength(0);
    expect(doc.querySelectorAll("img")).toHaveLength(1);
    expect(doc.title).toBe(titre);
    expect(echapperHtml("<&>\"'")).toBe("&lt;&amp;&gt;&quot;&#39;");
  });

  it("SANS TITRE, la page n'a pas d'en-tête, et le document prend le nom du fichier", () => {
    const doc = lire({ ...DEMANDE, titre: "" });
    expect(doc.querySelector("h1")).toBeNull();
    expect(doc.title).toBe("partition");
  });

  it.each([
    ["a4", "portrait", [210, 297]],
    ["a4", "paysage", [297, 210]],
    ["lettre", "portrait", [215.9, 279.4]],
    ["lettre", "paysage", [279.4, 215.9]],
  ])("LA PAGE %s EN %s A SA TAILLE", (format, orientation, [largeur, hauteur]) => {
    expect(taillePage(format, orientation)).toEqual([largeur, hauteur]);
    const page = pageDImpression({ ...DEMANDE, format, orientation });
    expect(page).toContain(`@page { size: ${largeur}mm ${hauteur}mm; margin: 15mm; }`);
    // LE CORPS TIENT DANS LA PAGE, un millimètre de jeu en moins : c'est ce qui la garde unique.
    expect(page).toContain(`height: ${Math.round((hauteur - 31) * 100) / 100}mm;`);
  });
});
