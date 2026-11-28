// audio/corde-pincee.test.ts — La boucle de Karplus et Strong, confrontée à ce que sa théorie prédit.
//
// CE QUI EST MESURÉ ICI EST LE SON, ET LA RÉPONSE EST CONNUE D'AVANCE. La boucle est linéaire tant
// que le « Mélange » vaut 1 : chaque partiel y perd, à chaque période, exactement le module du filtre
// de la boucle à sa pulsation, et chaque filtre de l'excitation le multiplie par son propre module.
// Chaque témoin compare donc une grandeur relevée sur le tampon rendu à une formule écrite en clair,
// et non à un relevé précédent.
//
// LA FICHE EST ÉPROUVÉE À CÔTÉ, dans `plugins/karplus-strong.test.ts` : ce fichier tient le module
// sur une grille plus large, que la fiche lancée comme le moteur ne parcourrait pas en temps utile.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { calculerCordePincee, poidsDEtirement } from "./corde-pincee";
import { decalageDePosition, excitationDeCorde, gainUnPole, poleDeNuance, type GenreExcitation } from "./excitation-corde";
import { amplitudeDeRaie, centsEntre, raieLaPlusForte } from "./mesure-raie";
import { creerAleatoire } from "../core/hasard";

const empreinte = (x: Float32Array) => createHash("sha256").update(new Uint8Array(x.buffer, x.byteOffset, x.byteLength)).digest("hex");
const DEMI_TON = 2 ** (1 / 12);

interface Corde {
  frequence: number; sr?: number; duree?: number; genre?: GenreExcitation; graine?: number;
  etirement?: number; melange?: number; resonance?: number;
  position?: number; direction?: number; bande?: number; arrondie?: boolean;
}

/** Une corde de Karplus-Strong telle que le composant la calcule, sans relâchement. */
function corde(c: Corde): Float32Array {
  const sr = c.sr ?? 44100, aleatoire = creerAleatoire(c.graine ?? 7);
  // LE TÉMOIN PRIVÉ DE LA FRACTION : la même boucle, accordée sur une période arrondie à l'entier.
  const frequence = c.arrondie ? sr / Math.round(sr / c.frequence) : c.frequence;
  const excitation = excitationDeCorde({
    genre: c.genre ?? "impulsion", periode: sr / frequence, longueur: 1,
    position: c.position ?? 0, direction: c.direction ?? 0, bande: c.bande ?? sr / 2, sampleRate: sr, aleatoire,
  });
  return calculerCordePincee({
    frequence, sampleRate: sr, duree: c.duree ?? 0.6, resonance: c.resonance ?? 1, debutRelache: 99, relache: 0,
    volume: 1, aleatoire, etirement: c.etirement ?? 1, melange: c.melange, excitation, priseALEntree: true,
  });
}

/** La note jouée : la raie la plus forte à un demi-ton de part et d'autre de `f`. */
const jouee = (x: Float32Array, f: number, sr = 44100, debut = 0.05, fin = 0.55) =>
  raieLaPlusForte(x, sr, debut, fin, f / DEMI_TON, f * DEMI_TON);

/** Le partiel k, cherché à trente cents de k·f sur la première tranche. */
const partiel = (x: Float32Array, f: number, k: number, sr = 44100) =>
  raieLaPlusForte(x, sr, 0, 0.2, k * f * 2 ** (-30 / 1200), k * f * 2 ** (30 / 1200));

/** La pente de l'enveloppe d'une raie, en dB/s, par régression sur des tranches de 50 ms. */
function pente(x: Float32Array, f: number, sr: number, debut: number, fin: number): number {
  const points: [number, number][] = [];
  for (let t = debut; t + 0.05 <= fin; t += 0.025) points.push([t + 0.025, 20 * Math.log10(amplitudeDeRaie(x, sr, t, t + 0.05, f))]);
  const mt = points.reduce((s, p) => s + p[0], 0) / points.length, md = points.reduce((s, p) => s + p[1], 0) / points.length;
  let num = 0, den = 0;
  for (const [t, d] of points) { num += (t - mt) * (d - md); den += (t - mt) ** 2; }
  return num / den;
}

/**
 * La pente que la théorie prédit au partiel de fréquence `fk` d'une corde de fondamentale `f`.
 *
 * ELLE NE PASSE PAS PAR `poidsDEtirement`, que ce fichier éprouve : l'étirement S veut dire
 * 4s(1−s) = 1/S, donc |H|² = 1 − sin²(ω/2)/S, et c'est cela qu'on écrit. Une prédiction qui
 * appellerait la fonction éprouvée resterait verte sous la faute qu'elle devait attraper ; vu.
 */
