// audio/gamme-banc-proprietes.ts — Ce qu'un nœud à gamme doit tenir, mesuré sur ce qu'il a rendu.
//
// LES DEGRÉS ATTENDUS VIENNENT DE LA TABLE, JAMAIS DE `degresDeGamme` : son repli vers le majeur
// ferait passer pour juste un nœud qui, ayant perdu sa gamme, joue le majeur sous un identifiant
// inconnu. L'appelant passe des degrés qu'il a lui-même affirmés définis.
//
// QUATRE PROPRIÉTÉS, chacune sur une sortie et un canal :
//  P1, appartenance : chaque hauteur est un degré de la gamme, comptée depuis la tonique, au cent près ;
//  P2, couverture : sur plusieurs graines, chaque degré se fait entendre ;
//  P3, la clé transpose : rendu un demi-ton plus haut, la sortie garde ses notes, ses attaques et ses
//      durées, et chaque classe monte d'un demi-ton. UN DEMI-TON, ET NON TROIS : les deux gammes
//      diminuées reviennent sur elles-mêmes à trois demi-tons, et un nœud qui perdrait la clé y passerait
//      en mi bémol contre do ; aucune gamme ne revient sur elle-même à un demi-ton ;
//  P4, accords sur les degrés : un accord plaqué vaut la triade de la gamme sur sa fondamentale,
//      degrés k, k+2 et k+4, septième k+6 admise. Elle ne se juge que sur une gamme à sept degrés ;
//      sur les autres, la règle reste à décider, et les accords sont seulement nommés.

import type { HauteurRendue, SortieLue } from "./gamme-banc-hauteurs";

/**
 * La tolérance d'appartenance, en demi-tons : un cent pour une hauteur écrite, MIDI, séquence ou
 * texte. Une hauteur mesurée dans le son passe une tolérance plus large, celle de son instrument.
 */
export const UN_CENT = 0.01;

/** Une classe de hauteur, en demi-tons fractionnaires depuis la tonique, dans [0, 12). */
export const classe = (note: number, tonique: number) => (((note - tonique) % 12) + 12) % 12;

/** L'écart, en demi-tons, d'une classe au degré le plus proche de la gamme, octave repliée. */
function ecartAuDegre(c: number, degres: readonly number[]): number {
  let min = Infinity;
  for (const d of degres) { const e = Math.abs(c - d); min = Math.min(min, e, 12 - e); }
  return min;
}

/** P1 : les hauteurs hors de la gamme, et le compte des hauteurs lues. */
export function horsDeLaGamme(h: readonly HauteurRendue[], degres: readonly number[], tonique: number, tolerance = UN_CENT): HauteurRendue[] {
  return h.filter((x) => ecartAuDegre(classe(x.note, tonique), degres) > tolerance);
}

/** Les degrés entendus, par leur rang dans la gamme, et combien de fois chacun. */
export function degresEntendus(h: readonly HauteurRendue[], degres: readonly number[], tonique: number, tolerance = UN_CENT): Map<number, number> {
  const compte = new Map<number, number>();
  for (const x of h) {
    const c = classe(x.note, tonique);
    const i = degres.findIndex((d) => Math.min(Math.abs(c - d), 12 - Math.abs(c - d)) <= tolerance);
    if (i >= 0) compte.set(i, (compte.get(i) ?? 0) + 1);
  }
  return compte;
}

/** P2 : les degrés jamais entendus, et combien de fois revient le plus rare de ceux qui le sont. */
export function couverture(h: readonly HauteurRendue[], degres: readonly number[], tonique: number, tolerance = UN_CENT): { manquants: number[]; plusRare: number } {
  const compte = degresEntendus(h, degres, tonique, tolerance);
  const manquants = degres.map((_, i) => i).filter((i) => !compte.has(i));
  return { manquants, plusRare: compte.size ? Math.min(...compte.values()) : 0 };
}

/** La tonique sous laquelle des hauteurs tiennent le mieux dans la gamme, quand le nœud n'en dit rien. */
export function toniqueInferee(h: readonly HauteurRendue[], degres: readonly number[]): number {
  let meilleure = 0, moins = Infinity;
  for (let t = 0; t < 12; t++) {
    const n = horsDeLaGamme(h, degres, t).length;
    if (n < moins) { moins = n; meilleure = t; }
  }
  return meilleure;
}

const memeTemps = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/**
 * P3 : la sortie rendue un demi-ton plus haut garde ses notes, ses attaques et ses durées, et chaque
 * classe monte d'un demi-ton. Rend la raison du premier écart, ou `null`, et les écarts en demi-tons
 * relevés note à note, qu'un ambitus borné ou replié peut faire différer d'un demi-ton.
 */
