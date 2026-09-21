// audio/modulation-effets.test.ts — Ouvrir un effet à une courbe sans toucher à ce qu'il faisait.
//
// LE TEST QUI COMMANDE TOUS LES AUTRES : SANS COURBE, PAS UN BIT NE BOUGE. Ajouter une entrée à un
// effet qui tourne déjà dans les graphes de quelqu'un n'est acceptable qu'à cette condition. Et la
// tentation est forte de s'en dispenser — on a réécrit la boucle, le son « semble » le même —, or
// la faute que cela cache n'est pas une différence audible : c'est une différence d'un demi-LSB qui
// rendrait tout rendu enregistré irreproductible sans que personne ne s'en aperçoive avant des mois.
// On exige donc l'égalité EXACTE, échantillon par échantillon.
//
// LE SECOND : LA COURBE DOIT COMMANDER VRAIMENT. Un port qui ne change rien serait pire qu'une
// absence de port. Deux courbes opposées doivent donner deux sons mesurablement différents, et une
// courbe constante doit tenir la valeur qu'elle désigne — ce qui se lit au spectre.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { vibrato, wahwah } from "./effets-spectral";
import { constante, engendrer, type Courbe } from "./courbe";

/** La meme courbe a l envers. `engendrer` ne sait pas inverser, et le dire ici vaut mieux que
 *  de comparer sans le savoir deux courbes identiques — ce que ce test faisait d abord. */
const retournee = (c: Courbe): Courbe => ({ ...c, valeurs: Float32Array.from(c.valeurs, (v) => 1 - v) });

const SR = 44100;

function bruit(n: number, graine = 5): AudioBuffer {
  let e = graine >>> 0;
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) { e = (e * 1664525 + 1013904223) >>> 0; x[i] = 0.4 * (e / 4294967296 * 2 - 1); }
  b.copyToChannel(x, 0);
  return b;
}

const memesOctets = (a: AudioBuffer, b: AudioBuffer): boolean => {
  const x = a.getChannelData(0), y = b.getChannelData(0);
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
};

/** Le centre de gravité du spectre, par les passages par zéro : une mesure d'aigu sans transformée. */
const aigu = (b: AudioBuffer): number => {
  const x = b.getChannelData(0);
  let passages = 0;
  for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) passages++;
  return (passages * SR) / (2 * (x.length - 1));
};

