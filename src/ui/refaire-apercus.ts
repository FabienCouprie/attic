// ui/refaire-apercus.ts — Refaire les aperçus à une autre profondeur, sans rejouer un seul nœud.
//
// ═══ LE DÉFAUT, ET IL A ÉTÉ MESURÉ ═══
//
// Le sélecteur de profondeur d'export était INOPÉRANT, et même en relançant. Relevé dans
// l'application sur un générateur d'une seconde :
//
//     rendu, défaut 24 bits                        24 bits · 44 100 Hz
//     sélecteur à 32 bits, sans relancer           24 bits · 44 100 Hz
//     sélecteur à 32 bits, PUIS LANCER             24 bits · 44 100 Hz   ← inopérant
//     et ensuite fréquence à 48 kHz, puis Lancer   32 bits · 48 000 Hz
//
// LES 32 BITS NE SONT APPARUS QUE PAR ACCIDENT, quand le changement de FRÉQUENCE a fait manquer le
// cache. Deux mécanismes se cumulaient : le nœud n'était pas rejoué, et surtout l'adresse de
// l'aperçu est RÉUTILISÉE tant que le tampon est le même objet — ce qui est une bonne idée, elle
// évite de démonter le lecteur à chaque run, mais elle ne regardait pas la profondeur.
//
// ET LE MÊME BLOB EST LE FICHIER SAUVEGARDÉ : `profondeur-export.ts` le dit en en-tête. Changer la
// profondeur puis enregistrer écrivait donc l'ancienne, sans qu'une ligne ne le signale.
//
// ═══ POURQUOI L'APERÇU SEUL, ET SURTOUT PAS LA CLÉ DE CACHE ═══
//
// La fréquence de travail, elle, entre dans la clé de cache, et c'est juste : elle change ce que les
// nœuds CALCULENT. La profondeur ne change que l'ÉCRITURE. La mettre dans la clé ferait recalculer
// une heure de son parce qu'on passe de 24 à 32 bits — absurde, et c'est le piège qu'un remède
// symétrique aurait tendu.
//
// LA DISTINCTION EST CELLE DE LEUR NATURE, que leur voisinage dans la barre d'outils cache : la
// fréquence est une propriété du PROJET, enregistrée dans son fichier ; la profondeur est une
// préférence de la PERSONNE, dans son stockage local. Côte à côte, les deux sélecteurs paraissent
// symétriques et ne le sont pas.

import { Respiration } from "../core/respirer";
import { servicesApercu, type ApercuRefaisable, type OptionsApercu } from "./services-apercu";
import { poserApercu } from "./statuts";
import { poserResultat, resultatDe, resultatsPoses } from "./resultats";
import type { ProfondeurExport } from "../audio/io";

/** Ce que le moteur pose à côté de l'adresse d'un aperçu, pour qu'elle puisse être refaite. */
interface ResultatAvecApercu {
  audioResultatUrl?: string;
  audioResultatBuffer?: unknown;
  audioResultatRefaisable?: ApercuRefaisable;
}

/**
 * Refait, à `bits`, les aperçus qui ne sont pas déjà à cette profondeur. Rend leur nombre.
 *
 * AUCUN NŒUD N'EST REJOUÉ : la valeur est là, dans le magasin des résultats, et seule son écriture
 * est reprise. Un nœud dont le tampon a été libéré — économie de mémoire, bulle repliée — n'a rien
 * à refaire et n'est pas touché ; son aperçu se construira au prochain run, à la bonne profondeur.
 *
 * ELLE NE JETTE PAS. Une réécriture ratée laisse l'aperçu d'avant en place, qui est jouable, plutôt
 * que de laisser un nœud sans lecteur : la profondeur est un confort, pas une correction.
 */
export async function refaireLesApercus(bits: ProfondeurExport): Promise<number> {
  const souffle = new Respiration();
  let refaits = 0;
  for (const id of resultatsPoses()) {
    const r = resultatDe(id) as ResultatAvecApercu;
    if (!r.audioResultatUrl || r.audioResultatBuffer == null) continue;
    const refaisable = r.audioResultatRefaisable;
    if (!refaisable || refaisable.bits === bits) continue;
    const o: OptionsApercu = {
      ...refaisable.reecriture, bits, souffle,
      onAvance: (part) => poserApercu(id, part),
    };
    try {
      const blob = await servicesApercu().blobApercu(r.audioResultatBuffer, o);
      if (!blob) continue;
      const ancienne = r.audioResultatUrl;
      poserResultat(id, { audioResultatUrl: URL.createObjectURL(blob),
        audioResultatRefaisable: { ...refaisable, bits } });
      URL.revokeObjectURL(ancienne);
      refaits++;
    } catch (e) {
      console.warn(`[apercu] réécriture impossible sur ${id}, l'aperçu d'avant reste`, e);
    } finally {
      poserApercu(id, undefined);
    }
    // LE FIL REND LA MAIN ENTRE DEUX NŒUDS : réécrire vingt aperçus d'une minute prend des
    // secondes, et l'interface ne doit pas s'y figer. `blobApercu` respire déjà à l'intérieur d'un
    // seul aperçu, par le même souffle.
    await souffle.tour();
  }
  return refaits;
}
