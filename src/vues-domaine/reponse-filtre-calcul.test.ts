// ui/reponse-filtre-calcul.test.ts — La réponse dessinée dit-elle ce que le filtre fait ?
//
// CE QUE CES CAS TIENNENT. Le calcul de la réponse vivait dans un `.tsx`, donc hors de portée des
// tests, et rien ne le confrontait à ce que le filtre produit vraiment. Il est ici confronté aux
// proprietes que tout biquad du second ordre possede, celles qu'une erreur de coefficient casse
// aussitot : le point a moins trois decibels, la pente de douze decibels par octave, et la symetrie
// entre passe-bas et passe-haut.
//
// ET LE CAS QUI COMPTE LE PLUS EST CELUI DE L'ENVELOPPE. Un filtre module n'a pas UNE reponse, il en
// a une par instant. L'enveloppe doit contenir tout ce qu'il traverse, et se refermer exactement sur
// la reponse unique quand rien ne le module : sans cette seconde clause, tous les filtres du
// catalogue auraient vu leur trace changer pour rien.
import { describe, expect, it } from "vitest";
import {
  enveloppeReponse, fmtHz, legendePlage, plageDe, plageFixe, reponseDb, SR,
} from "./reponse-filtre-calcul";

const fixe = (v: number) => ({ min: v, max: v });

describe("la reponse d'un biquad", () => {
  it("VAUT MOINS TROIS DECIBELS A LA COUPURE, pour un Q de Butterworth", () => {
    // Le Q de 0,707 est celui qui ne fait pas de bosse : la coupure y est a -3,01 dB par definition.
    for (const f0 of [200, 1000, 4000]) {
      expect(reponseDb("Passe-bas", f0, Math.SQRT1_2, f0), `${f0} Hz`).toBeCloseTo(-3.01, 1);
      expect(reponseDb("Passe-haut", f0, Math.SQRT1_2, f0), `${f0} Hz`).toBeCloseTo(-3.01, 1);
    }
  });

  it("laisse passer sa bande et coupe l'autre", () => {
    expect(reponseDb("Passe-bas", 1000, 0.707, 100)).toBeCloseTo(0, 1);
    expect(reponseDb("Passe-haut", 1000, 0.707, 10000)).toBeCloseTo(0, 1);
    expect(reponseDb("Passe-bas", 1000, 0.707, 8000)).toBeLessThan(-30);
    expect(reponseDb("Passe-haut", 1000, 0.707, 125)).toBeLessThan(-30);
  });

  it("TOMBE DE DOUZE DECIBELS PAR OCTAVE, ce qui est l'ordre deux", () => {
    // LA MESURE SE FAIT LOIN DE NYQUIST, et c'est necessaire : un biquad NUMERIQUE n'est pas son
    // modele analogique. La transformation bilineaire replie le spectre, et le zero que le passe-bas
    // porte a Nyquist le fait tomber plus vite a l'approche de celui-ci. Mesuree entre 4 et 8 kHz
    // pour 44,1 kHz d'echantillonnage, la pente vaut 13,6 dB et non 12 : ce n'est pas un defaut du
    // calcul, c'est ce que fait le filtre, et c'est aussi ce que l'on entend.
    const a = reponseDb("Passe-bas", 100, 0.707, 800), b = reponseDb("Passe-bas", 100, 0.707, 1600);
    expect(a - b).toBeCloseTo(12, 0);
    const c = reponseDb("Passe-haut", 8000, 0.707, 500), d = reponseDb("Passe-haut", 8000, 0.707, 250);
    expect(c - d).toBeCloseTo(12, 0);
  });

  it("une resonance elevee fait une bosse a la coupure, et pas ailleurs", () => {
    const bosse = reponseDb("Passe-bas", 1000, 8, 1000);
    expect(bosse).toBeGreaterThan(15);
    expect(reponseDb("Passe-bas", 1000, 8, 100)).toBeCloseTo(0, 0);
  });

  it("le passe-bande culmine a la coupure, le coupe-bande s'y creuse", () => {
    expect(reponseDb("Passe-bande", 1000, 4, 1000)).toBeCloseTo(0, 1);
    expect(reponseDb("Passe-bande", 1000, 4, 100)).toBeLessThan(-20);
    expect(reponseDb("Coupe-bande", 1000, 4, 1000)).toBeLessThan(-60);
    expect(reponseDb("Coupe-bande", 1000, 4, 100)).toBeCloseTo(0, 1);
  });

  it("un type inconnu retombe sur le passe-bas plutot que de rendre un nombre absurde", () => {
    expect(reponseDb("Zigouigoui", 1000, 0.707, 1000)).toBeCloseTo(reponseDb("Passe-bas", 1000, 0.707, 1000), 9);
  });

  it("elle reste finie sur tout le spectre, jusqu'a Nyquist", () => {
    for (const f of [1, 20, 1000, SR / 2 - 1]) {
      expect(Number.isFinite(reponseDb("Coupe-bande", 1000, 12, f)), `${f} Hz`).toBe(true);
    }
  });
});

