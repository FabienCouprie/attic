// audio/recaler-niveau.test.ts — Le recalage de niveau, et l'écart mesuré.
//
// CE QUI EST TENU :
//   1. Un son recalé sur une référence atteint son niveau, dans l'unité choisie.
//   2. LA DYNAMIQUE EST INTACTE : le gain est une constante, le rapport entre deux instants du son
//      ne bouge pas. C'est ce qui distingue ce composant d'un compresseur.
//   3. Les bornes tiennent : la correction maximale, et le plafond de crête qui l'emporte sur elle.
//   4. Un silence ne fait rien exploser.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { creteDb, ecartNiveau, niveauDb } from "./ecart-niveau";
import { mesurerSelon, recaler, type OptionsRecalage } from "./recaler-niveau";

const SR = 44100;
const creerTampon = (canaux: number, longueur: number, sr: number) =>
  new OfflineAudioContext(canaux, longueur, sr).createBuffer(canaux, longueur, sr);

/** Une sinusoïde d'amplitude donnée, assez longue pour que la sonie BS.1770 s'applique. */
function sinus(amplitude: number, secondes = 1.5, canaux = 1): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = creerTampon(canaux, n, SR);
  for (let c = 0; c < canaux; c++) {
    const x = b.getChannelData(c);
    for (let i = 0; i < n; i++) x[i] = amplitude * Math.sin((2 * Math.PI * 440 * i) / SR);
  }
  return b;
}

const estTampon = (v: unknown): v is AudioBuffer => v instanceof AudioBuffer;
const BASE: OptionsRecalage = { mesure: "sonie", correctionMax: 24, plafondCrete: null };

describe("le niveau mesuré", () => {
  it("doubler l'amplitude ajoute six décibels, dans les trois unités", () => {
    for (const mesure of ["sonie", "rms", "crete"] as const) {
      const bas = mesurerSelon(sinus(0.1), mesure);
      const haut = mesurerSelon(sinus(0.2), mesure);
      expect(haut - bas, mesure).toBeCloseTo(6.02, 1);
    }
  });

  it("la crête d'une sinusoïde à pleine échelle est zéro dBFS", () => {
    expect(creteDb(sinus(1))).toBeCloseTo(0, 3);
  });

  it("un son plus court que la fenêtre de la norme est quand même mesuré", () => {
    // Sous 0,4 s, BS.1770 ne rend rien : le repli sur le niveau efficace doit donner un nombre.
    const court = sinus(0.2, 0.2);
    expect(Number.isFinite(niveauDb(court))).toBe(true);
    expect(niveauDb(court)).toBeLessThan(0);
  });

  it("un silence n'a pas de niveau", () => {
    expect(Number.isFinite(niveauDb(sinus(0)))).toBe(false);
  });
});

describe("l'écart entre une sortie et ses entrées", () => {
  it("il est négatif quand le composant affaiblit, et vaut la baisse", () => {
    const e = ecartNiveau([sinus(0.05)], [sinus(0.5)], estTampon);
    expect(e).not.toBeNull();
    expect(e!.ecart).toBeCloseTo(-20, 0);
  });

  it("LA RÉFÉRENCE EST LA PLUS FAIBLE DES ENTRÉES", () => {
    // Un mélangeur reçoit une piste forte et une piste discrète : l'écart se compte depuis la
    // discrète, sans quoi tout mélangeur paraîtrait fautif.
    const e = ecartNiveau([sinus(0.1)], [sinus(0.8), sinus(0.1)], estTampon);
    expect(e!.ecart).toBeCloseTo(0, 1);
  });

  it("sans entrée audio, sans sortie audio, ou sur un silence, il n'y a rien à dire", () => {
    expect(ecartNiveau([sinus(0.5)], [], estTampon)).toBeNull();
    expect(ecartNiveau(["texte", null], [sinus(0.5)], estTampon)).toBeNull();
    expect(ecartNiveau([sinus(0)], [sinus(0.5)], estTampon)).toBeNull();
    expect(ecartNiveau([sinus(0.5)], [sinus(0)], estTampon)).toBeNull();
  });
});

