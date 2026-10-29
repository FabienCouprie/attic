// ui/fenetres-partagees.ts — Ce qu'une fenêtre demande aux autres : « employez-vous ce méta ? ».
//
// ═══ LA RÈGLE, DÉCIDÉE PAR FABIEN LE 2026-10-29 : REFUSER ═══
//
// Supprimer un méta-composant du catalogue le retire de TOUTES les fenêtres, puisque la
// bibliothèque est partagée. Une autre fenêtre qui l'emploie dans son graphe se retrouverait avec
// des nœuds sous un identifiant brut, sans un port : c'est ce qu'on a mesuré à la relance quand la
// bibliothèque perdait un méta. La suppression est donc refusée tant qu'une autre fenêtre l'emploie.
//
// ═══ POURQUOI UNE QUESTION, ET NON UN ÉTAT PUBLIÉ ═══
//
// Chaque fenêtre pourrait écrire dans `localStorage` la liste des métas qu'elle emploie. Mais une
// fenêtre qui plante ne l'efface jamais, et son entrée refuserait ensuite la suppression pour
// toujours. Une question n'obtient de réponse que des fenêtres vivantes. `BroadcastChannel` la porte
// à toutes les fenêtres de la même origine, en Electron comme en mode web.
//
// LE DÉLAI EST UN CHOIX, et il est borné par une mesure : voir `DELAI_REPONSE_MS`. Une fenêtre qui
// répondrait trop tard est rattrapée de l'autre côté : `appliquerMetaDistant` garde le méta employé
// et le réécrit, ce qui défait la suppression.

import { identifiantAuHasard } from "./fenetre";

export const CANAL_FENETRES = "attic-fenetres";

/**
 * Combien de temps on attend les réponses.
 *
 * MESURÉ LE 2026-10-29, deux fenêtres Electron sur le build, quarante allers-retours d'un message par
 * `BroadcastChannel` : médiane 0,1 ms, maximum 1 ms. Le délai en est trois cents fois le maximum ; il
 * ne se paie qu'au moment d'une suppression, et c'est ce qui permet de le prendre large.
 */
export const DELAI_REPONSE_MS = 300;

/** L'identifiant de cette page, pour ne pas se répondre à soi-même. */
export const ID_FENETRE = identifiantAuHasard();

interface Question { type: "qui-emploie"; id: string; jeton: string; fenetre: string }
interface Reponse { type: "emploie"; jeton: string; fenetre: string }

/** Ce qu'il faut d'un canal : de quoi l'injecter dans les cas. */
export interface CanalMinimal {
  postMessage(m: unknown): void;
  addEventListener(t: "message", f: (e: MessageEvent) => void): void;
  removeEventListener(t: "message", f: (e: MessageEvent) => void): void;
  close(): void;
}

const canalParDefaut = (): CanalMinimal | null =>
  typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CANAL_FENETRES);

/** Un graphe de fenêtre, réduit à ce qui dit l'emploi d'une fiche. */
type Vue = { data?: { ficheId?: unknown } }[] | null | undefined;

/**
 * Cette fenêtre emploie-t-elle le méta `id` ?
 *
 * TROIS ENDROITS, et le premier seul ne suffit pas : le graphe affiché, le graphe racine mis de côté
 * quand on est entré dans un méta, et la pile de navigation elle-même — on peut être en train
 * d'éditer l'intérieur du méta qu'une autre fenêtre veut supprimer.
 */
export function metaEmploye(id: string, vues: Vue[], pile: { metaId: string }[]): boolean {
  if (pile.some((p) => p.metaId === id)) return true;
  return vues.some((v) => (v ?? []).some((n) => n?.data?.ficheId === id));
}

/**
 * Demande aux autres fenêtres si elles emploient le méta. Rend le nombre de celles qui répondent oui.
 *
 * Sans `BroadcastChannel`, il n'y a pas d'autre fenêtre à qui parler : la réponse est zéro.
 */
export function demanderEmploi(id: string, o: {
  canal?: () => CanalMinimal | null; delaiMs?: number; differer?: (f: () => void, ms: number) => void; fenetre?: string;
} = {}): Promise<number> {
  const canal = (o.canal ?? canalParDefaut)();
  if (!canal) return Promise.resolve(0);
  const jeton = identifiantAuHasard();
  const qui = new Set<string>();
  const surMessage = (e: MessageEvent) => {
    const r = e.data as Reponse;
    if (r?.type === "emploie" && r.jeton === jeton) qui.add(r.fenetre);
  };
  canal.addEventListener("message", surMessage);
  canal.postMessage({ type: "qui-emploie", id, jeton, fenetre: o.fenetre ?? ID_FENETRE } satisfies Question);
  return new Promise((rendre) => {
    (o.differer ?? ((f, ms) => setTimeout(f, ms)))(() => {
      canal.removeEventListener("message", surMessage);
      canal.close();
      rendre(qui.size);
    }, o.delaiMs ?? DELAI_REPONSE_MS);
  });
}

/** Répond aux questions des autres fenêtres. Rend de quoi cesser d'écouter. */
export function repondreEmploi(estEmploye: (id: string) => boolean, o: {
  canal?: () => CanalMinimal | null; fenetre?: string;
} = {}): () => void {
  const canal = (o.canal ?? canalParDefaut)();
  if (!canal) return () => {};
  const moi = o.fenetre ?? ID_FENETRE;
  const surMessage = (e: MessageEvent) => {
    const q = e.data as Question;
    if (q?.type !== "qui-emploie" || q.fenetre === moi) return;
    if (estEmploye(q.id)) canal.postMessage({ type: "emploie", jeton: q.jeton, fenetre: moi } satisfies Reponse);
  };
  canal.addEventListener("message", surMessage);
  return () => { canal.removeEventListener("message", surMessage); canal.close(); };
}
