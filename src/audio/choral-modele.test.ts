// audio/choral-modele.test.ts — L'instrument qui mesure sa propre cécité : un modèle appris sur des chorals
// écrits par les règles, appliqué seul à des sopranos neufs, jugé par le vérificateur.
//
// LA RÉPONSE EST CONNUE : le corpus a été écrit sans quintes ni octaves parallèles. Un modèle qui a
// appris ce corpus doit les éviter à son tour, sans que la règle lui soit dite.
//
// LE PLAN SUPPOSAIT QUE LES DIAGONALES LES PORTAIENT, ET LA MESURE L'A DÉMENTI, sur 40 sopranos neufs
// (2026-11-22) : les règles seules rendent 5 erreurs et 0 parallèle ; le modèle seul 11 erreurs et 3
// parallèles ; sans ses diagonales, 9 et 2 ; sans ses horizontales, 48 et 15 ; sans les unes ni les
// autres, 27 et 0, chaque colonne choisie seule ; ses biais seuls, 64 et 21. Ce sont donc les
// matrices horizontales, une voix et elle-même d'une colonne à la suivante, qui tiennent les
// parallèles, et c'est elles que la faute plantée éteint.
//
// MESURÉ DE NOUVEAU LE 2026-11-25, quand la septième tenue à travers un changement d'accord s'est mise à
// coûter : le corpus, écrit par les règles, change avec elles, et le modèle qu'il apprend aussi. Règles
// seules 4 erreurs et 0 parallèle ; modèle seul 12 et 5 ; sans ses diagonales, 2 et 1 ; sans ses
// horizontales, 16 et 8 ; ses horizontales éteintes, 67 et 36. Les bornes suivent ce relevé.

import { describe, expect, it } from "vitest";
import { apprendreSurCorpus } from "./champ-apprentissage";
import { corpusDEssaiParLesRegles, sopranoDEssai } from "./choral-corpus-essai";
import { estRefusHarmonisation, harmoniserChoral } from "./choral-harmoniser";
import { estRefusChoral, verifierChoral } from "./choral-verifier";
import { etatsDe } from "./champ-paires";
import { dispositionDuModele, type ModeleHarmonique } from "./modele-harmonique";
import { rangsDuFaisceau } from "./choral-modele";

const SOPRANOS_NEUFS = Array.from({ length: 40 }, (_, k) => sopranoDEssai(90_000 + k));

/** Les fautes que le juge relève sur les sopranos neufs, harmonisés à cette part des règles. */
async function fautes(modele: ModeleHarmonique | null, partDesRegles: number) {
  let erreurs = 0, paralleles = 0;
  for (const soprano of SOPRANOS_NEUFS) {
    const r = await harmoniserChoral(soprano, {
      tonique: 0, mode: "majeur", pas: 1, septiemes: "dominante", renversements: true, temperature: 0, graine: 1,
      ...(modele ? { modele: { modele, partDesRegles, faisceau: 0 } } : {}),
    });
    if (estRefusHarmonisation(r)) throw new Error("refus");
    const v = verifierChoral({ notes: r.notes, tempo: 60 }, { tonique: 0, mode: "majeur", tempo: 60, tempsParMesure: 4 });
    if (estRefusChoral(v)) throw new Error("refus du juge");
    for (const i of v.infractions.filter((x) => x.gravite === "erreur")) {
      erreurs++;
      if (i.regle === "quintes" || i.regle === "octaves") paralleles++;
    }
  }
  return { erreurs, paralleles };
}

describe("un modèle appris sur des chorals écrits par les règles", async () => {
  const corpus = await corpusDEssaiParLesRegles(80, 7);
  const modele = apprendreSurCorpus({
    corpus, mode: "majeur", pas: 1, voisinages: { vertical: true, horizontal: true, diagonal: true },
    penalite: 0.0002, passes: 200, partValidation: 0, graine: 1,
  }).modele!;
  const regles = await fautes(null, 1);
  const seul = await fautes(modele, 0);

  it("seul, il évite presque toutes les quintes et octaves parallèles que le corpus évitait", () => {
    expect(regles.paralleles).toBe(0);
    expect(seul.paralleles).toBeLessThanOrEqual(5);
    expect(seul.erreurs).toBeLessThanOrEqual(12);
  });

  it("ses matrices horizontales éteintes, les parallèles reviennent", async () => {
    const d = dispositionDuModele(modele);
    const aveugle: ModeleHarmonique = { ...modele, theta: Float64Array.from(modele.theta) };
    for (let v = 0; v < 4; v++) aveugle.theta.fill(0, d.horizontales[v], d.horizontales[v] + etatsDe(d, v) ** 2);
    expect((await fautes(aveugle, 0)).paralleles).toBeGreaterThanOrEqual(seul.paralleles + 10);
  });

  it("à part entière pour les règles, il ne change rien", async () => {
    expect(await fautes(modele, 1)).toEqual(regles);
  });

  it("le faisceau garde les colonnes de moindre coût, dans leur ordre", () => {
    expect(rangsDuFaisceau([5, 1, 4, 1, 9], 2)).toEqual([1, 3]);
    expect(rangsDuFaisceau([5, 1, 4], 0)).toEqual([0, 1, 2]);
  });
});
