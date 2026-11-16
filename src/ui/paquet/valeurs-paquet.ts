// ui/paquet/valeurs-paquet.ts — Ce qui circule sur les arêtes, écrit en JSON et en octets, sans perte.
//
// LE CACHE GARDE DES OBJETS VIVANTS : des tampons audio, des tableaux typés, des fichiers, des objets
// simples qui les contiennent. `JSON.stringify` en perd la moitié, et le cache en dépend plus qu'il
// n'y paraît : son empreinte d'une valeur (`empreinteValeur` de `core/graphe.ts`) distingue
// `undefined` de `null`, un `Float32Array` d'un `Float64Array`, et la taille, le nom et le type
// d'un fichier. Une valeur relue qui n'aurait pas la même empreinte ferait recalculer tout l'aval,
// et c'est exactement ce que le paquet doit éviter.
//
// D'OÙ UN ARBRE JSON À SIX MARQUES, et une table d'atomes :
//   `{"$u":1}`      undefined, qu'un tableau JSON rendrait `null` et qu'un objet perdrait ;
//   `{"$h":1}`      un trou dans un tableau, que l'empreinte écrit autrement qu'un undefined ;
//   `{"$n":"NaN"}`  NaN, ±Infinity et −0, que JSON rend `null` ou `0` ;
//   `{"$b":"12"}`   un entier long ;
//   `{"$o":{…}}`    un objet dont une clé commence par `$`, pour qu'il ne passe pas pour une marque ;
//   `{"$p":k}`      l'atome k de la table : octets d'un tableau typé, fichier, blob, adresse d'objet,
//                   valeur du domaine. Un même atome présent deux fois n'est écrit qu'une fois :
//                   relu, il est encore un seul objet, et le paquet ne porte pas deux fois ses
//                   octets. Un objet simple ou un tableau, lui, est écrit à chaque place où il paraît.
//
// LE DOMAINE DÉCRIT SES PROPRES VALEURS, par `versPaquet` et `depuisPaquet` de
// `core/services-domaine.ts` : le shell ne sait pas ce qu'est un tampon audio, et un garde l'exige.
// Ce qu'aucun des deux ne connaît — une classe, une `Map`, une fonction — n'est pas écrit : l'entrée
// de cache qui le porte est écartée, et le nœud se recalculera.
//
// ET UN CHEMIN ABSOLU NE PART PAS. Une valeur, un message ou un affichage qui nomme un fichier du
// disque (`C:\…`, `\\serveur\…`, `file://`, `/Users/…`) dit où vit et comment s'appelle celui qui a
// exporté, et désigne un fichier qui n'existera pas ailleurs. L'entrée est écartée de même.
import { servicesDomaine } from "../../core/services-domaine";

/**
 * Pourquoi une valeur ne s'écrit pas. L'entrée qui la porte est écartée, et la raison est dite.
 *
 * UN CODE, QUE L'INTERFACE TRADUIT (`paquet.ecart.<code>`), et un détail qui n'est qu'un nom de type.
 */
export type CodeEcart = "chemin" | "adresse" | "cycle" | "type" | "plafond" | "echec";

export class NonSerialisable extends Error {
  readonly code: CodeEcart;
  readonly detail: string;
  constructor(code: CodeEcart, detail = "") {
    super(detail ? `${code} : ${detail}` : code);
    this.name = "NonSerialisable";
    this.code = code;
    this.detail = detail;
  }
}

/** Une donnée relue qui n'a pas la forme qu'on a écrite : abîmée, ou d'une autre version. */
export class DonneeInvalide extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "DonneeInvalide";
  }
}

/** Un atome de la table : ce qui porte des octets, ou ce qui ne se décrit qu'avec l'aide du domaine. */
export type Atome =
  | { t: "octets"; classe: string; ref: number }
  | { t: "fichier"; nom: string; type: string; modifie: number; ref: number }
  | { t: "blob"; type: string; ref: number }
  | { t: "url"; type: string; ref: number }
  | { t: "domaine"; forme: unknown };

