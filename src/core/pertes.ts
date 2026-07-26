// core/pertes.ts — Détection des données non-sérialisables (pertes JSON).
//
// Lors de l'export/import JSON d'un workflow, les champs non-JSON (File, Blob,
// AudioBuffer, ArrayBuffer, URL.createObjectURL, etc.) sont silencieusement
// détruits. Ce module rend cette perte BRUYANTE : il compare les champs
// présents dans `data` avec la liste blanche d'export et renvoie explicitement
// les champs purgés avec leur type, pour affichage à l'utilisateur.

// Types de champs qui ne survivent pas à JSON.stringify / re-parse.
const TYPES_NON_SERIALIZABLE = ["File", "Blob", "AudioBuffer", "ArrayBuffer", "Float32Array", "Float64Array", "Uint8Array", "Int16Array", "DataView"];

// Liste blanche : champs conservés par usePersistance.exporter.
export const CHAMPS_CONSERVES = new Set([
  "ficheId", "parametres", "audioNom", "midiNom", "imageNom", "svgNom", "sf2InstrumentIdx", "zonesSelectionnees", "nomFichier",
]);

// Champs File/Blob re-créés à partir du paramètre "Chemin" sauvé : pas la peine
// de les signaler comme des pertes à l'export.
const CHAMPS_FICHIER_RECHARGEABLES = new Set([
  "audioFichier", "midiFichier", "imageFichier", "svgFichier", "enregistrementBlob", "irFichier", "pureDataFichier",
]);

function typeChamp(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof File !== "undefined" && v instanceof File) return "File";
  if (typeof Blob !== "undefined" && v instanceof Blob) return "Blob";
  if (typeof AudioBuffer !== "undefined" && v instanceof AudioBuffer) return "AudioBuffer";
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
  return TYPES_NON_SERIALIZABLE.includes(typeChamp(v));
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
    if (["statut", "progression", "audioResultatUrl", "audioResultatNom", "audioResultatMessage",
         "audioUrl", "enregistrementUrl", "mp3Url", "scriptGenere", "midiFichierSortie",
         "sf2Data", "modeleFichier", "audioFichier", "midiFichier", "imageFichier", "svgFichier",
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
