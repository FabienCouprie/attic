// plugins/csound-courbes.test.ts — Ce que la courbe pilote, dit là où on le lit.
//
// Fabien, le 2026-11-27 : « les nodes csounds pilotés par des courbes, ne disent pas ce que la
// courbe pilote ». Trois nœuds en reçoivent une, et chacun l'emploie autrement : la Partition Csound
// l'écrit dans les p-fields réglés sur « Courbe », la Partition aléatoire en module la densité, la
// Matrice en remplace le champ que « Champ piloté » désigne. Le port s'appelait « Courbe » sur les
// trois, et trois cas laissaient la courbe sans effet sans un mot : une courbe branchée qu'aucun
// p-field ne lit, une courbe branchée sous « Champ piloté » à « Aucun », que l'analyse disait même
// absente, et un « Champ piloté » réglé sans courbe. Une courbe de densité à zéro faisait conseiller
// de monter la densité.
//
// CE QUI EST TENU ICI : le nom du port, ce que le message en dit, et ce que la courbe fait vraiment
// de la partition écrite, lue par le chemin du moteur (`lancerFiche`).
import { describe, expect, it } from "vitest";
import { lancerFiche } from "../audio/lancer-fiche";
import { notesVersFichierMidi } from "../audio/midi-ecriture";
import type { Courbe } from "../audio/courbe";
import { fiches as fPartition } from "./csound-partition";
import { fiches as fAleatoire } from "./csound-aleatoire";
import { fiches as fMatrice } from "./matrice-parametres";

const partition = fPartition.find((f) => f.id === "partition-csound")!;
const aleatoire = fAleatoire.find((f) => f.id === "partition-aleatoire-csound")!;
const matrice = fMatrice.find((f) => f.id === "matrice-parametres")!;

/** Une rampe de `de` à `a` sur `secondes`, à deux cents valeurs par seconde. */
function rampe(de: number, a: number, secondes: number): Courbe {
  const n = Math.round(secondes * 200);
  return { valeurs: Float32Array.from({ length: n }, (_, i) => de + (a - de) * (i / (n - 1))), cadence: 200 };
}

/** Les lignes « i » d'une partition, en nombres. */
const lignesI = (texte: unknown) => String(texte).split("\n").filter((l) => l.startsWith("i"))
  .map((l) => l.slice(1).split(/\s+/).map(Number));

/** Quatre notes aux instants 0, 0,5, 1 et 1,5 s, puis une à 3 s, après la fin d'une courbe de 2 s. */
const midi = () => notesVersFichierMidi(
  [0, 0.5, 1, 1.5, 3].map((debut) => ({ note: 69, velocite: 100, debut, fin: debut + 0.25 })), 120);

describe("chaque port de courbe dit ce qu'il pilote", () => {
  it.each([
    ["partition-csound", partition, "Courbe des p-fields", "P-field curve"],
    ["partition-aleatoire-csound", aleatoire, "Courbe de densité", "Density curve"],
    ["matrice-parametres", matrice, "Courbe du champ piloté", "Driven field curve"],
  ] as const)("%s", (_id, fiche, nom, nomEn) => {
    const port = fiche.entrees.find((e) => e.type === "courbe");
    expect(port?.nom).toBe(nom);
    expect(port?.nomEn).toBe(nomEn);
  });
});

describe("Partition Csound : la courbe s'écrit dans les p-fields réglés sur « Courbe »", () => {
  it("à l'attaque de chaque note, telle quelle, et sa dernière valeur tient au-delà de sa fin", async () => {
    const r = await lancerFiche(partition, { p6: "courbe" }, { entrees: [midi(), rampe(0, 1, 2)] });
    expect(lignesI(r.valeurs[0]).map((l) => l[5])).toEqual([0, 0.2506, 0.5013, 0.7519, 1]);
    expect(r.message).toContain("courbe en p6");
  });

  it("deux champs réglés sur « Courbe » reçoivent la même valeur, et le message les nomme tous deux", async () => {
    const r = await lancerFiche(partition, { p4: "courbe", p7: "courbe" }, { entrees: [midi(), rampe(0, 1, 2)] });
    for (const l of lignesI(r.valeurs[0])) expect(l[3]).toBe(l[6]);
    expect(r.message).toContain("courbe en p4, p7");
  });

  it("UNE COURBE BRANCHÉE QU'AUCUN CHAMP NE LIT EST SIGNALÉE, au lieu d'être jetée sans un mot", async () => {
    const sans = await lancerFiche(partition, {}, { entrees: [midi(), null] });
    const avec = await lancerFiche(partition, {}, { entrees: [midi(), rampe(0, 1, 2)] });
    expect(avec.valeurs[0]).toBe(sans.valeurs[0]);
    expect(avec.message).toContain("n'est écrite dans aucun champ");
    expect(sans.message).not.toContain("courbe");
  });
});

