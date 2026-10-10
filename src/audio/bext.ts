// audio/bext.ts — Lire le bloc `bext` d'un fichier BWF, et ce qu'il dit de l'heure d'enregistrement.
//
// CE QU'ATTIC PERDAIT. Un enregistreur de terrain écrit un bloc `bext` dans ses WAV : qui a
// enregistré, quand, et surtout À QUEL INSTANCE DE LA JOURNÉE la première image du fichier a été
// prise. C'est ce dernier chiffre qui permet de reposer plusieurs prises les unes par rapport aux
// autres sans rien aligner à l'oreille. Attic le jetait : `decodeAudioData` ne rend que des
// échantillons, et le seul lecteur de blocs du dépôt — `extraireGrapheWav` — ne cherchait que le
// graphe embarqué d'Attic lui-même.
//
// POURQUOI LIRE AVANT D'ÉCRIRE. Écrire un `bext` demande deux décisions que lire ne demande pas.
// La norme exige une date d'origine, et `audio/metadonnees.ts` n'en écrit aucune EXPRÈS, pour que
// deux rendus du même graphe restent identiques octet pour octet. Et `TimeReference` suppose une
// origine absolue qu'Attic n'a pas : son temps se compte depuis le début d'un montage, pas depuis
// minuit. Lire ne heurte ni l'un ni l'autre.
//
// LE PRÉCÉDENT EST DANS LE DÉPÔT : `audio/frequence-source.ts` parcourt déjà l'en-tête d'un fichier
// avant de le décoder, parce que `decodeAudioData` détache le tampon qu'on lui passe. Ce module
// fait le même genre de lecture, sur le même genre d'octets.
//
// Référence : EBU Tech 3285, « Specification of the Broadcast Wave Format », et ses suppléments.

/** La sonie déclarée par un `bext` de version 2, en unités de la norme. */
export interface SonieBext {
  /** Sonie du programme, en LUFS. */
  sonie: number;
  /** Plage de sonie, en LU. */
  plage: number;
  /** Crête vraie maximale, en dBTP. */
  cretteVraie: number;
  /** Sonie momentanée maximale, en LUFS. */
  momentanee: number;
  /** Sonie court terme maximale, en LUFS. */
  courtTerme: number;
}

export interface Bext {
  description: string;
  origine: string;
  referenceOrigine: string;
  /** « yyyy-mm-dd » tel que le fichier l'écrit, sans réinterprétation. */
  dateOrigine: string;
  /** « hh:mm:ss » tel que le fichier l'écrit. */
  heureOrigine: string;
  /**
   * Le rang du PREMIER ÉCHANTILLON du fichier, compté depuis minuit.
   *
   * C'EST UN ENTIER DE SOIXANTE-QUATRE BITS, et il tient pourtant dans un nombre JavaScript : une
   * journée entière à 192 kHz fait 16,6 milliards d'échantillons, loin des 9 millions de milliards
   * au-delà desquels un entier cesse d'être exact. On le compose donc sans `BigInt`, qui
   * obligerait tout appelant à en manier un.
   */
  referenceTemps: number;
  version: number;
  /** Présent à partir de la version 1. 64 octets, rendus en hexadécimal. */
  umid?: string;
  /** Présente à partir de la version 2. */
  sonie?: SonieBext;
  /** L'historique de codage, une ligne par étape, tel que le fichier l'écrit. */
  historique: string;
}

/** Les positions des champs dans le bloc, telles que la norme les fixe. */
const DESCRIPTION = 0, ORIGINE = 256, REFERENCE = 288, DATE = 320, HEURE = 330;
const TEMPS_BAS = 338, TEMPS_HAUT = 342, VERSION = 346, UMID = 348, SONIE = 412;
/** La partie fixe du bloc : l'historique de codage commence après elle. */
const PARTIE_FIXE = 602;

/**
 * Une chaîne du bloc, débarrassée de son remplissage.
 *
 * LES CHAMPS SONT À LONGUEUR FIXE et complétés par des zéros ou par des espaces selon l'outil qui
 * a écrit — la norme demande des zéros, les enregistreurs n'obéissent pas tous. On coupe au
 * premier zéro, puis on taille les blancs : les deux conventions donnent alors le même résultat.
 */
function chaine(o: Uint8Array, debut: number, longueur: number): string {
  const fin = Math.min(debut + longueur, o.length);
  let coupe = fin;
  for (let i = debut; i < fin; i++) if (o[i] === 0) { coupe = i; break; }
  let texte = "";
  for (let i = debut; i < coupe; i++) texte += String.fromCharCode(o[i]);
  return texte.trim();
}

