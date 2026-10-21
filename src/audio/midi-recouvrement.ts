// audio/midi-recouvrement.ts — Lever l'ambiguïté d'une hauteur rejouée avant d'être relâchée.
//
// LE DÉFAUT, ET POURQUOI IL EST INVISIBLE DE L'INTÉRIEUR. Deux notes de MÊME HAUTEUR sur un MÊME
// CANAL dont les durées se chevauchent n'ont pas de sens unique en MIDI : le protocole ne transporte
// pas des notes mais des ordres, et rien n'attache un note-off à l'un des deux note-on. Un lecteur
// conforme relance la note au second note-on, puis le PREMIER note-off éteint tout : le son s'arrête
// là, et le second note-off tombe dans le vide. Le lecteur du logiciel, lui, apparie les notes et
// les retrouve toutes. L'export ne sonne donc pas comme l'application, et rien dans le logiciel ne
// peut le montrer — il faut confronter les octets à la norme, ce que fait
// `plugins/midi-norme.test.ts`.
//
// MESURÉ LE 2026-09-27, sur sept composants : l'écart de durée sonnante entre les deux lectures vaut
// 4,114 s pour `arpege-koch`, 6,300 s pour `automate-cellulaire`, 0,206 s pour `boite-groove`, et
// 9 des 36 notes de `motif-echo-notes` tombent à durée nulle chez un lecteur conforme.
//
// LE REMÈDE : ÉCOURTER, ET NON FUSIONNER. La note ouverte est refermée à l'instant où la même
// hauteur se rejoue. Les DEUX ATTAQUES subsistent, et la durée sonnante totale ne change pas : un
// lecteur conforme entend désormais ce que l'application joue. Fusionner les deux notes en une seule
// aurait rendu le fichier conforme en perdant la réattaque, c'est-à-dire en changeant le rythme.
//
// LE NOTE-OFF TOMBE AU MÊME TICK QUE LE NOTE-ON QUI RELANCE, et c'est licite : l'ordre dans un tick
// est celui de `midi-ordre.ts`, réglages, puis note-off, puis note-on. L'ancienne note se referme
// donc avant que la nouvelle ne s'ouvre, et aucune des deux ne perd sa durée.
//
// CE MODULE N'IMPORTE QUE `midi-ordre.ts`, qui n'importe rien : il peut servir depuis un worker. La
// règle est celle de ce voisin — un module partagé avec un worker ne doit atteindre ni React, ni
// l'interface, ni l'i18n.
import { comparerEvenementsMidi } from "./midi-ordre";

/** Un événement MIDI à tick ABSOLU, tel que les écrivains du dépôt le manipulent avant le tri. */
export type EvenementTick = {
  tick: number;
  type: string;
  channel?: number;
  noteNumber?: number;
  velocity?: number;
  [autre: string]: unknown;
};

/** Un note-on de vélocité nulle est un note-off : c'est la convention du protocole, pas un cas rare. */
const estOuverture = (e: EvenementTick) => e.type === "noteOn" && Number(e.velocity ?? 0) > 0;
const estFermeture = (e: EvenementTick) =>
  e.type === "noteOff" || (e.type === "noteOn" && Number(e.velocity ?? 0) === 0);

/** Ce qui rend deux notes ambiguës : le même canal ET la même hauteur. Un accord n'est pas concerné. */
const cleDe = (e: EvenementTick) => `${e.channel ?? 0}/${e.noteNumber}`;

/**
 * Écourte toute note qu'une autre de même hauteur et de même canal vient relancer.
 *
 * Rend une liste NEUVE, triée par `comparerEvenementsMidi` ; la liste reçue n'est pas touchée. Les
 * événements qui ne sont pas des notes gardent leur tick et leur rang.
 *
 * Deux attaques au MÊME tick ne peuvent pas s'écourter l'une l'autre, faute de place entre elles :
 * elles ne décrivent qu'une seule note, et c'est la plus longue des deux qui est gardée.
 *
 * Un note-off sans note ouverte traverse sans être touché : il ne décrit aucune note à écourter, et
 * le signaler est l'affaire du garde, pas de la réparation.
 */
export function resoudreRecouvrements<T extends EvenementTick>(evenements: T[]): T[] {
  // COPIE D'ABORD : la fonction écrit les nouveaux ticks de fermeture, et le faire sur les objets
  // reçus changerait la piste de l'appelant sous ses pieds.
  const ordonnes = evenements.map((e) => ({ ...e })).sort(comparerEvenementsMidi);

  // Appariement premier entré, premier sorti : c'est la lecture que fait l'application.
  const enAttente = new Map<string, (typeof ordonnes)[number][]>();
  const notes: { on: (typeof ordonnes)[number]; off: (typeof ordonnes)[number] }[] = [];
  for (const e of ordonnes) {
    if (estOuverture(e)) {
      const file = enAttente.get(cleDe(e)) ?? [];
      file.push(e);
      enAttente.set(cleDe(e), file);
    } else if (estFermeture(e)) {
      const on = enAttente.get(cleDe(e))?.shift();
      if (on) notes.push({ on, off: e });
    }
  }

  const parCle = new Map<string, typeof notes>();
  for (const n of notes) {
    const liste = parCle.get(cleDe(n.on)) ?? [];
    liste.push(n);
    parCle.set(cleDe(n.on), liste);
  }

  const aRetirer = new Set<(typeof ordonnes)[number]>();
  for (const liste of parCle.values()) {
    liste.sort((a, b) => a.on.tick - b.on.tick || a.off.tick - b.off.tick);
    for (let i = 0; i + 1 < liste.length; i++) {
      const avant = liste[i], apres = liste[i + 1];
      if (apres.on.tick >= avant.off.tick) continue; // aucun recouvrement
      if (apres.on.tick > avant.on.tick) {
        avant.off.tick = apres.on.tick;
        continue;
      }
      avant.off.tick = Math.max(avant.off.tick, apres.off.tick);
      aRetirer.add(apres.on);
      aRetirer.add(apres.off);
      liste.splice(i + 1, 1);
      i--; // la note gardée se compare à celle qui suivait la doublure.
    }
  }

  return (ordonnes.filter((e) => !aRetirer.has(e)) as T[]).sort(comparerEvenementsMidi);
}
