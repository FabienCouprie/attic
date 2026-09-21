// audio/metadonnees.ts — Ce qu'un fichier écrit par Attic dit de lui-même.
//
// POURQUOI DES MÉTADONNÉES IMPLICITES. Un fichier qui sort d'une conversion ou d'un traitement par
// lot perd sa provenance : trois semaines plus tard, dans un dossier de livraison, rien ne dit de
// quel fichier il vient, par quel traitement il est passé, à quelle profondeur il a été écrit, ni —
// pour un multicanal — quel canal est quel haut-parleur. Ces renseignements, Attic les connaît tous
// au moment d'écrire ; les poser dans le fichier ne demande rien à l'utilisateur.
//
// DEUX CONTENEURS, PARCE QUE DEUX FORMATS. iXML est un bloc du fichier WAV, le même conteneur que
// BWF : c'est ce que lisent les enregistreurs de terrain, les logiciels de montage son et les outils
// de conformation. Un MP3 ne peut pas le porter ; son équivalent est l'étiquette ID3v2. Les mêmes
// renseignements y sont donc écrits en trames standard — titre, logiciel — et le document iXML entier
// y est recopié dans une trame personnalisée, pour qui voudrait le relire à l'identique.
//
// AUCUNE DATE, ET C'EST VOULU. Attic tient à ce que deux rendus du même graphe donnent deux fichiers
// identiques octet pour octet — c'est pourquoi le bruit de dither est à graine fixe. Une date
// d'écriture casserait cette propriété à chaque export. L'identifiant du fichier est donc DÉRIVÉ de
// son contenu : même son, même identifiant ; son différent, identifiant différent.
//
// Référence : spécification iXML, www.ixml.info (révision 2.10) ; ID3v2.4.0, id3.org.

import { dispositionDe } from "./multicanal";

export interface Provenance {
  /** Le nœud qui a écrit le fichier, tel que l'utilisateur le voit. */
  noeud: string;
  /** Le nom du fichier d'où il vient, s'il vient d'un fichier. */
  source?: string;
  /** Le nom sous lequel il est écrit. */
  nomFichier?: string;
}

export interface DescriptionAudio {
  frequence: number;
  /** Profondeur d'écriture ; absente pour un MP3, qui n'en a pas. */
  bits?: number;
  canaux: number;
  /** Les noms des canaux, dans l'ordre du fichier — ceux des haut-parleurs d'une disposition. */
  nomsDePistes?: string[];
  /** Identifiant du fichier, 32 caractères hexadécimaux. */
  uid: string;
}

/** La version d'Attic, lue à la construction depuis package.json. */
export const VERSION_ATTIC: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "inconnue";

