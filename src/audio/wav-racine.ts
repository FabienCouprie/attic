// audio/wav-racine.ts — La note racine qu'un fichier WAV déclare lui-même.
//
// Un SFZ peut écrire `pitch_keycenter=sample` : « This causes the SFZ player to look in the sample
// file metadata for the keycenter value » (sfzformat.com). Dans un WAV, cette métadonnée est le bloc
// `smpl` du format RIFF, dont le quatrième champ, « MIDI unity note », dit la touche à laquelle
// l'échantillon sonne juste. Ce module ne fait que la lire, sur les octets bruts : le décodeur audio
// du navigateur ne rend que les échantillons, et jette tout le reste.

/** Les octets d'un bloc `smpl` avant la note racine : fabricant, produit, période d'échantillon. */
const AVANT_LA_RACINE = 12;

/**
 * La note racine d'un WAV, lue dans son bloc `smpl`, ou null s'il n'en déclare pas.
 *
 * Null aussi pour ce qui n'est pas un WAV, pour un bloc tronqué, et pour une note hors de 0 à 127 :
 * la référence dit d'un fichier sans cette information qu'il « defaults to MIDI note 0 », et c'est à
 * l'appelant de l'appliquer et de le dire.
 */
export function racineDuWav(octets: ArrayBuffer | Uint8Array): number | null {
  const o = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  if (o.length < 12) return null;
  const vue = new DataView(o.buffer, o.byteOffset, o.byteLength);
  const etiquette = (i: number) => String.fromCharCode(o[i], o[i + 1], o[i + 2], o[i + 3]);
  if (etiquette(0) !== "RIFF" || etiquette(8) !== "WAVE") return null;
  for (let i = 12; i + 8 <= o.length;) {
    const taille = vue.getUint32(i + 4, true);
    if (etiquette(i) === "smpl") {
      if (taille < AVANT_LA_RACINE + 4 || i + 8 + AVANT_LA_RACINE + 4 > o.length) return null;
      const note = vue.getUint32(i + 8 + AVANT_LA_RACINE, true);
      return note <= 127 ? note : null;
    }
    // Un bloc de taille impaire est suivi d'un octet de bourrage, que RIFF impose.
    i += 8 + taille + (taille % 2);
  }
  return null;
}
