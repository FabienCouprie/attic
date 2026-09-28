// audio/accord-gamme.test.ts — La jointure est-elle sûre ?
//
// CE QUE CE FICHIER TIENT, ET POURQUOI IL EST COURT. La table dit quelles gammes une qualité ouvre ;
// le jugement n'y porte que sur l'ORDRE, la littérature nommant la première. Le reste se vérifie
// mécaniquement, et c'est ce qui fait la différence entre une nomenclature et une opinion : une
// gamme qui ne contiendrait pas toutes les notes de son accord ne peut pas entrer.
//
// LES TROIS PORTES. Aucune qualité n'est oubliée, aucun identifiant n'est inventé, et chaque gamme
// nommée contient son accord. Une quatrième tient l'utilité de la jointure : sur un accord, les
// notes de passage sont les notes de la gamme qui ne sont pas dans l'accord, et il doit y en avoir.
import { describe, expect, it } from "vitest";

import {
  ACCORD_GAMME, gammeDeQualite, gammesDeQualite, notesDePassage, notesDisponibles,
} from "./accord-gamme";
import { GAMMES, degresDeGamme, gammeDe } from "./gammes";
import { QUALITES, qualiteDe } from "./qualites-accords";

const classes = (xs: readonly number[]) => new Set(xs.map((x) => ((x % 12) + 12) % 12));

describe("la jointure des accords et des gammes", () => {
  it("CHAQUE QUALITÉ A SON ENTRÉE, et il n'y en a pas deux", () => {
    // Une qualité oubliée serait une qualité sans notes disponibles, donc sans mélodie possible.
    const dansLaTable = ACCORD_GAMME.map((e) => e.qualite);
    expect([...dansLaTable].sort()).toEqual(QUALITES.map((q) => q.id).sort());
    expect(new Set(dansLaTable).size).toBe(dansLaTable.length);
  });

  it("AUCUN IDENTIFIANT N'EST INVENTÉ, ni de qualité ni de gamme", () => {
    const fautifs: string[] = [];
    for (const e of ACCORD_GAMME) {
      if (!qualiteDe(e.qualite)) fautifs.push(`qualité inconnue : ${e.qualite}`);
      if (e.gammes.length === 0) fautifs.push(`${e.qualite} : aucune gamme`);
      for (const g of e.gammes) if (!gammeDe(g)) fautifs.push(`${e.qualite} : gamme inconnue ${g}`);
    }
    expect(fautifs).toEqual([]);
  });

  it("CHAQUE GAMME NOMMÉE CONTIENT TOUTES LES NOTES DE SON ACCORD, et c'est la règle entière", () => {
    // LA PORTE QUI FAIT LA SÛRETÉ DE LA TABLE. Une gamme qui ne contient pas la tierce de son
    // accord donnerait une mélodie qui contredit l'harmonie à chaque note de passage.
    const fautifs: string[] = [];
    for (const e of ACCORD_GAMME) {
      const notes = classes(qualiteDe(e.qualite)!.intervalles);
      for (const g of e.gammes) {
        const degres = classes(degresDeGamme(g));
        const manquantes = [...notes].filter((n) => !degres.has(n)).sort((a, b) => a - b);
        if (manquantes.length) fautifs.push(`${e.qualite} sur ${g} : il manque ${manquantes.join(", ")}`);
      }
    }
    expect(fautifs).toEqual([]);
  });

  it("ET LE CAS MORD : la gamme altérée ne contient pas la quinte juste", () => {
    // Le témoin de la porte précédente. La littérature nomme l'altérée sur une septième neuvième
    // augmentée, mais l'accord tel que la table l'écrit porte sa quinte : c'est la diminuée
    // demi-ton qui le contient, et c'est elle que la table nomme.
    expect(classes(degresDeGamme("alteree")).has(7)).toBe(false);
    expect(classes(qualiteDe("7s9")!.intervalles).has(7)).toBe(true);
    expect(gammeDeQualite("7s9")).toBe("diminuee-demi-ton");
  });

  it("TROIS QUALITÉS N'ONT QU'UNE SEULE GAMME DANS TOUT LE CATALOGUE", () => {
    // Elles sont sans ambiguïté, et le dire vaut mieux que le laisser découvrir. Si une gamme
    // ajoutée en contenait une, ce cas le signalerait plutôt que de la laisser passer inaperçue.
    const seules = ACCORD_GAMME.filter((e) => e.gammes.length === 1).map((e) => e.qualite);
    expect(seules.sort()).toEqual(["7s5s9", "7s9", "dim7", "m13", "maj9s11"].sort());
  });

  it("SUR CHAQUE ACCORD IL RESTE DES NOTES DE PASSAGE, sauf une, et elle a sa raison", () => {
    // UNE SEULE EXCEPTION, ET C'EST UN FAIT DE THÉORIE, non un trou de la table : la mineure
    // treizième EST le dorien, note pour note. Sept sons dans l'accord, sept degrés dans la gamme :
    // toute note disponible est une note de l'accord, et une mélodie posée dessus n'a pas de note
    // étrangère à sa disposition. Un composant qui distingue appuis et passages doit le savoir.
    const sansPassage = ACCORD_GAMME
      .filter((e) => notesDePassage(e.qualite).length === 0)
      .map((e) => e.qualite);
    expect(sansPassage, "toute autre qualité doit laisser des notes de passage").toEqual(["m13"]);
    expect([...classes(qualiteDe("m13")!.intervalles)].sort((a, b) => a - b))
      .toEqual([...classes(degresDeGamme("dorien"))].sort((a, b) => a - b));
  });

  it("les notes de passage et les notes de l'accord font la gamme, et ne se recouvrent pas", () => {
    for (const e of ACCORD_GAMME) {
      const accord = classes(qualiteDe(e.qualite)!.intervalles);
      const passage = new Set(notesDePassage(e.qualite));
      const gamme = new Set(notesDisponibles(e.qualite));
      for (const n of passage) expect(accord.has(n), `${e.qualite} : ${n} est dans l'accord`).toBe(false);
      expect(new Set([...passage, ...[...accord].filter((n) => gamme.has(n))]).size).toBe(gamme.size);
    }
  });

  it("une gamme imposée l'emporte, et une qualité inconnue retombe sur le majeur", () => {
    expect(notesDisponibles("maj", "lydien")).toEqual(degresDeGamme("lydien"));
    expect(gammeDeQualite("cette-qualite-n-existe-pas")).toBe("majeur");
    expect(gammesDeQualite("cette-qualite-n-existe-pas")).toEqual([]);
  });

  it("LA TABLE SUIT LE CATALOGUE : autant d'entrées que de qualités, et les gammes en viennent", () => {
    // Un plancher, pour qu'une table vidée ne fasse pas passer tout le fichier au vert.
    expect(ACCORD_GAMME.length).toBe(QUALITES.length);
    expect(QUALITES.length).toBeGreaterThanOrEqual(33);
    const employees = new Set(ACCORD_GAMME.flatMap((e) => [...e.gammes]));
    for (const g of employees) expect(GAMMES.some((x) => x.id === g), `${g} doit venir de la table`).toBe(true);
  });
});
