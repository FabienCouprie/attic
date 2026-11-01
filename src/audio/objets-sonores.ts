// audio/objets-sonores.ts — Découper un son en objets, les décrire, les réordonner ; et monter.
//
// L'OBJET SONORE est l'unité de Pierre Schaeffer (Traité des objets musicaux, 1966) : un son perçu
// comme un tout, qu'on peut isoler, décrire, déplacer. Le catalogue savait déjà extraire, traiter et
// replacer des zones — mais il fallait les désigner à la main. Ce module les trouve.
//
// TROIS CRITÈRES, PARCE QUE TROIS MATÉRIAUX. Un objet ne se délimite pas de la même façon partout :
// des percussions se séparent par leurs attaques, un enregistrement de terrain par ses silences, un
// flux continu — un vent, une foule — par ses changements de timbre, faute d'attaque ou de silence.
// Choisir le critère est déjà un geste de composition ; aucun n'est « le bon ».
//
// Les zones produites ont la forme de celles du Sélecteur multi-zones — `{ debut, duree }` en
// secondes —, si bien que toute la chaîne existante les accepte. Elles portent en plus leurs
// descripteurs, que les nœuds existants ignorent et que « Réordonner les objets » exploite.

import { mixdownMono } from "./commun";
import { reechantillonnerParLeNavigateur } from "./convertir-frequence";
import { fft } from "./fft";
import {
  criteresSchaefferiens, degreDeMasse,
  type EspeceAllure, type EspeceMasse, type FormeDynamique,
} from "./criteres-schaefferiens";

export type CritereDecoupage = "attaques" | "silences" | "timbre" | "masse";

/**
 * Le champ des hauteurs où l'occupation est relevée par trame, en hertz.
 *
 * C'est le même que celui des critères schaefferiens, et pour la même raison : rapportée au demi de
 * la cadence, une occupation dépendrait de la cadence du son.
 */
const CHAMP_MASSE_HZ = 4000;

/** Sous ce rapport au sommet de la trame, un point du spectre est tenu pour vide, en décibels. */
const PLANCHER_MASSE_DB = -40;

/**
 * La nouveauté minimale d'une frontière, en écarts perceptibles.
 *
 * ELLE EST ABSOLUE, et c'est ce qui manquait : `pics` ne juge que des rapports, ramenant la courbe à
 * son propre maximum, de sorte qu'un son qui ne change pas voyait ses plus grosses ondulations de
 * mesure devenir des sommets francs. Comme chaque descripteur est maintenant divisé par l'écart
 * qu'on entend sur lui, la nouveauté se lit en écarts perceptibles et un plancher y a un sens : il
 * faut qu'au moins un descripteur ait changé d'autant.
 */
const PLANCHER_NOUVEAUTE = 0.7;

export interface ObjetSonore {
  debut: number;
  duree: number;
  /** Niveau efficace, en dB pleine échelle. */
  sonie: number;
  /** Centre de gravité du spectre, en hertz. */
  brillance: number;
  /** Platitude spectrale, de 0 (une note pure) à 1 (un bruit blanc). */
  bruit: number;
  /**
   * Les trois critères du Traité relevés sur l'objet, par `criteres-schaefferiens.ts`.
   *
   * ILS SONT RELEVÉS PAR OBJET ET NON PAR TRAME, et c'est ce qui les distingue des descripteurs
   * ci-dessus : une masse, une forme dynamique et une allure ne se lisent que sur un objet entier.
   *
   * ET UN OBJET PEUT ÊTRE TROP COURT POUR CERTAINS. L'allure demande au moins quatre ondulations
   * dans sa bande, donc environ une seconde pour une ondulation de quatre hertz : la plupart des
   * objets d'un découpage sont plus brefs, et reçoivent alors « aucune ». C'est dit plutôt que
   * supposé, et le tri par allure les range d'un seul côté.
   */
  masse: EspeceMasse;
  /** Le degré de cette masse sur l'échelle, de 0 pour le son pur à 4 pour le bruit blanc. */
  degreMasse: number;
  forme: FormeDynamique;
  /** La durée de l'attaque, en millisecondes. */
  attaqueMs: number;
  allure: EspeceAllure;
  /** L'écart relatif des périodes de l'allure, ou `null` quand l'objet n'en porte pas. */
  irregularite: number | null;
}

