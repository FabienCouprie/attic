// core/nodes-installes.ts — Registre des nodes installés dynamiquement (.zip).
// Persiste en localStorage (manifest + code) et sur disque (assets binaires via Electron).
// Au démarrage, recharge les nodes installés et les enregistre comme plugins.
//
// ═══ DEUX CHANGEMENTS DU 2026-10-27, ET CE QU'ILS FERMENT ═══
//
// Relevé par une revue critique : « un nœud .zip s'exécute toujours dès son import, par
// `new Function`, dans le contexte principal ». Vrai, et PIRE QUE CELA : `chargerNodesInstalles()`
// est appelé au chargement du module par `ui/App.tsx`, avant même que React ne rende. Le code d'un
// nœud installé tournait donc À CHAQUE LANCEMENT, sans aucune action de personne.
//
//   1. PLUS RIEN NE S'ÉVALUE AU DÉMARRAGE. Une fiche se déclare par son manifeste — nom, ports,
//      réglages —, et le CODE n'est nécessaire qu'à l'exécution. Il n'est donc évalué qu'au premier
//      run du nœud, une seule fois. Un nœud installé qu'on ne lance jamais ne tourne jamais.
//   2. ET IL FAUT UN CONSENTEMENT ÉCRIT. Un nœud reçu s'exécute avec les droits de celui qui
//      l'ouvre ; il ne peut pas le faire sans qu'on le lui ait accordé. L'autorisation se donne au
//      moment de l'import, par un réglage déclaré du Gestionnaire de composants, et voyage avec le
//      nœud. Les nœuds installés AVANT ce lot n'en ont pas : ils se déclarent, et refusent de
//      tourner tant qu'on ne les a pas réimportés.
//
// ═══ CE QUE CELA NE FAIT PAS, ET IL FAUT LE DIRE ═══
//
// AUCUNE ISOLATION N'EST AJOUTÉE. Une fois le consentement donné et le nœud lancé, son code tourne
// toujours dans la portée globale du rendu, avec `window`, `localStorage` et `window.api` à portée
// — `core/node-essai.test.ts` le MESURE, et continuera de le mesurer. Le `unsafe-eval` de la CSP
// existe pour ce `new Function` et ne tombera qu'avec lui.
//
// CE QUI RESTE À FAIRE est donc entier : évaluer ce code dans un Worker sans accès au pont, et
// donner des capacités à l'IPC. Ce lot ne le remplace pas ; il retire seulement l'exécution
// automatique, qui n'avait demandé l'avis de personne.

import type { Registre } from "./registre";
import { servicesDomaine } from "./services-domaine";
import type { PluginDef, PortDef, ParametreDef } from "./types";

// DI : l'adaptateur configure le registre au démarrage.
let registre: Registre<unknown, unknown> | null = null;
export function configurerRegistreNodes(r: Registre<unknown, unknown>): void { registre = r; }

const CLE = "attic-nodes-installes";

interface NodeInstalle {
  manifest: {
    id: string;
    nom: string;
    nomEn?: string;
    univers: string;
    famille: string;
    resume: string;
    resumeEn?: string;
    entrees: PortDef[];
    sorties: PortDef[];
    parametres: ParametreDef[];
    dependencies?: string[];
  };
  executerCode: string;
  notice?: { fr: string; en: string };
  noticeText?: string;
  noticeTextEn?: string;
  /**
   * La date à laquelle on a accordé à ce nœud de s'exécuter avec nos droits.
   *
   * ABSENTE, LE NŒUD NE TOURNE PAS. C'est la seule forme qui distingue un nœud installé avant ce
   * lot d'un nœud autorisé : un drapeau booléen par défaut faux aurait dit la même chose, une date
   * dit EN PLUS quand on l'a accordé, ce qu'on veut savoir en relisant un poste.
   */
  consenti?: string;
}

