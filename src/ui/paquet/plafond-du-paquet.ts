// ui/paquet/plafond-du-paquet.ts — Le plafond d'un paquet `.attic` en vigueur, et comment il se dit.
//
// POURQUOI CE MODULE. Pièce C1 du plan du fichier de configuration (2026-11-19), demandée par Fabien :
// « quand on sauvegarde un .attic, il me semble (à vérifier) que le cache est plafonné à 1 Gb.
// Permettre à l'utilisateur de fixer cette limite. » Vérifié : le plafond est de 1 Gio, décompressé,
// et il borne l'écriture comme la lecture (`format-paquet.ts`). La clé `plafondPaquetMio` de
// `config.json` le règle désormais, de 256 à 2000 Mio ; ses bornes, et pourquoi la haute n'est pas
// 4 Gio, sont dans `electron/configuration.cjs` et `CONFIGURATION.md`.
//
// UNE SEULE LECTURE POUR L'EXPORT ET L'IMPORT : un paquet qu'Attic écrit doit se relire, et deux
// lectures de la clé pourraient diverger. Hors d'Electron, la clé n'arrive pas : le défaut du format.
//
// LE MESSAGE DIT LES DEUX NOMBRES, en Mio entiers : ce que le paquet déclare, arrondi vers le haut, et
// le plafond, arrondi vers le bas. Un paquet refusé d'un octet se lit donc toujours au-dessus.
import { configurationRecue } from "../configuration";
import { PLAFOND_PAQUET } from "./format-paquet";

export const MIO = 1024 ** 2;

/** Le plafond en vigueur, en octets : la clé `plafondPaquetMio`, ou `PLAFOND_PAQUET` sans elle. */
export async function plafondDuPaquet(): Promise<number> {
  const mio = (await configurationRecue()).valeurs.plafondPaquetMio;
  return typeof mio === "number" && Number.isFinite(mio) && mio > 0 ? Math.floor(mio * MIO) : PLAFOND_PAQUET;
}

/** Ce qu'un paquet déclare, en Mio entiers arrondis vers le haut. */
export const mioDeclares = (octets: number): string => String(Math.ceil(octets / MIO));

/** Un plafond, en Mio entiers arrondis vers le bas. */
export const mioDuPlafond = (octets: number): string => String(Math.floor(octets / MIO));
