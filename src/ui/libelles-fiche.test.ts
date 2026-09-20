// ui/libelles-fiche.test.ts — Ce qui s'affiche d'une fiche doit suivre la langue.
//
// Le défaut rapporté : l'infobulle d'un nœud dans le catalogue restait en français en
// anglais — elle lisait `resume` au lieu de `resumeEn`. La projection était recopiée à
// chaque endroit qui affiche une fiche, et celui-là l'avait oubliée. Ces tests tiennent
// la règle une fois pour toutes, et le dernier la vérifie sur le vrai registre : aucune
// fiche traduite ne doit ressortir en français quand la langue est l'anglais.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { nomFiche, noticeFiche, resumeFiche } from "./libelles-fiche";
import { toutesLesFiches } from "../plugins/index";
import type { FicheAudio } from "../audio/types-domaine";
import { enregistrerMeta } from "../core";
import { registre } from "../audio/adaptateur";

const FICHE = {
  nom: "Boîte à rythmes", nomEn: "Drum Machine",
  resume: "Génère une piste rythmique.", resumeEn: "Generates a drum pattern.",
  notice: "Notice longue en français.", noticeEn: "Long notice in English.",
};

describe("projection d'une fiche dans la langue affichée", () => {
  it("rend l'anglais en anglais — le défaut portait sur le résumé", () => {
    expect(resumeFiche(FICHE, "en")).toBe("Generates a drum pattern.");
    expect(nomFiche(FICHE, "en")).toBe("Drum Machine");
    expect(noticeFiche(FICHE, "en")).toBe("Long notice in English.");
  });

  it("rend le français en français, même quand la traduction existe", () => {
    expect(resumeFiche(FICHE, "fr")).toBe("Génère une piste rythmique.");
    expect(nomFiche(FICHE, "fr")).toBe("Boîte à rythmes");
    expect(noticeFiche(FICHE, "fr")).toBe("Notice longue en français.");
  });

  it("se rabat sur le français quand la traduction manque : une fiche doit s'afficher", () => {
    const sansTraduction = { nom: "Nœud maison", resume: "Fait quelque chose." };
    expect(nomFiche(sansTraduction, "en")).toBe("Nœud maison");
    expect(resumeFiche(sansTraduction, "en")).toBe("Fait quelque chose.");
    // Une traduction vide n'en est pas une.
    expect(resumeFiche({ resume: "Résumé.", resumeEn: "" }, "en")).toBe("Résumé.");
  });

  it("rend une chaîne vide, et non `undefined`, pour une notice absente", () => {
    expect(noticeFiche({}, "fr")).toBe("");
    expect(noticeFiche({}, "en")).toBe("");
  });
});

describe("fiche d'un méta-composant", () => {
  // Trouvé en vérifiant le catalogue anglais dans l'application : « Synthétiseur
  // soustractif », méta embarqué, y gardait son nom et son résumé français. La fiche
  // fabriquée par `enregistrerMeta` n'avait aucun champ anglais, et perdait au passage
  // le `nomEn` que le méta porte pourtant.
  const meta = {
    id: "meta-test-libelles",
    nom: "Synthétiseur soustractif", nomEn: "Subtractive Synthesizer",
    entrees: [], sorties: [{ nom: "Out 1", nomEn: "Out 1", type: "audio" as const }],
    mapEntrees: [], mapSorties: [],
    sousNoeuds: [{ id: "n1", position: { x: 0, y: 0 }, data: { ficheId: "oscillateur", parametres: {} } }],
    sousAretes: [],
  };

  it("s'affiche en anglais dans le catalogue anglais", () => {
    enregistrerMeta(meta as any);
    const def = registre.trouverDef(meta.id)!;
    expect(def).toBeTruthy();
    expect(nomFiche(def, "en")).toBe("Subtractive Synthesizer");
    expect(nomFiche(def, "fr")).toBe("Synthétiseur soustractif");
    expect(resumeFiche(def, "en")).toBe("Subgraph: 1 node(s), 0 input(s), 1 output(s).");
    expect(resumeFiche(def, "en")).not.toMatch(/[àâäçéèêëîïôöùûüÿœæ]/i);
    expect(noticeFiche(def, "en")).not.toMatch(/[àâäçéèêëîïôöùûüÿœæ]/i);
    expect(resumeFiche(def, "fr")).toMatch(/^Sous-graphe/);
  });
});

describe("sur le registre réel", () => {
  const fiches = toutesLesFiches as unknown as FicheAudio[];

  it("une fiche traduite ne ressort jamais en français en anglais", () => {
    const fautives = fiches
      .filter((f) => f.resumeEn && resumeFiche(f, "en") !== f.resumeEn)
      .map((f) => f.id);
    expect(fautives).toEqual([]);
  });

  it("et toutes rendent bien quelque chose dans les deux langues", () => {
    for (const f of fiches) {
      expect(resumeFiche(f, "fr"), f.id).toBeTruthy();
      expect(resumeFiche(f, "en"), f.id).toBeTruthy();
      expect(nomFiche(f, "en"), f.id).toBeTruthy();
    }
  });
});
