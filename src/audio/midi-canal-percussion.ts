// audio/midi-canal-percussion.ts — Le canal dix d'un fichier MIDI, rendu en batterie.
//
// LE DÉFAUT, RELEVÉ LE 2026-11-23 DANS L'APPLICATION. Un « Rythme euclidien » rendu par « Point
// d'écoute MIDI » sonnait au piano ; la console disait `canal 9 -> programme 0 banque=0 -> preset
// "Yamaha Grand Piano" (12 notes)`. Le fichier n'écrit ni banque ni programme sur son canal dix, et
// le General MIDI ne le lui demande pas : ce canal est celui de la batterie par définition. Le rendu
// le traitait pourtant comme les quinze autres, programme 0 et banque 0, et le SoundFont rendait
// son premier piano. En FM, le même canal partait en hauteurs : une grosse caisse écrite en 36
// s'entendait en note de soixante-cinq hertz.
//
// LA RÈGLE, CHOISIE PAR FABIEN LE 2026-11-24 : le canal dix joue un kit de la banque 128 du SoundFont
// chargé, celle que la norme SF2 réserve aux percussions. Le programme du canal choisit le kit, ce
// qu'un lecteur General MIDI fait aussi (dans FluidR3 : 0 Standard, 25 TR-808, 32 Jazz). Une banque
// de 128 ou plus écrite dans le fichier est gardée telle quelle. Le même fichier sonne donc ici
// comme chez n'importe quel lecteur, et le kit qu'un générateur y écrit est celui qu'on entend.
//
// CE QUI SE PASSE QUAND LE KIT N'Y EST PAS, dans cet ordre : le kit Standard (programme 0), puis le
// premier kit de la banque 128, puis le synthétiseur de percussions interne. Le repli de
// `chercherZonesInstrument` sur le premier preset du fichier n'est jamais atteint pour ce canal :
// c'est lui qui rendait le piano.
//
// LE RÉGLAGE « INSTRUMENT » D'UN NŒUD : un kit choisi (banque 128 ou plus) s'applique au canal dix ;
// un preset mélodique ne le touche pas, pour la même raison qu'un lecteur General MIDI ne joue pas
// de violon sur son canal de batterie. Les autres canaux suivent le réglage comme avant.

import { CANAL_PERCUSSION } from "./batterie-midi";
import type { Note } from "./note";
import { RESERVE_BATTERIE } from "./sequence-percussion";
import type { PresetSF2 } from "./soundfont";

/** La banque que la norme SF2 réserve aux kits de percussion. */
export const BANQUE_PERCUSSION_SF2 = 128;

/**
 * La graine du bruit des percussions rendues par le synthétiseur interne.
 *
 * FIXE, PARCE QUE CE RENDU N'A PAS DE RÉGLAGE DE GRAINE et qu'un fichier MIDI joué deux fois doit
 * sonner deux fois pareil. Sans elle, la caisse claire et le charley tireraient leur bruit au hasard
 * à chaque passe, là où la voie FM des autres canaux est entièrement déterministe.
 */
export const GRAINE_BATTERIE_MIDI = 1;

/** Ce qui rend un canal : un preset du SoundFont, ou le synthétiseur de percussions. */
export type VoieDuCanal =
  | { voie: "soundfont"; programme: number; banque: number }
  | { voie: "synthetiseur" };

/**
 * La voie qui rend un canal, au SoundFont.
 *
 * @param presets les presets du SoundFont chargé.
 * @param duFichier le programme et la banque que le fichier donne à ce canal.
 * @param impose le programme et la banque d'un réglage « Instrument » ; négatifs ou absents, le
 *        fichier est suivi.
 */
export function voieDuCanal(
  presets: readonly Pick<PresetSF2, "programme" | "banque">[],
  canal: number,
  duFichier: { programme: number; banque: number },
  impose: { programme?: number; banque?: number } = {},
): VoieDuCanal {
  const { programme: programmeImpose = -1, banque: banqueImposee = -1 } = impose;
  if (canal !== CANAL_PERCUSSION) {
    return {
      voie: "soundfont",
      programme: programmeImpose >= 0 ? programmeImpose : duFichier.programme,
      banque: banqueImposee >= 0 ? banqueImposee : duFichier.banque,
    };
  }

  const kitImpose = programmeImpose >= 0 && banqueImposee >= BANQUE_PERCUSSION_SF2;
  const voulu = kitImpose
    ? { programme: programmeImpose, banque: banqueImposee }
    : {
      programme: duFichier.programme,
      banque: duFichier.banque >= BANQUE_PERCUSSION_SF2 ? duFichier.banque : BANQUE_PERCUSSION_SF2,
    };

  const existe = (programme: number, banque: number) =>
    presets.some((p) => p.programme === programme && p.banque === banque);
  if (existe(voulu.programme, voulu.banque)) return { voie: "soundfont", ...voulu };
  if (existe(0, BANQUE_PERCUSSION_SF2)) return { voie: "soundfont", programme: 0, banque: BANQUE_PERCUSSION_SF2 };
  const kits = presets.filter((p) => p.banque === BANQUE_PERCUSSION_SF2).map((p) => p.programme);
  if (kits.length > 0) return { voie: "soundfont", programme: Math.min(...kits), banque: BANQUE_PERCUSSION_SF2 };
  return { voie: "synthetiseur" };
}

/**
 * Ajoute à un tampon les frappes rendues par le synthétiseur de percussions.
 *
 * LA RÉSERVE EST CELLE DU RENDU D'UNE SÉQUENCE, `RESERVE_BATTERIE`, et pour la même raison mesurée :
 * le synthétiseur sort au niveau plein, et additionné tel quel aux hauteurs il les couvrait de huit
 * décibels. LA DURÉE DU TAMPON L'EMPORTE : la queue d'une cymbale qui dépasse est coupée, comme
 * l'est une note tenue trop longue.
 */
export async function ajouterBatterieSynthetisee(
  cible: AudioBuffer, frappes: readonly Note[], volume: number,
): Promise<void> {
  if (frappes.length === 0) return;
  const { rendreBatterieMidi } = await import("./tone-synths");
  const batterie = await rendreBatterieMidi({
    notes: frappes.map(({ note, velocite, debut, fin }) => ({ note, velocite, debut, fin })),
    volume: volume * RESERVE_BATTERIE,
    sampleRate: cible.sampleRate,
    graine: GRAINE_BATTERIE_MIDI,
  });
  for (let c = 0; c < cible.numberOfChannels; c++) {
    const dst = cible.getChannelData(c);
    const src = batterie.getChannelData(Math.min(c, batterie.numberOfChannels - 1));
    const n = Math.min(dst.length, src.length);
    for (let i = 0; i < n; i++) dst[i] += src[i];
  }
}
