// audio/grains.ts — Les grains RÉELS d'un son : les trouver, puis les manipuler.
//
// CE QUI SÉPARE CE MODULE DE TOUT LE RESTE DU CATALOGUE GRANULAIRE. Le gel granulaire, le
// brassage, la découpe aléatoire et les particules découpent le son sur une GRILLE : une cadence
// qu'on règle, et qui ne doit rien à ce qu'on lui donne. Ici, les frontières viennent du son —
// chaque frappe, chaque syllabe, chaque note devient un grain. C'est la famille `GRAIN` du
// Composers Desktop Project, et son intérêt tient tout entier dans cette différence : on peut
// retirer une frappe sur deux d'un rythme, remettre les grains dans un autre ordre, ou les
// répéter, sans jamais couper au milieu d'un son.
//
// LE POINT DUR EST LA DÉTECTION, ET IL FAUT DEUX RÈGLES, PAS UNE.
//
//  1. LE NIVEAU, pour séparer ce qui sonne de ce qui ne sonne pas. C'est la règle du rognage des
//     silences, et on lui emprunte son enveloppe : même fenêtre, même seuil en décibels, mêmes
//     frontières. Deux nœuds qui découpent le même son ne doivent pas le découper autrement.
//  2. L'ATTAQUE, parce que la première règle échoue exactement là où le procédé sert. Sur un
//     roulement, une nappe ou une phrase tenue, l'enveloppe ne redescend JAMAIS sous le seuil : la
//     règle de niveau seule rend un grain unique de trente secondes, ce qui est une réponse juste
//     et inutile. Une montée franche de l'enveloppe après un creux local ouvre donc un grain,
//     même sans silence devant.
//
// L'ÉCART MINIMAL N'EST PAS UN CONFORT. Une attaque n'est pas un instant mais une montée de
// quelques millisecondes, et l'enveloppe y tremble : sans écart minimal, une seule frappe donne
// trois ou quatre grains, et toutes les manipulations qui suivent deviennent du hachis.

import { enveloppe, type Segment } from "./silences";

export interface OptionsDetection {
  frequence: number;
  /** En dessous de ce niveau, on considère qu'il n'y a pas de son. En dBFS. */
  seuilDb: number;
  /** Deux grains ne peuvent pas commencer à moins de cet écart, en millisecondes. */
  ecartMinMs: number;
  /**
   * De combien l'enveloppe doit remonter, en décibels, pour qu'on y voie une attaque.
   * Zéro désactive la règle d'attaque : seuls les silences séparent alors les grains.
   */
  monteeDb: number;
  /** Fenêtre de lissage de l'enveloppe, en millisecondes. */
  fenetreMs?: number;
}

/** Un grain détecté : un intervalle d'échantillons, et ce qu'il pèse. */
export interface Grain extends Segment {
  /** Niveau de crête de l'enveloppe sur le grain, en dBFS. */
  creteDb: number;
}

const PLANCHER_DB = -120;

const enDb = (x: number): number => (x > 1e-12 ? 20 * Math.log10(x) : PLANCHER_DB);

/**
 * Les grains d'un son : niveau d'abord, attaques ensuite.
 *
 * L'ordre des deux règles compte. On établit d'abord les zones qui sonnent — hors d'elles, une
 * montée d'enveloppe n'est que du bruit de fond qui remonte —, puis on cherche les attaques À
 * L'INTÉRIEUR de chacune. Chercher les attaques partout ferait naître des grains dans le souffle.
 */
