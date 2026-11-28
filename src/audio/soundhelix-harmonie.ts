// audio/soundhelix-harmonie.ts — L'harmonie d'un morceau, comme SoundHelix la bâtit : un motif
// d'accords tiré dans une banque, ses renvois de table résolus, puis répété jusqu'à la fin.
//
// D'APRÈS SoundHelix 0.9 (Thomas Schürger), réécrit depuis la description de son modèle, sans
// rien en recopier : décision D1 du chantier, 2026-11-28. Le hasard est celui d'Attic : un même
// motif rend les mêmes accords que SoundHelix, un même nom de morceau ne rend pas le même tirage.
//
// LE MOTIF. Des éléments `accord/durée en temps`, séparés par des virgules. L'accord est un nom ou
// trois hauteurs (`audio/soundhelix-accords.ts`), ou un renvoi :
//   - `1` tire un accord dans la table 1 (la première est la table 0) ;
//   - `1!3` tire dans la table 1 un accord différent de l'élément 3 ;
//   - `$0` reprend l'élément 0.
// Les éléments se comptent tous, noms et renvois compris, à partir de zéro. Un tirage refuse
// l'accord égal au précédent, renversement près, et pour le dernier élément le nom même du premier ;
// mille refus de suite font reprendre le tirage depuis le choix du motif.
//
// LES SECTIONS. Un `+` devant un élément ouvre une section d'accords ; le premier élément en ouvre
// toujours une. Les sections sont l'unité de la forme : la matrice d'activité et la mélodie se
// comptent en elles.
//
// LE RENVERSEMENT AU PLUS PROCHE. Chaque accord prend le renversement, à l'octave près, dont la note
// du milieu est la plus proche de celle du PREMIER accord du motif, tel qu'il est lu. C'est ce qui
// tient les voix sans saut.
//
// DEUX ACCORDS ÉGAUX QUI SE SUIVENT N'EN FONT QU'UN, même de part et d'autre d'une frontière de
// section : relevé sur le programme, où `Am/16` répété donne un seul accord pour douze sections.

import { deplierMotif } from "./soundhelix-motifs";
import {
  type AccordSH, FauteAccord, accordsEgaux, commenceParUneNote, egauxNormalises, lireAccordSH, rapprocherAccord,
} from "./soundhelix-accords";

/** Un accord posé : son premier tic, sa durée en tics, ses trois hauteurs. */
export interface AccordPose {
  tic: number;
  tics: number;
  hauteurs: AccordSH;
}

export interface HarmonieSH {
  accords: AccordPose[];
  /** Le premier tic de chaque section d'accords. */
  sections: number[];
  tics: number;
}

/** Le motif tiré, ses renvois résolus, et son rang dans la banque. */
export interface MotifTire {
  rang: number;
  motif: string;
}

const TIRAGES_PAR_ELEMENT = 1000;
const REPRISES_MAX = 100;

/** Les éléments d'un motif, dépliés : `+`, accord, durée. */
function elements(motif: string): { section: boolean; accord: string; temps: string }[] {
  const deplie = deplierMotif(motif.trim());
  if (deplie === "") throw new FauteAccord("motif d'accords vide", "empty chord pattern");
  return deplie.split(",").map((brut) => {
    const e = brut.trim();
    const barre = e.indexOf("/");
    if (barre < 0) throw new FauteAccord(`durée manquante dans « ${e} »`, `missing length in « ${e} »`);
    const temps = e.slice(barre + 1);
    if (!/^\d+(\.\d+)?$/.test(temps)) throw new FauteAccord(`durée illisible dans « ${e} »`, `unreadable length in « ${e} »`);
    const section = e.startsWith("+");
    return { section, accord: e.slice(section ? 1 : 0, barre), temps };
  });
}

