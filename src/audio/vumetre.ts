// audio/vumetre.ts — Mesures de niveau audio : RMS, peak, LUFS (ITBS-R 128),
// crest factor, plage dynamique. Calculs en domaines temporel et fréquentiel
// (poids K pour LUFS).

export interface MesuresNiveau {
  rmsDb: number;        // RMS moyen en dBFS
  peakDb: number;       // crête (peak) en dBFS
  lufs: number;         // loudness intégrée en LUFS (poids K)
  lufsMax: number;      // loudness maximale momentanée (400 ms)
  lufsMin: number;      // loudness minimale momentanée
  crestFactorDb: number; // différence peak - RMS (facteur de crête)
  plageDynamiqueDb: number; // différence LRA (loudness range approximation)
  vraiPicDb: number;    // true peak (interpolé 4×) en dBTP
}

// Filtre "K-weighting" pour LUFS : filtre high-shelf + high-pass (simulation ITU-R BS.1770).
// On utilise une approximation par biquads en temps discret.
function prefilterK(samples: Float32Array, sr: number): Float32Array {
  // Stage 1: high-shelf (+4 dB) ~ 1500 Hz
  const f1 = 1500, g1 = 4;
  const a1 = Math.pow(10, g1 / 40);
  const w1 = 2 * Math.PI * f1 / sr;
  const tan1 = Math.sin(w1) / (2 * a1);
  const b10 = (1 + a1 * tan1) / (1 + tan1);
  const b11 = -2 * Math.cos(w1) / (1 + tan1);
  const b12 = (1 - a1 * tan1) / (1 + tan1);
  const a11 = b11, a12 = (1 - tan1) / (1 + tan1);

  // Stage 2: high-pass ~ 38 Hz
  const f2 = 38;
  const w2 = 2 * Math.PI * f2 / sr;
  const tan2 = Math.sin(w2) / (2 * 0.5);
  const b20 = 1 / (1 + tan2);
  const b21 = -2 * b20;
  const b22 = b20;
  const a21 = -2 * Math.cos(w2) / (1 + tan2), a22 = (1 - tan2) / (1 + tan2);

  const out = new Float32Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0; // stage 1
  let x3 = 0, x4 = 0, y3 = 0, y4 = 0; // stage 2
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    // Stage 1
    const s1 = b10 * x + b11 * x1 + b12 * x2 - a11 * y1 - a12 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = s1;
    // Stage 2
    const s2 = b20 * s1 + b21 * x3 + b22 * x4 - a21 * y3 - a22 * y4;
    x4 = x3; x3 = s1; y4 = y3; y3 = s2;
    out[i] = s2;
  }
  return out;
}

/**
 * La sonie intégrée, selon ITU-R BS.1770-4, et la plage selon EBU Tech 3342.
 *
 * TROIS DÉFAUTS ONT ÉTÉ CORRIGÉS ICI, ET LE PREMIER RENDAIT LA MESURE INUTILISABLE.
 *
 *  1. ON MOYENNAIT DES DÉCIBELS. La somme se faisait sur les niveaux de bloc en LUFS, puis on
 *     divisait par leur nombre : c'est une moyenne de logarithmes, là où la norme moyenne les
 *     PUISSANCES et ne convertit qu'à la fin. Un son moitié à −27 LUFS, moitié silencieux, donnait
 *     −73 au lieu de −30 — mesuré dans l'application sur un rythme dont le niveau efficace était
 *     à −24 dBFS et qui s'annonçait à −73 LUFS. Un tel écart n'est pas une imprécision, c'est une
 *     autre grandeur.
 *  2. AUCUNE PORTE. La norme en exige deux : une absolue à −70 LUFS, qui écarte le silence, et une
 *     relative à dix unités sous le niveau non gardé, qui écarte les passages faibles. Sans elles,
 *     les blancs entre les notes tirent la mesure vers le bas, et deux morceaux de même force
 *     s'annoncent différemment selon ce qu'ils ont de silence.
 *  3. UN SEUL CANAL COMPTÉ. La boucle parcourait les canaux mais n'en retenait qu'un, si bien
 *     qu'une stéréo se lisait trois décibels trop bas — la sonie somme les puissances des canaux,
 *     et deux canaux identiques valent le double d'un seul.
 *
 * LES BLOCS SE RECOUVRENT AUX TROIS QUARTS, comme la norme le demande : sans recouvrement, une
 * note à cheval sur deux blocs est comptée deux fois à moitié et peut passer sous la porte des
 * deux côtés. Les sommes sont calculées par quarts de bloc puis additionnées quatre par quatre,
 * de sorte que le recouvrement ne coûte rien : chaque échantillon n'est lu qu'une fois.
 */
