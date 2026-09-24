// audio/pistes-visu.ts — Ce qu'il faut garder d'une piste pour la dessiner, et rien de plus.
//
// POURQUOI UNE ENVELOPPE ET NON LE SON. Dessiner six pistes en gardant six sons revient à retenir
// six tampons entiers, quand ce dépôt a déjà un budget d'aperçus et un mode d'économie de mémoire
// pour cette raison précise. Deux mille quarante-huit colonnes par piste font quatre mille nombres :
// seize kilo-octets pour six pistes, contre des dizaines de mégaoctets.
//
// CE QUE CELA COÛTE, ET IL FAUT LE DIRE. La finesse du tracé est fixée au calcul : sur trois minutes,
// une colonne couvre quatre-vingt-huit millisecondes. C'est de quoi comparer deux prises, aligner une
// entrée, voir où un son s'arrête ; ce n'est pas de quoi chercher un clic.
//
// UNE BANDE PAR PISTE, LES CANAUX CONFONDUS. On garde le plus bas et le plus haut de TOUS les canaux
// à cet instant : une bande qui n'aurait lu que le canal gauche cacherait ce qui ne se produit qu'à
// droite, et c'est justement ce qu'on vient regarder quand on compare des pistes.

import { enveloppeDeValeurs, type Colonne } from "./courbe-trace";

/** Le nombre de colonnes gardées par piste. Voir l'en-tête pour ce que cela borne. */
export const COLONNES_PISTE = 2048;

export interface PisteVisu {
  /** Le rang de l'entrée, pour que la piste 3 reste la piste 3 quel que soit l'ordre des câbles. */
  piste: number;
  dureeSec: number;
  /** La crête absolue de la piste, de quoi dire ce qu'on voit sans le mesurer sur le dessin. */
  crete: number;
  colonnes: Colonne[];
}

/**
 * L'enveloppe d'un tampon, tous canaux confondus.
 *
 * Le parcours est fait canal par canal plutôt qu'échantillon par échantillon à travers les canaux :
 * `getChannelData` rend un tableau par appel, et le rappeler dans la boucle interne coûterait un
 * appel par échantillon.
 */
export function enveloppeDeTampon(buffer: AudioBuffer, colonnes = COLONNES_PISTE): Colonne[] {
  const n = buffer.length;
  if (n === 0) return [];
  const k = Math.min(Math.floor(colonnes), n);
  if (buffer.numberOfChannels === 1) return enveloppeDeValeurs(buffer.getChannelData(0), k);

  const min = new Float32Array(k).fill(Number.POSITIVE_INFINITY);
  const max = new Float32Array(k).fill(Number.NEGATIVE_INFINITY);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < k; i++) {
      const debut = Math.floor((i * n) / k);
      const fin = Math.max(debut + 1, Math.floor(((i + 1) * n) / k));
      let bas = min[i], haut = max[i];
      for (let j = debut; j < fin; j++) {
        if (d[j] < bas) bas = d[j];
        if (d[j] > haut) haut = d[j];
      }
      min[i] = bas; max[i] = haut;
    }
  }
  const out: Colonne[] = new Array(k);
  for (let i = 0; i < k; i++) out[i] = { min: min[i], max: max[i] };
  return out;
}

/** La crête absolue d'une enveloppe : elle suffit, les extrêmes du son y étant par construction. */
export const creteDeColonnes = (colonnes: readonly Colonne[]): number => {
  let c = 0;
  for (const col of colonnes) c = Math.max(c, Math.abs(col.min), Math.abs(col.max));
  return c;
};
