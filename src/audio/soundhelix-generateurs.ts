// audio/soundhelix-generateurs.ts — Trois générateurs de motifs de SoundHelix : au hasard, par
// fragments écrits, en crescendo. Chacun rend un motif en texte, dans la grammaire que les voix lisent.
//
// D'APRÈS SoundHelix 0.9 (Thomas Schürger), réécrit depuis la description de son modèle et le relevé
// des témoins, sans rien en recopier : décision D1 du chantier, 2026-11-28.
//
// LE PLAN. Un motif se compose de parties nommées d'une lettre et d'un chiffre, `A1,A2,A1,B1` : une
// lettre neuve tire une partie neuve ; un chiffre neuf de la même lettre en tire une variante, que
// le motif au hasard fait par deux permutations de ses événements et le motif par fragments par un
// tirage neuf dans les mêmes fragments ; une partie déjà nommée se répète telle quelle.
//
// LE CRESCENDO NE TIRE RIEN. Chaque note y prend la vélocité min + (max − min) × (t / (T − 1))^e, t
// étant le tic où elle part et T la longueur du motif, tronquée à l'entier : relevé sur les deux
// crescendos de l'essai de batterie, seize notes de 100 à 1000 à l'exposant 2 (100, 104, 116, 136…)
// et six de 300 à 900 à l'exposant 1, la première au tic 2 (409, 518, 627, 736, 845, 900).

import { FauteMotif, lireMotif, ticsDuMotif, type EntreeMotif } from "./soundhelix-motifs";

const VELOCITE_MAX = 1000;

/** Une entrée de motif en texte : `décalage[~]/tics:vélocité`, ou `-/tics`. */
export function ecrireEntree(e: { decalage: number | null; joker?: string | null; tics: number; velocite: number; lie: boolean }): string {
  if (e.decalage === null && !e.joker) return `-/${e.tics}`;
  return `${e.joker ?? e.decalage}${e.lie ? "~" : ""}/${e.tics}:${e.velocite}`;
}

/** Les parties d'un plan, `A1,A2,A1,B1`, chacune sa lettre et son chiffre. */
export function lirePlan(plan: string): { lettre: string; chiffre: string; cle: string }[] {
  const parties = plan.split(",").map((s) => s.trim()).filter((s) => s !== "");
  if (parties.length === 0) throw new FauteMotif("plan vide", "empty plan");
  return parties.map((p) => {
    const m = /^([A-Za-z])(\d+)$/.exec(p);
    if (!m) throw new FauteMotif(`partie de plan illisible : « ${p} »`, `unreadable plan part: « ${p} »`);
    return { lettre: m[1].toUpperCase(), chiffre: m[2], cle: `${m[1].toUpperCase()}${m[2]}` };
  });
}

/** Pose les parties dans l'ordre du plan, chacune tirée une seule fois. */
function composer(plan: string, tirer: (lettre: string, deja: readonly string[]) => string): string {
  const faites = new Map<string, string>();
  const parLettre = new Map<string, string[]>();
  return lirePlan(plan).map(({ lettre, cle }) => {
    const faite = faites.get(cle);
    if (faite !== undefined) return faite;
    const deja = parLettre.get(lettre) ?? [];
    const partie = tirer(lettre, deja);
    deja.push(partie);
    parLettre.set(lettre, deja);
    faites.set(cle, partie);
    return partie;
  }).join(",");
}

const choisir = <T>(l: readonly T[], alea: () => number): T => l[Math.floor(alea() * l.length)];

export interface OptionsHasard {
  plan: string;
  tics: number;
  probabiliteNote: number;
  probabiliteLiaison: number;
  velocite: { min: number; max: number };
  ticsJoues: { min: number; max: number };
  decalages: readonly number[];
  longueursNote: readonly number[];
  longueursSilence: readonly number[];
  /** 0 : la vélocité ne doit rien à la hauteur ; 1 : elle n'en dépend que. */
  correlation: number;
  exposant: number;
  partiesDistinctes: boolean;
  aleatoire: () => number;
}

/** Combien de tirages une partie essaie avant de dire qu'elle ne peut pas être. */
export const TIRAGES = 1000;

type Evenement = { decalage: number | null; tics: number; velocite: number; lie: boolean };