function pentePredite(f: number, fk: number, sr: number, etirement: number, resonance: number): number {
  const module2 = 1 - Math.sin((Math.PI * fk) / sr) ** 2 / etirement;
  return f * (20 * Math.log10(resonance) + 10 * Math.log10(module2));
}

describe("la corde d'avant", () => {
  it("SANS LES OPTIONS NEUVES, LA CORDE NE CHANGE PAS D'UN ÉCHANTILLON", () => {
    // L'empreinte a été relevée sur le module d'avant le 2026-11-27, avant toute retouche : c'est le
    // son de « Pluck Synth », dont des graphes enregistrés dépendent. Ne jamais la réécrire.
    const son = calculerCordePincee({
      frequence: 220, sampleRate: 44100, duree: 0.5, bruit: 1 / 220, coupure: 4000, resonance: 0.95,
      debutRelache: 0.3, relache: 0.2, volume: 0.8, aleatoire: creerAleatoire(9),
    });
    expect(son.length).toBe(22050);
    expect(empreinte(son)).toBe("74bc0ed62f0dbc03f5064f6af80de5e642e02d14635121215729acdf9375f22a");
  });
});

describe("l'étirement", () => {
  it("à 1, LA MOYENNE DE 1983 ; à S, LA PERTE PAR TOUR DIVISÉE PAR S", () => {
    expect(poidsDEtirement(1)).toBe(0.5);
    for (const S of [1.5, 2, 4, 10, 50]) {
      const s = poidsDEtirement(S);
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThan(0.5);
      expect(4 * s * (1 - s)).toBeCloseTo(1 / S, 12);
    }
  });
});

describe("la hauteur", () => {
  const NOTES = [["A1", 55], ["A2", 110], ["C4", 261.626], ["A4", 440], ["C6", 1046.502], ["C7", 2093.005]] as const;

  it("LA CORDE JOUE SA NOTE À UN CENT PRÈS, du la1 au do7, à 44,1 et à 48 kHz", () => {
    for (const sr of [44100, 48000]) {
      for (const [nom, f] of NOTES) {
        for (const genre of ["impulsion", "blanc"] as const) {
          const ecart = centsEntre(jouee(corde({ frequence: f, sr, genre }), f, sr), f);
          expect(Math.abs(ecart), `${nom}, ${genre}, ${sr} Hz : ${ecart.toFixed(3)} cents`).toBeLessThan(1);
        }
      }
    }
  });

  it("L'ÉTIREMENT, LA POSITION ET LA DIRECTION NE DÉPLACENT PAS LA NOTE", () => {
    for (const [nom, f] of NOTES) {
      for (const c of [{ etirement: 4 }, { position: 0.3 }, { direction: 0.5 }, { etirement: 4, position: 0.3, direction: 0.5 }]) {
        const ecart = centsEntre(jouee(corde({ frequence: f, ...c }), f), f);
        expect(Math.abs(ecart), `${nom}, ${JSON.stringify(c)} : ${ecart.toFixed(3)} cents`).toBeLessThan(1);
      }
    }
  });

  it("LE TÉMOIN : LA MÊME BOUCLE SANS LA FRACTION D'ÉCHANTILLON EST FAUSSE DANS L'AIGU", () => {
    // Ce qui rend l'accord juste se voit en le retirant : au do7, la période vaut 21,07 échantillons
    // à 44,1 kHz, et l'arrondir à 21 hausse la note de six cents ; au do6, de 42,14 à 42, de six aussi.
    const ecart = centsEntre(jouee(corde({ frequence: 2093.005, arrondie: true }), 2093.005), 2093.005);
    expect(Math.abs(ecart), `${ecart.toFixed(2)} cents`).toBeGreaterThan(3);
  });
});

describe("la décroissance", () => {
  it("CHAQUE PARTIEL DÉCROÎT COMME LE PRÉDIT LE MODULE DU FILTRE DE LA BOUCLE, à 3 % près", () => {
    const sr = 44100;
    const cas = [[1046.502, 1], [1046.502, 2], [440, 5], [440, 8]] as const;
    for (const [f, k] of cas) {
      for (const etirement of [1, 4]) {
        for (const resonance of [1, 0.995]) {
          const x = corde({ frequence: f, etirement, resonance, duree: 1.2 });
          const fk = partiel(x, f, k, sr);
          const predite = pentePredite(f, fk, sr, etirement, resonance);
          const relevee = pente(x, fk, sr, 0.1, Math.min(1.2, 0.1 + 50 / Math.abs(predite)));
          expect(Math.abs(relevee / predite - 1), `f ${f}, partiel ${k}, S ${etirement}, ρ ${resonance} : ${relevee.toFixed(2)} contre ${predite.toFixed(2)} dB/s`).toBeLessThan(0.03);
        }
      }
    }
  });

  it("À S = 4, LE FONDAMENTAL DU DO6 DÉCROÎT QUATRE FOIS MOINS VITE, à 3 % près", () => {
    const sr = 44100, f = 1046.502;
    const [vite, lente] = [1, 4].map((etirement) => {
      const x = corde({ frequence: f, etirement, duree: 1.2 });
      return pente(x, partiel(x, f, 1), sr, 0.1, 1.2);
    });
    expect(Math.abs(vite / lente / 4 - 1), `${vite.toFixed(2)} et ${lente.toFixed(2)} dB/s`).toBeLessThan(0.03);
  });
});

