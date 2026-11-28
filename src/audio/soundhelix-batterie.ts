// audio/soundhelix-batterie.ts — La batterie de SoundHelix : une ligne par percussion, chacune sous sa
// voix d'activité, et les motifs conditionnels qui s'écrivent avant les frontières de section.
//
// D'APRÈS SoundHelix 0.9 (Thomas Schürger), réécrit depuis la description de son modèle et le relevé
// de l'essai de batterie, sans rien en recopier : décision D1 du chantier, 2026-11-28. Comparé note
// pour note au programme par `audio/soundhelix-batterie.test.ts`, à la probabilité 100.
//
// LA LIGNE. Le motif se pose depuis le début du morceau, en boucle ; un décalage s'ajoute à la hauteur
// de la percussion, 0 la joue telle quelle. Une note ne part que si la voix de la ligne joue à ce tic.
//
// LE MOTIF CONDITIONNEL, relevé sur l'essai, quatre motifs à la probabilité 100 :
//   · il s'écrit dans les tics qui précèdent une frontière de section, autant que sa longueur ;
//   · « Avant » se juge sur chaque section que ces tics couvrent, « Après » sur la section qui
//     commence ; `+voix` y veut la voix jouant, `-voix` la voix muette, et une condition vide est
//     toujours tenue : la cymbale de l'essai frappe au dernier tic avant 192, 256, 320 et 640, les
//     quatre frontières où grosse caisse et caisse claire jouent ensuite ;
//   · il ne consulte pas l'activité de la ligne visée : le crescendo de grosse caisse de l'essai
//     sonne de 118 à 127, quand la grosse caisse se tait encore ;
//   · « Remplacer » retire les notes des percussions visées qui partent dans ces tics, et raccourcit
//     celles qui y entrent ; « Ajouter » les garde. Le roulement de caisse claire remplace ainsi ses
//     frappes de 176 à 191.
// CE QUE L'ESSAI NE DIT PAS, et qui est choisi : les notes du motif se posent sur la première
// percussion visée, les suivantes n'étant que vidées ; une note qui entre dans la fenêtre sans y
// partir est raccourcie à son bord.

import { FauteMotif, type EntreeMotif } from "./soundhelix-motifs";
import { joueAuTic, type VoixActivite } from "./soundhelix-activite";

/** Une note de batterie : son tic, sa durée, sa hauteur MIDI, sa vélocité sur 1000. */
export interface NoteBatterie { tic: number; tics: number; hauteur: number; velocite: number }

export interface LigneBatterie {
  hauteur: number;
  motif: readonly EntreeMotif[];
  /** Les segments de sa voix, ou `null` pour une ligne qui joue tout le morceau. */
  segments: readonly number[] | null;
}

/** Pose chaque ligne sur tout le morceau. */
export function rendreBatterie(lignes: readonly LigneBatterie[], tics: number): NoteBatterie[] {
  const out: NoteBatterie[] = [];
  for (const l of lignes) {
    if (l.motif.length === 0 || l.motif.every((e) => e.tics === 0)) continue;
    let t = 0;
    for (let pos = 0; t < tics; pos++) {
      const e = l.motif[pos % l.motif.length];
      const joue = l.segments ? joueAuTic(l.segments, t) : true;
      if (joue && !e.silence && e.decalage !== null && e.velocite > 0 && e.tics > 0) {
        out.push({ tic: t, tics: Math.min(e.tics, tics - t), hauteur: l.hauteur + e.decalage, velocite: e.velocite });
      }
      t += e.tics;
    }
  }
  return trier(out);
}

const trier = (n: NoteBatterie[]) => n.sort((a, b) => a.tic - b.tic || a.hauteur - b.hauteur);

/** Une condition : une voix de la matrice, jouant ou muette. */
export interface Condition { voix: string; joue: boolean }