export interface OptionsDecoupage {
  critere: CritereDecoupage;
  /** 0 à 100 : plus haut, plus d'objets. */
  sensibilite: number;
  /** Durée minimale d'un objet, en millisecondes. */
  dureeMinMs: number;
  /** Pour le critère « silences » : ce qui est sous ce niveau est un silence, en dBFS. */
  seuilSilenceDb: number;
}

const N = 1024, SAUT = 256;

/** Les descripteurs trame par trame, calculés une fois pour tous les critères. */
interface Trames {
  nb: number;
  rms: Float64Array;
  flux: Float64Array;
  centre: Float64Array;
  platitude: Float64Array;
  /** La part du champ des hauteurs qui porte de l'énergie, de 0 à 1 : l'un des deux axes de la masse. */
  occupation: Float64Array;
  /** La partielle la plus forte de la trame, en hertz : l'autre axe, celui du placement de la masse. */
  dominante: Float64Array;
}

function trames(x: Float32Array, sr: number): Trames {
  const nb = Math.max(1, Math.floor((x.length - N) / SAUT) + 1);
  const hann = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const rms = new Float64Array(nb), flux = new Float64Array(nb), centre = new Float64Array(nb), platitude = new Float64Array(nb);
  const occupation = new Float64Array(nb), dominante = new Float64Array(nb);
  // Le champ est borné en hertz, donc en rangs par la cadence ; le dernier rang utile ne bouge pas.
  const hautChamp = Math.min(N / 2 - 1, Math.max(2, Math.floor((CHAMP_MASSE_HZ * N) / sr)));
  const seuilVide = Math.pow(10, PLANCHER_MASSE_DB / 20);
  const brut = new Float64Array(N / 2);
  let precedent = new Float64Array(N / 2);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let t = 0; t < nb; t++) {
    const o = t * SAUT;
    let e = 0;
    for (let i = 0; i < N; i++) { const v = o + i < x.length ? x[o + i] : 0; e += v * v; re[i] = v * hann[i]; im[i] = 0; }
    rms[t] = Math.sqrt(e / N);
    fft(re, im, false);
    const mag = new Float64Array(N / 2);
    let somme = 0, pondere = 0, logs = 0, df = 0;
    let crete = 0, rangCrete = 1;
    for (let k = 1; k < N / 2; k++) {
      const m = Math.hypot(re[k], im[k]);
      brut[k] = m;
      mag[k] = Math.log1p(10 * m);
      somme += m; pondere += m * (k * sr / N); logs += Math.log(m + 1e-12);
      if (k <= hautChamp && m > crete) { crete = m; rangCrete = k; }
      const d = mag[k] - precedent[k];
      if (d > 0) df += d;
    }
    const nbins = N / 2 - 1;
    flux[t] = df;
    centre[t] = somme > 0 ? pondere / somme : 0;
    platitude[t] = somme > 0 ? Math.exp(logs / nbins) / (somme / nbins) : 0;
    // LES DEUX AXES DE LA MASSE, relevés sur le spectre déjà calculé : combien du champ est occupé,
    // et où est le gros de l'énergie.
    let pleins = 0;
    const plancher = crete * seuilVide;
    for (let k = 1; k <= hautChamp; k++) if (brut[k] >= plancher) pleins++;
    occupation[t] = crete > 0 ? pleins / hautChamp : 0;
    dominante[t] = crete > 0 ? (rangCrete * sr) / N : 0;
    precedent = mag;
  }
  return { nb, rms, flux, centre, platitude, occupation, dominante };
}

const db = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));

/** Le maximum d'un tableau, par une boucle : `Math.max(...t)` déborde la pile au-delà d'une centaine
 *  de milliers d'éléments, soit une dizaine de minutes de trames. */