/** Échappe un texte pour le poser dans un élément XML. */
export function echapperXml(texte: string): string {
  return texte
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;")
    // Les caractères de contrôle sont interdits en XML 1.0, hors tabulation et fins de ligne : un nom
    // de fichier qui en contiendrait rendrait tout le document illisible pour un lecteur strict.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

/**
 * Les noms des pistes d'un fichier.
 *
 * C'EST ICI QUE LE MULTICANAL GAGNE LE PLUS. Un 7.1.4 livré avec douze pistes nommées L, R, C, LFE…
 * se relit sans ambiguïté dans n'importe quel logiciel de montage ; livré sans, chacun devine.
 */
export function nomsDePistes(canaux: number, nomsConnus?: readonly string[]): string[] {
  if (nomsConnus && nomsConnus.length === canaux) return [...nomsConnus];
  if (canaux === 1) return ["M"];
  if (canaux === 2) return ["L", "R"];
  return Array.from({ length: canaux }, (_, i) => String(i + 1));
}

/**
 * Un identifiant de fichier dérivé de son contenu : 32 caractères hexadécimaux.
 *
 * DÉRIVÉ ET NON TIRÉ AU SORT, pour que deux rendus identiques donnent deux fichiers identiques. Deux
 * empreintes FNV-1a de 64 bits, sur des graines différentes, parcourent un échantillon sur soixante-
 * quatre de chaque canal, plus la longueur et le texte fourni. Ce n'est pas une empreinte
 * cryptographique — elle n'a pas à l'être : il s'agit de distinguer deux fichiers, pas de résister à
 * qui voudrait en forger un. Parcourir un échantillon sur soixante-quatre tient le coût à quelques
 * millisecondes pour une heure de son.
 */
export function uidDeContenu(canaux: readonly Float32Array[], texte = ""): string {
  const empreinte = (graine: bigint): bigint => {
    const PREMIER = 0x100000001b3n, MASQUE = (1n << 64n) - 1n;
    let h = graine;
    const melanger = (octet: number) => { h ^= BigInt(octet & 0xff); h = (h * PREMIER) & MASQUE; };
    const vue = new DataView(new ArrayBuffer(4));
    for (const c of canaux) {
      for (let i = 0; i < c.length; i += 64) {
        vue.setFloat32(0, c[i]);
        for (let k = 0; k < 4; k++) melanger(vue.getUint8(k));
      }
      for (const o of String(c.length)) melanger(o.charCodeAt(0));
    }
    for (const o of new TextEncoder().encode(texte)) melanger(o);
    return h;
  };
  const a = empreinte(0xcbf29ce484222325n), b = empreinte(0x84222325cbf29ce4n);
  return a.toString(16).padStart(16, "0") + b.toString(16).padStart(16, "0");
}

/** Le document iXML implicite d'un fichier écrit par Attic. */
export function ixmlImplicite(p: Provenance, a: DescriptionAudio): string {
  const noms = nomsDePistes(a.canaux, a.nomsDePistes);
  const note = [`Attic ${VERSION_ATTIC}`, p.noeud, p.source ? `source : ${p.source}` : ""].filter(Boolean).join(" · ");
  const lignes = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<BWFXML>`,
    `  <IXML_VERSION>2.10</IXML_VERSION>`,
    `  <NOTE>${echapperXml(note)}</NOTE>`,
    `  <FILE_UID>${a.uid}</FILE_UID>`,
    `  <SPEED>`,
    `    <FILE_SAMPLE_RATE>${Math.round(a.frequence)}</FILE_SAMPLE_RATE>`,
    ...(a.bits ? [`    <AUDIO_BIT_DEPTH>${a.bits}</AUDIO_BIT_DEPTH>`] : []),
    `  </SPEED>`,
    `  <HISTORY>`,
    ...(p.nomFichier ? [`    <ORIGINAL_FILENAME>${echapperXml(p.nomFichier)}</ORIGINAL_FILENAME>`] : []),
    ...(p.source ? [`    <PARENT_FILENAME>${echapperXml(p.source)}</PARENT_FILENAME>`] : []),
    `  </HISTORY>`,
    `  <TRACK_LIST>`,
    `    <TRACK_COUNT>${a.canaux}</TRACK_COUNT>`,
    ...noms.map((nom, i) =>
      `    <TRACK><CHANNEL_INDEX>${i + 1}</CHANNEL_INDEX><INTERLEAVE_INDEX>${i + 1}</INTERLEAVE_INDEX><NAME>${echapperXml(nom)}</NAME></TRACK>`),
    `  </TRACK_LIST>`,
    `</BWFXML>`,
  ];
  return lignes.join("\n");
}

/**
 * Le bloc RIFF « iXML » : identifiant, taille, document, octet de bourrage si la taille est impaire.
 *
 * L'identifiant s'écrit exactement « iXML » — un i minuscule et trois capitales —, et la casse
 * compte : les lecteurs comparent les quatre octets tels quels.
 */
export function blocIxml(xml: string): Uint8Array {
  const donnees = new TextEncoder().encode(xml);
  const bloc = new Uint8Array(8 + donnees.length + (donnees.length % 2));
  bloc.set([0x69, 0x58, 0x4d, 0x4c], 0); // « iXML »
  new DataView(bloc.buffer).setUint32(4, donnees.length, true);
  bloc.set(donnees, 8);
  return bloc;
}

/**
 * Tout ce qu'un fichier doit dire de lui-même, calculé d'après le tampon qu'on s'apprête à écrire.
 *
 * Les noms de pistes viennent de la disposition quand le tampon en porte une : les haut-parleurs
 * d'un 5.1 ou d'un anneau, les composantes ACN d'un champ ambisonique. Sans disposition, les noms
 * par défaut — M, L R, puis des numéros.
 */
export function decrire(
  b: { numberOfChannels: number; sampleRate: number; getChannelData: (c: number) => Float32Array },
  p: Provenance,
  bits?: number,
): { ixml: string; titre: string } {
  const canaux = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
  const d = dispositionDe(b);
  const noms = d
    ? d.famille === "ambisonie"
      ? Array.from({ length: b.numberOfChannels }, (_, n) => `ACN${n}`)
      : d.hautParleurs.map((h) => h.nom)
    : undefined;
  const uid = uidDeContenu(canaux, `${p.nomFichier ?? ""}|${p.source ?? ""}`);
  const titre = (p.source ?? p.nomFichier ?? "").replace(/\.[^.]+$/, "");
  return {
    ixml: ixmlImplicite(p, { frequence: b.sampleRate, bits, canaux: b.numberOfChannels, nomsDePistes: noms, uid }),
    titre,
  };
}

// ── ID3v2.4 ───────────────────────────────────────────────────────────────────────────────────

/** Un entier sur quatre octets de sept bits, comme ID3v2.4 l'exige pour les tailles. */
const synchsafe = (n: number): number[] => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];

function trame(id: string, contenu: Uint8Array): Uint8Array {
  const t = new Uint8Array(10 + contenu.length);
  for (let i = 0; i < 4; i++) t[i] = id.charCodeAt(i);
  t.set(synchsafe(contenu.length), 4);
  // Octets 8 et 9 : aucun drapeau.
  t.set(contenu, 10);
  return t;
}

/** Une trame de texte (T***), encodée en UTF-8 — code 3, que seul ID3v2.4 connaît. */
function trameTexte(id: string, texte: string): Uint8Array {
  const octets = new TextEncoder().encode(texte);
  const contenu = new Uint8Array(1 + octets.length);
  contenu[0] = 3;
  contenu.set(octets, 1);
  return trame(id, contenu);
}

/** Une trame TXXX : une description, un zéro, puis la valeur. */
function trameTxxx(description: string, valeur: string): Uint8Array {
  const d = new TextEncoder().encode(description), v = new TextEncoder().encode(valeur);
  const contenu = new Uint8Array(1 + d.length + 1 + v.length);
  contenu[0] = 3;
  contenu.set(d, 1);
  contenu.set(v, 2 + d.length);
  return trame("TXXX", contenu);
}

export interface EtiquetteMp3 {
  titre?: string;
  /** Le document iXML à recopier dans une trame TXXX « iXML ». */
  ixml?: string;
  /** Le graphe Attic embarqué, relu par Attic à l'import. */
  graphe?: string;
}

/**
 * Une étiquette ID3v2.4 complète, à placer en tête d'un MP3.
 *
 * L'ANCIENNE ÉTIQUETTE ÉTAIT INCOHÉRENTE, et Attic seul pouvait la relire. Son en-tête se déclarait
 * en version 2.2, dont les trames ont un identifiant de trois lettres et un en-tête de six octets ;
 * elle y plaçait des trames de la version 2.4, à quatre lettres et dix octets, et déclarait en
 * ISO-8859-1 un texte écrit en UTF-8. Un lecteur qui croyait l'en-tête lisait des trames absurdes.
 * Tout est désormais en version 2.4, tailles comprises, et le texte est déclaré UTF-8.
 */
export function etiquetteId3(e: EtiquetteMp3): Uint8Array {
  const trames: Uint8Array[] = [trameTexte("TSSE", `Attic ${VERSION_ATTIC}`)];
  if (e.titre) trames.push(trameTexte("TIT2", e.titre));
  if (e.ixml) trames.push(trameTxxx("iXML", e.ixml));
  if (e.graphe) trames.push(trameTxxx("ATTIC_GRAPH", e.graphe));
  const taille = trames.reduce((s, t) => s + t.length, 0);
  const out = new Uint8Array(10 + taille);
  out.set([0x49, 0x44, 0x33, 0x04, 0x00, 0x00], 0); // « ID3 », version 2.4.0, aucun drapeau
  out.set(synchsafe(taille), 6);
  let o = 10;
  for (const t of trames) { out.set(t, o); o += t.length; }
  return out;
}