describe("l'enveloppe d'un filtre module", () => {
  it("SE REFERME SUR LA REPONSE UNIQUE QUAND RIEN NE LE MODULE", () => {
    // Clause decisive : sans elle, le trace de tous les filtres non modules aurait change.
    for (const f of [100, 1000, 5000]) {
      const e = enveloppeReponse("Passe-bas", fixe(800), fixe(2), f);
      const seule = reponseDb("Passe-bas", 800, 2, f);
      expect(e.min, `${f} Hz`).toBeCloseTo(seule, 9);
      expect(e.max, `${f} Hz`).toBeCloseTo(seule, 9);
    }
  });

  it("CONTIENT CE QUE LE FILTRE TRAVERSE, a toute frequence", () => {
    const coupure = { min: 200, max: 6000 };
    for (const f of [100, 500, 1500, 3300, 9000]) {
      const e = enveloppeReponse("Passe-bas", coupure, fixe(0.707), f);
      // On echantillonne le balayage : aucun instant ne doit sortir de l'enveloppe.
      for (let k = 0; k <= 10; k++) {
        const f0 = coupure.min + (coupure.max - coupure.min) * (k / 10);
        const db = reponseDb("Passe-bas", f0, 0.707, f);
        expect(db, `f=${f} f0=${f0}`).toBeGreaterThanOrEqual(e.min - 1e-9);
        expect(db, `f=${f} f0=${f0}`).toBeLessThanOrEqual(e.max + 1e-9);
      }
    }
  });

  it("ET ELLE S'OUVRE VRAIMENT : a 3300 Hz, un balayage de 200 a 6000 Hz couvre des dizaines de dB", () => {
    const e = enveloppeReponse("Passe-bas", { min: 200, max: 6000 }, fixe(0.707), 3300);
    expect(e.max - e.min).toBeGreaterThan(30);
  });

  it("elle prend aussi les combinaisons croisees quand les deux reglages sont modules", () => {
    // Deux courbes independantes peuvent porter la coupure au minimum pendant que la resonance est
    // au maximum : ce coin-la doit etre dans l'enveloppe.
    const e = enveloppeReponse("Passe-bas", { min: 300, max: 3000 }, { min: 0.7, max: 10 }, 300);
    expect(e.max).toBeGreaterThanOrEqual(reponseDb("Passe-bas", 300, 10, 300) - 1e-9);
    expect(e.min).toBeLessThanOrEqual(reponseDb("Passe-bas", 3000, 0.7, 300) + 1e-9);
  });

  it("des bornes donnees a l'envers se remettent dans l'ordre", () => {
    expect(plageDe(400, true, 6000, 200)).toEqual({ min: 200, max: 6000 });
  });

  it("sans modulation, la plage est la valeur du reglage et rien d'autre", () => {
    expect(plageDe(400, false, 200, 6000)).toEqual({ min: 400, max: 400 });
    expect(plageFixe(plageDe(400, false, 200, 6000))).toBe(true);
    expect(plageFixe(plageDe(400, true, 200, 6000))).toBe(false);
  });
});

describe("ce que la legende ecrit", () => {
  it("une frequence se lit court", () => {
    expect(fmtHz(400)).toBe("400");
    expect(fmtHz(6000)).toBe("6k");
    expect(fmtHz(1500)).toBe("1.5k");
  });

  it("une plage fixe donne un nombre, une plage ouverte donne les deux bornes", () => {
    expect(legendePlage(fixe(400), fmtHz)).toBe("400");
    expect(legendePlage({ min: 200, max: 6000 }, fmtHz)).toBe("200→6k");
  });
});
