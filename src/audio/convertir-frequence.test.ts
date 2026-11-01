// audio/convertir-frequence.test.ts — Ce que la conversion de fréquence fabrique de parasites.
//
// ═══ POURQUOI CETTE MESURE DÉCIDE DU CODE, ET NON L'INVERSE ═══
//
// Point 5 d'une revue du dépôt : « aucun rééchantillonneur de qualité, la conversion est laissée au
// navigateur ». Mon premier jet s'est contenté de NOMMER celui du navigateur — un seul appel, au
// lieu de quarante-trois implicites —, et la mesure a renversé cette décision : voir l'en-tête de
// `convertir-frequence.ts`, celui du navigateur est une interpolation LINÉAIRE, la pire des trois.
//
// CE CAS TIENT LES DEUX MOITIÉS DE LA QUALITÉ, et elles ne se mesurent pas de la même façon :
//
//   · EN MONTANT, rien ne se replie et c'est l'erreur de l'interpolateur qu'on mesure, par le
//     rapport de la raie aux parasites.
//   · EN DESCENDANT, l'interpolateur n'est plus le sujet : tout ce qui passe au-dessus du nouveau
//     Nyquist REVIENT dans la bande, à une fréquence qu'on peut calculer, et c'est l'énergie à
//     CETTE fréquence-là qu'il faut relever. Un rapport global n'y verrait rien.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { convertirVersFrequence, reechantillonnerCanal, reechantillonnerLineaire, reechantillonnerParLeNavigateur } from "./convertir-frequence";
import { echantillonCubique, echantillonLineaire } from "./interpolation";
import { raieSurParasites } from "./mesure-raie";

const N = 2048;

function sinus(frequence: number, n: number, sr: number): Float32Array<ArrayBuffer> {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * frequence * i) / sr);
  return x;
}

/**
 * Le milieu de la sortie, aligné sur une période entière de la raie.
 *
 * DEUX RAISONS, et chacune fausserait la mesure à elle seule. Un rééchantillonneur a des BORDS : son
 * noyau n'a pas d'échantillons à gauche au premier point, ni à droite au dernier, et les y mesurer
 * compterait pour parasite ce qui n'est qu'une amorce. Et couper au milieu d'une période rompt la
 * périodicité sur la fenêtre : c'est la fuite de la fenêtre qui revient, celle qui a fait annoncer
 * un faux 0,1 dB dans `interpolation.test.ts`.
 */
function milieu(y: Float32Array, hz: number, sr: number): Float32Array {
  const parPeriode = sr / hz;
  const brut = Math.max(0, Math.floor((y.length - N) / 2));
  const debut = Math.round(Math.round(brut / parPeriode) * parPeriode);
  return y.slice(debut, debut + N);
}

/** Transposition à pas constant par un interpolateur, pour servir de témoin. */
function parInterpolation(
  x: Float32Array, depart: number, arrivee: number,
  echantillon: (lire: (i: number) => number, pos: number) => number,
): Float32Array {
  const lire = (i: number) => x[Math.min(x.length - 1, Math.max(0, i))];
  const pas = depart / arrivee;
  const y = new Float32Array(Math.round((x.length * arrivee) / depart));
  for (let j = 0; j < y.length; j++) y[j] = echantillon(lire, j * pas);
  return y;
}

/** L'énergie à une fréquence, par Goertzel, rapportée au nombre d'échantillons. */
function energie(y: Float32Array, hz: number, sr: number): number {
  const w = (2 * Math.PI * hz) / sr, coef = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < y.length; i++) { const s0 = y[i] + coef * s1 - s2; s2 = s1; s1 = s0; }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coef * s1 * s2)) / y.length;
}

