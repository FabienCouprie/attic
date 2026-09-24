// audio/video-sortie.ts — Lire un film, en garder l'image telle quelle, et lui écrire un autre son.
//
// LA DÉCISION QUI COMMANDE TOUT : L'IMAGE EST RECOPIÉE, JAMAIS RÉ-ENCODÉE. Une conversion composable
// en copie forcée reprend la piste vidéo paquet par paquet et l'écrit dans le nouveau conteneur sans
// la décoder. Onze minutes de film s'y remontent en quelques secondes, au bit près ; les décoder et
// les ré-encoder coûterait des minutes et abîmerait la copie. Vérifié sur le film d'essai : la
// conversion se déclare valide, garde la piste vidéo et écarte la piste audio à notre demande.
//
// CE QUE NOUS ÉCRIVONS, C'EST LE SON, et lui seul. Le son d'origine est décodé pour entrer dans le
// mélange comme une piste parmi les autres — garder une seconde piste audio dans le fichier n'aurait
// pas répondu : un lecteur n'en joue qu'une, et l'auditeur n'entendrait pas le mélange.
//
// LE CONTENEUR DE SORTIE EST LE MP4. Il n'existe pas d'écriture ASF ici, donc pas de WMV en sortie ;
// et le MP4 est ce qu'un lecteur ouvre partout. Voir `video-montage.ts` pour l'entrée refusée.
//
// LA MÉMOIRE EST LE VRAI PLAFOND. Pour un film de onze minutes : ses octets, le son d'origine décodé,
// le mélange, puis le fichier produit. Chacun se compte en dizaines ou centaines de mégaoctets, et
// c'est pourquoi le nœud annonce ce qu'il a retenu plutôt que de le taire.

import {
  ALL_FORMATS, AudioBufferSink, AudioBufferSource, BufferSource, BufferTarget, Conversion, Input,
  Mp4OutputFormat, Output, type InputAudioTrack, type InputVideoTrack,
} from "mediabunny";

export interface VideoOuverte {
  input: Input;
  dureeSec: number;
  /** La cadence mesurée sur le fichier, jamais supposée : voir `video-montage.ts`. */
  cadence: number;
  largeur: number;
  hauteur: number;
  pisteVideo: InputVideoTrack | null;
  pisteAudio: InputAudioTrack | null;
}

/** Ouvre le film et relève ce qu'il faut pour placer des sons dessus. */
export async function ouvrirVideo(octets: ArrayBuffer): Promise<VideoOuverte> {
  const input = new Input({ source: new BufferSource(octets), formats: ALL_FORMATS });
  const pistes = await input.getTracks();
  const pisteVideo = (pistes.find((t) => t.type === "video") as InputVideoTrack | undefined) ?? null;
  const pisteAudio = (pistes.find((t) => t.type === "audio") as InputAudioTrack | undefined) ?? null;
  const dureeSec = await input.computeDuration();
  let cadence = 25;
  if (pisteVideo) {
    // Sur deux cent cinquante-six paquets, la mesure est stable même à cadence variable.
    const m = await pisteVideo.computeFrameRateMetrics({ targetPacketCount: 256 }).catch(() => null);
    cadence = m?.bestGuessFrameRate || m?.medianFrameRate || cadence;
  }
  return {
    input, dureeSec, cadence,
    largeur: pisteVideo?.displayWidth ?? 0,
    hauteur: pisteVideo?.displayHeight ?? 0,
    pisteVideo, pisteAudio,
  };
}

/**
 * Le son d'origine du film, décodé d'un bout à l'autre.
 *
 * Il est rendu en un seul tampon, parce que c'est ce que le montage attend. Les morceaux décodés
 * arrivent par paquets : on les recopie à leur place exacte, calculée depuis leur horodatage, de
 * sorte qu'un trou dans le flux reste un silence à la bonne longueur et ne décale pas la suite.
 */
export async function sonDuFilm(
  video: VideoOuverte,
  respirer?: () => Promise<void>,
): Promise<AudioBuffer | null> {
  const piste = video.pisteAudio;
  if (!piste) return null;
  const sr = piste.sampleRate;
  const canaux = piste.numberOfChannels;
  const longueur = Math.max(1, Math.ceil(video.dureeSec * sr));
  const sortie = new AudioBuffer({ numberOfChannels: canaux, length: longueur, sampleRate: sr });

  const sink = new AudioBufferSink(piste);
  let depuisRespiration = 0;
  for await (const { buffer, timestamp } of sink.buffers()) {
    const debut = Math.round(timestamp * sr);
    if (debut >= longueur) break;
    const n = Math.min(buffer.length, longueur - debut);
    for (let c = 0; c < canaux; c++) {
      const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
      const dst = sortie.getChannelData(c);
      for (let i = 0; i < n; i++) dst[debut + i] = src[i];
    }
    // Décoder onze minutes d'AAC est une boucle longue : elle rend la main régulièrement, sans quoi
    // l'interface resterait figée du début à la fin.
    depuisRespiration += n;
    if (respirer && depuisRespiration > sr * 10) { depuisRespiration = 0; await respirer(); }
  }
  return sortie;
}

export interface OptionsSortie {
  /** Débit du son écrit, en bits par seconde. */
  debitAudio?: number;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

/**
 * Le MP4 de sortie : l'image du film recopiée, et le mélange comme unique piste sonore.
 *
 * LA CONVERSION EST COMPOSABLE, et c'est ce qui permet le partage du travail : elle ajoute la piste
 * vidéo et la mène, pendant que nous menons la piste audio sur la même sortie. Démarrer et clore le
 * conteneur nous revient alors, puisque personne d'autre n'en a la charge.
 */
export async function ecrireMp4(
  video: VideoOuverte,
  melange: AudioBuffer,
  o: OptionsSortie = {},
): Promise<Blob> {
  const cible = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target: cible });

  const conversion = await Conversion.init({
    input: video.input,
    output,
    video: { forceTranscode: false },
    audio: { discard: true },
    copy: { mode: "forced" },
    composable: true,
    showWarnings: false,
  });
  if (!conversion.isValid) {
    const raisons = conversion.discardedTracks.map((d) => d.reason).join(", ");
    throw new Error(`image non recopiable (${raisons || "raison inconnue"})`);
  }

  const source = new AudioBufferSource({
    codec: "aac",
    bitrate: o.debitAudio ?? 192_000,
  });
  output.addAudioTrack(source);

  await output.start();
  // Le son d'abord : il est déjà en mémoire, et la copie de l'image est ce qui prend du temps.
  await source.add(melange);
  source.close();
  if (o.onProgress) conversion.onProgress = (f) => o.onProgress?.(f);
  await conversion.execute();
  await output.finalize();

  return new Blob([cible.buffer!], { type: "video/mp4" });
}
