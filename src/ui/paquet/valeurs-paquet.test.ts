// ui/paquet/valeurs-paquet.test.ts — Ce qui circule sur les arêtes revient du paquet tel qu'il est parti.
//
// « TEL QU'IL EST PARTI » SE MESURE DE DEUX FAÇONS, et les deux sont nécessaires. Les OCTETS de chaque
// tampon et de chaque tableau, comparés un à un : c'est ce qu'on entend. Et l'EMPREINTE du moteur,
// `empreinteValeur` de `core/graphe.ts`, qui décide si l'aval se recalcule : elle distingue
// `undefined` de `null` et un `Float32Array` d'un `Float64Array`, que JSON confond.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configurerServicesDomaine, oublierServicesDomaine } from "../../core/services-domaine";
import { empreinteValeur } from "../../core/graphe";
import { depuisPaquetAudio, versPaquetAudio } from "../../audio/paquet-audio";
import { departDe, poserDepart } from "../../audio/depart-bwf";
import { dispositionDe, etiqueter } from "../../audio/multicanal";
import { contientUnCheminAbsolu, DecodeurDePaquet, DonneeInvalide, EncodeurDePaquet, NonSerialisable } from "./valeurs-paquet";

beforeAll(() => configurerServicesDomaine({
  empreinte: (v) => (v instanceof AudioBuffer ? `AudioBuffer(${v.length},${v.sampleRate},${v.numberOfChannels})` : null),
  versPaquet: versPaquetAudio, depuisPaquet: depuisPaquetAudio,
}));
afterAll(() => oublierServicesDomaine());

function tampon(canaux: number, longueur: number, frequence = 48000): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: canaux, length: longueur, sampleRate: frequence });
  for (let c = 0; c < canaux; c++) {
    const d = new Float32Array(longueur);
    for (let i = 0; i < longueur; i++) d[i] = Math.sin(i * 0.01 * (c + 1)) * 0.5 + (i === 7 ? Number.MIN_VALUE : 0);
    b.copyToChannel(d, c);
  }
  return b;
}

/** Encode puis décode, comme le paquet le fait, sans le zip. */
async function allerRetour(v: unknown, o: { lireUrl?: (u: string) => Promise<Blob | null>; creerUrl?: (b: Blob) => string } = {}) {
  const enc = new EncodeurDePaquet({ lireUrl: o.lireUrl });
  const j = JSON.parse(JSON.stringify(await enc.encoder(v)));
  const partages = JSON.parse(JSON.stringify(enc.partages));
  const dec = new DecodeurDePaquet(partages, { lireOctets: (k) => enc.octets[k], creerUrl: o.creerUrl });
  return { relu: dec.decoder(j), enc };
}

const octetsDuTampon = (b: AudioBuffer) => Array.from({ length: b.numberOfChannels }, (_, c) => new Uint8Array(Float32Array.from(b.getChannelData(c)).buffer));

