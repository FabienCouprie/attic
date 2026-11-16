// ui/paquet/zip.test.ts — L'archive s'écrit et se relit, et chaque refus de la lecture tient.
//
// CHAQUE REFUS EST ÉPROUVÉ SUR UNE ARCHIVE QU'ON ABÎME À LA MAIN, octet par octet, après l'avoir
// écrite saine : un nom qui sort de l'archive, deux noms pareils, un chiffrement, une marque zip64, un
// en-tête local qui dit un autre nom, une archive coupée, une méthode inconnue, un CRC faux, et une
// bombe — une entrée qui se décompresse en dix mégaoctets et en déclare cent.
import { describe, expect, it } from "vitest";
import { crc32, ecrireZip, estUnZip, extraire, lireRepertoire, nomSur, RefusPaquet } from "./zip";

const texte = new TextEncoder();
const octetsDe = (s: string) => texte.encode(s);

/** Où se trouvent, dans une archive écrite par `ecrireZip`, les en-têtes de chaque entrée. */
function positions(z: Uint8Array) {
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
  const fin = z.length - 22;
  const nombre = dv.getUint16(fin + 10, true);
  let o = dv.getUint32(fin + 16, true);
  const rendu: { central: number; local: number; lNom: number }[] = [];
  for (let k = 0; k < nombre; k++) {
    const lNom = dv.getUint16(o + 28, true);
    rendu.push({ central: o, local: dv.getUint32(o + 42, true), lNom });
    o += 46 + lNom;
  }
  return { dv, rendu, fin };
}

/** Remplace le nom d'une entrée, dans le répertoire central et l'en-tête local, ou dans l'un des deux. */
function renommer(z: Uint8Array, k: number, nom: string, ou: "les deux" | "local seul" = "les deux"): Uint8Array {
  const c = z.slice();
  const { rendu } = positions(c);
  const n = octetsDe(nom);
  expect(n.length).toBe(rendu[k].lNom);
  if (ou === "les deux") c.set(n, rendu[k].central + 46);
  c.set(n, rendu[k].local + 30);
  return c;
}

const refus = async (f: () => unknown) => {
  try { await f(); } catch (e) { if (e instanceof RefusPaquet) return e.code; throw e; }
  return "accepté";
};

describe("le zip s'écrit et se relit", () => {
  it("LE CRC-32 EST CELUI DU FORMAT : « 123456789 » vaut CBF43926", () => {
    expect(crc32(octetsDe("123456789")).toString(16)).toBe("cbf43926");
  });

  it("UNE ENTRÉE STOCKÉE ET UNE ENTRÉE COMPRESSÉE REVIENNENT À L'OCTET", async () => {
    const binaire = new Uint8Array(4096).map((_, i) => (i * 37) & 0xff);
    const z = await ecrireZip([
      { nom: "a.json", octets: octetsDe("{\"x\":1}".repeat(200)), compresser: true },
      { nom: "donnees/000000.bin", octets: binaire },
    ]);
    expect(estUnZip(z)).toBe(true);
    const r = lireRepertoire(z);
    expect([...r.keys()]).toEqual(["a.json", "donnees/000000.bin"]);
    expect(r.get("a.json")!.methode).toBe(8);
    expect(r.get("a.json")!.tailleCompressee).toBeLessThan(1400);
    expect(new TextDecoder().decode(await extraire(z, r.get("a.json")!, 1e6))).toBe("{\"x\":1}".repeat(200));
    expect(await extraire(z, r.get("donnees/000000.bin")!, 1e6)).toEqual(binaire);
  });

  it("DEUX ÉCRITURES DU MÊME CONTENU SONT LE MÊME FICHIER : la date est fixe", async () => {
    const e = [{ nom: "p.json", octets: octetsDe("{}"), compresser: true }];
    expect(await ecrireZip(e)).toEqual(await ecrireZip(e));
  });

  it("ON RECONNAÎT UN ZIP À SES QUATRE PREMIERS OCTETS, et pas un JSON", () => {
    expect(estUnZip(octetsDe("PK\u0003\u0004…"))).toBe(true);
    expect(estUnZip(octetsDe("PK\u0005\u0006"))).toBe(true);
    expect(estUnZip(octetsDe("{\"nodes\":[]}"))).toBe(false);
    expect(estUnZip(octetsDe("\uFEFF{"))).toBe(false);
    expect(estUnZip(octetsDe("PK"))).toBe(false);
  });
});

