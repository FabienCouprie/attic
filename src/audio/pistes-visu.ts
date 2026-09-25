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
//
// DEUX GRAINS COHABITENT ICI. Le grossier, ci-dessous, pour qui ne fait que regarder un axe entier ;
// le fin, en seconde moitié de fichier, pour qui veut y plonger. Le second ne remplace pas le
// premier : ils ne coûtent pas la même chose, et tous les affichages n'ont pas besoin du même.

import { enveloppeDeValeurs, type Colonne } from "./courbe-trace";

/** Le nombre de colonnes gardées par piste. Voir l'en-tête pour ce que cela borne. */
export const COLONNES_PISTE = 2048;

export interface PisteVisu {
  /** Le rang de l'entrée, pour que la piste 3 reste la piste 3 quel que soit l'ordre des câbles. */
  piste: number;
  dureeSec: number;
  /** La crête absolue de la piste, de quoi dire ce qu'on voit sans le mesurer sur le dessin. */
  crete: number;
  /** L'enveloppe fine, dans laquelle la vue taille la portion qu'elle dessine. Voir plus bas. */
  fine: EnveloppeFine;
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

// ── L'enveloppe fine, celle dans laquelle on plonge ────────────────────────────────────────────
//
// DEUX MILLE COLONNES SE REGARDENT, ELLES NE SE FOUILLENT PAS. Agrandir un tracé de deux mille
// colonnes ne montre rien de plus : la finesse est fixée au calcul, et zoomer sur un clic donne un
// rectangle large de quatre-vingt-huit millisecondes. L'enveloppe fine garde trente-deux fois plus
// de colonnes, ce qui ramène ces quatre-vingt-huit millisecondes à deux virgule sept sur la même
// durée de trois minutes.
//
// ELLE RESTE UNE ENVELOPPE, ET NON UN SON — décision de Fabien, reprise de l'en-tête de ce fichier.
// Deux Float32Array de soixante-cinq mille valeurs font un demi-méga par piste, trois pour six
// pistes, ET CE POIDS NE DÉPEND PAS DE LA DURÉE : une heure de prise coûte autant qu'une seconde,
// là où garder les tampons coûterait soixante-trois mégaoctets par tranche de trois minutes.
//
// CE QUE CELA BORNE, ET IL FAUT LE DIRE AUSSI. En deçà d'une colonne, la vue agrandit au lieu de
// gagner : on descend jusqu'au millier de secondes, jamais jusqu'à l'échantillon.
//
// DES TABLEAUX TYPÉS PLUTÔT QU'UN TABLEAU D'OBJETS : soixante-cinq mille objets `{min, max}` par
// piste, c'est quatre cent mille objets pour six pistes, que le ramasse-miettes revisite à chaque
// passe. Deux Float32Array n'en font aucun.

/** Colonnes de l'enveloppe fine gardée par piste. Voir ci-dessus pour ce que cela coûte et borne. */
export const COLONNES_FINES = 65536;

export interface EnveloppeFine {
  min: Float32Array;
  max: Float32Array;
}

/**
 * L'enveloppe fine d'un tampon, tous canaux confondus.
 *
 * Le parcours coûte la même chose qu'une enveloppe grossière — chaque échantillon est lu une fois
 * par canal dans les deux cas —, seul le nombre de cases d'arrivée change.
 */
export function enveloppeFine(buffer: AudioBuffer, colonnes = COLONNES_FINES): EnveloppeFine {
  const n = buffer.length;
  const k = n === 0 ? 0 : Math.max(1, Math.min(Math.floor(colonnes), n));
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
  return { min, max };
}

/** La crête absolue d'une enveloppe fine. */
export function creteDenveloppe(env: EnveloppeFine): number {
  let c = 0;
  for (let i = 0; i < env.min.length; i++) {
    const bas = Math.abs(env.min[i]), haut = Math.abs(env.max[i]);
    if (bas > c) c = bas;
    if (haut > c) c = haut;
  }
  return c;
}

/**
 * Une portion de l'enveloppe fine, ramenée au nombre de colonnes que la vue peut dessiner.
 *
 * `debut01` et `fin01` sont des fractions de la piste, entre zéro et un. Chaque colonne rendue prend
 * le plus bas et le plus haut de celles qu'elle recouvre : ON NE MOYENNE JAMAIS, sans quoi une
 * pointe brève s'effacerait à mesure qu'on dézoome, alors que c'est elle qu'on cherche.
 *
 * Quand la portion demandée tient dans moins d'une colonne fine, la même valeur ressort plusieurs
 * fois : le tracé s'agrandit sans gagner en finesse, et c'est la borne de la méthode.
 */
export function plageDenveloppe(
  env: EnveloppeFine, debut01: number, fin01: number, largeur: number,
): Colonne[] {
  const n = env.min.length;
  const k = Math.floor(largeur);
  if (n === 0 || k < 1) return [];
  const a = Math.max(0, Math.min(1, debut01));
  const b = Math.max(a, Math.min(1, fin01));
  if (b <= a) return [];
  const out: Colonne[] = new Array(k);
  for (let i = 0; i < k; i++) {
    const d = a + ((b - a) * i) / k;
    const f = a + ((b - a) * (i + 1)) / k;
    const i0 = Math.min(n - 1, Math.floor(d * n));
    const i1 = Math.min(n, Math.max(i0 + 1, Math.ceil(f * n)));
    let bas = env.min[i0], haut = env.max[i0];
    for (let j = i0 + 1; j < i1; j++) {
      if (env.min[j] < bas) bas = env.min[j];
      if (env.max[j] > haut) haut = env.max[j];
    }
    out[i] = { min: bas, max: haut };
  }
  return out;
}