describe("Partition aléatoire Csound : la courbe module la densité", () => {
  /** Le nombre d'événements écrits sur vingt graines, pour une courbe donnée. */
  async function compter(courbe: Courbe | null, reglages: Record<string, string | number> = {}): Promise<number> {
    let n = 0;
    for (let graine = 1; graine <= 20; graine++) {
      const r = await lancerFiche(aleatoire, { Durée: 20, Densité: 10, Graine: graine, ...reglages }, { entrees: [courbe] });
      n += lignesI(r.valeurs[0]).length;
    }
    return n;
  }

  it("à 0,5, la moitié des événements de la courbe à 1 ; au-dessus de 1, autant qu'à 1", async () => {
    const plein = await compter(rampe(1, 1, 20));
    expect((await compter(rampe(0.5, 0.5, 20))) / plein).toBeGreaterThan(0.45);
    expect((await compter(rampe(0.5, 0.5, 20))) / plein).toBeLessThan(0.55);
    expect(await compter(rampe(2, 2, 20))).toBe(plein);
  });

  // DÉCISION DE FABIEN DU 2026-11-27, « Oui, un flux à part » : l'amincissement tirait du même flux
  // que les hauteurs et les durées, si bien qu'une courbe à 1 rendait une autre partition.
  it.each(["poisson", "grille"])("UNE COURBE À 1 REDONNE LA PARTITION SANS COURBE, à la même graine (%s)", async (repartition) => {
    const reglages = { Durée: 20, Densité: 10, Graine: 3, Répartition: repartition };
    const sans = await lancerFiche(aleatoire, reglages, { entrees: [null] });
    const avec = await lancerFiche(aleatoire, reglages, { entrees: [rampe(1, 1, 20)] });
    expect(lignesI(avec.valeurs[0]).length).toBeGreaterThan(100);
    expect(avec.valeurs[0]).toBe(sans.valeurs[0]);
  });

  it("UNE COURBE DE DENSITÉ À ZÉRO EST NOMMÉE, au lieu d'envoyer monter la densité", async () => {
    // Cinq secondes de zéro : sa dernière valeur tient jusqu'à la fin des vingt secondes.
    const r = await lancerFiche(aleatoire, { Durée: 20, Densité: 10, Graine: 1 }, { entrees: [rampe(0, 0, 5)] });
    expect(r.valeurs).toEqual([null, null]);
    expect(r.message).toContain("la courbe de densité vaut zéro");
    expect(r.message).not.toContain("augmentez");
  });
});

describe("Matrice de paramètres : la courbe remplace le champ piloté", () => {
  const base = { p4: "0.3", p5: "200:2000", "Événements": 5, "Départs": "0:2" };

  const bornes = { ...base, "Champ piloté": "5", Minimum: 100, Maximum: 1000 };
  const p5 = async (courbe: Courbe) =>
    lignesI((await lancerFiche(matrice, bornes, { entrees: [courbe] })).valeurs[0]).map((l) => Math.round(l[4]));

  it("0 devient « Minimum », 1 « Maximum », et le message nomme le champ remplacé", async () => {
    const r = await lancerFiche(matrice, bornes, { entrees: [rampe(0, 1, 10)] });
    expect(lignesI(r.valeurs[0]).map((l) => Math.round(l[4]))).toEqual([100, 325, 550, 775, 1000]);
    expect(r.message).toContain("courbe en p5");
  });

  // DÉCISION DE FABIEN DU 2026-11-27, « Oui, la convention » : la courbe était étalée de son propre
  // minimum à son propre maximum, et ces deux cas rendaient 100 à 1000, puis 550 partout.
  it("UNE COURBE DE 0,48 À 0,52 N'ÉCRIT QUE SA TRANCHE, et une courbe constante sa valeur", async () => {
    expect(await p5(rampe(0.48, 0.52, 10))).toEqual([532, 541, 550, 559, 568]);
    expect(await p5(rampe(0.3, 0.3, 10))).toEqual([370, 370, 370, 370, 370]);
    expect(await p5(rampe(-1, 2, 10))).toEqual([100, 100, 550, 1000, 1000]);
  });

  it("UNE COURBE BRANCHÉE SOUS « Champ piloté » À « Aucun » EST SIGNALÉE, et l'analyse ne la dit plus absente", async () => {
    const r = await lancerFiche(matrice, { ...base }, { entrees: [rampe(0, 1, 10)] });
    expect(r.message).toContain("elle ne remplace rien");
    expect(String(r.valeurs[1])).not.toContain("aucune courbe branchée");
  });

  it("UN « Champ piloté » RÉGLÉ SANS COURBE EST SIGNALÉ, et le champ garde son texte", async () => {
    const r = await lancerFiche(matrice, { ...base, "Champ piloté": "5" }, { entrees: [null] });
    expect(lignesI(r.valeurs[0]).map((l) => l[4])).toEqual([200, 650, 1100, 1550, 2000]);
    expect(r.message).toContain("aucune courbe n'est branchée");
  });
});
