// ui/dictee/un-seul-a-la-fois.ts — Un démarrage à la fois, et pourquoi il en fallait un.
//
// LE DÉFAUT QUE CE FICHIER EMPÊCHE, relevé par Fabien : « le contrôle à la voix pose deux
// composants identiques pour un seul énoncé ». Démarrer l'écoute demande de charger le
// modèle, d'ouvrir le micro et de poser un worklet, soit quelques secondes à la première
// fois. L'état « écoute » n'étant posé qu'à la FIN, le bouton paraît inerte pendant tout ce
// temps, et un second clic montait une SECONDE écoute entière, avec son reconnaisseur, son
// micro et son écouteur de résultats. Le même énoncé était alors posé deux fois.
//
// ET LE MICRO RESTAIT OUVERT, ce qui était le pire des deux. Seule la dernière écoute montée
// était rangée dans la référence d'arrêt : les précédentes n'étaient plus jointes à rien, et
// ni leur flux ni leur reconnaisseur n'étaient rendus. Relevé dans l'application, trois clics
// donnaient trois ouvertures de micro et le bouton restait à « non pressé » tout du long.
//
// UN ÉTAT REACT NE SUFFIT PAS, et c'est la raison d'un objet plutôt que d'un `useState` de
// plus : un état n'est lu qu'au rendu suivant, alors que deux clics rapides peuvent tomber
// avant lui. Le verrou se pose donc AVANT le premier `await`, et se relâche quelle que soit
// l'issue, erreur comprise.

export interface Verrou { pris: boolean }

export const verrou = (): Verrou => ({ pris: false });

/**
 * Lance `faire` si rien n'est en cours, et rend ce qu'il a rendu ; sinon rend `undefined`
 * sans rien lancer.
 *
 * L'ÉCHEC RELÂCHE LE VERROU AUTANT QUE LA RÉUSSITE : une permission de micro refusée n'est
 * pas une panne, et il faut pouvoir redemander. L'erreur est relancée telle quelle, l'appelant
 * sachant seul quoi en dire.
 */
export async function unSeulALaFois<T>(v: Verrou, faire: () => Promise<T>): Promise<T | undefined> {
  if (v.pris) return undefined;
  v.pris = true;
  try {
    return await faire();
  } finally {
    v.pris = false;
  }
}