export function detecterGrains(x: Float32Array, o: OptionsDetection): Grain[] {
  if (x.length === 0) return [];
  const env = enveloppe(x, o.frequence, o.fenetreMs);
  const seuil = Math.pow(10, o.seuilDb / 20);
  const ecartMin = Math.max(1, Math.round((o.ecartMinMs / 1000) * o.frequence));
  const montee = Math.max(0, o.monteeDb);

  // 1. Les zones qui sonnent.
  const zones: Segment[] = [];
  let debut = -1;
  for (let i = 0; i < x.length; i++) {
    const sonore = env[i] >= seuil;
    if (sonore && debut < 0) debut = i;
    if (!sonore && debut >= 0) { zones.push({ debut, fin: i }); debut = -1; }
  }
  if (debut >= 0) zones.push({ debut, fin: x.length });

  // 2. Les attaques dans chaque zone.
  const departs: number[] = [];
  for (const z of zones) {
    departs.push(z.debut);
    if (montee <= 0) continue;
    // UNE ATTAQUE EST UNE REMONTÉE APRÈS UNE RETOMBÉE, et non n'importe quelle montée. Comparée au
    // seul niveau de départ, la montée du grain qu'on vient d'ouvrir déclenche immédiatement un
    // second départ : mesuré, huit frappes en donnaient seize. Le creux se réarme donc à CHAQUE
    // nouveau sommet — tant que l'enveloppe monte, il la suit et l'écart reste nul ; dès qu'elle
    // retombe, il enregistre le plancher d'où la prochaine attaque devra repartir.
    let sommet = env[z.debut];
    let creux = env[z.debut];
    let dernier = z.debut;
    for (let i = z.debut + 1; i < z.fin; i++) {
      const v = env[i];
      if (v > sommet) { sommet = v; creux = v; } else if (v < creux) creux = v;
      if (i - dernier >= ecartMin && enDb(v) - enDb(creux) >= montee && v >= seuil) {
        departs.push(i);
        dernier = i;
        sommet = v;
        creux = v;
      }
    }
  }

  // 3. Chaque grain court jusqu'au départ suivant, ou jusqu'à la fin de sa zone.
  const grains: Grain[] = [];
  for (let k = 0; k < departs.length; k++) {
    const d = departs[k];
    const zone = zones.find((z) => d >= z.debut && d < z.fin)!;
    const suivant = departs[k + 1];
    const fin = suivant !== undefined && suivant < zone.fin ? suivant : zone.fin;
    if (fin - d < 1) continue;
    let crete = 0;
    for (let i = d; i < fin; i++) if (env[i] > crete) crete = env[i];
    grains.push({ debut: d, fin, creteDb: enDb(crete) });
  }
  return grains;
}

/** Ce qu'on fait de la liste une fois les grains trouvés. */
export const OPERATIONS = [
  { id: "compter", fr: "Compter seulement", en: "Count only" },
  { id: "garder", fr: "Garder n sur m", en: "Keep n out of m" },
  { id: "inverser", fr: "Inverser l'ordre", en: "Reverse the order" },
  { id: "repeter", fr: "Répéter chacun", en: "Repeat each" },
  { id: "melanger", fr: "Mélanger", en: "Shuffle" },
] as const;

export type Operation = (typeof OPERATIONS)[number]["id"];

export const EST_OPERATION = (x: string): x is Operation => OPERATIONS.some((o) => o.id === x);

export interface OptionsTransformation {
  operation: Operation;
  /** Pour « garder n sur m ». */
  garder: number;
  sur: number;
  /** Pour « répéter chacun ». */
  repetitions: number;
  /** Tirage du mélange. */
  aleatoire: () => number;
}

/**
 * La liste des grains à jouer, dans l'ordre, après transformation.
 *
 * Un grain peut y figurer plusieurs fois — c'est tout l'objet de la répétition — et la liste peut
 * être plus courte que l'originale. Rien n'est copié : ce sont les mêmes intervalles, réordonnés.
 */
export function transformerGrains(grains: readonly Grain[], o: OptionsTransformation): Grain[] {
  const liste = [...grains];
  switch (o.operation) {
    case "compter":
      return liste;
    case "garder": {
      const sur = Math.max(1, Math.round(o.sur));
      const garder = Math.min(sur, Math.max(0, Math.round(o.garder)));
      return liste.filter((_, i) => i % sur < garder);
    }
    case "inverser":
      return liste.reverse();
    case "repeter": {
      const n = Math.max(1, Math.round(o.repetitions));
      return liste.flatMap((g) => new Array(n).fill(g));
    }
    case "melanger": {
      // Mélange de Fisher-Yates : chaque permutation également probable, et aucun grain perdu.
      for (let i = liste.length - 1; i > 0; i--) {
        const j = Math.floor(o.aleatoire() * (i + 1));
        [liste[i], liste[j]] = [liste[j], liste[i]];
      }
      return liste;
    }
  }
}

/** Où les grains retombent une fois transformés. */
export const ESPACEMENTS = [
  { id: "origine", fr: "D'origine", en: "As found" },
  { id: "serre", fr: "Serré", en: "Butted" },
] as const;

export type Espacement = (typeof ESPACEMENTS)[number]["id"];

