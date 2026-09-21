// ui/profondeur-export.ts — La profondeur des fichiers que l'application écrit.
//
// CE QUE LE RÉGLAGE COMMANDE, ET POURQUOI IL A FALLU L'AJOUTER. Tout WAV produit par Attic était
// écrit en seize bits, en dur. Seize bits est une livraison de disque compact ; un livrable de
// diffusion, de post-production ou d'archivage se rend en vingt-quatre au minimum. Un outil qui
// mesure la sonie selon BS.1770-4, la crête vraie et la plage dynamique, et qui ne sait sortir
// qu'en seize bits, se contredit lui-même — c'est la mesure qui perd, puisqu'elle porte sur un
// tampon plus précis que le fichier livré.
//
// LE TRENTE-DEUX BITS FLOTTANT N'EST PAS « ENCORE PLUS DE BITS ». C'est autre chose : le tampon
// part tel quel, dépassements du plein calibre compris, et rien n'est ni arrondi ni écrêté. Un
// fichier qui sort à +3 dBFS se rattrape d'un gain négatif chez le destinataire sans qu'un seul
// échantillon ait été perdu. C'est le format d'un fichier destiné à être retravaillé ailleurs, et
// le mauvais choix pour un fichier destiné à être simplement écouté.
//
// LE FICHIER SERT AUSSI D'APERÇU, ET C'EST LE PRIX DU RÉGLAGE. Le même blob alimente le lecteur du
// nœud et la sauvegarde : monter la profondeur augmente donc d'autant la mémoire retenue par les
// aperçus — de moitié en vingt-quatre bits, du double en trente-deux. La bascule d'économie de
// mémoire, à côté, reste le remède pour les pistes longues (cf. [[economie-memoire]]).
//
// VINGT-QUATRE PAR DÉFAUT. Le défaut historique était seize, et le conserver aurait laissé le
// défaut se contredire avec les instruments de mesure du logiciel. Vingt-quatre est le format que
// réclame toute livraison sérieuse, il se lit partout, et il coûte la moitié d'un aperçu en plus.

import type { ProfondeurExport } from "../audio/io";

/** Clé de préférence : le sélecteur de la barre d'outils, groupe Fichier. */
export const CLE_PROFONDEUR_EXPORT = "attic-profondeur-export";

export const PROFONDEURS: { valeur: ProfondeurExport; fr: string; en: string; note: string; noteEn: string }[] = [
  { valeur: 16, fr: "16 bits", en: "16-bit",
    note: "Disque compact. Le plus léger, et le seul que ce logiciel écrivait avant.",
    noteEn: "Compact disc. The lightest, and the only one this software used to write." },
  { valeur: 24, fr: "24 bits", en: "24-bit",
    note: "Le format de toute livraison professionnelle. Se lit partout.",
    noteEn: "The format of every professional delivery. Reads everywhere." },
  { valeur: 32, fr: "32 bits flottants", en: "32-bit float",
    note: "Rien n'est arrondi ni écrêté, dépassements compris. Pour un fichier qu'on retravaillera.",
    noteEn: "Nothing is rounded or clipped, overshoots included. For a file to be worked on again." },
];

const EST_PROFONDEUR = (v: number): v is ProfondeurExport => v === 16 || v === 24 || v === 32;

/** Vingt-quatre bits par défaut : le défaut historique contredisait les instruments de mesure. */
export function lireProfondeurExport(stockage?: Pick<Storage, "getItem">): ProfondeurExport {
  try {
    const s = stockage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    const brut = Number(s?.getItem(CLE_PROFONDEUR_EXPORT));
    return EST_PROFONDEUR(brut) ? brut : 24;
  } catch {
    return 24;
  }
}

/** Écrit la préférence. Un stockage indisponible ne doit pas empêcher le choix d'agir. */
export function ecrireProfondeurExport(bits: ProfondeurExport, stockage?: Pick<Storage, "setItem">): void {
  try {
    const s = stockage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    s?.setItem(CLE_PROFONDEUR_EXPORT, String(bits));
  } catch {
    // Mode privé, stockage bloqué : le choix vaut pour la session, et c'est tout.
  }
}
