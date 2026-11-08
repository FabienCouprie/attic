// ui/refaire-apercus.ts — Refaire les aperçus à une autre profondeur, sans rejouer un seul nœud ; et
// réécrire celui dont les octets ont disparu (voir la seconde partie du fichier).
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

// ═══ L'APERÇU DONT LES OCTETS ONT DISPARU, ET IL A ÉTÉ MESURÉ ═══
//
// Relevé par Fabien sur l'application installée, ouverte trois jours : « en appuyant sur le play du
// lecteur, un timer à 00:00 et l'icône play grisé ». Le tampon, lui, était intact. La cause est
// hors de l'application : passé un plafond en mémoire, Chromium pose les blobs les plus anciens sur
// le disque, sous `userData/blob_storage/<session>` (2,8 Go de blobs y ont mis 182 fichiers), et
// TOUT processus qui démarre sur le même profil efface les dossiers de session qui ne sont pas le
// sien. Une seconde instance, l'Electron de développement ou une épreuve Playwright sans
// `--user-data-dir` emportent donc les octets d'un aperçu que la première instance montre encore.
// Reproduit dans l'application construite :
//
//     lecteur chargé, premier ▶      PIPELINE_ERROR_READ, code 2, le temps reste à 0:00
//     second ▶, ou nœud replié       MEDIA_ELEMENT_ERROR: Format error, code 4, ▶ grisé, 0:00 / 0:00
//     tampon du moteur au même instant   6 s, 2 canaux, crête 0,8019 : rien de perdu
//     nouveau Lancer                 même adresse réemployée, toujours grisé
//
// LE NOUVEAU LANCER NE RÉPARAIT RIEN, et c'est la seconde faute : le nœud vient du cache, son tampon
// est le même objet, donc `correctif-resultat.ts` réemploie l'adresse. Une adresse déclarée perdue
// n'est plus réemployée, et le lecteur qui la voit tomber demande sa réécriture tout de suite.

const perdues = new Set<string>();

/** Cette adresse d'aperçu a-t-elle perdu ses octets ? Un run ne la réemploie pas. */
export const apercuPerdu = (url: string): boolean => perdues.has(url);

/**
 * Réécrit, depuis le tampon retenu, l'aperçu d'un nœud dont le lecteur n'a pas pu lire `perdue`.
 * Rend vrai si une adresse neuve a été posée.
 *
 * UNE SEULE TENTATIVE PAR ADRESSE : un aperçu neuf qui tomberait à son tour ne doit pas faire boucler
 * le lecteur sur des réécritures. L'adresse neuve, elle, a droit à la sienne.
 *
 * RIEN N'EST POSÉ SI UN RUN A REMPLACÉ L'APERÇU PENDANT LA RÉÉCRITURE : le sien est plus récent, et le
 * blob réécrit ne devient jamais une adresse, donc ne retient rien.
 */
export async function reparerApercu(id: string, perdue: string): Promise<boolean> {
  if (perdues.has(perdue)) return false;
  perdues.add(perdue);
  const r = resultatDe(id) as ResultatAvecApercu;
  const refaisable = r.audioResultatRefaisable;
  if (r.audioResultatUrl !== perdue || r.audioResultatBuffer == null || !refaisable) return false;
  try {
    const blob = await servicesApercu().blobApercu(r.audioResultatBuffer, {
      ...refaisable.reecriture, bits: refaisable.bits, souffle: new Respiration(),
      onAvance: (part) => poserApercu(id, part),
    });
    if (!blob || resultatDe(id).audioResultatUrl !== perdue) return false;
    poserResultat(id, { audioResultatUrl: URL.createObjectURL(blob) });
    URL.revokeObjectURL(perdue);
    return true;
  } catch (e) {
    console.warn(`[apercu] réécriture impossible sur ${id} ; un nouveau run la refera`, e);
    return false;
  } finally {
    poserApercu(id, undefined);
  }
}
