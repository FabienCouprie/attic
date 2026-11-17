// ui/paquet/ouvrir-paquet.ts — Ce que l'import lit d'un fichier, et ce qu'il fait d'un paquet relu.
//
// L'IMPORT RECONNAÎT UN FICHIER À SON CONTENU, et non à son extension, demandé le 2026-11-16 : les
// quatre premiers octets d'un zip, `PK\x03\x04`, contre du texte. Un `.attic` renommé en `.json` reste
// un paquet ; un `.json` renommé en `.attic` reste un projet.
//
// UN `.json` S'OUVRE EXACTEMENT COMME AVANT, et c'est le premier soin de ce module. Ouvert par un
// fichier — sélecteur du mode web, exemple —, il se lit par `File.text()`, comme avant.
// Ouvert par le dialogue, il arrive désormais en OCTETS, puisqu'il faut voir les quatre premiers
// avant de savoir ce qu'il est ; et il se décode comme le processus principal le décodait, par
// `readFile(…, "utf-8")` : en gardant une marque d'ordre d'octets en tête, et en remplaçant chaque
// séquence invalide par U+FFFD. `TextDecoder` fait les deux avec `ignoreBOM: true`, et
// `ouvrir-paquet.test.ts` le mesure sur des octets tirés au hasard contre `Buffer.toString`.
import { creerUrlMedia } from "../urls-medias";
import { estUnZip } from "./zip";

/** Ce qu'on a lu : un texte de projet, ou les octets d'un paquet. Et d'où, quand on le sait. */
export type FichierLu = { chemin: string | null; texte: string } | { chemin: string | null; octets: Uint8Array };

/** Les deux sortes de fichiers que le dialogue d'ouverture propose. */
export const FILTRES_OUVERTURE = [{ name: "Workflow Attic", extensions: ["json", "attic"] }];

/** Le texte que `fs.readFile(chemin, "utf-8")` rendait des mêmes octets. */
export const texteCommeLePont = (octets: Uint8Array): string =>
  new TextDecoder("utf-8", { ignoreBOM: true }).decode(octets);

/** Lit le fichier à ouvrir : celui qu'on donne, ou celui que le dialogue choisit. `null` : rien. */
export async function lireLeFichierAOuvrir(f: File | undefined, repertoire: string, api: any): Promise<FichierLu | null> {
  if (f) {
    const chemin = api?.cheminFichier ? api.cheminFichier(f) || null : null;
    if (estUnZip(new Uint8Array(await f.slice(0, 4).arrayBuffer()))) return { chemin, octets: new Uint8Array(await f.arrayBuffer()) };
    return { chemin, texte: await f.text() };
  }
  if (!api) return null;
  if (!api.ouvrirFichierBinaire) {
    const r = await api.ouvrirFichier({ defaultPath: repertoire || undefined, filters: FILTRES_OUVERTURE });
    return r ? { chemin: r.chemin || null, texte: r.contenu } : null;
  }
  const r = await api.ouvrirFichierBinaire({ defaultPath: repertoire || undefined, filters: FILTRES_OUVERTURE });
  if (!r) return null;
  const octets = r.donnees instanceof Uint8Array ? r.donnees : new Uint8Array(r.donnees);
  const chemin = r.chemin || null;
  return estUnZip(octets) ? { chemin, octets } : { chemin, texte: texteCommeLePont(octets) };
}

/**
 * L'adresse que chaque média relu reçoit, comme au chargement du fichier sur le nœud.
 *
 * LES DEUX QUE L'ATELIER POSE LUI-MÊME, et elles seules : le son chargé (`ui/rechargerFichiers.ts`
 * pose `audioUrl` en relisant le disque) et l'enregistrement (`hooks/useChargementMedias.ts` pose
 * `enregistrementUrl`). Un fichier MIDI, une image ou un SVG relus du disque n'en reçoivent pas, et
 * relus d'un paquet non plus.
 */
const ADRESSE_DU_MEDIA: Record<string, string> = { audioFichier: "audioUrl", enregistrementBlob: "enregistrementUrl" };

/** Les nœuds, ceux qui ont un média dans le paquet étant des copies qui le portent. */
export function avecLesMedias<N extends { id: string; data: Record<string, unknown> }>(
  noeuds: readonly N[], medias: ReadonlyMap<string, Record<string, Blob>>,
): N[] {
  return noeuds.map((n) => {
    const champs = medias.get(n.id);
    if (!champs) return n;
    const data: Record<string, unknown> = { ...n.data, ...champs };
    for (const [champ, blob] of Object.entries(champs)) {
      const adresse = ADRESSE_DU_MEDIA[champ];
      if (adresse) data[adresse] = creerUrlMedia(blob);
    }
    return { ...n, data };
  });
}