function maxDe(t: ArrayLike<number>, de = 0, a = t.length): number {
  let m = -Infinity;
  for (let i = de; i < a; i++) if (t[i] > m) m = t[i];
  return m;
}

/** Les maxima locaux d'une courbe de nouveauté, au-dessus d'un seuil adaptatif (médiane glissante). */
function pics(nouveaute: Float64Array, sensibilite: number, ecartMin: number, demiFenetre = 8): number[] {
  const max = Math.max(maxDe(nouveaute), 1e-12);
  const v = Float64Array.from(nouveaute, (x) => x / max);
  // Sensibilité 100 : un pic de 2 % au-dessus de la médiane suffit ; 0 : il en faut 40 %.
  const delta = 0.02 + (1 - Math.max(0, Math.min(100, sensibilite)) / 100) * 0.38;
  const res: number[] = [];
  for (let t = 1; t < v.length - 1; t++) {
    if (v[t] < v[t - 1] || v[t] < v[t + 1]) continue;
    // La médiane se prend sur un voisinage plus large que le pic lui-même : sinon un pic large — celui
    // d'une nouveauté de timbre, lissée sur 150 ms — relève sa propre médiane et se cache.
    const voisins = Array.from(v.subarray(Math.max(0, t - demiFenetre), Math.min(v.length, t + demiFenetre + 1))).sort((a, b) => a - b);
    const mediane = voisins[voisins.length >> 1];
    if (v[t] < mediane + delta) continue;
    if (res.length && t - res[res.length - 1] < ecartMin) {
      if (v[t] > v[res[res.length - 1]]) res[res.length - 1] = t;
      continue;
    }
    res.push(t);
  }
  return res;
}

/**
 * Place l'attaque précisément dans sa trame : le premier échantillon qui dépasse le dixième de la
 * crête locale, moins deux millisecondes. Sans cela l'objet commencerait jusqu'à 23 ms trop tôt, et
 * garderait la fin du précédent.
 */
function affinerAttaque(x: Float32Array, trame: number, sr: number): number {
  const de = trame * SAUT, a = Math.min(x.length, de + N);
  let crete = 0;
  for (let i = de; i < a; i++) crete = Math.max(crete, Math.abs(x[i]));
  let i = de;
  while (i < a && Math.abs(x[i]) < crete * 0.1) i++;
  return Math.max(0, i - Math.round(0.002 * sr));
}

