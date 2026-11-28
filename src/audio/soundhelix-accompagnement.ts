// audio/soundhelix-accompagnement.ts — L'arpège et la nappe de SoundHelix : deux voix qui suivent
// l'harmonie accord par accord plutôt qu'un motif en boucle sur tout le morceau.
//
// D'APRÈS SoundHelix 0.9 (Thomas Schürger), réécrit depuis la description de son modèle et le relevé
// des témoins du banc, sans rien en recopier : décision D1 du chantier, 2026-11-28. Comparé note pour
// note aux rendus du programme par `audio/soundhelix-accompagnement.test.ts`.
//
// L'ARPÈGE. À chaque accord, le motif le plus court qui en couvre la durée, et le plus long quand
// aucun ne la couvre ; posé depuis le début de l'accord, repris en boucle au besoin, coupé à sa fin.
// Relevé sur l'essai d'accords : un accord de 6 tics prend le motif de 8, coupé ; un accord de 32
// prend celui de 16, deux fois ; un accord de 24 le prend une fois et demie.
//
// LA NAPPE. Une ligne par décalage, chacune tenant une note de l'accord tout l'accord. Sans
// « Rejouer chaque accord », une hauteur commune à deux accords qui se suivent continue de sonner dans
// sa ligne, et les hauteurs neuves vont, dans l'ordre des décalages, aux lignes que l'accord neuf a
// libérées : relevé sur la nappe de l'essai d'accords, où la ligne qui tient le si bémol de
// l'accord augmenté le garde sous l'accord diminué, dont il n'est pas la basse. Seule de ces voix, la
// nappe coupe ses notes aux bords de l'activité, et les commence à son entrée.
//
// LA SECTION. « Couper à la section » traite un début de section comme un changement d'accord, pour
// l'accord qu'une fusion a fait courir par-dessus la frontière.

import { type EntreeMotif, ticsDuMotif } from "./soundhelix-motifs";
import { hauteurSurAccord, normaliserAccord } from "./soundhelix-accords";
import { joueAuTic } from "./soundhelix-activite";
import type { HarmonieLue } from "./soundhelix-midi";
import type { EntreeLigne } from "./soundhelix-voix";

/** Une étendue d'accord : son tic, sa durée, ses hauteurs telles que la voix les lit. */
export interface Etendue {
  tic: number;
  tics: number;
  hauteurs: readonly number[];
}

/** Les accords du morceau, normalisés au besoin, coupés aux débuts de section au besoin. */
export function etenduesDAccord(h: HarmonieLue, normaliser: boolean, couperALaSection: boolean): Etendue[] {
  const out: Etendue[] = [];
  for (const a of h.accords) {
    const hauteurs = normaliser && a.hauteurs.length === 3
      ? normaliserAccord(a.hauteurs as readonly [number, number, number]) : a.hauteurs;
    const fin = Math.min(h.tics, a.tic + a.tics);
    const coupes = couperALaSection ? h.sections.filter((s) => s > a.tic && s < fin) : [];
    let debut = a.tic;
    for (const c of [...coupes, fin]) {
      if (c > debut) out.push({ tic: debut, tics: c - debut, hauteurs });
      debut = c;
    }
  }
  return out;
}

/** Le motif d'un accord : le plus court qui couvre sa durée, sinon le plus long ; le premier à longueur égale. */
export function motifPourDuree(motifs: readonly (readonly EntreeMotif[])[], tics: number): readonly EntreeMotif[] {
  let choisi: readonly EntreeMotif[] | null = null;
  let plusLong: readonly EntreeMotif[] = motifs[0];
  for (const m of motifs) {
    const l = ticsDuMotif(m);
    if (l > ticsDuMotif(plusLong)) plusLong = m;
    if (l >= tics && (choisi === null || l < ticsDuMotif(choisi))) choisi = m;
  }
  return choisi ?? plusLong;
}

export interface OptionsArpege {
  harmonie: HarmonieLue;
  motifs: readonly (readonly EntreeMotif[])[];
  segments: readonly number[] | null;
  normaliser: boolean;
  couperALaSection: boolean;
}

