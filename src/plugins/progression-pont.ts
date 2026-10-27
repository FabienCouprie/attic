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
// ET IL ARRÊTE LE TRAVAIL, depuis le 2026-10-27. Il ne le pouvait pas : douze canaux de
// progression, UN SEUL canal d'annulation — celui des téléchargements de modèles —, et aucun
// `.kill(` dans `electron/`. « Arrêter » ne libérait ni la carte graphique ni le tour de
// l'ordonnanceur. Le canal existe maintenant, et c'est `arret-des-travaux.ts` qui s'y abonne — PAR
// LE SIGNAL ET NON PAR `onProgress`, parce qu'un travail muet pendant deux minutes n'apprendrait
// jamais autrement qu'on l'arrête.
//
// ET UNE VRAIE FAUTE RESTE VISIBLE : seule l'annulation est avalée. Une exception d'une autre
// nature remonte, parce qu'une erreur tue dans l'œuf vaut moins qu'une erreur bruyante.
import { estAnnulation } from "../core/annulation";
import { arreterLesTravauxAuSignal } from "./arret-des-travaux";

/** Ce qu'un canal de progression du pont rend : de quoi se débrancher. */
type Debrancher = () => void;

/**
 * Ce que le relais lit du contexte d'exécution.
 *
 * LE SIGNAL EST DANS LE CONTRAT, ET NON TOLÉRÉ PAR STRUCTURE. Les onze nœuds du pont passent leur
 * `ctx` entier, qui en porte un : l'arrêt marchait donc déjà sans que ce type le dise. Mais un
 * appelant qui écrirait `suivre({ onProgress })` avec un littéral aurait perdu l'arrêt EN SILENCE,
 * et c'est la faute que ce nom existe pour rendre visible.
 */
export interface ContexteDeRelais {
  onProgress?: (m: string) => void;
  signal?: AbortSignal;
}

/**
 * Abonne l'avancement d'un moteur externe au `onProgress` du nœud.
 *
 * `pont` est le canal du préchargement — `api()?.chatterboxProgression` et ses pareils. Il est pris
 * en `unknown` pour que les onze appelants l'écrivent sans conversion : leurs types viennent tous
 * de `window.api`, qui n'en a pas.
 *
 * ET L'ARRÊT PASSE PAR ICI AUSSI, sans que les onze appelants changent d'une ligne : ils passent
 * tous leur `ctx` entier, qui porte le signal. C'était la raison de leur donner un relais commun.
 */
export function relayerProgression(ctx: ContexteDeRelais, pont: unknown): Debrancher {
  const abonner = pont as ((cb: (e: { ligne: string }) => void) => Debrancher) | undefined;
  // L'ABONNEMENT À L'ARRÊT EST PRIS MÊME HORS APPLICATION, et avant de regarder le canal : un
  // moteur externe peut tourner sans canal d'avancement, et il faut pouvoir le tuer quand même.
  const lacherLesTravaux = arreterLesTravauxAuSignal(ctx.signal);
  if (typeof abonner !== "function") return lacherLesTravaux;

  // LE DRAPEAU PLUTÔT QUE LA SEULE FONCTION : `debrancher` n'est affectée qu'au retour de
  // l'abonnement, et se fier à elle seule laisserait passer un rappel qui arriverait entre-temps.
  let fini = false;
  let debrancher: Debrancher = () => { fini = true; };
  const arreter = () => { fini = true; debrancher(); lacherLesTravaux(); };

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
