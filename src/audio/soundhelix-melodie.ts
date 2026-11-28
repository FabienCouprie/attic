// audio/soundhelix-melodie.ts — La mélodie de SoundHelix : une marche au hasard sur la gamme et sur
// l'accord, tirée une fois pour chaque sorte de section et reprise à chaque retour de la section.
//
// D'APRÈS SoundHelix 0.9 (Thomas Schürger), réécrit depuis la description de son modèle, sans rien en
// recopier : décision D1 du chantier, 2026-11-28. Le tirage n'est pas celui du programme ; ce qu'il
// garantit est éprouvé par la loi dans `audio/soundhelix-melodie.test.ts`.
//
// LA SECTION ET SES RETOURS. Deux sections qui portent les mêmes accords aux mêmes durées sont de la
// même sorte. La k-ième sorte rencontrée reçoit autant de mélodies que le k-ième nombre de
// « Mélodies par section », la liste reprise en boucle ; ses retours les jouent à tour de rôle. C'est
// la répétition avec variation : le refrain revient avec sa mélodie, ou l'une des siennes.
//
// LA MARCHE. Le motif donne le rythme, repris au début de chaque section. `+` avance d'un pas tiré
// dans « Pas », en degrés de la gamme de do majeur ; `#` et un décalage écrit avancent d'un pas parmi
// les notes de l'accord du moment ; `*` répète la note d'avant. La marche reste entre la hauteur
// minimale et la maximale : un pas qui en sortirait se tire à nouveau, et après vingt essais il se
// fait vers l'intérieur. La première note de chaque mélodie est une note de l'accord tirée dans la
// plage.
//
// UN ÉCART VOULU : chez SoundHelix, `*` se tait quand la note d'avant n'est plus dans l'accord (relevé
// dans le source, `modele-soundhelix.md` § 8). Ici elle se répète toujours : le silence venait d'une
// note perdue, non d'un choix du motif.

import { type EntreeMotif } from "./soundhelix-motifs";
import { degresDeGamme } from "./gammes";
import { normaliserAccord } from "./soundhelix-accords";
import { joueAuTic } from "./soundhelix-activite";
import type { HarmonieLue } from "./soundhelix-midi";
import type { EntreeLigne } from "./soundhelix-voix";

/** La seule gamme de SoundHelix, do majeur : la tonalité se choisit à la transposition finale (D6). */
const GAMME = degresDeGamme("majeur");
const dansLaGamme = (p: number) => GAMME.includes(((p % 12) + 12) % 12);

/** Les notes de la gamme de do majeur entre deux hauteurs, bornes comprises. */
export function notesDeGamme(min: number, max: number): number[] {
  const out: number[] = [];
  for (let p = min; p <= max; p++) if (dansLaGamme(p)) out.push(p);
  return out;
}

/** Les notes d'un accord, à toutes les octaves, entre deux hauteurs. */
export function notesDAccord(accord: readonly number[], min: number, max: number): number[] {
  const classes = new Set(accord.map((p) => ((p % 12) + 12) % 12));
  const out: number[] = [];
  for (let p = min; p <= max; p++) if (classes.has(((p % 12) + 12) % 12)) out.push(p);
  return out;
}

export interface OptionsMelodie {
  harmonie: HarmonieLue;
  motif: readonly EntreeMotif[];
  segments: readonly number[] | null;
  melodiesParSection: readonly number[];
  min: number;
  max: number;
  pas: readonly number[];
  aleatoire: () => number;
}

/** Une étendue de section : son début, sa fin, et la clé de sa sorte. */
interface SectionDuMorceau { debut: number; fin: number; sorte: string }

/** Les sections, chacune marquée de la sorte que ses accords disent. */
export function sectionsDuMorceau(h: HarmonieLue): SectionDuMorceau[] {
  return h.sections.map((debut, k) => {
    const fin = h.sections[k + 1] ?? h.tics;
    const accords: string[] = [];
    for (const a of h.accords) {
      const de = Math.max(a.tic, debut);
      const a2 = Math.min(a.tic + a.tics, fin);
      if (a2 > de) accords.push(`${de - debut}:${a2 - de}:${a.hauteurs.join(".")}`);
    }
    return { debut, fin, sorte: `${fin - debut}|${accords.join(",")}` };
  });
}

