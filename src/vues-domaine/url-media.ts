// ui/url-media.ts — L'adresse d'un fichier du disque pour un élément vidéo.
//
// POURQUOI CE CALCUL EXISTE DEUX FOIS. Le processus principal le fait à l'envers, dans
// `electron/plage-media.cjs`, pour retrouver le chemin que l'adresse porte. Le partager depuis la
// fenêtre demanderait au préchargement de requérir ce fichier, ce que le bac à sable interdit : une
// telle ligne fait échouer tout le préchargement, donc `window.api`, donc l'application entière.
// Les deux moitiés sont donc écrites séparément, et `url-media.test.ts` refuse qu'elles dérivent.

export const SCHEMA_MEDIA = "attic-fichier";

/**
 * L'adresse de notre schéma pour un chemin absolu du disque.
 *
 * Les séparateurs de Windows sont retournés, une adresse n'en connaissant qu'un ; l'encodage porte
 * sur le chemin entier, faute de quoi un espace, un accent, un dièse ou un point d'interrogation
 * dans un nom de film découperait l'adresse ailleurs qu'il ne faut.
 */
export function urlMedia(chemin: string): string {
  const droit = String(chemin ?? "").replace(/\\/g, "/");
  return `${SCHEMA_MEDIA}://f/${encodeURI(droit).replace(/#/g, "%23").replace(/\?/g, "%3F")}`;
}