describe("le tambour", () => {
  it("À b = 0, LA CORDE SONNE UNE OCTAVE PLUS BAS, sur ses seuls harmoniques impairs", () => {
    for (const f of [220, 440]) {
      const x = corde({ frequence: f, melange: 0, genre: "blanc" });
      const ecart = centsEntre(jouee(x, f / 2), f / 2);
      expect(Math.abs(ecart), `${f} Hz : ${ecart.toFixed(3)} cents`).toBeLessThan(1);
      const impair = amplitudeDeRaie(x, 44100, 0.1, 0.5, partiel(x, f / 2, 1));
      const pair = amplitudeDeRaie(x, 44100, 0.1, 0.5, f);
      expect(20 * Math.log10(pair / impair), `${f} Hz`).toBeLessThan(-30);
    }
  });

  it("VERS b = ½, LA HAUTEUR SE PERD : l'énergie quitte les partiels", () => {
    // L'énergie moyenne aux dix premiers partiels, rapportée à l'énergie moyenne sur une grille de
    // dix cents qui couvre la même étendue : bien plus que 1 pour une corde, près de 1 sans hauteur.
    const surLesPartiels = (x: Float32Array, f: number) => {
      let sur = 0;
      for (let k = 1; k <= 10; k++) sur += amplitudeDeRaie(x, 44100, 0.05, 0.3, k * f) ** 2;
      let total = 0, points = 0;
      for (let g = f / 2; g < 10.5 * f; g *= 2 ** (10 / 1200), points++) total += amplitudeDeRaie(x, 44100, 0.05, 0.3, g) ** 2;
      return sur / 10 / (total / points);
    };
    for (const graine of [1, 2, 3, 4, 5]) {
      const corde1 = surLesPartiels(corde({ frequence: 220, genre: "blanc", graine }), 220);
      const tambour = surLesPartiels(corde({ frequence: 220, genre: "blanc", graine, melange: 0.5 }), 220);
      expect(tambour, `graine ${graine} : corde ${corde1.toFixed(3)}, tambour ${tambour.toFixed(3)}`).toBeLessThan(0.5 * corde1);
    }
  });

  it("À GRAINE ÉGALE, LE MÊME TAMBOUR ; une autre graine en tire un autre", () => {
    const t = (graine: number) => Array.from(corde({ frequence: 220, melange: 0.5, graine, duree: 0.2 }));
    expect(t(3)).toEqual(t(3));
    expect(t(3)).not.toEqual(t(4));
  });
});

