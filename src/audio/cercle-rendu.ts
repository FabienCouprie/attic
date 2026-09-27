// audio/cercle-rendu.ts — Où un cercle cesse d'être une figure et devient des notes datées.
//
// C'EST LE SEUL ENDROIT OÙ LE TEMPS ENTRE. Un cercle ne porte ni tempo, ni durée, ni nuance : il ne
// dit que combien de places il compte et lesquelles sonnent. Tout ce qui se mesure en secondes est
// fourni ici, ce qui laisse la géométrie intacte en amont — on peut tourner un cercle, le réfléchir
// et en prendre le complémentaire sans qu'aucune de ces opérations n'ait à connaître une seconde.
//
// DEUX FAÇONS DE FAIRE TOURNER PLUSIEURS CERCLES ENSEMBLE, et elles ne font pas la même musique.
// À cycle partagé, tous les cercles font un tour dans le même temps : seize places et douze places
// se retrouvent à chaque tour, et c'est la polyrythmie. C'est ce que fait le cercle rythmique en
// ligne, dont l'aiguille unique impose sa vitesse angulaire à tous ses anneaux. À pulsation
// partagée, c'est la place qui dure le même temps partout : le cercle de seize met plus longtemps
// que celui de douze, ils se décalent, et l'on obtient un déphasage.

import type { Cercle } from "./cercle";
import type { Note } from "./note";
import type { Sequence } from "./sequence";

/** Le canal de percussion du General MIDI, tel qu'il s'écrit dans les octets. */
const CANAL_PERCUSSION = 9;

export type BaseDeTemps = "cycle" | "pulsation";

export interface OptionsRendu {
  /** Tours par minute. C'est la vitesse de l'aiguille, non celle d'une noire. */
  tempo: number;
  /** Ce que les cercles partagent quand ils sont plusieurs. */
  base: BaseDeTemps;
  /** Combien de fois le plus long des cercles fait son tour. */
  tours: number;
  /** La nuance de toutes les notes. Un cercle n'en porte pas : elle est constante par construction. */
  velocite: number;
}

export const RENDU_DEFAUT: OptionsRendu = { tempo: 30, base: "cycle", tours: 4, velocite: 100 };

/**
 * La durée d'une place, cercle par cercle.
 *
 * À CYCLE PARTAGÉ, une place vaut le tour divisé par le nombre de places : elle est donc plus
 * courte sur un cercle plus fin. « Toutes les attaques ont la même durée » est vrai à l'intérieur
 * d'un cercle, et faux d'un cercle à l'autre.
 *
 * À PULSATION PARTAGÉE, c'est l'inverse : la place vaut partout la même chose, et c'est le tour qui
 * s'allonge avec le nombre de places. La référence est le plus grand cercle, qui garde le tour
 * nominal ; les autres sont plus courts et se décalent contre lui.
 */
export function dureeDUnePlace(positions: number, placesMax: number, o: OptionsRendu): number {
  const tour = 60 / Math.max(1e-6, o.tempo);
  return o.base === "cycle" ? tour / Math.max(1, positions) : tour / Math.max(1, placesMax);
}

/**
 * Les cercles en notes datées.
 *
 * CHAQUE CERCLE DEVIENT UNE VOIX, ce qui n'est pas qu'un rangement : la séquence se lit ensuite sur
 * le rouleau, où les voix se distinguent par leur couleur, et se grave avec une portée par voix.
 *
 * UN CERCLE COUPÉ EN COURS DE TOUR N'EST PAS UN DÉFAUT. À pulsation partagée, un cercle plus court
 * que le plus long ne tombe pas juste à la fin : ses attaques au-delà de la durée rendue sont
 * simplement absentes, comme une pièce qu'on arrête. C'est ce qui donne son sens au déphasage.
 */
export function rendreCercles(
  entrees: readonly (Cercle | readonly Cercle[])[], options: Partial<OptionsRendu> = {},
): Sequence {
  const o = { ...RENDU_DEFAUT, ...options };
  // Chaque entrée devient une VOIX, et une voix est une suite de cercles qui se suivent, un par
  // tour. Une entrée qui ne porte qu'un cercle est une suite d'un, et rien ne change pour elle.
  const voies = entrees
    .map((e) => (Array.isArray(e) ? e : [e as Cercle]).filter((c) => c && c.sommets.length > 0))
    .filter((suite) => suite.length > 0);
  if (voies.length === 0) return { notes: [], duree: 0 };

  const tous = voies.flat();
  const placesMax = Math.max(...tous.map((c) => c.positions));
  const tour = 60 / Math.max(1e-6, o.tempo);
  // Le plus long tour donne la longueur du rendu : à cycle partagé ils sont tous égaux, à pulsation
  // partagée c'est celui du plus grand cercle.
  const tourLePlusLong = o.base === "cycle"
    ? tour
    : Math.max(...tous.map((c) => c.positions * dureeDUnePlace(c.positions, placesMax, o)));
  // LES TOURS SE COMPTENT PAR CERCLE DE LA SUITE, non pour la voix entière : une suite de quatre
  // variations à un tour chacune fait quatre tours. Une suite d'un cercle retrouve exactement le
  // compte d'avant, ce qui est la condition pour que rien de ce qui existe ne bouge.
  const varie = Math.max(...voies.map((s) => s.length));
  const toursEnTout = varie * Math.max(1, Math.round(o.tours));
  const totale = tourLePlusLong * toursEnTout;

  const notes: Note[] = [];
  for (const [voix, suite] of voies.entries()) {
    // UNE VOIX TOURNE JUSQU'À REMPLIR LA DURÉE, et non un nombre fixe de tours : c'est ce qui fait
    // le déphasage, un cercle plus court repartant avant l'autre. Le tour t joue le cercle t de la
    // suite, et UNE SUITE PLUS COURTE SE REJOUE DEPUIS SON DÉBUT — laisser la voix muette après sa
    // dernière variation donnerait un silence que personne n'a écrit.
    let depart = 0;
    for (let t = 0; depart < totale - 1e-9; t++) {
      const c = suite[t % suite.length];
      const place = dureeDUnePlace(c.positions, placesMax, o);
      const sonTour = c.positions * place;
      if (sonTour <= 0) break;
      for (const s of c.sommets) {
        const debut = depart + s.position * place;
        if (debut >= totale - 1e-9) continue;
        notes.push({
          note: s.valeur,
          velocite: o.velocite,
          debut,
          // UNE ATTAQUE DURE UNE PLACE, et ne tient pas jusqu'à la suivante. Un cercle mesure un
          // rythme : ses attaques ont toutes la même valeur, et l'espace entre elles est du silence.
          fin: Math.min(totale, debut + place),
          ...(c.sorte === "percussion" ? { canal: CANAL_PERCUSSION } : {}),
          voix,
        });
      }
      depart += sonTour;
    }
  }
  notes.sort((a, b) => a.debut - b.debut || a.note - b.note);

  const nomDeVoie = (s: readonly Cercle[], i: number) => s.length === 1
    ? `Cercle ${i + 1} · ${s[0].positions}`
    : `Cercle ${i + 1} · ${s.length} variations`;
  return {
    notes,
    duree: totale,
    titre: voies.length === 1 && voies[0].length === 1
      ? `Cercle de ${voies[0][0].positions}`
      : `${voies.length} cercles · ${voies.map((s) => s[0].positions).join(" contre ")}`,
    voix: voies.map((s, i) => ({ numero: i, nom: nomDeVoie(s, i) })),
  };
}
