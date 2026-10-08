// plugins/lexique-vosk.test.ts — Ce qu'un nom doit avoir pour entrer dans la grammaire.
import { describe, expect, it } from "vitest";
import { estDicible, horsLexique } from "./lexique-vosk";

describe("les noms que le moteur sait prononcer", () => {
  it("UN NOM DONT UN MOT MANQUE AU LEXIQUE EST ÉCARTÉ, et c'est le cas relevé", () => {
    expect(estDicible("réverbération à convolution")).toBe(false);
    expect(estDicible("réverbération")).toBe(true);
  });

  it("et le mot est cherché ENTIER, non en morceau de mot", () => {
    // UN PLANTAGE A IMPOSÉ CE TÉMOIN. Mes premiers cas ne portaient aucun mot interdit en
    // morceau, de sorte que chercher une sous-chaîne au lieu d'un mot entier ne faisait rien
    // tomber. Le discriminant est un mot qui CONTIENT un mot interdit sans en être un :
    // « convolutions » n'est pas « convolution », et la liste porte par ailleurs des chiffres
    // isolés, qu'une recherche en morceau ferait tirer sur tout nom qui en contient un.
    expect(horsLexique(false).has("convolution")).toBe(true);
    expect(estDicible("convolution")).toBe(false);
    expect(estDicible("convolutions")).toBe(true);
    expect(horsLexique(false).has("3")).toBe(true);
    expect(estDicible("filtre 300 hertz")).toBe(true);
  });

  it("un nom dont tous les mots sont au lexique passe, quelle que soit sa longueur", () => {
    expect(estDicible("entrée audio")).toBe(true);
    expect(estDicible("sortie audio")).toBe(true);
    expect(estDicible("compresseur")).toBe(true);
  });

  it("LA LISTE ANGLAISE EST VIDE ET LE RESTE, faute d'avoir été mesurée", () => {
    // La dire vide plutôt que de recopier la française est la seule chose honnête : « flanger »
    // et « vocoder », absents du lexique français, sont des mots anglais ordinaires.
    expect(horsLexique(true).size).toBe(0);
    expect(estDicible("convolution reverb", true)).toBe(true);
  });

  it("la liste française porte des noms propres, des sigles et des mots anglais", () => {
    // Les trois familles sont là pour que le relevé ne se réduise pas à l'une d'elles : un mot
    // retiré de l'une des trois ferait tomber ce cas plutôt que de passer inaperçu.
    for (const mot of ["xenakis", "lufs", "flanger", "convolution"]) {
      expect(horsLexique(false).has(mot), mot).toBe(true);
    }
    expect(horsLexique(false).size).toBeGreaterThan(80);
  });
});
