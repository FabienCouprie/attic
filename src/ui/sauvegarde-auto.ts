// ui/sauvegarde-auto.ts — Quand la sauvegarde automatique doit écrire, et quand non.
//
// Une sauvegarde toutes les 30 s existait déjà quand un fichier de projet est ouvert,
// mais elle ne se déclenchait quasiment jamais pendant qu'on travaille : son minuteur
// était monté par un effet dépendant de la fonction de sauvegarde, dont l'identité change
// à chaque rendu. Chaque modification du graphe relançait donc le compte à zéro. Mesuré
// dans l'application : dix changements de paramètre espacés de dix secondes, cent une
// secondes de travail, aucune écriture — alors qu'au repos, elle écrivait bien au bout
// de trente secondes. Autrement dit, elle sauvegardait quand on ne faisait rien.
//
// Le minuteur est désormais monté une fois par fichier, et cette fonction décide, à
// chaque battement, s'il y a lieu d'écrire.

export const PERIODE_SAUVEGARDE_MS = 30_000;

/** Clé de préférence : la bascule de la barre d'outils, groupe Fichier. */
export const CLE_PREFERENCE = "attic-sauvegarde-auto";

/** Activée par défaut : c'est le comportement historique, et le plus sûr. */
export function lirePreference(stockage?: Pick<Storage, "getItem">): boolean {
  try {
    const s = stockage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    return s?.getItem(CLE_PREFERENCE) !== "0";
  } catch {
    return true;
  }
}

export type DecisionSauvegarde =
  /** L'utilisateur a coupé la sauvegarde automatique. */
  | "desactivee"
  /** Aucun fichier de projet : l'en-cours ne va nulle part, on ne sauvegarde rien. */
  | "sans-fichier"
  /** Pas d'écriture directe possible (mode web) : écrire ouvrirait un téléchargement. */
  | "sans-ecriture-directe"
  /** Rien n'a changé depuis la dernière écriture : ne pas toucher au fichier. */
  | "inchange"
  | "a-ecrire";

export function decisionSauvegardeAuto(etat: {
  /** La bascule de la barre d'outils. Absente : active, comme avant qu'elle existe. */
  active?: boolean;
  cheminFichier?: string | null;
  ecritureDirecte: boolean;
  json: string;
  dernierJson?: string | null;
}): DecisionSauvegarde {
  // Coupée, elle l'est pour de bon : ni au battement, ni à la fermeture. « Désactiver la
  // sauvegarde automatique » ne peut pas vouloir dire « sauf une fois de temps en temps ».
  if (etat.active === false) return "desactivee";
  if (!etat.cheminFichier) return "sans-fichier";
  // Sans `ecrireFichier`, sauvegarder passerait par un dialogue ou un téléchargement :
  // une sauvegarde automatique doit rester invisible, ou ne pas avoir lieu.
  if (!etat.ecritureDirecte) return "sans-ecriture-directe";
  if (etat.dernierJson !== undefined && etat.dernierJson !== null && etat.json === etat.dernierJson) return "inchange";
  return "a-ecrire";
}
