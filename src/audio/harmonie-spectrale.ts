// audio/harmonie-spectrale.ts — L'harmonie spectrale comme calcul sur des hauteurs, non sur un signal.
//
// CE QUE CELA AJOUTE. Le dépôt sait déjà analyser et resynthétiser un spectre : dix-neuf nœuds
// travaillent sur des trames de Fourier. Aucun ne calculait un spectre COMME SUITE DE HAUTEURS,
// c'est-à-dire un matériau que l'on note, que l'on transpose, que l'on donne à jouer. C'est la
// différence entre filtrer un son et écrire un accord dont les degrés viennent d'un spectre.
//
// D'OÙ VIENNENT CES FORMULES. De la littérature publiée, et d'elle seule : la modulation de
// fréquence est celle de Chowning, « The Synthesis of Complex Audio Spectra by Means of Frequency
// Modulation », Journal of the Audio Engineering Society 21/7, 1973 ; la distorsion harmonique et
// la modulation en anneau appliquées à des hauteurs sont la matière des analyses publiées de
// « Partiels » de Grisey et de « Gondwana » de Murail. Aucune ligne ne vient d'un code sous
// licence GPL, ce qui serait une œuvre dérivée : voir `COMPOSITION-ASSISTEE.md`, section 4.
//
// LES FRÉQUENCES SORTENT EN HERTZ, ET LES HAUTEURS EN DEMI-TONS FRACTIONNAIRES. Un spectre ne
// tombe pas sur le tempérament : le septième partiel est à trente et un cents sous la septième
// mineure, et c'est exactement ce que l'on vient chercher. Arrondir rendrait l'objet inutile.

import { frequenceDeNoteMidi, noteMidiDeFrequence } from "./commun";
import type { Note } from "./note";

/** Un partiel : sa fréquence, et son poids quand le procédé en donne un. */
export interface Partiel {
  frequence: number;
  /** Amplitude relative, de 0 à 1. Vaut 1 quand le procédé ne distingue pas les partiels. */
  amplitude: number;
}

const FREQUENCE_MIN = 1e-6;

/** Trie, écarte les fréquences inaudibles ou négatives, et fond celles qui se confondent. */
function ranger(partiels: Partiel[], centsDeFusion = 1): Partiel[] {
  const gardes = partiels
    .filter((p) => Number.isFinite(p.frequence) && p.frequence > FREQUENCE_MIN && p.amplitude > 0)
    .sort((a, b) => a.frequence - b.frequence);
  const sortie: Partiel[] = [];
  for (const p of gardes) {
    const dernier = sortie[sortie.length - 1];
    // DEUX PARTIELS À MOINS D'UN CENT SONT LA MÊME HAUTEUR, et les garder tous deux ferait une
    // liste plus longue sans qu'on entende ni ne note quoi que ce soit de plus. La modulation en
    // anneau en produit beaucoup : sans cette fusion, un spectre de douze partiels en rendrait
    // cent quarante-quatre dont la moitié se recouvrent.
    if (dernier && Math.abs(1200 * Math.log2(p.frequence / dernier.frequence)) < centsDeFusion) {
      dernier.amplitude = Math.min(1, dernier.amplitude + p.amplitude);
      continue;
    }
    sortie.push({ ...p });
  }
  return sortie;
}

/**
 * La série harmonique : le spectre d'un son entretenu, et la référence de tous les autres.
 *
 * Le partiel de rang k vaut k fois la fondamentale. Ce qui en fait un matériau et non une
 * évidence, c'est que la plupart de ses degrés SONT HORS DU TEMPÉRAMENT : le septième partiel
 * tombe trente et un cents sous la septième mineure, le onzième cinquante et un cents sous la
 * quarte augmentée. C'est cet écart que l'on vient chercher, et non l'accord parfait.
 */