/** Découpe un son en objets et les décrit. */
export function decouperEnObjets(b: AudioBuffer, o: OptionsDecoupage): ObjetSonore[] {
  const sr = b.sampleRate, x = mixdownMono(b), tr = trames(x, sr);
  const tramesMin = Math.max(1, Math.round((o.dureeMinMs / 1000) * sr / SAUT));
  let bornes: [number, number][] = [];

  if (o.critere === "silences") {
    const actif = Array.from(tr.rms, (r) => db(r) > o.seuilSilenceDb);
    // Un trou de moins de 60 ms n'est pas un silence : c'est une respiration à l'intérieur de l'objet.
    const trou = Math.round(0.06 * sr / SAUT);
    let t = 0;
    while (t < tr.nb) {
      if (!actif[t]) { t++; continue; }
      const de = t;
      let fin = t, calme = 0;
      while (t < tr.nb && calme <= trou) { if (actif[t]) { fin = t; calme = 0; } else calme++; t++; }
      bornes.push([de * SAUT, Math.min(x.length, fin * SAUT + N)]);
    }
  } else {
    let nouveaute: Float64Array;
    let demiFenetre = 8;
    if (o.critere === "attaques") {
      nouveaute = tr.flux;
    } else {
      // LE TIMBRE : la distance entre ce qui précède et ce qui suit, sur trois descripteurs
      // ramenés à la même échelle. Une frontière est un instant où l'avant et l'après diffèrent.
      //
      // ET LA MASSE : la même distance, mais sur ce qui définit la masse au sens du Traité, c'est-à-
      // dire la PART DU CHAMP DES HAUTEURS que le son occupe. Un son passe d'une masse à une autre
      // quand son champ se remplit ou se resserre : une note qui devient un accord, un accord qui
      // devient un bruit.
      //
      // UN SEUL AXE, ET LE PLACEMENT DE LA MASSE N'EN EST PAS. Un second axe a été essayé, la
      // partielle dominante : il est faux pour deux raisons qui se rejoignent. Chez Schaeffer, une
      // note qui en devient une autre garde sa masse, celle d'un son tonique, et ce qui change est
      // son PROFIL MÉLODIQUE, qui est un autre critère. Et à la mesure, la partielle dominante d'un
      // bruit saute d'une trame à l'autre, de sorte que cet axe coupait DANS le bruit : relevé sur un
      // bruit d'une seconde suivi d'une note, il y ajoutait deux frontières à 0,18 et 0,33 s.
      //
      // LE COMPTE DE HAUTEURS SERAIT LE SECOND AXE LÉGITIME, et il n'est pas là faute de résolution :
      // une raie se juge sur le relief de son voisinage, et la trame du découpage donne un pas de
      // 43 Hz à 44,1 kHz, où un voisinage ne fait que deux points. Le nœud « Critères schaefferiens »
      // le relève, lui, sur une transformée dont le pas est tenu à huit hertz.
      // CHAQUE DESCRIPTEUR PORTE SON ÉCART PERCEPTIBLE, et sans lui la normalisation inventait des
      // frontières. Elle divisait par l'écart type du descripteur sur le son entier : sur un son qui
      // NE CHANGE PAS, cet écart type est presque nul, de sorte que la moindre ondulation de mesure
      // ressortait à plusieurs écarts types et faisait une frontière franche. Relevé sur une tenue
      // harmonique de deux secondes, qui ne change pas d'un bout à l'autre : le critère du timbre y
      // trouvait ONZE objets et celui de la masse DOUZE.
      //
      // Le plancher est l'écart qu'on entend sur chaque grandeur : deux centièmes du champ pour une
      // occupation ou une platitude, un demi-ton pour une fréquence, un décibel pour un niveau. La
      // nouveauté se lit alors en « écarts perceptibles », ce qui lui donne une échelle absolue.
      const DEMI_TON = Math.log(Math.pow(2, 1 / 12));
      const f: [Float64Array, number][] = o.critere === "masse"
        ? [[tr.occupation, 0.02]]
        : [
          [Float64Array.from(tr.centre, (c) => Math.log(c + 20)), DEMI_TON],
          [tr.platitude, 0.02],
          [Float64Array.from(tr.rms, db), 1],
        ];
      const z = f.map(([v, plancher]) => {
        const m = v.reduce((s, a) => s + a, 0) / v.length;
        const ecart = Math.sqrt(v.reduce((s, a) => s + (a - m) ** 2, 0) / v.length);
        const e = Math.max(ecart, plancher);
        return Float64Array.from(v, (a) => (a - m) / e);
      });
      const L = Math.max(2, Math.round(0.15 * sr / SAUT));
      nouveaute = new Float64Array(tr.nb);
      for (let t = L; t < tr.nb - L; t++) {
        let d = 0;
        for (const v of z) {
          let av = 0, ap = 0;
          for (let k = 1; k <= L; k++) { av += v[t - k]; ap += v[t + k - 1]; }
          d += ((ap - av) / L) ** 2;
        }
        nouveaute[t] = Math.sqrt(d);
      }
      demiFenetre = 4 * L;
    }
    // ET UNE FRONTIÈRE DOIT PASSER UN PLANCHER ABSOLU, car `pics` ne juge que des RAPPORTS : il
    // ramène la courbe à son propre maximum, de sorte qu'un son sans frontière voit ses plus grosses
    // ondulations de mesure devenir des sommets francs. Le plancher ne vaut que pour les deux
    // critères à nouveauté normalisée, le flux d'une attaque ayant son échelle propre.
    const p = pics(nouveaute, o.sensibilite, tramesMin, demiFenetre)
      .filter((t) => o.critere === "attaques" || nouveaute[t] >= PLANCHER_NOUVEAUTE);
    const debuts = o.critere === "attaques" ? p.map((t) => affinerAttaque(x, t, sr)) : p.map((t) => t * SAUT);
    // Avant la première frontière : un objet à part entière en timbre (le flux commence à zéro) ; en
    // attaques, seulement si quelque chose y sonne — sinon ce serait un objet de silence.
    // Seules les trames qui finissent AVANT la première attaque : les suivantes la contiennent déjà.
    const avant = debuts.length ? Math.max(0, Math.floor((debuts[0] - N) / SAUT)) : tr.nb;
    const maxRms = Math.max(maxDe(tr.rms), 1e-12);
    const sonneAvant = avant > 0 && maxDe(tr.rms, 0, avant) > 0.1 * maxRms;
    if (o.critere !== "attaques" || (debuts[0] ?? 1) > 0.02 * sr && sonneAvant || !debuts.length) debuts.unshift(0);
    for (let k = 0; k < debuts.length; k++) bornes.push([debuts[k], k + 1 < debuts.length ? debuts[k + 1] : x.length]);
  }

  bornes = bornes.filter(([de, a]) => (a - de) / sr * 1000 >= o.dureeMinMs);
  return bornes.map(([de, a]) => decrire(tr, x, sr, de, a));
}

