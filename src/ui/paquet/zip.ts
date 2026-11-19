// ui/paquet/zip.ts — Une archive zip écrite et relue sans bibliothèque, et relue avec méfiance.
//
// POURQUOI CE MODULE PLUTÔT QU'`adm-zip`, qui est déjà dans `package.json`. Il ne tourne que sous
// Node : il lit `fs`, `zlib` et `Buffer`, et la fenêtre de l'application n'a pas Node
// (`nodeIntegration: false` dans `electron/main.cjs`). L'employer voulait faire passer tout le cache
// par le pont, pour le compresser dans le processus principal, de façon synchrone — et ce processus
// sert la fenêtre, les menus et tous les canaux : un fichier de 258 Mo l'a déjà rendu sourd 411 ms
// (relevé du 2026-11-07, `CHANGELOG.md`). Le mode web et les épreuves sur le serveur de
// développement n'auraient pas eu de paquet du tout. Le format zip tient en trois en-têtes, et ce
// qui compte ici n'est pas d'écrire un zip mais de le RELIRE sans se laisser mener.
//
// CE QUE L'ÉCRITURE PRODUIT, ET RIEN D'AUTRE : des entrées stockées (méthode 0) ou compressées
// (méthode 8, `CompressionStream("deflate-raw")`), des noms en UTF-8, une date fixe au 1er janvier
// 1980 pour que deux exports du même projet soient le même fichier, ni zip64, ni chiffrement, ni
// commentaire. Au-delà de 4 Gio ou de 65 535 entrées, elle refuse : le plafond du paquet est bien
// en dessous.
//
// CE QUE LA LECTURE REFUSE, l'archive entière et avant d'en décompresser un octet : un nom qui sort
// de l'archive — absolu, avec une lettre de lecteur, un `..`, un antislash ou un caractère nul (le
// « zip slip ») —, deux entrées de même nom, une entrée chiffrée, une marque zip64, un en-tête local
// qui ne dit pas le nom du répertoire central, une archive tronquée. Une entrée n'est décompressée
// que sur demande, dans la limite de la taille qu'elle déclare : un flux qui en rend davantage est
// coupé au premier octet de trop, et c'est ce qui borne une bombe zip. Son CRC est vérifié.

/** Pourquoi un paquet est refusé : un code que l'interface traduit, et un détail pour la console. */
export type CodeRefus =
  | "tronque" | "chemin" | "doublon" | "chiffre" | "zip64" | "methode" | "taille" | "crc" | "plafond"
  | "manifeste" | "version" | "application" | "absente" | "empreinte" | "projet" | "donnees";

/** Ce qu'un refus de taille dit en nombres : ce qui est déclaré, et le plafond qu'il dépasse, en octets. */
export interface ChiffresDuRefus {
  declare: number;
  plafond: number;
}

