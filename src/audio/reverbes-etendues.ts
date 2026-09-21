// audio/reverbes-etendues.ts — Deux réverbérations qui ne se règlent pas, elles se construisent.
//
// LE CATALOGUE EN COMPTAIT SEPT, ET IL MANQUAIT CELLES-CI. Ce ne sont pas des réglages de plus sur
// une queue de salle : ce sont deux façons de traiter la queue elle-même, et aucune combinaison
// des nœuds existants ne les donne. Le moteur est le même dans les deux cas — la réponse de bruit
// de velours de `audio/velours.ts`, déjà écrite et éprouvée —, seule la suite diffère.
//
// LA RÉVERBÉRATION HACHÉE, ET POURQUOI CE N'EST PAS « une réverbération plus une porte ». Le son
// de batterie des années quatre-vingt tient à une porte commandée par le son SEC, jamais par la
// réverbération qu'elle coupe. Une porte ordinaire écoute ce qu'elle traite : posée derrière une
// réverbération, elle se ferme quand la queue passe sous son seuil, c'est-à-dire tard et
// progressivement — on entend une queue qui s'éteint, pas un couperet. Commandée par la frappe,
// elle tient pendant un temps FIXE puis coupe net, et c'est ce silence brutal qui fait l'effet.
// Le catalogue a bien un nœud qui écoute un autre signal — le ducking —, mais il baisse le son au
// lieu de le tenir ouvert : l'inverse exact de ce qu'il faut ici.
//
// LE SHIMMER, ET POURQUOI IL DEMANDE UN NŒUD. Sa recette est une boucle : la queue est transposée
// à l'octave supérieure et réinjectée dans la réverbération, indéfiniment, chaque tour plus haut et
// plus faible. Un graphe acyclique ne peut pas l'exprimer — c'est une rétroaction, pas une chaîne.
// On la déroule donc en GÉNÉRATIONS : la première est la réverbération du son, la deuxième celle de
// la première transposée, et ainsi de suite jusqu'à ce que le gain de rebouclage les éteigne. Quatre
// ou cinq suffisent ; au-delà, tout est sous le plancher d'audition.

import { changerTonalite } from "./effets-spectral";
import { convoluer, reponseVelours, type OptionsVelours } from "./velours";

/**
 * La réponse, ramenée à un gain unitaire en énergie.
 *
 * SANS CELA, CONVOLUER REND UN SON PLUS FORT QU'IL N'EST ENTRÉ : une réponse de velours porte des
 * milliers d'impulsions, et leur somme d'énergie dépasse largement un. Sur une réverbération
 * ordinaire, cela se rattrape au mélange ; sur un shimmer, qui reconvolue à chaque tour, cela
 * s'accumule. Mesuré avant correction : la quatrième génération ressortait soixante-quatorze
 * décibels AU-DESSUS de la première, au lieu de s'éteindre — le réglage de rebouclage ne
 * commandait rien, la convolution gagnant à chaque fois davantage qu'il ne retirait.
 */
function reponseUnitaire(o: OptionsVelours): Float32Array {
  const h = reponseVelours(o);
  let energie = 0;
  for (let i = 0; i < h.length; i++) energie += h[i] * h[i];
  const gain = energie > 1e-18 ? 1 / Math.sqrt(energie) : 1;
  for (let i = 0; i < h.length; i++) h[i] *= gain;
  return h;
}

// ── La réverbération hachée ──

export interface OptionsHachee {
  /** Durée de la queue avant hachage, en secondes. */
  decroissanceSec: number;
  /** Seuil d'ouverture, en dBFS, mesuré sur le son SEC. */
  seuilDb: number;
  /** Temps pendant lequel la porte reste ouverte après une attaque, en secondes. */
  maintienSec: number;
  /** Temps de fermeture, en secondes. Court, c'est le couperet ; long, c'est un fondu. */
  chuteSec: number;
  melange: number;
  frequence: number;
  graine?: number;
  densite?: number;
  assombrissement?: number;
}

/**
 * L'enveloppe de la porte, commandée par le son sec.
 *
 * ELLE S'OUVRE D'UN COUP ET SE FERME APRÈS UN TEMPS FIXE, ce qui est exactement l'inverse d'une
 * porte ordinaire : celle-ci suit le niveau, celle-là suit les ATTAQUES. Tant que le sec repasse
 * au-dessus du seuil, le compte à rebours repart — une roulade de caisse claire tient donc la
 * porte ouverte, et c'est après la dernière frappe que le couperet tombe.
 */
