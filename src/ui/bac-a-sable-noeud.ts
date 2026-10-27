// ui/bac-a-sable-noeud.ts — Le cadre isolé où s'exécute le code d'un nœud installé.
//
// ═══ POURQUOI UN CADRE, ET NON UN WORKER ═══
//
// Il fallait retirer le pont à un nœud installé sans lui retirer l'audio. Un Worker ne pouvait pas :
// ni `AudioContext`, ni `OfflineAudioContext`, ni `AudioBuffer` n'y existent, de sorte qu'un nœud
// audio y aurait perdu ce qui fait son office. Un cadre `sandbox="allow-scripts"`, lui, a tout le
// Web Audio et une ORIGINE OPAQUE.
//
// MESURÉ DANS L'APPLICATION AVANT D'ÉCRIRE UNE LIGNE, le 2026-10-27 :
//
//   origine du cadre          « null », opaque
//   `window.api` dedans       `undefined`
//   `window.parent.api`       **SecurityError** — le parent est injoignable
//   `OfflineAudioContext`     `function`, et un oscillateur à 440 Hz y rend 2 205 échantillons
//                             à crête 1,0
//
// Le code d'un nœud s'y évalue, lit ses réglages, fabrique son contexte audio et rend son son ;
// et de l'intérieur, atteindre le pont lève.
//
// ═══ ET LA PAGE DU CADRE A SA PROPRE ADRESSE, DONC SA PROPRE POLITIQUE ═══
//
// Elle était posée par `srcdoc`, et un document `srcdoc` HÉRITE de la politique de son parent :
// ôter `unsafe-eval` au document l'aurait ôté au cadre. Elle vit désormais dans
// `public/cadre-noeud.html`, servie à côté de `index.html`, et `electron/politique-securite.cjs` lui
// réserve la seule politique qui permette `new Function`. Le document, lui, ne l'a plus. Relevé le
// 2026-10-27.

import { configurerBacDExecution } from "../core/nodes-installes";

/** Ce qu'un nœud installé reçoit, une fois traversée la frontière. Que des données. */
export interface ContexteTransporte {
  noeud: { id: string; data: Record<string, unknown> };
  repertoireTravail: string;
  /** Les réglages déjà lus, par nom : le cadre ne peut pas interroger le moteur. */
  parametres: Record<string, unknown>;
  entrees: unknown[];
  sortiesBranchees: boolean[];
  /**
   * Les réglages de projet du domaine, qui remplacent ce que `ctx.runtime` portait.
   *
   * EN BLOC ET SANS LES NOMMER : le cœur ne sait pas ce qu'est une fréquence d'échantillonnage, et
   * ce module non plus. Un nœud audio y lit `frequenceDeTravail` ; un domaine neutre n'y met rien.
   */
  reglagesDeProjet: Record<string, unknown>;
}

export interface BacASable {
  /**
   * Exécute le code d'un nœud dans le cadre, et rend ce qu'il a rendu.
   *
   * `contexte` PORTE LA FORME DE `ContexteTransporte` sans la déclarer : c'est le cœur qui le
   * bâtit, et le cœur ne peut pas importer un type de l'interface — la frontière de domaine le
   * refuse. Ce qui traverse une frontière de message est de la donnée ; le type la documente.
   */
  executer(
    cleNoeud: string,
    code: string,
    contexte: Record<string, unknown>,
    surProgres: (m: string) => void,
    signal?: AbortSignal,
    transferables?: ArrayBuffer[],
  ): Promise<Record<string, unknown>>;
  /** Ferme le cadre d'un nœud. Le suivant en rouvrira un. */
  oublier(cleNoeud: string): void;
}

/**
 * L'adresse de la page du cadre, relative au document : `public/` est servi à la racine en
 * développement, et recopié à côté de `index.html` dans le build.
 */
const PAGE_CADRE = "cadre-noeud.html";

interface EnVol {
  resoudre: (v: Record<string, unknown>) => void;
  rejeter: (e: Error) => void;
  surProgres: (m: string) => void;
}

interface Cadre {
  frame: HTMLIFrameElement;
  pret: Promise<void>;
  pose: Promise<void> | null;
  enVol: Map<number, EnVol>;
}

const cadres = new Map<string, Cadre>();
let compteur = 0;

