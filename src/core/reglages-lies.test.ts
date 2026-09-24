// core/reglages-lies.test.ts — La liaison ajuste ce qui n'a pas été choisi, et rien d'autre.
//
// CE QUI EST TENU :
//   1. PASSER À LA LOGISTIQUE PORTE LA FRÉQUENCE À HUIT PAS PAR SECONDE. C'est le défaut qui
//      manquait : à 0,5, la suite ne donnait que cinq paliers sur dix secondes.
//   2. UNE VALEUR CHOISIE N'EST JAMAIS RÉÉCRITE. C'est la seule condition qui rend la liaison
//      acceptable : qui a mis 3 Hz garde 3 Hz en changeant de forme.
//   3. LE RETOUR À UN OSCILLATEUR REVIENT À 0,5, symétriquement.
//   4. AUCUN AUTRE COMPOSANT, ET AUCUN AUTRE RÉGLAGE, n'est touché.
import { describe, expect, it } from "vitest";

import {
  FREQUENCE_CYCLES_PAR_SECONDE, FREQUENCE_PAS_PAR_SECONDE, reglagesApresChangement,
} from "./reglages-lies";

const COURBE = "generateur-courbe";

describe("la liaison forme / fréquence du composant Courbe", () => {
  it("PASSER À LA LOGISTIQUE porte la fréquence aux pas par seconde", () => {
    const avant = { Forme: "sinus", "Fréquence": FREQUENCE_CYCLES_PAR_SECONDE, Chaos: 3.9 };
    const apres = reglagesApresChangement(COURBE, avant, "Forme", "logistique");
    expect(apres.Forme).toBe("logistique");
    expect(apres["Fréquence"]).toBe(FREQUENCE_PAS_PAR_SECONDE);
    expect(apres.Chaos, "les autres réglages ne bougent pas").toBe(3.9);
  });

  it("la marche aléatoire suit la même règle : elle compte aussi des pas", () => {
    const apres = reglagesApresChangement(
      COURBE, { Forme: "sinus", "Fréquence": FREQUENCE_CYCLES_PAR_SECONDE }, "Forme", "aleatoire");
    expect(apres["Fréquence"]).toBe(FREQUENCE_PAS_PAR_SECONDE);
  });

  it("UNE VALEUR CHOISIE N'EST JAMAIS RÉÉCRITE", () => {
    const avant = { Forme: "sinus", "Fréquence": 3 };
    const apres = reglagesApresChangement(COURBE, avant, "Forme", "logistique");
    expect(apres["Fréquence"], "qui a mis 3 Hz garde 3 Hz").toBe(3);
  });

  it("LE RETOUR À UN OSCILLATEUR revient à des cycles par seconde", () => {
    const avant = { Forme: "logistique", "Fréquence": FREQUENCE_PAS_PAR_SECONDE };
    const apres = reglagesApresChangement(COURBE, avant, "Forme", "triangle");
    expect(apres["Fréquence"]).toBe(FREQUENCE_CYCLES_PAR_SECONDE);
  });

  it("passer d'une forme à pas à une autre ne change rien", () => {
    const avant = { Forme: "logistique", "Fréquence": FREQUENCE_PAS_PAR_SECONDE };
    expect(reglagesApresChangement(COURBE, avant, "Forme", "aleatoire")["Fréquence"])
      .toBe(FREQUENCE_PAS_PAR_SECONDE);
  });

  it("changer un AUTRE réglage ne déclenche rien", () => {
    const avant = { Forme: "logistique", "Fréquence": FREQUENCE_CYCLES_PAR_SECONDE };
    const apres = reglagesApresChangement(COURBE, avant, "Chaos", 3.5);
    expect(apres["Fréquence"], "seule la forme déclenche").toBe(FREQUENCE_CYCLES_PAR_SECONDE);
    expect(apres.Chaos).toBe(3.5);
  });

  it("UN AUTRE COMPOSANT n'est pas concerné, même avec les mêmes noms de réglages", () => {
    const avant = { Forme: "sinus", "Fréquence": FREQUENCE_CYCLES_PAR_SECONDE };
    const apres = reglagesApresChangement("oscillateur", avant, "Forme", "logistique");
    expect(apres["Fréquence"]).toBe(FREQUENCE_CYCLES_PAR_SECONDE);
  });

  it("l'objet reçu n'est jamais modifié", () => {
    const avant = Object.freeze({ Forme: "sinus", "Fréquence": FREQUENCE_CYCLES_PAR_SECONDE });
    const apres = reglagesApresChangement(COURBE, avant, "Forme", "logistique");
    expect(avant["Fréquence"]).toBe(FREQUENCE_CYCLES_PAR_SECONDE);
    expect(apres).not.toBe(avant);
  });
});
