// plugins/partition-source.ts — Lire une partition depuis son texte, ou son archive .mxl.
//
// SORTI DE « LIRE UNE PARTITION » À L'IDENTIQUE, pour que « Lire un corpus » lise chaque pièce d'un
// dossier par le même chemin : MusicXML, MEI, Humdrum et ABC par Verovio, les tables du DCML par
// `audio/dcml-tsv.ts`. Deux lectures écrites deux fois finiraient par ne plus rendre les mêmes voix.

import { langueCourante } from "../i18n";
import { detecterFormat, entreeVerovio, type FormatNotation } from "../audio/verovio";
import { hauteursHumdrum, lireDepuisVerovio } from "../audio/partition-lecture";
import { lireTableDcml } from "../audio/dcml-tsv";
import type { Sequence } from "../audio/sequence";
import type { TonaliteLue } from "../audio/corpus";
import { outilVerovio } from "./verovio-outil";

const en = () => langueCourante() === "en";

/** Une table de notes du DCML : un en-tête tabulé qui nomme l'attaque, la portée et la hauteur. */
export const estTableDcml = (t: string) => {
  const entete = t.split("\n", 1)[0].split("\t");
  return entete.includes("midi") && entete.includes("staff") && entete.some((c) => c.startsWith("quarterbeats"));
};

export type SourcePartition = { texte: string; zip?: undefined; nom: string } | { texte?: undefined; zip: ArrayBuffer; nom: string };

export type FormatLu = FormatNotation | "dcml";

/**
 * Les octets d'une réponse de `api.lireBinaire`, qui rend `{ donnees, nom }` ou `null`.
 *
 * LA FORME DE LA RÉPONSE A ÉTÉ PRISE POUR LES OCTETS EUX-MÊMES dans « Lire une partition », et un
 * `.mxl` lu par « Chemin » devenait une archive vide. Une seule lecture, pour les deux nœuds.
 */
export function octetsLus(reponse: unknown): Uint8Array | null {
  const d = (reponse as { donnees?: unknown } | null)?.donnees ?? reponse;
  if (d instanceof Uint8Array) return d.length > 0 ? d : null;
  if (d instanceof ArrayBuffer) return d.byteLength > 0 ? new Uint8Array(d) : null;
  return null;
}

export const NOMS_FORMAT: Record<FormatLu, string> = { abc: "ABC", musicxml: "MusicXML", mei: "MEI", humdrum: "Humdrum", dcml: "DCML" };

/**
 * Ce que la lecture rend : la séquence, la tonalité que la partition écrit (jamais une table du DCML,
 * qui n'en porte pas) et ses lignes de rapport ; ou le refus et sa raison.
 */
export type PartitionSource =
  | { ok: true; sequence: Sequence; format: FormatLu; tonaliteEcrite: TonaliteLue | null; lignes: string[] }
  | { ok: false; message: string; lignes: string[] };

/**
 * Lit une partition. `tempoImpose` à zéro prend le tempo écrit, 120 à défaut, et 100 pour une table
 * du DCML. Une partition sans note est refusée.
 */
export async function lirePartitionSource(source: SourcePartition, tempoImpose: number): Promise<PartitionSource> {
  let sequence: Sequence;
  let format: FormatLu;
  let tonaliteEcrite: TonaliteLue | null = null;
  const lignes: string[] = [];
  if (source.texte !== undefined && estTableDcml(source.texte)) {
    format = "dcml";
    const lue = lireTableDcml(source.texte, tempoImpose > 0 ? tempoImpose : 100);
    sequence = lue.sequence;
    lignes.push(`${en() ? "tied notes joined" : "notes liées jointes"} : ${lue.liees}`);
    for (const r of lue.refusees.slice(0, 20)) lignes.push(`${en() ? "row" : "ligne"} ${r.ligne} ${en() ? "refused" : "refusée"} : ${r.raison}`);
    if (lue.refusees.length > 0 && sequence.notes.length === 0) return { ok: false, message: lue.refusees[0].raison, lignes };
  } else {
    format = source.zip ? "musicxml" : (detecterFormat(source.texte ?? "") as FormatNotation);
    if (!format) {
      return { ok: false, lignes, message: en()
        ? "Notation not recognised: expected MusicXML, MEI, Humdrum, ABC or a DCML table."
        : "Notation non reconnue : attendu MusicXML, MEI, Humdrum, ABC ou une table du DCML." };
    }
    let tk: any = null;
    try {
      tk = await outilVerovio(format === "humdrum");
      tk.setOptions({ inputFrom: entreeVerovio(format), expandNever: true });
      const charge = source.zip ? tk.loadZipDataBuffer(source.zip) : tk.loadData(source.texte);
      if (!charge) {
        return { ok: false, lignes, message: en()
          ? `${NOMS_FORMAT[format]} refused by Verovio: check the notation.`
          : `${NOMS_FORMAT[format]} refusé par Verovio : vérifiez la notation.` };
      }
      // Le Humdrum reprend ses hauteurs dans son texte : l'import de Verovio perd les altérations
      // que l'armure porte (`hauteursHumdrum`).
      const ecrites = format === "humdrum" && source.texte ? hauteursHumdrum(source.texte) : undefined;
      const lue = lireDepuisVerovio(tk, tempoImpose, ecrites);
      sequence = lue.sequence;
      tonaliteEcrite = lue.tonaliteEcrite;
      lignes.push(`${en() ? "tied notes joined" : "notes liées jointes"} : ${lue.liees}`);
      if (lue.sansVoix > 0) lignes.push(`${en() ? "notes without staff or layer, left out" : "notes sans portée ni couche, écartées"} : ${lue.sansVoix}`);
    } catch (e: any) {
      return { ok: false, lignes, message: e?.message ?? String(e) };
    } finally {
      tk?.destroy?.();
    }
  }
  if (sequence.notes.length === 0) return { ok: false, lignes, message: en() ? "No note in the score." : "Aucune note dans la partition." };
  return { ok: true, sequence, format, tonaliteEcrite, lignes };
}