export function transposition(bas: SortieLue, haut: SortieLue, pas = 1, tolerance = UN_CENT): { raison: string | null; ecarts: Map<number, number> } {
  const ecarts = new Map<number, number>();
  if (bas.hauteurs.length !== haut.hauteurs.length) return { raison: `${bas.hauteurs.length} notes contre ${haut.hauteurs.length}`, ecarts };
  for (const [i, a] of bas.hauteurs.entries()) {
    const b = haut.hauteurs[i];
    if (!memeTemps(a.debut, b.debut) || !memeTemps(a.fin, b.fin)) return { raison: `note ${i} : attaque ou durée changée (${a.debut.toFixed(3)} s contre ${b.debut.toFixed(3)} s)`, ecarts };
    const e = Math.round((b.note - a.note) * 100) / 100;
    ecarts.set(e, (ecarts.get(e) ?? 0) + 1);
    const d = Math.abs(classe(b.note - a.note, 0) - classe(pas, 0));
    if (Math.min(d, 12 - d) > tolerance) return { raison: `note ${i} : ${a.note} devient ${b.note}`, ecarts };
  }
  return { raison: null, ecarts };
}

/** Le nom d'un accord par ses intervalles depuis la fondamentale, pour qu'on le lise. */
export function nomAccord(intervalles: readonly number[]): string {
  const s = [...new Set(intervalles.map((x) => ((Math.round(x) % 12) + 12) % 12))].sort((a, b) => a - b).join(",");
  const NOMS: Record<string, string> = {
    "0,4,7": "majeur", "0,3,7": "mineur", "0,3,6": "diminué", "0,4,8": "augmenté",
    "0,5,7": "sus4", "0,2,7": "sus2", "0,4,7,11": "majeur 7", "0,4,7,10": "septième", "0,3,7,10": "mineur 7",
    "0,3,6,10": "demi-diminué", "0,3,6,9": "diminué 7", "0,3,7,11": "mineur majeur 7", "0,4,8,11": "augmenté majeur 7",
    "0,4,6": "majeur quinte diminuée", "0,3,8": "mineur quinte augmentée",
  };
  return NOMS[s] ?? `{${s}}`;
}

/** Un accord plaqué que la gamme n'aurait pas bâti, et ce qu'elle aurait bâti à sa place. */
export interface AccordFautif { debut: number; fondamentale: number; joue: string; attendu: string }

/**
 * La fenêtre d'une attaque groupée : un accord dont les notes partent à quelques millisecondes d'écart,
 * humanisé ou égrené, reste un accord. Le Générateur d'accords n'en montrait aucun sous une
 * simultanéité exacte, pour cent soixante notes jouées.
 */
const FENETRE_ACCORD = 0.06;

/**
 * P4 : les accords plaqués, au moins trois classes attaquées dans la même fenêtre, comparés à la
 * triade que la gamme bâtit sur leur fondamentale. La fondamentale est la note la plus grave.
 */
export function accordsSurLesDegres(h: readonly HauteurRendue[], degres: readonly number[], tonique: number): { accords: number; fautifs: AccordFautif[]; nommes: Map<string, number> } {
  const groupes: HauteurRendue[][] = [];
  for (const x of h) {
    const g = groupes.find((y) => Math.abs(y[0].debut - x.debut) <= FENETRE_ACCORD);
    if (g) g.push(x); else groupes.push([x]);
  }
  const fautifs: AccordFautif[] = [];
  const nommes = new Map<string, number>();
  let accords = 0;
  for (const g of groupes) {
    const classes = [...new Set(g.map((x) => Math.round(classe(x.note, tonique) * 100) / 100))];
    if (classes.length < 3) continue;
    accords++;
    const grave = Math.min(...g.map((x) => x.note));
    const racine = classe(grave, tonique);
    const joue = nomAccord(classes.map((c) => c - racine));
    nommes.set(joue, (nommes.get(joue) ?? 0) + 1);
    if (degres.length !== 7) continue;
    const k = degres.findIndex((d) => Math.abs(d - racine) <= UN_CENT);
    if (k < 0) { fautifs.push({ debut: g[0].debut, fondamentale: grave, joue, attendu: "fondamentale hors de la gamme" }); continue; }
    const triade = [0, 2, 4].map((p) => degres[(k + p) % 7]);
    const septieme = degres[(k + 6) % 7];
    const permises = new Set([...triade, septieme]);
    const tient = triade.every((d) => classes.includes(d)) && classes.every((c) => permises.has(c));
    if (!tient) fautifs.push({ debut: g[0].debut, fondamentale: grave, joue, attendu: nomAccord(triade.map((d) => d - racine)) });
  }
  return { accords, fautifs, nommes };
}

/** La part des notes sur la tonique, et la part de celles sur une classe donnée. */
export function partDeClasses(h: readonly HauteurRendue[], classes: readonly number[], tonique: number): number {
  if (h.length === 0) return 0;
  return h.filter((x) => classes.some((c) => Math.abs(classe(x.note, tonique) - c) <= UN_CENT)).length / h.length;
}
