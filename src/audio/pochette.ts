// audio/pochette.ts — L'image qu'un fichier audio porte en couverture.
//
// LE WAV N'A PAS DE POCHETTE DANS SA NORME, ni RIFF/WAVE ni BWF. L'usage répandu, que les éditeurs
// d'étiquettes écrivent et relisent, est un bloc RIFF « id3 » contenant une étiquette ID3v2 entière,
// donc une trame APIC, la même que dans un MP3. Un lecteur RIFF qui ne connaît pas ce bloc le saute
// par la règle même du format, comme il saute déjà l'iXML. C'est la voie que Fabien a choisie le
// 2026-11-16 devant deux autres : une image écrite à côté du fichier, ou rien du tout.
//
// DEUX FORMATS D'IMAGE, JPEG ET PNG, ET ILS PASSENT OCTET POUR OCTET. Ce sont les deux que la norme
// ID3 recommande pour une couverture et les deux que les lecteurs affichent. Ils ne sont ni
// réencodés ni redimensionnés : la pochette relue est l'image reçue. Toute autre image est convertie
// en PNG avant d'arriver ici, par `plugins/pochette-entree.ts`, qui seul a un canevas.
//
// LE TYPE SE LIT SUR LES OCTETS, JAMAIS SUR L'ÉTIQUETTE DU FICHIER. `ui/rechargerFichiers.ts` déclare
// `image/jpeg` toute image rechargée qui n'est ni PNG ni SVG : un WebP rouvert avec son projet se dit
// JPEG. Inscrire le type annoncé aurait écrit dans la trame un type que ses octets démentent.
//
// Référence : ID3v2.4.0, structure principale et trames natives, § 4.14, id3.org.

/** Les deux types qu'une pochette inscrite peut avoir. */
export type TypePochette = "image/jpeg" | "image/png";

/** Une pochette prête à inscrire : son type, lu sur ses octets, et ses octets. */
export interface Pochette {
  mime: TypePochette;
  octets: Uint8Array;
}

const SIGNATURE_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** Le type JPEG ou PNG que portent ces octets, d'après leur signature ; sinon `undefined`. */
export function typePochetteDesOctets(o: Uint8Array): TypePochette | undefined {
  if (o.length >= 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return "image/jpeg";
  if (o.length >= SIGNATURE_PNG.length && SIGNATURE_PNG.every((b, i) => o[i] === b)) return "image/png";
  return undefined;
}

/**
 * Le nom du format que portent des octets qui ne sont ni JPEG ni PNG, pour le message du nœud.
 *
 * Il ne sert qu'à DIRE ce qui a été converti : la conversion, elle, ne dépend pas de ce nom.
 */
export function nomDuFormatImage(o: Uint8Array): string | undefined {
  const ascii = (de: number, n: number) => String.fromCharCode(...o.subarray(de, de + n));
  if (o.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "WebP";
  if (o.length >= 4 && ascii(0, 4) === "GIF8") return "GIF";
  if (o.length >= 2 && ascii(0, 2) === "BM") return "BMP";
  if (estTexteSvg(o)) return "SVG";
  return undefined;
}

/** Ces octets commencent-ils comme un document SVG, blancs et marque d'ordre d'octets passés ? */
export function estTexteSvg(o: Uint8Array): boolean {
  const debut = new TextDecoder().decode(o.subarray(0, 512)).replace(/^﻿/, "").trimStart();
  return debut.startsWith("<svg") || (debut.startsWith("<?xml") && debut.includes("<svg"));
}

/** Une valeur est-elle une pochette prête à inscrire ? */
export function estPochette(v: unknown): v is Pochette {
  if (!v || typeof v !== "object") return false;
  const p = v as { mime?: unknown; octets?: unknown };
  return (p.mime === "image/jpeg" || p.mime === "image/png") && p.octets instanceof Uint8Array;
}

/** La pochette que porte un canal d'affichage, s'il en porte une. */
export function pochetteDe(affichage: unknown): Pochette | undefined {
  const p = (affichage as { pochette?: unknown } | undefined)?.pochette;
  return estPochette(p) ? p : undefined;
}