describe("un nom qui sort de l'archive est refusé", () => {
  it("LA RÈGLE, nom par nom", () => {
    for (const bon of ["projet.json", "donnees/000001.bin", "dossier/", "a/b/c.txt", "..a", "a..b"]) expect(nomSur(bon), bon).toBe(true);
    for (const mauvais of ["", "../x", "a/../../x", "/etc/x", "C:/x", "c:x", "a\\x", "./x", "a//b", "a/./b", `a${String.fromCharCode(0)}b`]) {
      expect(nomSur(mauvais), mauvais).toBe(false);
    }
  });

  it("UNE SEULE ENTRÉE QUI SORT FAIT REFUSER L'ARCHIVE ENTIÈRE, même une qu'on ne lirait pas", async () => {
    const z = await ecrireZip([{ nom: "projet.json", octets: octetsDe("{}") }, { nom: "xx/evil", octets: octetsDe("!") }]);
    expect(await refus(() => lireRepertoire(renommer(z, 1, "../evil")))).toBe("chemin");
    expect(await refus(() => lireRepertoire(renommer(z, 1, "/x/evil")))).toBe("chemin");
    expect(await refus(() => lireRepertoire(renommer(z, 1, "C:/evil")))).toBe("chemin");
    expect(await refus(() => lireRepertoire(renommer(z, 1, "xx\\evil")))).toBe("chemin");
  });

  it("UN EN-TÊTE LOCAL QUI DIT UN AUTRE NOM QUE LE RÉPERTOIRE EST REFUSÉ", async () => {
    const z = await ecrireZip([{ nom: "xx/evil", octets: octetsDe("!") }]);
    // LE RÉPERTOIRE CENTRAL GARDE UN NOM SÛR : seul l'en-tête local, qu'un extracteur naïf lirait, sort.
    const deuxNoms = renommer(z, 0, "../evil", "local seul");
    expect([...lireRepertoire(z).keys()]).toEqual(["xx/evil"]);
    expect(await refus(() => lireRepertoire(deuxNoms))).toBe("chemin");
  });

  it("L'ÉCRITURE REFUSE AUSSI CE QUE LA LECTURE REFUSERAIT", async () => {
    await expect(ecrireZip([{ nom: "../x", octets: octetsDe("!") }])).rejects.toThrow(RangeError);
    await expect(ecrireZip([{ nom: "a", octets: octetsDe("1") }, { nom: "a", octets: octetsDe("2") }])).rejects.toThrow(RangeError);
  });
});

