// audio/theorie-romains.test.ts — Les chiffres romains lus dans le bon mode.
//
// Deux fautes d'harmonie distinctes vivaient ici, et seule la première était
// corrigée. Tonal lit la CASSE d'un degré mais ne la reporte pas sur la qualité
// de l'accord — « vi » donnait La majeur — c'est `normaliserRomains`, déjà
// couvert par plugins/romains-mineurs.test.ts. Il résout aussi TOUS les degrés
// sur la gamme MAJEURE : en la mineur, « i VI III VII » rendait Am F♯ C♯ G♯,
// soit la bonne tonique suivie de trois accords du mode majeur. C'est ce second
// défaut que ce fichier verrouille.
import { describe, it, expect } from "vitest";
import { Chord, Progression } from "tonal";
import {
  romainsSelonMode, accordsDepuisRomains, modeDepuisTonalite, normaliserRomains,
} from "./theorie-romains";

describe("le défaut, tel que Tonal le produisait", () => {
  it("résolvait les degrés d'un mode mineur sur la gamme majeure", () => {
    // Reproduit l'appel d'origine, pour que la correction reste lisible comme
    // une correction et non comme une préférence.
    const brut = Progression.fromRomanNumerals("A", normaliserRomains(["i", "VI", "III", "VII"]));
    expect(brut).toEqual(["Am", "F#", "C#", "G#"]);

    const corrige = accordsDepuisRomains("A", ["i", "VI", "III", "VII"], "mineur");
    expect(corrige).toEqual(["Am", "F", "C", "G"]);
  });
});

describe("romainsSelonMode", () => {
  it("abaisse III, VI et VII en mineur", () => {
    expect(romainsSelonMode(["i", "III", "VI", "VII"], "mineur")).toEqual(["i", "bIII", "bVI", "bVII"]);
  });

  it("laisse I, II, IV et V intacts", () => {
    // Leur fondamentale est la même dans les deux modes : seule leur qualité
    // change, et la casse s'en charge.
    expect(romainsSelonMode(["i", "ii", "iv", "v"], "mineur")).toEqual(["i", "ii", "iv", "v"]);
  });

  it("ne touche à rien en majeur", () => {
    const tokens = ["I", "V", "vi", "IV", "III", "VII"];
    expect(romainsSelonMode(tokens, "majeur")).toEqual(tokens);
  });

  it("respecte une altération déjà écrite", () => {
    // L'utilisateur a dit ce qu'il voulait ; bémoliser une seconde fois
    // changerait sa demande en un double bémol.
    expect(romainsSelonMode(["bIII", "#IV", "bVII"], "mineur")).toEqual(["bIII", "#IV", "bVII"]);
  });

  it("conserve les extensions du degré", () => {
    expect(romainsSelonMode(["VII7", "VImaj7"], "mineur")).toEqual(["bVII7", "bVImaj7"]);
  });

  it("laisse passer un jeton qui n'est pas un chiffre romain", () => {
    expect(romainsSelonMode(["Am", "xyz", ""], "mineur")).toEqual(["Am", "xyz", ""]);
  });
});

describe("accordsDepuisRomains", () => {
  it("rend les accords du mineur naturel, avec leurs notes", () => {
    const accords = accordsDepuisRomains("A", ["i", "iv", "v", "VI"], "mineur");
    expect(accords).toEqual(["Am", "Dm", "Em", "F"]);
    // La gamme de la mineur n'a aucune altération : aucun dièse ne doit
    // apparaître dans les notes produites.
    const notes = accords.flatMap((a) => Chord.get(a).notes);
    expect(notes.some((n) => n.includes("#"))).toBe(false);
  });

  it("ne change rien au comportement majeur, déjà juste", () => {
    // La non-régression qui compte : c'est le mode par défaut, et le catalogue
    // l'utilise partout.
    expect(accordsDepuisRomains("C", ["I", "V", "vi", "IV"], "majeur")).toEqual(["C", "G", "Am", "F"]);
    expect(accordsDepuisRomains("C", ["I", "V", "vi", "IV"])).toEqual(["C", "G", "Am", "F"]);
  });

  it("garde le relatif mineur juste en majeur", () => {
    expect(Chord.get(accordsDepuisRomains("C", ["vi"], "majeur")[0]).notes).toEqual(["A", "C", "E"]);
  });

  it("traite la cadence mineure la plus courante", () => {
    // i iv v en la mineur : les trois accords de la gamme, sans emprunt.
    expect(accordsDepuisRomains("A", ["i", "iv", "v"], "mineur")).toEqual(["Am", "Dm", "Em"]);
  });

  it("accepte une dominante majeure empruntée, écrite en majuscules", () => {
    // Le V majeur d'un mineur harmonique : sa fondamentale est celle du mode,
    // seule la qualité change — l'écriture doit suffire à l'obtenir.
    expect(accordsDepuisRomains("A", ["i", "V"], "mineur")).toEqual(["Am", "E"]);
  });

  it("tient sur les douze toniques", () => {
    // Une tonique à bémol ou à dièse ne doit pas produire de symbole vide, ce
    // que le nœud traite comme une progression invalide.
    for (const t of ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]) {
      const a = accordsDepuisRomains(t, ["i", "VI", "III", "VII"], "mineur");
      expect(a, `tonique ${t}`).toHaveLength(4);
      expect(a.every((x) => !!x), `tonique ${t}`).toBe(true);
    }
  });
});

describe("modeDepuisTonalite", () => {
  it("lit le mode que « Analyse harmonique » écrit", () => {
    // Le format réel de sa sortie, confiance comprise.
    expect(modeDepuisTonalite("A minor (90%)")).toBe("mineur");
    expect(modeDepuisTonalite("C major (96%)")).toBe("majeur");
  });

  it("accepte les deux langues", () => {
    expect(modeDepuisTonalite("La mineur")).toBe("mineur");
    expect(modeDepuisTonalite("Do majeur")).toBe("majeur");
  });

  it("rend null quand le texte ne dit rien du mode", () => {
    // Une simple tonique n'est ni majeure ni mineure : deviner à la place de
    // l'utilisateur serait pire que laisser le paramètre décider.
    expect(modeDepuisTonalite("A")).toBeNull();
    expect(modeDepuisTonalite("")).toBeNull();
    expect(modeDepuisTonalite("F#")).toBeNull();
  });
});