describe("l'excitation", () => {
  /** Le rapport du partiel k au fondamental, en dB, à l'attaque. */
  const rapport = (x: Float32Array, f: number, k: number) => {
    const fk = partiel(x, f, k), f1 = partiel(x, f, 1);
    return { db: 20 * Math.log10(amplitudeDeRaie(x, 44100, 0, 0.2, fk) / amplitudeDeRaie(x, 44100, 0, 0.2, f1)), fk, f1 };
  };
  /** Le module, en dB, d'un filtre à pôle unique `(1 − c)/(1 − c·z⁻¹)` à la fréquence `f`. */
  const unPoleDb = (c: number, f: number) => 20 * Math.log10((1 - c) / Math.hypot(1 - c * Math.cos((2 * Math.PI * f) / 44100), c * Math.sin((2 * Math.PI * f) / 44100)));

  it("LA POSITION ÉTEINT LES PARTIELS MULTIPLES DE 1/β, du module exact du peigne, à 1 dB près", () => {
    const f = 220, beta = 0.2;
    const M = decalageDePosition(beta, 44100 / f);
    const peigneDb = (fk: number) => 20 * Math.log10(2 * Math.abs(Math.sin((Math.PI * fk * M) / 44100)));
    const [sans, avec] = [rapport(corde({ frequence: f }), f, 5), rapport(corde({ frequence: f, position: beta }), f, 5)];
    const predit = peigneDb(avec.fk) - peigneDb(avec.f1);
    expect(predit).toBeLessThan(-30);
    expect(Math.abs(avec.db - sans.db - predit), `${(avec.db - sans.db).toFixed(2)} contre ${predit.toFixed(2)} dB`).toBeLessThan(1);
  });

  it("LA DIRECTION ET LA NUANCE ASSOMBRISSENT DU MODULE EXACT DE LEUR PÔLE, à 0,5 dB près", () => {
    const f = 440, k = 8, sans = rapport(corde({ frequence: f }), f, k);
    for (const direction of [0.5, 0.9]) {
      const avec = rapport(corde({ frequence: f, direction }), f, k);
      const predit = unPoleDb(direction, avec.fk) - unPoleDb(direction, avec.f1);
      expect(Math.abs(avec.db - sans.db - predit), `p ${direction} : ${(avec.db - sans.db).toFixed(2)} contre ${predit.toFixed(2)} dB`).toBeLessThan(0.5);
    }
    for (const bande of [500, 3000]) {
      const avec = rapport(corde({ frequence: f, bande }), f, k), r = poleDeNuance(bande, f, 44100);
      const neutre = poleDeNuance(22050, f, 44100);
      const predit = unPoleDb(r, avec.fk) - unPoleDb(r, avec.f1) - (unPoleDb(neutre, sans.fk) - unPoleDb(neutre, sans.f1));
      expect(Math.abs(avec.db - sans.db - predit), `L ${bande} : ${(avec.db - sans.db).toFixed(2)} contre ${predit.toFixed(2)} dB`).toBeLessThan(0.5);
    }
  });

  it("À NUANCE ÉGALE, LE FONDAMENTAL A LE MÊME GAIN À TOUTES LES HAUTEURS, celui de la bande L à la référence", () => {
    // JAFFE ET SMITH, 1983, « Dynamics » : un pôle fixe e^(−πL/fs) ferait sonner le grave plus fort
    // que l'aigu. Le pôle de chaque note est choisi pour que son gain à la fondamentale soit G_L, le
    // gain du passe-bas de bande L à la moyenne géométrique de 20 Hz et de fs/2. Écrit ici en clair.
    const sr = 44100, ref = Math.sqrt(20 * (sr / 2));
    for (const bande of [300, 2000, 8000]) {
      const gL = gainUnPole(Math.exp((-Math.PI * bande) / sr), ref, sr);
      for (const f of [55, 220, 880, 3520]) {
        expect(gainUnPole(poleDeNuance(bande, f, sr), f, sr), `L ${bande}, ${f} Hz`).toBeCloseTo(gL, 9);
      }
    }
    // ET DANS LE SON : la nuance retranche au fondamental le même nombre de décibels à toutes les hauteurs.
    const retranche = [110, 440, 1760].map((f) => {
      const etroite = corde({ frequence: f, bande: 300 }), large = corde({ frequence: f, bande: 22050 });
      const f1 = partiel(large, f, 1);
      return 20 * Math.log10(amplitudeDeRaie(etroite, sr, 0, 0.2, f1) / amplitudeDeRaie(large, sr, 0, 0.2, f1));
    });
    const predit = 20 * Math.log10(gainUnPole(Math.exp((-Math.PI * 300) / sr), ref, sr) / gainUnPole(Math.exp(-Math.PI / 2), ref, sr));
    for (const db of retranche) expect(Math.abs(db - predit), `${retranche.map((d) => d.toFixed(2)).join(", ")} contre ${predit.toFixed(2)} dB`).toBeLessThan(0.3);
  });

  it("LES QUATRE EXCITATIONS PINCENT QUATRE CORDES DIFFÉRENTES, chacune juste", () => {
    const audio = Float32Array.from({ length: 44100 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 1000 * i) / 44100));
    const sons = (["blanc", "rose", "impulsion", "audio"] as const).map((genre) => {
      const excitation = excitationDeCorde({
        genre, periode: 44100 / 220, longueur: 1, audio, position: 0, direction: 0, bande: 22050, sampleRate: 44100, aleatoire: creerAleatoire(5),
      });
      const x = calculerCordePincee({ frequence: 220, sampleRate: 44100, duree: 0.6, resonance: 1, debutRelache: 99, relache: 0, volume: 1, etirement: 1, excitation, priseALEntree: true });
      expect(Math.abs(centsEntre(jouee(x, 220), 220)), genre).toBeLessThan(1);
      return empreinte(x);
    });
    expect(new Set(sons).size).toBe(4);
  });
});
