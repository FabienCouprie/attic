// audio/suites-entieres.ts — Écouter une suite d'entiers, et mesurer ce qu'on entend.
//
// LA CONVENTION SUIVIE EST CELLE DU LECTEUR DE L'OEIS, l'Encyclopédie en ligne des suites
// d'entiers, dont la page « Listen to a sequence » publie les réglages : un MODULO et un DÉCALAGE
// de hauteur, le premier de 1 à 128 et le second de 0 à 128 avec une somme sous 129 ; un modulo et
// un décalage de DURÉE, de 1 à 5 et de 0 à 5 avec une somme sous 6 ; un tempo en noires par
// minute ; et une coupure du nombre de termes.
//
// CE QUE LA PAGE NE DIT PAS, et il faut le dire ici : la formule qui mène d'un terme à une hauteur
// n'y figure pas. La lecture retenue est la seule qui respecte les deux bornes publiées, soit
// `décalage + (terme modulo modulo)`, et la même pour la durée. Un décalage de 21 avec un modulo de
// 88 couvre exactement les quatre-vingt-huit touches d'un piano, des notes MIDI 21 à 108.
//
// LES TERMES SE CALCULENT EN ENTIERS EXACTS, et ce n'est pas une précaution de confort. Relevé :
// **Fibonacci sort de la précision exacte du double au rang 79**, F(79) valant 14 472 334 024 676 221
// contre 2⁵³ égal à 9 007 199 254 740 992, là où F(78) passe encore. Au-delà, le modulo porterait
// sur un nombre FAUX, et rien ne le dirait. Les suites qui croissent sont donc calculées en `bigint`,
// et c'est le modulo qui les ramène dans une étendue tenable.
//
// CHAQUE SUITE PORTE SON INVARIANT, ET C'EST CE QUI REND CE NŒUD MESURABLE. « Ça sonne
// mathématique » ne prouverait rien ; qu'une propriété PUBLIÉE de la suite se retrouve dans les
// notes rendues, si. La période de Pisano pour Fibonacci, le nombre de pas pour Syracuse, la
// non-périodicité pour les décimales de pi. Le rapport rend donc, pour toute suite, LA PÉRIODE
// TROUVÉE dans la suite des notes : c'est une seule mesure, et elle porte l'invariant de chacune.
//
// LE MODULO DE UN EST UN CAS DÉGÉNÉRÉ, et il a fait boucler à l'infini le script de mesure qui a
// servi à ce relevé : modulo un, tout vaut zéro, de sorte que le couple de départ cherché comme
// retour ne revient jamais. `periodeDePisano` le rend donc à un, par convention et sans boucler.

import type { Note } from "./note";

/** Les suites de la table, par leur identifiant. */
export const SUITES = [
  "fibonacci", "pi", "syracuse", "premiers", "thue-morse", "recaman", "norgard",
] as const;
export type Suite = (typeof SUITES)[number];
export const EST_SUITE = (x: string): x is Suite => (SUITES as readonly string[]).includes(x);

/** La référence de chaque suite dans l'Encyclopédie, pour que la notice puisse la citer. */
export const OEIS: Record<Suite, string> = {
  fibonacci: "A000045",
  pi: "A000796",
  syracuse: "A070165",
  premiers: "A000040",
  "thue-morse": "A010060",
  recaman: "A005132",
  norgard: "A004718",
};

/**
 * La période de Pisano : celle de Fibonacci réduit modulo m.
 *
 * C'EST L'INVARIANT DE FIBONACCI, et il est publié : la suite des 1 à 16 premiers vaut 1, 3, 8, 6,
 * 20, 24, 16, 12, 24, 60, 10, 24, 28, 48, 40, 24, et Lagrange avait noté en 1774 que le dernier
 * chiffre se répète toutes les soixante fois, c'est-à-dire que la période de dix vaut 60.
 */
export function periodeDePisano(m: number): number {
  const mod = Math.max(1, Math.round(m));
  if (mod === 1) return 1;
  let x = 0;
  let y = 1;
  let n = 0;
  // La période ne dépasse jamais six fois le modulo, ce qui borne la recherche sans l'affaiblir.
  const garde = 6 * mod + 10;
  while (n < garde) {
    const s = (x + y) % mod;
    x = y;
    y = s;
    n++;
    if (x === 0 && y === 1) return n;
  }
  return 0;
}

/** Les `n` premiers termes de Fibonacci, en entiers exacts. */
export function fibonacci(n: number): bigint[] {
  const out: bigint[] = [];
  let a = 0n;
  let b = 1n;
  for (let i = 0; i < n; i++) {
    out.push(a);
    const s = a + b;
    a = b;
    b = s;
  }
  return out;
}