/** Une partie de base : des notes et des silences jusqu'à la longueur, un nombre de tics joués borné. */
function partieAuHasard(o: OptionsHasard): Evenement[] {
  const bas = Math.min(...o.decalages);
  const haut = Math.max(...o.decalages);
  for (let essai = 0; essai < TIRAGES; essai++) {
    const ev: Evenement[] = [];
    let t = 0;
    let joues = 0;
    while (t < o.tics) {
      const note = o.aleatoire() * 100 < o.probabiliteNote;
      const tics = Math.min(o.tics - t, choisir(note ? o.longueursNote : o.longueursSilence, o.aleatoire));
      if (note) {
        const decalage = choisir(o.decalages, o.aleatoire);
        const rang = haut > bas ? (decalage - bas) / (haut - bas) : 0.5;
        const melange = o.correlation * rang + (1 - o.correlation) * o.aleatoire();
        const velocite = Math.round(o.velocite.min + (o.velocite.max - o.velocite.min) * melange ** o.exposant);
        ev.push({ decalage, tics, velocite, lie: false });
        joues += tics;
      } else {
        ev.push({ decalage: null, tics, velocite: 0, lie: false });
      }
      t += tics;
    }
    if (joues < o.ticsJoues.min || joues > o.ticsJoues.max) continue;
    for (let k = 0; k + 1 < ev.length; k++) {
      if (ev[k].decalage !== null && ev[k + 1].decalage !== null && o.aleatoire() * 100 < o.probabiliteLiaison) ev[k].lie = true;
    }
    return ev;
  }
  throw new FauteMotif(`aucune partie de ${o.tics} tics ne joue entre ${o.ticsJoues.min} et ${o.ticsJoues.max} tics en ${TIRAGES} tirages`,
    `no part of ${o.tics} ticks plays between ${o.ticsJoues.min} and ${o.ticsJoues.max} ticks in ${TIRAGES} draws`);
}

const enTexte = (ev: readonly Evenement[]) => ev.map(ecrireEntree).join(",");

/** Une variante : la partie de base, deux de ses événements échangés deux fois. */
function variante(base: readonly Evenement[], alea: () => number): Evenement[] {
  const ev = base.map((e) => ({ ...e }));
  for (let k = 0; k < 2 && ev.length > 1; k++) {
    const i = Math.floor(alea() * ev.length);
    let j = Math.floor(alea() * (ev.length - 1));
    if (j >= i) j++;
    [ev[i], ev[j]] = [ev[j], ev[i]];
  }
  // Une liaison ne tient que vers une note qui la suit.
  ev.forEach((e, k) => { if (e.lie && (k + 1 >= ev.length || ev[k + 1].decalage === null)) e.lie = false; });
  return ev;
}

/** Le motif au hasard d'un plan. */
export function motifAuHasard(o: OptionsHasard): string {
  if (o.decalages.length === 0 || o.longueursNote.length === 0 || o.longueursSilence.length === 0) {
    throw new FauteMotif("il faut des décalages, des longueurs de note et des longueurs de silence",
      "offsets, note lengths and rest lengths are needed");
  }
  const bases = new Map<string, Evenement[]>();
  return composer(o.plan, (lettre, deja) => {
    let base = bases.get(lettre);
    if (!base) {
      const autres = [...bases.values()].map(enTexte);
      for (let essai = 0; ; essai++) {
        base = partieAuHasard(o);
        if (!o.partiesDistinctes || !autres.includes(enTexte(base)) || essai >= TIRAGES) break;
      }
      bases.set(lettre, base);
      return enTexte(base);
    }
    for (let essai = 0; essai < TIRAGES; essai++) {
      const texte = enTexte(variante(base, o.aleatoire));
      if (!deja.includes(texte)) return texte;
    }
    return enTexte(variante(base, o.aleatoire));
  });
}

/** Les fragments d'un groupe : `A : 0,-,-,- | 0,-,0,-`, un groupe par ligne. */
export function lireFragments(texte: string): Map<string, string[]> {
  const groupes = new Map<string, string[]>();
  for (const [i, brute] of texte.split(/\r?\n/).entries()) {
    const ligne = brute.trim();
    if (ligne === "" || ligne.startsWith("#")) continue;
    const m = /^([A-Za-z])\s*:\s*(.+)$/.exec(ligne);
    if (!m) throw new FauteMotif(`ligne ${i + 1} des fragments illisible`, `line ${i + 1} of the fragments is unreadable`);
    const lettre = m[1].toUpperCase();
    groupes.set(lettre, [...(groupes.get(lettre) ?? []), ...m[2].split("|").map((f) => f.trim()).filter((f) => f !== "")]);
  }
  return groupes;
}

