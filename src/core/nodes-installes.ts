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
 * Évalue le code d'un nœud installé, et rend sa fonction. Appelé AU PREMIER RUN, jamais avant.
 *
 * ON NE PEUT PAS ÉVALUER PLUS TARD QUE CELA : le code est ce que le nœud fait, et il faut bien
 * l'avoir pour le faire. Ce qu'on a gagné est que le moment soit CHOISI — un nœud qu'on ne lance
 * pas ne s'évalue pas, et aucun ne s'évalue au démarrage.
 */
function evaluerLeCode(node: NodeInstalle): ((ctx: unknown) => unknown) | string {
  const m = node.manifest;
  let fn: any;
  try {
    const moduleObj = { exports: null as any };
    const atticCtx = {
      // CE QUE LE DOMAINE PRÊTE À UN NODE INSTALLÉ, et c'est à lui de le dire : `AudioBuffer`
      // figurait ici en dur, c'est-à-dire le domaine audio nommé dans le cœur. Un node installé est
      // du code du domaine ; ce qu'il lui faut sous la main l'est aussi.
      ...servicesDomaine().globalesInstallees,
      // Ce qui suit vient du langage et des API du navigateur, sans DOM ni stockage.
      Worker: (typeof Worker !== "undefined" ? Worker : undefined),
      fetch: (typeof fetch !== "undefined" ? fetch : undefined),
      URL: (typeof URL !== "undefined" ? URL : undefined),
      TextEncoder: (typeof TextEncoder !== "undefined" ? TextEncoder : undefined),
      TextDecoder: (typeof TextDecoder !== "undefined" ? TextDecoder : undefined),
      btoa: (typeof btoa !== "undefined" ? btoa : undefined),
      atob: (typeof atob !== "undefined" ? atob : undefined),
      Math, Date, JSON, parseInt, parseFloat, isNaN, console,
    };
    // ATTENTION : CE CODE N'EST PAS DANS UN BAC À SABLE, et le commentaire qui était ici disait le
    // contraire — « Sans window — le code installé n'a pas accès au DOM/localStorage ». C'était faux,
    // et un commentaire faux sur une propriété de sécurité est pire que pas de commentaire : il
    // arrête celui qui serait venu regarder.
    //
    // `new Function` NE CRÉE AUCUNE ISOLATION. Seuls ses paramètres — `module`, `exports`, `attic` —
    // masquent les noms correspondants ; le corps s'exécute dans la portée GLOBALE. `window`,
    // `globalThis`, `document`, `localStorage` et `window.api` y sont tous joignables. La table
    // `atticCtx` ci-dessus est une COMMODITÉ, pas une barrière : elle met des outils sous la main,
    // elle n'en retire aucun.
    //
    // CE QUE CELA VAUT, mesuré le 2026-10-25 : le pont expose `fichier:ecrire`, qui écrit à
    // n'importe quel chemin sans validation, et `fichier:ouvrir-chemin`. « Écrire un script puis
    // l'ouvrir » était un enchaînement complet à partir d'un fichier reçu. `electron/chemin-sur.cjs`
    // en coupe désormais le dernier maillon en refusant d'ouvrir un exécutable — mais cela NE FERME
    // PAS le trou : l'écriture reste sans bornes, et un nœud installé garde l'accès au pont.
    //
    // CE QU'IL FAUDRAIT ENCORE : évaluer ce code dans un Worker sans accès au pont, et donner des
    // capacités à l'IPC — un chemin ne serait valide que venu d'un dialogue ou d'un dossier
    // déclaré. Le consentement et l'évaluation paresseuse, livrés le 2026-10-27, retirent
    // l'exécution AUTOMATIQUE ; ils ne remplacent pas ce travail-là.
    const wrappedFn = new Function("module", "exports", "attic", `
      "use strict";
      ${node.executerCode}
    `);
    wrappedFn(moduleObj, moduleObj.exports, atticCtx);
    fn = moduleObj.exports;
    console.log(`[attic] Node « ${m.id} » : code évalué, typeof fn = ${typeof fn}`);
  } catch (err) {
    console.error(`[attic] Node « ${m.id} » : ERREUR évaluation code`, err);
    console.error(`[attic] Code (100 premiers chars):`, node.executerCode.substring(0, 100));
    return `Le code du composant « ${m.id} » n'a pas pu être évalué : ${String((err as Error)?.message ?? err)}`;
  }

  if (typeof fn !== "function") {
    console.error(`[attic] Node « ${m.id} » : module.exports n'est pas une fonction (type=${typeof fn})`);
    return `Le composant « ${m.id} » n'exporte pas une fonction (${typeof fn}).`;
  }
  return fn as (ctx: unknown) => unknown;
}

/**
 * L'exécuteur d'un nœud installé : il demande le consentement, puis évalue UNE FOIS.
 *
 * LE REFUS EST UN RÉSULTAT, PAS UNE EXCEPTION. Un nœud sans consentement n'est pas en panne : il
 * attend une décision, et le dire dans son message est la seule façon que la personne l'apprenne.
 */
function executeurParesseux(node: NodeInstalle): (ctx: unknown) => unknown {
  let fn: ((ctx: unknown) => unknown) | null = null;
  let refus: string | null = null;
  return (ctx: unknown) => {
    if (!node.consenti) return { valeurs: [], erreur: true, message: SANS_CONSENTEMENT };
    if (!fn && !refus) {
      const issue = evaluerLeCode(node);
      if (typeof issue === "string") refus = issue; else fn = issue;
    }
    if (refus) return { valeurs: [], erreur: true, message: refus };
    return fn!(ctx);
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
