// audio/risset.test.ts — L'illusion de Risset repose sur deux invariants exacts,
// tous deux vérifiables sans mesure perceptive : l'ensemble des voix redevient
// identique à lui-même après un cycle, et la somme de leurs amplitudes ne varie
// jamais. Ce sont eux qu'on verrouille ici.
import { describe, it, expect } from "vitest";
import "node-web-audio-api/polyfill.js";
import { voixRisset, gainTotal, boucleSansCouture, glissandoRisset, rythmeRisset, type OptionsRisset } from "./risset";

const BASE: OptionsRisset = { dureeSec: 1, cycleSec: 2, octaves: 6, montant: false };

function sinus(freq: number, dureeSec: number, sr = 8000, canaux = 1): AudioBuffer {
  const n = Math.round(dureeSec * sr);
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: sr });
  for (let c = 0; c < canaux; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = Math.sin((2 * Math.PI * freq * i) / sr);
  }
  return b;
}

describe("voixRisset — l'illusion elle-même", () => {
  it("l'ensemble des voix est identique à lui-même après un cycle", () => {
    // C'est LA propriété qui interdit de dater une écoute : après un cycle,
    // chaque voix a pris la place de sa voisine. Rien n'a bougé, collectivement.
    const t0 = voixRisset(0.37, BASE).map((v) => v.octave).sort((a, b) => a - b);
    const t1 = voixRisset(0.37 + BASE.cycleSec, BASE).map((v) => v.octave).sort((a, b) => a - b);
    for (let i = 0; i < t0.length; i++) expect(t1[i]).toBeCloseTo(t0[i], 8);
  });

  it("à un demi-cycle, en revanche, la configuration a bel et bien changé", () => {
    // Garde-fou du test précédent : sans lui, une fonction renvoyant toujours la
    // même chose passerait pour une illusion réussie.
    const t0 = voixRisset(0, BASE).map((v) => v.octave).sort((a, b) => a - b);
    const t1 = voixRisset(BASE.cycleSec / 2, BASE).map((v) => v.octave).sort((a, b) => a - b);
    const ecart = t0.reduce((s, v, i) => s + Math.abs(v - t1[i]), 0);
    expect(ecart).toBeGreaterThan(0.5);
  });

  it("la somme des amplitudes ne varie pas — le glissando ne pulse pas", () => {
    for (const octaves of [3, 4, 6, 9]) {
      const attendu = octaves / 2;
      for (let t = 0; t < 4; t += 0.137) {
        expect(gainTotal(voixRisset(t, { ...BASE, octaves }))).toBeCloseTo(attendu, 8);
      }
    }
  });

  it("les voix se taisent aux deux bords de l'étendue", () => {
    // Le saut d'octave doit tomber dans le silence, sinon on l'entend.
    const voix = voixRisset(0, BASE);
    const enBas = voix.find((v) => v.octave < 1e-9);
    expect(enBas?.amplitude).toBeCloseTo(0, 10);
    expect(Math.max(...voix.map((v) => v.amplitude))).toBeGreaterThan(0.9);
  });

  it("la voix du centre relit la source à sa vitesse d'origine", () => {
    const voix = voixRisset(0, { ...BASE, octaves: 5 });
    const centrale = voix.find((v) => Math.abs(v.octave - 2) < 1e-9);
    expect(centrale?.vitesse).toBeCloseTo(1, 10);
  });

  it("le sens inverse la marche des voix", () => {
    // On observe une voix du MILIEU : celle du bas rebascule en haut au moindre
    // pas descendant (c'est justement le principe), ce qui rendrait la
    // comparaison trompeuse.
    const k = 3;
    const depart = voixRisset(0, BASE)[k].octave;
    const descend = voixRisset(0.5, { ...BASE, montant: false })[k].octave;
    const monte = voixRisset(0.5, { ...BASE, montant: true })[k].octave;
    expect(descend).toBeLessThan(depart);
    expect(monte).toBeGreaterThan(depart);
    // Symétriques autour du point de départ, au même cycle.
    expect(depart - descend).toBeCloseTo(monte - depart, 10);
  });
});

