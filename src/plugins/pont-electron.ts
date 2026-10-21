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

/**
 * Un chemin dans le répertoire de travail, ou un refus.
 *
 * ÉCRIT D'UN DÉBRIS TROUVÉ DANS LE DÉPÔT, le 2026-10-21 : un dossier nommé `[object Promise]` à la
 * racine, portant neuf fichiers de zéro octet — `python_input_*.wav` et `python_output_*.mid` —
 * datés du 8 octobre. `obtenirRepertoireTravail` est un `ipcRenderer.invoke`, donc une promesse ;
 * employée sans `await`, elle s'interpole en cette chaîne, et le nœud ÉCRIT dans un dossier au nom
 * absurde au lieu d'échouer. Les deux nœuds de script s'en gardaient déjà, chacun de son côté et
 * sans mot commun ; les six autres nœuds qui écrivent dans ce répertoire ne s'en gardaient pas.
 *
 * ET LE DÉBRIS ÉTAIT INVISIBLE, ce qui est la moitié du défaut. `git status` ne le rapportait pas,
 * et la raison est la plus simple : ces neuf fichiers étaient SUIVIS, ajoutés par le commit initial
 * `e677234`, et un fichier suivi que personne ne modifie n'apparaît nulle part. Ni dans `git status`,
 * ni dans `git ls-files --others`, où je les ai cherchés en vain avant de penser à `git ls-files`
 * tout court. Les crochets du nom n'y étaient pour rien — un dossier d'essai `[essai crochets]` est
 * bien rapporté — et aucune règle d'exclusion ne les visait. Le dossier a donc vécu dans le dépôt
 * depuis le premier jour, et la faute qui l'a créé est antérieure à son historique.
 *
 * LE REFUS PORTE SUR LA FORME, non sur la chaîne « [object Promise] ». `undefined` donnerait
 * `undefined/sortie.wav`, `null` donnerait `null/sortie.wav`, et une chaîne vide écrirait à la
 * racine du processus : un seul garde pour les quatre, puisque la faute est une seule — un chemin
 * fabriqué à partir de ce qui n'est pas un chemin.
 */
export function cheminDansTravail(base: unknown, nom: string):
  { ok: true; chemin: string } | { ok: false; message: string } {
  const estPromesse = typeof base === "object" && base !== null
    && typeof (base as { then?: unknown }).then === "function";
  if (estPromesse) return { ok: false, message: traduire("msg.travail.promesse") };
  if (typeof base !== "string") return { ok: false, message: traduire("msg.travail.absent") };
  // La barre finale est retirée pour que le chemin rendu n'en porte jamais deux : le répertoire
  // vient d'un dialogue système, qui en met une sous Windows et pas sous les autres.
  const propre = base.trim().replace(/[\\/]+$/, "");
  if (!propre) return { ok: false, message: traduire("msg.travail.absent") };
  return { ok: true, chemin: `${propre}/${nom}` };
}
