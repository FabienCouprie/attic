// audio/texture-statistique.ts — Engendrer une texture sonore à partir de ses statistiques.
//
// D'après Josh H. McDermott et Eero P. Simoncelli, « Sound Texture Perception via Statistics of
// the Auditory Periphery: Evidence from Sound Synthesis », Neuron 71(5), 2011 —
// https://mcdermottlab.mit.edu/papers/McDermott_Simoncelli_2011_sound_texture_synthesis.pdf
//
// LA THÈSE DE L'ARTICLE, et c'est elle qu'on met en œuvre : une texture — pluie, feu, foule,
// applaudissements — se reconnaît à des STATISTIQUES MOYENNÉES DANS LE TEMPS, mesurées sur une
// décomposition du son telle que l'oreille la fait. Deux enregistrements de pluie n'ont aucun
// échantillon en commun ; ce qu'ils partagent, ce sont ces nombres-là. D'où le procédé : mesurer
// les statistiques d'un son, puis fabriquer un bruit NEUF qui les respecte.
//
// CE QUE CELA APPORTE À ATTIC, qui sait déjà geler et mosaïquer. Le gel granulaire BOUCLE un
// grain ; la mosaïque de corpus RECOPIE des grains. Les deux répètent, et l'oreille finit
// toujours par entendre la boucle. Ici, rien n'est recopié : le son de sortie ne contient aucun
// échantillon de l'entrée, et il peut durer indéfiniment sans jamais se répéter.
//
// CE QUI EST IMPOSÉ, ET CE QUI NE L'EST PAS — la part honnête de cette mise en œuvre :
//
//   — imposé : la DISTRIBUTION COMPLÈTE de l'enveloppe de chaque bande (donc sa moyenne, sa
//     variance, son asymétrie, son aplatissement, et tous les moments suivants), et les
//     CORRÉLATIONS ENTRE BANDES. L'article montre que les premières seules ne suffisent pas et
//     que ce sont les secondes qui font basculer le résultat vers quelque chose de reconnaissable
//     — c'est vérifié ici par un test, qui mesure les deux cas ;
//   — non imposé : les corrélations de modulation C1 et C2 de l'article, qui demandent un second
//     banc de filtres sur les enveloppes. Leur absence s'entend surtout sur les textures très
//     rythmées, où la régularité se perd ;
//   — l'article BOUCLE analyse et synthèse par descente de gradient ; ici les statistiques sont
//     imposées dans le domaine des enveloppes par projections alternées, puis le son est
//     reconstruit une fois. C'est plus rapide de deux ordres de grandeur, et l'écart restant se
//     mesure — `distanceStatistiques` le rend.

import { fft } from "./fft";

/** Nombre de bandes cochléaires par défaut : l'article en emploie une trentaine. */
export const BANDES_DEFAUT = 28;

// ── Le banc de filtres cochléaire ───────────────────────────────────────────────

/** Fréquence en nombre de bandes rectangulaires équivalentes (Glasberg & Moore, 1990). */
export const versErb = (hz: number) => 21.4 * Math.log10(1 + 0.00437 * hz);
export const depuisErb = (erb: number) => (10 ** (erb / 21.4) - 1) / 0.00437;

/**
 * Les fréquences centrales des bandes, également espacées sur l'échelle ERB.
 *
 * C'est ce qui rend la décomposition « telle que l'oreille la fait » : des bandes étroites dans
 * le grave, larges dans l'aigu, à l'image de la cochlée. Un espacement linéaire donnerait trop
 * de bandes dans l'aigu, où l'oreille n'en distingue plus.
 */
export function centresErb(nombre: number, basse = 50, haute = 16000): Float64Array {
  const e0 = versErb(basse), e1 = versErb(haute);
  return Float64Array.from({ length: nombre }, (_, i) => depuisErb(e0 + ((e1 - e0) * i) / (nombre - 1)));
}

