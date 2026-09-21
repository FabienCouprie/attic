// quiz/catalogue.test.ts — Les questions engendrées, éprouvées deux fois : sur un catalogue d'essai
// et sur le VRAI.
//
// POURQUOI LES DEUX. Le catalogue d'essai éprouve les RÈGLES — leurres de même famille, résumés en
// double écartés, nœuds internes ignorés — sur une liste assez petite pour qu'on la lise. Le vrai
// catalogue éprouve une autre chose, qu'aucune liste écrite à la main ne peut éprouver : que ces
// règles tiennent sur trois cents fiches réelles, dont certaines partagent leur résumé, d'autres
// sont seules dans leur famille, et d'autres encore n'ont pas de nom anglais.
//
// LE TEST QUI COMPTE est celui de l'unicité : une question à deux bonnes réponses est la faute la
// plus grave qu'un quiz puisse commettre, et c'est exactement ce qu'un catalogue engendré peut
// produire en silence le jour où deux nœuds se retrouvent avec le même résumé.
import { describe, expect, it } from "vitest";
import { questionsCatalogue, type FicheQuiz } from "./catalogue";
import { toutesLesFiches } from "../plugins";
import { choixLangue } from "./types";

const fiche = (id: string, nom: string, resume: string, univers: string, famille: string): FicheQuiz =>
  ({ id, nom, nomEn: `${nom} EN`, resume, resumeEn: `${resume} EN`, univers, famille });

const ESSAI: FicheQuiz[] = [
  fiche("a", "Alpha", "fait ceci", "Traitement", "Effets"),
  fiche("b", "Beta", "fait cela", "Traitement", "Effets"),
  fiche("c", "Gamma", "fait autrement", "Traitement", "Effets"),
  fiche("d", "Delta", "fait encore autre chose", "Traitement", "Effets"),
  fiche("e", "Epsilon", "analyse quelque chose", "Traitement", "Analyse"),
  fiche("f", "Zeta", "range des fichiers", "Sorties", "Export"),
  fiche("g", "Eta", "montre une image", "Visualisation", "Image"),
  fiche("h", "Theta", "fait ceci", "Traitement", "Effets"), // résumé en double avec « a »
  fiche("__interne", "Interne", "ne compte pas", "Autres", "Test zone"),
  fiche("meta-truc", "Méta", "ne compte pas non plus", "Méta-composants", "Sous-graphes"),
];

describe("sur un catalogue d'essai", () => {
  const qs = questionsCatalogue(ESSAI);

  it("écarte les nœuds internes", () => {
    const texte = JSON.stringify(qs);
    expect(texte).not.toContain("Interne");
    expect(texte).not.toContain("Méta");
  });

  it("ÉCARTE LES RÉSUMÉS EN DOUBLE, qui donneraient deux bonnes réponses", () => {
    // « fait ceci » est le résumé de Alpha ET de Theta : aucune question d'identification ne doit
    // porter là-dessus. Les questions de famille, elles, restent possibles.
    expect(qs.some((q) => q.id === "catalogue-nom-a")).toBe(false);
    expect(qs.some((q) => q.id === "catalogue-nom-h")).toBe(false);
    expect(qs.some((q) => q.id === "catalogue-nom-b")).toBe(true);
    expect(qs.some((q) => q.id === "catalogue-famille-a")).toBe(true);
  });

  it("prend les leurres DANS LA MÊME FAMILLE quand elle en compte assez", () => {
    const q = qs.find((x) => x.id === "catalogue-nom-b");
    expect(q).toBeDefined();
    const noms = new Map(ESSAI.map((f) => [f.nom, f.famille]));
    for (const c of q!.choix) expect(noms.get(c)).toBe("Effets");
  });

  it("la bonne réponse est en tête, et les propositions sont distinctes", () => {
    for (const q of qs) {
      expect(new Set(q.choix).size).toBe(q.choix.length);
      if (q.choixEn) expect(new Set(q.choixEn).size).toBe(q.choixEn.length);
    }
    expect(qs.find((x) => x.id === "catalogue-famille-e")!.choix[0]).toBe("Analyse");
    expect(qs.find((x) => x.id === "catalogue-nom-b")!.choix[0]).toBe("Beta");
  });

  it("rend exactement la même chose deux fois : rien n'est tiré au sort ici", () => {
    expect(questionsCatalogue(ESSAI)).toEqual(qs);
  });

  it("ne compte pas les nœuds d'un catalogue trop petit", () => {
    expect(qs.some((q) => q.id === "catalogue-nombre")).toBe(false);
  });
});

describe("sur le vrai catalogue", () => {
  const fiches: FicheQuiz[] = (toutesLesFiches as unknown as FicheQuiz[]).map((f) => ({
    id: f.id, nom: f.nom, nomEn: f.nomEn, resume: f.resume, resumeEn: f.resumeEn,
    univers: f.univers, famille: f.famille,
  }));
  const qs = questionsCatalogue(fiches);

  it("EN ENGENDRE PLUSIEURS CENTAINES, sans qu'aucune n'ait été écrite à la main", () => {
    expect(qs.length).toBeGreaterThan(400);
  });

  it("aucune question n'a deux propositions identiques, dans aucune des deux langues", () => {
    const fautes: string[] = [];
    for (const q of qs) {
      for (const en of [false, true]) {
        const choix = choixLangue(q, en);
        if (new Set(choix).size !== choix.length) fautes.push(`${q.id} (${en ? "en" : "fr"}) : ${choix.join(" · ")}`);
        if (choix.length !== 4) fautes.push(`${q.id} : ${choix.length} propositions`);
      }
    }
    expect(fautes).toEqual([]);
  });

  it("la bonne réponse est bien celle du registre", () => {
    const parNom = new Map(fiches.map((f) => [f.nom, f]));
    const fautes: string[] = [];
    for (const q of qs) {
      if (q.id.startsWith("catalogue-famille-")) {
        const f = fiches.find((x) => x.id === q.id.slice("catalogue-famille-".length));
        if (f && q.choix[0] !== f.famille) fautes.push(`${q.id} : ${q.choix[0]} au lieu de ${f.famille}`);
      } else if (q.id.startsWith("catalogue-nom-")) {
        const f = fiches.find((x) => x.id === q.id.slice("catalogue-nom-".length));
        if (f && q.choix[0] !== f.nom) fautes.push(`${q.id} : ${q.choix[0]} au lieu de ${f.nom}`);
        if (f && !q.enonce.includes(f.resume)) fautes.push(`${q.id} : l'énoncé ne porte pas le résumé`);
      }
      if (!parNom.has(q.choix[0]) && q.id.startsWith("catalogue-nom-")) fautes.push(`${q.id} : nom inconnu`);
    }
    expect(fautes).toEqual([]);
  });

  it("les deux langues sont remplies partout", () => {
    for (const q of qs) {
      expect(q.enonceEn.length, q.id).toBeGreaterThan(5);
      expect(q.pourquoiEn.length, q.id).toBeGreaterThan(5);
      expect(q.choixEn?.length, q.id).toBe(4);
    }
  });

  it("compte les nœuds, et le chiffre suit le registre", () => {
    const nombre = qs.find((q) => q.id === "catalogue-nombre");
    expect(nombre).toBeDefined();
    const attendu = fiches.filter((f) => !f.id.startsWith("__") && !f.id.startsWith("meta-")
      && !f.id.startsWith("frontiere") && f.nom && f.resume.trim()).length;
    expect(nombre!.pourquoi).toContain(String(attendu));
  });
});
