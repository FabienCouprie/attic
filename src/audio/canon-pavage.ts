import type { Note } from "./note";
// audio/canon-pavage.ts — Canons rythmiques par pavage.
//
// Un canon ordinaire superpose une mélodie à elle-même, décalée. Un canon par PAVAGE ajoute
// une contrainte d'une sévérité arithmétique : à chaque pulsation du cycle, une voix et une
// seule doit frapper. Jamais deux ensemble, jamais aucune. Le motif et les entrées des voix
// s'emboîtent donc exactement, comme des carreaux qui couvrent le sol sans trou ni
// recouvrement — d'où le nom.
//
// La question remonte aux années 1950 en mathématiques (Hajós, de Bruijn), et Dan Tudor
// Vuza l'a reformulée musicalement en 1991 ; Moreno Andreatta et Emmanuel Amiot l'ont
// implémentée à l'IRCAM dans OpenMusic. Le cas le plus recherché est celui où NI le motif NI
// les entrées ne sont périodiques — un canon de Vuza —, et ces canons-là n'existent qu'à
// partir d'un cycle de 72 pulsations : en deçà, tout pavage a une régularité cachée.
//
// La contrainte est si forte qu'elle sert de test à elle seule : si une pulsation est
// frappée deux fois ou pas du tout, le pavage est faux, et cela se vérifie en comptant.

/** Le nombre de voix frappant chaque pulsation du cycle. Un pavage ne donne que des 1. */
export function couverture(rythme: number[], entrees: number[], n: number): number[] {
  const compte = new Array(n).fill(0);
  for (const e of entrees) {
    for (const r of rythme) compte[(((e + r) % n) + n) % n]++;
  }
  return compte;
}

/** Vrai si chaque pulsation est frappée exactement une fois. */
export function pave(rythme: number[], entrees: number[], n: number): boolean {
  if (rythme.length === 0 || entrees.length === 0) return false;
  if (rythme.length * entrees.length !== n) return false;
  return couverture(rythme, entrees, n).every((c) => c === 1);
}

/**
 * Cherche les entrées de voix qui pavent le cycle avec ce motif.
 *
 * L'algorithme est celui de la couverture exacte, et il est direct : on prend la plus petite
 * pulsation encore libre — quelqu'un doit bien la frapper —, on essaie chaque façon d'y
 * poser une voix, et l'on recommence. Comme la pulsation choisie doit de toute façon être
 * couverte, aucune branche n'est oubliée, et l'énumération reste petite.
 */
export function chercherEntrees(rythme: number[], n: number): number[] | null {
  const motif = [...new Set(rythme.map((r) => ((r % n) + n) % n))].sort((a, b) => a - b);
  if (motif.length === 0 || n % motif.length !== 0) return null;
  const occupe = new Array(n).fill(false);
  const entrees: number[] = [];

  const poser = (decalage: number, valeur: boolean): boolean => {
    const cases = motif.map((r) => (decalage + r) % n);
    if (valeur && cases.some((c) => occupe[c])) return false;
    for (const c of cases) occupe[c] = valeur;
    return true;
  };

  const explorer = (): boolean => {
    const libre = occupe.indexOf(false);
    if (libre === -1) return true;
    for (const r of motif) {
      const decalage = ((libre - r) % n + n) % n;
      if (!poser(decalage, true)) continue;
      entrees.push(decalage);
      if (explorer()) return true;
      entrees.pop();
      poser(decalage, false);
    }
    return false;
  };

  if (!explorer()) return null;
  return entrees.sort((a, b) => a - b);
}

/**
 * Un ensemble est périodique s'il se retrouve identique à lui-même après décalage.
 *
 * C'est ce qui distingue un pavage ordinaire d'un canon de Vuza : le motif { 0, 2, 4 } dans
 * un cycle de six se répète tous les deux temps, et son canon n'est donc qu'un déguisement
 * d'un canon plus simple.
 */
export function estPeriodique(ensemble: number[], n: number): boolean {
  const set = new Set(ensemble.map((x) => ((x % n) + n) % n));
  for (let p = 1; p < n; p++) {
    if (n % p !== 0) continue;
    let identique = true;
    for (const x of set) {
      if (!set.has((x + p) % n)) { identique = false; break; }
    }
    if (identique) return true;
  }
  return false;
}

export interface Canon {
  rythme: number[];
  entrees: number[];
  n: number;
  /** Vrai si ni le motif ni les entrées ne sont périodiques : un canon de Vuza. */
  vuza: boolean;
}

export function construire(rythme: number[], n: number): Canon | null {
  const entrees = chercherEntrees(rythme, n);
  if (!entrees) return null;
  const motif = [...new Set(rythme.map((r) => ((r % n) + n) % n))].sort((a, b) => a - b);
  return {
    rythme: motif,
    entrees,
    n,
    vuza: !estPeriodique(motif, n) && !estPeriodique(entrees, n),
  };
}

/**
 * Cherche des motifs qui pavent, par taille croissante de motif.
 *
 * On n'énumère que les motifs commençant par 0 — décaler un motif décale simplement les
 * entrées et ne donne rien de neuf — et l'on s'arrête au nombre demandé.
 */
export function chercherMotifs(n: number, tailleMotif: number, combien = 5): number[][] {
  if (tailleMotif < 1 || n % tailleMotif !== 0) return [];
  const trouves: number[][] = [];
  const motif = [0];
  const explorer = (depuis: number): void => {
    if (trouves.length >= combien) return;
    if (motif.length === tailleMotif) {
      if (chercherEntrees(motif, n)) trouves.push([...motif]);
      return;
    }
    for (let x = depuis; x < n; x++) {
      motif.push(x);
      explorer(x + 1);
      motif.pop();
      if (trouves.length >= combien) return;
    }
  };
  explorer(1);
  return trouves;
}

/** La grille du canon, une ligne par voix, pour qu'on voie l'emboîtement. */
export function canonEnTexte(canon: Canon): string {
  return canon.entrees.map((e) => {
    const ligne = new Array(canon.n).fill("·");
    for (const r of canon.rythme) ligne[(e + r) % canon.n] = "x";
    return ligne.join("");
  }).join("\n");
}

export type NoteCanon = Note;

/**
 * Écrit le canon en notes : une voix par entrée, chacune sur sa propre hauteur.
 *
 * Donner une hauteur différente à chaque voix est ce qui rend le pavage AUDIBLE : sinon on
 * entend une pulsation régulière, ce qu'est justement tout canon par pavage, et l'on
 * n'entend pas qu'elle est partagée.
 */
export function canonEnNotes(
  canon: Canon, dureePas: number, hauteurs: number[], repetitions: number, velocite = 90,
): NoteCanon[] {
  const notes: NoteCanon[] = [];
  for (let tour = 0; tour < Math.max(1, repetitions); tour++) {
    canon.entrees.forEach((e, voix) => {
      const note = hauteurs[voix % hauteurs.length];
      for (const r of canon.rythme) {
        const pas = tour * canon.n + ((e + r) % canon.n);
        notes.push({
          note,
          velocite,
          debut: pas * dureePas,
          fin: pas * dureePas + dureePas * 0.9,
        });
      }
    });
  }
  return notes.sort((a, b) => a.debut - b.debut || a.note - b.note);
}
