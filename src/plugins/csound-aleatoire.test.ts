// plugins/csound-aleatoire.test.ts — Le nœud, et ce que ses statistiques garantissent.
//
// Les lois sont éprouvées dans `audio/csound-aleatoire.test.ts`, sur des milliers de tirages. Ici on
// vérifie le câblage : que la partition sorte bien du MÊME écrivain que le traducteur — donc avec les
// quatre conventions de hauteur et le `e` final —, que la graine rende le tirage reproductible, et
// que le champ libre n'apparaisse que si on le demande.
import { describe, expect, it } from "vitest";
import { fiches } from "./csound-aleatoire";
import { constante } from "../audio/courbe";

const fiche = fiches.find((f) => f.id === "partition-aleatoire-csound")!;

function contexte(params: Record<string, string | number> = {}, entree: unknown = null) {
  const p: Record<string, string | number> = { "Graine": 42, "Durée": 10, "Densité": 6, ...params };
  return {
    noeud: { id: "n1", data: { ficheId: "partition-aleatoire-csound", parametres: p } },
    runtime: null,
    entree: () => entree,
    entrees: () => [entree],
    paramTexte: (nom: string, defaut: string) => String(p[nom] ?? defaut),
    paramNombre: (nom: string, defaut: number) => Number(p[nom] ?? defaut),
  };
}

/** Les lignes de notes d'une partition. */
const notes = (texte: string) =>
  texte.split("\n").map((l) => l.trim()).filter((l) => /^i\d/.test(l));