/** Un entier signé de seize bits, en centièmes d'unité : c'est ainsi que la sonie s'y écrit. */
const centiemes = (v: DataView, p: number) => v.getInt16(p, true) / 100;

/**
 * Le bloc `bext` d'un fichier WAV, ou `null` s'il n'y en a pas.
 *
 * LE PARCOURS DES BLOCS EST CELUI DE RIFF, bourrage compris : un bloc de taille impaire est suivi
 * d'un octet de remplissage, et l'oublier décale tout ce qui suit. Le dépôt a déjà payé cette
 * faute à l'écriture (voir `audio/io.ts`), ce n'est pas la peine de la refaire à la lecture.
 *
 * ON NE SUPPOSE PAS QUE LE BLOC EST COMPLET. Un `bext` tronqué par une copie interrompue, ou écrit
 * court par un outil ancien, doit rendre ce qu'il porte plutôt que rien : chaque champ est donc
 * lu sous condition de longueur. Le minimum utile va jusqu'à la version, à l'octet 348.
 */
export function lireBextWav(octets: Uint8Array): Bext | null {
  if (octets.length < 12) return null;
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  if (chaine(octets, 0, 4) !== "RIFF" || chaine(octets, 8, 4) !== "WAVE") return null;
  for (let p = 12; p + 8 <= octets.length; ) {
    const id = chaine(octets, p, 4);
    const taille = vue.getUint32(p + 4, true);
    if (id === "bext") return lireBloc(octets.subarray(p + 8, Math.min(p + 8 + taille, octets.length)));
    p += 8 + taille + (taille % 2);
  }
  return null;
}

/** Le contenu d'un bloc `bext` déjà isolé, sans son en-tête de quatre octets ni sa taille. */
export function lireBloc(bloc: Uint8Array): Bext | null {
  if (bloc.length < VERSION + 2) return null;
  const vue = new DataView(bloc.buffer, bloc.byteOffset, bloc.byteLength);
  const version = vue.getUint16(VERSION, true);
  const bext: Bext = {
    description: chaine(bloc, DESCRIPTION, 256),
    origine: chaine(bloc, ORIGINE, 32),
    referenceOrigine: chaine(bloc, REFERENCE, 32),
    dateOrigine: chaine(bloc, DATE, 10),
    heureOrigine: chaine(bloc, HEURE, 8),
    referenceTemps: vue.getUint32(TEMPS_BAS, true) + vue.getUint32(TEMPS_HAUT, true) * 2 ** 32,
    version,
    historique: bloc.length > PARTIE_FIXE ? chaine(bloc, PARTIE_FIXE, bloc.length - PARTIE_FIXE) : "",
  };
  if (version >= 1 && bloc.length >= UMID + 64) {
    let hex = "";
    for (let i = 0; i < 64; i++) hex += bloc[UMID + i].toString(16).padStart(2, "0");
    // UN UMID DE ZÉROS N'EST PAS UN UMID : la norme demande de remplir le champ même quand on n'en
    // a pas, et l'immense majorité des enregistreurs y laissent des zéros. Le rendre tel quel
    // ferait afficher cent vingt-huit zéros comme s'ils voulaient dire quelque chose.
    if (/[^0]/.test(hex)) bext.umid = hex;
  }
  if (version >= 2 && bloc.length >= SONIE + 10) {
    bext.sonie = {
      sonie: centiemes(vue, SONIE),
      plage: centiemes(vue, SONIE + 2),
      cretteVraie: centiemes(vue, SONIE + 4),
      momentanee: centiemes(vue, SONIE + 6),
      courtTerme: centiemes(vue, SONIE + 8),
    };
  }
  return bext;
}

// ── L'écriture ────────────────────────────────────────────────────────────────────────────────

/** Ce qu'on a à écrire dans un `bext`, le reste étant déduit ou laissé vide. */
export interface ChampsBext {
  description?: string;
  origine?: string;
  referenceOrigine?: string;
  /**
   * L'instant d'écriture, dont la norme tire la date et l'heure d'origine.
   *
   * IL S'INJECTE, et ce n'est pas une commodité de test. `audio/metadonnees.ts` tenait à ce que
   * deux rendus du même graphe donnent deux fichiers identiques octet pour octet, propriété qu'une
   * date d'écriture casse par construction. Décidé par Fabien le 2026-10-09 : le bloc porte la
   * vraie date. Pouvoir la fixer garde la propriété disponible à qui en a besoin, et rend le
   * déterminisme du graveur éprouvable sans dépendre de l'instant où le test tourne.
   */
  horodatage?: Date;
  /** Le rang du premier échantillon depuis minuit, EN ÉCHANTILLONS. Zéro quand on ne sait pas. */
  referenceTemps?: number;
  historique?: string;
}

