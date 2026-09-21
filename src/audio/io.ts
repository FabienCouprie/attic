// audio/io.ts — Extrait de l'ancien monolithe DSP.
import { creerQuantificateur } from "./dither";
import { dispositionDe } from "./multicanal";
import { blocIxml, etiquetteId3 } from "./metadonnees";
import { Mp3Encoder } from "./lame";
import { frequenceDuFichier } from "./frequence-source";

/**
 * Décode un fichier à SA fréquence, lue dans son en-tête : `decodeAudioData` rééchantillonne vers
 * celle du contexte, et le contexte de l'application a celle de la carte son — un même fichier
 * donnait donc un tampon différent d'une machine à l'autre. `ctx` ne sert plus que si l'en-tête est
 * illisible, ce qui garde alors l'ancien comportement.
 */
export async function decoderFichier(fichier: File, ctx: BaseAudioContext): Promise<AudioBuffer> {
  return decoderOctets(await fichier.arrayBuffer(), ctx);
}

async function decoderOctets(donnees: ArrayBuffer, ctx: BaseAudioContext): Promise<AudioBuffer> {
  const f = frequenceDuFichier(donnees);
  const decodeur = f && f !== ctx.sampleRate ? new OfflineAudioContext(1, 1, f) : ctx;
  return decodeur.decodeAudioData(donnees);
}

// --- Génération musicale fractale -------------------------------------------
// Principe : un motif d'intervalles est appliqué récursivement — chaque note
// du motif est remplacée par le motif entier transposé de son intervalle.
// Exemple : motif [0,4,7] (triade majeure), profondeur 3 → 27 notes
// auto-similaires qui couvrent plusieurs octaves comme un arpège fractal.


export async function decoderBlob(blob: Blob, ctx: BaseAudioContext): Promise<AudioBuffer> {
  return decoderOctets(await blob.arrayBuffer(), ctx);
}


// Extraire le graphe JSON embarqué dans un MP3 (tag ID3v2 TXXX:ATTIC_GRAPH).
export function extraireGrapheMp3(arrayBuffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length < 10) return null;
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null; // "ID3"
  let offset = 10;
  const end = bytes.length;
  while (offset + 10 <= end) {
    const frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    if (frameId.charCodeAt(0) === 0) break;
    const frameSize = ((bytes[offset + 4] & 0x7f) << 21) | ((bytes[offset + 5] & 0x7f) << 14)
      | ((bytes[offset + 6] & 0x7f) << 7) | (bytes[offset + 7] & 0x7f);
    if (frameId === "TXXX" && offset + 11 + frameSize <= end) {
      const data = bytes.subarray(offset + 11, offset + 10 + frameSize);
      const texte = new TextDecoder("utf-8").decode(data);
      const sep = texte.indexOf("\u0000");
      if (sep >= 0 && texte.substring(0, sep) === "ATTIC_GRAPH") {
        return texte.substring(sep + 1);
      }
    }
    offset += 10 + frameSize;
  }
  return null;
}

/**
 * Les profondeurs que le projet sait écrire.
 *
 * SEIZE BITS EST UNE LIVRAISON DE DISQUE COMPACT, ET NON UNE LIVRAISON PROFESSIONNELLE. Tout
 * livrable de diffusion, de post-production ou d'archivage se rend en vingt-quatre bits au
 * minimum ; un outil qui mesure en LUFS et en crête vraie et qui ne sait sortir qu'en seize se
 * contredit lui-même. Le trente-deux bits flottant, lui, ne se quantifie pas du tout : il garde le
 * tampon tel quel, dépassements compris, ce qui est exactement ce qu'on veut d'un fichier destiné
 * à être retravaillé ailleurs.
 */
export type ProfondeurExport = 16 | 24 | 32;

export interface OptionsWav {
  /** 16 ou 24 bits entiers, ou 32 bits flottants. Défaut : 16, pour ne rien changer aux appels internes. */
  bits?: ProfondeurExport;
  /** Graine du dither. Même graine, mêmes octets. */
  graine?: number;
  /** Un document iXML à écrire dans le fichier, en bloc « iXML » après les données. */
  ixml?: string;
}

