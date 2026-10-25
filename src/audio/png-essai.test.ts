// audio/png-essai.test.ts — Le PNG fabrique a la main est un vrai PNG, relu octet par octet.
//
// POURQUOI CES CAS. Une image d'essai ecrite a la main peut etre ACCEPTEE par un cas complaisant et
// REFUSEE par le premier decodeur venu : un CRC faux, un Adler faux, une taille declaree qui ne
// correspond pas aux pixels, et le fichier reste « plausible » tant que personne ne le decode. On le
// relit donc comme un decodeur le ferait — signature, morceaux, CRC de chacun, flux zlib et son
// Adler — avant de le donner a un composant.
import { describe, expect, it } from "vitest";

import { COTE_IMAGE_ESSAI, imageDEssai, pngDEssai } from "./png-essai";

/** Relit un PNG : la signature, puis chaque morceau avec son CRC verifie. */
function relire(png: Uint8Array) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (png[i] !== sig[i]) throw new Error(`signature PNG fausse a l'octet ${i}`);
  }
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  const crc = (o: Uint8Array) => {
    let c = 0xffffffff;
    for (let i = 0; i < o.length; i++) c = table[(c ^ o[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const morceaux: { nom: string; donnees: Uint8Array }[] = [];
  let o = 8;
  while (o + 8 <= png.length) {
    const taille = dv.getUint32(o, false);
    const nom = String.fromCharCode(png[o + 4], png[o + 5], png[o + 6], png[o + 7]);
    const donnees = png.subarray(o + 8, o + 8 + taille);
    const attendu = dv.getUint32(o + 8 + taille, false);
    const calcule = crc(png.subarray(o + 4, o + 8 + taille));
    if (attendu !== calcule) throw new Error(`CRC faux sur le morceau ${nom}`);
    morceaux.push({ nom, donnees });
    o += 12 + taille;
    if (nom === "IEND") break;
  }
  return { morceaux, octetsLus: o };
}

describe("le PNG d'essai", () => {
  it("PORTE SA SIGNATURE ET SES TROIS MORCEAUX, avec des CRC justes", () => {
    const png = pngDEssai();
    const { morceaux, octetsLus } = relire(png);
    expect(morceaux.map((m) => m.nom)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(octetsLus, "le fichier se termine sur IEND, sans octet en trop").toBe(png.length);
  });

  it("DECLARE LA TAILLE QU'IL PORTE, en couleur vraie et huit bits", () => {
    const { morceaux } = relire(pngDEssai());
    const ihdr = morceaux[0].donnees;
    const dv = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
    expect(dv.getUint32(0, false)).toBe(COTE_IMAGE_ESSAI);
    expect(dv.getUint32(4, false)).toBe(COTE_IMAGE_ESSAI);
    expect(ihdr[8], "huit bits par canal").toBe(8);
    expect(ihdr[9], "couleur vraie avec transparence").toBe(6);
  });

  it("SON FLUX ZLIB EST VALIDE : en-tete, blocs stockes, et un Adler juste", () => {
    // C'EST LE CAS QUI ATTRAPE LA FAUTE LA PLUS SILENCIEUSE. Un Adler faux passe inapercu tant que
    // personne ne decode : le fichier a la bonne taille et la bonne forme, et seul un decodeur
    // refuse. On refait donc le calcul a l'envers.
    const { morceaux } = relire(pngDEssai());
    const idat = morceaux[1].donnees;
    expect(idat[0], "en-tete zlib").toBe(0x78);

    // On deroule les blocs stockes pour retrouver les octets d'origine.
    const sorti: number[] = [];
    let o = 2, dernier = 0;
    while (!dernier) {
      dernier = idat[o] & 1;
      const taille = idat[o + 1] | (idat[o + 2] << 8);
      const complement = idat[o + 3] | (idat[o + 4] << 8);
      expect((~taille) & 0xffff, "le complement d'une longueur de bloc stocke").toBe(complement);
      for (let i = 0; i < taille; i++) sorti.push(idat[o + 5 + i]);
      o += 5 + taille;
    }
    // La taille attendue : une ligne de filtre plus quatre octets par pixel, par ligne.
    expect(sorti.length).toBe(COTE_IMAGE_ESSAI * (1 + COTE_IMAGE_ESSAI * 4));

    let a = 1, b = 0;
    for (const v of sorti) { a = (a + v) % 65521; b = (b + a) % 65521; }
    const adler = new DataView(idat.buffer, idat.byteOffset, idat.byteLength).getUint32(o, false);
    expect(adler, "l'Adler-32 qui termine le flux").toBe(((b << 16) | a) >>> 0);
  });

  it("CHAQUE LIGNE COMMENCE PAR SON OCTET DE FILTRE", () => {
    const { morceaux } = relire(pngDEssai());
    const idat = morceaux[1].donnees;
    const sorti: number[] = [];
    let o = 2, dernier = 0;
    while (!dernier) {
      dernier = idat[o] & 1;
      const taille = idat[o + 1] | (idat[o + 2] << 8);
      for (let i = 0; i < taille; i++) sorti.push(idat[o + 5 + i]);
      o += 5 + taille;
    }
    const parLigne = 1 + COTE_IMAGE_ESSAI * 4;
    for (let y = 0; y < COTE_IMAGE_ESSAI; y++) {
      expect(sorti[y * parLigne], `ligne ${y} : filtre « aucun »`).toBe(0);
    }
  });

  it("N'EST NI UNIE NI ALEATOIRE : elle varie, et elle est la meme deux fois", () => {
    const a = pngDEssai(), b = pngDEssai();
    expect(Array.from(a)).toEqual(Array.from(b));
    // Une image unie se compresserait en un seul motif : on verifie plutot que les pixels diffe-
    // rent, en relisant trois d'entre eux dans le flux deroule.
    const { morceaux } = relire(a);
    const idat = morceaux[1].donnees;
    const taille = idat[3] | (idat[4] << 8);
    const debut = 7;
    const pixel = (y: number, x: number) => {
      const i = debut + y * (1 + COTE_IMAGE_ESSAI * 4) + 1 + x * 4;
      return [idat[i], idat[i + 1], idat[i + 2]];
    };
    expect(taille).toBeGreaterThan(0);
    expect(pixel(0, 0)).not.toEqual(pixel(0, COTE_IMAGE_ESSAI - 1));
    expect(pixel(5, 5), "la diagonale est franche").toEqual([255, 40, 40]);
  });

  it("ET LE FICHIER PORTE SON TYPE, que les composants lisent", async () => {
    const f = imageDEssai();
    expect(f).toBeInstanceOf(File);
    expect(f.type).toBe("image/png");
    expect(f.name).toMatch(/\.png$/);
    const octets = new Uint8Array(await f.arrayBuffer());
    expect(octets.length).toBe(pngDEssai().length);
  });
});