/** Une mélodie posée sur une section, dès son début, en tics du morceau. */
function tirerMelodie(o: OptionsMelodie, s: SectionDuMorceau): { tic: number; tics: number; hauteur: number | null; velocite: number; lie: boolean }[] {
  const h = o.harmonie;
  const accordDe = (t: number) => {
    const a = h.accordAuTic(t) ?? [];
    return a.length === 3 ? normaliserAccord(a as readonly [number, number, number]) : a;
  };
  const tirer = <T>(l: readonly T[]) => l[Math.floor(o.aleatoire() * l.length)];
  const gamme = notesDeGamme(o.min, o.max);
  // Un pas dans une liste de notes, depuis la note la plus proche de la note courante.
  const marcher = (liste: readonly number[], depuis: number): number => {
    if (liste.length === 0) return depuis;
    let i = 0;
    for (let k = 1; k < liste.length; k++) if (Math.abs(liste[k] - depuis) < Math.abs(liste[i] - depuis)) i = k;
    for (let essai = 0; essai < 20; essai++) {
      const j = i + tirer(o.pas);
      if (j >= 0 && j < liste.length) return liste[j];
    }
    return liste[Math.max(0, Math.min(liste.length - 1, i + (i < liste.length / 2 ? 1 : -1)))];
  };
  const out: { tic: number; tics: number; hauteur: number | null; velocite: number; lie: boolean }[] = [];
  let courante: number | null = null;
  let pos = 0;
  for (let t = s.debut; t < s.fin; pos++) {
    const e = o.motif[pos % o.motif.length];
    const tics = Math.min(e.tics, s.fin - t);
    let hauteur: number | null = null;
    if (!e.silence && e.velocite > 0) {
      const accord = notesDAccord(accordDe(t), o.min, o.max);
      if (courante === null) hauteur = accord.length ? tirer(accord) : tirer(gamme);
      else if (e.joker === "*") hauteur = courante;
      else if (e.joker === "+") hauteur = marcher(gamme, courante);
      else hauteur = marcher(accord.length ? accord : gamme, courante);
      courante = hauteur;
    }
    out.push({ tic: t, tics, hauteur, velocite: hauteur === null ? 0 : e.velocite, lie: e.lie && hauteur !== null });
    t += tics;
  }
  return out;
}

/** Pose la mélodie sur tout le morceau. */
export function rendreMelodie(o: OptionsMelodie): EntreeLigne[] {
  if (o.motif.length === 0 || o.motif.every((e) => e.tics === 0) || o.melodiesParSection.length === 0) return [];
  const joue = (t: number) => (o.segments ? joueAuTic(o.segments, t) : t < o.harmonie.tics);
  const melodies = new Map<string, ReturnType<typeof tirerMelodie>[]>();
  const nombres = new Map<string, number>();
  const retours = new Map<string, number>();
  const out: EntreeLigne[] = [];
  for (const s of sectionsDuMorceau(o.harmonie)) {
    if (!nombres.has(s.sorte)) nombres.set(s.sorte, Math.max(1, o.melodiesParSection[nombres.size % o.melodiesParSection.length]));
    const k = retours.get(s.sorte) ?? 0;
    retours.set(s.sorte, k + 1);
    const deLaSorte = melodies.get(s.sorte) ?? [];
    melodies.set(s.sorte, deLaSorte);
    const rang = k % nombres.get(s.sorte)!;
    // Tirée sur la première section qui la joue, elle se garde en tics relatifs : deux sections de
    // la même sorte portent les mêmes accords aux mêmes places.
    if (!deLaSorte[rang]) deLaSorte[rang] = tirerMelodie(o, s).map((e) => ({ ...e, tic: e.tic - s.debut }));
    for (const e of deLaSorte[rang]) {
      const tic = s.debut + e.tic;
      const hauteur = e.hauteur !== null && joue(tic) ? e.hauteur : null;
      out.push({ tic, tics: e.tics, hauteur, velocite: hauteur === null ? 0 : e.velocite, lie: hauteur !== null && e.lie && joue(tic + e.tics) });
    }
  }
  return out;
}