type ClasseOctets = { new (b: ArrayBuffer): ArrayBufferView; BYTES_PER_ELEMENT: number };
const CLASSES: Record<string, ClasseOctets> = Object.fromEntries(
  ["Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array",
    "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array", "Float16Array"]
    .filter((n) => typeof (globalThis as Record<string, unknown>)[n] === "function")
    .map((n) => [n, (globalThis as Record<string, unknown>)[n] as ClasseOctets]),
);

// UN CHEMIN ABSOLU, où qu'il soit dans la chaîne : un message dit volontiers « écrit dans C:\… ».
const CHEMIN_ABSOLU = new RegExp([
  String.raw`(?:^|[\s"'(«=,;])[A-Za-z]:[\\/]`,
  String.raw`(?:^|[\s"'(«=,;])\\\\[^\\\s]`,
  String.raw`file:\/\/`,
  String.raw`(?:^|[\s"'(«=,;])\/(?:Users|home|root|tmp|var|private|Volumes|mnt|media|opt|srv)\/`,
].join("|"));

/** Vrai quand la chaîne nomme un fichier du disque par son chemin entier. */
export const contientUnCheminAbsolu = (s: string): boolean => CHEMIN_ABSOLU.test(s);

/**
 * Pose une clé sur un objet neuf, `__proto__` compris. Une affectation `o["__proto__"] = v` changerait
 * le prototype de l'objet au lieu d'y poser une clé : un paquet fabriqué s'en servirait.
 */
export function poserCle(o: Record<string, unknown>, cle: string, v: unknown): void {
  if (cle === "__proto__") Object.defineProperty(o, cle, { value: v, enumerable: true, writable: true, configurable: true });
  else o[cle] = v;
}

const estSimple = (v: object) => {
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};

const nombreSpecial = (n: number): string | null =>
  Number.isNaN(n) ? "NaN" : n === Infinity ? "Infinity" : n === -Infinity ? "-Infinity" : Object.is(n, -0) ? "-0" : null;

/** Ce que l'encodeur demande au monde : relire une adresse d'objet, `blob:…`. */
export interface OptionsEncodeur {
  lireUrl?: (url: string) => Promise<Blob | null>;
}

const lireUrlParFetch = async (url: string): Promise<Blob | null> => {
  try { return await (await fetch(url)).blob(); } catch { return null; }
};

/**
 * Encode des valeurs dans une table d'atomes et une liste d'octets, partagées par tout un paquet.
 *
 * UNE ENTRÉE À LA FOIS, ET TOUT OU RIEN. `transaction` rend la table telle qu'avant quand l'encodage
 * d'une entrée échoue à mi-chemin : un atome orphelin grossirait le paquet sans servir à rien.
 */
export class EncodeurDePaquet {
  readonly partages: Atome[] = [];
  readonly octets: Uint8Array[] = [];
  private index = new Map<unknown, number>();
  private ajoutes: unknown[] = [];
  private total = 0;
  private lireUrl: (url: string) => Promise<Blob | null>;

  constructor(o: OptionsEncodeur = {}) {
    this.lireUrl = o.lireUrl ?? lireUrlParFetch;
  }

  /** Le nombre d'octets que les atomes portent, sans le JSON. */
  get poids(): number { return this.total; }

  async transaction<T>(f: () => Promise<T>): Promise<T> {
    const avant = this.marque();
    try {
      return await f();
    } catch (e) {
      this.annulerJusqua(avant);
      throw e;
    }
  }

  /** Rend la table à un état antérieur, par exemple quand une entrée fait dépasser le plafond. */
  marque() { return { p: this.partages.length, o: this.octets.length, total: this.total, a: this.ajoutes.length }; }

  annulerJusqua(m: ReturnType<EncodeurDePaquet["marque"]>): void {
    this.partages.length = m.p;
    this.octets.length = m.o;
    this.total = m.total;
    for (const cle of this.ajoutes.splice(m.a)) this.index.delete(cle);
  }

