// plugins/progression-pont.ts — L'avancement d'un moteur externe, relayé sur le nœud.
//
// ═══ UNE RÉGRESSION QUE J'AI INTRODUITE, ET QUI SE RÉPARE ICI ═══
//
// Le 2026-10-26, `onProgress` s'est mis à LEVER après un arrêt demandé : c'est ce qui rend 74
// exécuteurs interruptibles d'un seul geste. Mais onze nœuds du pont ne relaient pas l'avancement
// depuis leur propre code — ils l'abonnent à un canal IPC, et le rappel tourne donc DANS UN
// ÉCOUTEUR `ipcRenderer.on`.
//
// UNE EXCEPTION Y PART À CÔTÉ DE LA PROMESSE QUE LE COMPOSANT ATTEND. Elle ne la rejette pas : le
// processus principal continue de calculer, le nœud continue d'attendre, et l'exception remonte en
// erreur non rattrapée — une fois par ligne d'avancement. Avant mon lot, l'appel était ignoré en
// silence. J'avais donc troqué un silence contre du bruit, sans rien arrêter.
//
// ═══ CE QUE CE MODULE FAIT, ET CE QU'IL NE PEUT PAS FAIRE ═══
//
// IL ATTRAPE L'ANNULATION ET SE DÉBRANCHE. Le relais cesse, l'écouteur part, et plus rien ne
// traverse. C'est le silence d'avant, en mieux : on ne laisse pas un abonnement derrière soi.
//
// IL N'ARRÊTE PAS LE TRAVAIL, et il ne le peut pas. Relevé le 2026-10-26 : douze canaux de
// progression, UN SEUL canal d'annulation — celui des téléchargements de modèles —, et aucun
// `.kill(` dans `electron/`. Tant qu'un travail confié au processus principal n'a pas de canal
// pour être arrêté, « Arrêter » ne libère ni la carte graphique ni le tour de l'ordonnanceur. Ce
// qu'il faudrait : un canal d'annulation par travail, le principal qui tue l'enfant et rejette la
// promesse. C'est un chantier, et ce module ne le remplace pas.
//
// ET UNE VRAIE FAUTE RESTE VISIBLE : seule l'annulation est avalée. Une exception d'une autre
// nature remonte, parce qu'une erreur tue dans l'œuf vaut moins qu'une erreur bruyante.
import { estAnnulation } from "../core/annulation";

/** Ce qu'un canal de progression du pont rend : de quoi se débrancher. */
type Debrancher = () => void;

/**
 * Abonne l'avancement d'un moteur externe au `onProgress` du nœud.
 *
 * `pont` est le canal du préchargement — `api()?.chatterboxProgression` et ses pareils. Il est pris
 * en `unknown` pour que les onze appelants l'écrivent sans conversion : leurs types viennent tous
 * de `window.api`, qui n'en a pas.
 */
export function relayerProgression(ctx: { onProgress?: (m: string) => void }, pont: unknown): Debrancher {
  const abonner = pont as ((cb: (e: { ligne: string }) => void) => Debrancher) | undefined;
  if (typeof abonner !== "function") return () => { /* hors application : rien à suivre */ };

  // LE DRAPEAU PLUTÔT QUE LA SEULE FONCTION : `debrancher` n'est affectée qu'au retour de
  // l'abonnement, et se fier à elle seule laisserait passer un rappel qui arriverait entre-temps.
  let fini = false;
  let debrancher: Debrancher = () => { fini = true; };
  const arreter = () => { fini = true; debrancher(); };

  debrancher = abonner(({ ligne }) => {
    if (fini) return;
    try {
      ctx.onProgress?.(ligne);
    } catch (e) {
      if (!estAnnulation(e)) throw e;
      arreter();
    }
  });
  return arreter;
}
