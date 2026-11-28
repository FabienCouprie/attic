// audio/soundhelix-motifs.ts — La grammaire des motifs de SoundHelix : ce qu'une chaîne comme
// « 0/2,-,E(3,8,0:800,-),(0,2)*2,(1,-)+12 » veut dire, entrée par entrée.
//
// D'APRÈS SoundHelix 0.9 (Thomas Schürger), dont le modèle est réécrit ici depuis sa description,
// sans rien en recopier : décision D1 du chantier, 2026-11-28.
//
// TROIS ÉTAPES, DANS CET ORDRE, ET L'ORDRE COMPTE :
//   1. les fonctions : `E(impulsions,pas,note,silence)` devient la liste de ses pas, la note sur
//      chaque impulsion et le silence ailleurs. Un seul passage, de gauche à droite : un appel
//      imbriqué n'est pas lu, et un nom de fonction inconnu reste tel quel ;
//   2. les groupes : `(x)*n` répète x n fois, `(x)+d` et `(x)-d` transposent de d le premier
//      nombre de chaque entrée de x. Le groupe le plus intérieur d'abord, jusqu'à ce qu'il n'en
//      reste aucun ; une parenthèse qui reste est une faute ;
//   3. les entrées, séparées par des virgules : `décalage[~][/tics][:vélocité]`. Le silence est
//      `-`, un joker est un caractère seul que le moteur déclare (`+` pour une note de passage,
//      `#`, `*` pour la mélodie), `~` lie la note à la suivante.
//
// LA VÉLOCITÉ VIENT EN DERNIER. `0/2:600` est une note de deux tics à 600 ; `0:600/2` ne se lit
// pas, et SoundHelix lève dessus. Relevé sur le programme le 2026-11-28, en écrivant les essais.
//
// LES TICS D'UN MOTIF peuvent se compter sur une autre résolution que celle du morceau : un motif
// écrit à 4 tics par temps, posé sur un morceau à 12, voit chaque durée triplée. Une durée qui ne
// tombe pas juste sur la grille du morceau est refusée.

import { motifEuclidien } from "./euclidien";

/** Une entrée de motif. `decalage` vaut `null` pour un silence et pour un joker. */
export interface EntreeMotif {
  decalage: number | null;
  /** Le caractère du joker, ou `null` pour une note ou un silence. */
  joker: string | null;
  silence: boolean;
  tics: number;
  velocite: number;
  lie: boolean;
}

/** Une faute de motif, qui nomme ce qu'elle n'a pas su lire, en français et en anglais. */
export class FauteMotif extends Error {
  readonly en: string;
  constructor(message: string, en: string) {
    super(message);
    this.en = en;
  }
}

const FONCTION = /([0-9A-Za-z]+)\(((?:[^,)]*,)*[^,)]*)\)/g;
const GROUPE = /\(([^()]+)\)([*+-])(\d+)/g;
const PREMIER_NOMBRE = /(?<=^|,)(-?\d+)/g;
const ENTIER = /^-?\d+$/;

/** Évalue les fonctions du motif, en un seul passage. Seule `E` est connue. */
export function evaluerFonctions(texte: string): string {
  return texte.replace(FONCTION, (tout, nom: string, arguments_: string) => {
    if (nom !== "E") return tout;
    // Comme un découpage qui jette les morceaux vides de la fin.
    const parties = arguments_.split(",");
    while (parties.length > 0 && parties[parties.length - 1] === "") parties.pop();
    if (parties.length !== 4) {
      throw new FauteMotif(`E() attend quatre arguments : « ${tout} »`, `E() takes four arguments: « ${tout} »`);
    }
    const [p, s, note, silence] = parties;
    if (!ENTIER.test(p) || !ENTIER.test(s)) {
      throw new FauteMotif(`E() attend deux entiers : « ${tout} »`, `E() takes two integers: « ${tout} »`);
    }
    const impulsions = Number(p);
    const pas = Number(s);
    if (pas <= 0 || impulsions < 0 || impulsions > pas) {
      throw new FauteMotif(`E() : ${impulsions} impulsions sur ${pas} pas ne se répartissent pas`,
        `E(): ${impulsions} pulses cannot be spread over ${pas} steps`);
    }
    return motifEuclidien(pas, impulsions).map((frappe) => (frappe ? note : silence)).join(",");
  });
}