/**
 * Décrit des zones venues d'ailleurs — le Sélecteur multi-zones n'en donne que les bornes. Ainsi une
 * sélection faite à la main se trie comme un découpage automatique.
 */
export function decrireZones(b: AudioBuffer, zones: { debut: number; duree: number }[]): ObjetSonore[] {
  const sr = b.sampleRate, x = mixdownMono(b), tr = trames(x, sr);
  return zones.map((z) => decrire(tr, x, sr, Math.max(0, Math.round(z.debut * sr)), Math.min(b.length, Math.round((z.debut + z.duree) * sr))));
}

function decrire(tr: Trames, x: Float32Array, sr: number, de: number, a: number): ObjetSonore {
  const t0 = Math.floor(de / SAUT), t1 = Math.max(t0 + 1, Math.min(tr.nb, Math.ceil((a - N) / SAUT) + 1));
  let e = 0, somme = 0, c = 0, p = 0;
  for (let t = t0; t < t1; t++) {
    const w = tr.rms[t] ** 2;
    e += w; somme += w; c += w * tr.centre[t]; p += w * tr.platitude[t];
  }
  const n = t1 - t0;
  // Les trois critères se relèvent sur la tranche elle-même, non sur les trames : voir `ObjetSonore`.
  const trois = criteresSchaefferiens(x.subarray(Math.max(0, de), Math.min(x.length, a)), sr);
  return {
    debut: de / sr, duree: (a - de) / sr,
    sonie: db(Math.sqrt(e / n)),
    brillance: somme > 0 ? c / somme : 0,
    bruit: somme > 0 ? p / somme : 0,
    masse: trois.masse.espece,
    degreMasse: degreDeMasse(trois.masse.espece),
    forme: trois.dynamique.forme,
    attaqueMs: trois.dynamique.attaqueMs,
    allure: trois.allure.espece,
    irregularite: trois.allure.espece === "aucune" ? null : trois.allure.irregularite,
  };
}

// ── Réordonner ───────────────────────────────────────────────────────────────────────────────

export type CritereTri =
  | "origine" | "sonie" | "brillance" | "bruit" | "duree" | "hasard"
  | "masse" | "attaque" | "allure";

/**
 * Enchaîne les objets dans l'ordre d'un descripteur : du plus sombre au plus brillant, du plus
 * calme au plus fort, du plus tonique au plus bruité. C'est ranger un matériau par ce qu'on en
 * entend — un geste de composition à part entière, et la navigation de CataRT réduite à un axe.
 *
 * Chaque objet reçoit un fondu d'entrée et de sortie, pour qu'aucune coupe ne claque, et les objets
 * sont séparés par un espace qui peut être négatif : ils se chevauchent alors.
 */