/**
 * Les `n` premières décimales de pi, par la formule de Machin en entiers mis à l'échelle.
 *
 * POURQUOI UN CALCUL ET NON UNE EXPANSION RANGÉE. Il n'existe pas de formule du type
 * Bailey-Borwein-Plouffe en base dix : celle de 1995 donne les chiffres HEXADÉCIMAUX à une position
 * arbitraire, non les décimaux. Il faut donc calculer les décimales depuis le début, et autant le
 * faire exactement. Machin, 1706 : pi vaut seize fois l'arc tangente d'un cinquième moins quatre
 * fois celle d'un deux cent trente-neuvième.
 */
export function decimalesDePi(n: number): bigint[] {
  const chiffres = Math.max(1, Math.min(4000, Math.round(n)));
  // Dix chiffres de garde : les dernières décimales d'un calcul tronqué ne sont pas sûres.
  const echelle = 10n ** BigInt(chiffres + 10);
  const arctan = (inverse: bigint): bigint => {
    let terme = echelle / inverse;
    let somme = terme;
    const carre = inverse * inverse;
    let k = 1n;
    while (terme !== 0n) {
      terme = terme / carre;
      somme += (k % 2n === 1n ? -terme : terme) / (2n * k + 1n);
      k++;
    }
    return somme;
  };
  const pi = 16n * arctan(5n) - 4n * arctan(239n);
  const texte = pi.toString();
  return Array.from({ length: chiffres }, (_, i) => BigInt(texte[i] ?? "0"));
}

/**
 * La trajectoire de Syracuse depuis `depart`, jusqu'à un inclus.
 *
 * ELLE S'ARRÊTE D'ELLE-MÊME, et c'est ce qui la distingue des autres : son nombre de termes n'est
 * pas un réglage mais un résultat. Depuis 27, elle prend 111 pas et culmine à 9232 ; les deux
 * chiffres sont publiés et ils diffèrent énormément, le pic n'étant pas le nombre de pas.
 */
export function syracuse(depart: number, maximum: number): bigint[] {
  let v = BigInt(Math.max(1, Math.round(depart)));
  const out: bigint[] = [v];
  let garde = 0;
  while (v !== 1n && garde++ < maximum) {
    v = v % 2n === 0n ? v / 2n : 3n * v + 1n;
    out.push(v);
  }
  return out;
}

/** Les `n` premiers nombres premiers, par un crible d'Ératosthène élargi au besoin. */
export function premiers(n: number): bigint[] {
  const combien = Math.max(1, Math.round(n));
  // Le n-ième premier est sous n·(ln n + ln ln n) pour n au moins six ; la borne est élargie pour
  // les petits n, où cette estimation ne vaut pas.
  const borne = combien < 6 ? 15 : Math.ceil(combien * (Math.log(combien) + Math.log(Math.log(combien)))) + 10;
  const crible = new Uint8Array(borne + 1);
  const out: bigint[] = [];
  for (let p = 2; p <= borne && out.length < combien; p++) {
    if (crible[p]) continue;
    out.push(BigInt(p));
    for (let q = p * p; q <= borne; q += p) crible[q] = 1;
  }
  return out;
}

/**
 * La suite de Thue-Morse : la parité du nombre de bits à un de l'indice.
 *
 * SON INVARIANT EST L'AUTOSIMILARITÉ PAR DOUBLEMENT : le terme de rang deux n vaut celui de rang n,
 * et celui de rang deux n plus un vaut son complément. Elle est en outre sans cube, c'est-à-dire
 * qu'aucun bloc n'y apparaît trois fois de suite.
 */
export function thueMorse(n: number): bigint[] {
  return Array.from({ length: Math.max(1, Math.round(n)) }, (_, i) => {
    let bits = 0;
    for (let v = i; v > 0; v >>= 1) bits ^= v & 1;
    return BigInt(bits);
  });
}

/**
 * La suite de Recamán : on recule de n si l'on peut, sinon on avance.
 *
 * « Si l'on peut » veut dire : rester positif et ne pas retomber sur un terme déjà vu. C'est la
 * suite que l'OEIS met en avant pour sa propre sonification.
 */
export function recaman(n: number): bigint[] {
  const combien = Math.max(1, Math.round(n));
  const out: number[] = [0];
  const vus = new Set<number>([0]);
  for (let k = 1; k < combien; k++) {
    const arriere = out[k - 1] - k;
    const suivant = arriere > 0 && !vus.has(arriere) ? arriere : out[k - 1] + k;
    out.push(suivant);
    vus.add(suivant);
  }
  return out.map((v) => BigInt(v));
}

