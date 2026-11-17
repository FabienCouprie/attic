// plugins/image-export.test.ts — « Export image » écrit les octets reçus sous l'extension de leur format.
//
// CE QUE CES CAS GARDENT. Le nœud donnait `.png` à tout ce qui n'était ni `image/png` ni
// `image/jpeg`, et lisait le format sur `File.type` : un WebP, un GIF, un BMP ou un SVG sortait
// sous une extension que ses octets démentaient. Chaque cas lance le nœud pour de bon, laisse son
// pont écrire sur le disque, puis RELIT LE DOSSIER : le nom du fichier écrit et ses octets, comparés
// à ceux qui sont entrés. Un nom calculé juste et jamais employé ne passerait pas.
//
// LES SIGNATURES SONT ÉCRITES D'APRÈS LES NORMES, octet par octet, et non tirées du module : un
// test qui reprendrait sa table ne pourrait pas la contredire. Le PNG est l'icône du dépôt, un vrai
// fichier que rien ici n'a fabriqué ; le GIF et le BMP sont des images entières d'un pixel. Le
// JPEG, le WebP et l'AVIF ne portent que leurs en-têtes : le nœud n'en décode rien, il les écrit.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fiches } from "./image-export";

const octets = (...valeurs: (number | string)[]): Uint8Array => new Uint8Array(valeurs.flatMap((v) =>
  typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v]));

/** Un entier sur quatre octets, poids faible d'abord, comme RIFF et BMP les écrivent. */
const u32le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const u16le = (n: number) => [n & 0xff, (n >> 8) & 0xff];

const PNG = new Uint8Array(readFileSync(join(__dirname, "../../public/icon.png")));
// JPEG, UIT-T T.81 : le marqueur SOI (FF D8), le segment APP0 de JFIF, puis le marqueur EOI.
const JPEG = octets(0xff, 0xd8, 0xff, 0xe0, 0, 16, "JFIF", 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9);
// GIF89a d'un pixel : écran logique 1 × 1, palette de deux couleurs, une image, la fin « ; ».
const GIF = octets("GIF89a", ...u16le(1), ...u16le(1), 0x80, 0, 0, 255, 255, 255, 0, 0, 0,
  ",", ...u16le(0), ...u16le(0), ...u16le(1), ...u16le(1), 0, 2, 2, 0x44, 0x01, 0, ";");
// WebP, RFC 9649 § 2.5 : « RIFF », la taille, « WEBP », puis le premier bloc.
const WEBP = octets("RIFF", ...u32le(22), "WEBP", "VP8L", ...u32le(10), 0x2f, 0, 0, 0, 0, 0, 0, 0, 0, 0);
// BMP d'un pixel en 24 bits : BITMAPFILEHEADER (14 octets), BITMAPINFOHEADER (40), une ligne de 4.
const BMP = octets("BM", ...u32le(58), 0, 0, 0, 0, ...u32le(54),
  ...u32le(40), ...u32le(1), ...u32le(1), ...u16le(1), ...u16le(24), ...u32le(0), ...u32le(4),
  ...u32le(2835), ...u32le(2835), ...u32le(0), ...u32le(0), 0, 0, 255, 0);
// AVIF : une boîte `ftyp` d'ISO/IEC 14496-12 dont la marque majeure est « avif ».
const AVIF = octets(0, 0, 0, 0x1c, "ftypavif", 0, 0, 0, 0, "avifmif1miaf");
const SVG = new TextEncoder().encode(
  "<?xml version=\"1.0\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"4\" height=\"4\"><rect width=\"4\" height=\"4\"/></svg>");
// TIFF, en-tête « II* » : un format d'image que le nœud ne reconnaît pas.
const TIFF = octets("II", 42, 0, ...u32le(8));

const exportImage = fiches.find((f) => f.id === "export-image")!;

let dossier: string;
beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), "attic-export-image-"));
  // Le pont tel que le nœud l'emploie : il écrit vraiment, et rend le chemin écrit.
  const ecrireFichier = async (chemin: string, donnees: Uint8Array) => {
    writeFileSync(chemin, donnees);
    return chemin;
  };
  (globalThis as { window?: unknown }).window = { api: { ecrireFichier } };
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  rmSync(dossier, { recursive: true, force: true });
});

/** Lance le nœud sur ce fichier et ce nom, puis rend ce que le dossier contient après. */
async function exporter(o: Uint8Array, typeAnnonce: string, nom?: string) {
  const fichier = new File([o as BlobPart], "entree", { type: typeAnnonce });
  const ctx = {
    noeud: { data: {} },
    repertoireTravail: dossier,
    entree: (i: number) => (i === 0 ? fichier : undefined),
    paramTexte: (n: string, defaut: string) => (n === "Nom" && nom !== undefined ? nom : defaut),
  };
  const r = await exportImage.executer(ctx as never);
  const ecrits = readdirSync(dossier);
  expect(ecrits, "le nœud doit écrire un fichier et un seul").toHaveLength(1);
  const [nomEcrit] = ecrits;
  expect(r.valeurs[0], "la sortie « Chemin » doit nommer le fichier écrit").toBe(`${dossier}/${nomEcrit}`);
  return { nomEcrit, octetsEcrits: new Uint8Array(readFileSync(join(dossier, nomEcrit))) };
}

describe("Export image : l'extension suit le format des octets", () => {
  const CAS: [string, Uint8Array, string, string][] = [
    ["PNG", PNG, "image/png", "export.png"],
    ["JPEG", JPEG, "image/jpeg", "export.jpg"],
    ["WebP", WEBP, "image/webp", "export.webp"],
    ["GIF", GIF, "image/gif", "export.gif"],
    ["BMP", BMP, "image/bmp", "export.bmp"],
    ["SVG", SVG, "image/svg+xml", "export.svg"],
    ["AVIF", AVIF, "image/avif", "export.avif"],
  ];

  for (const [format, o, type, attendu] of CAS) {
    it(`un ${format} s'écrit en ${attendu}, octet pour octet`, async () => {
      const { nomEcrit, octetsEcrits } = await exporter(o, type);
      expect(nomEcrit).toBe(attendu);
      expect(octetsEcrits).toEqual(o);
    });
  }

  it("LE FORMAT SE LIT SUR LES OCTETS : un WebP annoncé JPEG s'écrit en .webp", async () => {
    const { nomEcrit, octetsEcrits } = await exporter(WEBP, "image/jpeg", "photo.jpg");
    expect(nomEcrit).toBe("photo.webp");
    expect(octetsEcrits).toEqual(WEBP);
  });

  it("l'extension d'image du nom saisi est remplacée, quelle qu'elle soit", async () => {
    const { nomEcrit } = await exporter(GIF, "image/gif", "pochette.webp");
    expect(nomEcrit).toBe("pochette.gif");
  });

  it("une extension qui n'est pas d'image reste dans le nom", async () => {
    const { nomEcrit } = await exporter(PNG, "image/png", "prise.v2");
    expect(nomEcrit).toBe("prise.v2.png");
  });

  it("un format non reconnu s'écrit sous le nom saisi, inchangé", async () => {
    const { nomEcrit, octetsEcrits } = await exporter(TIFF, "image/tiff", "scan.tif");
    expect(nomEcrit).toBe("scan.tif");
    expect(octetsEcrits).toEqual(TIFF);
  });
});