/** Le refus qu'un nœud sans consentement rend, dans les deux langues. */
const SANS_CONSENTEMENT = "Ce composant installé n'a pas reçu l'autorisation de s'exécuter. "
  + "Le réimporter en mettant « Exécution » sur « Autoriser ». — This installed component has not "
  + "been authorised to run. Re-import it with « Execution » set to « Authorise ».";

/** Le refus quand aucun bac n'est posé : on ne retombe PAS sur une évaluation sans barrière. */
const SANS_BAC = "Aucun cadre isolé n'est disponible pour exécuter ce composant installé. "
  + "— No isolated frame is available to run this installed component.";

/**
 * Le cadre isolé où le code d'un nœud installé s'exécute.
 *
 * ═══ IL EST INJECTÉ, ET SON ABSENCE REFUSE ═══
 *
 * Le cœur ne sait pas fabriquer un cadre : cela demande le DOM, qui est à l'interface. Elle le
 * pose au démarrage, comme elle pose le registre.
 *
 * ET SANS LUI, RIEN NE TOURNE. Retomber sur une évaluation dans la page serait défaire ce que ce
 * cadre existe pour faire : un repli silencieux vers l'absence de barrière est la forme la plus
 * commune des barrières qui ne protègent rien.
 */
export interface BacDExecution {
  executer(
    cleNoeud: string,
    code: string,
    contexte: Record<string, unknown>,
    surProgres: (m: string) => void,
    signal?: AbortSignal,
    transferables?: ArrayBuffer[],
  ): Promise<Record<string, unknown>>;
}

let bac: BacDExecution | null = null;
export function configurerBacDExecution(b: BacDExecution | null): void { bac = b; }

// Stockage en mémoire
const nodesInstalles = new Map<string, NodeInstalle>();

// Sauvegarder en localStorage
function sauvegarder(): void {
  try {
    const liste: NodeInstalle[] = [...nodesInstalles.values()];
    localStorage.setItem(CLE, JSON.stringify(liste));
  } catch {}
}

// Charger depuis localStorage
export function chargerNodesInstalles(): number {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return 0;
    const liste: NodeInstalle[] = JSON.parse(brut);
    if (!Array.isArray(liste)) return 0;
    let n = 0;
    for (const node of liste) {
      if (node?.manifest?.id && node?.executerCode) {
        nodesInstalles.set(node.manifest.id, node);
        enregistrerNodeDynamique(node);
        n++;
      }
    }
    return n;
  } catch { return 0; }
}


/**
 * L'exécuteur d'un nœud installé : il demande le consentement, puis évalue UNE FOIS.
 *
 * LE REFUS EST UN RÉSULTAT, PAS UNE EXCEPTION. Un nœud sans consentement n'est pas en panne : il
 * attend une décision, et le dire dans son message est la seule façon que la personne l'apprenne.
 */
/** Ce que l'exécuteur reçoit du moteur, réduit à ce que la frontière sait transporter. */
interface ContexteMoteur {
  noeud?: { id?: string; data?: Record<string, unknown> };
  repertoireTravail?: string;
  entrees?: () => unknown[];
  sortieBranchee?: (i: number) => boolean;
  onProgress?: (m: string) => void;
  signal?: AbortSignal;
}

/**
 * Met le contexte du moteur en forme pour la frontière du cadre.
 *
 * CE QUI NE TRAVERSE PAS SE DIT, et c'est le domaine qui en juge : une entrée qu'il refuse rend un
 * message nommant son type, au lieu de laisser le cadre échouer sur un clonage sans raison.
 */