describe("la conversion vers la fréquence de travail", () => {
  it("EN MONTANT, ELLE BAT L'INTERPOLATION LINÉAIRE DU NAVIGATEUR DE VINGT-SEPT DÉCIBELS", () => {
    // Le rang 43 place la raie à 1 007,8 Hz dans l'analyse de SORTIE, où l'oreille entend le mieux
    // un parasite. La fréquence de sortie se choisit d'abord — voir `mesure-raie.ts`.
    const DEPART = 44100, ARRIVEE = 48000, RANG = 43;
    const F = (RANG * ARRIVEE) / N;
    const source = sinus(F, DEPART, DEPART);

    const nous = reechantillonnerCanal(source, DEPART, ARRIVEE);
    const lin = parInterpolation(source, DEPART, ARRIVEE, echantillonLineaire);
    const cub = parInterpolation(source, DEPART, ARRIVEE, echantillonCubique);

    const dbNous = raieSurParasites(milieu(nous, F, ARRIVEE), RANG, N);
    const dbLin = raieSurParasites(milieu(lin, F, ARRIVEE), RANG, N);
    const dbCub = raieSurParasites(milieu(cub, F, ARRIVEE), RANG, N);
    console.log(`44,1 → 48 kHz · raie sur parasites · moteur ${dbNous.toFixed(1)} dB`
      + ` · cubique nu ${dbCub.toFixed(1)} dB · linéaire ${dbLin.toFixed(1)} dB`);

    // LE CHIFFRE DU NAVIGATEUR EST CELUI DU LINÉAIRE, mesuré à trois millièmes près dans Chromium
    // comme ici : 62,26 contre 62,27. C'est ce témoin-là qu'il faut battre, et de beaucoup.
    expect(dbNous, [
      "",
      "LA CONVERSION DU MOTEUR N'EST PLUS MEILLEURE QUE L'INTERPOLATION LINÉAIRE.",
      "",
      "C'est tout l'objet de `convertir-frequence.ts` : les quarante-trois conversions implicites",
      "qu'il remplace passaient par un `AudioBufferSourceNode`, dont le rééchantillonnage EST",
      "linéaire — mesuré à 62,26 dB dans Chromium, 62,27 pour le linéaire écrit à la main.",
      "",
    ].join("\n")).toBeGreaterThan(dbLin + 20);
    expect(dbCub, "et le cubique nu doit rester bien au-dessus du linéaire").toBeGreaterThan(dbLin + 20);
  });

  it("EN DESCENDANT, LE FILTRE EMPÊCHE UN SON DE REVENIR OÙ IL N'ÉTAIT PAS", () => {
    // ═══ LE CAS QUE `interpolation.test.ts` RENVOYAIT À PLUS TARD ═══
    //
    // « Vers l'aigu, c'est le repliement qui domine, et aucun interpolateur n'y peut rien sans un
    // filtre AVANT la décimation. C'est un autre chantier. » Celui-ci.
    //
    // 23 000 Hz à 48 kHz passe au-dessus du Nyquist de 44,1 (22 050) : sans filtre il REVIENT à
    // 44 100 − 23 000 = 21 100 Hz. C'est un son qui n'a jamais existé, et aucune interpolation ne
    // l'enlèvera après coup.
    const DEPART = 48000, ARRIVEE = 44100;
    const source = sinus(23000, DEPART, DEPART);

    const nous = reechantillonnerCanal(source, DEPART, ARRIVEE);
    const cubNu = parInterpolation(source, DEPART, ARRIVEE, echantillonCubique);
    const linNu = parInterpolation(source, DEPART, ARRIVEE, echantillonLineaire);

    const dB = (v: number) => 20 * Math.log10(Math.max(v, 1e-12));
    const [e, c, l] = [nous, cubNu, linNu].map((y) => energie(y, 21100, ARRIVEE));
    console.log(`48 → 44,1 kHz · repliement de 23 kHz vers 21,1 kHz · moteur ${dB(e).toFixed(1)} dB`
      + ` · cubique nu ${dB(c).toFixed(1)} dB · linéaire nu ${dB(l).toFixed(1)} dB`);

    // LE TÉMOIN EST LE CUBIQUE NU, et non le linéaire : c'est la comparaison qui isole l'apport DU
    // FILTRE. Les deux interpolateurs replient autant — c'est la décimation qui replie, pas eux.
    expect(dB(e), [
      "",
      "UN SON AU-DESSUS DU NOUVEAU NYQUIST REVIENT DANS LA BANDE.",
      "",
      "Le passe-bas de `convertir-frequence.ts` ne s'applique plus, ou plus avant la décimation.",
      "Filtrer APRÈS ne sert à rien : le repliement est alors déjà dans la bande, et c'est tout ce",
      "que le mot veut dire. Vérifier que `reechantillonnerCanal` filtre quand `arrivee < depart`.",
      "",
    ].join("\n")).toBeLessThan(dB(c) - 40);
  });

  it("ET UN SON DÉJÀ À LA BONNE FRÉQUENCE EST RENDU TEL QUEL, sans copie", async () => {
    // L'IDENTITÉ EST EXIGÉE, et non l'égalité : c'est ce qui rend l'invariant du moteur gratuit. Un
    // graphe entier à 44 100 Hz ne paie rien, et une copie par nœud et par run se verrait dans
    // l'économie de mémoire, qui compte les tampons.
    const t = new AudioBuffer({ numberOfChannels: 2, length: 64, sampleRate: 44100 });
    expect(await convertirVersFrequence(t, 44100)).toBe(t);
  });

  it("la conversion garde la durée, le nombre de canaux, et le niveau", async () => {
    const t = new AudioBuffer({ numberOfChannels: 2, length: 44100, sampleRate: 44100 });
    const g = sinus(1000, 44100, 44100), d = sinus(2000, 44100, 44100);
    t.copyToChannel(g, 0); t.copyToChannel(d, 1);
    const c = await convertirVersFrequence(t, 48000);
    expect(c.sampleRate).toBe(48000);
    expect(c.numberOfChannels, "les deux canaux doivent survivre, et chacun le sien").toBe(2);
    expect(c.duration).toBeCloseTo(1, 2);
    // LE NIVEAU EST EXIGÉ : un passe-bas non normalisé baisse le gain, et une conversion qui baisse
    // le niveau est un défaut qu'on cherche ensuite pendant des heures. Et chaque canal garde SA
    // hauteur — les intervertir passerait toutes les autres mesures.
    expect(energie(c.getChannelData(0), 1000, 48000)).toBeGreaterThan(0.4);
    expect(energie(c.getChannelData(1), 2000, 48000)).toBeGreaterThan(0.4);
    expect(energie(c.getChannelData(0), 2000, 48000)).toBeLessThan(0.05);
  });

  it("et un son vide ne fait pas tomber la conversion", async () => {
    // Un tampon d'un seul échantillon : le filtre à 191 rangs lit bien au-delà de ses bords, et sa
    // réflexion doit tenir. Un run entier tomberait sinon sur un nœud qui rend presque rien.
    const court = new AudioBuffer({ numberOfChannels: 1, length: 1, sampleRate: 48000 });
    expect((await convertirVersFrequence(court, 44100)).length).toBeGreaterThan(0);
  });

  it("UN CALCUL PASSÉ HORS DU FIL REND LE MÊME SON, chaque canal à sa place", async () => {
    // C'est par `porter` que le moteur sort la conversion du fil de l'interface : elle y gelait
    // treize secondes sur deux minutes de stéréo. Le travailleur exécute `reechantillonnerCanal`
    // lui-même ; ce cas tient l'autre moitié, que l'assemblage d'un calcul ASYNCHRONE et rendu
    // dans le désordre remet chaque canal à son rang, à l'échantillon près.
    const t = new AudioBuffer({ numberOfChannels: 3, length: 4800, sampleRate: 48000 });
    for (let c = 0; c < 3; c++) t.copyToChannel(sinus(500 * (c + 1), 4800, 48000), c);
    const appels: number[] = [];
    const porter = async (x: Float32Array, depart: number, arrivee: number) => {
      appels.push(depart);
      await new Promise((r) => setTimeout(r, x[1] < 0.1 ? 15 : 1));
      return reechantillonnerCanal(x, depart, arrivee);
    };
    const dansLeFil = await convertirVersFrequence(t, 44100);
    const horsDuFil = await convertirVersFrequence(t, 44100, 3, porter);
    expect(appels, "un appel par canal").toEqual([48000, 48000, 48000]);
    for (let c = 0; c < 3; c++) {
      expect(horsDuFil.getChannelData(c), `le canal ${c} n'est pas celui du calcul dans le fil`)
        .toEqual(dansLeFil.getChannelData(c));
    }
  });
});