  async encoder(v: unknown, pile: Set<object> = new Set()): Promise<unknown> {
    if (v === undefined) return { $u: 1 };
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") {
      const s = nombreSpecial(v);
      return s === null ? v : { $n: s };
    }
    if (typeof v === "bigint") return { $b: v.toString() };
    if (typeof v === "string") {
      if (v.startsWith("blob:")) return this.atome(v, async () => {
        const b = await this.lireUrl(v);
        if (!b) throw new NonSerialisable("adresse");
        return { t: "url", type: b.type, ref: this.poser(new Uint8Array(await b.arrayBuffer())) };
      });
      if (contientUnCheminAbsolu(v)) throw new NonSerialisable("chemin");
      return v;
    }
    if (typeof v !== "object") throw new NonSerialisable("type", typeof v);
    if (this.index.has(v)) return { $p: this.index.get(v) };
    if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return this.atome(v, async () => this.atomeOctets(v));
    if (typeof Blob !== "undefined" && v instanceof Blob) return this.atome(v, async () => {
      const ref = this.poser(new Uint8Array(await v.arrayBuffer()));
      return typeof File !== "undefined" && v instanceof File
        ? { t: "fichier", nom: v.name, type: v.type, modifie: v.lastModified, ref }
        : { t: "blob", type: v.type, ref };
    });
    if (Array.isArray(v) || estSimple(v)) {
      if (pile.has(v)) throw new NonSerialisable("cycle");
      pile.add(v);
      try {
        if (Array.isArray(v)) {
          const sortie: unknown[] = [];
          for (let i = 0; i < v.length; i++) sortie.push(i in v ? await this.encoder(v[i], pile) : { $h: 1 });
          return sortie;
        }
        const sortie: Record<string, unknown> = {};
        for (const [cle, val] of Object.entries(v)) poserCle(sortie, cle, await this.encoder(val, pile));
        return Object.keys(sortie).some((k) => k.startsWith("$")) ? { $o: sortie } : sortie;
      } finally {
        pile.delete(v);
      }
    }
    const forme = servicesDomaine().versPaquet(v);
    if (!forme) throw new NonSerialisable("type", (v as object).constructor?.name ?? "objet");
    return this.atome(v, async () => ({ t: "domaine", forme: await this.encoder(forme, pile) }));
  }

  private poser(octets: Uint8Array): number {
    this.total += octets.length;
    return this.octets.push(octets) - 1;
  }

  private atomeOctets(v: ArrayBufferView | ArrayBuffer): Atome {
    if (v instanceof ArrayBuffer) return { t: "octets", classe: "ArrayBuffer", ref: this.poser(new Uint8Array(v).slice()) };
    const classe = v.constructor.name;
    if (classe !== "DataView" && !CLASSES[classe]) throw new NonSerialisable("type", classe);
    // UNE COPIE, ET TOUT DE SUITE : la vue peut désigner la mémoire d'un tampon natif, ou être
    // transférée à un worker avant que l'archive ne soit assemblée.
    return { t: "octets", classe, ref: this.poser(new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice()) };
  }

  private async atome(cle: unknown, fabriquer: () => Promise<Atome>): Promise<unknown> {
    if (this.index.has(cle)) return { $p: this.index.get(cle) };
    const atome = await fabriquer();
    const k = this.partages.push(atome) - 1;
    this.index.set(cle, k);
    this.ajoutes.push(cle);
    return { $p: k };
  }
}

/** Ce que le décodeur demande au monde : les octets d'un atome, et une adresse pour un blob. */
export interface OptionsDecodeur {
  lireOctets: (ref: number) => Uint8Array | undefined;
  creerUrl?: (b: Blob) => string;
}

const estObjet = (j: unknown): j is Record<string, unknown> => !!j && typeof j === "object" && !Array.isArray(j);

/** Relit ce que l'encodeur a écrit. Toute forme inattendue lève `DonneeInvalide`. */
export class DecodeurDePaquet {
  private memo = new Map<number, unknown>();
  private partages: unknown[];
  private o: OptionsDecodeur;
  constructor(partages: unknown[], o: OptionsDecodeur) {
    this.partages = partages;
    this.o = o;
  }

