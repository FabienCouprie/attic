// plugins/garde-worker.ts — Un worker qui meurt doit FAIRE ÉCHOUER les nœuds, pas les faire attendre.
//
// CE QUI ARRIVE SANS CE GARDE-FOU, et c'est arrivé. Les treize workers d'Attic suivent tous le même
// dialogue : le nœud poste une demande, puis attend un message `done` ou `error`. Si le worker meurt
// AVANT de pouvoir répondre — une erreur à l'import, un module introuvable, une exception non
// rattrapée —, il ne poste rien du tout : la promesse du nœud ne se règle ni dans un sens ni dans
// l'autre, et le nœud reste « en cours » indéfiniment. Aucune erreur, aucun message, rien à lire.
// Les sept nœuds Magenta sont restés dans cet état, et la cause était invisible depuis l'interface.
//
// CE QUE FAIT CE MODULE, et pourquoi de cette façon. Il écoute `error` et `messageerror` sur le
// worker, et transforme sa mort en un message `{ type: "error" }` ORDINAIRE, adressé à chaque demande
// encore en vol. Les douze appelants savent déjà traiter ce message — ils en font le message d'erreur
// du nœud, chacun avec sa propre traduction. Rien de leur code de résultat n'a donc besoin de changer,
// ce qui est exactement ce qu'on veut d'une correction posée sur treize endroits à la fois.
//
// Les demandes en vol sont suivies en interceptant `postMessage`, d'où les `requestId` sont lus : les
// appelants filtrent les messages sur cet identifiant, et un message sans le bon `requestId` serait
// ignoré — le garde-fou n'aurait rien gardé.
//
// ═══ CE QUE LE NAVIGATEUR DIT D'UN WORKER MORT, MESURÉ ET NON SUPPOSÉ ═══
//
// Relevé le 2026-10-25 dans Chromium, sur quatre morts différentes, en lisant tous les champs de
// l'événement `error` :
//
//   module, import introuvable ........ RIEN. Ni `message`, ni `filename`, ni `lineno`, ni `error`.
//   classique, importScripts raté ..... « Uncaught SyntaxError: Failed to execute 'importScripts'… »
//   exception à l'exécution, module ... « Uncaught Error: une vraie cause » + fichier + ligne
//   exception à l'exécution, classique  « Uncaught Error: une vraie cause » + fichier + ligne
//
// LE PREMIER CAS EST CELUI D'ATTIC, tous ses workers étant des modules : quand l'un ne se charge
// pas, LE NAVIGATEUR NE DIT RIEN DU TOUT, et la console non plus — vérifié, rien ne s'y ajoute.
// Il n'y a donc aucune cause à rapporter, seulement le FAIT de la mort, et il faut le dire ainsi.
//
// CE QUE CE MODULE FAISAIT, ET C'ÉTAIT LA FAUTE : `e.message || String(e.type ?? "error")`. Faute
// de message, il rapportait le TYPE DE L'ÉVÉNEMENT comme s'il était une cause, et le nœud affichait
// « error » en infobulle — un mot anglais qui ne dit rien, sur un nœud rouge dont on ne savait pas
// pourquoi il l'était. Mesuré sur un graphe de trois nœuds dont le worker du glissando avait reçu un
// import introuvable : « error », et rien d'autre, nulle part.
//
// IL NE PEUT PAS INVENTER LA CAUSE QU'IL N'A PAS. Il dit ce qu'il sait — le worker est mort avant de
// répondre —, et il n'invite pas à regarder la console, puisqu'il est mesuré qu'elle n'en dit pas
// plus. Quand le navigateur donne un message, c'est celui-là qui part, avec son fichier et sa ligne.
import { traduire } from "../i18n";

/** Clé interne pour les appelants qui ne numérotent pas leurs demandes (un worker, une demande). */
const SANS_ID = "\x00sans-id";

/** Fabrique un événement `message`, ou son équivalent minimal hors navigateur (tests). */
function evenementMessage(donnees: unknown): Event {
  if (typeof MessageEvent !== "undefined") return new MessageEvent("message", { data: donnees });
  return { type: "message", data: donnees } as unknown as Event;
}

