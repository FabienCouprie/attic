// ui/oubli-noeuds.ts — Ce qu'un graphe abandonne emporte ses resultats avec lui.
//
// LE DEFAUT, RELEVE PAR FABIEN. Charger un workflow, l'executer, vider le canevas par la croix,
// puis poser un composant neuf : celui-ci arrivait avec le lecteur, le niveau, la duree et le
// message du workflow efface, et marque « termine » sans avoir jamais tourne. Reproduit en trois
// gestes sur « Voyelle chantee (FOF) » : le noeud neuf affichait « -3.1 dB », « 0:00.00 / 0:03.00 »
// et « Voyelle a · 1655 bouffees · graine 4897 », qui etaient ceux du noeud d'avant.
//
// TROIS PIECES SE REJOIGNENT, ET AUCUNE N'EST FAUTIVE SEULE.
//
//   1. Les resultats et les statuts ne vivent plus dans le graphe mais dans deux magasins hors de
//      React, indexes par identifiant de noeud. C'est ce qui a ote un gel en N au carre, et cela
//      reste juste ; voir `ui/resultats.ts`.
//   2. Vider le canevas retirait les noeuds SANS passer par `reinitialiserIds`, le seul endroit qui
//      efface ces deux magasins. Les entrees restaient donc, sans noeud pour les porter.
//   3. `ui/ids.ts` rend `noeud-{max+1}` calcule sur les noeuds PRESENTS : sur un canevas vide, le
//      suivant s'appelle `noeud-1`, c'est-a-dire le nom qu'avait le premier noeud d'avant.
//
// LA REGLE QUI FERME LE DEFAUT, ET POURQUOI ELLE NE DIT PAS « ABSENT DU CANEVAS ». Entrer dans un
// meta-composant met ses noeuds internes sur le canevas et range les autres dans le graphe racine :
// ceux-la sont absents de l'ecran et doivent garder leurs resultats, sans quoi ressortir du meta
// montrerait un graphe vide de tout ce qu'il avait produit. Ce qui compte n'est donc pas d'etre a
// l'ecran, mais d'etre ENCORE ATTEIGNABLE : le canevas et le graphe racine. Le reste est abandonne,
// et s'oublie.
//
// ON NE REND PAS LES IDENTIFIANTS MONOTONES A LA PLACE. Des identifiants qui se reemploient ne sont
// pas une faute ; se servir d'eux comme cle d'un magasin qu'on ne nettoie pas en est une. Un
// compteur qui ne redescend jamais masquerait le defaut sans le fermer, et la premiere entree
// oubliee reviendrait au premier identifiant rejoue.
import { effacerResultats, resultatDe, resultatsPoses } from "./resultats";
import { reinitialiserStatuts, statutsPoses } from "./statuts";

/**
 * Les identifiants dont un magasin garde une trace alors que plus aucun graphe ne les porte.
 *
 * Fonction pure : c'est elle que le garde eprouve, les deux magasins n'etant que des Map.
 */
export function orphelins(idsVivants: Iterable<string>, idsPoses: Iterable<string>): string[] {
  const vivants = new Set(idsVivants);
  const vus = new Set<string>();
  const sortie: string[] = [];
  for (const id of idsPoses) {
    if (vivants.has(id) || vus.has(id)) continue;
    vus.add(id);
    sortie.push(id);
  }
  return sortie;
}

/**
 * Oublie tout ce que les magasins gardent d'un graphe abandonne.
 *
 * `idsVivants` sont les noeuds encore atteignables : ceux du canevas, et ceux du graphe racine
 * quand on travaille dans un meta-composant. Rend le nombre d'identifiants oublies.
 *
 * LES ADRESSES BLOB SONT REVOQUEES AU PASSAGE. Un resultat porte des `createObjectURL` — une bande
 * son, un film, une image — et les perdre sans les revoquer laisse leur memoire au navigateur
 * jusqu'a la fermeture. Ces noeuds-la ne reviendront pas : tout ce qui commence par `blob:` part.
 */
export function oublierNoeuds(idsVivants: Iterable<string>): number {
  const vivants = new Set(idsVivants);
  const poses = new Set<string>([...resultatsPoses(), ...statutsPoses()]);
  const aOublier = orphelins(vivants, poses);
  if (aOublier.length === 0) return 0;
  for (const id of aOublier) {
    for (const v of Object.values(resultatDe(id))) {
      if (typeof v === "string" && v.startsWith("blob:")) URL.revokeObjectURL(v);
    }
  }
  effacerResultats(aOublier);
  reinitialiserStatuts(aOublier);
  return aOublier.length;
}

/** Les identifiants d'une liste de noeuds, quelle qu'en soit la forme. */
export const idsDe = (noeuds: readonly { id: string }[] | null | undefined): string[] =>
  (noeuds ?? []).map((n) => n.id);