const prochainePuissanceDeDeux = (n: number) => {
  let p = 1;
  while (p < n) p *= 2;
  return p;
};

/**
 * Décompose un signal en bandes et rend l'enveloppe de chacune.
 *
 * Tout se fait en une transformée : on met le signal en fréquence une fois, et chaque bande est
 * obtenue en ne gardant qu'une fenêtre du spectre — en ne gardant QUE les fréquences positives,
 * de sorte que la transformée inverse rend directement le signal analytique de la bande, dont le
 * module EST l'enveloppe. Passer par une transformée de Hilbert séparée par bande coûterait deux
 * fois plus.
 */
export function bandesEtEnveloppes(
  x: Float32Array, sampleRate: number, nombre = BANDES_DEFAUT,
): { bandes: Float32Array[]; enveloppes: Float32Array[]; centres: Float64Array } {
  const n = x.length;
  const N = prochainePuissanceDeDeux(n);
  const centres = centresErb(nombre);
  const re0 = new Float64Array(N), im0 = new Float64Array(N);
  for (let i = 0; i < n; i++) re0[i] = x[i];
  fft(re0, im0, false);

  const bandes: Float32Array[] = [], enveloppes: Float32Array[] = [];
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let b = 0; b < nombre; b++) {
    // Fenêtre en cosinus surélevé entre les centres voisins : les bandes se recouvrent et leur
    // somme reconstitue le signal, ce qui permet de resynthétiser sans trou spectral.
    const bas = b === 0 ? 0 : centres[b - 1];
    const haut = b === nombre - 1 ? sampleRate / 2 : centres[b + 1];
    re.fill(0); im.fill(0);
    for (let k = 1; k < N / 2; k++) {
      const f = (k * sampleRate) / N;
      if (f <= bas || f >= haut) continue;
      const e = versErb(f), eb = versErb(bas), eh = versErb(haut);
      const g = 0.5 - 0.5 * Math.cos((2 * Math.PI * (e - eb)) / (eh - eb));
      // Deux fois le bin positif, rien au négatif : c'est le signal analytique.
      re[k] = 2 * g * re0[k]; im[k] = 2 * g * im0[k];
    }
    fft(re, im, true);
    const bande = new Float32Array(n), env = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      bande[i] = re[i];
      env[i] = Math.hypot(re[i], im[i]);
    }
    bandes.push(bande); enveloppes.push(env);
  }
  return { bandes, enveloppes, centres };
}

// ── Les statistiques ────────────────────────────────────────────────────────────

export interface StatistiquesTexture {
  /** Moyenne de l'enveloppe de chaque bande. */
  moyennes: Float64Array;
  /** Écart-type rapporté à la moyenne : l'éparsité, qui distingue la pluie du souffle. */
  variations: Float64Array;
  asymetries: Float64Array;
  aplatissements: Float64Array;
  /** Corrélations entre enveloppes de bandes, en matrice triangulaire aplatie. */
  correlations: Float64Array;
  nombreBandes: number;
}

function moments(env: Float32Array): { moyenne: number; variation: number; asymetrie: number; aplatissement: number } {
  const n = env.length;
  if (n === 0) return { moyenne: 0, variation: 0, asymetrie: 0, aplatissement: 0 };
  let s = 0;
  for (let i = 0; i < n; i++) s += env[i];
  const moyenne = s / n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (let i = 0; i < n; i++) {
    const d = env[i] - moyenne;
    m2 += d * d; m3 += d * d * d; m4 += d * d * d * d;
  }
  m2 /= n; m3 /= n; m4 /= n;
  const ec = Math.sqrt(m2);
  return {
    moyenne,
    variation: moyenne > 1e-12 ? ec / moyenne : 0,
    asymetrie: m2 > 1e-24 ? m3 / m2 ** 1.5 : 0,
    aplatissement: m2 > 1e-24 ? m4 / (m2 * m2) : 0,
  };
}

