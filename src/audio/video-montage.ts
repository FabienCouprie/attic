// audio/video-montage.ts — Poser des sons sur un film : le calcul, sans l'image ni le fichier.
//
// CE QUE CE MODULE FAIT, ET CE QU'IL NE FAIT PAS. Il convertit des positions en IMAGES vers des
// instants, et ajuste un mélange à la durée exacte d'une vidéo. Il ne lit aucun fichier, n'encode
// rien et ne connaît pas le conteneur : tout cela vit dans le nœud, qui est la prise. Ici, on peut
// vérifier par un test ce qui, autrement, se vérifierait en regardant un film.
//
// UNE IMAGE N'EST PAS UN TRENTIÈME DE SECONDE, et c'est la raison d'être de la première fonction.
// Le film d'essai tourne à 30000/1001, soit 29,97002997 images par seconde : l'image 1000 y tombe à
// 33,3667 s, et non à 33,3333. Trente-quatre millisecondes d'écart, c'est déjà un son posé à côté de
// l'image qu'il devait souligner, et l'écart croît avec la durée — à dix minutes, une seconde
// entière. La cadence employée est donc celle que la vidéo déclare, jamais un arrondi.

/** L'instant, en secondes, où commence l'image de rang `image` à cette cadence. */
export function secondesDepuisImage(image: number, cadence: number): number {
  if (!(cadence > 0)) return 0;
  return image / cadence;
}

/** Le rang de l'image qui contient cet instant. */
export function imageDepuisSecondes(secondes: number, cadence: number): number {
  if (!(cadence > 0)) return 0;
  return Math.floor(secondes * cadence);
}

/**
 * Le mélange ramené à la durée EXACTE de la vidéo.
 *
 * POURQUOI LA VIDÉO COMMANDE. La sortie est un film : sa durée est celle de son image. Un son qui
 * dépasse est coupé, un silence complète ce qui manque. Décision de Fabien.
 *
 * ET POURQUOI UN FONDU À LA COUPE. Couper net au milieu d'un son pose une discontinuité, qu'on
 * entend comme un clic à la dernière image. Le fondu ne s'applique QUE si l'on coupe : un mélange
 * plus court que la vidéo se termine de lui-même, et lui en poser un l'abîmerait.
 */
export function ajusterALaVideo(
  melange: AudioBuffer,
  dureeVideoSec: number,
  fonduCoupeMs = 120,
): AudioBuffer {
  const sr = melange.sampleRate;
  const longueur = Math.max(1, Math.round(dureeVideoSec * sr));
  const sortie = new AudioBuffer({
    numberOfChannels: melange.numberOfChannels, length: longueur, sampleRate: sr,
  });
  const copie = Math.min(longueur, melange.length);
  const coupe = melange.length > longueur;
  const fondu = coupe ? Math.min(copie, Math.max(1, Math.round((fonduCoupeMs / 1000) * sr))) : 0;

  for (let c = 0; c < melange.numberOfChannels; c++) {
    const src = melange.getChannelData(c);
    const dst = sortie.getChannelData(c);
    for (let i = 0; i < copie; i++) dst[i] = src[i];
    for (let i = 0; i < fondu; i++) {
      // Le même quart de sinus que les fondus du montage : à puissance constante, sans creux.
      const x = (fondu - i) / fondu;
      dst[copie - fondu + i] *= Math.sin((x * Math.PI) / 2);
    }
  }
  return sortie;
}

export interface PisteVideo {
  /** Le rang de l'entrée : la piste 3 reste la piste 3, quel que soit l'ordre des câbles. */
  piste: number;
  son: AudioBuffer;
  /** Le début, en IMAGES de la vidéo. */
  image: number;
  gainDb: number;
  fonduEntreeMs: number;
  fonduSortieMs: number;
}

export interface PlanVideo {
  son: AudioBuffer;
  debut: number;
  gainDb: number;
  fonduEntreeMs: number;
  fonduSortieMs: number;
}

/**
 * Les pistes converties en plans de montage, leurs débuts passés des images aux secondes.
 *
 * Le son d'origine du film est une piste comme les autres, à l'image zéro : gardé, baissé ou coupé
 * d'un seul curseur, sans que le mélange ait à connaître son cas.
 */
export function plansDepuisPistes(pistes: readonly PisteVideo[], cadence: number): PlanVideo[] {
  return pistes.map((p) => ({
    son: p.son,
    debut: secondesDepuisImage(p.image, cadence),
    gainDb: p.gainDb,
    fonduEntreeMs: p.fonduEntreeMs,
    fonduSortieMs: p.fonduSortieMs,
  }));
}

/** Les conteneurs que la bibliothèque média sait ouvrir, pour le dire plutôt que d'échouer. */
export const EXTENSIONS_VIDEO = [".mp4", ".m4v", ".mov", ".webm", ".mkv"] as const;

/**
 * Le fichier est-il d'un conteneur lisible ?
 *
 * LE WMV N'EST PAS REFUSÉ PAR CHOIX. Son conteneur est l'ASF, que la bibliothèque média n'ouvre pas,
 * et ses codecs — WMV9, VC-1, WMA — n'ont de décodeur ni dans le moteur de l'application ni ailleurs
 * ici. Ajouter l'un ou l'autre demanderait d'embarquer un convertisseur complet, ce que le plafond
 * de l'installeur interdit. Un composant qui l'explique vaut mieux qu'un composant qui échoue.
 */
export const extensionLisible = (chemin: string): boolean => {
  const bas = chemin.toLowerCase();
  return EXTENSIONS_VIDEO.some((e) => bas.endsWith(e));
};
