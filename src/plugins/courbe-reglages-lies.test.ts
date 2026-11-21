// plugins/courbe-reglages-lies.test.ts — La liaison forme / fréquence de « Courbe », sur la vraie fiche.
//
// LES NEUF CAS D'AVANT LA PIÈCE P4, MÊMES ATTENDUS. Ils vivaient dans `core/reglages-lies.test.ts`, qui
// tenait la liaison en dur ; la fiche la déclare depuis le 2026-11-21 (`defautSelon` sur « Fréquence »),
// et ces cas la lisent là. La règle seule est éprouvée dans le cœur, sur une déclaration d'essai.
//
// CE QUI EST TENU :
//   1. PASSER À LA LOGISTIQUE PORTE LA FRÉQUENCE À LA CADENCE DES PAS. À 0,5, la suite ne donnait
//      que cinq paliers sur dix secondes, et se lisait comme un escalier arbitraire.
//   5. LA CADENCE NATURELLE SE JUGE AU NOMBRE DE PALIERS, et la fourchette est tenue ici : c'est la
//      seule façon d'éprouver une lisibilité, et elle a déjà servi à refuser une première valeur.
//   2. UNE VALEUR CHOISIE N'EST JAMAIS RÉÉCRITE. C'est la seule condition qui rend la liaison
//      acceptable : qui a mis 3 Hz garde 3 Hz en changeant de forme.
//   3. LE RETOUR À UN OSCILLATEUR REVIENT À 0,5, symétriquement.
//   4. AUCUN AUTRE COMPOSANT, ET AUCUN AUTRE RÉGLAGE, n'est touché.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { engendrer } from "../audio/courbe";
import { reglagesApresChangement } from "../core/reglages-lies";
import { FREQUENCE_CYCLES_PAR_SECONDE, FREQUENCE_PAS_PAR_SECONDE, fiches } from "./courbe";
import { toutesLesFiches } from "./index";

const COURBE = fiches.find((f) => f.id === "generateur-courbe");
const OSCILLATEUR = toutesLesFiches.find((f) => f.id === "oscillateur");

describe("la liaison forme / fréquence du composant Courbe", () => {
  it("LES DEUX FICHES SONT LÀ : sans elles, les cas suivants ne liraient rien", () => {
    expect(COURBE?.parametres.find((p) => p.nom === "Fréquence")?.defautSelon?.reglage).toBe("Forme");
    expect(OSCILLATEUR?.parametres.some((p) => p.nom === "Forme")).toBe(true);
  });

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
    const apres = reglagesApresChangement(OSCILLATEUR, avant, "Forme", "logistique");
    expect(apres["Fréquence"]).toBe(FREQUENCE_CYCLES_PAR_SECONDE);
  });

  // LA CADENCE NATURELLE SE JUGE AU NOMBRE DE PALIERS, et non au chiffre lui-même. Trop peu, la
  // suite ressemble à un escalier arbitraire : à un demi pas par seconde, elle n'en comptait que
  // cinq sur dix secondes. Trop, le tracé devient une palissade : à huit, quatre-vingts paliers sur
  // deux cents pixels donnent deux pixels et demi chacun. Ce test tient la fourchette entre les deux.
  it("À LA CADENCE NATURELLE, la suite compte assez de paliers pour se lire, et pas trop", () => {
    const courbe = engendrer({
      dureeSec: 10, forme: "logistique", frequence: FREQUENCE_PAS_PAR_SECONDE,
      r: 3.9, graine: 1, cadence: 200,
    });
    let paliers = 0;
    let precedent: number | null = null;
    for (const v of courbe.valeurs) {
      const arrondi = Math.round(v * 1e6) / 1e6;
      if (arrondi !== precedent) { paliers++; precedent = arrondi; }
    }
    expect(paliers, "trop peu : la suite se lit comme un escalier arbitraire").toBeGreaterThanOrEqual(15);
    expect(paliers, "trop : le tracé devient une palissade").toBeLessThanOrEqual(45);
  });

  it("l'objet reçu n'est jamais modifié", () => {
    const avant = Object.freeze({ Forme: "sinus", "Fréquence": FREQUENCE_CYCLES_PAR_SECONDE });
    const apres = reglagesApresChangement(COURBE, avant, "Forme", "logistique");
    expect(avant["Fréquence"]).toBe(FREQUENCE_CYCLES_PAR_SECONDE);
    expect(apres).not.toBe(avant);
  });
});
