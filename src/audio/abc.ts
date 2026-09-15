// audio/abc.ts — Lecture de la notation ABC et conversion en MIDI.
//
// L'ABC est une notation musicale en texte, standardisée (ABC 2.1), dans
// laquelle circulent des milliers d'airs traditionnels, que les modèles de
// langage connaissent, et que YuE2 emploie pour ses partitions. Contrairement
// au format de « Texte → MIDI », elle porte la métrique, la tonalité, les
// mesures, les reprises, les accords chiffrés et plusieurs voix.
//
// CE QUI EST LU. En-tête : X: T: M: L: Q: K: V:. Corps : notes, altérations
// (^ _ = et leurs doubles), octaves (' ,), durées (2, /2, /, 3/2…), silences
// (z x Z X), accords [CEG], liaisons de prolongation (-), rythmes pointés (> <),
// n-olets ((3 et (p:q:r), barres, reprises (|: :| ::) et fins alternatives
// ([1 [2 |1 :|2), accords chiffrés ("Am"), nuances (!p! !f!…), champs en ligne
// ([K:] [M:] [L:] [V:]), plusieurs voix, plusieurs morceaux dans un fichier.
//
// CE QUI NE L'EST PAS, ET QUI EST DIT. Les notes d'ornement {…}, les
// changements de tempo en cours de morceau, les fins alternatives multiples
// ([1,3), les directives %%MIDI, les tonalités de cornemuse (HP, Hp), les
// accords chiffrés que Tonal ne reconnaît pas. Chacun produit un avertissement
// nommé : une partition mal rendue en silence est pire qu'un refus.
//
// LE TEMPS EST EXACT. Les durées sont des fractions de ronde, additionnées en
// rationnels : un triolet vaut exactement 1/3, et l'arrondi n'intervient qu'à
// l'écriture des ticks MIDI. En flottant, une suite de triolets dériverait.

import { writeMidi } from "midi-file";
import { Chord, Note } from "tonal";

// ── Fractions ────────────────────────────────────────────────────────────

export type Frac = { n: number; d: number };
const pgcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : pgcd(b, a % b));
export const frac = (n: number, d = 1): Frac => {
  const g = pgcd(n, d) || 1;
  const s = d < 0 ? -1 : 1;
  return { n: (s * n) / g, d: (s * d) / g };
};
const fAdd = (a: Frac, b: Frac) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const fMul = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
const ZERO = frac(0);
/** Une fraction de ronde en noires. */
const enNoires = (f: Frac) => (4 * f.n) / f.d;

// ── Tonalité ─────────────────────────────────────────────────────────────

const POSITION_QUINTE: Record<string, number> = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };
const DECALAGE_MODE: Record<string, { quintes: number; nom: string }> = {
  "": { quintes: 0, nom: "major" }, maj: { quintes: 0, nom: "major" }, ion: { quintes: 0, nom: "major" },
  m: { quintes: -3, nom: "minor" }, min: { quintes: -3, nom: "minor" }, aeo: { quintes: -3, nom: "minor" },
  mix: { quintes: -1, nom: "mixolydian" }, dor: { quintes: -2, nom: "dorian" },
  phr: { quintes: -4, nom: "phrygian" }, lyd: { quintes: 1, nom: "lydian" }, loc: { quintes: -5, nom: "locrian" },
};

export type Armure = {
  /** Altération par lettre, en demi-tons. */
  alterations: Record<string, number>;
  /** Nombre de quintes : positif = dièses, négatif = bémols. */
  quintes: number;
  /** « G major », « A dorian », « none »… */
  nom: string;
  mineur: boolean;
  octave: number;
  transposition: number;
};

/**
 * Lit un champ K:. Rend aussi `octave=` et `transpose=`, qui modifient la
 * hauteur jouée, et des avertissements pour ce qui ne se lit pas.
 */