export class RefusPaquet extends Error {
  readonly code: CodeRefus;
  readonly detail: string;
  /** Pour un refus `plafond` : les deux nombres, que le message dit (le plafond se règle, pièce C1). */
  readonly chiffres?: ChiffresDuRefus;
  constructor(code: CodeRefus, detail = "", chiffres?: ChiffresDuRefus) {
    super(detail ? `${code} : ${detail}` : code);
    this.name = "RefusPaquet";
    this.code = code;
    this.detail = detail;
    this.chiffres = chiffres;
  }
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_FIN = 0x06054b50;
/** Le 1er janvier 1980 à minuit, la plus petite date que le format sache écrire. */
const DATE_DOS = (0 << 9) | (1 << 5) | 1;
/** Les noms sont en UTF-8 : bit 11 des drapeaux. */
const DRAPEAU_UTF8 = 0x0800;
const MAX_U32 = 0xffffffff;
const MAX_ENTREES = 0xffff;

// ── CRC-32, polynôme 0xEDB88320, celui du format ──────────────────────────────────────────────
const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(octets: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Le nom reste-t-il dans l'archive ?
 *
 * UNE LISTE DE REFUS COURTE ET STRICTE, parce que le nom ne sert jamais de chemin ici : aucun octet
 * n'est écrit sur le disque. Le refus est une défense en profondeur — une archive qui porte un tel
 * nom a été fabriquée pour sortir de son dossier une fois extraite, et l'on ne lit pas le reste
 * d'un fichier hostile. Un dossier (nom finissant par `/`) est permis ; un segment vide ailleurs ne
 * l'est pas.
 */
export function nomSur(nom: string): boolean {
  if (!nom || nom.length > 512) return false;
  if (nom.includes("\\") || nom.includes(String.fromCharCode(0))) return false;
  if (nom.startsWith("/") || /^[A-Za-z]:/.test(nom)) return false;
  const segments = nom.split("/");
  return segments.every((s, i) => s !== "." && s !== ".." && (s !== "" || i === segments.length - 1));
}

async function parFlux(octets: Uint8Array, flux: CompressionStream | DecompressionStream, plafond: number): Promise<Uint8Array> {
  const lecteur = new Blob([octets as BlobPart]).stream().pipeThrough(flux).getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.length;
    if (total > plafond) {
      await lecteur.cancel();
      throw new RefusPaquet("taille", `le flux rend plus de ${plafond} octets`);
    }
    morceaux.push(value);
  }
  const sortie = new Uint8Array(total);
  let o = 0;
  for (const m of morceaux) { sortie.set(m, o); o += m.length; }
  return sortie;
}

/** Une entrée à écrire : son nom, ses octets, et si elle se compresse. */
export interface EntreeAEcrire {
  nom: string;
  octets: Uint8Array;
  /** Vrai pour du texte. Faux pour des échantillons, que la compression ne réduit presque pas. */
  compresser?: boolean;
}

/** Écrit une archive. Lève une `RangeError` au-delà de ce que le format sait dire sans zip64. */
export async function ecrireZip(entrees: readonly EntreeAEcrire[]): Promise<Uint8Array> {
  // 65 535 EST LA MARQUE DU ZIP64 dans la fin du répertoire : la lecture le refuse, l'écriture s'arrête avant.
  if (entrees.length >= MAX_ENTREES) throw new RangeError(`${entrees.length} entrées : le zip sans zip64 en porte ${MAX_ENTREES - 1}`);
  const texte = new TextEncoder();
  const vus = new Set<string>();
  const pretes: { nom: Uint8Array; crc: number; donnees: Uint8Array; methode: number; taille: number }[] = [];
  for (const e of entrees) {
    if (!nomSur(e.nom) || vus.has(e.nom)) throw new RangeError(`nom d'entrée refusé : ${e.nom}`);
    vus.add(e.nom);
    const donnees = e.compresser
      ? await parFlux(e.octets, new CompressionStream("deflate-raw"), MAX_U32)
      : e.octets;
    pretes.push({ nom: texte.encode(e.nom), crc: crc32(e.octets), donnees, methode: e.compresser ? 8 : 0, taille: e.octets.length });
  }
  const central = pretes.reduce((s, p) => s + 46 + p.nom.length, 0);
  const locaux = pretes.reduce((s, p) => s + 30 + p.nom.length + p.donnees.length, 0);
  const total = locaux + central + 22;
  if (total > MAX_U32) throw new RangeError(`${total} octets : le zip sans zip64 s'arrête à 4 Gio`);

  const sortie = new Uint8Array(total);
  const dv = new DataView(sortie.buffer);
  const debuts: number[] = [];
  let o = 0;
  for (const p of pretes) {
    debuts.push(o);
    dv.setUint32(o, SIG_LOCAL, true); dv.setUint16(o + 4, 20, true); dv.setUint16(o + 6, DRAPEAU_UTF8, true);
    dv.setUint16(o + 8, p.methode, true); dv.setUint16(o + 10, 0, true); dv.setUint16(o + 12, DATE_DOS, true);
    dv.setUint32(o + 14, p.crc, true); dv.setUint32(o + 18, p.donnees.length, true); dv.setUint32(o + 22, p.taille, true);
    dv.setUint16(o + 26, p.nom.length, true); dv.setUint16(o + 28, 0, true);
    sortie.set(p.nom, o + 30);
    sortie.set(p.donnees, o + 30 + p.nom.length);
    o += 30 + p.nom.length + p.donnees.length;
  }
  const debutCentral = o;
  pretes.forEach((p, i) => {
    dv.setUint32(o, SIG_CENTRAL, true); dv.setUint16(o + 4, 20, true); dv.setUint16(o + 6, 20, true);
    dv.setUint16(o + 8, DRAPEAU_UTF8, true); dv.setUint16(o + 10, p.methode, true); dv.setUint16(o + 12, 0, true);
    dv.setUint16(o + 14, DATE_DOS, true); dv.setUint32(o + 16, p.crc, true); dv.setUint32(o + 20, p.donnees.length, true);
    dv.setUint32(o + 24, p.taille, true); dv.setUint16(o + 28, p.nom.length, true);
    // Champ supplémentaire, commentaire, disque, attributs internes et externes : tous à zéro.
    dv.setUint32(o + 42, debuts[i], true);
    sortie.set(p.nom, o + 46);
    o += 46 + p.nom.length;
  });
  dv.setUint32(o, SIG_FIN, true);
  dv.setUint16(o + 8, pretes.length, true); dv.setUint16(o + 10, pretes.length, true);
  dv.setUint32(o + 12, o - debutCentral, true); dv.setUint32(o + 16, debutCentral, true);
  return sortie;
}

/** Ce que le répertoire central dit d'une entrée. */
export interface EntreeLue {
  nom: string;
  methode: number;
  crc: number;
  tailleCompressee: number;
  /** La taille décompressée DÉCLARÉE : rien ne la garantit avant d'avoir décompressé. */
  taille: number;
  /** Où commencent ses données, l'en-tête local franchi. */
  debut: number;
}

/** Les quatre premiers octets d'une archive : `PK\x03\x04`, ou `PK\x05\x06` pour une archive vide. */
export function estUnZip(tete: Uint8Array): boolean {
  return tete.length >= 4 && tete[0] === 0x50 && tete[1] === 0x4b
    && ((tete[2] === 3 && tete[3] === 4) || (tete[2] === 5 && tete[3] === 6));
}

/**
 * Lit le répertoire central et valide CHAQUE entrée, celles qu'on ne lira pas comprises.
 *
 * RIEN N'EST DÉCOMPRESSÉ ICI. Les noms, les drapeaux, les tailles et la place des données sont
 * vérifiés contre la longueur réelle du fichier ; le contenu attend `extraire`.
 */
export function lireRepertoire(octets: Uint8Array): Map<string, EntreeLue> {
  const dv = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const n = octets.length;
  if (n < 22) throw new RefusPaquet("tronque", `${n} octets`);
  // LA FIN DU RÉPERTOIRE EST CHERCHÉE À REBOURS, sur au plus 65 535 octets de commentaire.
  let fin = -1;
  for (let i = n - 22; i >= Math.max(0, n - 22 - 0xffff); i--) {
    if (dv.getUint32(i, true) === SIG_FIN && i + 22 + dv.getUint16(i + 20, true) === n) { fin = i; break; }
  }
  if (fin < 0) throw new RefusPaquet("tronque", "fin du répertoire central introuvable");
  if (dv.getUint16(fin + 4, true) !== 0 || dv.getUint16(fin + 6, true) !== 0) throw new RefusPaquet("tronque", "archive en plusieurs volumes");
  const nombre = dv.getUint16(fin + 10, true);
  const taille = dv.getUint32(fin + 12, true);
  const debut = dv.getUint32(fin + 16, true);
  if (nombre === MAX_ENTREES || taille === MAX_U32 || debut === MAX_U32) throw new RefusPaquet("zip64");
  if (debut + taille > fin) throw new RefusPaquet("tronque", "répertoire central hors du fichier");

  const decodeur = new TextDecoder("utf-8", { fatal: true });
  const entrees = new Map<string, EntreeLue>();
  let o = debut;
  for (let k = 0; k < nombre; k++) {
    if (o + 46 > fin || dv.getUint32(o, true) !== SIG_CENTRAL) throw new RefusPaquet("tronque", `entrée ${k} du répertoire central`);
    const drapeaux = dv.getUint16(o + 8, true);
    const methode = dv.getUint16(o + 10, true);
    const crc = dv.getUint32(o + 16, true);
    const tailleCompressee = dv.getUint32(o + 20, true);
    const tailleDeclaree = dv.getUint32(o + 24, true);
    const lNom = dv.getUint16(o + 28, true), lExtra = dv.getUint16(o + 30, true), lCom = dv.getUint16(o + 32, true);
    const local = dv.getUint32(o + 42, true);
    if (o + 46 + lNom > fin) throw new RefusPaquet("tronque", `nom de l'entrée ${k}`);
    let nom: string;
    try { nom = decodeur.decode(octets.subarray(o + 46, o + 46 + lNom)); }
    catch { throw new RefusPaquet("chemin", `nom de l'entrée ${k} illisible en UTF-8`); }
    if (!nomSur(nom)) throw new RefusPaquet("chemin", nom);
    if (entrees.has(nom)) throw new RefusPaquet("doublon", nom);
    if (drapeaux & 1) throw new RefusPaquet("chiffre", nom);
    if (tailleCompressee === MAX_U32 || tailleDeclaree === MAX_U32 || local === MAX_U32) throw new RefusPaquet("zip64", nom);
    // L'EN-TÊTE LOCAL DOIT DIRE LE MÊME NOM : deux noms pour une entrée, c'est deux lectures possibles.
    if (local + 30 > debut || dv.getUint32(local, true) !== SIG_LOCAL) throw new RefusPaquet("tronque", `en-tête local de ${nom}`);
    const lNomLocal = dv.getUint16(local + 26, true), lExtraLocal = dv.getUint16(local + 28, true);
    const nomLocal = octets.subarray(local + 30, local + 30 + lNomLocal);
    const nomCentral = octets.subarray(o + 46, o + 46 + lNom);
    if (lNomLocal !== lNom || nomLocal.some((b, i) => b !== nomCentral[i])) throw new RefusPaquet("chemin", `nom local différent pour ${nom}`);
    const debutDonnees = local + 30 + lNomLocal + lExtraLocal;
    if (debutDonnees + tailleCompressee > debut) throw new RefusPaquet("tronque", `données de ${nom}`);
    entrees.set(nom, { nom, methode, crc, tailleCompressee, taille: tailleDeclaree, debut: debutDonnees });
    o += 46 + lNom + lExtra + lCom;
  }
  return entrees;
}

/**
 * Les octets d'une entrée, décompressés et vérifiés.
 *
 * `plafond` borne ce que la décompression peut rendre, en plus de la taille déclarée : c'est le
 * plafond que l'appelant tient pour cette entrée-là.
 */
export async function extraire(octets: Uint8Array, e: EntreeLue, plafond: number): Promise<Uint8Array> {
  if (e.taille > plafond) throw new RefusPaquet("plafond", `${e.nom} déclare ${e.taille} octets`, { declare: e.taille, plafond });
  const brut = octets.subarray(e.debut, e.debut + e.tailleCompressee);
  let sortie: Uint8Array;
  if (e.methode === 0) {
    if (e.tailleCompressee !== e.taille) throw new RefusPaquet("taille", e.nom);
    sortie = brut;
  } else if (e.methode === 8) {
    try { sortie = await parFlux(brut, new DecompressionStream("deflate-raw"), e.taille); }
    catch (err) {
      if (err instanceof RefusPaquet) throw new RefusPaquet(err.code, `${e.nom} : ${err.detail}`);
      throw new RefusPaquet("tronque", `${e.nom} ne se décompresse pas`);
    }
    if (sortie.length !== e.taille) throw new RefusPaquet("taille", `${e.nom} rend ${sortie.length} octets, en déclare ${e.taille}`);
  } else {
    throw new RefusPaquet("methode", `${e.nom} : méthode ${e.methode}`);
  }
  if (crc32(sortie) !== e.crc) throw new RefusPaquet("crc", e.nom);
  return sortie;
}
