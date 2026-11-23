// audio/choral-corpus-essai.ts — Un corpus de chorals fabriqué par les règles, à graine, pour éprouver
// ce qui apprend sur un corpus.
//
// DES SOPRANOS QUI POURRAIENT ÊTRE CEUX D'UN CHORAL : des noires en do majeur, entre mi 4 et fa 5, qui
// avancent par degrés conjoints ou par tierces, et finissent sur ré puis do. Chacun est harmonisé par
// « Harmoniser à quatre voix » à une température qui varie les choix, à sa propre graine.

import { creerAleatoire } from "../core/hasard";
import { estRefusHarmonisation, harmoniserChoral } from "./choral-harmoniser";
import type { Corpus } from "./corpus";
import type { Sequence } from "./sequence";

const DEGRES_DO = [64, 65, 67, 69, 71, 72, 74, 76, 77];

/** Un soprano de `longueur` noires, tiré à la graine. */
export function sopranoDEssai(graine: number, longueur = 8): Sequence {
  const a = creerAleatoire(graine);
  let rang = 2 + Math.floor(a() * 5);
  const hauteurs: number[] = [];
  for (let k = 0; k < longueur - 2; k++) {
    hauteurs.push(DEGRES_DO[rang]);
    const pas = [-2, -1, -1, 1, 1, 2][Math.floor(a() * 6)];
    rang = Math.max(0, Math.min(DEGRES_DO.length - 1, rang + pas));
  }
  hauteurs.push(74, 72);
  return { notes: hauteurs.map((note, k) => ({ note, velocite: 80, debut: k, fin: k + 1, voix: 0 })), tempo: 60 };
}

/** `pieces` chorals en do majeur, chacun harmonisé par les règles à la température `temperature`. */
export async function corpusDEssaiParLesRegles(pieces: number, graine: number, temperature = 0.5): Promise<Corpus> {
  const corpus: Corpus = { pieces: [] };
  for (let k = 0; k < pieces; k++) {
    const r = await harmoniserChoral(sopranoDEssai(graine * 1000 + k), {
      tonique: 0, mode: "majeur", pas: 1, septiemes: "dominante", renversements: true, temperature, graine: graine * 1000 + k + 1,
    });
    if (estRefusHarmonisation(r)) continue;
    const sequence: Sequence = { notes: r.notes, tempo: 60, voix: ["soprano", "alto", "ténor", "basse"].map((nom, numero) => ({ numero, nom })) };
    // LA TONALITÉ EST CELLE QUE L'HARMONISEUR A REÇUE, écrite comme une armure : sur huit noires,
    // la lecture par les notes en prend trois sur vingt-quatre pour sol (`corpus-tonalite.ts`).
    corpus.pieces.push({ sequence, source: `essai-${k + 1}`, tonalite: { tonique: 0, mode: "majeur", origine: "armure" } });
  }
  return corpus;
}