/** Pose l'arpège sur tout le morceau : une ligne. */
export function rendreArpege(o: OptionsArpege): EntreeLigne[] {
  const h = o.harmonie;
  const motifs = o.motifs.filter((m) => ticsDuMotif(m) > 0);
  const out: EntreeLigne[] = [];
  if (motifs.length === 0) return out;
  const joue = (t: number) => (o.segments ? joueAuTic(o.segments, t) : t < h.tics);
  let tic = 0;
  for (const e of etenduesDAccord(h, o.normaliser, o.couperALaSection)) {
    if (e.tic > tic) out.push({ tic, tics: e.tic - tic, hauteur: null, velocite: 0, lie: false });
    const motif = motifPourDuree(motifs, e.tics);
    const fin = e.tic + e.tics;
    tic = e.tic;
    for (let pos = 0; tic < fin; pos++) {
      const entree = motif[pos % motif.length];
      const tics = Math.min(entree.tics, fin - tic);
      const joueIci = joue(tic) && !entree.silence && entree.velocite > 0 && entree.decalage !== null;
      const hauteur = joueIci ? hauteurSurAccord(e.hauteurs, entree.decalage!) : null;
      out.push({ tic, tics, hauteur, velocite: hauteur === null ? 0 : entree.velocite,
        lie: hauteur !== null && entree.lie && joue(tic + tics) });
      tic += tics;
    }
  }
  return out;
}

export interface OptionsNappe {
  harmonie: HarmonieLue;
  decalages: readonly number[];
  segments: readonly number[] | null;
  normaliser: boolean;
  couperALaSection: boolean;
  rejouer: boolean;
  velocite: number;
}

/** Les morceaux d'étendue où la voix joue, et si chacun prolonge le précédent sans rupture. */
function intervallesJoues(etendues: readonly Etendue[], segments: readonly number[] | null) {
  const actifs: [number, number][] = [];
  if (segments) {
    let t = 0;
    for (const s of segments) { if (s > 0) actifs.push([t, t + s]); t += Math.abs(s); }
  }
  const out: (Etendue & { suite: boolean })[] = [];
  for (const e of etendues) {
    const morceaux = segments
      ? actifs.map(([a, b]) => [Math.max(a, e.tic), Math.min(b, e.tic + e.tics)] as const).filter(([a, b]) => b > a)
      : [[e.tic, e.tic + e.tics] as const];
    for (const [a, b] of morceaux) {
      const avant = out[out.length - 1];
      out.push({ tic: a, tics: b - a, hauteurs: e.hauteurs, suite: !!avant && avant.tic + avant.tics === a && a === e.tic });
    }
  }
  return out;
}

/** Pose la nappe sur tout le morceau : une ligne par décalage, dans l'ordre des décalages. */
export function rendreNappe(o: OptionsNappe): EntreeLigne[][] {
  const h = o.harmonie;
  const lignes: EntreeLigne[][] = o.decalages.map(() => []);
  const fins = o.decalages.map(() => 0);
  const intervalles = intervallesJoues(etenduesDAccord(h, o.normaliser, o.couperALaSection), o.segments);
  // Le premier tic de chaque section, quand la section rompt la tenue.
  const ruptures = new Set(o.couperALaSection ? h.sections : []);
  for (const iv of intervalles) {
    const hauteurs = o.decalages.map((d) => hauteurSurAccord(iv.hauteurs, d));
    const continuer = iv.suite && !o.rejouer && !ruptures.has(iv.tic);
    const prises = new Array<boolean>(hauteurs.length).fill(false);
    const tenues = new Array<boolean>(lignes.length).fill(false);
    if (continuer) {
      lignes.forEach((l, k) => {
        const derniere = l[l.length - 1];
        if (!derniere || derniere.hauteur === null || fins[k] !== iv.tic) return;
        const j = hauteurs.findIndex((p, i) => !prises[i] && p === derniere.hauteur);
        if (j < 0) return;
        prises[j] = true;
        tenues[k] = true;
        derniere.tics += iv.tics;
        fins[k] += iv.tics;
      });
    }
    const neuves = hauteurs.filter((_, i) => !prises[i]);
    lignes.forEach((l, k) => {
      if (tenues[k]) return;
      if (fins[k] < iv.tic) l.push({ tic: fins[k], tics: iv.tic - fins[k], hauteur: null, velocite: 0, lie: false });
      const hauteur = neuves.shift() ?? null;
      l.push({ tic: iv.tic, tics: iv.tics, hauteur, velocite: hauteur === null ? 0 : o.velocite, lie: false });
      fins[k] = iv.tic + iv.tics;
    });
  }
  return lignes;
}
