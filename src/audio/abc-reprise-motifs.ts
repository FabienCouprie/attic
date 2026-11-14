// audio/abc-reprise-motifs.ts — Les motifs d'accompagnement de « Reprise ABC », un par patron rythmique.
//
// LES STYLES SONT LES PATRONS RYTHMIQUES DU DÉPÔT, et c'est la décision de Fabien du 2026-11-14 :
// « Reprise ABC » offrait six styles écrits à la main, dont aucun ne portait l'orthographe d'une
// table commune (« Bossa nova » contre « Bossa Nova », « Marche » contre « Marche militaire »), et
// qui mêlaient deux textures à quatre genres. Les clés de cette table sont donc celles de
// `PATRONS_RYTHME`, plus une seule valeur qui n'est pas un patron : `accords-tenus`, aucun rythme.
//
// LES SIX MOTIFS D'AVANT SONT RECOPIÉS TELS QUELS, sous le patron qui portait leur idée : un projet
// enregistré avec « valse » ou « pop » doit rendre le même fichier MIDI, octet pour octet, et
// `abc-reprise-motifs.test.ts` le vérifie contre l'empreinte relevée avant le changement. Ils
// gardent aussi leur portée de métrique, qui est plus large que celle des grilles : « Rock » et
// « Pop ballade » s'appliquent à toute mesure, 6/8 compris.
//
// LES CINQUANTE AUTRES SONT DES GRILLES de doubles croches, sur une mesure de quatre noires en
// temps simple (4/4, 2/2), et de trois pour « Bolero » (3/4). Une ligne de basse, une ligne
// d'accompagnement ; une lettre attaque, un tiret tient, un point se tait :
//   basse : R fondamentale, Q quinte, T tierce, O octave de la fondamentale ;
//   accompagnement : A l'accord serré, a le ton suivant de l'arpège.
// Une grille ne joue que la carrure pour laquelle elle est écrite ; ailleurs le style est refusé, et
// le message de « Reprise ABC » le dit, plutôt que de plaquer seize pas sur une mesure de six croches.

import type { MorceauAbc } from "./abc";
import { PATRONS_RYTHME } from "./generation-patrons";

export type Role = "accord" | "arpege" | "basse" | "quinte" | "tierce" | "octave";

/** Une frappe du motif : décalage et durée en noires dans la mesure, et ce qu'elle joue. */
export type Frappe = { decalage: number; duree: number; role: Role };

export type Carrure = {
  /** Longueur de la mesure, en noires. */
  mesure: number;
  /** Nombre de temps. */
  temps: number;
  /** Longueur d'un temps, en noires. */
  temps1: number;
  /** Subdivision du temps : croche, en noires. */
  sub: number;
};

export function carrure(m: MorceauAbc): Carrure {
  const num = m.metrique?.numerateur ?? 4, den = m.metrique?.denominateur ?? 4;
  const compose = den === 8 && num % 3 === 0 && num > 3;
  return compose
    ? { mesure: (4 * num) / den, temps: num / 3, temps1: 1.5, sub: 0.5 }
    : { mesure: (4 * num) / den, temps: num, temps1: 4 / den, sub: 4 / den / 2 };
}

/** Le seul style qui n'est pas un patron rythmique : l'accord et la basse tenus, sans rythme. */
export const ACCORDS_TENUS = "accords-tenus";

type Motif = (c: Carrure) => Frappe[] | null;

/**
 * Les six motifs d'avant, recopiés sans changer une ligne de calcul. Leur ordre de frappes est
 * gardé aussi, bien qu'il ne compte pas : l'écriture du MIDI trie les évènements, et intervertir
 * l'accord et la basse de « Rock » rend le même fichier, essayé le 2026-11-14.
 */
