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
// LA MÉMOIRE EST LE VRAI PLAFOND, et c'est pourquoi le film ne s'y met pas : `sourceDeFichier` le lit
// par plages. Restent le son d'origine décodé, le mélange, puis le fichier produit. Chacun se compte
// en dizaines ou centaines de mégaoctets, et c'est pourquoi le nœud annonce ce qu'il a retenu.

import {
  ALL_FORMATS, AudioBufferSink, AudioBufferSource, BufferSource, BufferTarget, Conversion,
  CustomSource, Input, Mp4OutputFormat, Output, type InputAudioTrack, type InputVideoTrack,
  type Source,
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

/**
 * Le fichier lu PAR PLAGES, sans jamais être tenu en entier.
 *
 * Un démultiplexeur n'a pas besoin de tout : il lit l'index, puis les paquets qu'il recopie. Tenir un
 * film de 72 Mo pour en recopier l'image retient 72 Mo qui ne servent à personne, et un film de deux
 * gigaoctets ne tiendrait pas du tout. Le profil `fileSystem` préempte de part et d'autre de chaque
 * lecture, aligné sur les pages : c'est ce qui convient à un disque, où la latence est faible et le
 * coût d'un aller-retour n'est pas celui d'un réseau.
 */
export function sourceDeFichier(
  chemin: string,
  taille: () => Promise<number>,
  // L'IPC rend une vue dont le tampon peut être plus grand qu'elle ; elle est employée telle quelle,
  // avec son décalage, plutôt que recopiée à chaque plage.
  plage: (debut: number, fin: number) => Promise<Uint8Array | ArrayBuffer | null>,
): Source {
  return new CustomSource({
    getSize: async () => {
      const n = await taille();
      if (!(n > 0)) throw new Error(`taille illisible : ${chemin}`);
      return n;
    },
    read: async (debut, fin) => {
      const octets = await plage(debut, fin);
      if (!octets) throw new Error(`plage illisible : ${chemin} [${debut}, ${fin})`);
      return octets instanceof Uint8Array ? octets : new Uint8Array(octets);
    },
    prefetchProfile: "fileSystem",
  });
}

/** Ce qu'il faut d'une application de bureau pour lire un fichier par plages. */
export interface AccesFichier {
  tailleFichier(chemin: string): Promise<number | null | undefined>;
  lirePlage(chemin: string, debut: number, fin: number): Promise<Uint8Array | ArrayBuffer | null>;
}

/**
 * Le film du disque, ouvert par plages.
 *
 * ÉCRIT UNE FOIS POUR DEUX APPELANTS : le nœud qui rend le fichier, et la vue qui le montre. Les
 * deux ont besoin de la même chose, la durée et la cadence, et une seconde écriture de ces quatre
 * lignes était une occasion de mesurer la cadence d'une façon ici et d'une autre là.
 */
export async function ouvrirFilmParPlages(chemin: string, acces: AccesFichier): Promise<VideoOuverte> {
  const taille = await acces.tailleFichier(chemin);
  if (!taille) throw new Error(`taille illisible : ${chemin}`);
  return ouvrirVideo(sourceDeFichier(
    chemin,
    async () => taille,
    (debut, fin) => acces.lirePlage(chemin, debut, fin),
  ));
}

/** Ouvre le film et relève ce qu'il faut pour placer des sons dessus. */
export async function ouvrirVideo(depuis: ArrayBuffer | Source): Promise<VideoOuverte> {
  const source = depuis instanceof ArrayBuffer ? new BufferSource(depuis) : depuis;
  const input = new Input({ source, formats: ALL_FORMATS });
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

/** Ce qu'une extraction a produit, et ce qu'elle a dû laisser. */
export interface ExtraitEcrit {
  blob: Blob;
  /** Le son du film est-il dans le fichier produit ? */
  sonGarde: boolean;
  /** Pourquoi il n'y est pas, quand il n'y est pas. */
  raisonSon: string | null;
}

/**
 * Une portion du film, recopiée telle quelle, avec son son.
 *
 * L'IMAGE N'EST PAS RÉ-ENCODÉE ICI NON PLUS, et une image intermédiaire ne se décode pas sans celles
 * dont elle dépend : la copie remonte donc à l'image clé qui précède le début demandé. La conversion
 * ÉLARGIT la portion plutôt que de la rétrécir, de sorte que rien de ce qui a été demandé ne manque.
 *
 * CE QUI EST AJOUTÉ PORTE DES INSTANTS NÉGATIFS, la tolérance de décalage valant zéro : la ligne de
 * temps du fichier commence à l'image demandée, et ces images-là sont avant elle. Vérifié sur un
 * film à une image clé par seconde, extrait demandé à 2,40 s : le premier paquet est une image clé à
 * −0,4 s, la durée annoncée est celle demandée, et la première image vue par un lecteur est bien
 * celle qui a été demandée. Le fichier est seulement un peu plus lourd que la portion seule.
 *
 * Rétrécir serait l'autre politique possible : on perdrait alors des images demandées.
 *
 * LE SON DU FILM PART AVEC L'IMAGE, recopié lui aussi. La copie est forcée pour les deux : un son
 * qu'aucun conteneur MP4 n'accepte tel quel est écarté plutôt que ré-encodé, et l'appelant reçoit
 * de quoi le dire. Ré-encoder pour sauver une piste sonore rare coûterait, sur tout le reste, le
 * temps d'encodage que ce composant existe pour éviter.
 */
export async function ecrireExtrait(
  video: VideoOuverte,
  plage: { debutSec: number; finSec: number },
  o: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {},
): Promise<ExtraitEcrit> {
  const cible = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target: cible });
  const conversion = await Conversion.init({
    input: video.input,
    output,
    trim: { start: plage.debutSec, end: plage.finSec },
    video: { forceTranscode: false },
    copy: { mode: "forced", boundaryPolicy: "expand" },
    showWarnings: false,
  });
  const ecarte = (type: "video" | "audio") =>
    conversion.discardedTracks.find((d) => d.track.type === type);
  if (!conversion.isValid || ecarte("video")) {
    const raisons = conversion.discardedTracks.map((d) => d.reason).join(", ");
    throw new Error(`image non recopiable (${raisons || "raison inconnue"})`);
  }
  if (o.onProgress) conversion.onProgress = (f) => o.onProgress?.(f);
  o.signal?.addEventListener("abort", () => void conversion.cancel(), { once: true });
  await conversion.execute();
  const sonEcarte = ecarte("audio");
  return {
    blob: new Blob([cible.buffer!], { type: "video/mp4" }),
    // Un film muet n'a pas de piste à écarter : ce n'est pas un son perdu.
    sonGarde: !sonEcarte && !!video.pisteAudio,
    raisonSon: sonEcarte ? String(sonEcarte.reason) : null,
  };
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
