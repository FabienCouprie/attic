// audio/lecteur-pochette-essai.ts — Relire la pochette d'un WAV sans rien devoir au code qui l'écrit.
//
// UN LECTEUR POUR LES TESTS, ÉCRIT D'APRÈS LES NORMES. Il suit la chaîne des blocs RIFF comme le
// ferait n'importe quel lecteur, octet de bourrage compris, ouvre le bloc « id3 », lit l'en-tête
// ID3v2 et ses trames, en tailles synchsafe pour la version 2.4 et en tailles pleines pour la 2.3,
// puis décode la trame APIC selon le § 4.14 d'ID3v2.4 : encodage, type MIME terminé par un zéro,
// type d'image, description terminée selon l'encodage, octets de l'image.
//
// IL N'IMPORTE RIEN DE `metadonnees.ts` NI DE `pochette.ts`, et c'est sa raison d'être : un lecteur
// qui réemploierait le code de l'écrivain relirait ses fautes sans les voir. Aucun analyseur tiers
// n'est installé dans le dépôt, ni `music-metadata` ni `mutagen`, d'où le décodage à la main.
//
// IL JETTE AU LIEU DE TOLÉRER : un fichier dont la chaîne de blocs ne tombe pas sur sa fin, ou une
// étiquette qui déborde de son bloc, est un fichier faux, et un test doit le voir tomber.

/** Un bloc RIFF : son identifiant, où commence son contenu, et sa taille déclarée. */
export interface BlocRiff { id: string; debut: number; taille: number }

/** Une trame APIC décodée. */
export interface ApicRelue {
  /** La version majeure de l'étiquette qui la porte, 3 ou 4. */
  version: number;
  encodage: number;
  mime: string;
  typeImage: number;
  description: string;
  image: Uint8Array;
}

const ascii = (o: Uint8Array, de: number, n: number) => String.fromCharCode(...o.subarray(de, de + n));
const synchsafe = (o: Uint8Array, p: number) => (o[p] << 21) | (o[p + 1] << 14) | (o[p + 2] << 7) | o[p + 3];

/** Les blocs d'un fichier RIFF/WAVE, dans l'ordre, en suivant les tailles et les octets de bourrage. */
export function blocsRiff(o: Uint8Array): BlocRiff[] {
  if (ascii(o, 0, 4) !== "RIFF" || ascii(o, 8, 4) !== "WAVE") throw new Error("ce n'est pas un fichier RIFF/WAVE");
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
  if (v.getUint32(4, true) !== o.length - 8) throw new Error(`taille RIFF ${v.getUint32(4, true)} pour ${o.length} octets`);
  const blocs: BlocRiff[] = [];
  let p = 12;
  while (p + 8 <= o.length) {
    const taille = v.getUint32(p + 4, true);
    blocs.push({ id: ascii(o, p, 4), debut: p + 8, taille });
    p += 8 + taille + (taille % 2);
  }
  if (p !== o.length) throw new Error(`la chaîne des blocs tombe à ${p}, le fichier fait ${o.length} octets`);
  return blocs;
}

/** Les trames APIC d'une étiquette ID3v2.3 ou 2.4 sans drapeau d'en-tête. */
export function tramesApic(tag: Uint8Array): ApicRelue[] {
  if (ascii(tag, 0, 3) !== "ID3") throw new Error("l'étiquette ne commence pas par « ID3 »");
  const version = tag[3];
  if (version !== 3 && version !== 4) throw new Error(`version ID3v2.${version} inattendue`);
  if (tag[5] !== 0) throw new Error("drapeaux d'en-tête non lus par ce lecteur");
  const fin = 10 + synchsafe(tag, 6);
  if (fin > tag.length) throw new Error(`l'étiquette déclare ${fin} octets, son bloc en a ${tag.length}`);
  const lues: ApicRelue[] = [];
  let p = 10;
  while (p + 10 <= fin && tag[p] !== 0) {
    const id = ascii(tag, p, 4);
    const taille = version === 4 ? synchsafe(tag, p + 4) : new DataView(tag.buffer, tag.byteOffset).getUint32(p + 4);
    if (p + 10 + taille > fin) throw new Error(`la trame ${id} déborde de l'étiquette`);
    const c = tag.subarray(p + 10, p + 10 + taille);
    if (id === "APIC") {
      const encodage = c[0];
      let q = 1;
      while (q < c.length && c[q] !== 0) q++;
      const mime = ascii(c, 1, q - 1);
      const typeImage = c[q + 1];
      const large = encodage === 1 || encodage === 2;
      let d = q + 2;
      while (d < c.length && (large ? !(c[d] === 0 && c[d + 1] === 0) : c[d] !== 0)) d += large ? 2 : 1;
      const decodeur = new TextDecoder(large ? "utf-16" : encodage === 3 ? "utf-8" : "latin1");
      lues.push({ version, encodage, mime, typeImage, description: decodeur.decode(c.subarray(q + 2, d)), image: c.slice(d + (large ? 2 : 1)) });
    }
    p += 10 + taille;
  }
  return lues;
}

/** Les blocs d'un WAV et la trame APIC de son bloc « id3 », s'il en a un. Jette s'il en a deux. */
export function pochetteDuWav(o: Uint8Array): { blocs: string[]; apic: ApicRelue | undefined } {
  const blocs = blocsRiff(o);
  const id3 = blocs.filter((b) => b.id === "id3 ");
  if (id3.length > 1) throw new Error(`${id3.length} blocs « id3 »`);
  if (id3.length === 0) return { blocs: blocs.map((b) => b.id), apic: undefined };
  const apics = tramesApic(o.subarray(id3[0].debut, id3[0].debut + id3[0].taille));
  if (apics.length !== 1) throw new Error(`${apics.length} trames APIC`);
  return { blocs: blocs.map((b) => b.id), apic: apics[0] };
}