describe("boucleSansCouture", () => {
  it("raccorde la fin sur le début sans discontinuité", () => {
    const src = sinus(220, 0.5);
    const boucle = boucleSansCouture(src, 0.05);
    const d = boucle.getChannelData(0);
    // Le saut à la jonction (dernier échantillon → premier) doit rester du même
    // ordre que les écarts internes, pas former une marche.
    const jonction = Math.abs(d[0] - d[d.length - 1]);
    let pire = 0;
    for (let i = 1; i < d.length; i++) pire = Math.max(pire, Math.abs(d[i] - d[i - 1]));
    expect(jonction).toBeLessThanOrEqual(pire * 2);
  });

  it("laisse la source intacte quand elle est trop courte pour un fondu utile", () => {
    // 8 échantillons : un fondu y serait de 2 points, autant dire rien.
    const court = sinus(220, 0.001);
    expect(boucleSansCouture(court, 0.05).length).toBe(court.length);
  });
});

describe("glissandoRisset", () => {
  it("produit la durée demandée, indépendante de celle de la source", () => {
    const src = sinus(440, 0.3);
    const out = glissandoRisset(src, { ...BASE, dureeSec: 2 });
    expect(out.length).toBe(2 * src.sampleRate);
    expect(out.sampleRate).toBe(src.sampleRate);
  });

  it("conserve le nombre de canaux", () => {
    const out = glissandoRisset(sinus(440, 0.3, 8000, 2), BASE);
    expect(out.numberOfChannels).toBe(2);
  });

  it("produit du signal, sans saturer", () => {
    const d = glissandoRisset(sinus(440, 0.3), { ...BASE, dureeSec: 1 }).getChannelData(0);
    let pic = 0, somme = 0;
    for (let i = 0; i < d.length; i++) { pic = Math.max(pic, Math.abs(d[i])); somme += d[i] * d[i]; }
    expect(Math.sqrt(somme / d.length)).toBeGreaterThan(0.01);
    expect(pic).toBeLessThanOrEqual(1);
  });

  it("ne produit aucun clic malgré les sauts d'octave", () => {
    // Un saut de voix mal placé s'entendrait comme une marche dans le signal.
    const sr = 8000;
    const d = glissandoRisset(sinus(300, 0.4, sr), { ...BASE, dureeSec: 3, cycleSec: 0.5 }).getChannelData(0);
    let pire = 0;
    for (let i = 1; i < d.length; i++) pire = Math.max(pire, Math.abs(d[i] - d[i - 1]));
    // Un sinus à 300 Hz échantillonné à 8 kHz progresse d'au plus ~0,24 par pas ;
    // les voix aiguës montent plus haut, d'où une marge large — mais un vrai clic
    // (discontinuité franche) dépasserait largement ce seuil.
    expect(pire).toBeLessThan(0.5);
  });

  it("le niveau reste stable d'un bout à l'autre — pas de battement de relais", () => {
    const sr = 8000;
    const d = glissandoRisset(sinus(300, 0.4, sr), { ...BASE, dureeSec: 4, cycleSec: 1 }).getChannelData(0);
    const parFenetre: number[] = [];
    const taille = sr / 10;
    for (let i = 0; i + taille <= d.length; i += taille) {
      let s = 0;
      for (let j = 0; j < taille; j++) s += d[i + j] * d[i + j];
      parFenetre.push(Math.sqrt(s / taille));
    }
    const moy = parFenetre.reduce((a, b) => a + b, 0) / parFenetre.length;
    const ecart = Math.sqrt(parFenetre.reduce((s, v) => s + (v - moy) ** 2, 0) / parFenetre.length);
    expect(ecart / moy).toBeLessThan(0.35);
  });
});

