// electron/politique-securite.test.ts — Une politique par destination, et `unsafe-eval` à un seul endroit.
//
// Relevé par une revue le 2026-10-26 : « la CSP garde `unsafe-eval` ». Il n'existait plus que pour
// le code des nœuds installés, qui s'évalue désormais dans un cadre isolé ; ces cas tiennent que le
// document ne le porte plus, et que le cadre, lui, le garde — sans quoi tout nœud installé lèverait.
import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CSP_DOCUMENT, CSP_CADRE, CSP_TRAVAILLEUR_VOSK, PAGE_CADRE, FICHIER_VOSK, politiquePour } = require("./politique-securite.cjs");

/** Les sources d'une directive, ou `null` si elle est absente. */
function directive(csp: string, nom: string): string[] | null {
  const d = csp.split(";").map((s) => s.trim()).find((s) => s.startsWith(`${nom} `));
  return d ? d.split(/\s+/).slice(1) : null;
}

describe("la politique de sécurité, par destination", () => {
  it("LE DOCUMENT N'A PLUS `unsafe-eval`, et garde le WebAssembly", () => {
    const script = directive(CSP_DOCUMENT, "script-src");
    expect(script).not.toBeNull();
    expect(script, "le document porte encore unsafe-eval").not.toContain("'unsafe-eval'");
    expect(script, "sans wasm-unsafe-eval, Csound, Verovio et onnxruntime ne compilent plus").toContain("'wasm-unsafe-eval'");
  });

  it("LA PAGE DU CADRE GARDE `unsafe-eval`, et ne charge rien de l'application", () => {
    expect(directive(CSP_CADRE, "script-src"), "le code d'un nœud installé ne s'évaluerait plus").toContain("'unsafe-eval'");
    expect(directive(CSP_CADRE, "default-src")).toEqual(["'none'"]);
    expect(directive(CSP_CADRE, "script-src"), "le cadre ne doit pas charger de script de l'application").not.toContain("'self'");
  });

  it("LE CADRE NE JOINT QUE LES ADRESSES DU DOCUMENT", () => {
    expect(directive(CSP_CADRE, "connect-src")).toEqual(directive(CSP_DOCUMENT, "connect-src"));
  });

  it("L'ADRESSE DÉCIDE : la page du cadre a la sienne, toute autre réponse celle du document", () => {
    expect(politiquePour(`file:///C:/Program%20Files/Attic/resources/app/dist/${PAGE_CADRE}`)).toBe(CSP_CADRE);
    expect(politiquePour(`http://localhost:5175/${PAGE_CADRE}`)).toBe(CSP_CADRE);
    expect(politiquePour(`http://localhost:5175/${PAGE_CADRE}?v=2`)).toBe(CSP_CADRE);
    expect(politiquePour("file:///C:/app/dist/index.html")).toBe(CSP_DOCUMENT);
    expect(politiquePour("http://localhost:5175/")).toBe(CSP_DOCUMENT);
    // UN NOM QUI SE TERMINE COMME LA PAGE N'EST PAS LA PAGE : le contournement le plus simple.
    expect(politiquePour(`http://localhost:5175/x-${PAGE_CADRE}`)).toBe(CSP_DOCUMENT);
    expect(politiquePour(`http://localhost:5175/?q=/${PAGE_CADRE}`)).toBe(CSP_DOCUMENT);
  });

  it("LE WORKER DE VOSK A LA SIENNE : eval permis, rien d'autre à charger", () => {
    // Son code Emscripten construit des fonctions (embind) ; sorti de son blob, il ne l'hérite plus
    // du document. Voir `src/audio/vosk-travailleur.ts`.
    expect(politiquePour(`file:///C:/app/dist/${FICHIER_VOSK}`)).toBe(CSP_TRAVAILLEUR_VOSK);
    expect(politiquePour(`http://localhost:5175/${FICHIER_VOSK}`)).toBe(CSP_TRAVAILLEUR_VOSK);
    expect(directive(CSP_TRAVAILLEUR_VOSK, "script-src")).toContain("'unsafe-eval'");
    expect(directive(CSP_TRAVAILLEUR_VOSK, "default-src")).toEqual(["'none'"]);
    expect(directive(CSP_TRAVAILLEUR_VOSK, "connect-src")).toEqual(directive(CSP_DOCUMENT, "connect-src"));
  });

  it("LE NOM DU FICHIER EST LE MÊME DES DEUX CÔTÉS", async () => {
    const { FICHIER_TRAVAILLEUR_VOSK } = await import("../src/audio/vosk-travailleur");
    expect(FICHIER_VOSK).toBe(FICHIER_TRAVAILLEUR_VOSK);
  });

  it("main.cjs APPLIQUE LA POLITIQUE PAR DESTINATION, et ne porte plus de constante à lui", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const main = require("fs").readFileSync(require("path").join(__dirname, "main.cjs"), "utf8") as string;
    expect(main).toMatch(/headers\["Content-Security-Policy"\] = \[politiquePour\(details\.url\)\]/);
    expect(main, "une seconde écriture de la politique divergerait").not.toMatch(/script-src 'self'/);
  });
});
