// ui/favoris.ts — Le registre des liens que la barre d'outils propose.
//
// POURQUOI UN REGISTRE PLUTÔT QU'UNE LISTE. La barre d'outils portait en dur une vingtaine de
// bibliothèques de SONS. Le shell est censé ignorer le domaine : il dessine un bouton et un menu, il
// n'a pas à savoir qu'on y cherche des chants d'oiseaux. La liste vit donc du côté du domaine
// (`audio/favoris.ts`), et c'est la racine de composition qui la dépose ici, comme l'adaptateur
// dépose le registre dans les modules du cœur qui en ont besoin.
//
// VIDE PAR DÉFAUT, ET C'EST LE COMPORTEMENT UTILE. Un domaine qui ne déclare aucun lien n'a pas de
// bouton du tout : la barre ne propose pas un menu qui s'ouvrirait sur rien.

/** Un lien proposé : une clé de traduction `favs.<cle>` et l'adresse. */
export interface Favori {
  cle: string;
  url: string;
}

let liste: readonly Favori[] = [];

/** Dépose la liste du domaine. Appelé une fois, avant le premier rendu. */
export function configurerFavoris(favoris: readonly Favori[]): void {
  liste = favoris;
}

/** Les liens à proposer. Vide tant que personne n'en a déposé. */
export function favoris(): readonly Favori[] {
  return liste;
}