/** Lit `+grosse_caisse,-charleston` ; un texte vide ne pose aucune condition. */
export function lireConditions(texte: string): Condition[] {
  return texte.split(",").map((s) => s.trim()).filter((s) => s !== "").map((s) => {
    const m = /^([+-])(\S+)$/.exec(s);
    if (!m) throw new FauteMotif(`condition illisible : « ${s} »`, `unreadable condition: « ${s} »`);
    return { voix: m[2], joue: m[1] === "+" };
  });
}

export interface OptionsConditionnel {
  notes: readonly NoteBatterie[];
  sections: readonly number[];
  tics: number;
  matrice: readonly VoixActivite[];
  motif: readonly EntreeMotif[];
  cibles: readonly number[];
  avant: readonly Condition[];
  apres: readonly Condition[];
  remplacer: boolean;
  /** De 0 à 100. */
  probabilite: number;
  aleatoire: () => number;
}

/** Les frontières où le motif s'écrit. */
export function frontieresTenues(o: Omit<OptionsConditionnel, "notes" | "cibles" | "remplacer" | "aleatoire" | "probabilite">): number[] {
  const longueur = o.motif.reduce((s, e) => s + e.tics, 0);
  const tient = (c: Condition, section: number) => {
    const v = o.matrice.find((x) => x.nom === c.voix);
    return (v?.sections[section] ?? false) === c.joue;
  };
  const out: number[] = [];
  for (let s = 1; s < o.sections.length; s++) {
    const b = o.sections[s];
    if (b - longueur < 0 || longueur === 0) continue;
    const couvertes: number[] = [];
    for (let k = 0; k < s; k++) {
      const fin = o.sections[k + 1] ?? o.tics;
      if (fin > b - longueur && o.sections[k] < b) couvertes.push(k);
    }
    if (o.apres.every((c) => tient(c, s)) && couvertes.every((k) => o.avant.every((c) => tient(c, k)))) out.push(b);
  }
  return out;
}

/** Écrit le motif conditionnel à chaque frontière tenue, à la probabilité dite. */
export function appliquerConditionnel(o: OptionsConditionnel): { notes: NoteBatterie[]; poses: number } {
  const longueur = o.motif.reduce((s, e) => s + e.tics, 0);
  let notes = [...o.notes];
  let poses = 0;
  for (const b of frontieresTenues(o)) {
    if (o.aleatoire() * 100 >= o.probabilite) continue;
    poses++;
    const debut = b - longueur;
    if (o.remplacer) {
      notes = notes.flatMap((n) => {
        if (!o.cibles.includes(n.hauteur)) return [n];
        if (n.tic >= debut && n.tic < b) return [];
        if (n.tic < debut && n.tic + n.tics > debut) return [{ ...n, tics: debut - n.tic }];
        return [n];
      });
    }
    let t = debut;
    for (const e of o.motif) {
      if (!e.silence && e.decalage !== null && e.velocite > 0 && e.tics > 0 && o.cibles.length > 0) {
        notes.push({ tic: t, tics: e.tics, hauteur: o.cibles[0] + e.decalage, velocite: e.velocite });
      }
      t += e.tics;
    }
  }
  return { notes: trier(notes), poses };
}

/**
 * Le groove : la durée relative de chaque pas de la grille, en boucle, appliquée au minutage. Un pas
 * vaut `pas` tics du fichier ; le tic `t` tombe à la somme des durées des pas qui le précèdent, plus
 * sa part du sien, le tout ramené à la durée moyenne pour que la mesure garde sa longueur.
 */
export function placerAuGroove(t: number, pas: number, groove: readonly number[]): number {
  const n = groove.length;
  const moyenne = groove.reduce((s, g) => s + g, 0) / n;
  const k = Math.floor(t / pas);
  const reste = t - k * pas;
  const tours = Math.floor(k / n);
  let somme = tours * n * moyenne;
  for (let i = tours * n; i < k; i++) somme += groove[i % n];
  somme += (reste / pas) * groove[k % n];
  return Math.round((somme / moyenne) * pas);
}