export function serieHarmonique(fondamentale: number, nombre: number): Partiel[] {
  const n = Math.max(1, Math.floor(nombre));
  const partiels: Partiel[] = [];
  for (let k = 1; k <= n; k++) {
    // L'amplitude décroît en 1/k : c'est le profil d'une onde en dents de scie, la forme la plus
    // simple qui ne soit pas plate, et elle évite qu'un spectre de vingt partiels ne sonne comme
    // du bruit blanc.
    partiels.push({ frequence: fondamentale * k, amplitude: 1 / k });
  }
  return ranger(partiels);
}

/**
 * Le spectre comprimé ou dilaté : la distorsion harmonique.
 *
 * Le partiel de rang k vaut `f0 × k^coefficient`. À un, c'est la série harmonique ; en dessous, les
 * partiels se resserrent et le son s'épaissit vers le grave ; au-dessus, ils s'écartent et
 * l'ensemble perd sa fondamentale perçue. C'est le procédé des spectres « étirés » de la musique
 * spectrale, et le même calcul décrit l'inharmonicité d'une corde de piano, dont les partiels
 * hauts montent au-delà de leur rang.
 */
export function spectreDistordu(fondamentale: number, nombre: number, coefficient: number): Partiel[] {
  const n = Math.max(1, Math.floor(nombre));
  const d = Number.isFinite(coefficient) ? coefficient : 1;
  const partiels: Partiel[] = [];
  for (let k = 1; k <= n; k++) {
    partiels.push({ frequence: fondamentale * Math.pow(k, d), amplitude: 1 / k });
  }
  return ranger(partiels);
}

/**
 * La modulation en anneau, appliquée à des hauteurs et non à un signal.
 *
 * De deux ensembles de fréquences, elle rend toutes les sommes et toutes les différences en valeur
 * absolue. Le résultat n'est harmonique ni d'un côté ni de l'autre : c'est ce qui donne à ces
 * agrégats leur couleur, entre l'accord et le timbre. Les différences négatives se replient, une
 * fréquence n'ayant pas de signe, et celles qui tombent sous le seuil audible disparaissent.
 */
export function modulationEnAnneau(a: number[], b: number[]): Partiel[] {
  const partiels: Partiel[] = [];
  for (const x of a) {
    for (const y of b) {
      partiels.push({ frequence: x + y, amplitude: 0.5 });
      partiels.push({ frequence: Math.abs(x - y), amplitude: 0.5 });
    }
  }
  return ranger(partiels);
}

/**
 * La fonction de Bessel de première espèce, par sa série entière.
 *
 * Elle donne le poids de chaque bande latérale d'une modulation de fréquence. La série
 * `J_n(x) = Σ (−1)^m (x/2)^(n+2m) / (m! (n+m)!)` converge vite pour les indices de modulation
 * employés en musique, qui dépassent rarement dix ; vingt-cinq termes suffisent largement, et le
 * test le vérifie contre les valeurs tabulées.
 */
export function besselJ(ordre: number, x: number): number {
  const n = Math.abs(Math.round(ordre));
  let somme = 0;
  let facteurM = 1;
  let facteurNM = 1;
  for (let i = 1; i <= n; i++) facteurNM *= i;
  for (let m = 0; m < 25; m++) {
    if (m > 0) { facteurM *= m; facteurNM *= n + m; }
    somme += ((m % 2 === 0 ? 1 : -1) * Math.pow(x / 2, n + 2 * m)) / (facteurM * facteurNM);
  }
  // J_(−n) = (−1)^n J_n : l'ordre négatif ne demande pas un autre calcul.
  return ordre < 0 && n % 2 === 1 ? -somme : somme;
}

/**
 * Le spectre d'une modulation de fréquence, d'après Chowning.
 *
 * Les composantes tombent à `porteuse ± k × modulante`, et le poids de la k-ième est `J_k(indice)`.
 * L'indice décide de la largeur : à zéro il ne reste que la porteuse, et le nombre de bandes
 * audibles croît à peu près comme l'indice plus un. Les composantes de fréquence négative se
 * replient autour de zéro, en changeant de signe, ce qui est le comportement décrit dans l'article
 * et non une approximation.
 */
