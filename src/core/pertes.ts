// core/pertes.ts — Détection des données non-sérialisables (pertes JSON).
//
// Lors de l'export/import JSON d'un workflow, les champs non-JSON (File, Blob,
// AudioBuffer, ArrayBuffer, URL.createObjectURL, etc.) sont silencieusement
// détruits. Ce module rend cette perte BRUYANTE : il compare les champs
// présents dans `data` avec la liste blanche d'export et renvoie explicitement
// les champs purgés avec leur type, pour affichage à l'utilisateur.

import { CHAMPS_ENREGISTRES, CHAMPS_RECHARGEABLES } from "./saisies";
import { servicesDomaine } from "./services-domaine";

// Types de champs qui ne survivent pas à JSON.stringify / re-parse.
//
// CEUX-CI VIENNENT DU LANGAGE ET DES API DU NAVIGATEUR, et le cœur a de bonnes raisons de les
// connaître. Ceux du domaine s'y ajoutent à l'appel, par `servicesDomaine()` : `AudioBuffer`
// figurait ici en dur, et c'était le domaine audio nommé dans le cœur.
const TYPES_NON_SERIALIZABLE = ["File", "Blob", "ArrayBuffer", "Float32Array", "Float64Array", "Uint8Array", "Int16Array", "DataView"];

// Liste blanche : champs conservés par usePersistance.exporter.
// Liste blanche : ce qu'un projet enregistre. DERIVEE de la table des genres de saisie, dans
// core/saisies.ts, et non plus enumeree : le meme savoir etait ecrit ici et a sept autres endroits,
// chacun avec un sous-ensemble different.
const CHAMPS_CONSERVES = CHAMPS_ENREGISTRES;

// Champs File/Blob re-créés à partir du paramètre "Chemin" sauvé : pas la peine
// de les signaler comme des pertes à l'export.
const CHAMPS_FICHIER_RECHARGEABLES = CHAMPS_RECHARGEABLES;

function typeChamp(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof File !== "undefined" && v instanceof File) return "File";
  if (typeof Blob !== "undefined" && v instanceof Blob) return "Blob";
  // LE DOMAINE NOMME SES PROPRES VALEURS, à la place qu'occupait `instanceof AudioBuffer` : après
  // `File` et `Blob`, avant `ArrayBuffer`. Le comportement d'avant est donc inchangé.
  const duDomaine = servicesDomaine().nomDeType(v);
  if (duDomaine !== null) return duDomaine;
  if (v instanceof ArrayBuffer) return "ArrayBuffer";
  if (ArrayBuffer.isView(v)) return (v.constructor?.name ?? "TypedArray");
  if (typeof v === "string") return "string";
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  if (v instanceof Date) return "Date";
  if (Array.isArray(v)) return "array";
  if (typeof v === "object") return "object";
  return typeof v;
}

function estNonSerializable(v: unknown): boolean {
  const nom = typeChamp(v);
  return TYPES_NON_SERIALIZABLE.includes(nom)
    || servicesDomaine().typesNonSerialisables.includes(nom);
}

// Analyse un objet `data` de nœud et renvoie la liste des champs purgés.
export interface ChampPurge { champ: string; type: string; nom?: string }
export function detecterPertes(data: Record<string, unknown>): ChampPurge[] {
  const pertes: ChampPurge[] = [];
  for (const [cle, val] of Object.entries(data)) {
    if (val === undefined || val === null) continue;
    if (CHAMPS_CONSERVES.has(cle)) continue;
    // Champs commençant par _ (internes, temporaires) — non purgés, juste ignorés
    if (cle.startsWith("_") || cle.startsWith("on")) continue;
    // Champs de statut runtime (recréés à l'exécution)
    if (["statut", "progression", "progressionDuNoeud", "audioResultatUrl", "audioResultatNom", "audioResultatMessage",
         "audioUrl", "enregistrementUrl", "mp3Url", "scriptGenere", "midiFichierSortie",
         "modeleFichier", "audioFichier", "midiFichier", "imageFichier", "svgFichier",
         "svgNom", "enregistrementBlob",
         "irFichier", "pureDataFichier"].includes(cle)) {
      if (estNonSerializable(val) && !CHAMPS_FICHIER_RECHARGEABLES.has(cle)) {
        pertes.push({ champ: cle, type: typeChamp(val), nom: (val as any)?.name });
      }
      continue;
    }
    // Tout autre champ non whitelisté est potentiellement perdu
    if (!CHAMPS_CONSERVES.has(cle)) {
      pertes.push({ champ: cle, type: typeChamp(val), nom: (val as any)?.name });
    }
  }
  return pertes;
}

// Formate un rapport lisible des pertes pour l'utilisateur.
export function formaterRapportPertes(pertes: { noeud: string; champs: ChampPurge[] }[]): string {
  if (pertes.length === 0) return "";
  const lignes: string[] = [];
  for (const { noeud, champs } of pertes) {
    const details = champs.map((c) => `  • ${c.champ} (${c.type}${c.nom ? `: ${c.nom}` : ""})`).join("\n");
    lignes.push(`${noeud}:\n${details}`);
  }
  return lignes.join("\n");
}
