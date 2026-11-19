// ui/paquet/format-paquet.ts — Le format du paquet `.attic`, nommé une fois pour l'écriture et la lecture.
//
// UN PAQUET EST UN ZIP DONT L'EXTENSION A CHANGÉ, demandé par Fabien le 2026-11-16 : « Un système
// d'export qui contient les données du cache. […] Le format sera un .zip dont on change l'extension
// en .attic. Les fichiers exportés sans donnée restent des .json. » Il porte quatre sortes d'entrées :
//
//   `paquet.json`        le manifeste : le nom du format, sa version, la version d'Attic qui l'a
//                        écrit, et chaque autre entrée avec sa taille et son empreinte SHA-256 ;
//   `projet.json`        le fichier de projet, OCTET POUR OCTET celui qu'enregistrerait « Exporter » ;
//   `donnees.json`       le cache de chaque nœud et les médias chargés, en JSON, avec la table des
//                        atomes de `ui/paquet/valeurs-paquet.ts` ;
//   `donnees/NNNNNN.bin` les octets de chaque atome, tels quels : échantillons en flottants 32 bits
//                        petit-boutistes, contenu d'un fichier, d'un blob.
//
// CE QUE LE MANIFESTE NE NOMME PAS N'EST PAS LU. Une entrée ajoutée à la main, ou par une version
// future qui saurait en faire quelque chose, est ignorée sans être décompressée.
//
// LE FORMAT 1 EST FIGÉ, décidé par Fabien le 2026-11-16 : noms des entrées, marques du JSON,
// flottants bruts. `ui/paquet/format-v1.test.ts` le tient sur un paquet témoin versionné, écrit le
// jour de la décision : toute version d'Attic doit le relire, et l'écriture doit le refaire entrée
// pour entrée. Un changement de ce qu'un paquet porte est le format 2, avec son propre témoin.
//
// LA VERSION DU FORMAT est un entier, et une lecture refuse un paquet d'une version qu'elle ne
// connaît pas : elle ne saurait pas ce qu'elle lit. Un paquet reste un zip, et son `projet.json`
// s'en extrait à la main.
//
// LA VERSION D'ATTIC QUI L'A ÉCRIT décide du reste, décidé par Fabien le même jour : « Le cache se
// reprend uniquement pour les versions futures. On ne peut pas ouvrir un fichier conçu avec une
// version plus récente sur une ancienne version d'Attic. » Un paquet s'ouvre donc, cache compris,
// dans la version qui l'a écrit et dans toute version plus récente ; une version plus ancienne le
// refuse entier. Les versions se comparent dans l'ordre de semver, `comparerVersions` ci-dessous.

import type { CodeEcart } from "./valeurs-paquet";

/** La version d'Attic qui tourne, celle que `vite.config.ts` lit dans `package.json`. */
export const VERSION_APPLICATION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "inconnue";

export const FORMAT_PAQUET = "attic-paquet";
export const VERSION_PAQUET = 1;
export const EXTENSION_PAQUET = "attic";

export const NOM_MANIFESTE = "paquet.json";
export const NOM_PROJET = "projet.json";
export const NOM_DONNEES = "donnees.json";
export const nomDesOctets = (k: number): string => `donnees/${String(k).padStart(6, "0")}.bin`;

/**
 * Ce qu'un paquet porte au plus, décompressé et en tout : 1 Gio PAR DÉFAUT.
 *
 * LA CLÉ `plafondPaquetMio` DE `config.json` LE RÈGLE, de 256 à 2000 Mio (pièce C1, 2026-11-19) :
 * l'export et l'import le lisent par `ui/paquet/plafond-du-paquet.ts`. Cette constante reste le
 * défaut, celui du schéma, et ce qui vaut hors d'Electron.
 *
 * C'EST LE PLAFOND CONTRE UNE BOMBE ZIP, et l'écriture le respecte aussi : un paquet qu'Attic écrit
 * doit se relire. L'export garde deux copies des données en mémoire le temps de les écrire (les
 * octets encodés et l'archive assemblée) ; au-delà, il écarte les résultats qui ne tiennent plus,
 * et le dit. Une heure de stéréo à 44 100 Hz pèse 1,18 Gio en flottants : elle ne tient pas.
 */