export function spectreFM(porteuse: number, modulante: number, indice: number): Partiel[] {
  const bandes = Math.max(1, Math.ceil(Math.abs(indice)) + 3);
  const partiels: Partiel[] = [];
  for (let k = -bandes; k <= bandes; k++) {
    const amplitude = besselJ(k, indice);
    const f = porteuse + k * modulante;
    if (Math.abs(amplitude) < 1e-4) continue;
    partiels.push({ frequence: Math.abs(f), amplitude: Math.abs(amplitude) });
  }
  return ranger(partiels);
}

/**
 * La fondamentale virtuelle : la plus grave dont l'ensemble donné serait un spectre harmonique.
 *
 * L'oreille attribue une hauteur à un agrégat même quand elle n'y est pas jouée, et c'est ce que
 * cherche ce calcul : le plus grand diviseur commun approché des fréquences. « Approché » est le
 * mot qui compte, puisqu'un diviseur commun exact de fréquences réelles n'existe presque jamais ;
 * on essaie donc les candidats et l'on garde celui dont les rangs tombent le plus près d'un entier.
 *
 * Le résultat n'est pas toujours audible, et ce n'est pas un défaut : un agrégat inharmonique n'a
 * pas de fondamentale, et le calcul rendra la plus basse qu'il ait trouvée.
 */
export function fondamentaleVirtuelle(frequences: number[], divisionMax = 16): number {
  const f = frequences.filter((x) => Number.isFinite(x) && x > FREQUENCE_MIN).sort((a, b) => a - b);
  if (f.length === 0) return 0;
  if (f.length === 1) return f[0];
  let meilleure = f[0];
  let meilleurEcart = Infinity;
  for (let d = 1; d <= Math.max(1, Math.floor(divisionMax)); d++) {
    const candidate = f[0] / d;
    let ecart = 0;
    for (const x of f) {
      const rang = x / candidate;
      ecart += Math.abs(rang - Math.round(rang)) / Math.round(rang);
    }
    ecart /= f.length;
    // UNE FONDAMENTALE PLUS GRAVE EXPLIQUE TOUJOURS MIEUX, et c'est le piège du procédé : divisée
    // par mille, elle rend tous les rangs entiers et ne veut plus rien dire. La pénalité croît
    // donc avec la division, ce qui fait préférer la plus haute des explications acceptables.
    const score = ecart + d * 1e-4;
    if (score < meilleurEcart) { meilleurEcart = score; meilleure = candidate; }
  }
  return meilleure;
}

export interface OptionsNotes {
  /** Début de la première note, en secondes. */
  debut?: number;
  /** Durée du partiel le plus grave, en secondes. Les autres en dépendent par `decroissance`. */
  duree?: number;
  /**
   * De combien les partiels aigus s'éteignent plus tôt que le grave.
   *
   * POURQUOI CE RÉGLAGE EXISTE. Avec une seule enveloppe pour tous, l'agrégat sonne comme un jeu
   * d'orgue : douze partiels qui commencent et finissent ensemble, sans vie. Dans un son réel —
   * une corde frappée, une cloche, un cuivre — les partiels hauts s'éteignent les premiers, et
   * c'est ce qui fait qu'un son ÉVOLUE au lieu de tenir. L'écriture spectrale le reproduit en
   * donnant à chaque rang sa propre durée.
   *
   * LA LOI EST EN PUISSANCE DE LA FRÉQUENCE, `durée × (f / f_grave)^(−décroissance)`, et elle est
   * prise sur la fréquence et non sur le rang : un spectre inharmonique n'a pas de rang entier, et
   * l'amortissement d'un corps vibrant suit sa fréquence. À zéro, toutes les durées sont égales et
   * l'on retrouve l'agrégat plat. À un, un partiel deux fois plus aigu dure deux fois moins.
   *
   * LES DÉBUTS NE BOUGENT PAS, et c'est ce qui préserve la fusion : ce qui fait entendre un son
   * unique plutôt qu'un accord est l'attaque commune. Décaler les entrées est l'affaire
   * d'`etalement`, qui produit délibérément un arpège.
   */
  decroissance?: number;
  /** Décalage entre deux partiels successifs : zéro pour un agrégat, sinon un arpège. */
  etalement?: number;
  /** Nuance de la plus forte ; les autres suivent leur amplitude. */
  velocite?: number;
  /** Hauteurs hors de cet intervalle écartées ; par défaut l'étendue d'un piano. */
  noteMin?: number;
  noteMax?: number;
}

