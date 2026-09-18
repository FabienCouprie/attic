// ui/parametre-modifie.test.ts — Ce qui compte comme « valeur modifiée ».
//
// L'inspecteur affichait une valeur réglée exactement comme une valeur par défaut :
// devant un nœud à vingt paramètres, rien ne disait lesquels avaient été touchés. Un
// point de couleur le dit maintenant — encore faut-il qu'il ne s'allume pas à tort.
//
// Les pièges tenus ici sont ceux des projets enregistrés : un nombre relu sous forme de
// chaîne, un choix stocké sous son libellé français quand le défaut est un identifiant,
// un défaut qui change avec la langue.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { libelleDefaut, parametreModifie, valeurDefaut } from "./parametre-modifie";
import { toutesLesFiches } from "../plugins/index";
import type { FicheAudio } from "../audio/types-domaine";

const CURSEUR = { nom: "Tempo", type: "curseur", defaut: 110, plage: [40, 240] as [number, number] };
const GENRE = {
  nom: "Genre", type: "choix",
  options: ["pop", "rock", "jazz"],
  optionsEn: ["Pop", "Rock", "Jazz"],
  optionIds: ["pop", "rock", "jazz"],
  defaut: "pop", defautEn: "pop",
};
const TEXTE = { nom: "Progression", type: "texte", defaut: "I-V-vi-IV", defautEn: "I-V-vi-IV" };

describe("valeur inchangée", () => {
  it("un paramètre absent vaut son défaut", () => {
    expect(parametreModifie(CURSEUR, {})).toBe(false);
    expect(parametreModifie(CURSEUR, undefined)).toBe(false);
    expect(parametreModifie(CURSEUR, { Tempo: undefined })).toBe(false);
  });

  it("un nombre relu sous forme de chaîne reste le même nombre", () => {
    // C'est ainsi qu'un projet enregistré revient parfois : « 110 » et non 110.
    expect(parametreModifie(CURSEUR, { Tempo: "110" })).toBe(false);
    expect(parametreModifie(CURSEUR, { Tempo: 110 })).toBe(false);
    expect(parametreModifie(CURSEUR, { Tempo: 110.0000000001 })).toBe(false);
  });

  it("un choix stocké sous son libellé vaut son identifiant", () => {
    expect(parametreModifie(GENRE, { Genre: "pop" })).toBe(false);
    expect(parametreModifie({ ...GENRE, options: ["Pop", "Rock", "Jazz"] }, { Genre: "Pop" })).toBe(false);
  });

  it("un texte égal à son défaut n'est pas modifié, dans les deux langues", () => {
    expect(parametreModifie(TEXTE, { Progression: "I-V-vi-IV" }, "fr")).toBe(false);
    expect(parametreModifie(TEXTE, { Progression: "I-V-vi-IV" }, "en")).toBe(false);
  });
});

describe("valeur modifiée", () => {
  it("repère un nombre changé, même d'un pas", () => {
    expect(parametreModifie(CURSEUR, { Tempo: 120 })).toBe(true);
    expect(parametreModifie(CURSEUR, { Tempo: "111" })).toBe(true);
  });

  it("repère un choix changé, quelle que soit la forme stockée", () => {
    expect(parametreModifie(GENRE, { Genre: "jazz" })).toBe(true);
    expect(parametreModifie(GENRE, { Genre: "Jazz" })).toBe(true); // libellé anglais
  });

  it("repère un texte changé, espace compris", () => {
    expect(parametreModifie(TEXTE, { Progression: "ii-V-I" })).toBe(true);
    expect(parametreModifie(TEXTE, { Progression: "I-V-vi-IV " })).toBe(true);
    // Vider un champ est une modification, pas un retour au défaut.
    expect(parametreModifie(TEXTE, { Progression: "" })).toBe(true);
  });

  it("tient compte de la langue quand le défaut en dépend", () => {
    const p = { nom: "Note", type: "texte", defaut: "La3", defautEn: "A4" };
    expect(parametreModifie(p, { Note: "A4" }, "en")).toBe(false);
    expect(parametreModifie(p, { Note: "A4" }, "fr")).toBe(true);
  });
});

describe("valeur écrite par le bouton « remettre le défaut »", () => {
  it("écrit l'identifiant d'un choix, comme le fait le menu déroulant", () => {
    const p = { ...GENRE, options: ["Pop", "Rock", "Jazz"], optionIds: ["pop", "rock", "jazz"] };
    expect(valeurDefaut(p)).toBe("pop");
  });

  it("écrit un nombre, et non sa chaîne", () => {
    expect(valeurDefaut(CURSEUR)).toBe(110);
    expect(typeof valeurDefaut(CURSEUR)).toBe("number");
  });

  it("écrit le texte de la langue affichée", () => {
    const p = { nom: "Note", type: "texte", defaut: "La3", defautEn: "A4" };
    expect(valeurDefaut(p, "fr")).toBe("La3");
    expect(valeurDefaut(p, "en")).toBe("A4");
  });

  it("éteint le point : ce qu'elle écrit n'est plus une modification", () => {
    for (const p of [CURSEUR, GENRE, TEXTE]) {
      expect(parametreModifie(p, { [p.nom]: valeurDefaut(p) }), p.nom).toBe(false);
    }
  });

  // Le test qui compte vraiment : la promesse doit tenir sur TOUS les paramètres de
  // l'application, dans les deux langues. Un seul type mal traité — un choix sans
  // `optionIds`, un défaut absent, une unité exotique — et le point resterait allumé
  // après un clic censé le remettre, ce qui est pire que pas de bouton du tout.
  it("tient sur les paramètres de toutes les fiches, dans les deux langues", () => {
    const fiches = toutesLesFiches as unknown as FicheAudio[];
    const fautifs: string[] = [];
    for (const f of fiches) {
      for (const p of f.parametres ?? []) {
        for (const lang of ["fr", "en"]) {
          const v = valeurDefaut(p as any, lang);
          if (parametreModifie(p as any, { [p.nom]: v }, lang)) {
            fautifs.push(`${f.id}/${p.nom} (${lang}) → ${JSON.stringify(v)}`);
          }
        }
      }
    }
    expect(fautifs).toEqual([]);
  });
});

describe("libellé du défaut, pour l'infobulle", () => {
  it("donne le libellé d'un choix, et non son identifiant", () => {
    const p = { ...GENRE, options: ["Pop", "Rock", "Jazz"], optionIds: ["pop", "rock", "jazz"] };
    expect(libelleDefaut(p, "fr")).toBe("Pop");
    expect(libelleDefaut(p, "en")).toBe("Pop");
  });

  it("donne le nombre ou le texte tel quel", () => {
    expect(libelleDefaut(CURSEUR)).toBe("110");
    expect(libelleDefaut(TEXTE)).toBe("I-V-vi-IV");
  });

  it("écrit un tiret plutôt que rien quand le défaut est vide", () => {
    expect(libelleDefaut({ nom: "Vide", type: "texte", defaut: "" })).toBe("—");
    expect(libelleDefaut({ nom: "Sans", type: "texte" })).toBe("—");
  });
});