describe("une valeur revient du paquet à l'octet et à l'empreinte", () => {
  it("UN TAMPON STÉRÉO : chaque échantillon, sa fréquence, et l'empreinte du moteur", async () => {
    const b = tampon(2, 4410, 44100);
    const { relu } = await allerRetour(b);
    expect(relu).toBeInstanceOf(AudioBuffer);
    expect(empreinteValeur(relu)).toBe(empreinteValeur(b));
    expect(octetsDuTampon(relu as AudioBuffer)).toEqual(octetsDuTampon(b));
  });

  it("SA DISPOSITION ET SON HEURE, que des tables faibles tiennent hors de lui", async () => {
    const b = poserDepart(etiqueter(tampon(6, 100), "5.1"), 3600.5);
    expect(dispositionDe(b)?.id).toBe("5.1");
    const relu = (await allerRetour(b)).relu as AudioBuffer;
    expect(dispositionDe(relu)?.id).toBe("5.1");
    expect(departDe(relu)).toBe(3600.5);
  });

  it("CE QUE JSON CONFOND : undefined, null, NaN, ±Infinity, −0, un entier long, un trou", async () => {
    // eslint-disable-next-line no-sparse-arrays
    const v = { a: undefined, b: null, c: [1, undefined, null, NaN, Infinity, -Infinity, -0, , 3], d: 12345678901234567890n };
    const { relu } = await allerRetour(v);
    expect(empreinteValeur(relu)).toBe(empreinteValeur(v));
    const r = relu as typeof v;
    expect("a" in r).toBe(true);
    expect(Object.is(r.c[6], -0)).toBe(true);
    expect(Number.isNaN(r.c[3])).toBe(true);
    expect(r.c[7]).toBeUndefined();
    expect(r.d).toBe(12345678901234567890n);
  });

  it("CHAQUE TABLEAU TYPÉ GARDE SA CLASSE, et un ArrayBuffer reste un ArrayBuffer", async () => {
    const v = [new Float32Array([1.5, -2]), new Float64Array([Math.PI]), new Int16Array([-3, 7]), new Uint8Array([0, 255]),
      new Uint8ClampedArray([9]), new Int32Array([-1]), new Uint32Array([4e9]), new Int8Array([-8]), new Uint16Array([65535]),
      new BigInt64Array([-5n]), new Uint8Array([1, 2, 3, 4, 5]).subarray(1, 4), new Uint8Array([7, 8]).buffer];
    const { relu } = await allerRetour(v);
    expect(empreinteValeur(relu)).toBe(empreinteValeur(v));
    (relu as ArrayBufferView[]).forEach((x, i) => {
      const a = v[i];
      expect(x.constructor.name, `rang ${i}`).toBe(a.constructor.name);
      const octets = (t: ArrayBufferView | ArrayBuffer) => (t instanceof ArrayBuffer ? new Uint8Array(t) : new Uint8Array(t.buffer, t.byteOffset, t.byteLength));
      expect(octets(x), `rang ${i}`).toEqual(octets(a));
    });
  });

  it("UN FICHIER GARDE SON NOM, SON TYPE, SA DATE ET SES OCTETS ; un blob, son type", async () => {
    const f = new File([new Uint8Array([1, 2, 3])], "voix.wav", { type: "audio/wav", lastModified: 1_700_000_000_000 });
    const b = new Blob(["abc"], { type: "text/plain" });
    const { relu } = await allerRetour({ f, b });
    const r = relu as { f: File; b: Blob };
    expect(r.f).toBeInstanceOf(File);
    expect([r.f.name, r.f.type, r.f.lastModified, r.f.size]).toEqual(["voix.wav", "audio/wav", 1_700_000_000_000, 3]);
    expect(new Uint8Array(await r.f.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(empreinteValeur(r)).toBe(empreinteValeur({ f, b }));
    expect(await r.b.text()).toBe("abc");
  });

  it("UN MÊME OBJET DEUX FOIS EST UN SEUL ATOME, et relu, un seul objet", async () => {
    const b = tampon(1, 1000);
    const { relu, enc } = await allerRetour([b, { encore: b }]);
    expect(enc.octets.length, "un seul canal écrit").toBe(1);
    const r = relu as [AudioBuffer, { encore: AudioBuffer }];
    expect(r[0]).toBe(r[1].encore);
  });

  it("UNE CLÉ QUI COMMENCE PAR $ N'EST PAS PRISE POUR UNE MARQUE, et __proto__ reste une clé", async () => {
    const v = JSON.parse("{\"$p\":0,\"$u\":\"x\",\"__proto__\":{\"pollue\":true}}");
    const { relu } = await allerRetour(v);
    expect(Object.getPrototypeOf(relu)).toBe(Object.prototype);
    expect((relu as Record<string, unknown>).pollue).toBeUndefined();
    expect(Object.keys(relu as object)).toEqual(["$p", "$u", "__proto__"]);
    expect(({} as Record<string, unknown>).pollue).toBeUndefined();
  });

  it("UNE ADRESSE D'OBJET EST EMPORTÉE PAR SON CONTENU, et relue sous une adresse neuve", async () => {
    const contenu = new Blob([new Uint8Array([4, 5, 6])], { type: "audio/mpeg" });
    const { relu } = await allerRetour({ mp3Url: "blob:nodedata:1234" }, {
      lireUrl: async (u) => (u === "blob:nodedata:1234" ? contenu : null),
      creerUrl: (b) => `blob:neuve:${b.size}:${b.type}`,
    });
    expect(relu).toEqual({ mp3Url: "blob:neuve:3:audio/mpeg" });
  });
});

describe("ce qui ne s'écrit pas est dit, et l'encodeur revient en arrière", () => {
  const code = async (v: unknown, lireUrl?: (u: string) => Promise<Blob | null>) => {
    try { await new EncodeurDePaquet({ lireUrl }).encoder(v); } catch (e) { if (e instanceof NonSerialisable) return e.code; throw e; }
    return "écrit";
  };

  it("UNE MAP, UNE CLASSE, UNE FONCTION, UNE STRUCTURE CYCLIQUE, UNE ADRESSE MORTE", async () => {
    class Moteur { x = 1; }
    const cycle: Record<string, unknown> = {}; cycle.soi = cycle;
    expect(await code(new Map())).toBe("type");
    expect(await code(new Moteur())).toBe("type");
    expect(await code({ f: () => 1 })).toBe("type");
    expect(await code(cycle)).toBe("cycle");
    expect(await code("blob:morte", async () => null)).toBe("adresse");
  });

  it("UN CHEMIN ABSOLU, où qu'il soit dans la chaîne", async () => {
    for (const s of ["C:\\Users\\moi\\son.wav", "écrit dans D:/travail/x.html", "\\\\serveur\\partage\\a", "file:///home/x",
      "/Users/moi/a.wav", "carte : /home/moi/index.html"]) {
      expect(contientUnCheminAbsolu(s), s).toBe(true);
      expect(await code({ message: s }), s).toBe("chemin");
    }
    for (const s of ["C majeur", "do:ré", "1/2 temps", "a/b", "http://exemple.org/x", "voix.wav", "Ré: 4/4", "C:maj", "accord 3:/4"]) {
      expect(contientUnCheminAbsolu(s), s).toBe(false);
    }
  });

  it("UNE TRANSACTION QUI ÉCHOUE NE LAISSE AUCUN ATOME", async () => {
    const enc = new EncodeurDePaquet();
    await enc.transaction(() => enc.encoder(new Float32Array(10)));
    const avant = { p: enc.partages.length, o: enc.octets.length, poids: enc.poids };
    await expect(enc.transaction(() => enc.encoder([new Float32Array(99), new Map()]))).rejects.toThrow(NonSerialisable);
    expect({ p: enc.partages.length, o: enc.octets.length, poids: enc.poids }).toEqual(avant);
    // ET L'OBJET ANNULÉ N'EST PLUS DANS L'INDEX : réécrit, il devient un atome neuf.
    const f = new Float32Array(3);
    await expect(enc.transaction(() => enc.encoder([f, new Map()]))).rejects.toThrow();
    expect(await enc.encoder(f)).toEqual({ $p: enc.partages.length - 1 });
  });
});

describe("une donnée relue qui n'a pas la forme écrite est refusée", () => {
  const relire = (j: unknown, partages: unknown[] = [], octets: Uint8Array[] = []) =>
    new DecodeurDePaquet(partages, { lireOctets: (k) => octets[k] }).decoder(j);

  it("UNE MARQUE INCONNUE, UN ATOME HORS DE LA TABLE, DES OCTETS ABSENTS, UNE CLASSE INCONNUE", () => {
    expect(() => relire({ $x: 1 })).toThrow(DonneeInvalide);
    expect(() => relire({ $p: 3 })).toThrow(DonneeInvalide);
    expect(() => relire({ $n: "deux" })).toThrow(DonneeInvalide);
    expect(() => relire({ $p: 0 }, [{ t: "octets", classe: "Float32Array", ref: 9 }])).toThrow(DonneeInvalide);
    expect(() => relire({ $p: 0 }, [{ t: "octets", classe: "Function", ref: 0 }], [new Uint8Array(4)])).toThrow(DonneeInvalide);
    expect(() => relire({ $p: 0 }, [{ t: "octets", classe: "Float32Array", ref: 0 }], [new Uint8Array(5)])).toThrow(DonneeInvalide);
    expect(() => relire({ $p: 0 }, [{ t: "domaine", forme: { genre: "AudioBuffer" } }])).toThrow(DonneeInvalide);
  });
});