export function enveloppePorte(
  sec: Float32Array, o: Pick<OptionsHachee, "seuilDb" | "maintienSec" | "chuteSec" | "frequence">,
): Float32Array {
  const seuil = Math.pow(10, o.seuilDb / 20);
  const maintien = Math.max(1, Math.round(o.maintienSec * o.frequence));
  const chute = Math.max(1, Math.round(o.chuteSec * o.frequence));
  const out = new Float32Array(sec.length);
  let reste = 0;          // échantillons de maintien restants
  let niveau = 0;
  for (let i = 0; i < sec.length; i++) {
    if (Math.abs(sec[i]) >= seuil) { reste = maintien; niveau = 1; }
    else if (reste > 0) { reste--; }
    else if (niveau > 0) { niveau = Math.max(0, niveau - 1 / chute); }
    out[i] = niveau;
  }
  return out;
}

export interface ResultatHachee {
  audio: Float32Array;
  /** Ce que la réverbération hachée ajoute APRÈS la fin du son sec, en secondes. */
  traineeSec: number;
  /** Ce qu'elle ajouterait sans la porte. */
  traineeLibreSec: number;
}

/**
 * La durée d'une queue : le dernier instant où elle passe encore quarante décibels sous sa crête.
 *
 * TROIS MESURES ONT ÉTÉ ESSAYÉES AVANT DE TROUVER CELLE QUI PARLE. L'énergie après fermeture
 * rapportée à celle d'avant parlait de la queue NON hachée, et aurait été la même sans porte. La
 * part d'énergie jetée est juste mais muette : mesurée à 11 %, elle sous-entend un effet discret
 * là où la queue passe d'une seconde à deux dixièmes — une queue s'entend longtemps après qu'elle
 * ne pèse plus rien. Et l'instant du dernier son ne dit rien non plus dès que le morceau remplit
 * le tampon : mesuré dans l'application sur une boîte à rythmes, « 4,80 s → 4,73 s », alors que
 * la porte travaillait à chaque frappe. Ce qui se dit est donc la TRAÎNÉE : ce que la
 * réverbération ajoute APRÈS la fin du son sec.
 */
export function dureeQueue(x: Float32Array, frequence: number, sousLaCreteDb = -40): number {
  let crete = 0;
  for (let i = 0; i < x.length; i++) crete = Math.max(crete, Math.abs(x[i]));
  if (crete < 1e-9) return 0;
  const seuil = crete * Math.pow(10, sousLaCreteDb / 20);
  for (let i = x.length - 1; i >= 0; i--) if (Math.abs(x[i]) >= seuil) return (i + 1) / frequence;
  return 0;
}

export function reverberationHachee(x: Float32Array, o: OptionsHachee): ResultatHachee {
  const h = reponseUnitaire({
    duree: Math.max(0.05, o.decroissanceSec), sampleRate: o.frequence,
    densite: o.densite ?? 1500, rt60: Math.max(0.05, o.decroissanceSec),
    assombrissement: o.assombrissement ?? 0.25, graine: o.graine ?? 1,
  } as OptionsVelours);
  const queue = convoluer(x, h).subarray(0, x.length);
  const porte = enveloppePorte(x, o);

  const m = Math.min(1, Math.max(0, o.melange));
  const out = new Float32Array(x.length);
  const hachee = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    hachee[i] = queue[i] * porte[i];
    out[i] = x[i] * (1 - m) + (x[i] + hachee[i]) * m;
  }
  // La traînée : l'extinction moins la fin du sec, jamais négative — un morceau qui se termine sur
  // une frappe n'ajoute rien après lui, et c'est zéro, non un nombre négatif.
  const finSec = dureeQueue(x, o.frequence);
  const trainee = (y: Float32Array) => Math.max(0, dureeQueue(y, o.frequence) - finSec);
  return {
    audio: out,
    traineeSec: trainee(hachee),
    traineeLibreSec: trainee(queue as Float32Array),
  };
}

// ── Le shimmer ──