export function bufferVersWavBlob(
  buffer: AudioBuffer, grapheJson?: string, securise: boolean = false, options: OptionsWav = {},
): Blob {
  const nbCanaux = buffer.numberOfChannels;
  const frequence = buffer.sampleRate;
  const nbEchantillons = buffer.length;
  const bitsParEchantillon: ProfondeurExport = options.bits ?? 16;
  const flottant = bitsParEchantillon === 32;
  const octetsParEchantillon = bitsParEchantillon / 8;
  const blocAlign = nbCanaux * octetsParEchantillon;
  const octetsParSeconde = frequence * blocAlign;
  const tailleDonnees = nbEchantillons * blocAlign;

  // Chunk graphe embarqué (LIST/INFO avec champ IGRF) si fourni
  let grapheChunk = new ArrayBuffer(0);
  if (grapheJson) {
    const grapheBytes = new TextEncoder().encode(grapheJson);
    // Chunk LIST: "LIST" + size + "INFO" + "IGRF" + subsize + data (pad to even)
    const subSize = grapheBytes.length + 1; // +1 for null terminator
    const paddedSubSize = subSize + (subSize % 2); // pad to even
    const listSize = 4 + 8 + paddedSubSize; // "INFO" + "IGRF" + subsize + data
    grapheChunk = new ArrayBuffer(8 + listSize);
    const gv = new DataView(grapheChunk);
    function wStr(off: number, s: string) { for (let i = 0; i < s.length; i++) gv.setUint8(off + i, s.charCodeAt(i)); }
    wStr(0, "LIST");
    gv.setUint32(4, listSize, true);
    wStr(8, "INFO");
    wStr(12, "IGRF");
    gv.setUint32(16, subSize, true);
    for (let i = 0; i < grapheBytes.length; i++) gv.setUint8(20 + i, grapheBytes[i]);
    gv.setUint8(20 + grapheBytes.length, 0); // null terminator
    if (subSize % 2) gv.setUint8(20 + subSize, 0); // pad byte
  }

  // L'EN-TÊTE N'EST PLUS À OFFSETS FIXES, et il ne pouvait plus l'être. Un fichier en virgule
  // flottante n'est pas du PCM : sa balise de format vaut 3, son bloc `fmt ` porte deux octets de
  // plus, et la norme exige en outre un bloc `fact` donnant le nombre de trames. Les quarante-quatre
  // octets d'un en-tête PCM ne suffisent donc plus, et les écrire quand même produirait un fichier
  // que la moitié des lecteurs refuserait.
  // AU-DELÀ DE DEUX CANAUX, LE FORMAT ÉTENDU, ET SON MASQUE. Un fichier à six canaux écrit en PCM
  // simple ne dit pas lequel est le centre ni lequel est le caisson de graves : chaque lecteur
  // devine, et deux lecteurs devinent différemment. Le format étendu porte un masque qui assigne
  // chaque canal à un haut-parleur — ou zéro, qui dit explicitement « aucun haut-parleur standard »,
  // ce qui est la bonne réponse pour un anneau libre ou un champ ambisonique. On s'en tient à plus
  // de deux canaux : la stéréo et le mono restent au format simple, que tout lecteur connaît et que
  // les graphes existants produisent déjà.
  const etendu = nbCanaux > 2;
  const masque = dispositionDe(buffer)?.masque ?? 0;
  const tailleFmt = etendu ? 40 : flottant ? 18 : 16;
  const tailleFact = flottant ? 12 : 0;
  const tailleEntete = 12 + 8 + tailleFmt + tailleFact + 8;
  // L'OCTET DE BOURRAGE APRÈS DES DONNÉES DE TAILLE IMPAIRE, que RIFF exige et qui manquait. Un
  // 24 bits mono de longueur impaire a des données de taille impaire ; le bloc suivant — le graphe
  // embarqué, désormais aussi l'iXML — était écrit juste derrière, décalé d'un octet, et tout lecteur
  // qui saute correctement le bourrage, celui d'Attic compris, le manquait.
  const bourrage = tailleDonnees % 2;
  const ixml = options.ixml ? blocIxml(options.ixml) : new Uint8Array(0);
  const tailleTotal = tailleEntete + tailleDonnees + bourrage + ixml.length + grapheChunk.byteLength;
  const arrayBuffer = new ArrayBuffer(tailleTotal);
  const vue = new DataView(arrayBuffer);

  function ecrireChaine(offset: number, chaine: string) {
    for (let i = 0; i < chaine.length; i++) vue.setUint8(offset + i, chaine.charCodeAt(i));
  }

  ecrireChaine(0, "RIFF");
  vue.setUint32(4, tailleTotal - 8, true);
  ecrireChaine(8, "WAVE");
  let tete = 12;
  ecrireChaine(tete, "fmt ");
  vue.setUint32(tete + 4, tailleFmt, true);
  vue.setUint16(tete + 8, etendu ? 0xfffe : flottant ? 3 : 1, true);
  vue.setUint16(tete + 10, nbCanaux, true);
  vue.setUint32(tete + 12, frequence, true);
  vue.setUint32(tete + 16, octetsParSeconde, true);
  vue.setUint16(tete + 20, blocAlign, true);
  vue.setUint16(tete + 22, bitsParEchantillon, true);
  if (etendu) {
    vue.setUint16(tete + 24, 22, true);                  // cbSize : l'extension fait 22 octets
    vue.setUint16(tete + 26, bitsParEchantillon, true);  // bits réellement utilisés
    vue.setUint32(tete + 28, masque >>> 0, true);        // quel canal est quel haut-parleur
    // Le sous-format : l'identifiant PCM ou virgule flottante, suivi du suffixe commun à tous.
    const guid = [flottant ? 3 : 1, 0, 0, 0, 0, 0, 0x10, 0, 0x80, 0, 0, 0xaa, 0, 0x38, 0x9b, 0x71];
    guid.forEach((o, i) => vue.setUint8(tete + 32 + i, o));
  } else if (flottant) {
    vue.setUint16(tete + 24, 0, true); // cbSize : aucune extension
  }
  tete += 8 + tailleFmt;
  if (flottant) {
    ecrireChaine(tete, "fact");
    vue.setUint32(tete + 4, 4, true);
    vue.setUint32(tete + 8, nbEchantillons, true);
    tete += 12;
  }
  ecrireChaine(tete, "data");
  vue.setUint32(tete + 4, tailleDonnees, true);
  tete += 8;

  const canaux: Float32Array[] = [];
  for (let c = 0; c < nbCanaux; c++) canaux.push(buffer.getChannelData(c));

  // LA DERNIÈRE ÉTAPE DE LA CHAÎNE, et elle manquait : `setInt16` tronque vers zéro, si bien que
  // l'erreur de quantification allait jusqu'à un LSB entier ET suivait le signal — de la
  // distorsion, et non du bruit, audible sur les fins de fondu et les queues de réverbération.
  // Le quantificateur arrondit et dithere (cf. `audio/dither.ts`). À graine fixe : deux rendus du
  // même son donnent deux fichiers identiques.
  const quantifier = flottant ? null : creerQuantificateur(bitsParEchantillon, { graine: options.graine });

  const SEUIL_PREVIEW = 0.5; // -6 dBFS
  // EN VIRGULE FLOTTANTE, ON NE BORNE PAS, et c'est le seul intérêt du format. Un tampon qui dépasse
  // le plein calibre passe tel quel, et se rattrape d'un gain négatif dans l'outil suivant sans
  // qu'un seul échantillon ait été écrêté. Borner ici reviendrait à détruire ce qu'on est venu
  // chercher. Le plafond d'aperçu, lui, reste : il protège les oreilles, ce qui prime.
  const borne = securise ? SEUIL_PREVIEW : flottant ? Infinity : 1.0;
  let offset = tete;
  for (let i = 0; i < nbEchantillons; i++) {
    for (let c = 0; c < nbCanaux; c++) {
      const brut = canaux[c][i];
      const echantillon = Math.max(-borne, Math.min(borne, Number.isFinite(brut) ? brut : 0));
      if (flottant) {
        vue.setFloat32(offset, echantillon, true);
      } else if (bitsParEchantillon === 24) {
        // Vingt-quatre bits s'écrivent en trois octets de poids croissant : `DataView` ne connaît
        // aucune largeur de trois, il faut les poser à la main. Le complément à deux se fait par
        // le masque, une valeur négative devenant son représentant sur vingt-quatre bits.
        const v = quantifier!(echantillon) & 0xffffff;
        vue.setUint8(offset, v & 0xff);
        vue.setUint8(offset + 1, (v >> 8) & 0xff);
        vue.setUint8(offset + 2, (v >> 16) & 0xff);
      } else {
        vue.setInt16(offset, quantifier!(echantillon), true);
      }
      offset += octetsParEchantillon;
    }
  }

  offset += bourrage;
  // Les métadonnées implicites, puis le graphe embarqué.
  if (ixml.length > 0) {
    new Uint8Array(arrayBuffer).set(ixml, offset);
    offset += ixml.length;
  }
  if (grapheChunk.byteLength > 0) {
    const src = new Uint8Array(grapheChunk);
    for (let i = 0; i < src.length; i++) vue.setUint8(offset + i, src[i]);
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

// Extraire le graphe JSON embarqué dans un WAV (chunk LIST/INFO IGRF).
export function extraireGrapheWav(arrayBuffer: ArrayBuffer): string | null {
  const vue = new DataView(arrayBuffer);
  if (vue.byteLength < 12) return null;
  let offset = 12; // après "RIFF" + size + "WAVE"
  while (offset + 8 <= vue.byteLength) {
    let id = "";
    for (let i = 0; i < 4; i++) id += String.fromCharCode(vue.getUint8(offset + i));
    const size = vue.getUint32(offset + 4, true);
    if (id === "LIST") {
      // Vérifier sub-chunk INFO
      let subId = "";
      for (let i = 0; i < 4; i++) subId += String.fromCharCode(vue.getUint8(offset + 8 + i));
      if (subId === "INFO") {
        let subOff = offset + 12;
        while (subOff + 8 <= offset + 8 + size) {
          let fieldId = "";
          for (let i = 0; i < 4; i++) fieldId += String.fromCharCode(vue.getUint8(subOff + i));
          const fieldSize = vue.getUint32(subOff + 4, true);
          if (fieldId === "IGRF") {
            const bytes = new Uint8Array(arrayBuffer, subOff + 8, fieldSize);
            // Retirer le null terminator
            let len = bytes.length;
            while (len > 0 && bytes[len - 1] === 0) len--;
            return new TextDecoder().decode(bytes.subarray(0, len));
          }
          subOff += 8 + fieldSize + (fieldSize % 2);
        }
      }
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}


export async function bufferVersMp3Blob(
  buffer: AudioBuffer, bitrate = 192, grapheJson?: string, etiquette: { titre?: string; ixml?: string } = {},
): Promise<Blob> {
  const SUPPORTED = [32000, 44100, 48000];
  let buf = buffer;
  if (!SUPPORTED.includes(buf.sampleRate)) {
    const off = new OfflineAudioContext(buf.numberOfChannels, Math.ceil(buf.duration * 44100), 44100);
    const src = off.createBufferSource(); src.buffer = buf;
    src.connect(off.destination); src.start(0);
    buf = await off.startRendering();
  }
  const canaux = buf.numberOfChannels;
  const sr = buf.sampleRate;
  try {
    const encodeur = new Mp3Encoder(canaux, sr, bitrate);
    const gauche = buf.getChannelData(0);
    const droite = canaux > 1 ? buf.getChannelData(1) : gauche;
    const morceaux: Int8Array[] = [];
    const bloc = 1152;

    for (let i = 0; i < gauche.length; i += bloc) {
      const fin = Math.min(i + bloc, gauche.length);
      const lb = new Int16Array(fin - i);
      const rb = new Int16Array(fin - i);
      for (let j = i; j < fin; j++) {
        lb[j - i] = Math.max(-32768, Math.min(32767, Math.round(gauche[j] * 32768)));
        if (canaux > 1) rb[j - i] = Math.max(-32768, Math.min(32767, Math.round(droite[j] * 32768)));
        else rb[j - i] = lb[j - i];
      }
      const troncon = encodeur.encodeBuffer(lb, rb);
      if (troncon.length > 0) morceaux.push(troncon);
    }
    const fin = encodeur.flush();
    if (fin.length > 0) morceaux.push(fin);

    const total = morceaux.reduce((s, c) => s + c.length, 0);

    // L'étiquette ID3v2.4 : le logiciel toujours, le titre, l'iXML et le graphe s'ils sont fournis.
    const id3Header = etiquetteId3({ graphe: grapheJson, titre: etiquette.titre, ixml: etiquette.ixml });

    const resultat = new Uint8Array(id3Header.length + total);
    resultat.set(id3Header, 0);
    let pos = id3Header.length;
    for (const m of morceaux) { resultat.set(new Uint8Array(m.buffer), pos); pos += m.length; }
    return new Blob([resultat], { type: "audio/mpeg" });
  } catch (e) {
    // PAS DE REPLI EN WAV. Il y en avait un, et il a caché que l'encodeur ne marchait pas du tout :
    // chaque « .mp3 » écrit était un WAV sous une fausse extension, que la plupart des lecteurs
    // jouaient sans broncher. Un échec d'encodage doit se voir.
    throw new Error(`encodage MP3 impossible : ${(e as any)?.message ?? String(e)}`);
  }
}