/**
 * Des partiels vers des notes, en gardant les cents.
 *
 * LA HAUTEUR N'EST PAS ARRONDIE, et c'est tout l'objet. `noteMidiDeFrequence` rend un nombre à
 * virgule, la conversion étant continue dans les deux sens ; ce nombre traverse maintenant le
 * graphe par le flux « séquence », et le rendu le joue à la fréquence exacte.
 *
 * LES PARTIELS HORS DU CLAVIER SONT ÉCARTÉS plutôt que repliés. Un spectre de vingt partiels sur
 * un la grave dépasse le do8 dès le seizième ; les replier à l'octave inventerait des hauteurs que
 * le procédé n'a pas produites.
 */
export function partielsVersNotes(partiels: Partiel[], options: OptionsNotes = {}): Note[] {
  const debut = options.debut ?? 0;
  const duree = Math.max(0.01, options.duree ?? 2);
  const etalement = Math.max(0, options.etalement ?? 0);
  const decroissance = Math.max(0, options.decroissance ?? 0);
  const velocite = Math.max(1, Math.min(127, options.velocite ?? 100));
  const noteMin = options.noteMin ?? 21;
  const noteMax = options.noteMax ?? 108;
  // La référence de l'amortissement est le partiel le plus GRAVE de ceux qu'on garde, et non la
  // fondamentale du calcul : celle-ci peut être hors du clavier et n'aurait alors jamais sonné.
  const gardes = partiels.filter((p) => {
    const h = noteMidiDeFrequence(p.frequence);
    return Number.isFinite(h) && h >= noteMin && h <= noteMax;
  });
  const reference = gardes.length > 0 ? gardes[0].frequence : 1;
  // Sous cinquante millisecondes une note n'est plus un partiel mais un clic : l'amortissement
  // s'arrête là plutôt que de faire disparaître les rangs hauts d'un spectre très étendu.
  const DUREE_MIN = 0.05;
  const notes: Note[] = [];
  let rang = 0;
  for (const p of gardes) {
    const t = debut + rang * etalement;
    const sienne = decroissance === 0
      ? duree
      : Math.max(DUREE_MIN, duree * Math.pow(p.frequence / reference, -decroissance));
    notes.push({
      note: noteMidiDeFrequence(p.frequence),
      velocite: Math.max(1, Math.round(velocite * Math.min(1, p.amplitude))),
      debut: t,
      fin: t + sienne,
    });
    rang++;
  }
  return notes;
}

/** L'écart au demi-tempéré le plus proche, en cents : ce qu'un spectre ajoute à une gamme. */
export function ecartAuTempere(frequence: number): number {
  const h = noteMidiDeFrequence(frequence);
  return Math.round((h - Math.round(h)) * 100);
}

/** Une ligne lisible par partiel : son rang, sa fréquence, sa hauteur et son écart. */
export function decrirePartiels(partiels: Partiel[]): string {
  return partiels.map((p, i) => {
    const h = noteMidiDeFrequence(p.frequence);
    const ecart = ecartAuTempere(p.frequence);
    const juste = frequenceDeNoteMidi(Math.round(h));
    return `${i + 1}. ${p.frequence.toFixed(2)} Hz · ${h.toFixed(2)} demi-tons · `
      + `${ecart === 0 ? "juste" : `${ecart > 0 ? "+" : "−"}${Math.abs(ecart)} cents`} `
      + `(tempéré ${juste.toFixed(2)} Hz)`;
  }).join("\n");
}
