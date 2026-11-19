// ui/paquet/exporter-paquet.ts — Où un paquet `.attic` s'écrit : le dialogue du pont, ou un téléchargement.
//
// UN EXPORT ET NON UNE SAUVEGARDE. Le fichier courant ne change pas, l'en-cours non plus, et la
// sauvegarde automatique continue d'écrire le `.json` qu'elle écrivait : un paquet est une photographie
// du projet ET de ce qu'il a calculé, qu'on emporte ailleurs.
//
// CE QUI N'A PAS ÉTÉ EMPORTÉ SE DIT, une fois, après l'écriture : la liste des nœuds écartés et leur
// raison. Un résultat qui manque au paquet ne se voit qu'à la réouverture, où son nœud se recalcule,
// et la personne qui exporte ne serait plus là pour l'apprendre.
//
// LE PLAFOND EST CELUI DE LA CONFIGURATION, `plafondPaquetMio` (pièce C1), lu au moment d'écrire.
import { ecrirePaquet, type PaquetEcrit } from "./ecrire-paquet";
import { EXTENSION_PAQUET, PLAFOND_PAQUET, VERSION_APPLICATION, type Ecarte } from "./format-paquet";
import { mioDuPlafond, plafondDuPaquet } from "./plafond-du-paquet";
import { telechargerContenu } from "../ecriture-projet";

/** Ce que l'export lit de l'atelier. */
export interface DemandeExportPaquet {
  /** Le texte du fichier de projet, celui de `projetAEcrire`. */
  json: string;
  noeuds: readonly { id: string; data?: Record<string, unknown> }[];
  cache: ReadonlyMap<string, unknown>;
  jamaisCache: (id: string) => boolean;
  currentFilePath: string | null;
  /** Le dossier de travail réglé ; vide, le pont est interrogé. */
  repertoire: string;
  t: (cle: string) => string;
}

/** Le nom proposé : celui du fichier courant, extension changée, ou la date du jour. */
export function nomDuPaquet(currentFilePath: string | null, aujourdhui = new Date()): string {
  const base = currentFilePath?.split(/[\\/]/).pop()?.replace(/\.[^.]*$/, "");
  return `${base || `attic-${aujourdhui.toISOString().slice(0, 10)}`}.${EXTENSION_PAQUET}`;
}

/**
 * Les écarts, groupés par raison traduite, pour l'alerte : « un chemin de fichier : n3, n7 ».
 *
 * `plafond` est celui de l'écriture, en octets : la raison `plafond` le dit en Mio.
 */
export function ecartsLisibles(ecartes: readonly Ecarte[], t: (cle: string) => string, plafond = PLAFOND_PAQUET): string {
  const parRaison = new Map<string, string[]>();
  for (const e of ecartes) {
    const qui = [e.id, e.champ, e.detail].filter(Boolean).join(" · ");
    const raison = t(`paquet.ecart.${e.code}`).replace("{plafond}", mioDuPlafond(plafond));
    parRaison.set(raison, [...(parRaison.get(raison) ?? []), qui]);
  }
  return [...parRaison].map(([raison, ids]) => `${raison} : ${ids.join(", ")}`).join("\n");
}

/**
 * Écrit le paquet par le pont d'Electron, `api`, ou le télécharge sans lui.
 *
 * REND LE CHEMIN ÉCRIT, `null` si le dialogue a été fermé, et ce que le paquet porte. Un paquet qui
 * ne tiendrait pas sous le plafond n'est pas écrit : l'alerte le dit.
 */
export async function exporterPaquet(api: any, d: DemandeExportPaquet): Promise<{ chemin: string | null; paquet: PaquetEcrit } | null> {
  let paquet: PaquetEcrit;
  const plafond = await plafondDuPaquet();
  try {
    paquet = await ecrirePaquet({
      projet: d.json, cache: d.cache, noeuds: d.noeuds, jamaisCache: d.jamaisCache, application: VERSION_APPLICATION, plafond,
    });
  } catch (e) {
    console.error("[attic] Paquet non écrit", e);
    if (typeof alert !== "undefined") alert(d.t("paquet.exportImpossible").replace("{raison}", String((e as Error)?.message ?? e)));
    return null;
  }
  const nom = nomDuPaquet(d.currentFilePath);
  let chemin: string | null = null;
  if (api?.sauvegarderBinaire) {
    const dossier = d.repertoire || (await api.obtenirRepertoireTravail?.()) || "";
    const defaut = d.currentFilePath ? d.currentFilePath.replace(/\.[^.\\/]*$/, "") + `.${EXTENSION_PAQUET}` : dossier ? `${dossier}\\${nom}` : nom;
    chemin = await api.sauvegarderBinaire({
      defaultPath: defaut,
      filters: [{ name: d.t("paquet.filtre"), extensions: [EXTENSION_PAQUET] }],
      buffer: paquet.octets,
    });
    if (!chemin) return { chemin: null, paquet };
  } else {
    telechargerContenu(paquet.octets as BlobPart, nom, "application/zip");
  }
  console.log(`[attic] Paquet exporté : ${paquet.cache.length} résultat(s), ${paquet.medias} média(s), ${paquet.octets.length} octets, ${paquet.ecartes.length} écart(s)`);
  if (paquet.ecartes.length && typeof alert !== "undefined") {
    alert(`${d.t("paquet.ecartes").replace("{nb}", String(paquet.ecartes.length))}\n\n${ecartsLisibles(paquet.ecartes, d.t, plafond)}`);
  }
  return { chemin, paquet };
}
