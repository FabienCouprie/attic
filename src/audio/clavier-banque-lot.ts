// audio/clavier-banque-lot.ts — Une zone de banque calculée seule, sans `AudioBuffer`.
//
// POURQUOI CE FICHIER EXISTE. La banque de clavier est le calcul le plus long du catalogue :
// **mesuré sur trois secondes de son, 14 390 millisecondes, sans qu'un seul message passe.** Elle ne
// se découpe pas par canal — c'est le même son qu'elle transpose vers chaque racine —, si bien que
// le socle par canal n'y voyait qu'une seule tâche. Elle se découpe par ZONE, et les zones ne se
// connaissent pas : dix-neuf transpositions indépendantes, qui peuvent tourner de front.
//
// CE QUI EST ÉCRIT ICI NE TOUCHE DONC JAMAIS À `AudioBuffer` : il n'existe pas dans un ouvrier. Les
// voies sont des tableaux, la fréquence d'échantillonnage voyage à côté, et c'est le composant qui
// refait les tampons une fois les zones revenues.

import { changerTonaliteVoie } from "./effets-spectral";
import { separerStn } from "./stn";
import { planZones, type Boucle, type PlanZone } from "./clavier-banque";

/** Comment la zone est transposée depuis la source. Les trois méthodes du composant. */
export type MethodeBanque = "duree" | "bande" | "attaque";

/** Tout ce qu'une zone demande, sérialisable de bout en bout. */
export interface OptionsLotBanque {
  /** Le son source, une voie par canal. */
  voies: Float32Array[];
  frequence: number;
  methode: MethodeBanque;
  racineSource: number;
  noteBasse: number;
  noteHaute: number;
  largeur: number;
  suiviTouche: number;
  boucle: boolean;
  boucleDebut: number;
  boucleLongueur: number;
}

/** Une zone, telle qu'elle revient d'un ouvrier : des tableaux, et sa place sur le clavier. */
export interface ZoneBrute extends PlanZone {
  voies: Float32Array[];
  boucle?: Boucle;
}

/**
 * Ce qui se prépare UNE FOIS par lot, et non à chaque zone.
 *
 * La méthode « attaque préservée » décompose le son source en sinus, transitoires et bruit. Cette
 * décomposition ne dépend pas de la racine visée : la refaire par zone la paierait dix-neuf fois.
 */
export interface PrepareBanque {
  plan: PlanZone[];
  /** Pour « attaque » seulement : la part tenue et les transitoires, voie par voie. */
  tenu?: Float32Array[];
  transitoires?: Float32Array[];
}

export function preparerBanque(o: OptionsLotBanque): PrepareBanque {
  const plan = planZones(o.noteBasse, o.noteHaute, o.largeur, o.racineSource);
  if (o.methode !== "attaque") return { plan };
  const parties = o.voies.map((v) => separerStn(v));
  return {
    plan,
    tenu: parties.map((p) => Float32Array.from(p.sinus, (v, i) => v + p.bruit[i])),
    transitoires: parties.map((p) => p.transitoires),
  };
}

/** La transposition « bande » : on relit plus vite ou plus lentement, la durée suit la hauteur. */
function relireVoie(x: Float32Array, ratio: number): Float32Array {
  const n = Math.max(1, Math.round(x.length / ratio));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * ratio, k = Math.floor(p), f = p - k;
    out[i] = (x[k] ?? 0) * (1 - f) + (x[k + 1] ?? x[k] ?? 0) * f;
  }
  return out;
}

/** Tronque une voie avec un fondu, sans toucher à la hauteur. */
function tronquerVoie(x: Float32Array, longueur: number, fondu: number): Float32Array {
  const n = Math.max(1, Math.min(x.length, Math.round(longueur)));
  const out = x.slice(0, n);
  const f = Math.min(Math.round(fondu), n);
  for (let i = 0; i < f; i++) out[n - f + i] *= 1 - i / f;
  return out;
}

/** Les bornes de la boucle de maintien, en échantillons. Les mêmes règles que dans le composant. */
function bornesVoie(longueur: number, frequence: number, o: OptionsLotBanque): Boucle | undefined {
  const debut = Math.round(longueur * Math.min(0.9, Math.max(0.05, o.boucleDebut)));
  const bout = Math.round(longueur * 0.95);
  const tour = Math.round(Math.max(0.05, o.boucleLongueur) * frequence);
  const fin = Math.max(debut + 32, Math.min(bout, debut + tour));
  return fin < longueur ? { debut, fin } : undefined;
}

/**
 * Une zone du plan, transposée depuis la source.
 *
 * Les opérations sont celles du composant, sans changement : transposition selon la méthode,
 * raccourcissement selon le suivi de touche, puis les bornes de la boucle de maintien.
 */
export function zoneDuLot(indice: number, o: OptionsLotBanque, p: PrepareBanque): ZoneBrute {
  const place = p.plan[indice];
  const demiTons = place.racine - o.racineSource;

  let voies: Float32Array[];
  if (demiTons === 0 && o.methode !== "bande") {
    voies = o.voies.map((v) => v.slice());
  } else if (o.methode === "bande") {
    voies = o.voies.map((v) => relireVoie(v, Math.pow(2, demiTons / 12)));
  } else if (o.methode === "attaque") {
    const tenu = p.tenu!, tr = p.transitoires!;
    voies = tenu.map((v, c) => {
      const decale = changerTonaliteVoie(v, demiTons);
      const out = new Float32Array(o.voies[c].length);
      for (let i = 0; i < out.length; i++) out[i] = (decale[i] ?? 0) + tr[c][i];
      return out;
    });
  } else {
    voies = o.voies.map((v) => changerTonaliteVoie(v, demiTons));
  }

  if (o.suiviTouche > 0 && demiTons !== 0) {
    // Plus aigu, plus court : la durée est divisée par deux à l'octave quand le suivi vaut un.
    const facteur = Math.pow(2, (-o.suiviTouche * demiTons) / 12);
    if (facteur < 1) {
      voies = voies.map((v) => tronquerVoie(v, v.length * facteur, o.frequence * 0.01));
    }
  }

  const zone: ZoneBrute = { ...place, voies };
  if (o.boucle) {
    const b = bornesVoie(voies[0]?.length ?? 0, o.frequence, o);
    if (b) zone.boucle = b;
  }
  return zone;
}