const OFFSET = -0.691;
const PORTE_ABSOLUE = -70;
const PORTE_RELATIVE = -10;
const PORTE_RELATIVE_PLAGE = -20;

interface SonieMesuree {
  integree: number;
  momentaneeMax: number;
  momentaneeMin: number;
  plage: number;
}

/** Le niveau d'un bloc, à partir de la somme pondérée des puissances de ses canaux. */
const niveauBloc = (puissance: number): number =>
  (puissance > 1e-15 ? OFFSET + 10 * Math.log10(puissance) : -Infinity);

/** La moyenne des puissances des blocs retenus, en niveau. */
function niveauMoyen(puissances: readonly number[]): number {
  if (puissances.length === 0) return -Infinity;
  return niveauBloc(puissances.reduce((s, p) => s + p, 0) / puissances.length);
}

/**
 * Les puissances pondérées par bloc, pour une durée de bloc et un pas donnés.
 *
 * `quarts` porte la somme des carrés de chaque quart de bloc, tous canaux confondus : un bloc en
 * additionne quatre, et le pas d'un quart donne le recouvrement de trois quarts.
 */
function puissancesParBloc(quarts: readonly number[], echantillonsParQuart: number, quartsParBloc: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + quartsParBloc <= quarts.length; i++) {
    let somme = 0;
    for (let j = 0; j < quartsParBloc; j++) somme += quarts[i + j];
    out.push(somme / (echantillonsParQuart * quartsParBloc));
  }
  return out;
}

/** Le centile demandé d'une liste déjà triée. */
function centile(triee: readonly number[], part: number): number {
  if (triee.length === 0) return 0;
  const rang = Math.min(triee.length - 1, Math.max(0, Math.round(part * (triee.length - 1))));
  return triee[rang];
}