describe("une archive abîmée ou hors du format est refusée", () => {
  it("DEUX ENTRÉES DE MÊME NOM", async () => {
    const z = await ecrireZip([{ nom: "aaaa", octets: octetsDe("1") }, { nom: "bbbb", octets: octetsDe("2") }]);
    expect(await refus(() => lireRepertoire(renommer(z, 1, "aaaa")))).toBe("doublon");
  });

  it("UNE ENTRÉE CHIFFRÉE, ET UNE MARQUE ZIP64", async () => {
    const z = await ecrireZip([{ nom: "a", octets: octetsDe("1") }]);
    const chiffre = z.slice();
    const p = positions(chiffre);
    p.dv.setUint16(p.rendu[0].central + 8, 0x0801, true);
    expect(await refus(() => lireRepertoire(chiffre))).toBe("chiffre");
    const z64 = z.slice();
    const q = positions(z64);
    q.dv.setUint32(q.rendu[0].central + 24, 0xffffffff, true);
    expect(await refus(() => lireRepertoire(z64))).toBe("zip64");
  });

  it("UNE ARCHIVE COUPÉE, ET UN FICHIER QUI N'EST PAS UNE ARCHIVE", async () => {
    const z = await ecrireZip([{ nom: "a", octets: octetsDe("123456") }]);
    expect(await refus(() => lireRepertoire(z.subarray(0, z.length - 5)))).toBe("tronque");
    expect(await refus(() => lireRepertoire(z.subarray(0, 10)))).toBe("tronque");
    expect(await refus(() => lireRepertoire(octetsDe("{\"nodes\":[]}".repeat(4))))).toBe("tronque");
  });

  it("UNE MÉTHODE INCONNUE, UN CRC FAUX, UNE TAILLE STOCKÉE QUI MENT", async () => {
    const z = await ecrireZip([{ nom: "a", octets: octetsDe("123456") }]);
    const methode = z.slice();
    const p = positions(methode);
    p.dv.setUint16(p.rendu[0].central + 10, 99, true);
    expect(await refus(() => extraire(methode, lireRepertoire(methode).get("a")!, 100))).toBe("methode");
    const crc = z.slice();
    crc[positions(crc).rendu[0].local + 31] ^= 0xff;
    expect(await refus(() => extraire(crc, lireRepertoire(crc).get("a")!, 100))).toBe("crc");
    const taille = z.slice();
    const q = positions(taille);
    q.dv.setUint32(q.rendu[0].central + 24, 3, true);
    expect(await refus(() => extraire(taille, lireRepertoire(taille).get("a")!, 100))).toBe("taille");
  });
});

describe("une bombe zip est coupée au premier octet de trop", () => {
  it("DIX MÉGAOCTETS QUI EN DÉCLARENT CENT : le flux s'arrête, rien n'est rendu", async () => {
    const zeros = new Uint8Array(10 * 1024 * 1024);
    const z = await ecrireZip([{ nom: "bombe", octets: zeros, compresser: true }]);
    const e0 = lireRepertoire(z).get("bombe")!;
    expect(e0.tailleCompressee, "la bombe tient dans quelques kilooctets").toBeLessThan(20_000);
    const bombe = z.slice();
    const p = positions(bombe);
    p.dv.setUint32(p.rendu[0].central + 24, 100, true);
    const e = lireRepertoire(bombe).get("bombe")!;
    expect(e.taille).toBe(100);
    // LE FLUX EST COUPÉ, et non décompressé en entier puis jugé : c'est la coupure qui borne la
    // mémoire, et seul son message le dit — l'autre refus nommerait les dix mégaoctets rendus.
    const err = await extraire(bombe, e, 1e9).catch((x: RefusPaquet) => x);
    expect(err).toBeInstanceOf(RefusPaquet);
    expect((err as RefusPaquet).code).toBe("taille");
    expect((err as RefusPaquet).detail).toMatch(/plus de 100 octets/);
  });

  it("UNE ENTRÉE QUI REND MOINS QU'ELLE NE DÉCLARE EST REFUSÉE AUSSI", async () => {
    const z = await ecrireZip([{ nom: "court", octets: new Uint8Array(50), compresser: true }]);
    const menteur = z.slice();
    const p = positions(menteur);
    p.dv.setUint32(p.rendu[0].central + 24, 100, true);
    expect(await refus(() => extraire(menteur, lireRepertoire(menteur).get("court")!, 1e9))).toBe("taille");
  });

  it("UNE ENTRÉE QUI DÉCLARE PLUS QUE LE PLAFOND N'EST PAS MÊME OUVERTE", async () => {
    const z = await ecrireZip([{ nom: "a", octets: new Uint8Array(1000), compresser: true }]);
    expect(await refus(() => extraire(z, lireRepertoire(z).get("a")!, 999))).toBe("plafond");
  });
});