describe("le recalage", () => {
  it("le son corrigé atteint le niveau de la référence, dans les trois unités", () => {
    for (const mesure of ["sonie", "rms", "crete"] as const) {
      const { resultat } = recaler(sinus(0.5), sinus(0.05), { ...BASE, mesure }, creerTampon);
      expect(resultat.apres, mesure).toBeCloseTo(resultat.reference, 1);
      expect(resultat.gainDb, mesure).toBeCloseTo(20, 0);
      expect(resultat.borne).toBe(false);
    }
  });

  it("LA DYNAMIQUE EST INTACTE : le gain est une constante", () => {
    // Un son en deux moitiés, forte puis faible. Après recalage, le rapport des deux moitiés doit
    // être exactement celui de départ : c'est ce qui sépare ce composant d'un compresseur.
    const n = SR;
    const source = creerTampon(1, n, SR);
    const x = source.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const a = i < n / 2 ? 0.6 : 0.06;
      x[i] = a * Math.sin((2 * Math.PI * 440 * i) / SR);
    }
    const { audio } = recaler(sinus(0.3), source, BASE, creerTampon);
    const y = audio.getChannelData(0);
    const pic = (d: number, f: number) => {
      let p = 0;
      for (let i = d; i < f; i++) p = Math.max(p, Math.abs(y[i]));
      return p;
    };
    expect(pic(0, n / 2) / pic(n / 2, n)).toBeCloseTo(0.6 / 0.06, 4);
  });

  it("la correction maximale borne le gain, et le dit", () => {
    const { resultat } = recaler(sinus(0.8), sinus(0.004), { ...BASE, correctionMax: 6 }, creerTampon);
    expect(resultat.gainDb).toBeCloseTo(6, 6);
    expect(resultat.gainDemandeDb).toBeGreaterThan(6);
    expect(resultat.borne).toBe(true);
  });

  it("le plafond de crête l'emporte sur le gain demandé, plutôt que d'écrêter", () => {
    const { resultat } = recaler(sinus(0.9), sinus(0.5), { ...BASE, plafondCrete: -3 }, creerTampon);
    expect(resultat.creteApres).toBeLessThanOrEqual(-3 + 0.01);
    expect(resultat.plafonne).toBe(true);
    // Le niveau visé n'est alors pas atteint, et rien ne prétend le contraire.
    expect(resultat.apres).toBeLessThan(resultat.reference);
  });

  it("sans plafond, la crête peut dépasser zéro dBFS", () => {
    // Un son discret qui porte une crête isolée : sa sonie demande vingt décibels de plus, et
    // cette crête part alors bien au-dessus de l'échelle. C'est ce que le plafond empêche.
    const cible = sinus(0.05);
    cible.getChannelData(0)[5000] = 0.9;
    const { resultat } = recaler(sinus(0.5), cible, BASE, creerTampon);
    expect(resultat.gainDb).toBeGreaterThan(15);
    expect(resultat.creteApres).toBeGreaterThan(0);
  });

  it("un silence d'un côté ou de l'autre laisse le son tel quel", () => {
    for (const [ref, cible] of [[sinus(0), sinus(0.3)], [sinus(0.3), sinus(0)]] as const) {
      const { resultat } = recaler(ref, cible, BASE, creerTampon);
      expect(resultat.gainDb).toBe(0);
      expect(resultat.gainDemandeDb).toBe(0);
    }
  });

  it("le tampon reçu n'est pas modifié", () => {
    const cible = sinus(0.1);
    const avant = cible.getChannelData(0)[1000];
    recaler(sinus(0.8), cible, BASE, creerTampon);
    expect(cible.getChannelData(0)[1000]).toBe(avant);
  });

  it("la stéréo garde ses deux canaux et son équilibre", () => {
    const cible = sinus(0.1, 1.5, 2);
    cible.getChannelData(1).forEach((_, i) => { cible.getChannelData(1)[i] *= 0.5; });
    const { audio } = recaler(sinus(0.5, 1.5, 2), cible, BASE, creerTampon);
    expect(audio.numberOfChannels).toBe(2);
    const g = Math.max(...audio.getChannelData(0));
    const d = Math.max(...audio.getChannelData(1));
    expect(g / d).toBeCloseTo(2, 3);
  });
});
