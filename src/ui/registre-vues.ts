// ui/registre-vues.ts — Le registre des vues de nœud, côté shell : il garde, il cherche, il ne
// nomme rien.
//
// POURQUOI CE MODULE, ET C'EST LA FRONTIÈRE QUI SE DONNE UN NOM.
//
// `ui/vues.tsx` mêlait deux choses dans un seul fichier. D'un côté la mécanique : ce qu'est une vue,
// ce que « avant » et « après » veulent dire, comment on en trouve une pour un nœud. De l'autre une
// LISTE D'ENTRÉES nommant des identifiants de composants audio — `cercle-gamme`, `orchestre-csound`,
// `reverbe-convolution` — et important les modules de vues qui vont avec. Cette liste vit désormais
// dans `vues-domaine/vues.tsx`, qui en porte le compte ; le répéter ici le ferait vieillir.
//
// Le shell importait donc ce fichier pour sa mécanique, et recevait le domaine avec. Un domaine
// d'images aurait hérité d'un registre parlant de clavier SFZ, et son `AtelierNode` aurait chargé
// des vues dont aucune ne le concernait.
//
// LA MÉCANIQUE EST ICI, VIDE PAR DÉFAUT ; les entrées sont déclarées par le domaine, et la racine de
// composition déclenche cette déclaration. La dépendance est renversée : le shell ne connaît plus
// aucune vue, et c'est le domaine qui vient se faire connaître — comme pour le registre de fiches,
// les liens de la barre d'outils et les genres de paramètre.

import type { ReactNode } from "react";
import type { DonneesNoeud } from "./AtelierNode";
import { registreUI, type FicheUI } from "./registre-actif";

/** Ce qu'une vue de nœud reçoit. */
export interface VueProps {
  id: string;
  data: DonneesNoeud;
  def?: FicheUI;
}

/** Une vue de nœud : elle se rend sous l'en-tête, avant ou après le lecteur générique. */
export type Vue = (props: VueProps) => ReactNode;

/**
 * Une entrée du registre.
 *
 * `porteLecteur` DIT QUE CETTE VUE DONNE DÉJÀ UN MOYEN D'ÉCOUTER. Le nœud pose un lecteur générique
 * sous ses vues ; il le retire quand l'une d'elles porte le sien, sans quoi il y en aurait deux. La
 * règle se lisait auparavant sur la seule PRÉSENCE d'une vue « avant », au motif qu'une vue propre
 * gère l'audio : c'était faux pour la plupart d'entre elles, et huit générateurs fabriquaient un son
 * que rien ne permettait d'entendre. Le fait se déclare donc, au lieu de se deviner.
 */
export interface EntreeVue {
  correspond: (ficheId: string) => boolean;
  vue: Vue;
  position: "avant" | "apres";
  masqueMessage?: boolean;
  porteLecteur?: boolean;
}

/** Le prédicat le plus courant : cette entrée vaut pour ces identifiants. */
export const parId = (...ids: string[]) => (f: string) => ids.includes(f);

let entrees: readonly EntreeVue[] = [];

/** Le domaine déclare ses vues. Appelé une fois, avant le premier rendu. */
export function declarerVues(declarees: readonly EntreeVue[]): void {
  entrees = [...entrees, ...declarees];
}

/** Oublie les déclarations. Pour un test qui veut éprouver le shell seul. */
export function oublierVues(): void {
  entrees = [];
}

/** Combien de vues sont déclarées. Un domaine qui n'en déclare aucune en a zéro, et cela se dit. */
export const nombreDeVues = (): number => entrees.length;

/**
 * L'identifiant sous lequel chercher une vue.
 *
 * UN NŒUD PEUT PORTER UN ANCIEN IDENTIFIANT. Le registre de fiches résout les alias — « sequenceur-
 * batterie » ouvre « sequenceur-batterie-avance » —, mais les vues étaient cherchées sur
 * l'identifiant BRUT des données du nœud. Un graphe enregistré s'ouvrait donc sur la bonne fiche,
 * avec le bon titre et la bonne exécution, mais SANS SA GRILLE : plus rien à cliquer, et aucune
 * erreur pour le dire. Constaté dans l'application en vérifiant la suppression du séquenceur binaire.
 */
const idPourVue = (ficheId: string): string => registreUI().trouverDef(ficheId)?.id ?? ficheId;

export function vuesPourNoeud(ficheId: string, position: "avant" | "apres"): Vue[] {
  const id = idPourVue(ficheId);
  return entrees.filter((e) => e.position === position && e.correspond(id)).map((e) => e.vue);
}

/** Une vue « avant » de ce composant donne-t-elle déjà un moyen d'écouter ? */
export function vueAvantPorteLecteur(ficheId: string): boolean {
  return entrees.some((e) => e.position === "avant" && e.porteLecteur === true && e.correspond(ficheId));
}

export function vueAvantMasqueMessage(ficheId: string): boolean {
  const id = idPourVue(ficheId);
  return entrees.some((e) => e.position === "avant" && e.correspond(id) && e.masqueMessage);
}
