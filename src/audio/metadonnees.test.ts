// audio/metadonnees.test.ts — Ce qu'un fichier écrit par Attic dit de lui-même, lu comme un tiers le lirait.
//
// LE LECTEUR PARCOURT LES BLOCS ET LES TRAMES, COMME N'IMPORTE QUEL AUTRE. Un bloc iXML décalé d'un
// octet, une étiquette ID3 dont l'en-tête contredit les trames : ces fautes ne se voient pas depuis
// Attic, qui se relit lui-même avec ses propres conventions. On les cherche donc avec le lecteur le
// plus bête qui soit, celui qui suit la norme à la lettre.
import { describe, expect, it, beforeAll } from "vitest";
import { bufferVersWavBlob, extraireGrapheMp3, extraireGrapheWav } from "./io";
import { etiqueter } from "./multicanal";
import {
  VERSION_ATTIC, blocIxml, decrire, echapperXml, etiquetteId3, ixmlImplicite, nomsDePistes, uidDeContenu,
} from "./metadonnees";

class AudioBufferPolyfill {
  numberOfChannels: number; length: number; sampleRate: number; duration: number;
  private canaux: Float32Array[];
  constructor(o: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = o.numberOfChannels; this.length = o.length; this.sampleRate = o.sampleRate;
    this.duration = o.length / o.sampleRate;
    this.canaux = Array.from({ length: o.numberOfChannels }, () => new Float32Array(o.length));
  }
  getChannelData(c: number) { return this.canaux[c]; }
  copyToChannel(src: Float32Array, c: number) { this.canaux[c].set(src.subarray(0, this.length)); }
}
beforeAll(() => { (globalThis as any).AudioBuffer = AudioBufferPolyfill; });

const tampon = (canaux: number, n: number, sr = 48000): AudioBuffer => {
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: sr }) as AudioBuffer;
  for (let c = 0; c < canaux; c++) b.getChannelData(c).set(Float32Array.from({ length: n }, (_, i) => Math.sin((i + c) / 9) * 0.5));
  return b;
};

/** Les blocs d'un WAV, dans l'ordre, avec leur contenu brut. */
async function blocs(blob: Blob): Promise<{ id: string; taille: number; debut: number; donnees: Uint8Array }[]> {
  const ab = await blob.arrayBuffer();
  const v = new DataView(ab);
  const out = [];
  let o = 12;
  while (o + 8 <= v.byteLength) {
    const id = String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    const taille = v.getUint32(o + 4, true);
    out.push({ id, taille, debut: o, donnees: new Uint8Array(ab, o + 8, Math.min(taille, ab.byteLength - o - 8)) });
    o += 8 + taille + (taille % 2);
  }
  return out;
}

const texteDe = (u: Uint8Array) => new TextDecoder().decode(u);
const balise = (xml: string, nom: string) => xml.match(new RegExp(`<${nom}>([^<]*)</${nom}>`))?.[1];

