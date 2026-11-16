// core/type-image.ts — Le type d'une image, lu sur ses octets.
//
// UNE IMAGE RELUE SUR LE DISQUE N'A PAS DE TYPE : il faut le lui donner. Au rechargement d'un
// projet, `ui/rechargerFichiers.ts` refait le `File` d'une « Entrée image » à partir des octets lus,
// et c'est lui qui en déclare le type. Il le tirait de l'extension, et déclarait `image/jpeg` tout ce
// qui n'était ni `.png` ni `.svg` : un WebP, un GIF ou un BMP rouvert avec son projet se disait JPEG,
// et ce faux type était celui que lisaient l'aperçu du nœud, « Export image » et la pochette de
// « Sortie audio ».
//
// LES OCTETS D'ABORD, L'EXTENSION À DÉFAUT. Une signature dit ce qu'est le fichier ; une extension
// dit ce qu'on a voulu qu'il soit, et un PNG nommé `.jpg` reste un PNG. L'extension ne sert donc que
// si aucune signature n'est reconnue.
//
// SANS L'UNE NI L'AUTRE, UN TYPE VIDE. C'est ce que donne un navigateur à un fichier dont il ne
// connaît pas l'extension, et c'est vrai : on ne sait pas. Un type vide ne se fait passer pour
// aucun format, là où un défaut choisi en aurait nommé un.
//
// Références : PNG, ISO/IEC 15948 § 5.2 ; JPEG, UIT-T T.81, marqueur SOI ; GIF87a et GIF89a ;
// WebP, RFC 9649 § 2.5 ; BMP, en-têtes BITMAPFILEHEADER et BITMAPINFOHEADER ; AVIF, boîte `ftyp`
// d'ISO/IEC 14496-12 ; SVG 1.1, élément racine `svg`.

/** Les types qu'une image relue peut recevoir, et le type vide quand on ne sait pas. */
export type TypeImage =
  | "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/bmp" | "image/avif"
  | "image/svg+xml" | "";

const SIGNATURE_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/**
 * Les tailles d'en-tête DIB qu'un BMP peut porter, de BITMAPCOREHEADER (12) à BITMAPV5HEADER (124).
 *
 * « BM » seul ne suffit pas : deux lettres, n'importe quel texte peut commencer ainsi. La taille de
 * l'en-tête qui suit, à l'octet 14, est le premier champ que le format fixe à une liste fermée.
 */
const TAILLES_EN_TETE_BMP = new Set([12, 40, 52, 56, 64, 108, 124]);

/** Ces octets, de `de` à `de + n`, lus comme des lettres. */
function ascii(o: Uint8Array, de: number, n: number): string {
  return o.length >= de + n ? String.fromCharCode(...o.subarray(de, de + n)) : "";
}

/**
 * Ces octets commencent-ils un document SVG ?
 *
 * La racine `<svg` peut venir après une marque d'ordre d'octets, des blancs, une déclaration XML,
 * des commentaires et une déclaration de type de document : ils sont passés, et rien d'autre. La
 * marque, `TextDecoder` la retire de lui-même.
 */
function estDocumentSvg(o: Uint8Array): boolean {
  let texte = new TextDecoder().decode(o.subarray(0, 1024)).trimStart();
  const prologue = /^(?:<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)\s*/i;
  for (let m = prologue.exec(texte); m; m = prologue.exec(texte)) texte = texte.slice(m[0].length);
  return /^<svg[\s>/]/.test(texte);
}

/** Le type que disent ces octets par leur signature, ou `undefined` s'ils n'en portent aucune connue. */
export function typeImageDesOctets(o: Uint8Array): Exclude<TypeImage, ""> | undefined {
  if (o.length >= SIGNATURE_PNG.length && SIGNATURE_PNG.every((b, i) => o[i] === b)) return "image/png";
  if (o.length >= 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return "image/jpeg";
  if (ascii(o, 0, 6) === "GIF87a" || ascii(o, 0, 6) === "GIF89a") return "image/gif";
  if (ascii(o, 0, 4) === "RIFF" && ascii(o, 8, 4) === "WEBP") return "image/webp";
  if (ascii(o, 0, 2) === "BM" && o.length >= 18) {
    const tailleEnTete = o[14] | (o[15] << 8) | (o[16] << 16) | (o[17] << 24);
    if (TAILLES_EN_TETE_BMP.has(tailleEnTete)) return "image/bmp";
  }
  if (ascii(o, 4, 4) === "ftyp" && (ascii(o, 8, 4) === "avif" || ascii(o, 8, 4) === "avis")) return "image/avif";
  if (estDocumentSvg(o)) return "image/svg+xml";
  return undefined;
}

const PAR_EXTENSION: Readonly<Record<string, Exclude<TypeImage, "">>> = {
  png: "image/png",
  jpg: "image/jpeg", jpeg: "image/jpeg", jpe: "image/jpeg", jfif: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  avif: "image/avif",
  svg: "image/svg+xml",
};

/** Le type que dit l'extension d'un nom de fichier, casse ignorée, ou `undefined`. */
export function typeImageDeLExtension(nom: string | undefined): Exclude<TypeImage, ""> | undefined {
  const extension = /\.([^./\\]+)$/.exec(nom ?? "")?.[1]?.toLowerCase();
  return extension ? PAR_EXTENSION[extension] : undefined;
}

/** Le type à déclarer pour une image relue : ses octets, sinon son extension, sinon le type vide. */
export function typeImageRelue(o: Uint8Array, nom: string | undefined): TypeImage {
  return typeImageDesOctets(o) ?? typeImageDeLExtension(nom) ?? "";
}