// ── Mode « hauteur » : transposer sans toucher au tempo ──
// La différence entre les deux modes ne s'entend pas dans le spectre mais dans
// le RYTHME : c'est donc lui qu'on mesure, sur une source volontairement pulsée.
describe("glissandoRisset — mode hauteur (tempo conservé)", () => {
  /** 1 s contenant 4 pulsations nettes : une source dont le tempo est mesurable. */
  function pulsations(sr = 8000): AudioBuffer {
    const n = sr;
    const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const phase = (i % (sr / 4)) / (sr / 4);
      const env = phase < 0.25 ? Math.sin((Math.PI * phase) / 0.25) : 0;
      d[i] = env * Math.sin((2 * Math.PI * 300 * i) / sr);
    }
    return b;
  }

  /** Autocorrélation normalisée de l'enveloppe au retard voulu : 1 = pulsation intacte, 0 = disparue. */
  function periodicite(buf: AudioBuffer, periodeSec: number): number {
    const d = buf.getChannelData(0), sr = buf.sampleRate, pas = 64;
    const env: number[] = [];
    for (let i = 0; i + pas <= d.length; i += pas) {
      let s = 0;
      for (let j = 0; j < pas; j++) s += d[i + j] * d[i + j];
      env.push(Math.sqrt(s / pas));
    }
    const moy = env.reduce((a, b) => a + b, 0) / env.length;
    const c = env.map((v) => v - moy);
    const lag = Math.round((periodeSec * sr) / pas);
    let num = 0, den = 0;
    for (let i = 0; i + lag < c.length; i++) num += c[i] * c[i + lag];
    for (let i = 0; i < c.length; i++) den += c[i] * c[i];
    return num / (den || 1);
  }

  const CAS = { dureeSec: 4, cycleSec: 2, octaves: 6, montant: false };

  it("conserve la pulsation de la source, là où le mode bande la dissout", () => {
    // En mode bande, chaque voix relit à sa propre vitesse : les 4 pulsations
    // par seconde deviennent autant de tempos superposés, et la périodicité
    // s'efface. Mesuré : 0,61 en mode hauteur contre −0,01 en mode bande.
    const src = pulsations();
    const hauteur = periodicite(glissandoRisset(src, { ...CAS, mode: "hauteur" }), 0.25);
    const bande = periodicite(glissandoRisset(src, { ...CAS, mode: "bande" }), 0.25);
    expect(hauteur).toBeGreaterThan(0.4);
    expect(bande).toBeLessThan(0.15);
  });

  it("respecte durée et canaux comme l'autre mode", () => {
    const out = glissandoRisset(sinus(440, 0.3, 8000, 2), { ...CAS, dureeSec: 2, mode: "hauteur" });
    expect(out.length).toBe(2 * 8000);
    expect(out.numberOfChannels).toBe(2);
  });

  it("le recouvrement de moitié ne module pas le niveau", () => {
    // Les fenêtres de Hann à 50 % de recouvrement se somment à 1 : si ce n'était
    // pas le cas, on entendrait un tremolo au rythme des grains.
    const sr = 8000;
    const d = glissandoRisset(sinus(300, 0.4, sr), { ...CAS, dureeSec: 3, mode: "hauteur" }).getChannelData(0);
    const parFenetre: number[] = [];
    const taille = sr / 10;
    for (let i = 0; i + taille <= d.length; i += taille) {
      let s = 0;
      for (let j = 0; j < taille; j++) s += d[i + j] * d[i + j];
      parFenetre.push(Math.sqrt(s / taille));
    }
    const moy = parFenetre.reduce((a, b) => a + b, 0) / parFenetre.length;
    const ecart = Math.sqrt(parFenetre.reduce((s, v) => s + (v - moy) ** 2, 0) / parFenetre.length);
    expect(ecart / moy).toBeLessThan(0.35);
  });

  it("le mode par défaut reste « bande »", () => {
    const src = sinus(440, 0.3);
    const sansMode = glissandoRisset(src, CAS).getChannelData(0);
    const bande = glissandoRisset(src, { ...CAS, mode: "bande" }).getChannelData(0);
    for (let i = 0; i < sansMode.length; i += 997) expect(sansMode[i]).toBeCloseTo(bande[i], 12);
  });
});