describe("le document iXML", () => {
  const xml = ixmlImplicite(
    { noeud: "Fin de boucle collection", source: "prise 3.wav", nomFichier: "prise 3-traite.wav" },
    { frequence: 48000, bits: 24, canaux: 6, nomsDePistes: ["L", "R", "C", "LFE", "Ls", "Rs"], uid: "a".repeat(32) },
  );

  it("porte la provenance : le nœud, le fichier d'origine, le nom écrit, et la version d'Attic", () => {
    expect(balise(xml, "PARENT_FILENAME")).toBe("prise 3.wav");
    expect(balise(xml, "ORIGINAL_FILENAME")).toBe("prise 3-traite.wav");
    expect(balise(xml, "NOTE")).toContain("Fin de boucle collection");
    expect(balise(xml, "NOTE")).toContain(`Attic ${VERSION_ATTIC}`);
    expect(VERSION_ATTIC).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("LES PISTES D'UN MULTICANAL SONT NOMMÉES — c'est ce qui rend un 5.1 relisible ailleurs", () => {
    expect(balise(xml, "TRACK_COUNT")).toBe("6");
    const noms = [...xml.matchAll(/<NAME>([^<]*)<\/NAME>/g)].map((m) => m[1]);
    expect(noms).toEqual(["L", "R", "C", "LFE", "Ls", "Rs"]);
  });

  it("la fréquence et la profondeur sont celles du fichier", () => {
    expect(balise(xml, "FILE_SAMPLE_RATE")).toBe("48000");
    expect(balise(xml, "AUDIO_BIT_DEPTH")).toBe("24");
  });

  it("UN NOM DE FICHIER N'INJECTE RIEN DANS LE XML", () => {
    const piege = ixmlImplicite(
      { noeud: "n", source: `a&b<c>"d'.wav` },
      { frequence: 44100, canaux: 2, uid: "0".repeat(32) },
    );
    expect(balise(piege, "PARENT_FILENAME")).toBe("a&amp;b&lt;c&gt;&quot;d&apos;.wav");
    // Aucun chevron nu hors des balises : le document reste bien formé.
    expect(piege.replace(/<\/?[A-Z_]+>|<\?xml[^>]*\?>/g, "")).not.toMatch(/[<>]/);
    // Écrits en séquences d'échappement, et non en caractères bruts : un caractère de contrôle brut
    // dans une source fait traiter le fichier comme binaire par git.
    expect(echapperXml("x\u0001\u0002y")).toBe("xy");
    expect(echapperXml("a\u0000b\u001fc\td")).toBe("abc\td");
  });

  it("sans profondeur ni source, rien de vide n'est écrit", () => {
    const court = ixmlImplicite({ noeud: "n" }, { frequence: 44100, canaux: 1, uid: "0".repeat(32) });
    expect(court).not.toContain("AUDIO_BIT_DEPTH");
    expect(court).not.toContain("PARENT_FILENAME");
    expect([...court.matchAll(/<NAME>([^<]*)<\/NAME>/g)].map((m) => m[1])).toEqual(["M"]);
  });

  it("les noms de pistes par défaut", () => {
    expect(nomsDePistes(1)).toEqual(["M"]);
    expect(nomsDePistes(2)).toEqual(["L", "R"]);
    expect(nomsDePistes(4)).toEqual(["1", "2", "3", "4"]);
    // Des noms connus du mauvais nombre ne s'appliquent pas.
    expect(nomsDePistes(3, ["L", "R"])).toEqual(["1", "2", "3"]);
  });
});

describe("l'identifiant de fichier", () => {
  it("MÊME SON, MÊME IDENTIFIANT — deux rendus identiques restent deux fichiers identiques", () => {
    const a = tampon(2, 5000), b = tampon(2, 5000);
    const canaux = (t: AudioBuffer) => [t.getChannelData(0), t.getChannelData(1)];
    expect(uidDeContenu(canaux(a), "x")).toBe(uidDeContenu(canaux(b), "x"));
    expect(uidDeContenu(canaux(a), "x")).toMatch(/^[0-9a-f]{32}$/);
  });

  it("un son différent, ou un nom différent, donne un autre identifiant", () => {
    const a = tampon(1, 5000);
    const b = tampon(1, 5000);
    b.getChannelData(0)[640] += 0.25;
    expect(uidDeContenu([a.getChannelData(0)])).not.toBe(uidDeContenu([b.getChannelData(0)]));
    expect(uidDeContenu([a.getChannelData(0)], "un")).not.toBe(uidDeContenu([a.getChannelData(0)], "deux"));
  });
});

describe("le bloc iXML dans le WAV", () => {
  it("S'ÉCRIT EN BLOC « iXML » APRÈS LES DONNÉES, ET SE RETROUVE EN PARCOURANT LES BLOCS", async () => {
    const t = etiqueter(tampon(6, 1000), "5.1");
    const doc = ixmlImplicite({ noeud: "n", source: "s.wav" },
      { frequence: 48000, bits: 24, canaux: 6, nomsDePistes: ["L", "R", "C", "LFE", "Ls", "Rs"], uid: "b".repeat(32) });
    const blob = bufferVersWavBlob(t, undefined, false, { bits: 24, ixml: doc });
    const liste = await blocs(blob);
    expect(liste.map((b) => b.id)).toEqual(["fmt ", "data", "iXML"]);
    const x = liste.find((b) => b.id === "iXML")!;
    expect(texteDe(x.donnees)).toBe(doc);
    // La taille RIFF couvre tout le fichier, bloc iXML compris.
    const ab = await blob.arrayBuffer();
    expect(new DataView(ab).getUint32(4, true)).toBe(ab.byteLength - 8);
  });

  it("l'identifiant du bloc est « iXML », casse comprise, et sa taille paire est respectée", () => {
    expect(texteDe(blocIxml("abc").subarray(0, 4))).toBe("iXML");
    expect(blocIxml("abc").length).toBe(8 + 3 + 1);   // bourré à un nombre pair
    expect(blocIxml("abcd").length).toBe(8 + 4);
  });

  it("L'OCTET DE BOURRAGE APRÈS DES DONNÉES IMPAIRES : le graphe embarqué se retrouve", async () => {
    // Le cas qui ratait : 24 bits, mono, longueur impaire → données de taille impaire. Le bloc suivant
    // était écrit sans bourrage, décalé d'un octet, et le lecteur d'Attic ne le retrouvait pas.
    const G = JSON.stringify({ noeuds: [{ id: "é" }] });
    const blob = bufferVersWavBlob(tampon(1, 1001), G, false, { bits: 24, ixml: "<BWFXML/>" });
    const ab = await blob.arrayBuffer();
    expect(extraireGrapheWav(ab)).toBe(G);
    const liste = await blocs(blob);
    expect(liste.map((b) => b.id)).toEqual(["fmt ", "data", "iXML", "LIST"]);
    expect(liste[1].taille % 2).toBe(1);
    expect(new DataView(ab).getUint32(4, true)).toBe(ab.byteLength - 8);
  });

  it("sans iXML demandé, le fichier est celui d'avant", async () => {
    const liste = await blocs(bufferVersWavBlob(tampon(2, 100), undefined, false, { bits: 16 }));
    expect(liste.map((b) => b.id)).toEqual(["fmt ", "data"]);
  });
});

describe("l'étiquette ID3v2.4 du MP3", () => {
  /** Les trames d'une étiquette, lues selon ID3v2.4 : tailles sur quatre octets de sept bits. */
  const trames = (e: Uint8Array) => {
    const taille = (e[6] << 21) | (e[7] << 14) | (e[8] << 7) | e[9];
    const out: { id: string; contenu: Uint8Array }[] = [];
    let o = 10;
    while (o + 10 <= 10 + taille) {
      const id = String.fromCharCode(e[o], e[o + 1], e[o + 2], e[o + 3]);
      const t = (e[o + 4] << 21) | (e[o + 5] << 14) | (e[o + 6] << 7) | e[o + 7];
      out.push({ id, contenu: e.subarray(o + 10, o + 10 + t) });
      o += 10 + t;
    }
    return { taille, out };
  };

  it("L'EN-TÊTE ET LES TRAMES SONT DE LA MÊME VERSION — la 2.4, et le texte est déclaré UTF-8", () => {
    const e = etiquetteId3({ titre: "Été", ixml: "<BWFXML/>", graphe: "{}" });
    expect(Array.from(e.subarray(0, 5))).toEqual([0x49, 0x44, 0x33, 0x04, 0x00]);
    const { taille, out } = trames(e);
    expect(10 + taille).toBe(e.length);
    expect(out.map((t) => t.id)).toEqual(["TSSE", "TIT2", "TXXX", "TXXX"]);
    for (const t of out) expect(t.contenu[0], t.id).toBe(3);
    expect(texteDe(out[1].contenu.subarray(1))).toBe("Été");
    expect(texteDe(out[0].contenu.subarray(1))).toBe(`Attic ${VERSION_ATTIC}`);
  });

  it("les tailles sont sur sept bits par octet, même au-delà de 127", () => {
    const long = "x".repeat(20000);
    const { out } = trames(etiquetteId3({ ixml: long }));
    const ixml = out.find((t) => t.id === "TXXX")!;
    expect(texteDe(ixml.contenu.subarray(1))).toBe(`iXML\u0000${long}`);
  });

  it("LE GRAPHE EMBARQUÉ SE RELIT TOUJOURS, au milieu des nouvelles trames et accents compris", () => {
    const G = JSON.stringify({ noeuds: [{ id: "spatialisé", nom: "Écoute" }] });
    const e = etiquetteId3({ titre: "t", ixml: "<BWFXML/>", graphe: G });
    const mp3 = new Uint8Array(e.length + 4);
    mp3.set(e, 0);
    mp3.set([0xff, 0xfb, 0x90, 0x00], e.length);
    expect(extraireGrapheMp3(mp3.buffer)).toBe(G);
  });
});

describe("decrire : ce que le tampon dit de lui-même", () => {
  const tampon = (canaux: number) => {
    const donnees = Array.from({ length: canaux }, (_, c) => Float32Array.from({ length: 4800 }, (_, i) => Math.sin(i * (c + 1) / 50)));
    return { numberOfChannels: canaux, sampleRate: 48000, getChannelData: (c: number) => donnees[c] };
  };

  it("UN 5.1 ÉTIQUETÉ nomme ses pistes d'après ses haut-parleurs, dans l'ordre du fichier", () => {
    const { ixml } = decrire(etiqueter(tampon(6), "5.1"), { noeud: "Sortie audio" }, 24);
    const noms = [...ixml.matchAll(/<NAME>([^<]+)<\/NAME>/g)].map((m) => m[1]);
    expect(noms).toEqual(["L", "R", "C", "LFE", "Ls", "Rs"]);
    expect(ixml).toContain("<AUDIO_BIT_DEPTH>24</AUDIO_BIT_DEPTH>");
  });

  it("UN CHAMP AMBISONIQUE nomme ses composantes en ACN, et non en haut-parleurs qu'il n'a pas", () => {
    const { ixml } = decrire(etiqueter(tampon(9), "hoa2"), { noeud: "Spatialiseur" });
    const noms = [...ixml.matchAll(/<NAME>([^<]+)<\/NAME>/g)].map((m) => m[1]);
    expect(noms).toEqual(["ACN0", "ACN1", "ACN2", "ACN3", "ACN4", "ACN5", "ACN6", "ACN7", "ACN8"]);
    expect(ixml).not.toContain("AUDIO_BIT_DEPTH");
  });

  it("SANS DISPOSITION, six canaux restent numérotés : on ne devine pas un 5.1", () => {
    const { ixml } = decrire(tampon(6), { noeud: "x" });
    const noms = [...ixml.matchAll(/<NAME>([^<]+)<\/NAME>/g)].map((m) => m[1]);
    expect(noms).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("le titre est le nom de la source sans extension, et l'identifiant suit la source", () => {
    const b = tampon(2);
    const a = decrire(b, { noeud: "n", source: "prise 3.wav", nomFichier: "prise 3.mp3" });
    const c = decrire(b, { noeud: "n", source: "prise 4.wav", nomFichier: "prise 4.mp3" });
    expect(a.titre).toBe("prise 3");
    expect(/<FILE_UID>(\w+)</.exec(a.ixml)![1]).not.toBe(/<FILE_UID>(\w+)</.exec(c.ixml)![1]);
    expect(decrire(b, { noeud: "n", source: "prise 3.wav", nomFichier: "prise 3.mp3" }).ixml).toBe(a.ixml);
  });
});