/** Transpose de `delta` le premier nombre de chaque entrée. Les silences et les jokers restent. */
export function transposerMotif(texte: string, delta: number): string {
  if (delta === 0) return texte;
  return texte.replace(PREMIER_NOMBRE, (n) => String(Number(n) + delta));
}

/** Déplie les groupes `(x)*n`, `(x)+d`, `(x)-d`, du plus intérieur au plus extérieur. */
export function deplierMotif(texte: string): string {
  let courant = texte;
  for (;;) {
    let trouve = false;
    const suivant = courant.replace(GROUPE, (_tout, corps: string, signe: string, n: string) => {
      trouve = true;
      const k = Number(n);
      if (signe === "*") return Array.from({ length: k }, () => corps).join(",");
      return transposerMotif(corps, signe === "+" ? k : -k);
    });
    if (!trouve) {
      if (/[()]/.test(courant)) {
        throw new FauteMotif(`parenthèse sans groupe lisible : « ${courant} »`, `parenthesis without a readable group: « ${courant} »`);
      }
      return courant;
    }
    courant = suivant;
  }
}

export interface OptionsMotif {
  /** Les caractères que le moteur lit comme jokers : « + » pour une note de passage. */
  jokers?: string;
  /** La vélocité d'une entrée qui n'en écrit pas, la plus forte du morceau. */
  velociteMax: number;
  /** La résolution du morceau. */
  ticsParTemps: number;
  /** La résolution dans laquelle le motif est écrit, quand elle diffère de celle du morceau. */
  ticsParTempsMotif?: number;
}

/** Lit une entrée déjà dépliée. */
function lireEntree(brut: string, o: OptionsMotif): EntreeMotif {
  let reste = brut;
  let velocite = o.velociteMax;
  const deuxPoints = reste.lastIndexOf(":");
  if (deuxPoints >= 0) {
    const v = reste.slice(deuxPoints + 1);
    if (!ENTIER.test(v)) throw new FauteMotif(`vélocité illisible dans « ${brut} »`, `unreadable velocity in « ${brut} »`);
    velocite = Number(v);
    reste = reste.slice(0, deuxPoints);
  }
  let tics = 1;
  const barre = reste.indexOf("/");
  if (barre >= 0) {
    const t = reste.slice(barre + 1);
    if (!/^\d+$/.test(t)) throw new FauteMotif(`durée illisible dans « ${brut} »`, `unreadable length in « ${brut} »`);
    tics = Number(t);
    reste = reste.slice(0, barre);
  }
  const lie = reste.endsWith("~");
  if (lie) reste = reste.slice(0, -1);
  if (o.ticsParTempsMotif !== undefined && o.ticsParTempsMotif !== o.ticsParTemps) {
    const produit = tics * o.ticsParTemps;
    if (produit % o.ticsParTempsMotif !== 0) {
      throw new FauteMotif(`« ${brut} » ne tombe pas sur la grille de ${o.ticsParTemps} tics par temps`,
        `« ${brut} » does not fall on the grid of ${o.ticsParTemps} ticks per beat`);
    }
    tics = produit / o.ticsParTempsMotif;
  }
  if (reste === "-") return { decalage: null, joker: null, silence: true, tics, velocite, lie: false };
  if (reste.length === 1 && (o.jokers ?? "").includes(reste)) {
    return { decalage: null, joker: reste, silence: false, tics, velocite, lie };
  }
  if (!ENTIER.test(reste)) throw new FauteMotif(`entrée illisible : « ${brut} »`, `unreadable entry: « ${brut} »`);
  return { decalage: Number(reste), joker: null, silence: false, tics, velocite, lie };
}

/** Lit un motif entier : fonctions, groupes, puis chaque entrée. Un motif vide n'a aucune entrée. */
export function lireMotif(texte: string, o: OptionsMotif): EntreeMotif[] {
  const deplie = deplierMotif(evaluerFonctions(texte.trim()));
  if (deplie === "") return [];
  return deplie.split(",").map((e) => lireEntree(e.trim(), o));
}

/** La longueur d'un motif, en tics. */
export const ticsDuMotif = (motif: readonly EntreeMotif[]): number => motif.reduce((t, e) => t + e.tics, 0);
