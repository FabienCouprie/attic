// plugins/pont-electron.ts — Ce qu'un nœud dit quand le processus principal ne répond pas.
//
// LE CAS, RELEVÉ PAR FABIEN EN EXÉCUTANT « Transcription MIDI » :
//
//   Nœud « transcription-midi » a échoué : Error: Error invoking remote method
//   'muscriptor:transcrire': Error: No handler registered for 'muscriptor:transcrire'
//
// CE QUE CELA VEUT DIRE, ET POURQUOI LE MESSAGE BRUT NE LE DIT PAS. Les deux moitiés du pont ne se
// rechargent pas en même temps. Le préchargement est réexécuté à chaque rechargement de fenêtre,
// donc `window.api` porte bien la fonction et le nœud l'appelle ; `electron/main.cjs`, lui, n'est
// lu qu'au DÉMARRAGE du processus, de sorte que son `ipcMain.handle` n'a jamais tourné dans
// l'instance en cours. Mesuré le 2026-10-19 : l'application avait démarré à 21:37:23 et le fichier
// avait reçu le canal à 21:59:08, vingt-deux minutes plus tard.
//
// LE REMÈDE EST DE QUITTER ET DE RELANCER, et non de recharger la fenêtre, qui ne reprend que le
// préchargement et le rendu. Un utilisateur d'une version installée ne verra jamais cela, le
// processus principal et le préchargement y partant ensemble ; c'est un cas de développement, et
// c'est justement là qu'un message clair fait gagner du temps.
//
// LA RECONNAISSANCE SE FAIT SUR LE TEXTE D'ELECTRON, ET C'EST FRAGILE : il n'y a pas de code
// d'erreur à lire, seulement la phrase « No handler registered for … ». Si elle change de forme, la
// reconnaissance échoue et le message brut repasse, c'est-à-dire exactement ce qui se produisait
// avant. Se tromper ici ne coûte donc rien de plus que de ne rien faire.
import { traduire } from "../i18n";

/** Le texte d'une erreur, quelle qu'en soit la forme. */
export function texteErreur(erreur: unknown): string {
  if (erreur instanceof Error) return erreur.message;
  if (typeof erreur === "string") return erreur;
  return String((erreur as { message?: unknown })?.message ?? erreur);
}

/**
 * Cette erreur dit-elle que le canal n'existe pas dans le processus principal en cours ?
 *
 * Les deux morceaux sont exigés ensemble : la phrase d'Electron ET le nom du canal. Une erreur qui
 * citerait l'un sans l'autre parle d'autre chose.
 */
export function canalAbsent(message: string, canal: string): boolean {
  return message.includes("No handler registered") && message.includes(canal);
}

/**
 * Le message à montrer quand un appel au processus principal échoue.
 *
 * En clair quand on sait reconnaître le cas, brut sinon : un message qu'on ne comprend pas vaut
 * mieux qu'un message rassurant qui se trompe.
 */
export function messageEchecPont(erreur: unknown, canal: string): string {
  const message = texteErreur(erreur);
  return canalAbsent(message, canal) ? traduire("msg.pont.redemarrer") : message;
}
