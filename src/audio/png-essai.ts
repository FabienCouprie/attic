// audio/png-essai.ts — Une image PNG fabriquée à la main, pour nourrir un composant au banc.
//
// POURQUOI À LA MAIN, ET NON PAR UN CANEVAS. Le dépôt sait déjà écrire un PNG — `canvas.toBlob`,
// dans `spectrogramme-fractal.ts` et ailleurs — mais un canevas n'existe que dans un navigateur.
// Une valeur d'essai doit se fabriquer des DEUX côtés : dans la page, où le banc l'emploie, et sous
// node, où les cas l'éprouvent. Un module qui rendrait `null` sous node ne serait pas testable, et
// c'est précisément ce qu'on reproche à ce qui vit dans un `page.evaluate`.
//
// CE QU'IL FAUT ÉCRIRE, ET POURQUOI C'EST COURT. Un PNG est une signature, puis des morceaux : IHDR
// qui dit la taille, IDAT qui porte les pixels, IEND qui ferme. Chaque morceau porte un CRC-32. Les
// pixels sont compressés en zlib — mais zlib accepte des blocs STOCKÉS, c'est-à-dire non compressés,
// ce qui évite d'écrire un compresseur : l'en-tête zlib, les blocs tels quels, et l'Adler-32 de la
// fin. Le fichier est plus gros qu'il ne pourrait l'être, et c'est sans importance pour seize pixels
// de côté.
//
// LE RÉSULTAT EST DÉTERMINISTE AU BIT PRÈS, ce qui est la condition pour qu'une empreinte mesurée
// sur une image veuille dire quelque chose.

/** Le CRC-32 d'un PNG, table calculée une fois. */
const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(octets: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** L'Adler-32 que termine un flux zlib. */
function adler32(octets: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < octets.length; i++) {
    a = (a + octets[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Un morceau PNG : longueur, nom, données, CRC du nom et des données. */
function morceau(nom: string, donnees: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + donnees.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, donnees.length, false);
  for (let i = 0; i < 4; i++) out[4 + i] = nom.charCodeAt(i);
  out.set(donnees, 8);
  dv.setUint32(8 + donnees.length, crc32(out.subarray(4, 8 + donnees.length)), false);
  return out;
}

/**
 * Un flux zlib en blocs STOCKÉS : aucun compresseur à écrire, et le résultat se relit partout.
 *
 * Un bloc stocké porte au plus 65 535 octets ; au-delà on en enchaîne plusieurs, le dernier
 * portant le drapeau de fin. Seize pixels de côté tiennent dans un seul.
 */
function zlibStocke(donnees: Uint8Array): Uint8Array {
  const blocs: Uint8Array[] = [];
  const MAX = 65535;
  for (let i = 0; i < donnees.length || i === 0; i += MAX) {
    const part = donnees.subarray(i, Math.min(i + MAX, donnees.length));
    const dernier = i + MAX >= donnees.length ? 1 : 0;
    const entete = new Uint8Array(5);
    entete[0] = dernier;
    entete[1] = part.length & 0xff;
    entete[2] = (part.length >> 8) & 0xff;
    entete[3] = ~part.length & 0xff;
    entete[4] = (~part.length >> 8) & 0xff;
    blocs.push(entete, part);
    if (dernier) break;
  }
  const corps = blocs.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(2 + corps + 4);
  out[0] = 0x78; out[1] = 0x01; // zlib, compression minimale
  let o = 2;
  for (const b of blocs) { out.set(b, o); o += b.length; }
  new DataView(out.buffer).setUint32(o, adler32(donnees), false);
  return out;
}

/** Le côté de l'image d'essai, en pixels. Assez petit pour être rendu partout, assez grand pour
 *  qu'un composant qui lit des formes ou des couleurs y trouve de quoi lire. */
export const COTE_IMAGE_ESSAI = 16;

/**
 * Une image PNG d'essai : un dégradé croisé, barré d'une diagonale franche.
 *
 * ELLE N'EST NI UNIE NI ALÉATOIRE, et les deux comptent. Une image unie ne montre rien d'un
 * composant qui cherche des formes ou une palette ; une image tirée au sort ne se compare pas d'une
 * passe à l'autre. Un dégradé donne des couleurs qui varient, la diagonale donne un contour.
 */
export function pngDEssai(cote = COTE_IMAGE_ESSAI): Uint8Array {
  // Les pixels, ligne par ligne, chacune précédée de son octet de filtre — zéro, « aucun filtre ».
  const brut = new Uint8Array(cote * (1 + cote * 4));
  let o = 0;
  for (let y = 0; y < cote; y++) {
    brut[o++] = 0;
    for (let x = 0; x < cote; x++) {
      const diagonale = Math.abs(x - y) <= 1;
      brut[o++] = diagonale ? 255 : Math.round((x / (cote - 1)) * 255);
      brut[o++] = diagonale ? 40 : Math.round((y / (cote - 1)) * 255);
      brut[o++] = diagonale ? 40 : Math.round(((cote - 1 - x) / (cote - 1)) * 255);
      brut[o++] = 255;
    }
  }

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, cote, false);
  dv.setUint32(4, cote, false);
  ihdr[8] = 8;   // huit bits par canal
  ihdr[9] = 6;   // couleur vraie avec transparence
  // Les trois suivants restent à zéro : compression, filtrage et entrelacement standards.

  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [
    signature,
    morceau("IHDR", ihdr),
    morceau("IDAT", zlibStocke(brut)),
    morceau("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}

/** La même image, dans le `File` qu'un port « image » attend. */
export function imageDEssai(cote = COTE_IMAGE_ESSAI): File {
  // La copie du tampon est exigée par le typage : un `Uint8Array` peut reposer sur un
  // `SharedArrayBuffer`, qu'un `Blob` n'accepte pas. Seize pixels de côté, la copie est gratuite.
  const octets = pngDEssai(cote);
  const copie = new ArrayBuffer(octets.length);
  new Uint8Array(copie).set(octets);
  return new File([copie], "essai.png", { type: "image/png" });
}