const ANCIENS: Record<string, Motif> = {
  [ACCORDS_TENUS]: (c) => [{ decalage: 0, duree: c.mesure, role: "accord" }, { decalage: 0, duree: c.mesure, role: "basse" }],
  // Arpège sur chaque subdivision, basse tenue toute la mesure.
  "Pop ballade": (c) => {
    const frappes: Frappe[] = [{ decalage: 0, duree: c.mesure, role: "basse" }];
    for (let t = 0; t < c.mesure - 1e-9; t += c.sub) frappes.push({ decalage: t, duree: c.sub, role: "arpege" });
    return frappes;
  },
  // Accord sur chaque temps, basse en croches sur la fondamentale.
  Rock: (c) => {
    const frappes: Frappe[] = [];
    for (let k = 0; k < c.temps; k++) frappes.push({ decalage: k * c.temps1, duree: c.temps1, role: "accord" });
    for (let t = 0; t < c.mesure - 1e-9; t += c.sub) frappes.push({ decalage: t, duree: c.sub, role: "basse" });
    return frappes;
  },
  // Basse au premier temps, accord sur les suivants.
  Valse: (c) => {
    if (c.temps < 2) return null;
    const frappes: Frappe[] = [{ decalage: 0, duree: c.temps1, role: "basse" }];
    for (let k = 1; k < c.temps; k++) frappes.push({ decalage: k * c.temps1, duree: c.temps1, role: "accord" });
    return frappes;
  },
  // Basse sur les temps impairs, fondamentale puis quinte ; accord sur les pairs.
  "Marche militaire": (c) => {
    if (c.temps % 2 !== 0) return null;
    const frappes: Frappe[] = [];
    for (let k = 0; k < c.temps; k++) {
      frappes.push({ decalage: k * c.temps1, duree: c.temps1, role: k % 2 === 0 ? (k % 4 === 0 ? "basse" : "quinte") : "accord" });
    }
    return frappes;
  },
  // Le motif de base à quatre temps : basse fondamentale (noire pointée), quinte (croche), et de
  // même sur la seconde moitié ; accords syncopés.
  "Bossa Nova": (c) => {
    if (c.temps1 !== 1 || c.temps !== 4) return null;
    return [
      { decalage: 0, duree: 1.5, role: "basse" }, { decalage: 1.5, duree: 0.5, role: "quinte" },
      { decalage: 2, duree: 1.5, role: "basse" }, { decalage: 3.5, duree: 0.5, role: "quinte" },
      { decalage: 0, duree: 1, role: "accord" }, { decalage: 1.5, duree: 1, role: "accord" }, { decalage: 3, duree: 0.5, role: "accord" },
    ];
  },
};

/** Les grilles d'une mesure de quatre noires, seize doubles croches : [basse, accompagnement]. */
export const GRILLES_QUATRE: Record<string, readonly [string, string]> = {
  "Four-on-the-floor": ["R---R---R---R---", "..A-..A-..A-..A-"], // basse sur chaque temps, accords à contretemps
  Funk: ["R-.R..R-..R.Q-O.", "....A.A.....A.A."], // basse syncopée en doubles croches, coups secs
  "Hip-hop": ["R-----R---R-----", "A-------A-------"], // basse sur la grosse caisse, accords en blanches
  Jazz: ["R---T---Q---T---", "A-....A-........"], // basse marchante sur les tons de l'accord, accords en charleston
  Reggae: ["R-----..R-Q-....", "....A-......A-.."], // basse posée, accords sur les temps 2 et 4
  Samba: ["R--QQ---R--QQ---", "A..A..A...A..A.."], // fondamentale pointée, quinte appuyée ; accords en partido alto
  House: ["..R-..R-..R-..R-", "A..A..A.A..A..A."], // basse à contretemps, accords en trois, trois, deux
  Techno: [".RRR.RRR.RRR.RRR", "......A.......A."], // basse roulante entre les temps, accord bref
  "Drum & Bass": ["R-------..R-----", "..A.......A....."], // basse longue à demi-tempo
  Trap: ["R-------..R---R-", "a---a---a---a---"], // basse tenue, arpège en noires
  Disco: ["R-O-R-O-R-O-R-O-", "..A-..A-..A-..A-"], // octaves en croches, accords à contretemps
  Ska: ["R---Q---O---Q---", "..A...A...A...A."], // basse en noires, accord bref sur chaque contretemps
  Tango: ["R-----Q-----R---", "A-..A-..A-..A-.."], // basse en trois, trois, deux ; accords marqués sur les quatre temps
  Calypso: ["R--.Q-..R--.Q-..", "..A..A-...A..A-."],
  "Pop dance": ["R-R-..R-R-R-..R-", "A--.A--.A--.A--."],
  "Pop latino": ["R--Q..R-R--Q..R-", "A-.A.A..A-.A.A.."],
  "Pop folk": ["R-------Q-------", "A-A-.AA-A-A-.AA-"], // fondamentale et quinte en blanches, accords grattés
  "Pop R&B": ["R--.....R-.R----", "A-------..A-----"],
  "Pop punk": ["R-R-R-R-R-R-R-R-", "A-A-A-A-A-A-A-A-"],
  Afrobeat: ["R-..R-.R..R-.Q-.", "..A..A..A..A..A."],
  Rumba: ["R--Q..Q-R--Q..Q-", "A..A...A..A.A..."], // accords sur la clave de rumba
  Flamenco: ["R-..Q-..R-..Q-..", "A.AAA.A.A.AAA.A."], // accords en rasgueado
  Merengue: ["R---..R-Q---..Q-", "A.A.A.A.A.A.A.A."],
  Breakbeat: ["R-.R----..R-.R--", "....A-......A-.."],
  Electro: ["R.R...R.R.R...R.", "..A.......A...A."],
  "Detroit techno": ["R..R..R.R..R..R.", "......A-......A-"],
  Minimal: ["..R...R...R...R.", "A..............."],
  Dubstep: ["R-------R---R-R-", "........A-------"], // demi-tempo : l'accord sur le troisième temps
  Moombahton: ["R--R..R.R--R..R.", "...A..A....A..A."],
  Dembow: ["R--.R-..R--.R-..", "...A...A...A...A"],
  Reggaeton: ["R--QR---R--QR---", "...A..A....A..A."],
  Cumbia: ["R---..Q-R---..Q-", "..A-..A-..A-..A-"],
  Bachata: ["R-..Q-..R-.QR-..", "a.a.a.a.a.a.a.a."], // arpège en croches détachées
  "Blues shuffle": ["R-T-Q-O-Q-T-R-T-", "..A-..A-....A-.."], // basse de boogie montante et descendante
  Gospel: ["R-----R-Q-----T-", "A---A---A-.AA---"],
  Metal: ["RRRRRRRRRRRRRRRR", "A---A---A---A---"], // basse en doubles croches
  Punk: ["R-R-R-R-R-R-R-R-", "A.A.A.A.A.A.A.A."], // croches détachées
  Grunge: ["R-------R---Q---", "A-----A-----A---"],
  Trance: ["..RR..RR..RR..RR", "aaaaaaaaaaaaaaaa"], // basse entre les temps, arpège en doubles croches
  Hardstyle: ["..R-..R-..R-..R-", "A-------A-------"],
  "Lo-fi hip hop": ["R-------....R---", "A-----------A---"],
  "Boom bap": ["R-.R....R-..R...", "A---....A---...."],
  Drill: ["R-----R-------R-", "...a..a....a..a."],
  "Trip hop": ["R-------R-------", ".....A-.......A-"],
  Amapiano: ["R-----R---R---..", "..A..A....A..A.."],
  Salsa: ["......Q-....R---", "A..A..A...A.A..."], // basse anticipée du tumbao ; accords sur la clave de son
  Highlife: ["R-..R-.QR-..R-.Q", "..A..A.A..A..A.A"],
  "Baile funk": ["R--R--R-R--R--R-", ".......A.......A"],
  "Tech house": ["..R...R...R...RR", "A.......A.A....."],
};