export interface OptionsFragments {
  plan: string;
  tics: number;
  fragments: Map<string, string[]>;
  partiesDistinctes: boolean;
  aleatoire: () => number;
}

/** La longueur d'un fragment, en tics. */
const ticsDuFragment = (f: string): number =>
  ticsDuMotif(lireMotif(f, { jokers: "+#*", velociteMax: VELOCITE_MAX, ticsParTemps: 4 }));

/** Le motif par fragments d'un plan : chaque partie, des fragments de sa lettre jusqu'à la longueur exacte. */
export function motifParFragments(o: OptionsFragments): string {
  const longueurs = new Map<string, number>();
  const longueur = (f: string) => {
    if (!longueurs.has(f)) longueurs.set(f, ticsDuFragment(f));
    return longueurs.get(f)!;
  };
  return composer(o.plan, (lettre, deja) => {
    const groupe = (o.fragments.get(lettre) ?? []).filter((f) => longueur(f) > 0);
    if (groupe.length === 0) throw new FauteMotif(`aucun fragment pour « ${lettre} »`, `no fragment for « ${lettre} »`);
    let derniere = "";
    for (let essai = 0; essai < TIRAGES; essai++) {
      const morceaux: string[] = [];
      let reste = o.tics;
      while (reste > 0) {
        const possibles = groupe.filter((f) => longueur(f) <= reste);
        if (possibles.length === 0) break;
        const f = choisir(possibles, o.aleatoire);
        morceaux.push(f);
        reste -= longueur(f);
      }
      if (reste !== 0) continue;
      derniere = morceaux.join(",");
      if (!o.partiesDistinctes || !deja.includes(derniere)) return derniere;
    }
    if (derniere) return derniere;
    throw new FauteMotif(`les fragments de « ${lettre} » ne font pas ${o.tics} tics`, `the fragments of « ${lettre} » do not make ${o.tics} ticks`);
  });
}

export interface OptionsCrescendo {
  tics: number;
  velocite: { min: number; max: number };
  exposant: number;
  prefixe: string;
  motif: string;
  suffixe: string;
}

/** Le crescendo : le préfixe, le motif répété, le suffixe, chaque note à sa vélocité de position. */
export function motifEnCrescendo(o: OptionsCrescendo): string {
  const lire = (t: string) => lireMotif(t, { jokers: "+#*", velociteMax: VELOCITE_MAX, ticsParTemps: 4 });
  const prefixe = lire(o.prefixe);
  const suffixe = lire(o.suffixe);
  const motif = lire(o.motif);
  const milieu = o.tics - ticsDuMotif(prefixe) - ticsDuMotif(suffixe);
  if (milieu < 0) {
    throw new FauteMotif(`le préfixe et le suffixe dépassent ${o.tics} tics`, `the prefix and the suffix exceed ${o.tics} ticks`);
  }
  if (milieu > 0 && ticsDuMotif(motif) === 0) throw new FauteMotif("le motif répété est vide", "the repeated pattern is empty");
  const entrees: EntreeMotif[] = [...prefixe];
  for (let t = 0, k = 0; t < milieu; k++) {
    const e = motif[k % motif.length];
    const tics = Math.min(e.tics, milieu - t);
    entrees.push({ ...e, tics });
    t += tics;
  }
  entrees.push(...suffixe);
  let t = 0;
  return entrees.map((e) => {
    const position = o.tics > 1 ? t / (o.tics - 1) : 1;
    const crescendo = o.velocite.min + (o.velocite.max - o.velocite.min) * position ** o.exposant;
    // Un millionième de marge : 900 × (2/15)² vaut 15,999… en virgule flottante, et 116 doit le rester.
    const velocite = Math.floor((crescendo * e.velocite) / VELOCITE_MAX + 1e-6);
    t += e.tics;
    return ecrireEntree({ decalage: e.decalage, joker: e.joker, tics: e.tics, velocite, lie: e.lie });
  }).join(",");
}