/**
 * Corrélation de Pearson entre deux enveloppes.
 *
 * `pas` permet de n'en lire qu'un échantillon sur n. Ce n'est pas une approximation gratuite :
 * une enveloppe est un signal LENT — quelques dizaines de hertz de modulation au plus —, et
 * l'article lui-même sous-échantillonne les enveloppes avant d'en prendre les statistiques. Le
 * gain est direct, le coût des corrélations croissant avec le carré du nombre de bandes.
 */
export function correlation(a: Float32Array, b: Float32Array, pas = 1): number {
  const n = Math.min(a.length, b.length);
  const p = Math.max(1, Math.floor(pas));
  let sa = 0, sb = 0, compte = 0;
  for (let i = 0; i < n; i += p) { sa += a[i]; sb += b[i]; compte++; }
  if (compte === 0) return 0;
  const ma = sa / compte, mb = sb / compte;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i += p) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return da > 1e-24 && db > 1e-24 ? num / Math.sqrt(da * db) : 0;
}

/** Un échantillon d'enveloppe sur huit suffit à mesurer une corrélation, et coûte huit fois moins. */
const PAS_CORRELATION = 8;

/**
 * Facteur de décimation des enveloppes pour le travail statistique.
 *
 * Trente-deux à 44 100 Hz laisse encore 1 378 points par seconde, très au-dessus des quelques
 * dizaines de hertz qu'une enveloppe module : rien de ce qu'on mesure n'est perdu, et tout ce
 * qu'on calcule coûte trente-deux fois moins.
 */
export const DECIMATION = 32;

/** Moyenne par blocs : une décimation qui ne laisse pas passer de repliement. */
export function decimer(e: Float32Array, pas = DECIMATION): Float32Array {
  const n = Math.max(1, Math.ceil(e.length / pas));
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, compte = 0;
    for (let k = i * pas; k < Math.min(e.length, (i + 1) * pas); k++) { s += e[k]; compte++; }
    d[i] = compte > 0 ? s / compte : 0;
  }
  return d;
}

/** Remonte une enveloppe décimée à la cadence du son, par interpolation linéaire. */
export function interpoler(d: Float32Array, longueur: number): Float32Array {
  const y = new Float32Array(longueur);
  if (d.length === 0) return y;
  if (d.length === 1) { y.fill(d[0]); return y; }
  const echelle = (d.length - 1) / Math.max(1, longueur - 1);
  for (let i = 0; i < longueur; i++) {
    const x = i * echelle;
    const k = Math.min(d.length - 2, Math.floor(x));
    const f = x - k;
    y[i] = d[k] * (1 - f) + d[k + 1] * f;
  }
  return y;
}

export function statistiques(enveloppes: Float32Array[]): StatistiquesTexture {
  const n = enveloppes.length;
  const moyennes = new Float64Array(n), variations = new Float64Array(n);
  const asymetries = new Float64Array(n), aplatissements = new Float64Array(n);
  enveloppes.forEach((e, i) => {
    const m = moments(e);
    moyennes[i] = m.moyenne; variations[i] = m.variation;
    asymetries[i] = m.asymetrie; aplatissements[i] = m.aplatissement;
  });
  const correlations = new Float64Array((n * (n - 1)) / 2);
  let p = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) correlations[p++] = correlation(enveloppes[i], enveloppes[j]);
  }
  return { moyennes, variations, asymetries, aplatissements, correlations, nombreBandes: n };
}

/**
 * Écart entre deux jeux de statistiques, en pour cent.
 *
 * Sert à mesurer la ressemblance plutôt qu'à l'affirmer : le nœud l'affiche, et les tests le
 * comparent entre la synthèse avec corrélations et celle sans — c'est ainsi que la thèse de
 * l'article se vérifie ici plutôt que de se citer.
 */