describe("le nœud Partition aléatoire Csound", () => {
  it("rend une partition valide, terminée par `e`", async () => {
    const res = await fiche.executer(contexte() as any);
    const texte = res.valeurs[0] as string;
    expect(notes(texte).length).toBeGreaterThan(30);
    for (const l of notes(texte)) expect(l, l).toMatch(/^i\d+ [\d.]+ [\d.]+ [\d.]+ [\d.]+ [\d.]+$/);
    expect(texte.trim().endsWith("e")).toBe(true);
    expect(texte).toContain("f0 ");
  });

  it("annonce le nombre RÉEL d'événements, et la signature de la loi", async () => {
    const res = await fiche.executer(contexte() as any);
    const compte = notes(res.valeurs[0] as string).length;
    expect(res.message).toContain(`${compte} événements`);
    // Poisson : le rapport écart-type/moyenne des intervalles tourne autour de 1.
    const rapport = Number(/rapport écart-type\/moyenne ([\d.]+)/.exec(res.message!)?.[1]);
    expect(rapport).toBeGreaterThan(0.7);
    expect(rapport).toBeLessThan(1.3);
    expect(res.valeurs[1]).toContain("processus de Poisson");
  });

  it("une GRILLE donne un rapport nul, et des intervalles réguliers", async () => {
    const res = await fiche.executer(contexte({ "Répartition": "grille", "Densité": 4 }) as any);
    expect(res.message).toContain("rapport écart-type/moyenne 0.00");
    const debuts = notes(res.valeurs[0] as string).map((l) => Number(l.split(" ")[1]));
    // Les débuts sont triés et espacés d'un quart de seconde.
    for (let i = 1; i < debuts.length; i++) expect(debuts[i] - debuts[i - 1]).toBeCloseTo(0.25, 6);
  });

  it("est REPRODUCTIBLE à graine fixée, et différent sinon", async () => {
    const a = await fiche.executer(contexte({ "Graine": 7 }) as any);
    const b = await fiche.executer(contexte({ "Graine": 7 }) as any);
    expect(a.valeurs[0]).toBe(b.valeurs[0]);
    const c = await fiche.executer(contexte({ "Graine": 8 }) as any);
    expect(c.valeurs[0]).not.toBe(a.valeurs[0]);
    expect(a.message).toContain("graine 7");
  });

  it("tire une graine quand on lui laisse le zéro, et la NOMME", async () => {
    const res = await fiche.executer(contexte({ "Graine": 0 }) as any);
    const graine = Number(/graine (\d+)/.exec(res.message!)?.[1]);
    expect(graine).toBeGreaterThan(0);
    // Recopiée, elle redonne la même partition : c'est tout l'intérêt de l'afficher.
    const repris = await fiche.executer(contexte({ "Graine": graine }) as any);
    expect(repris.valeurs[0]).toBe(res.valeurs[0]);
  });

  it("écrit la hauteur dans la convention demandée", async () => {
    const enPch = await fiche.executer(contexte({ "Hauteur": "pch", "Densité": 2 }) as any);
    // En pch, les hauteurs s'écrivent « octave.classe » avec deux décimales — et l'octave peut
    // avoir deux chiffres : le do6 est 10.00.
    for (const l of notes(enPch.valeurs[0] as string)) {
      const p4 = l.split(" ")[3];
      expect(p4, l).toMatch(/^\d{1,2}\.\d{2}$/);
    }
    const enHz = await fiche.executer(contexte({ "Densité": 2 }) as any);
    for (const l of notes(enHz.valeurs[0] as string)) {
      expect(Number(l.split(" ")[3])).toBeGreaterThan(20);
    }
  });

  it("répartit sur plusieurs instruments, et le dit", async () => {
    const res = await fiche.executer(contexte({ "Instruments": 3, "Durée": 30 }) as any);
    const numeros = new Set(notes(res.valeurs[0] as string).map((l) => l.split(" ")[0]));
    expect(numeros).toEqual(new Set(["i1", "i2", "i3"]));
    expect(res.valeurs[1]).toContain("par instrument : i1=");
  });

  it("n'ajoute le CHAMP LIBRE que si on le demande, à sa place et dans ses bornes", async () => {
    const sans = await fiche.executer(contexte({ "Densité": 2 }) as any);
    // Sans champ libre, p6 est le numéro de note : un entier entre 12 et 120.
    for (const l of notes(sans.valeurs[0] as string)) {
      const p6 = Number(l.split(" ")[5]);
      expect(Number.isInteger(p6)).toBe(true);
    }
    const avec = await fiche.executer(contexte({
      "Densité": 2, "Champ libre": "uniforme", "Libre min": 100, "Libre max": 200,
    }) as any);
    for (const l of notes(avec.valeurs[0] as string)) {
      const p6 = Number(l.split(" ")[5]);
      expect(p6).toBeGreaterThanOrEqual(100);
      expect(p6).toBeLessThanOrEqual(200);
    }
  });

  it("obéit à la gamme : aucune note hors des degrés choisis", async () => {
    const res = await fiche.executer(contexte({
      "Gamme": "pentatonique-majeure", "Densité": 8, "Durée": 20, "Hauteur": "midi",
    }) as any);
    const degres = [0, 2, 4, 7, 9];
    for (const l of notes(res.valeurs[0] as string)) {
      const note = Number(l.split(" ")[3]);
      expect(degres, `note ${note}`).toContain(((note % 12) + 12) % 12);
    }
  });

  it("la COURBE branchée amincit le nuage", async () => {
    const plein = await fiche.executer(contexte({ "Densité": 10, "Durée": 30 }) as any);
    const amincie = await fiche.executer(contexte({ "Densité": 10, "Durée": 30 }, constante(0.25, 30, 10)) as any);
    const n1 = notes(plein.valeurs[0] as string).length;
    const n2 = notes(amincie.valeurs[0] as string).length;
    expect(n2).toBeLessThan(n1 * 0.4);
    expect(n2).toBeGreaterThan(n1 * 0.15);
  });

  it("dit que le tirage est vide plutôt que de rendre une partition sans note", async () => {
    const res = await fiche.executer(contexte({ "Densité": 0.2, "Durée": 0.5 }, constante(0, 1, 10)) as any);
    expect(res.valeurs).toEqual([null, null]);
    expect(res.message).toContain("aucun événement");
  });
});
