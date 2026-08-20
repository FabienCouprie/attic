// audio/io.ts — Extrait de l'ancien monolithe DSP.
import { Mp3Encoder } from "lamejs";

export async function decoderFichier(fichier: File, ctx: BaseAudioContext): Promise<AudioBuffer> {
  const donnees = await fichier.arrayBuffer();
  return ctx.decodeAudioData(donnees);
}

// --- Génération musicale fractale -------------------------------------------
// Principe : un motif d'intervalles est appliqué récursivement — chaque note
// du motif est remplacée par le motif entier transposé de son intervalle.
// Exemple : motif [0,4,7] (triade majeure), profondeur 3 → 27 notes
// auto-similaires qui couvrent plusieurs octaves comme un arpège fractal.


export async function decoderBlob(blob: Blob, ctx: BaseAudioContext): Promise<AudioBuffer> {
  const donnees = await blob.arrayBuffer();
  return ctx.decodeAudioData(donnees);
}


// Encoder un tag ID3v2 avec le graphe embarqué (frame TXXX:ATTIC_GRAPH).
function encoderId3Graphe(grapheJson: string): Uint8Array {
  const texteBytes = new TextEncoder().encode("ATTIC_GRAPH\u0000" + grapheJson);
  // Frame TXXX: "TXXX" + size(4) + flags(2) + data
  const frameSize = 1 + texteBytes.length; // encoding byte (0=ISO-8859-1) + data
  const frame = new Uint8Array(10 + frameSize);
  frame[0] = 0x54; frame[1] = 0x58; frame[2] = 0x58; frame[3] = 0x58; // "TXXX"
  frame[4] = (frameSize >> 21) & 0x7f; frame[5] = (frameSize >> 14) & 0x7f;
  frame[6] = (frameSize >> 7) & 0x7f; frame[7] = frameSize & 0x7f; // synchint
  frame[8] = 0; frame[9] = 0; // flags
  frame[10] = 0; // encoding = ISO-8859-1
  frame.set(texteBytes, 11);

  // ID3v2 header: "ID3" + version(2) + flags(1) + size(4 synchint)
  const totalSize = frame.length;
  const header = new Uint8Array(10);
  header[0] = 0x49; header[1] = 0x44; header[2] = 0x33; // "ID3"
  header[3] = 0x02; header[4] = 0x00; // version 2.0
  header[5] = 0x00; // flags
  header[6] = (totalSize >> 21) & 0x7f;
  header[7] = (totalSize >> 14) & 0x7f;
  header[8] = (totalSize >> 7) & 0x7f;
  header[9] = totalSize & 0x7f;

  const result = new Uint8Array(header.length + frame.length);
  result.set(header, 0);
  result.set(frame, header.length);
  return result;
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

export function bufferVersWavBlob(buffer: AudioBuffer, grapheJson?: string, securise: boolean = false): Blob {
  const nbCanaux = buffer.numberOfChannels;
  const frequence = buffer.sampleRate;
  const nbEchantillons = buffer.length;
  const bitsParEchantillon = 16;
  const blocAlign = (nbCanaux * bitsParEchantillon) / 8;
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

  const tailleTotal = 44 + tailleDonnees + grapheChunk.byteLength;
  const arrayBuffer = new ArrayBuffer(tailleTotal);
  const vue = new DataView(arrayBuffer);

  function ecrireChaine(offset: number, chaine: string) {
    for (let i = 0; i < chaine.length; i++) vue.setUint8(offset + i, chaine.charCodeAt(i));
  }

  ecrireChaine(0, "RIFF");
  vue.setUint32(4, 36 + tailleDonnees + grapheChunk.byteLength, true);
  ecrireChaine(8, "WAVE");
  ecrireChaine(12, "fmt ");
  vue.setUint32(16, 16, true);
  vue.setUint16(20, 1, true);
  vue.setUint16(22, nbCanaux, true);
  vue.setUint32(24, frequence, true);
  vue.setUint32(28, octetsParSeconde, true);
  vue.setUint16(32, blocAlign, true);
  vue.setUint16(34, bitsParEchantillon, true);
  ecrireChaine(36, "data");
  vue.setUint32(40, tailleDonnees, true);

  const canaux: Float32Array[] = [];
  for (let c = 0; c < nbCanaux; c++) canaux.push(buffer.getChannelData(c));

  const SEUIL_PREVIEW = 0.5; // -6 dBFS
  const maxAbs = securise ? SEUIL_PREVIEW : 1.0;
  let offset = 44;
  for (let i = 0; i < nbEchantillons; i++) {
    for (let c = 0; c < nbCanaux; c++) {
      const echantillon = Math.max(-maxAbs, Math.min(maxAbs, canaux[c][i]));
      vue.setInt16(offset, echantillon < 0 ? echantillon * 0x8000 : echantillon * 0x7fff, true);
      offset += 2;
    }
  }

  // Ajouter le chunk graphe après les données
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


export async function bufferVersMp3Blob(buffer: AudioBuffer, bitrate = 192, grapheJson?: string): Promise<Blob> {
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

    // Tag ID3v2 avec graphe embarqué (frame TXXX:ATTIC_GRAPH) si fourni
    let id3Header: Uint8Array = new Uint8Array(0);
    if (grapheJson) {
      id3Header = new Uint8Array(encoderId3Graphe(grapheJson));
    }

    const resultat = new Uint8Array(id3Header.length + total);
    resultat.set(id3Header, 0);
    let pos = id3Header.length;
    for (const m of morceaux) { resultat.set(new Uint8Array(m.buffer), pos); pos += m.length; }
    return new Blob([resultat], { type: "audio/mpeg" });
  } catch {
    return bufferVersWavBlob(buf);
  }
}