export const EST_ESPACEMENT = (x: string): x is Espacement => ESPACEMENTS.some((e) => e.id === x);

/**
 * Le plan de montage : quel grain, et à quel instant.
 *
 * DEUX FAÇONS DE REPOSER LES GRAINS. « Serré » les recolle bout à bout : le son raccourcit d'autant
 * et le rythme change. « D'origine » garde les instants trouvés dans le son, et conserve donc la
 * durée. Le premier conserve la densité, le second le rythme.
 *
 * ET « D'ORIGINE » A DEUX SENS, QU'IL A FALLU SÉPARER. `surPlace` dit lequel.
 *
 *  - SUR PLACE : chaque grain retourne À SON PROPRE instant. C'est ce qu'exigent le retrait et la
 *    répétition — retirer une frappe sur deux doit laisser un TROU à sa place, sans quoi les
 *    frappes restantes se tassent au début et le rythme disparaît. Mesuré dans l'application avant
 *    correction : cinq frappes gardées sur dix se retrouvaient toutes dans la première moitié du
 *    son, la seconde étant vide. Les copies d'un même grain se décalent de sa propre durée, ce qui
 *    donne le bégaiement attendu plutôt qu'un empilement au même endroit.
 *  - PAR CASES : le n-ième grain joué prend le départ du n-ième grain trouvé. C'est ce qu'exigent
 *    le mélange et l'inversion, où l'intérêt est justement qu'un grain tombe à la place d'un
 *    autre — rendu à son propre instant, un mélange ne changerait rigoureusement rien.
 */
export function planMontage(
  source: readonly Grain[], joues: readonly Grain[], espacement: Espacement, surPlace = false,
): { grain: Grain; instant: number }[] {
  if (espacement === "serre") {
    let curseur = 0;
    return joues.map((grain) => {
      const instant = curseur;
      curseur += grain.fin - grain.debut;
      return { grain, instant };
    });
  }
  if (surPlace) {
    const vus = new Map<number, number>();
    return joues.map((grain) => {
      const rang = vus.get(grain.debut) ?? 0;
      vus.set(grain.debut, rang + 1);
      return { grain, instant: grain.debut + rang * (grain.fin - grain.debut) };
    });
  }
  // Par cases. Au-delà de la liste d'origine, on continue au rythme du dernier écart connu, faute
  // de quoi tous les grains en trop s'empileraient au même instant.
  const ecart = source.length > 1
    ? (source[source.length - 1].debut - source[0].debut) / (source.length - 1)
    : Math.max(1, source[0] ? source[0].fin - source[0].debut : 1);
  return joues.map((grain, i) => ({
    grain,
    instant: i < source.length ? source[i].debut : Math.round(source[source.length - 1].debut + (i - source.length + 1) * ecart),
  }));
}

/** Rend les canaux montés, tous de la même longueur. */
export function monter(
  canaux: readonly Float32Array[], plan: readonly { grain: Grain; instant: number }[], longueurMin = 0,
): Float32Array[] {
  const longueur = Math.max(longueurMin, ...plan.map((p) => p.instant + (p.grain.fin - p.grain.debut)), 0);
  return canaux.map((source) => {
    const sortie = new Float32Array(longueur);
    for (const { grain, instant } of plan) {
      for (let i = grain.debut, j = instant; i < grain.fin && j < longueur; i++, j++) {
        // On ADDITIONNE : deux grains superposés — ce que « d'origine » permet après répétition —
        // doivent s'entendre tous les deux, non se remplacer.
        sortie[j] += source[i];
      }
    }
    return sortie;
  });
}

/** Ce qu'on dit du résultat : de quoi juger la détection avant de juger l'effet. */
export interface RapportGrains {
  trouves: number;
  joues: number;
  dureeMoyenneMs: number;
  ecartMoyenMs: number;
}

export function rapportGrains(
  source: readonly Grain[], joues: readonly Grain[], frequence: number,
): RapportGrains {
  const enMs = (n: number) => (n / frequence) * 1000;
  const duree = source.length > 0
    ? source.reduce((s, g) => s + (g.fin - g.debut), 0) / source.length : 0;
  const ecart = source.length > 1
    ? (source[source.length - 1].debut - source[0].debut) / (source.length - 1) : 0;
  return {
    trouves: source.length,
    joues: joues.length,
    dureeMoyenneMs: enMs(duree),
    ecartMoyenMs: enMs(ecart),
  };
}
