// audio/soundhelix-voix.ts — Poser un motif sur l'harmonie, ligne par ligne, comme les moteurs de
// séquence de SoundHelix : motif sur l'accord, motifs superposés, accords plaqués, motifs libres.
//
// D'APRÈS SoundHelix 0.9 (Thomas Schürger), réécrit depuis la description de son modèle, sans rien
// en recopier : décision D1 du chantier, 2026-11-28. Comparé note pour note aux rendus du programme
// par `audio/soundhelix-voix.test.ts`.
//
// LA BOUCLE. Le motif se pose depuis le début du morceau, entrée après entrée, en boucle. À chaque
// entrée, l'accord est celui de son PREMIER tic ; une note ne part que si la voix joue à ce tic, et
// sa durée n'est coupée qu'à une reprise du motif, jamais à un changement d'accord ni à la fin de
// l'activité. La reprise remet le motif à son début : à la fin du morceau seulement, à chaque
// section, ou à chaque accord.
//
// LA HAUTEUR. Sur l'accord, un décalage désigne une note de l'accord (`audio/soundhelix-accords.ts`,
// `hauteurSurAccord`) ; libre, il est une hauteur en demi-tons depuis le do central. Les voix
// parallèles ajoutent chacune leur décalage au motif, dans l'espace des décalages : 0, 1, 2 sur
// l'accord font les trois notes de l'accord plaqué.
//
// LA NOTE DE PASSAGE, le joker `+` sur l'accord. Elle part de la basse de l'accord et va vers celle
// de l'accord de la prochaine note du motif, si la voix joue au tic de cette note : à un ton, le
// demi-ton entre les deux ; à un demi-ton ou à l'unisson, la basse même ; au-delà, la première note
// de la gamme de do majeur passé la basse, dans le sens du mouvement. Sans note qui suive dans le
// jeu, la basse. La gamme est la seule de SoundHelix ; la tonalité se choisit à la transposition
// finale (décision D6).

import { type EntreeMotif, ticsDuMotif } from "./soundhelix-motifs";
import { hauteurSurAccord, normaliserAccord } from "./soundhelix-accords";
import { joueAuTic } from "./soundhelix-activite";
import type { HarmonieLue } from "./soundhelix-midi";

export type Reprise = "morceau" | "section" | "accord";

/** Une entrée posée d'une ligne. `hauteur` vaut `null` pour un silence ; `lie` dit la liaison à la suivante. */
export interface EntreeLigne {
  tic: number;
  tics: number;
  hauteur: number | null;
  velocite: number;
  lie: boolean;
}

export interface OptionsLigne {
  harmonie: HarmonieLue;
  motif: readonly EntreeMotif[];
  /** Les segments de la voix, ou `null` pour une voix qui joue tout le morceau. */
  segments: readonly number[] | null;
  libres: boolean;
  normaliser: boolean;
  reprise: Reprise;
  /** Le décalage de cette ligne, ajouté à chaque note du motif : la voix parallèle. */
  parallele: number;
}

const GAMME = [true, false, true, false, true, true, false, true, false, true, false, true];
const dansLaGamme = (p: number) => GAMME[((p % 12) + 12) % 12];

/** La note de passage de l'accord vers le suivant, depuis leurs basses. */
export function noteDePassage(accord: readonly number[], suivant: readonly number[] | null): number {
  let p = accord[0];
  if (!suivant) return p;
  const ecart = suivant[0] - p;
  if (ecart === 0 || Math.abs(ecart) === 1) return p;
  if (Math.abs(ecart) === 2) return (p + suivant[0]) / 2;
  const pas = ecart > 0 ? 1 : -1;
  do p += pas; while (!dansLaGamme(p));
  return p;
}

/** Le premier tic de la prochaine reprise du motif. */
function prochaineReprise(h: HarmonieLue, tic: number, reprise: Reprise): number {
  if (reprise === "section") return h.sections.find((s) => s > tic) ?? h.tics;
  if (reprise === "accord") {
    const a = h.accords.find((c) => c.tic <= tic && tic < c.tic + c.tics);
    return a ? a.tic + a.tics : h.tics;
  }
  return h.tics;
}

const estNote = (e: EntreeMotif) => !e.silence && e.joker === null && e.velocite > 0;

/** Pose une ligne de motif sur tout le morceau. */
export function rendreLigne(o: OptionsLigne): EntreeLigne[] {
  const { harmonie: h, motif } = o;
  const out: EntreeLigne[] = [];
  if (motif.length === 0) return out;
  if (ticsDuMotif(motif) === 0) return out;
  const joue = (t: number) => (o.segments ? joueAuTic(o.segments, t) : t < h.tics);
  const accordDe = (t: number) => {
    const a = h.accordAuTic(t);
    if (!a) return null;
    return o.normaliser && a.length === 3 ? normaliserAccord(a as [number, number, number]) : a;
  };
  let pos = 0;
  let tic = 0;
  let reprise = 0;
  while (tic < h.tics) {
    if (tic >= reprise) { pos = 0; reprise = prochaineReprise(h, tic, o.reprise); }
    const e = motif[pos % motif.length];
    const tics = Math.min(e.tics, reprise - tic);
    const accord = accordDe(tic);
    let hauteur: number | null = null;
    if (tics > 0 && joue(tic) && !e.silence && e.velocite > 0) {
      if (e.joker === "+") {
        let p = pos + 1;
        let t = tic + tics;
        while (t < h.tics && !estNote(motif[p % motif.length])) { t += motif[p % motif.length].tics; p++; }
        const suivant = t < h.tics && joue(t) ? accordDe(t) : null;
        hauteur = accord ? noteDePassage(accord, suivant) : null;
      } else if (e.decalage !== null) {
        const d = e.decalage + o.parallele;
        hauteur = o.libres ? d : accord ? hauteurSurAccord(accord, d) : null;
      }
    }
    if (tics > 0) {
      out.push({ tic, tics, hauteur, velocite: hauteur === null ? 0 : e.velocite, lie: hauteur !== null && e.lie && joue(tic + tics) });
    }
    tic += tics;
    pos++;
  }
  return out;
}

/** La transposition et la vélocité de la piste, appliquées après coup comme SoundHelix le fait. */
export function appliquerPiste(ligne: readonly EntreeLigne[], transposition: number, velocite: number, velociteMax: number): EntreeLigne[] {
  return ligne.map((e) => {
    if (e.hauteur === null) return e;
    const v = velocite === velociteMax ? e.velocite : Math.min(velociteMax, Math.max(1, Math.floor((e.velocite * velocite) / velociteMax)));
    return { ...e, hauteur: e.hauteur + transposition, velocite: v };
  });
}