export const PLAFOND_PAQUET = 1024 ** 3;

/** Ce qu'un manifeste peut peser : 65 535 entrées de cent vingt octets tiennent dans 8 Mio. */
export const PLAFOND_MANIFESTE = 16 * 1024 ** 2;

/** Ce que le manifeste dit de chaque entrée. */
export interface EntreeDuManifeste {
  nom: string;
  octets: number;
  sha256: string;
}

export interface Manifeste {
  format: typeof FORMAT_PAQUET;
  version: number;
  /** La version d'Attic qui l'a écrit : le paquet ne s'ouvre que par elle ou une plus récente. */
  application: string;
  entrees: EntreeDuManifeste[];
}

/**
 * Les empreintes du cache, gardées telles quelles : elles décident si un nœud se recalcule.
 *
 * `hashParams` et `empreinteBoucle` NE SONT PAS LUS PAR LA RÈGLE DES CHEMINS ABSOLUS : ils sont faits
 * des réglages des nœuds, que `projet.json` porte déjà, chemin de fichier compris. Les autres le sont.
 */
export const EMPREINTES_DU_CACHE = ["hashParams", "hashEntree", "hashSorties", "hashValeursEntree", "empreinteBoucle"] as const;
export const EMPREINTES_DU_PROJET: ReadonlySet<string> = new Set(["hashParams", "empreinteBoucle"]);

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;
const NUMERIQUE = /^\d+$/;

/**
 * Le signe de `a − b` dans l'ordre de semver, ou `null` quand l'une des deux n'est pas une version.
 *
 * LES NOMBRES SE COMPARENT EN NOMBRES : `5.1.10` vient après `5.1.9`, ce qu'une comparaison de
 * chaînes inverserait. Une préversion précède sa version (`5.2.0-beta.1` < `5.2.0`), ses
 * identifiants se comparent un à un, numériques avant alphanumériques ; la métadonnée de
 * construction (`+abc`) ne compte pas. `package.json` n'a jamais porté que `X.Y.Z` : le reste est là
 * pour qu'une préversion publiée un jour ne fasse pas refuser des paquets qu'elle sait lire.
 */
export function comparerVersions(a: string, b: string): number | null {
  const x = SEMVER.exec(a), y = SEMVER.exec(b);
  if (!x || !y) return null;
  for (let i = 1; i <= 3; i++) {
    if (Number(x[i]) !== Number(y[i])) return Math.sign(Number(x[i]) - Number(y[i]));
  }
  const px = x[4] ? x[4].split(".") : [], py = y[4] ? y[4].split(".") : [];
  if (!px.length || !py.length) return Math.sign(py.length - px.length);
  for (let i = 0; i < Math.min(px.length, py.length); i++) {
    const nx = NUMERIQUE.test(px[i]), ny = NUMERIQUE.test(py[i]);
    if (nx && ny && Number(px[i]) !== Number(py[i])) return Math.sign(Number(px[i]) - Number(py[i]));
    if (nx !== ny) return nx ? -1 : 1;
    if (!nx && px[i] !== py[i]) return px[i] < py[i] ? -1 : 1;
  }
  return Math.sign(px.length - py.length);
}

/** L'empreinte SHA-256 d'octets, en hexadécimal. */
export async function sha256(octets: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", octets as BufferSource));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Un résultat ou un média que l'export n'a pas emporté, et pourquoi. */
export interface Ecarte {
  id: string;
  /** Le champ du média, pour un média ; absent pour un résultat. */
  champ?: string;
  /** La raison, que l'interface traduit par `paquet.ecart.<code>`. */
  code: CodeEcart;
  /** Un nom de type, ou le message d'un échec : rien qui se traduise. */
  detail?: string;
}