/** Les grilles d'une mesure de trois noires, douze doubles croches. */
export const GRILLES_TROIS: Record<string, readonly [string, string]> = {
  Bolero: ["R---Q-------", "A-AAA-A-A-A-"], // basse sur les deux premiers temps, figure du boléro aux accords
};

const ROLES_BASSE: Record<string, Role> = { R: "basse", Q: "quinte", T: "tierce", O: "octave" };
const ROLES_ACCOMPAGNEMENT: Record<string, Role> = { A: "accord", a: "arpege" };

/** Les frappes d'une grille sur une mesure de `mesure` noires. */
export function lireGrille([basse, accompagnement]: readonly [string, string], mesure: number): Frappe[] {
  const frappes: Frappe[] = [];
  for (const [ligne, roles] of [[basse, ROLES_BASSE], [accompagnement, ROLES_ACCOMPAGNEMENT]] as const) {
    const pas = mesure / ligne.length;
    for (let i = 0; i < ligne.length; i++) {
      const role = roles[ligne[i]];
      if (!role) continue;
      let n = 1;
      while (ligne[i + n] === "-") n++;
      frappes.push({ decalage: i * pas, duree: n * pas, role });
    }
  }
  return frappes;
}

/** Une mesure de quatre noires en temps simple : 4/4 ou 2/2. */
const quatreNoires = (c: Carrure) => Math.abs(c.mesure - 4) < 1e-9 && c.temps1 !== 1.5;
/** Une mesure de trois noires battue à la noire : 3/4. */
const troisNoires = (c: Carrure) => Math.abs(c.mesure - 3) < 1e-9 && c.temps1 === 1;

const MOTIFS: Record<string, Motif> = {
  ...ANCIENS,
  ...Object.fromEntries(Object.entries(GRILLES_QUATRE).map(([id, g]) => [id, (c: Carrure) => (quatreNoires(c) ? lireGrille(g, 4) : null)])),
  ...Object.fromEntries(Object.entries(GRILLES_TROIS).map(([id, g]) => [id, (c: Carrure) => (troisNoires(c) ? lireGrille(g, 3) : null)])),
};

/** Les identifiants offerts : « Accords tenus », puis chaque patron rythmique. */
export const STYLES: readonly string[] = [ACCORDS_TENUS, ...Object.keys(PATRONS_RYTHME)];

export const estStyle = (id: string): boolean => MOTIFS[id] !== undefined;

/**
 * Le motif d'une mesure pour un style et une carrure. null si le style ne sait pas s'y appliquer :
 * la bossa nova n'existe pas en 3/4, et « Reprise ABC » le dit plutôt que de plaquer un motif à
 * quatre temps sur trois.
 */
export function motif(style: string, c: Carrure): Frappe[] | null {
  return MOTIFS[style]?.(c) ?? null;
}