export interface OptionsShimmer {
  /** Durée de la queue de chaque génération, en secondes. */
  decroissanceSec: number;
  /** Ce qui repart dans la boucle à chaque tour, entre 0 et 1. */
  rebouclage: number;
  /** Transposition de la boucle, en demi-tons. Douze pour l'octave. */
  demiTons: number;
  /** Nombre de tours déroulés. */
  generations: number;
  melange: number;
  frequence: number;
  graine?: number;
  densite?: number;
  assombrissement?: number;
  /** Injecté pour les tests : transposer sans Web Audio. */
  transposer?: (x: Float32Array, demiTons: number, frequence: number) => Float32Array;
}

export interface ResultatShimmer {
  audio: Float32Array;
  /** Le niveau de chaque génération, en décibels sous la première. */
  generationsDb: number[];
}

/**
 * Le shimmer, déroulé en générations.
 *
 * LA PREMIÈRE GÉNÉRATION N'EST PAS TRANSPOSÉE, et c'est ce qui rend l'effet reconnaissable : on
 * entend d'abord la salle, puis l'octave qui monte dedans. Transposer dès le premier tour donnerait
 * un son aigu immédiat, qui sonne comme une erreur de réglage plutôt que comme une nappe.
 */
export function shimmer(x: Float32Array, o: OptionsShimmer): ResultatShimmer {
  const transposer = o.transposer ?? ((s: Float32Array, d: number) => transposerParReechantillonnage(s, d));
  const h = reponseUnitaire({
    duree: Math.max(0.05, o.decroissanceSec), sampleRate: o.frequence,
    densite: o.densite ?? 1500, rt60: Math.max(0.05, o.decroissanceSec),
    assombrissement: o.assombrissement ?? 0.25, graine: o.graine ?? 1,
  } as OptionsVelours);

  const somme = new Float32Array(x.length);
  const niveaux: number[] = [];
  let courant = convoluer(x, h).subarray(0, x.length) as Float32Array;
  let gain = 1;
  const tours = Math.max(1, Math.min(8, Math.round(o.generations)));
  for (let g = 0; g < tours; g++) {
    let energie = 0;
    for (let i = 0; i < x.length; i++) { somme[i] += courant[i] * gain; energie += (courant[i] * gain) ** 2; }
    niveaux.push(Math.sqrt(energie / Math.max(1, x.length)));
    if (g === tours - 1) break;
    // Le tour suivant : la queue transposée, réverbérée de nouveau, et affaiblie.
    const monte = transposer(courant, o.demiTons, o.frequence);
    courant = convoluer(monte, h).subarray(0, x.length) as Float32Array;
    gain *= Math.min(0.95, Math.max(0, o.rebouclage));
  }

  const m = Math.min(1, Math.max(0, o.melange));
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] * (1 - m) + (x[i] + somme[i]) * m;
  const premier = niveaux[0] || 1e-12;
  return { audio: out, generationsDb: niveaux.map((n) => 20 * Math.log10(Math.max(1e-12, n) / premier)) };
}

/**
 * Transposition par rééchantillonnage, pour le cas où aucune n'est fournie.
 *
 * ELLE RACCOURCIT LE SON, et c'est admis ici : sur une queue de réverbération, une octave plus
 * haute dure deux fois moins longtemps, ce qui est exactement ce que fait un shimmer analogique
 * bâti sur une bande qui tourne deux fois plus vite. Le reste du tampon est laissé à zéro, et la
 * réverbération du tour suivant rallonge de toute façon ce qui en sort.
 */
export function transposerParReechantillonnage(x: Float32Array, demiTons: number): Float32Array {
  const r = Math.pow(2, demiTons / 12);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const lecture = i * r;
    const k = Math.floor(lecture);
    if (k + 1 >= x.length) break;
    const frac = lecture - k;
    out[i] = x[k] * (1 - frac) + x[k + 1] * frac;
  }
  return out;
}

/** La transposition du catalogue, qui garde la durée. Utilisée par le nœud. */
export function transposerAvecDuree(
  x: Float32Array, demiTons: number, frequence: number,
): Float32Array {
  const tampon = new (globalThis as unknown as { AudioBuffer: new (o: { numberOfChannels: number; length: number; sampleRate: number }) => AudioBuffer }).AudioBuffer(
    { numberOfChannels: 1, length: x.length, sampleRate: frequence });
  tampon.getChannelData(0).set(x);
  return changerTonalite(tampon, demiTons).getChannelData(0);
}
