// core/type-image.test.ts — Le type d'une image relue se lit sur ses octets.
//
// CE QUE CES CAS GARDENT. Au rechargement d'un projet, le type d'une « Entrée image » venait de
// son extension seule, et tout ce qui n'était ni `.png` ni `.svg` se disait `image/jpeg`. Les cas
// ci-dessous fixent, format par format, ce que disent les octets, ce que dit l'extension quand ils
// ne disent rien, et le type vide quand ni l'un ni l'autre ne sait.
//
// LES SIGNATURES SONT ÉCRITES D'APRÈS LES NORMES, octet par octet, et non tirées du module : un
// test qui reprendrait sa table ne pourrait pas la contredire. Le PNG du dépôt, `public/icon.png`,
// est lu en plus, comme un vrai fichier que rien ici n'a fabriqué.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { typeImageDeLExtension, typeImageDesOctets, typeImageRelue } from "./type-image";

const octets = (...valeurs: (number | string)[]): Uint8Array => new Uint8Array(valeurs.flatMap((v) =>
  typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v]));
const texte = (t: string) => new TextEncoder().encode(t);

/** Un entier sur quatre octets, poids faible d'abord, comme RIFF et BMP les écrivent. */
const u32le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

// PNG, ISO/IEC 15948 § 5.2 : huit octets, puis le bloc IHDR.
const PNG = octets(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, "IHDR");
// JPEG, UIT-T T.81 : le marqueur SOI (FF D8), puis le marqueur suivant, ici APP0 (FF E0).
const JPEG = octets(0xff, 0xd8, 0xff, 0xe0, 0, 16, "JFIF", 0);
const GIF87 = octets("GIF87a", 1, 0, 1, 0);
const GIF89 = octets("GIF89a", 1, 0, 1, 0);
// WebP, RFC 9649 § 2.5 : « RIFF », la taille, « WEBP », puis le premier bloc.
const WEBP = octets("RIFF", ...u32le(26), "WEBP", "VP8L", ...u32le(10));
// BMP : BITMAPFILEHEADER (14 octets), puis la taille de l'en-tête DIB, 40 pour BITMAPINFOHEADER.
const BMP = octets("BM", ...u32le(58), 0, 0, 0, 0, ...u32le(54), ...u32le(40), ...u32le(1), ...u32le(1));
// AVIF : une boîte `ftyp` d'ISO/IEC 14496-12 dont la marque majeure est « avif ».
const AVIF = octets(...[0, 0, 0, 0x1c], "ftypavif", 0, 0, 0, 0, "avifmif1miaf");

describe("le type que disent les octets", () => {
  it("chaque format se reconnaît à sa signature", () => {
    expect(typeImageDesOctets(PNG)).toBe("image/png");
    expect(typeImageDesOctets(JPEG)).toBe("image/jpeg");
    expect(typeImageDesOctets(GIF87)).toBe("image/gif");
    expect(typeImageDesOctets(GIF89)).toBe("image/gif");
    expect(typeImageDesOctets(WEBP)).toBe("image/webp");
    expect(typeImageDesOctets(BMP)).toBe("image/bmp");
    expect(typeImageDesOctets(AVIF)).toBe("image/avif");
    expect(typeImageDesOctets(texte("<svg xmlns=\"http://www.w3.org/2000/svg\"/>"))).toBe("image/svg+xml");
  });

  it("UN VRAI FICHIER, l'icône du dépôt, se dit PNG", () => {
    const icone = new Uint8Array(readFileSync(join(__dirname, "../../public/icon.png")));
    expect(typeImageDesOctets(icone)).toBe("image/png");
  });

  it("UN SVG se reconnaît après sa marque d'ordre, sa déclaration XML, ses commentaires et son doctype", () => {
    const bom = [0xef, 0xbb, 0xbf];
    const prologue = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!-- Inkscape -->\n"
      + "<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n";
    expect(typeImageDesOctets(new Uint8Array([...bom, ...texte(`  ${prologue}<svg width="4">`)]))).toBe("image/svg+xml");
    expect(typeImageDesOctets(texte("\n\t<svg>"))).toBe("image/svg+xml");
  });

  it("CE QUI RESSEMBLE N'EST PAS : un texte en « BM », un WAV, un MP4, une page qui contient un SVG", () => {
    expect(typeImageDesOctets(texte("BMW est une marque de voitures allemande")), "« BM » sans en-tête DIB").toBeUndefined();
    expect(typeImageDesOctets(octets("RIFF", ...u32le(36), "WAVEfmt "))).toBeUndefined();
    expect(typeImageDesOctets(octets(0, 0, 0, 0x18, "ftypisom", 0, 0, 2, 0))).toBeUndefined();
    expect(typeImageDesOctets(texte("<html><body><svg></svg></body></html>"))).toBeUndefined();
    expect(typeImageDesOctets(texte("<svgfoo/>")), "une balise dont le nom commence par svg").toBeUndefined();
    expect(typeImageDesOctets(texte("GIF8"))).toBeUndefined();
  });

  it("UNE SIGNATURE TRONQUÉE ne se reconnaît pas", () => {
    expect(typeImageDesOctets(PNG.subarray(0, 7))).toBeUndefined();
    expect(typeImageDesOctets(JPEG.subarray(0, 2))).toBeUndefined();
    expect(typeImageDesOctets(WEBP.subarray(0, 11))).toBeUndefined();
    expect(typeImageDesOctets(BMP.subarray(0, 17))).toBeUndefined();
    expect(typeImageDesOctets(new Uint8Array(0))).toBeUndefined();
  });
});

describe("le type que dit l'extension", () => {
  it("casse ignorée, et les quatre écritures du JPEG", () => {
    expect(typeImageDeLExtension("a.PNG")).toBe("image/png");
    for (const nom of ["b.jpg", "b.JPEG", "b.jpe", "b.jfif"]) expect(typeImageDeLExtension(nom), nom).toBe("image/jpeg");
    expect(typeImageDeLExtension("c.webp")).toBe("image/webp");
    expect(typeImageDeLExtension("d.Gif")).toBe("image/gif");
    expect(typeImageDeLExtension("e.bmp")).toBe("image/bmp");
    expect(typeImageDeLExtension("f.avif")).toBe("image/avif");
    expect(typeImageDeLExtension("g.svg")).toBe("image/svg+xml");
  });

  it("sans extension connue, rien : un point dans un dossier n'en est pas une", () => {
    expect(typeImageDeLExtension("C:/images.v2/sans-extension")).toBeUndefined();
    expect(typeImageDeLExtension("photo.tiff")).toBeUndefined();
    expect(typeImageDeLExtension("photo.")).toBeUndefined();
    expect(typeImageDeLExtension(undefined)).toBeUndefined();
  });
});

describe("le type déclaré pour une image relue", () => {
  it("LES OCTETS L'EMPORTENT sur l'extension : un PNG nommé .jpg est un PNG", () => {
    expect(typeImageRelue(PNG, "photo.jpg")).toBe("image/png");
    expect(typeImageRelue(WEBP, "photo.png")).toBe("image/webp");
  });

  it("L'EXTENSION SERT À DÉFAUT, et sans elle le type est vide, jamais JPEG", () => {
    const inconnu = texte("ni signature ni rien");
    expect(typeImageRelue(inconnu, "photo.jpeg")).toBe("image/jpeg");
    expect(typeImageRelue(inconnu, "photo.webp")).toBe("image/webp");
    expect(typeImageRelue(inconnu, "photo.tiff")).toBe("");
    expect(typeImageRelue(inconnu, undefined)).toBe("");
  });
});
