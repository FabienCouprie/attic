// core/octets.ts — Une taille en octets, dite dans l'unité qu'on annonce.
//
// LE DÉPÔT A PAYÉ CETTE CONFUSION DEUX FOIS, sur la taille de l'installeur, et un faux chiffre y
// a été annoncé deux fois de suite. « Mo » désigne le mégaoctet, un million d'octets ; « Mio »
// désigne le mébioctet, 1 048 576 octets. L'écart est de 4,9 % au mégaoctet et de 7,4 % au
// gigaoctet : assez pour qu'une taille annoncée ne corresponde pas à celle qu'un navigateur ou
// une release affiche, et pas assez pour qu'on s'en aperçoive.
//
// NEUF ENDROITS ÉCRIVAIENT LE MÊME CALCUL, et les neuf divisaient par 1 048 576 en écrivant « Mo » :
// le panneau des modèles, la mémoire du processus, l'export SFZ, l'export vidéo, le cercle filmé,
// l'extrait vidéo, le montage vidéo, la séparation image-son et les sous-titres incrustés. Un
// dixième, le relevé de mémoire vive, divisait par un million — juste, et seul.
//
// LE CHOIX EST DONC CELUI QUE LE LIBELLÉ IMPOSE : puisque le dépôt écrit « Mo », il divise par un
// million. Le relevé de mémoire vive était le seul à ne pas se tromper, et c'est sa convention qui
// est retenue. Dire « Mio » aurait été l'autre réponse juste, mais elle aurait changé le mot sous
// les yeux de l'utilisateur plutôt que de corriger le chiffre.

/** Mille octets, ce que « Ko » désigne. */
export const OCTETS_PAR_KO = 1000;
/** Un million d'octets, ce que « Mo » désigne. */
export const OCTETS_PAR_MO = 1000 * OCTETS_PAR_KO;
/** Un milliard d'octets, ce que « Go » désigne. */
export const OCTETS_PAR_GO = 1000 * OCTETS_PAR_MO;

/** Une taille en mégaoctets, pour les endroits qui mettent eux-mêmes le mot et les décimales. */
export function enMo(octets: number): number {
  return octets / OCTETS_PAR_MO;
}

/**
 * Une taille écrite dans l'unité qui lui va, avec son mot.
 *
 * LE KILOOCTET EST LE PLANCHER, ET JAMAIS ZÉRO : un fichier de deux cents octets annoncé « 0 Ko »
 * passerait pour absent. Le séparateur décimal est la virgule, comme partout ailleurs dans
 * l'interface française.
 */
export function formaterOctets(octets: number): string {
  const mo = octets / OCTETS_PAR_MO;
  if (mo < 1) return `${Math.max(1, Math.round(octets / OCTETS_PAR_KO))} Ko`;
  if (mo < 1000) return `${Math.round(mo)} Mo`;
  return `${(octets / OCTETS_PAR_GO).toFixed(1).replace(".", ",")} Go`;
}