  decoder(j: unknown): unknown {
    if (j === null || typeof j === "string" || typeof j === "boolean") return j;
    if (typeof j === "number") {
      if (!Number.isFinite(j)) throw new DonneeInvalide("nombre non fini hors marque");
      return j;
    }
    if (Array.isArray(j)) {
      const sortie: unknown[] = new Array(j.length);
      j.forEach((x, i) => {
        if (!(estObjet(x) && Object.keys(x).length === 1 && x.$h === 1)) sortie[i] = this.decoder(x);
      });
      return sortie;
    }
    if (!estObjet(j)) throw new DonneeInvalide(typeof j);
    const cles = Object.keys(j);
    if (cles.length === 1 && cles[0].startsWith("$")) {
      const [cle] = cles, val = j[cle];
      if (cle === "$u") return undefined;
      if (cle === "$n") {
        const n = ({ NaN, Infinity, "-Infinity": -Infinity, "-0": -0 } as Record<string, number>)[String(val)];
        if (n === undefined) throw new DonneeInvalide(`nombre « ${String(val)} »`);
        return n;
      }
      if (cle === "$b") {
        if (typeof val !== "string" || !/^-?\d+$/.test(val)) throw new DonneeInvalide("entier long");
        return BigInt(val);
      }
      if (cle === "$p") return this.atome(val);
      if (cle === "$o") {
        if (!estObjet(val)) throw new DonneeInvalide("objet échappé");
        return this.objet(val);
      }
    }
    if (cles.some((k) => k.startsWith("$"))) throw new DonneeInvalide(`marque inconnue ${cles.join(",")}`);
    return this.objet(j);
  }

  private objet(j: Record<string, unknown>): Record<string, unknown> {
    const sortie: Record<string, unknown> = {};
    for (const [cle, val] of Object.entries(j)) poserCle(sortie, cle, this.decoder(val));
    return sortie;
  }

  private octets(ref: unknown): Uint8Array {
    const o = typeof ref === "number" ? this.o.lireOctets(ref) : undefined;
    if (!o) throw new DonneeInvalide(`octets ${String(ref)} absents`);
    // UNE COPIE ALIGNÉE : une entrée stockée commence n'importe où dans l'archive, et un
    // `Float32Array` ne se pose que sur un multiple de quatre.
    return o.slice();
  }

  private atome(k: unknown): unknown {
    if (typeof k !== "number" || !Number.isInteger(k) || k < 0 || k >= this.partages.length) throw new DonneeInvalide(`atome ${String(k)}`);
    if (this.memo.has(k)) return this.memo.get(k);
    const a = this.partages[k] as Record<string, unknown>;
    if (!estObjet(a)) throw new DonneeInvalide(`atome ${k}`);
    let v: unknown;
    if (a.t === "octets") {
      const o = this.octets(a.ref);
      if (a.classe === "ArrayBuffer") v = o.buffer;
      else if (a.classe === "DataView") v = new DataView(o.buffer);
      else {
        const C = CLASSES[String(a.classe)];
        if (!C || o.length % C.BYTES_PER_ELEMENT !== 0) throw new DonneeInvalide(`tableau ${String(a.classe)}`);
        v = new C(o.buffer as ArrayBuffer);
      }
    } else if (a.t === "fichier") {
      if (typeof a.nom !== "string" || typeof a.type !== "string" || typeof a.modifie !== "number") throw new DonneeInvalide("fichier");
      v = new File([this.octets(a.ref) as BlobPart], a.nom, { type: a.type, lastModified: a.modifie });
    } else if (a.t === "blob" || a.t === "url") {
      if (typeof a.type !== "string") throw new DonneeInvalide("blob");
      const b = new Blob([this.octets(a.ref) as BlobPart], { type: a.type });
      // L'ADRESSE D'UN AFFICHAGE RELU, dans le régime des résultats : quand le nœud rendra autre
      // chose, `urlsLachees` de `core/cycle-de-vie.ts` la révoquera comme celle qu'elle remplace.
      v = a.t === "blob" ? b : this.o.creerUrl ? this.o.creerUrl(b) : URL.createObjectURL(b);
    } else if (a.t === "domaine") {
      const forme = this.decoder(a.forme);
      v = estObjet(forme) ? servicesDomaine().depuisPaquet(forme) : null;
      if (v === null || v === undefined) throw new DonneeInvalide("valeur du domaine non reconnue");
    } else {
      throw new DonneeInvalide(`atome de genre ${String(a.t)}`);
    }
    this.memo.set(k, v);
    return v;
  }
}