/**
 * La suite de l'infini de Per Nørgård, reprise du module qui la porte déjà.
 *
 * ELLE SERT DE TÉMOIN CROISÉ : le dépôt la calcule déjà pour un autre composant, et les deux
 * doivent s'accorder terme pour terme. Une table de suites qui se tromperait sur celle-là se
 * tromperait sans doute sur les autres, et c'est le seul cas où la comparaison est possible.
 */
export function suiteDeNorgard(n: number, terme: (k: number) => number): bigint[] {
  return Array.from({ length: Math.max(1, Math.round(n)) }, (_, i) => BigInt(terme(i)));
}

export interface OptionsNotes {
  /** Modulo de hauteur, de 1 à 128. */
  moduloHauteur: number;
  /** Décalage de hauteur, de 0 à 128. La somme avec le modulo reste sous 129. */
  decalageHauteur: number;
  /** Modulo de durée, de 1 à 5. */
  moduloDuree: number;
  /** Décalage de durée, de 0 à 5. */
  decalageDuree: number;
  /** Durée d'une noire, en secondes. */
  noireSec: number;
}

export interface RapportSuite {
  termes: number;
  /** Le plus petit et le plus grand terme rendus, en texte : ils peuvent dépasser le double. */
  minimum: string;
  maximum: string;
  /**
   * La période trouvée dans la suite des NOTES, ou zéro si aucune.
   *
   * C'EST LA MESURE QUI PORTE L'INVARIANT DE CHAQUE SUITE, et c'est pourquoi elle est générique
   * plutôt que propre à l'une d'elles. Pour Fibonacci réduit modulo m, elle vaut la période de
   * Pisano de m. Pour les décimales d'un rationnel, la période de son développement. Pour celles de
   * pi, aucune n'est trouvée, et c'est ce qu'on attend d'une suite conjecturée normale.
   */
  periode: number;
  /** Hauteurs distinctes employées. */
  hauteurs: number;
}

/**
 * La période de la suite des notes, cherchée du plus court au plus long.
 *
 * ELLE N'EST DÉCLARÉE QUE SI ELLE TIENT DEUX FOIS, et c'est la condition qui empêche une
 * coïncidence de passer pour une loi : une période de p n'est rendue que si la suite se répète sur
 * au moins deux longueurs entières, soit 2p termes observés.
 */
export function periodeDesNotes(notes: readonly number[]): number {
  for (let p = 1; p * 2 <= notes.length; p++) {
    let tient = true;
    for (let i = p; i < notes.length; i++) {
      if (notes[i] !== notes[i - p]) { tient = false; break; }
    }
    if (tient) return p;
  }
  return 0;
}

/** Les notes d'une suite, selon la convention de l'OEIS. */
export function notesDeSuite(
  termes: readonly bigint[], o: OptionsNotes,
): { notes: Note[]; rapport: RapportSuite } {
  const modH = BigInt(Math.max(1, Math.min(128, Math.round(o.moduloHauteur))));
  const decH = Math.max(0, Math.min(128, Math.round(o.decalageHauteur)));
  const modD = Math.max(1, Math.min(5, Math.round(o.moduloDuree)));
  const decD = Math.max(0, Math.min(5, Math.round(o.decalageDuree)));
  const noire = Math.max(0.01, o.noireSec);

  const notes: Note[] = [];
  const hauteurs: number[] = [];
  let t = 0;
  for (const terme of termes) {
    // LE MODULO D'UN NÉGATIF EST RAMENÉ DANS LA COURSE : en JavaScript comme en C, le reste garde
    // le signe du dividende, ce qui donnerait une note hors clavier sur une suite qui descend.
    const h = Number(((terme % modH) + modH) % modH) + decH;
    const crans = modD === 1 ? decD + 1 : (Number(((terme % BigInt(modD)) + BigInt(modD)) % BigInt(modD)) + decD + 1);
    const duree = crans * noire;
    notes.push({ note: h, velocite: 96, debut: t, fin: t + duree });
    hauteurs.push(h);
    t += duree;
  }

  const enTexte = termes.length ? termes.map((v) => v) : [0n];
  let mini = enTexte[0];
  let maxi = enTexte[0];
  for (const v of enTexte) {
    if (v < mini) mini = v;
    if (v > maxi) maxi = v;
  }

  return {
    notes,
    rapport: {
      termes: termes.length,
      minimum: mini.toString(),
      maximum: maxi.toString(),
      periode: periodeDesNotes(hauteurs),
      hauteurs: new Set(hauteurs).size,
    },
  };
}
