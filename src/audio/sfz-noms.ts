// audio/sfz-noms.ts — Un nom de fichier par son, et jamais deux sons sous un même nom.
//
// L'export d'une banque en SFZ écrit un WAV par zone et le désigne dans le texte. Le nom vient de
// `nomEchantillon`, qui ne dit que la racine et la couche. Ce module garantit le reste : deux sons
// différents ne reçoivent jamais le même nom, et l'écriture du texte comme celle des WAV le lisent
// ici, si bien que le texte désigne toujours le fichier qui a été écrit.
import type { Zone } from "./clavier-banque";

/**
 * Les noms des échantillons d'une banque, un par zone, dans l'ordre des zones.
 *
 * DEUX SONS NE PARTAGENT PLUS UN NOM. Deux zones à la même racine, sur deux plages de touches ou
 * sous deux désaccords, portaient le même, et l'export écrivait le second WAV par-dessus le premier :
 * la région basse jouait alors le son de la haute. Le second reçoit un suffixe, `zone-060-2.wav`.
 *
 * UN MÊME SON GARDE UN SEUL FICHIER : deux zones qui partagent le même tampon partagent aussi le nom,
 * comme deux régions d'un SFZ lu qui désignent le même WAV. Le premier nom de chaque son reste celui
 * qu'il avait, et une banque sans collision s'écrit exactement comme avant.
 */
export function nomsEchantillons(zones: readonly Zone[], nommer: (zone: Zone) => string): string[] {
  const parNom = new Map<string, AudioBuffer>();
  return zones.map((zone) => {
    const base = nommer(zone);
    let nom = base;
    for (let k = 2; parNom.has(nom) && parNom.get(nom) !== zone.audio; k++) nom = base.replace(/\.wav$/i, `-${k}.wav`);
    parNom.set(nom, zone.audio);
    return nom;
  });
}