export function distanceStatistiques(a: StatistiquesTexture, b: StatistiquesTexture): number {
  const ecartRelatif = (x: Float64Array, y: Float64Array) => {
    let s = 0, n = Math.min(x.length, y.length);
    for (let i = 0; i < n; i++) {
      const echelle = Math.max(Math.abs(x[i]), Math.abs(y[i]), 1e-6);
      s += Math.abs(x[i] - y[i]) / echelle;
    }
    return n > 0 ? s / n : 0;
  };
  return 100 * (
    ecartRelatif(a.moyennes, b.moyennes)
    + ecartRelatif(a.variations, b.variations)
    + ecartRelatif(a.asymetries, b.asymetries)
    + ecartRelatif(a.aplatissements, b.aplatissements)
    + ecartRelatif(a.correlations, b.correlations)
  ) / 5;
}

// ── La synthèse ─────────────────────────────────────────────────────────────────

/** Générateur reproductible : deux synthèses de même graine donnent le même son. */
function hasard(graine: number): () => number {
  let g = (graine | 0) || 1;
  return () => {
    g = (g * 1103515245 + 12345) & 0x7fffffff;
    return g / 0x7fffffff;
  };
}

/**
 * Impose à `valeurs` la distribution de `modele`, par transport de rang.
 *
 * On trie les deux, et l'on remplace la k-ième plus petite valeur par la k-ième plus petite du
 * modèle. La distribution devient EXACTEMENT celle du modèle — donc tous ses moments à la fois,
 * et non les quatre premiers seulement — tandis que l'ordre temporel, lui, est conservé : la
 * structure du bruit reste, seules ses valeurs sont redistribuées.
 */
export function imposerDistribution(valeurs: Float32Array, modele: Float32Array): Float32Array {
  const n = valeurs.length;
  const rangs = Array.from({ length: n }, (_, i) => i).sort((a, b) => valeurs[a] - valeurs[b]);
  const trie = Float32Array.from(modele).sort();
  const sortie = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    // Le modèle peut être plus court ou plus long : on y lit à la position proportionnelle.
    sortie[rangs[k]] = trie[Math.min(trie.length - 1, Math.floor((k * trie.length) / n))];
  }
  return sortie;
}

export interface OptionsTexture {
  nombreBandes?: number;
  /** Imposer aussi les corrélations entre bandes. C'est ce qui change tout, selon l'article. */
  correlations?: boolean;
  /** Tours de projections alternées entre distributions et corrélations. */
  iterations?: number;
  graine?: number;
}

export interface ResultatTexture {
  son: Float32Array;
  /** Écart final aux statistiques visées, en pour cent. */
  ecart: number;
  iterations: number;
}

/**
 * Fabrique `duree` échantillons de texture neuve, aux statistiques de `modele`.
 *
 * Le son de sortie ne contient aucun échantillon de l'entrée : on part d'un bruit, on lui impose
 * les statistiques mesurées, et l'on reconstruit. Les longueurs n'ont aucune raison de
 * correspondre — les statistiques sont des moyennes temporelles —, si bien que cinq secondes de
 * pluie en engendrent trente sans se répéter.
 */
