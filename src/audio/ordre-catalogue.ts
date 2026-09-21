// audio/ordre-catalogue.ts — L'ordre des univers, en un seul endroit.
//
// POURQUOI CE FICHIER EXISTE, ET IL A FALLU UN DÉFAUT POUR S'EN APERCEVOIR. Deux endroits
// affichent le catalogue par univers : le générateur de `COMPONENTS.md` et la palette de nœuds.
// Le premier connaissait l'ordre voulu — Entrées, Traitement, Visualisation, Sorties… — et le
// second s'en remettait à l'ORDRE DE RENCONTRE des fiches. Sans recherche, cet ordre est celui du
// registre et l'illusion tient ; dès qu'on cherche, la première fiche retenue décide du premier
// titre affiché, et les Entrées se retrouvent au milieu.
//
// L'ordre est donc écrit ici, et les deux endroits le lisent. Un univers inconnu de la liste vient
// après, par ordre alphabétique : ajouter un univers ne casse rien, il se range simplement à la
// fin en attendant qu'on décide de sa place.

/** Les univers dans l'ordre où on veut les voir, partout. */
export const ORDRE_UNIVERS = [
  "Entrées",
  "Traitement",
  "Visualisation",
  "Sorties",
  "Collections",
  "Méta-composants",
  "Nouvelles fonctionnalités",
  "Autres",
];

/**
 * Compare deux univers selon l'ordre voulu.
 *
 * « Autres » ferme la marche et « Nouvelles fonctionnalités » la précède : ce sont les deux
 * rubriques qu'on ne consulte pas en travaillant, et les mettre ailleurs qu'à la fin déplacerait
 * tout le reste à chaque nouveauté.
 */
export function comparerUnivers(a: string, b: string): number {
  const rang = (u: string) => {
    const i = ORDRE_UNIVERS.indexOf(u);
    return i < 0 ? ORDRE_UNIVERS.length : i;
  };
  return rang(a) - rang(b) || a.localeCompare(b);
}