describe("le wah-wah ouvert à une courbe", () => {
  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS — la boucle a été réécrite, pas changée", () => {
    const x = bruit(SR);
    // Les bornes par défaut sont celles qui étaient câblées : 200 et 2500 Hz.
    const avant = wahwah(x, 2, 100, 5, 100);
    const apres = wahwah(x, 2, 100, 5, 100, undefined, { min: 200, max: 2500 });
    expect(memesOctets(avant, apres)).toBe(true);
    // Et une entrée qui n'est pas une courbe ne prend pas la main non plus.
    expect(memesOctets(avant, wahwah(x, 2, 100, 5, 100, "bonjour"))).toBe(true);
    expect(memesOctets(avant, wahwah(x, 2, 100, 5, 100, null))).toBe(true);
  });

  it("UNE COURBE CONSTANTE TIENT SA FRÉQUENCE, et deux constantes donnent deux timbres", () => {
    const x = bruit(SR);
    const bas = wahwah(x, 2, 100, 8, 100, constante(0, 1), { min: 300, max: 3000 });
    const haut = wahwah(x, 2, 100, 8, 100, constante(1, 1), { min: 300, max: 3000 });
    // Le filtre est un passe-bande : tenu en bas, il laisse passer le grave, et l'inverse.
    expect(aigu(haut)).toBeGreaterThan(aigu(bas) * 3);
  });

  it("LE BALAYAGE SE PARCOURT EN MULTIPLIANT — le milieu est la moyenne géométrique", () => {
    const x = bruit(SR);
    const milieu = wahwah(x, 2, 100, 8, 100, constante(0.5, 1), { min: 200, max: 3200 });
    // La moyenne géométrique de 200 et 3200 vaut 800 ; l'arithmétique en donnerait 1700.
    const attendu = aigu(wahwah(x, 2, 100, 8, 100, constante(0, 1), { min: 800, max: 800 }));
    expect(Math.abs(Math.log2(aigu(milieu) / attendu))).toBeLessThan(0.35);
  });

  it("les bornes du balayage sont bien des réglages, avec ou sans courbe", () => {
    const x = bruit(SR);
    // Sans courbe non plus elles ne sont pas décoratives : le LFO balaie entre elles.
    const etroit = wahwah(x, 2, 100, 8, 100, undefined, { min: 300, max: 400 });
    const large = wahwah(x, 2, 100, 8, 100, undefined, { min: 300, max: 4000 });
    expect(aigu(large)).toBeGreaterThan(aigu(etroit) * 1.5);
  });

  it("une rampe et sa rampe inverse ne rendent pas le même son", () => {
    const x = bruit(SR);
    const montante = wahwah(x, 2, 100, 8, 100, engendrer({ dureeSec: 1, forme: "rampe" }), { min: 200, max: 3000 });
    const descendante = wahwah(x, 2, 100, 8, 100, retournee(engendrer({ dureeSec: 1, forme: "rampe" })), { min: 200, max: 3000 });
    const premiereMoitie = (b: AudioBuffer) => {
      const t = new AudioBuffer({ numberOfChannels: 1, length: SR / 2, sampleRate: SR });
      t.copyToChannel(b.getChannelData(0).slice(0, SR / 2), 0);
      return aigu(t);
    };
    // Au début, la montante est encore dans le grave et la descendante déjà dans l'aigu.
    expect(premiereMoitie(descendante)).toBeGreaterThan(premiereMoitie(montante));
  });
});

describe("le vibrato ouvert à une courbe", () => {
  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS", () => {
    const x = bruit(SR);
    expect(memesOctets(vibrato(x, 5, 50), vibrato(x, 5, 50, undefined))).toBe(true);
    expect(memesOctets(vibrato(x, 5, 50), vibrato(x, 5, 50, null))).toBe(true);
    expect(memesOctets(vibrato(x, 5, 50), vibrato(x, 5, 50, 42))).toBe(true);
  });

  it("LA COURBE DESSINE LE GESTE : deux formes opposées donnent deux sons différents", () => {
    const x = bruit(SR);
    const montant = vibrato(x, 5, 80, engendrer({ dureeSec: 1, forme: "rampe" }));
    const descendant = vibrato(x, 5, 80, retournee(engendrer({ dureeSec: 1, forme: "rampe" })));
    let ecart = 0;
    const a = montant.getChannelData(0), b = descendant.getChannelData(0);
    for (let i = 0; i < a.length; i++) ecart = Math.max(ecart, Math.abs(a[i] - b[i]));
    expect(ecart).toBeGreaterThan(0.05);
  });

  it("LA PROFONDEUR GARDE SON SENS : à zéro, la courbe ne peut plus rien déplacer", () => {
    // La courbe pilote la position DANS la plage que la profondeur fixe. Plage nulle, aucun
    // mouvement possible — c'est ce qui garantit que le réglage n'a pas été contourné.
    const x = bruit(SR);
    const a = vibrato(x, 5, 0, engendrer({ dureeSec: 1, forme: "rampe" }));
    const b = vibrato(x, 5, 0, retournee(engendrer({ dureeSec: 1, forme: "rampe" })));
    expect(memesOctets(a, b)).toBe(true);
  });

  it("la sortie reste dans le gabarit et finie", () => {
    const x = bruit(SR);
    for (const c of [undefined, constante(0, 1), constante(1, 1), engendrer({ dureeSec: 1, forme: "rampe" })]) {
      const y = vibrato(x, 5, 100, c).getChannelData(0);
      expect(y.every((v) => Number.isFinite(v))).toBe(true);
      expect(Math.max(...Array.from(y, Math.abs))).toBeLessThanOrEqual(1);
    }
  });
});