function ouvrirCadre(cle: string): Cadre {
  const frame = document.createElement("iframe");
  // SANS `allow-same-origin` : c'est ce mot qui donne l'origine opaque, et donc l'impossibilité de
  // remonter au parent. L'ajouter rendrait le bac inutile.
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.style.display = "none";
  frame.src = new URL(PAGE_CADRE, document.baseURI).href;

  const cadre: Cadre = { frame, pret: null as never, pose: null, enVol: new Map() };
  cadre.pret = new Promise<void>((resoudre) => {
    const ecoute = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow) return;
      const d = e.data as { id?: number; type?: string; message?: string; resultat?: Record<string, unknown> };
      if (d?.type === "pret") { resoudre(); return; }
      const vol = d?.id !== undefined ? cadre.enVol.get(d.id) : undefined;
      if (!vol) return;
      if (d.type === "progres") { vol.surProgres(String(d.message ?? "")); return; }
      cadre.enVol.delete(d.id!);
      if (d.type === "erreur") vol.rejeter(new Error(String(d.message ?? "erreur inconnue")));
      else vol.resoudre(d.resultat ?? {});
    };
    window.addEventListener("message", ecoute);
    (frame as unknown as { _ecoute: unknown })._ecoute = ecoute;
  });

  document.body.appendChild(frame);
  cadres.set(cle, cadre);
  return cadre;
}

function poster(
  cadre: Cadre, message: Record<string, unknown>, vol?: EnVol, transferables: ArrayBuffer[] = [],
): Promise<Record<string, unknown>> {
  const id = ++compteur;
  return new Promise((resoudre, rejeter) => {
    cadre.enVol.set(id, vol ?? { resoudre, rejeter, surProgres: () => {} });
    if (vol) { vol.resoudre = resoudre; vol.rejeter = rejeter; }
    // LES MÉMOIRES NOMMÉES SONT TRANSFÉRÉES ET NON CLONÉES. Ce sont celles que le domaine vient de
    // fabriquer pour la traversée, et personne d'autre ne les tient. AU RETOUR, RIEN N'EST
    // TRANSFÉRÉ : le code d'un nœud peut garder ses tableaux d'un run à l'autre, et les détacher
    // les lui viderait.
    cadre.frame.contentWindow?.postMessage({ ...message, id }, "*", transferables);
  });
}

export const BAC_A_SABLE: BacASable = {
  async executer(cleNoeud, code, contexte, surProgres, signal, transferables) {
    const cadre = cadres.get(cleNoeud) ?? ouvrirCadre(cleNoeud);
    await cadre.pret;

    // LE CODE N'EST POSÉ QU'UNE FOIS PAR CADRE, comme `new Function` ne s'évaluait qu'une fois.
    if (!cadre.pose) {
      cadre.pose = poster(cadre, { type: "poser", code }).then(() => undefined);
    }
    await cadre.pose;

    const surArret = () => cadre.frame.contentWindow?.postMessage({ type: "arreter" }, "*");
    signal?.addEventListener("abort", surArret, { once: true });
    try {
      return await poster(cadre, { type: "executer", contexte },
        { resoudre: () => {}, rejeter: () => {}, surProgres }, transferables);
    } finally {
      signal?.removeEventListener("abort", surArret);
    }
  },

  oublier(cleNoeud) {
    const cadre = cadres.get(cleNoeud);
    if (!cadre) return;
    const ecoute = (cadre.frame as unknown as { _ecoute?: EventListener })._ecoute;
    if (ecoute) window.removeEventListener("message", ecoute);
    cadre.frame.remove();
    cadres.delete(cleNoeud);
  },
};

// ═══ LE MODULE SE DÉCLARE LUI-MÊME, ET CE N'EST PAS UNE COMMODITÉ ═══
//
// `ui/App.tsx` est l'un des fichiers EN DETTE de la norme de taille, et la règle du dépôt est sans
// ambiguïté : ce qu'on ajoute à un fichier trop gros va ailleurs. Quatre lignes de branchement y
// auraient été quatre lignes de plus dans le fichier qui doit maigrir ; son garde les a refusées.
// L'appelant n'écrit donc qu'un import, et c'est ce module qui se pose.
configurerBacDExecution(BAC_A_SABLE);

// LA COUTURE QUI PERMET DE MESURER L'ISOLATION. Ce qu'on affirme d'un bac à sable ne vaut que
// mesuré dans un vrai navigateur : jsdom n'a ni origine opaque ni Web Audio. Voir
// `tests-e2e/bac-a-sable-noeud.spec.ts`.
(globalThis as unknown as { __attic_bac__?: unknown }).__attic_bac__ = BAC_A_SABLE;