export function reordonnerObjets(
  b: AudioBuffer, objets: {
    debut: number; duree: number; sonie?: number; brillance?: number; bruit?: number;
    degreMasse?: number; attaqueMs?: number; irregularite?: number | null;
  }[],
  o: { critere: CritereTri; decroissant: boolean; espaceMs: number; fonduMs: number; hasard?: () => number },
): AudioBuffer {
  const sr = b.sampleRate;
  const liste = objets.map((z, i) => ({ ...z, i }));
  if (o.critere === "hasard") {
    const h = o.hasard ?? Math.random;
    for (let k = liste.length - 1; k > 0; k--) { const j = Math.floor(h() * (k + 1)); [liste[k], liste[j]] = [liste[j], liste[k]]; }
  } else if (o.critere !== "origine") {
    // LES TROIS CRITÈRES DU TRAITÉ DEMANDENT CHACUN UN SCALAIRE, et c'est une décision à dire : une
    // espèce ne se trie pas, il faut la grandeur qui l'ordonne.
    //
    //   · la MASSE a son échelle, celle du Traité, du son pur au bruit blanc : son degré ordonne ;
    //   · la DYNAMIQUE n'a pas d'ordre, « crescendo » ne venant ni avant ni après « impulsion » : la
    //     grandeur qui l'ordonne est l'ATTAQUE, du plus mordant au plus progressif ;
    //   · l'ALLURE a son échelle, de la machine au désordre : son irrégularité ordonne, et un objet
    //     qui n'en porte pas se range d'un seul côté plutôt qu'au milieu.
    const cle = (z: typeof liste[number]): number => {
      switch (o.critere) {
        case "duree": return z.duree;
        case "masse": return z.degreMasse ?? Infinity;
        case "attaque": return z.attaqueMs ?? Infinity;
        case "allure": return z.irregularite ?? Infinity;
        default: return (z[o.critere as "sonie" | "brillance" | "bruit"] ?? 0);
      }
    };
    liste.sort((u, v) => cle(u) - cle(v) || u.i - v.i);
  }
  if (o.decroissant && o.critere !== "hasard") liste.reverse();

  const fondu = Math.max(0, Math.round((o.fonduMs / 1000) * sr));
  const espace = Math.round((o.espaceMs / 1000) * sr);
  const morceaux = liste.map((z) => {
    const de = Math.max(0, Math.round(z.debut * sr)), a = Math.min(b.length, Math.round((z.debut + z.duree) * sr));
    return { de, n: Math.max(0, a - de) };
  });
  let longueur = 0, curseur = 0;
  for (const m of morceaux) { longueur = Math.max(longueur, curseur + m.n); curseur = Math.max(0, curseur + m.n + espace); }
  const sortie = new AudioBuffer({ numberOfChannels: b.numberOfChannels, length: Math.max(1, longueur), sampleRate: sr });
  for (let c = 0; c < b.numberOfChannels; c++) {
    const x = b.getChannelData(c), y = sortie.getChannelData(c);
    curseur = 0;
    for (const m of morceaux) {
      const f = Math.min(fondu, m.n >> 1);
      for (let i = 0; i < m.n; i++) {
        const g = f > 0 ? Math.min(1, i / f, (m.n - 1 - i) / f) : 1;
        y[curseur + i] += x[m.de + i] * g;
      }
      curseur = Math.max(0, curseur + m.n + espace);
    }
  }
  return sortie;
}

// ── Montage ──────────────────────────────────────────────────────────────────────────────────

export interface Plan {
  son: AudioBuffer;
  debut: number;
  gainDb: number;
  /** Fondu d'entrée et de sortie, en millisecondes, propres à ce son. */
  fonduEntreeMs: number;
  fonduSortieMs: number;
  /**
   * Où ce plan commence DANS le son, en secondes. Absent ou nul : à son début.
   *
   * C'est ce qui permet de ne poser qu'une PARTIE d'un son, donc de couper un morceau en deux sans
   * que la coupe s'entende : le second reprend là où le premier s'arrête. Absent, le plan pose le
   * son entier, et tout appelant écrit avant cette notion garde exactement son comportement.
   */
  dans?: number;
  /** Ce qu'on en joue, en secondes. Absent ou nul : jusqu'à la fin du son. */
  duree?: number;
}