describe("le rééchantillonnage PAR LE NAVIGATEUR, écrit une fois", () => {
  // LE TÉMOIN EST LE BLOC QUE SIX MODULES ÉCRIVAIENT, recopié tel quel : le canonique doit rendre
  // les mêmes échantillons, au bit près, sinon il a changé leur son.
  async function temoin(b: AudioBuffer, sr: number, canaux = b.numberOfChannels, longueur = Math.max(1, Math.ceil(b.duration * sr))) {
    const off = new OfflineAudioContext(canaux, longueur, sr);
    const s = off.createBufferSource(); s.buffer = b; s.connect(off.destination); s.start(0);
    return off.startRendering();
  }
  function stereo(sr: number, n: number): AudioBuffer {
    const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
    b.copyToChannel(sinus(440, n, sr), 0); b.copyToChannel(sinus(1000, n, sr), 1);
    return b;
  }
  const memes = (a: AudioBuffer, b: AudioBuffer) => {
    expect([a.numberOfChannels, a.length, a.sampleRate]).toEqual([b.numberOfChannels, b.length, b.sampleRate]);
    for (let c = 0; c < a.numberOfChannels; c++) expect(a.getChannelData(c)).toEqual(b.getChannelData(c));
  };

  it("rend ce que rendait le bloc, en baissant et en montant", async () => {
    const b = stereo(48000, 4801);
    memes(await reechantillonnerParLeNavigateur(b, 44100), await temoin(b, 44100));
    memes(await reechantillonnerParLeNavigateur(b, 96000), await temoin(b, 96000));
  });

  it("respecte le nombre de canaux et la longueur que l'appelant impose", async () => {
    const b = stereo(48000, 4801);
    memes(await reechantillonnerParLeNavigateur(b, 16000, { canaux: 1 }), await temoin(b, 16000, 1));
    const b2 = stereo(48000, 4807); // 4 416,43 échantillons à 44 100 : arrondir et plafonner diffèrent
    const longueur = Math.max(1, Math.round(b2.duration * 44100));
    expect(longueur).not.toBe(Math.ceil(b2.duration * 44100));
    memes(await reechantillonnerParLeNavigateur(b2, 44100, { longueur }), await temoin(b2, 44100, 2, longueur));
  });
});

describe("le rééchantillonnage linéaire, écrit une fois", () => {
  // Le témoin est la fonction que deux transcripteurs portaient chacun, recopiée.
  function temoin(mono: Float32Array, sr: number): Float32Array {
    if (sr === 16000) return mono;
    const ratio = 16000 / sr;
    const nb = Math.floor(mono.length * ratio);
    const out = new Float32Array(nb);
    for (let i = 0; i < nb; i++) {
      const pos = i / ratio; const idx = Math.floor(pos); const frac = pos - idx;
      out[i] = idx + 1 < mono.length ? mono[idx] * (1 - frac) + mono[idx + 1] * frac : mono[Math.min(idx, mono.length - 1)];
    }
    return out;
  }

  it("rend les mêmes échantillons que les deux copies, et le même objet à fréquence égale", () => {
    for (const sr of [44100, 48000, 22050, 8000]) {
      expect(reechantillonnerLineaire(sinus(440, 2205, sr), sr, 16000)).toEqual(temoin(sinus(440, 2205, sr), sr));
    }
    const deja = sinus(440, 160, 16000);
    expect(reechantillonnerLineaire(deja, 16000, 16000)).toBe(deja);
  });
});
