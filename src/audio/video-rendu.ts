// audio/video-rendu.ts — Fabriquer un film : une fonction de dessin, une durée, un MP4.
//
// CE QUE LE DÉPÔT SAVAIT DÉJÀ FAIRE, ET CE QU'IL NE SAVAIT PAS. `video-sortie.ts` remuxe : il
// recopie une piste d'images paquet par paquet sans jamais la décoder. Aucun encodage d'image
// n'existait. La bibliothèque déjà installée porte pourtant `CanvasSource`, qui encode un canevas
// image par image, et le moteur expose `VideoEncoder` avec H.264.
//
// CE QUE LA MESURE DONNE, relevée dans l'application avant d'écrire une ligne : une image de
// 1280 par 720 coûte **10,7 ms**, dont **0,2 ms de dessin**. L'encodeur prend 98 % du temps, donc
// la richesse de la figure est à peu près gratuite et le plafond est le NOMBRE D'IMAGES. Vingt
// secondes à trente images par seconde font six cents images, soit environ six secondes et demie.
//
// D'OÙ LA RESPIRATION, et elle n'est pas facultative. Six secondes de calcul d'affilée sur le fil
// de l'interface, c'est le gel que nous venons de corriger ailleurs. L'appelant passe son souffle,
// et la boucle rend la main entre les images.

import {
  AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output,
} from "mediabunny";

export interface OptionsRendu {
  largeur: number;
  hauteur: number;
  /** Images par seconde. */
  cadence: number;
  dureeSec: number;
  /** Débit de l'image, en bits par seconde. */
  debit: number;
  /** La bande-son du film. Absente, le fichier n'a pas de piste audio. */
  audio?: AudioBuffer;
  /** Peint l'image de l'instant `t`. C'est l'appelant qui décide de tout ce qui se voit. */
  dessiner: (cx: OffscreenCanvasRenderingContext2D, t: number, image: number) => void;
  /** Rend la main au navigateur entre deux images. Sans lui, le rendu fige l'interface. */
  souffle?: { tour: () => Promise<boolean> };
  /** Avancement, de 0 à 1, appelé de loin en loin. */
  avancement?: (part: number) => void;
  /** Arrêt demandé. */
  signal?: AbortSignal;
}

/**
 * Le nombre d'images d'un film.
 *
 * AU MOINS UNE : un film de durée nulle n'existe pas, et un conteneur sans une seule image ne se
 * lit nulle part. La dernière image est incluse, de sorte qu'une seconde à trente images par
 * seconde en compte bien trente.
 */
export function nombreDImages(dureeSec: number, cadence: number): number {
  return Math.max(1, Math.round(Math.max(0, dureeSec) * Math.max(1, cadence)));
}

/** Le poids attendu d'un film, en octets, pour annoncer avant de produire. */
export function poidsAttendu(dureeSec: number, debit: number): number {
  return Math.round((Math.max(0, dureeSec) * Math.max(0, debit)) / 8);
}

export interface FilmRendu {
  blob: Blob;
  images: number;
  /** Le temps passé, pour que le nœud puisse le dire. */
  msTotal: number;
}

/**
 * Encode un film en MP4, image par image.
 *
 * LE SON EST ÉCRIT D'ABORD, ET EN UNE FOIS. Il pèse peu à côté des images, et le conteneur veut ses
 * pistes déclarées avant de recevoir quoi que ce soit. Sans bande-son, le fichier n'a qu'une piste,
 * ce qui reste un MP4 valide.
 */
export async function encoderFilm(o: OptionsRendu): Promise<FilmRendu> {
  const debut = performance.now();
  const images = nombreDImages(o.dureeSec, o.cadence);
  const canevas = new OffscreenCanvas(Math.max(2, o.largeur), Math.max(2, o.hauteur));
  const cx = canevas.getContext("2d");
  if (!cx) throw new Error("Le canevas hors écran n'a pas rendu de contexte 2D.");

  const sortie = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const piste = new CanvasSource(canevas, { codec: "avc", bitrate: o.debit });
  sortie.addVideoTrack(piste, { frameRate: o.cadence });
  const son = o.audio ? new AudioBufferSource({ codec: "aac", bitrate: 192_000 }) : null;
  if (son) sortie.addAudioTrack(son);

  await sortie.start();
  if (son && o.audio) await son.add(o.audio);

  for (let i = 0; i < images; i++) {
    if (o.signal?.aborted) break;
    cx.save();
    o.dessiner(cx, i / o.cadence, i);
    cx.restore();
    await piste.add(i / o.cadence, 1 / o.cadence);
    if (o.souffle) await o.souffle.tour();
    if (o.avancement && i % 30 === 0) o.avancement(i / images);
  }

  await sortie.finalize();
  const octets = (sortie.target as BufferTarget).buffer;
  return {
    blob: new Blob([octets ?? new ArrayBuffer(0)], { type: "video/mp4" }),
    images,
    msTotal: performance.now() - debut,
  };
}
