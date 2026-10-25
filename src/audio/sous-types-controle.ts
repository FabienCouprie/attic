// audio/sous-types-controle.ts — Ce qu'un port « contrôle » transporte vraiment.
//
// POURQUOI CE FICHIER EXISTE, ET C'EST LE MÊME DÉFAUT QUE CELUI DU TEXTE. Le type d'un port dit le
// TRANSPORT ; il arrive qu'il ne dise pas assez. Relevé sur le registre : vingt-six ports portent le
// type `controle`, et ils transportent CINQ choses différentes — une durée, une liste de zones, un
// tempo, un profil de bruit. Brancher un tempo sur une entrée de zones était licite, aux couleurs
// accordées, et rendait un refus à l'exécution.
//
// LE RELEVÉ, PORT PAR PORT, qui a décidé des quatre contenus :
//
//   zones    5 sorties, 9 entrees   « Zones » et « Zone », qui vont ensemble
//   duree    7 sorties, 1 entree    « Duree »
//   tempo    1 sortie,  2 entrees   « Tempo »
//   profil   1 sortie,  1 entree    « Profil »
//
// « ZONE » ET « ZONES » SONT UN SEUL CONTENU, et ce n'est pas une simplification : `reinserer-zone`
// écrit lui-même qu'il accepte l'un ou l'autre, « le sélecteur multi-zones et Extraire zones
// émettent un tableau sur un port de type contrôle ». Les séparer refuserait un câble que le
// composant sait faire.
//
// LES FORMES SONT CELLES QU'ON A LUES CHEZ LEURS CONSOMMATEURS, non celles qu'on imaginait : une
// zone est `{ debut, duree }` et non `{ debut, fin }`, ce que `zonesValides` vérifie dans
// `plugins/montage.ts` ; un profil est un `Float32Array`, ce que `reduction-bruit` vérifie par
// `instanceof`. Deviner l'une des deux aurait fabriqué une valeur d'essai que personne n'accepte.

/** Les contenus qu'un port « contrôle » peut déclarer, avec leur nom à l'écran. */
export const CONTENUS_CONTROLE: Record<string, { nom: string; nomEn: string }> = {
  zones: { nom: "Zones", nomEn: "Zones" },
  duree: { nom: "Durée", nomEn: "Duration" },
  tempo: { nom: "Tempo", nomEn: "Tempo" },
  profil: { nom: "Profil", nomEn: "Profile" },
};

/**
 * Deux contenus de contrôle vont-ils ensemble ?
 *
 * UN CONTENU ABSENT PASSE PARTOUT, et c'est la règle du texte, pour la même raison : des ports de
 * contrôle existent qui ne déclarent rien, et les refuser couperait des chaînes justes par dizaines.
 * Seuls deux contenus DÉCLARÉS et DIFFÉRENTS se refusent.
 */
export function contenusControleCompatibles(
  source: string | undefined, cible: string | undefined,
): boolean {
  return !source || !cible || source === cible;
}