/** Deux chiffres, comme la norme écrit les dates et les heures. */
const d2 = (n: number) => String(n).padStart(2, "0");

/** Le bloc `bext` complet, en-tête de quatre octets et taille compris, prêt à être inséré. */
export function blocBext(champs: ChampsBext = {}): Uint8Array {
  const quand = champs.horodatage ?? new Date();
  const histo = champs.historique ?? "";
  // LA PARTIE FIXE FAIT 602 OCTETS, l'historique de codage la suit, et RIFF veut une taille paire.
  const utile = PARTIE_FIXE + histo.length;
  const bloc = new Uint8Array(utile + (utile % 2));
  const vue = new DataView(bloc.buffer);
  const ecrire = (p: number, texte: string, longueur: number) => {
    // LES CHAMPS SONT TRONQUÉS, JAMAIS DÉBORDÉS : une description trop longue écraserait
    // l'origine, puis la date, et le fichier annoncerait n'importe quoi.
    for (let i = 0; i < Math.min(texte.length, longueur); i++) bloc[p + i] = texte.charCodeAt(i) & 0x7f;
  };
  ecrire(DESCRIPTION, champs.description ?? "", 256);
  ecrire(ORIGINE, champs.origine ?? "", 32);
  ecrire(REFERENCE, champs.referenceOrigine ?? "", 32);
  ecrire(DATE, `${quand.getFullYear()}-${d2(quand.getMonth() + 1)}-${d2(quand.getDate())}`, 10);
  ecrire(HEURE, `${d2(quand.getHours())}:${d2(quand.getMinutes())}:${d2(quand.getSeconds())}`, 8);
  const temps = Math.max(0, Math.round(champs.referenceTemps ?? 0));
  vue.setUint32(TEMPS_BAS, temps % 2 ** 32, true);
  vue.setUint32(TEMPS_HAUT, Math.floor(temps / 2 ** 32), true);
  // VERSION 1 : le champ UMID existe et reste à zéro, faute d'en avoir un à y mettre. La version 2
  // promettrait une sonie mesurée, qu'on n'a pas ici.
  vue.setUint16(VERSION, 1, true);
  ecrire(PARTIE_FIXE, histo, histo.length);

  const chunk = new Uint8Array(8 + bloc.length);
  const tete = new DataView(chunk.buffer);
  for (let i = 0; i < 4; i++) chunk[i] = "bext".charCodeAt(i);
  tete.setUint32(4, utile, true);
  chunk.set(bloc, 8);
  return chunk;
}

/**
 * L'instant du premier échantillon, en secondes depuis minuit.
 *
 * LA FRÉQUENCE N'EST PAS DANS LE BLOC, et c'est une faiblesse de la norme : `TimeReference` compte
 * des échantillons, dont la durée dépend du `fmt ` du même fichier. Lire l'un sans l'autre donne
 * un chiffre qui a l'air d'une heure et n'en est pas une.
 */
export function secondesDepuisMinuit(bext: Bext, frequence: number): number | null {
  return frequence > 0 ? bext.referenceTemps / frequence : null;
}

/**
 * L'heure telle qu'on la lit sur une feuille de rapport : `hh:mm:ss.mmm`.
 *
 * CE N'EST PAS UN TIMECODE SMPTE, et il ne faut pas le faire passer pour tel : un timecode se
 * compte en images, avec une cadence et, à 29,97, une règle de saut d'images. Ce qui est rendu ici
 * est une heure d'horloge au millième, qui est tout ce que `TimeReference` permet de dire seul.
 */
export function horloge(secondes: number): string {
  // L'ARRONDI SE FAIT D'ABORD, ET LA DÉCOUPE ENSUITE. Arrondir les millièmes après avoir découpé
  // les heures, les minutes et les secondes pose une retenue qui n'a plus où aller : 59,9999 s
  // donne mille millièmes, et la seconde suivante vaut soixante. Mon premier jet rattrapait cette
  // retenue sur les seules secondes, ce qui écrivait « 00:00:60.000 » — un cas que le test a
  // attrapé avant l'usage. En comptant d'abord en millièmes entiers, chaque retenue remonte d'elle-
  // même jusqu'aux heures.
  const total = Math.round(Math.max(0, secondes) * 1000);
  const d2 = (n: number) => String(n).padStart(2, "0");
  return `${d2(Math.floor(total / 3_600_000))}:${d2(Math.floor((total % 3_600_000) / 60_000))}`
    + `:${d2(Math.floor((total % 60_000) / 1000))}.${String(total % 1000).padStart(3, "0")}`;
}