/**
 * Ce que l'on peut dire de la mort d'un worker, à partir de ce que l'événement porte VRAIMENT.
 *
 * TROIS CHAMPS SONT LUS, ET AUCUN N'EST SUPPOSÉ PRÉSENT. Quand le navigateur donne un message, il
 * part tel quel, suivi du fichier et de la ligne quand il les donne aussi : c'est le cas d'une
 * exception levée dans le worker, et c'est alors la cause exacte. Quand il ne donne rien — un
 * module dont l'import échoue, le cas d'Attic —, on dit le fait de la mort et rien de plus.
 *
 * LE NOM DU FICHIER EST RÉDUIT À SON DERNIER SEGMENT : un `blob:` ou une URL de développement avec
 * ses paramètres de requête occupe toute l'infobulle sans rien apprendre.
 */
export function raisonDeLaMort(e: unknown): string {
  const ev = e as { message?: unknown; filename?: unknown; lineno?: unknown } | null;
  const message = typeof ev?.message === "string" ? ev.message.trim() : "";
  if (!message) return traduire("msg.worker_mort_sans_cause");
  const fichier = typeof ev?.filename === "string" ? ev.filename.split(/[/\\]/).pop() ?? "" : "";
  const ligne = typeof ev?.lineno === "number" && ev.lineno > 0 ? `:${ev.lineno}` : "";
  return fichier ? `${message} (${fichier}${ligne})` : message;
}

/**
 * Ce dont ce module a besoin d'un worker — rien de plus, pour qu'un double suffise en test.
 */
export interface CibleWorker {
  addEventListener(type: string, ecouteur: (e: any) => void): void;
  dispatchEvent(e: Event): boolean;
  postMessage(message: any, transfert?: any): void;
}

/**
 * Installe le garde-fou sur un worker, et le rend.
 *
 * `surMort` est appelé quand le worker meurt : c'est là que l'appelant oublie le worker qu'il garde en
 * cache. Sans cela, un worker mort resterait en cache et FERAIT ATTENDRE PAREILLEMENT toutes les
 * exécutions suivantes — la panne durerait jusqu'au redémarrage de l'application.
 */
export function installerGardeWorker<T extends CibleWorker>(w: T, surMort?: (raison: string) => void): T {
  const enVol = new Set<string>();

  const posterOrigine = w.postMessage.bind(w);
  w.postMessage = (message: any, transfert?: any) => {
    const id = message?.requestId;
    enVol.add(typeof id === "string" && id ? id : SANS_ID);
    return transfert === undefined ? posterOrigine(message) : posterOrigine(message, transfert);
  };

  // Une demande terminée n'est plus en vol : sans cela, la mort du worker enverrait aussi des erreurs
  // à des demandes déjà réglées. Elles seraient sans effet — l'écouteur est retiré —, mais un
  // ensemble qui ne se vide jamais finit par mentir sur ce qui est réellement en cours.
  w.addEventListener("message", (e: any) => {
    const donnees = e?.data;
    if (!donnees || donnees.type === "progress") return;
    const id = donnees.requestId;
    enVol.delete(typeof id === "string" && id ? id : SANS_ID);
  });

  const mourir = (raison: string) => {
    const demandes = [...enVol];
    enVol.clear();
    for (const id of demandes) {
      w.dispatchEvent(evenementMessage({
        requestId: id === SANS_ID ? undefined : id,
        type: "error",
        // `msg` pour les douze appelants, `error` pour Sherpa qui lit cet autre nom : le garde-fou
        // ne doit pas dépendre du vocabulaire de celui qu'il protège.
        msg: raison,
        error: raison,
      }));
    }
    surMort?.(raison);
  };

  w.addEventListener("error", (e: any) => {
    mourir(raisonDeLaMort(e));
  });
  w.addEventListener("messageerror", () => {
    mourir(traduire("msg.worker_message_illisible"));
  });

  return w;
}