function versLeBac(node: NodeInstalle, ctx: ContexteMoteur):
  | { ok: true; contexte: Record<string, unknown>; transferables: ArrayBuffer[] }
  | { ok: false; message: string } {
  const d = servicesDomaine();
  const entrees: unknown[] = [];
  // UN ENSEMBLE ET NON UNE LISTE : `postMessage` refuse une mémoire nommée deux fois.
  const transferables = new Set<ArrayBuffer>();
  for (const [i, v] of (ctx.entrees?.() ?? []).entries()) {
    const t = d.versTransport(v);
    if (!t.ok) {
      return { ok: false, message: `L'entrée ${i + 1} est un « ${t.pourquoi} », qui ne peut pas traverser la frontière du cadre isolé.` };
    }
    entrees.push(t.valeur);
    for (const m of t.transferables ?? []) transferables.add(m);
  }
  return {
    ok: true,
    transferables: [...transferables],
    contexte: {
      noeud: { id: ctx.noeud?.id ?? node.manifest.id, data: ctx.noeud?.data ?? {} },
      repertoireTravail: ctx.repertoireTravail ?? "",
      parametres: (ctx.noeud?.data?.parametres as Record<string, unknown>) ?? {},
      entrees,
      sortiesBranchees: node.manifest.sorties.map((_, i) => ctx.sortieBranchee?.(i) ?? true),
      reglagesDeProjet: d.reglagesDeProjet(),
    },
  };
}

/**
 * L'exécuteur d'un nœud installé : consentement, puis exécution DANS LE CADRE.
 *
 * LE REFUS EST UN RÉSULTAT, PAS UNE EXCEPTION. Un nœud sans consentement n'est pas en panne : il
 * attend une décision, et le dire dans son message est la seule façon que la personne l'apprenne.
 */
function executeurParesseux(node: NodeInstalle): (ctx: unknown) => unknown {
  return async (brut: unknown) => {
    if (!node.consenti) return { valeurs: [], erreur: true, message: SANS_CONSENTEMENT };
    if (!bac) return { valeurs: [], erreur: true, message: SANS_BAC };

    const ctx = (brut ?? {}) as ContexteMoteur;
    const mise = versLeBac(node, ctx);
    if (!mise.ok) return { valeurs: [], erreur: true, message: mise.message };

    try {
      const rendu = await bac.executer(
        node.manifest.id, node.executerCode, mise.contexte,
        (m) => ctx.onProgress?.(m), ctx.signal, mise.transferables,
      );
      const d = servicesDomaine();
      const valeurs = Array.isArray(rendu.valeurs) ? rendu.valeurs.map((v) => d.depuisTransport(v)) : [];
      return { ...rendu, valeurs };
    } catch (e) {
      return { valeurs: [], erreur: true, message: String((e as Error)?.message ?? e) };
    }
  };
}

// Enregistrer un node installé comme plugin dynamique
function enregistrerNodeDynamique(node: NodeInstalle): void {
  const m = node.manifest;
  console.log(`[attic] Déclaration du node « ${m.id} »…`);
  const def: PluginDef<unknown, unknown> = {
    id: m.id,
    nom: m.nom,
    nomEn: m.nomEn,
    univers: m.univers,
    famille: m.famille,
    resume: m.resume,
    resumeEn: m.resumeEn,
    notice: node.noticeText,
    noticeEn: node.noticeTextEn,
    entrees: m.entrees,
    sorties: m.sorties,
    parametres: m.parametres,
    // L'EXÉCUTEUR EST PARESSEUX : la fiche se déclare sans que le code soit lu.
    executer: executeurParesseux(node) as PluginDef<unknown, unknown>["executer"],
  };

  if (!registre) { console.error("[attic] nodes-installes : registre non configuré"); return; }
  registre.enregistrer(def);
  console.log(`[attic] Node « ${m.id} » enregistré dans le registre ✓`);
}

// Installer un nouveau node
export function installerNode(node: NodeInstalle): boolean {
  // Vérifier les dépendances (informationnel — ne bloque pas)
  if (node.manifest.dependencies) {
    for (const dep of node.manifest.dependencies) {
      try {
        if (typeof require !== "undefined" && require.resolve) require.resolve(dep);
        else console.warn(`[attic] Node « ${node.manifest.id} » : dépendance "${dep}" — vérification ignorée (mode navigateur).`);
      } catch { console.warn(`[attic] Node « ${node.manifest.id} » : dépendance manquante "${dep}" — le node peut ne pas fonctionner.`); }
    }
  }
  nodesInstalles.set(node.manifest.id, node);
  enregistrerNodeDynamique(node);
  sauvegarder();
  return true;
}