/** Un tirage de motif, ou `null` quand mille refus de suite demandent de reprendre. */
function essayer(
  motifs: readonly string[], tables: readonly (readonly string[])[], registre: number, entier: (n: number) => number,
): MotifTire | null {
  const rang = entier(motifs.length);
  const liste = elements(motifs[rang]);
  const resolus: string[] = [];
  const morceaux: string[] = [];
  const lire = (nom: string) => lireAccordSH(nom, registre);
  for (let i = 0; i < liste.length; i++) {
    const { section, accord: spec, temps } = liste[i];
    let accord: string;
    if (spec.includes(":") || commenceParUneNote(spec)) {
      accord = spec;
    } else if (spec.startsWith("$")) {
      const n = Number(spec.slice(1));
      if (!Number.isInteger(n) || n < 0 || n >= resolus.length) {
        throw new FauteAccord(`« ${spec} » renvoie à un élément qui n'existe pas encore`,
          `« ${spec} » refers to an element that does not exist yet`);
      }
      accord = resolus[n];
    } else {
      const m = /^(\d+)(?:!(\d+))?$/.exec(spec);
      if (!m) throw new FauteAccord(`renvoi de table illisible : « ${spec} »`, `unreadable table reference: « ${spec} »`);
      const table = tables[Number(m[1])];
      if (!table || table.length === 0) throw new FauteAccord(`la table ${m[1]} n'existe pas`, `table ${m[1]} does not exist`);
      const exclu = m[2] === undefined ? -1 : Number(m[2]);
      if (exclu >= resolus.length) {
        throw new FauteAccord(`« ${spec} » exclut un élément qui n'existe pas encore`,
          `« ${spec} » excludes an element that does not exist yet`);
      }
      let essais = 0;
      for (;;) {
        accord = table[entier(table.length)];
        if (++essais > TIRAGES_PAR_ELEMENT) return null;
        const candidat = lire(accord);
        const refus = (i > 0 && egauxNormalises(candidat, lire(resolus[i - 1])))
          || (i === liste.length - 1 && accord === resolus[0])
          || (exclu >= 0 && egauxNormalises(candidat, lire(resolus[exclu])));
        if (!refus) break;
      }
    }
    lire(accord);
    resolus.push(accord);
    morceaux.push(`${section ? "+" : ""}${accord}/${temps}`);
  }
  return { rang, motif: morceaux.join(",") };
}

/**
 * Tire un motif dans la banque et résout ses renvois de table.
 *
 * Mille refus de suite sur un même élément font reprendre depuis le choix du motif ; cent reprises
 * sans succès disent que les tables ne permettent pas le motif, et lèvent en le disant.
 */
export function tirerMotifAccords(
  motifs: readonly string[], tables: readonly (readonly string[])[], registre: number, aleatoire: () => number,
): MotifTire {
  if (motifs.length === 0) throw new FauteAccord("aucun motif d'accords", "no chord pattern");
  const entier = (n: number) => Math.floor(aleatoire() * n);
  for (let k = 0; k < REPRISES_MAX; k++) {
    const t = essayer(motifs, tables, registre, entier);
    if (t) return t;
  }
  throw new FauteAccord("les tables d'accords ne permettent aucun tirage qui respecte le motif",
    "the chord tables allow no draw that respects the pattern");
}

export interface OptionsHarmonie {
  /** Le motif tiré, ses renvois résolus. */
  motif: string;
  ticsParTemps: number;
  /** La longueur du morceau, en tics. */
  tics: number;
  registre: number;
  rapprocher: boolean;
}

/** Pose le motif sur tout le morceau, le répète, le coupe à la fin, et fond les accords égaux voisins. */
export function calculerHarmonie(o: OptionsHarmonie): HarmonieSH {
  const liste = elements(o.motif);
  const durees = liste.map((e) => Math.floor(Number(e.temps) * o.ticsParTemps + 0.5));
  if (durees.every((d) => d === 0)) {
    throw new FauteAccord("toutes les durées du motif valent zéro tic", "every length of the pattern is zero ticks");
  }
  const parTic: AccordSH[] = [];
  const sections: number[] = [];
  let premier: AccordSH | null = null;
  for (let pos = 0; parTic.length < o.tics; pos++) {
    const k = pos % liste.length;
    const e = liste[k];
    // UN ÉLÉMENT DE DURÉE NULLE ouvre quand même sa section et, s'il est le premier, donne l'accord
    // de référence du rapprochement : il ne pose seulement aucun tic.
    if (k === 0 || e.section) sections.push(parTic.length);
    let accord = lireAccordSH(e.accord, o.registre);
    if (premier === null) premier = accord;
    if (durees[k] === 0) continue;
    if (o.rapprocher) accord = rapprocherAccord(accord, premier);
    for (let j = 0; j < durees[k] && parTic.length < o.tics; j++) parTic.push(accord);
  }
  const accords: AccordPose[] = [];
  for (let tic = 0; tic < parTic.length; tic++) {
    const dernier = accords[accords.length - 1];
    if (dernier && accordsEgaux(dernier.hauteurs, parTic[tic])) dernier.tics++;
    else accords.push({ tic, tics: 1, hauteurs: parTic[tic] });
  }
  return { accords, sections: [...new Set(sections)], tics: o.tics };
}