// ── Rythme de Risset ──
// Même illusion, sur l'axe du temps. Ce qui la distingue du glissando se mesure
// dans le SPECTRE : ici, la hauteur ne doit pas bouger d'un iota.
describe("rythmeRisset", () => {
  function pulsations(sr = 16000, freq = 300): AudioBuffer {
    const n = sr;
    const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const ph = (i % (sr / 4)) / (sr / 4);
      const env = ph < 0.25 ? Math.sin((Math.PI * ph) / 0.25) : 0;
      d[i] = env * Math.sin((2 * Math.PI * freq * i) / sr);
    }
    return b;
  }

  /** Énergie à une fréquence donnée (Goertzel sur une fenêtre de Hann). */
  function energie(buf: AudioBuffer, f: number): number {
    const d = buf.getChannelData(0), sr = buf.sampleRate, N = Math.min(16384, d.length);
    const w = (2 * Math.PI * f) / sr, c = 2 * Math.cos(w);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < N; i++) {
      const x = d[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      const s0 = x + c * s1 - s2; s2 = s1; s1 = s0;
    }
    return Math.sqrt(Math.abs(s1 * s1 + s2 * s2 - c * s1 * s2));
  }

  const CAS = { dureeSec: 6, cycleSec: 3, octaves: 5, montant: true, grainSec: 0.06 };

  it("ne touche pas à la hauteur, là où le glissando l'étale sur les octaves", () => {
    // C'est LE test qui sépare les deux effets. Mesuré sur une source à 300 Hz :
    // le rythme laisse 0,4 % d'énergie à l'octave, le glissando y en met 235 %.
    const src = pulsations();
    const ratio = (b: AudioBuffer, f: number) => energie(b, f) / energie(b, 300);
    const rythme = rythmeRisset(src, CAS);
    const glissando = glissandoRisset(src, { ...CAS, mode: "hauteur" });
    for (const f of [150, 600]) {
      expect(ratio(rythme, f), `rythme à ${f} Hz`).toBeLessThan(0.05);
      expect(ratio(glissando, f), `glissando à ${f} Hz`).toBeGreaterThan(0.5);
    }
  });

  it("respecte durée et canaux", () => {
    const out = rythmeRisset(sinus(440, 0.3, 8000, 2), { ...CAS, dureeSec: 2 });
    expect(out.length).toBe(2 * 8000);
    expect(out.numberOfChannels).toBe(2);
  });

  it("le niveau ne pulse pas au rythme des relais de couches", () => {
    const sr = 16000;
    const d = rythmeRisset(pulsations(sr), { ...CAS, dureeSec: 6 }).getChannelData(0);
    const parFenetre: number[] = [];
    const taille = sr / 2;
    for (let i = 0; i + taille <= d.length; i += taille) {
      let s = 0;
      for (let j = 0; j < taille; j++) s += d[i + j] * d[i + j];
      parFenetre.push(Math.sqrt(s / taille));
    }
    const moy = parFenetre.reduce((a, b) => a + b, 0) / parFenetre.length;
    const ecart = Math.sqrt(parFenetre.reduce((s, v) => s + (v - moy) ** 2, 0) / parFenetre.length);
    expect(ecart / moy).toBeLessThan(0.35);
  });

  it("le sens change bien le comportement produit", () => {
    const src = pulsations();
    const a = rythmeRisset(src, { ...CAS, montant: true }).getChannelData(0);
    const b = rythmeRisset(src, { ...CAS, montant: false }).getChannelData(0);
    let ecart = 0;
    for (let i = 0; i < a.length; i++) ecart += Math.abs(a[i] - b[i]);
    expect(ecart / a.length).toBeGreaterThan(1e-3);
  });
});