export function sonieIntegree(buffer: AudioBuffer, sr: number, nch: number, length: number): SonieMesuree {
  const echantillonsParQuart = Math.max(1, Math.floor(0.1 * sr));
  const nbQuarts = Math.floor(length / echantillonsParQuart);
  if (nbQuarts < 4) return { integree: -Infinity, momentaneeMax: -Infinity, momentaneeMin: -Infinity, plage: 0 };

  // La somme des carrés de chaque quart de bloc, TOUS CANAUX ADDITIONNÉS — la sonie somme les
  // puissances des canaux, elle ne les moyenne pas.
  const quarts = new Float64Array(nbQuarts);
  for (let c = 0; c < nch; c++) {
    const filtre = prefilterK(buffer.getChannelData(c), sr);
    // Les canaux arrière d'une diffusion multicanale prèsent 1,41 dans la norme ; jusqu'à deux
    // canaux, tous pèsent un, ce qui couvre tout ce qu'Attic produit.
    const poids = 1;
    for (let q = 0; q < nbQuarts; q++) {
      let somme = 0;
      const debut = q * echantillonsParQuart;
      for (let i = 0; i < echantillonsParQuart; i++) somme += filtre[debut + i] * filtre[debut + i];
      quarts[q] += somme * poids;
    }
  }
  const parQuart = [...quarts];

  // Blocs momentanés : 400 ms, pas de 100 ms.
  const puissances = puissancesParBloc(parQuart, echantillonsParQuart, 4);
  const niveaux = puissances.map(niveauBloc);

  // Première porte : le silence absolu ne compte pas.
  const gardes1 = puissances.filter((_, i) => niveaux[i] > PORTE_ABSOLUE);
  if (gardes1.length === 0) {
    return { integree: -Infinity, momentaneeMax: Math.max(...niveaux), momentaneeMin: Math.min(...niveaux), plage: 0 };
  }
  // Seconde porte : dix unités sous le niveau de ce qui reste.
  const seuilRelatif = niveauMoyen(gardes1) + PORTE_RELATIVE;
  const gardes2 = puissances.filter((_, i) => niveaux[i] > PORTE_ABSOLUE && niveaux[i] > seuilRelatif);
  const integree = niveauMoyen(gardes2.length > 0 ? gardes2 : gardes1);

  // La plage, selon EBU Tech 3342 : blocs de trois secondes, porte relative à vingt unités, puis
  // l'écart entre le dixième et le quatre-vingt-quinzième centile. C'est ce qui remplace l'ancien
  // « maximum moins minimum », lequel annonçait cent décibels dès qu'un blanc traînait.
  const puissancesCourtTerme = puissancesParBloc(parQuart, echantillonsParQuart, 30);
  const niveauxCourtTerme = puissancesCourtTerme.map(niveauBloc);
  const courtGardes = puissancesCourtTerme.filter((_, i) => niveauxCourtTerme[i] > PORTE_ABSOLUE);
  let plage = 0;
  if (courtGardes.length > 0) {
    const seuil = niveauMoyen(courtGardes) + PORTE_RELATIVE_PLAGE;
    const retenus = niveauxCourtTerme
      .filter((n) => n > PORTE_ABSOLUE && n > seuil)
      .sort((a, b) => a - b);
    if (retenus.length > 0) plage = centile(retenus, 0.95) - centile(retenus, 0.10);
  }

  const niveauxGardes = niveaux.filter((n) => n > PORTE_ABSOLUE);
  return {
    integree,
    momentaneeMax: Math.max(...niveaux),
    // Le minimum est pris parmi les blocs qui portent du son : le silence n'est pas un niveau bas,
    // c'est l'absence de niveau, et le confondre avec un niveau bas est ce qui donnait cent
    // décibels de plage sur un son parfaitement ordinaire.
    momentaneeMin: niveauxGardes.length > 0 ? Math.min(...niveauxGardes) : -Infinity,
    plage,
  };
}

export function mesurerNiveau(buffer: AudioBuffer): MesuresNiveau {
  const sr = buffer.sampleRate;
  const nch = buffer.numberOfChannels;
  const length = buffer.length;

  // Mix to mono for RMS/peak, but compute LUFS with channel weights
  let sumSq = 0;
  let peak = 0;
  const mono = new Float32Array(length);
  for (let c = 0; c < nch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      mono[i] += d[i] / nch;
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      sumSq += d[i] * d[i];
    }
  }
  const rms = Math.sqrt(sumSq / (length * nch));
  const rmsDb = rms > 1e-9 ? 20 * Math.log10(rms) : -120;
  const peakDb = peak > 1e-9 ? 20 * Math.log10(peak) : -120;
  const crestFactorDb = peakDb - rmsDb;

  const mesure = sonieIntegree(buffer, sr, nch, length);

  // True peak: 4× interpolation linéaire
  let vraiPic = 0;
  for (let c = 0; c < nch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < length - 1; i++) {
      for (let j = 0; j < 4; j++) {
        const frac = j / 4;
        const v = Math.abs(d[i] * (1 - frac) + d[i + 1] * frac);
        if (v > vraiPic) vraiPic = v;
      }
    }
  }
  const vraiPicDb = vraiPic > 1e-9 ? 20 * Math.log10(vraiPic) : -120;

  return {
    rmsDb,
    peakDb,
    lufs: Math.max(-120, mesure.integree),
    lufsMax: Math.max(-120, mesure.momentaneeMax),
    lufsMin: Math.max(-120, mesure.momentaneeMin),
    crestFactorDb,
    plageDynamiqueDb: Math.max(0, mesure.plage),
    vraiPicDb,
  };
}