export function synthetiserTexture(
  modele: Float32Array, longueur: number, sampleRate: number, o: OptionsTexture = {},
): ResultatTexture {
  const nombre = o.nombreBandes ?? BANDES_DEFAUT;
  const iterations = Math.max(1, o.iterations ?? 8);
  const avecCorrelations = o.correlations !== false;
  const alea = hasard(o.graine ?? 1);

  const cible = bandesEtEnveloppes(modele, sampleRate, nombre);
  const statsCible = statistiques(cible.enveloppes);

  const bruit = Float32Array.from({ length: longueur }, () => alea() * 2 - 1);
  const source = bandesEtEnveloppes(bruit, sampleRate, nombre);
  // On garde la STRUCTURE FINE du bruit — sa phase, son grain — et l'on ne remplace que les
  // enveloppes : c'est ce qui rend le résultat neuf tout en le faisant ressembler au modèle.
  const structure = source.bandes.map((b, i) => {
    const e = source.enveloppes[i];
    return Float32Array.from(b, (v, k) => (e[k] > 1e-9 ? v / e[k] : 0));
  });

  // TOUT LE TRAVAIL STATISTIQUE SE FAIT SUR DES ENVELOPPES DÉCIMÉES, et c'est ce qui rend le
  // nœud utilisable : une enveloppe est un signal LENT, quelques dizaines de hertz de modulation
  // au plus, et l'article la sous-échantillonne lui aussi avant d'en prendre les statistiques.
  // Trier et mélanger trente-deux fois moins d'échantillons divise le calcul d'autant — mesuré à
  // soixante secondes avant, quelques secondes après — sans rien changer aux statistiques, qui
  // sont des moyennes.
  // `map(decimer)` passerait l'INDICE comme second argument, donc un pas de zéro sur la première
  // bande : on enveloppe l'appel.
  const cibleD = cible.enveloppes.map((e) => decimer(e));
  const statsCibleD = statistiques(cibleD);
  let envD = source.enveloppes.map((e, i) => imposerDistribution(decimer(e), cibleD[i]));
  for (let tour = 0; tour < iterations && avecCorrelations; tour++) {
    envD = imposerCorrelations(envD, statsCibleD);
    // Les corrélations abîment les distributions, et l'inverse : on alterne, comme le fait la
    // descente de gradient de l'article — en bien moins de tours, et sans resynthèse entre deux.
    envD = envD.map((e, i) => imposerDistribution(e, cibleD[i]));
  }
  const enveloppes = envD.map((e) => interpoler(e, longueur));

  const son = new Float32Array(longueur);
  for (let b = 0; b < nombre; b++) {
    for (let i = 0; i < longueur; i++) son[i] += structure[b][i] * enveloppes[b][i];
  }
  let crete = 0;
  for (let i = 0; i < longueur; i++) crete = Math.max(crete, Math.abs(son[i]));
  if (crete > 1e-9) for (let i = 0; i < longueur; i++) son[i] = (son[i] / crete) * 0.9;

  // L'écart est mesuré sur un EXTRAIT — quatre secondes au plus. Une statistique est une moyenne
  // temporelle : la mesurer sur tout le son coûterait une décomposition entière de plus pour un
  // chiffre qui ne bougerait pas de deux points.
  const extrait = son.subarray(0, Math.min(son.length, 4 * sampleRate));
  const obtenues = statistiques(bandesEtEnveloppes(extrait, sampleRate, nombre).enveloppes);
  return { son, ecart: distanceStatistiques(statsCible, obtenues), iterations };
}

/**
 * Rapproche les corrélations entre bandes de celles visées.
 *
 * Chaque paire de bandes est tirée l'une vers l'autre — ou éloignée — par un mélange linéaire
 * d'amplitude proportionnelle à l'écart de corrélation. C'est une projection grossière, pas une
 * décomposition de Cholesky : elle ne pose PAS la matrice exacte d'un coup, mais elle ne casse
 * pas les distributions autant, et les tours suivants rattrapent. Le test mesure ce qu'elle
 * gagne réellement.
 */
export function imposerCorrelations(
  enveloppes: Float32Array[], cible: StatistiquesTexture,
): Float32Array[] {
  const n = enveloppes.length;
  const sortie = enveloppes.map((e) => Float32Array.from(e));
  let p = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const visee = cible.correlations[p++];
      const actuelle = correlation(sortie[i], sortie[j], PAS_CORRELATION);
      const manque = visee - actuelle;
      if (Math.abs(manque) < 0.01) continue;
      // Mélanger un peu de j dans i rapproche leur corrélation de un ; en retirer l'éloigne.
      const a = 0.25 * manque;
      const ei = sortie[i], ej = sortie[j];
      for (let k = 0; k < ei.length; k++) {
        const vi = ei[k], vj = ej[k];
        ei[k] = vi + a * vj;
        ej[k] = vj + a * vi;
      }
    }
  }
  return sortie;
}
