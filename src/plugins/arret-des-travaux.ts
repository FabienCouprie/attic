// plugins/arret-des-travaux.ts — « Arrêter » atteint enfin le processus enfant.
//
// ═══ CE QUI MANQUAIT, ET QUE CE MODULE FERME ═══
//
// Relevé le 2026-10-26 : douze canaux de progression, UN SEUL canal d'annulation — celui des
// téléchargements de modèles —, et aucun `.kill(` dans `electron/`. Depuis le 2026-10-26,
// `onProgress` lève après un arrêt demandé, ce qui arrête l'EXÉCUTEUR ; mais le travail, lui,
// continuait dans son processus enfant. Arrêter rendait la main au rendu pendant que la carte
// graphique restait occupée, et l'ordonnanceur attendait la fin du travail abandonné avant de
// lancer le suivant — sur une génération de chanson, plusieurs minutes d'attente invisible.
//
// ═══ LE SIGNAL EST LA SEULE CHOSE QU'ON PUISSE ÉCOUTER ═══
//
// Le nœud ne sait pas qu'on l'arrête : il l'apprend par une exception, et seulement à sa prochaine
// ligne d'avancement. Un nœud qui n'en émet aucune pendant deux minutes ne l'apprend jamais.
// `ctx.signal`, lui, s'abonne : l'arrêt y est connu À L'INSTANT où il est demandé, sans attendre
// que le travail daigne parler.
//
// ET L'ABONNEMENT NE DURE QUE LE TRAVAIL. Un écouteur laissé en place après la fin tuerait le
// travail SUIVANT au premier arrêt demandé, puisque le registre du principal ne distingue pas
// lequel tourne. C'est pourquoi la fonction rend de quoi se débrancher, et que les appelants
// l'appellent dans un `finally`.

/** Ce que rend un abonnement : de quoi le retirer. */
type Debrancher = () => void;

/**
 * Le pont, lu au moment de s'en servir.
 *
 * HORS ELECTRON IL N'Y EN A PAS, et c'est le cas des tests comme celui du navigateur : le module
 * doit alors ne rien faire plutôt que lever.
 */
const pont = () =>
  (globalThis as unknown as { api?: { travauxAnnuler?: () => Promise<unknown> } }).api;

/**
 * Demande au processus principal de tuer ses travaux dès que `signal` s'annule.
 *
 * SANS DISTINGUER LEQUEL, et c'est assumé : l'ordonnanceur sérialise les runs, il n'y a au plus
 * qu'une famille de travaux en vol. Le jour où deux travaux tourneraient vraiment ensemble, c'est
 * un identifiant qu'il faudrait porter, depuis le nœud jusqu'au binaire. Voir
 * `electron/travaux.cjs`, qui porte le registre et la même réserve.
 */
export function arreterLesTravauxAuSignal(signal?: AbortSignal): Debrancher {
  if (!signal) return () => { /* un nœud sans signal ne s'arrête pas : rien à suivre */ };

  // DÉJÀ ANNULÉ À L'ABONNEMENT : le cas se présente quand l'arrêt tombe entre le lancement du
  // travail et l'abonnement. `addEventListener` ne rappellerait jamais — l'événement est passé.
  if (signal.aborted) { void pont()?.travauxAnnuler?.(); return () => {}; }

  const surArret = () => { void pont()?.travauxAnnuler?.(); };
  signal.addEventListener("abort", surArret, { once: true });
  return () => signal.removeEventListener("abort", surArret);
}