/** La fenêtre qu'un plan prend dans son son : d'où elle part, combien d'échantillons elle porte. */
function fenetreDuPlan(p: Plan, sr: number): { depart: number; n: number } {
  const depart = Math.max(0, Math.min(p.son.length, Math.round((p.dans ?? 0) * sr)));
  const reste = p.son.length - depart;
  const n = p.duree && p.duree > 0 ? Math.min(Math.round(p.duree * sr), reste) : reste;
  return { depart, n: Math.max(0, n) };
}

/**
 * Le gain d'un fondu à la position `x` de sa course (0 → 1) : un quart de sinus, à puissance
 * constante. Deux sons qui se croisent — l'un sortant, l'autre entrant sur la même durée — gardent
 * ainsi leur somme d'énergie, là où deux rampes droites creuseraient le milieu de 3 dB.
 */
export function gainDeFondu(x: number): number {
  return Math.sin((Math.PI / 2) * Math.max(0, Math.min(1, x)));
}

/**
 * Pose des sons sur une ligne de temps, chacun à son instant, à son niveau, avec ses fondus, et les
 * additionne.
 *
 * La sortie commence à zéro et dure jusqu'à la fin du dernier son ; un début négatif rogne le son
 * d'autant, et le fondu d'entrée s'applique alors à ce qui reste. Si les deux fondus d'un son sont
 * plus longs que lui, ils sont réduits dans la même proportion. Les fréquences d'échantillonnage
 * différentes sont ramenées à la première, faute de quoi un son serait posé trop tôt ou trop tard.
 */
export async function monter(plans: Plan[]): Promise<AudioBuffer> {
  if (!plans.length) throw new Error("aucun son à monter");
  const sr = plans[0].son.sampleRate;
  const canaux = Math.max(...plans.map((p) => p.son.numberOfChannels));
  const prets = await Promise.all(plans.map(async (p) => {
    if (p.son.sampleRate === sr) return p;
    return { ...p, son: await reechantillonnerParLeNavigateur(p.son, sr) };
  }));
  const longueur = Math.max(1, maxDe(prets.map((p) => Math.round(p.debut * sr) + fenetreDuPlan(p, sr).n)));
  const sortie = new AudioBuffer({ numberOfChannels: canaux, length: longueur, sampleRate: sr });
  for (const p of prets) {
    const decalage = Math.round(p.debut * sr), gain = Math.pow(10, p.gainDb / 20);
    // LA FENÊTRE DU PLAN, ET NON LE SON ENTIER : un plan peut n'en poser qu'une partie, ce qui est
    // ce qui rend une coupe possible. Sans `dans` ni `duree`, elle couvre le son d'un bout à l'autre.
    const { depart, n } = fenetreDuPlan(p, sr);
    // Ce qui sonne vraiment : un début négatif ôte le commencement de la fenêtre.
    const premier = Math.max(0, -decalage), utile = n - premier;
    if (utile <= 0) continue;
    let fe = Math.max(0, Math.round((p.fonduEntreeMs / 1000) * sr));
    let fs = Math.max(0, Math.round((p.fonduSortieMs / 1000) * sr));
    if (fe + fs > utile) { const k = utile / (fe + fs); fe = Math.floor(fe * k); fs = Math.floor(fs * k); }
    for (let c = 0; c < canaux; c++) {
      // Un son mono va dans tous les canaux ; un son à plusieurs canaux, dans les siens.
      if (p.son.numberOfChannels > 1 && c >= p.son.numberOfChannels) continue;
      const x = p.son.getChannelData(p.son.numberOfChannels === 1 ? 0 : c);
      const y = sortie.getChannelData(c);
      for (let i = premier; i < n; i++) {
        const j = i - premier;
        let g = gain;
        if (j < fe) g *= gainDeFondu(j / fe);
        if (n - 1 - i < fs) g *= gainDeFondu((n - 1 - i) / fs);
        y[decalage + i] += x[depart + i] * g;
      }
    }
  }
  return sortie;
}