export function lireTonalite(valeur: string, avert: (m: string) => void): Armure {
  const armure: Armure = { alterations: {}, quintes: 0, nom: "C major", mineur: false, octave: 0, transposition: 0 };
  let reste = valeur.replace(/%.*/, "").trim();

  const octave = /\boctave=(-?\d+)/.exec(reste);
  if (octave) armure.octave = parseInt(octave[1], 10);
  const transpose = /\btranspose=(-?\d+)/.exec(reste);
  if (transpose) armure.transposition = parseInt(transpose[1], 10);
  reste = reste.replace(/\b\w+=("[^"]*"|\S+)/g, "").trim();

  if (/^(none)?$/i.test(reste.split(/\s+/)[0] ?? "")) {
    armure.nom = "none";
    reste = reste.replace(/^none/i, "").trim();
  } else if (/^H[Pp]\b/.test(reste)) {
    avert("tonalité de cornemuse (HP/Hp) lue sans armure");
    armure.nom = "none";
    reste = reste.slice(2).trim();
  } else {
    const m = /^([A-G])([#b]?)\s*([A-Za-z]*)/.exec(reste);
    if (m) {
      const mot = m[3].toLowerCase();
      const cle = mot === "m" ? "m" : mot.slice(0, 3);
      const mode = DECALAGE_MODE[cle];
      const accident = m[2] === "#" ? 7 : m[2] === "b" ? -7 : 0;
      const tonique = POSITION_QUINTE[m[1]] + accident;
      armure.quintes = tonique + (mode ? mode.quintes : 0);
      armure.nom = `${m[1]}${m[2]} ${mode ? mode.nom : "major"}`;
      armure.mineur = mode?.nom === "minor";
      // Un mot qui n'est pas un mode (« exp », « clef »…) reste à lire.
      reste = reste.slice(m[1].length + m[2].length).trim();
      if (mode) reste = reste.slice(mot.length).trim();
      if (Math.abs(armure.quintes) > 7) {
        avert(`tonalité ${armure.nom} au-delà de 7 altérations, ramenée à 7`);
        armure.quintes = Math.sign(armure.quintes) * 7;
      }
      if (armure.quintes > 0) for (const l of "FCGDAEB".slice(0, armure.quintes)) armure.alterations[l] = 1;
      if (armure.quintes < 0) for (const l of "BEADGCF".slice(0, -armure.quintes)) armure.alterations[l] = -1;
    }
  }

  // Altérations explicites : « K:D exp ^f _b » (exp = seulement celles-là).
  const jetons = reste.split(/\s+/).filter(Boolean);
  if (jetons[0]?.toLowerCase() === "exp") { armure.alterations = {}; jetons.shift(); }
  for (const j of jetons) {
    const a = /^(\^\^|\^|__|_|=)([A-Ga-g])$/.exec(j);
    if (a) armure.alterations[a[2].toUpperCase()] = { "^^": 2, "^": 1, "__": -2, "_": -1, "=": 0 }[a[1]]!;
    else if (!/^clef|^treble|^bass|^alto|^tenor|^perc/i.test(j)) avert(`élément de tonalité non lu : « ${j} »`);
  }
  return armure;
}

// ── Métrique, unité, tempo ───────────────────────────────────────────────

export type Metrique = { numerateur: number; denominateur: number; texte: string };

export function lireMetrique(valeur: string): Metrique | null {
  const v = valeur.replace(/%.*/, "").trim();
  if (v === "C") return { numerateur: 4, denominateur: 4, texte: "C" };
  if (v === "C|") return { numerateur: 2, denominateur: 2, texte: "C|" };
  const m = /^(\d+(?:\+\d+)*)\s*\/\s*(\d+)/.exec(v);
  if (!m) return null; // « none » ou illisible : pas de métrique
  const numerateur = m[1].split("+").reduce((s, x) => s + parseInt(x, 10), 0);
  return { numerateur, denominateur: parseInt(m[2], 10), texte: `${numerateur}/${m[2]}` };
}

/** Unité par défaut selon ABC 2.1 : 1/16 si la mesure vaut moins de 3/4, 1/8 sinon. */
export function uniteParDefaut(m: Metrique | null): Frac {
  if (!m) return frac(1, 8);
  return m.numerateur / m.denominateur < 0.75 ? frac(1, 16) : frac(1, 8);
}

/** Tempo en noires par minute. « 1/4=120 », « 3/8=80 », ou l'ancienne forme « 120 » (en unités L). */
export function lireTempo(valeur: string, unite: Frac): number | null {
  const v = valeur.replace(/"[^"]*"/g, "").trim();
  const m = /(\d+)\s*\/\s*(\d+)\s*=\s*(\d+(?:\.\d+)?)/.exec(v);
  if (m) return parseFloat(m[3]) * enNoires(frac(parseInt(m[1], 10), parseInt(m[2], 10)));
  const ancien = /^(\d+(?:\.\d+)?)$/.exec(v);
  if (ancien) return parseFloat(ancien[1]) * enNoires(unite);
  return null;
}

// ── Jetons ───────────────────────────────────────────────────────────────

type JetonNote = { t: "note"; hauteurs: number[]; duree: Frac; lie: boolean; velocite: number };
/** `ligne` : une vraie barre de mesure (« | », « :| »…), et non un simple début de fin alternative « [1 ». */
type JetonBarre = { t: "barre"; debutReprise: boolean; finReprise: boolean; volta: number | null; ligne: boolean };
type JetonAccord = { t: "accord"; symbole: string };
type Jeton = JetonNote | JetonBarre | JetonAccord;

type EtatVoix = {
  id: string;
  jetons: Jeton[];
  unite: Frac;
  metrique: Metrique | null;
  armure: Armure;
  accBarre: Map<string, number>;
  velocite: number;
  facteurSuivant: Frac | null;
  tuplet: { reste: number; facteur: Frac } | null;
};

const DEMI_TON: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NUANCES: Record<string, number> = { pppp: 15, ppp: 25, pp: 40, p: 55, mp: 70, mf: 85, f: 100, ff: 115, fff: 127, ffff: 127 };

export type NoteAbc = { midi: number; debut: number; duree: number; velocite: number };
export type AccordAbc = { symbole: string; hauteurs: number[]; debut: number; duree: number };
/** `barres` : instants des barres de mesure dans le jeu, en noires, reprises déroulées. */
export type VoixAbc = { id: string; notes: NoteAbc[]; dureeNoires: number; barres: number[] };

export type MorceauAbc = {
  numero: number;
  titre: string;
  tonalite: Armure;
  metrique: Metrique | null;
  /** Noires par minute ; null si le morceau n'en déclare pas. */
  tempo: number | null;
  voix: VoixAbc[];
  accords: AccordAbc[];
  avertissements: string[];
};

/**
 * Ce qu'un modèle de langage met autour de la partition. S'il y a des blocs de
 * code, SEUL leur contenu est gardé : la phrase qui suit la clôture (« Bonne
 * écoute. ») serait sinon lue comme des notes — B, e, c… Sans bloc, le texte
 * est gardé tel quel.
 */
function sansClotures(texte: string): string {
  const lignes = texte.split(/\r?\n/);
  if (!lignes.some((l) => /^\s*```/.test(l))) return texte;
  const gardees: string[] = [];
  let dedans = false;
  for (const l of lignes) {
    if (/^\s*```/.test(l)) { dedans = !dedans; if (!dedans) gardees.push(""); continue; }
    if (dedans) gardees.push(l);
  }
  return gardees.join("\n");
}

/** Découpe un fichier en morceaux (champ X:). Un texte sans X: est un morceau. */
export function decouperMorceaux(texte: string): string[] {
  const lignes = sansClotures(texte).split(/\r?\n/);
  const morceaux: string[][] = [];
  let courant: string[] | null = null;
  for (const l of lignes) {
    if (/^X:/.test(l)) { courant = [l]; morceaux.push(courant); continue; }
    if (!courant) { courant = []; morceaux.push(courant); }
    courant.push(l);
  }
  // Dès qu'un X: existe, ce qui le précède est du texte libre — la phrase de
  // présentation d'un modèle de langage, typiquement — et non un morceau.
  const avecX = morceaux.some((m) => /^X:/.test(m[0] ?? ""));
  return morceaux
    .filter((m) => !avecX || /^X:/.test(m[0] ?? ""))
    .map((m) => m.join("\n"))
    .filter((m) => /[A-Ga-gz]/.test(m.replace(/^[A-Za-z]:.*$/gm, "")))
    // Sans X: ni K:, un texte n'est une partition que s'il se lit ENTIÈREMENT :
    // sinon « pas de partition » passerait pour les notes a, d, e… Une partition
    // saisie sans en-tête (« CDE FGA ») reste acceptée.
    .filter((m) => /^[XK]:/m.test(m) || !lireMorceau(m).avertissements.some((a) => a.startsWith("caractère non lu")));
}

/** Défaut de q pour un n-olet (p notes dans le temps de q), ABC 2.1 §4.13. */
function qParDefaut(p: number, m: Metrique | null): number {
  const compose = !!m && m.numerateur % 3 === 0 && m.numerateur > 3;
  return ({ 2: 3, 3: 2, 4: 3, 6: 2, 8: 3 } as Record<number, number>)[p] ?? (compose ? 3 : 2);
}

/** Lit une durée à partir de `i` : « 2 », « /2 », « / », « // », « 3/2 ». */
function lireDuree(s: string, i: number): { duree: Frac; i: number } {
  let j = i, num = "";
  while (j < s.length && /\d/.test(s[j])) num += s[j++];
  let n = num ? parseInt(num, 10) : 1, d = 1;
  while (j < s.length && s[j] === "/") {
    j++;
    let den = "";
    while (j < s.length && /\d/.test(s[j])) den += s[j++];
    d *= den ? parseInt(den, 10) : 2;
  }
  return { duree: frac(n, d), i: j };
}

/** Lit une note (altération, lettre, octaves) à partir de `i`. null si ce n'est pas une note. */
function lireHauteur(s: string, i: number, v: EtatVoix): { midi: number; i: number } | null {
  let j = i, alteration: number | null = null;
  const acc = /^(\^\^|\^|__|_|=)/.exec(s.slice(j));
  if (acc) { alteration = { "^^": 2, "^": 1, "__": -2, "_": -1, "=": 0 }[acc[1]]!; j += acc[1].length; }
  const lettre = s[j];
  if (!lettre || !/[A-Ga-g]/.test(lettre)) return null;
  j++;
  let octave = lettre === lettre.toLowerCase() ? 1 : 0;
  while (j < s.length && (s[j] === "'" || s[j] === ",")) { octave += s[j] === "'" ? 1 : -1; j++; }
  const L = lettre.toUpperCase();
  // Une altération écrite vaut pour la même lettre à la même octave jusqu'à la
  // barre ; à défaut, l'armure s'applique.
  const cleBarre = `${L}${octave}`;
  if (alteration !== null) v.accBarre.set(cleBarre, alteration);
  const effective = v.accBarre.has(cleBarre) ? v.accBarre.get(cleBarre)! : (v.armure.alterations[L] ?? 0);
  const midi = 60 + DEMI_TON[L] + effective + 12 * (octave + v.armure.octave) + v.armure.transposition;
  return { midi, i: j };
}

function nouvelleVoix(id: string, g: { unite: Frac; metrique: Metrique | null; armure: Armure }): EtatVoix {
  return {
    id, jetons: [], unite: g.unite, metrique: g.metrique, armure: { ...g.armure, alterations: { ...g.armure.alterations } },
    accBarre: new Map(), velocite: 80, facteurSuivant: null, tuplet: null,
  };
}

/** Ajoute une note ou un silence en appliquant n-olet et rythme pointé en attente. */
function pousserNote(v: EtatVoix, hauteurs: number[], duree: Frac) {
  let d = duree;
  if (v.tuplet) {
    d = fMul(d, v.tuplet.facteur);
    if (--v.tuplet.reste <= 0) v.tuplet = null;
  }
  if (v.facteurSuivant) { d = fMul(d, v.facteurSuivant); v.facteurSuivant = null; }
  v.jetons.push({ t: "note", hauteurs, duree: d, lie: false, velocite: v.velocite });
}

function derniereNote(v: EtatVoix): JetonNote | null {
  for (let k = v.jetons.length - 1; k >= 0; k--) {
    const j = v.jetons[k];
    if (j.t === "note") return j;
    if (j.t === "barre") return null;
  }
  return null;
}

function lireLigneCorps(ligne: string, v: EtatVoix, avert: (m: string) => void, changerVoix: (id: string) => EtatVoix, surTempo: (valeur: string, v: EtatVoix) => void): EtatVoix {
  const s = ligne.replace(/%.*$/, "").replace(/\\\s*$/, "");
  let i = 0;
  while (i < s.length) {
    const c = s[i];

    if (c === " " || c === "\t" || c === "`" || c === "y") { i++; continue; }

    // Accords chiffrés et annotations.
    if (c === '"') {
      const fin = s.indexOf('"', i + 1);
      const contenu = s.slice(i + 1, fin < 0 ? s.length : fin);
      if (contenu && !/^[\^_<>@]/.test(contenu)) v.jetons.push({ t: "accord", symbole: contenu.trim() });
      i = fin < 0 ? s.length : fin + 1;
      continue;
    }

    // Décorations !…! et +…+ ; les nuances règlent la vélocité.
    if (c === "!" || c === "+") {
      const fin = s.indexOf(c, i + 1);
      if (fin < 0) { i++; continue; }
      const nom = s.slice(i + 1, fin);
      if (NUANCES[nom] !== undefined) v.velocite = NUANCES[nom];
      i = fin + 1;
      continue;
    }
    if (/[.~HLMOPSTuv]/.test(c)) { i++; continue; }

    // Notes d'ornement : sautées, et dites.
    if (c === "{") {
      const fin = s.indexOf("}", i);
      avert("notes d'ornement {…} ignorées");
      i = fin < 0 ? s.length : fin + 1;
      continue;
    }

    // n-olets et liaisons d'expression.
    if (c === "(") {
      const t = /^\((\d+)(?::(\d*))?(?::(\d*))?/.exec(s.slice(i));
      if (t) {
        const p = parseInt(t[1], 10);
        const q = t[2] ? parseInt(t[2], 10) : qParDefaut(p, v.metrique);
        const r = t[3] ? parseInt(t[3], 10) : p;
        v.tuplet = { reste: r, facteur: frac(q, p) };
        i += t[0].length;
      } else i++;
      continue;
    }
    if (c === ")") { i++; continue; }

    // Prolongation.
    if (c === "-") {
      const n = derniereNote(v);
      if (n) n.lie = true;
      i++;
      continue;
    }

    // Rythme pointé : la note précédente est allongée, la suivante raccourcie.
    if (c === ">" || c === "<") {
      let k = 0;
      while (s[i + k] === c) k++;
      const n = derniereNote(v);
      const court = frac(1, 2 ** k), long = frac(2 ** (k + 1) - 1, 2 ** k);
      if (n) {
        n.duree = fMul(n.duree, c === ">" ? long : court);
        v.facteurSuivant = c === ">" ? court : long;
      }
      i += k;
      continue;
    }

    // Champs en ligne [K:…], fins alternatives [1, barres [| et accords [CEG].
    if (c === "[") {
      const champ = /^\[([KMLQVIPrmNRTw]):([^\]]*)\]/.exec(s.slice(i));
      if (champ) {
        v = appliquerChamp(champ[1], champ[2], v, avert, changerVoix, surTempo);
        i += champ[0].length;
        continue;
      }
      const volta = /^\[(\d+)((?:[,-]\d+)*)/.exec(s.slice(i));
      if (volta) {
        if (volta[2]) avert(`fin alternative multiple « [${volta[1]}${volta[2]} » lue comme « [${volta[1]} »`);
        v.jetons.push({ t: "barre", debutReprise: false, finReprise: false, volta: parseInt(volta[1], 10), ligne: false });
        i += volta[0].length;
        continue;
      }
      if (s[i + 1] === "|") { i++; continue; } // « [| » : la barre suit
      // Accord de notes.
      let j = i + 1;
      const hauteurs: number[] = [];
      let dureeInterne: Frac | null = null;
      while (j < s.length && s[j] !== "]") {
        if (/[\s.~!]/.test(s[j])) { j++; continue; }
        const h = lireHauteur(s, j, v);
        if (!h) { j++; continue; }
        hauteurs.push(h.midi);
        const d = lireDuree(s, h.i);
        if (dureeInterne === null) dureeInterne = d.duree;
        j = d.i;
        if (s[j] === "-") j++;
      }
      const exterieure = lireDuree(s, j + 1);
      if (hauteurs.length > 0) pousserNote(v, hauteurs, fMul(fMul(v.unite, dureeInterne ?? frac(1)), exterieure.duree));
      i = exterieure.i;
      continue;
    }

    // Barres, reprises, fins alternatives |1 :|2.
    if (c === "|" || c === ":") {
      const b = /^([|:\]]+)(\d+)?/.exec(s.slice(i))!;
      const signe = b[1];
      if (signe === ":") { i++; continue; } // deux-points isolé : rien
      v.accBarre.clear();
      v.jetons.push({
        t: "barre",
        finReprise: signe.startsWith(":"),
        debutReprise: signe.endsWith(":"),
        volta: b[2] ? parseInt(b[2], 10) : null,
        ligne: true,
      });
      i += b[0].length;
      continue;
    }
    if (c === "]") { i++; continue; }

    // Silences.
    if (c === "z" || c === "x") {
      const d = lireDuree(s, i + 1);
      pousserNote(v, [], fMul(v.unite, d.duree));
      i = d.i;
      continue;
    }
    if (c === "Z" || c === "X") {
      const d = lireDuree(s, i + 1);
      const mesure = v.metrique ? frac(v.metrique.numerateur, v.metrique.denominateur) : frac(1);
      v.jetons.push({ t: "note", hauteurs: [], duree: fMul(mesure, frac(d.duree.n, d.duree.d)), lie: false, velocite: v.velocite });
      i = d.i;
      continue;
    }

    // Notes.
    const h = lireHauteur(s, i, v);
    if (h) {
      const d = lireDuree(s, h.i);
      pousserNote(v, [h.midi], fMul(v.unite, d.duree));
      i = d.i;
      continue;
    }

    avert(`caractère non lu : « ${c} »`);
    i++;
  }
  return v;
}

function appliquerChamp(
  cle: string, valeur: string, v: EtatVoix, avert: (m: string) => void,
  changerVoix: (id: string) => EtatVoix, surTempo: (valeur: string, v: EtatVoix) => void,
): EtatVoix {
  switch (cle) {
    case "K": v.armure = lireTonalite(valeur, avert); v.accBarre.clear(); return v;
    case "M": v.metrique = lireMetrique(valeur); return v;
    case "L": { const d = lireDuree(valeur.trim(), 0); v.unite = d.duree; return v; }
    case "Q": surTempo(valeur, v); return v;
    case "V": return changerVoix(valeur.trim().split(/\s+/)[0] ?? "1");
    default: return v;
  }
}

/**
 * Déroule les reprises et fins alternatives, puis pose les notes dans le temps.
 * Les prolongations fusionnent une note avec la suivante de même hauteur.
 */
function derouler(v: EtatVoix, avert: (m: string) => void): { notes: NoteAbc[]; accords: { symbole: string; debut: number }[]; fin: number; barres: number[] } {
  const j = v.jetons;
  const notes: NoteAbc[] = [];
  const accords: { symbole: string; debut: number }[] = [];
  const barres: number[] = [];
  const ouvertes = new Map<number, NoteAbc>();
  let t: Frac = ZERO;
  let debutReprise = 0;
  let dejaRepete = false;
  let passage = 1;
  let garde = 0;

  for (let k = 0; k < j.length; k++) {
    if (++garde > 200_000) { avert("reprises trop imbriquées : lecture interrompue"); break; }
    const jeton = j[k];

    if (jeton.t === "barre") {
      // Instant de la barre DANS LE JEU, reprises déroulées : c'est ce qui permet
      // de vérifier que chaque mesure jouée a la bonne durée.
      if (jeton.ligne && barres[barres.length - 1] !== enNoires(t)) barres.push(enNoires(t));
      // Au second passage, la première fin est sautée jusqu'à sa barre de reprise.
      if (jeton.volta === 1 && passage === 2) {
        let m = k + 1;
        while (m < j.length && !(j[m].t === "barre" && ((j[m] as JetonBarre).finReprise || (j[m] as JetonBarre).volta !== null))) m++;
        const cible = j[m] as JetonBarre | undefined;
        // La barre de reprise qui clôt la première fin est CONSOMMÉE, qu'elle porte
        // ou non le début de la seconde (« :|2 ») : la relire relancerait la
        // reprise indéfiniment. Une fin qui s'arrête sur « [2 » sans « :| » laisse
        // en revanche cette barre à lire.
        k = cible && cible.finReprise ? m : m - 1;
        passage = 1;
        dejaRepete = false;
        continue;
      }
      if (jeton.finReprise) {
        if (!dejaRepete) {
          dejaRepete = true;
          passage = 2;
          k = debutReprise - 1;
          continue;
        }
        dejaRepete = false;
        passage = 1;
      }
      if (jeton.debutReprise) {
        debutReprise = k + 1;
        dejaRepete = false;
        passage = 1;
      }
      if (jeton.volta !== null && jeton.volta > 1) passage = 1;
      continue;
    }

    const debut = enNoires(t);
    if (jeton.t === "accord") { accords.push({ symbole: jeton.symbole, debut }); continue; }

    const duree = enNoires(jeton.duree);
    if (jeton.hauteurs.length === 0) ouvertes.clear();
    for (const h of jeton.hauteurs) {
      const ouverte = ouvertes.get(h);
      if (ouverte && Math.abs(ouverte.debut + ouverte.duree - debut) < 1e-9) {
        ouverte.duree += duree;
        if (!jeton.lie) ouvertes.delete(h);
      } else {
        const n = { midi: h, debut, duree, velocite: jeton.velocite };
        notes.push(n);
        if (jeton.lie) ouvertes.set(h, n); else ouvertes.delete(h);
      }
    }
    t = fAdd(t, jeton.duree);
  }
  return { notes, accords, fin: enNoires(t), barres };
}

/**
 * Écritures courantes que Tonal refuse, ramenées aux siennes. Trouvé en mesurant
 * des retouches par LLM : gemma4:12b écrivait « Bm7(b5) », l'écriture usuelle du
 * semi-diminué, et la lecture échouait — le modèle avait raison, le lecteur tort.
 * Vérifié une par une contre Tonal : les parenthèses d'altération, « m(maj7) »,
 * « ø7 », et « 6/9 », que la barre oblique faisait prendre pour une basse.
 */
export function normaliserAccord(symbole: string): string {
  return symbole
    .replace(/\(([^)]*)\)/g, "$1") // Bm7(b5) → Bm7b5, C(add9) → Cadd9
    .replace(/m\s*maj7/i, "mMaj7") // Dm(maj7) → DmMaj7
    .replace(/ø7?/, "m7b5") // Bø, Bø7 → Bm7b5
    .replace(/6\/9/, "69"); // F6/9 → F69 : ce 9 n'est pas une basse
}

/** Voicing d'un accord chiffré : fondamentale à l'octave 3, notes montantes, basse sous la fondamentale. */
export function hauteursAccord(symbole: string): number[] | null {
  if (/^N\.?C\.?$/i.test(symbole)) return [];
  const [nom, basse] = normaliserAccord(symbole).split("/");
  const c = Chord.get(nom.replace(/^([a-g])/, (x) => x.toUpperCase()));
  if (c.empty || c.notes.length === 0) return null;
  const hauteurs: number[] = [];
  let precedente = 47;
  for (const n of c.notes) {
    let m = 48 + (Note.chroma(n) ?? 0);
    while (m <= precedente) m += 12;
    hauteurs.push(m);
    precedente = m;
  }
  if (basse) {
    const b = Note.chroma(basse);
    if (b === undefined || Number.isNaN(b)) return null;
    let m = 36 + b;
    while (m >= hauteurs[0]) m -= 12;
    hauteurs.unshift(m);
  }
  return hauteurs;
}

/** Lit un morceau ABC. */
export function lireMorceau(texte: string, numero = 1): MorceauAbc {
  const avertissements = new Set<string>();
  const avert = (m: string) => avertissements.add(m);
  let titre = "", tempo: number | null = null, tempoVu = false;
  let global = { unite: frac(1, 8), metrique: null as Metrique | null, armure: lireTonalite("C", avert) };
  let uniteExplicite = false, enTete = true;
  const voix: EtatVoix[] = [];
  let courante: EtatVoix | null = null;

  const obtenirVoix = (id: string): EtatVoix => {
    let v = voix.find((x) => x.id === id);
    if (!v) {
      // La voix implicite du début prend le nom de la première voix déclarée,
      // tant qu'elle n'a rien reçu.
      const implicite = voix.length === 1 && voix[0].id === "" && voix[0].jetons.length === 0 ? voix[0] : null;
      if (implicite) { implicite.id = id; v = implicite; }
      else { v = nouvelleVoix(id, global); voix.push(v); }
    }
    return v;
  };
  const surTempo = (valeur: string, v: EtatVoix) => {
    const q = lireTempo(valeur, v.unite);
    if (q === null) { avert(`tempo non lu : « ${valeur.trim()} »`); return; }
    if (!tempoVu) { tempo = q; tempoVu = true; }
    else if (Math.abs(q - (tempo ?? q)) > 1e-9) avert("changement de tempo en cours de morceau ignoré");
  };

  // Dans un fichier ABC en règle (avec X:), une ligne vide clôt le morceau
  // (ABC 2.1 §2.2) : ce qui suit est du texte libre. Sans X:, le texte vient
  // souvent d'une saisie ou d'un modèle, et une ligne vide au milieu du corps
  // n'y signifie rien.
  const formel = /^X:/.test(texte.trimStart());
  let corpsCommence = false;
  for (const brute of texte.split(/\r?\n/)) {
    const ligne = brute.trimEnd();
    if (!ligne.trim()) {
      if (formel && corpsCommence) break;
      continue;
    }
    if (ligne.startsWith("%%")) {
      if (/^%%MIDI/.test(ligne)) avert("directives %%MIDI ignorées");
      continue;
    }
    if (ligne.startsWith("%")) continue;

    const champ = /^([A-Za-z]):(.*)$/.exec(ligne);
    if (champ) {
      const [, cle, valeur] = champ;
      if (enTete) {
        if (cle === "T" && !titre) titre = valeur.trim();
        else if (cle === "M") { global.metrique = lireMetrique(valeur); if (!uniteExplicite) global.unite = uniteParDefaut(global.metrique); }
        else if (cle === "L") { global.unite = lireDuree(valeur.trim(), 0).duree; uniteExplicite = true; }
        else if (cle === "Q") {
          const q = lireTempo(valeur, global.unite);
          if (q === null) avert(`tempo non lu : « ${valeur.trim()} »`); else { tempo = q; tempoVu = true; }
        } else if (cle === "K") {
          global.armure = lireTonalite(valeur, avert);
          // K: clôt l'en-tête : les voix déclarées avant lui en héritent, sans quoi
          // elles resteraient en do majeur.
          for (const v of voix) {
            v.armure = { ...global.armure, alterations: { ...global.armure.alterations } };
            v.unite = global.unite;
            v.metrique = global.metrique;
          }
          enTete = false;
        } else if (cle === "V") {
          obtenirVoix(valeur.trim().split(/\s+/)[0] ?? "1");
        }
        continue;
      }
      if ("KMLQV".includes(cle)) {
        courante = appliquerChamp(cle, valeur, courante ?? obtenirVoix(voix[0]?.id ?? ""), avert, obtenirVoix, surTempo);
      }
      continue; // w:, W:, T:… : texte, sans effet sur les notes
    }

    if (enTete) {
      avert("champ K: absent : le corps commence sans tonalité déclarée, lu en do majeur");
      enTete = false;
    }
    if (!courante) courante = voix[0] ?? obtenirVoix("");
    courante = lireLigneCorps(ligne, courante, avert, obtenirVoix, surTempo);
    corpsCommence = true;
  }

  // Une voix déclarée dans l'en-tête sans jamais recevoir de notes n'existe pas.
  const pleines = voix.filter((v) => v.jetons.some((j) => j.t === "note"));
  const deroulees = pleines.map((v) => ({ v, r: derouler(v, avert) }));

  // Accords chiffrés : ceux de la première voix qui en porte, chacun tenu
  // jusqu'au suivant, ou jusqu'à la fin de cette voix.
  const accords: AccordAbc[] = [];
  const porteuse = deroulees.find((d) => d.r.accords.length > 0);
  if (porteuse) {
    const liste = porteuse.r.accords;
    liste.forEach((a, k) => {
      const fin = k + 1 < liste.length ? liste[k + 1].debut : porteuse.r.fin;
      if (fin <= a.debut) return;
      const hauteurs = hauteursAccord(a.symbole);
      if (hauteurs === null) { avert(`accord chiffré non reconnu : « ${a.symbole} »`); return; }
      if (hauteurs.length > 0) accords.push({ symbole: a.symbole, hauteurs, debut: a.debut, duree: fin - a.debut });
    });
  }

  return {
    numero,
    titre,
    tonalite: global.armure,
    metrique: global.metrique,
    tempo,
    voix: deroulees.map(({ v, r }) => ({ id: v.id || "1", notes: r.notes, dureeNoires: r.fin, barres: r.barres })),
    accords,
    avertissements: [...avertissements],
  };
}

// ── MIDI ────────────────────────────────────────────────────────────────

export type OptionsMidiAbc = {
  tempoParDefaut: number;
  /** banque × 128 + programme, comme ailleurs dans Attic. */
  instrumentVoix: number;
  instrumentAccords: number;
  jouerAccords: boolean;
  /** Instrument de chaque voix, dans l'ordre ; à défaut, `instrumentVoix` pour toutes. */
  instrumentsParVoix?: number[];
};

const TICKS_NOIRE = 480;

/** Écrit un MIDI multipiste : une piste de tempo, une par voix, une pour les accords chiffrés. */
export function morceauVersMidi(m: MorceauAbc, o: OptionsMidiAbc): { octets: Uint8Array; tempo: number; canaux: number } {
  const tempo = m.tempo ?? o.tempoParDefaut;
  const metrique = m.metrique ?? { numerateur: 4, denominateur: 4, texte: "4/4" };
  const pisteTempo: any[] = [
    { deltaTime: 0, type: "setTempo", microsecondsPerBeat: Math.round(60_000_000 / tempo) },
    { deltaTime: 0, type: "timeSignature", numerator: metrique.numerateur, denominator: metrique.denominateur, metronome: 24, thirtyseconds: 8 },
    { deltaTime: 0, type: "keySignature", key: Math.max(-7, Math.min(7, m.tonalite.quintes)), scale: m.tonalite.mineur ? 1 : 0 },
    ...(m.titre ? [{ deltaTime: 0, type: "trackName", text: m.titre }] : []),
    { deltaTime: 0, type: "endOfTrack" },
  ];

  // Le canal 9 est réservé à la batterie en General MIDI : on le saute.
  const canal = (k: number) => (k >= 9 ? k + 1 : k);
  const piste = (ch: number, instrument: number, evenements: { midi: number; debut: number; duree: number; velocite: number }[]) => {
    const lignes: { tick: number; ordre: number; e: any }[] = [];
    const banque = Math.floor(instrument / 128), programme = instrument % 128;
    if (banque > 0) {
      lignes.push({ tick: 0, ordre: 0, e: { type: "controller", channel: ch, controllerType: 0, value: Math.floor(banque / 128) } });
      lignes.push({ tick: 0, ordre: 0, e: { type: "controller", channel: ch, controllerType: 32, value: banque % 128 } });
    }
    lignes.push({ tick: 0, ordre: 0, e: { type: "programChange", channel: ch, programNumber: programme } });
    for (const n of evenements) {
      if (n.midi < 0 || n.midi > 127) continue;
      const debut = Math.round(n.debut * TICKS_NOIRE);
      const fin = Math.max(debut + 1, Math.round((n.debut + n.duree) * TICKS_NOIRE));
      // À tick égal, les fins passent avant les débuts : une note répétée n'est
      // pas coupée par sa propre fin.
      lignes.push({ tick: debut, ordre: 2, e: { type: "noteOn", channel: ch, noteNumber: n.midi, velocity: Math.max(1, Math.min(127, n.velocite)) } });
      lignes.push({ tick: fin, ordre: 1, e: { type: "noteOff", channel: ch, noteNumber: n.midi, velocity: 0 } });
    }
    lignes.sort((a, b) => a.tick - b.tick || a.ordre - b.ordre);
    let precedent = 0;
    const evs = lignes.map(({ tick, e }) => { const r = { deltaTime: tick - precedent, ...e }; precedent = tick; return r; });
    evs.push({ deltaTime: 0, type: "endOfTrack" });
    return evs;
  };

  const pistes = [pisteTempo, ...m.voix.map((v, k) => piste(canal(k), o.instrumentsParVoix?.[k] ?? o.instrumentVoix, v.notes))];
  if (o.jouerAccords && m.accords.length > 0) {
    const evenements = m.accords.flatMap((a) => a.hauteurs.map((h) => ({ midi: h, debut: a.debut, duree: a.duree, velocite: 60 })));
    pistes.push(piste(canal(m.voix.length), o.instrumentAccords, evenements));
  }
  const octets = new Uint8Array(writeMidi({ header: { format: 1, numTracks: pistes.length, ticksPerBeat: TICKS_NOIRE }, tracks: pistes } as any));
  return { octets, tempo, canaux: pistes.length - 1 };
}
