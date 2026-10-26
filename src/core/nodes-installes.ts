// core/nodes-installes.ts — Registre des nodes installés dynamiquement (.zip).
// Persiste en localStorage (manifest + code) et sur disque (assets binaires via Electron).
// Au démarrage, recharge les nodes installés et les enregistre comme plugins.

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
}

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

// Enregistrer un node installé comme plugin dynamique
function enregistrerNodeDynamique(node: NodeInstalle): void {
  const m = node.manifest;
  console.log(`[attic] Installation du node « ${m.id} »…`);
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
    // CE QU'IL FAUDRAIT : évaluer ce code dans un Worker sans accès au pont, donner des capacités à
    // l'IPC — un chemin ne serait valide que venu d'un dialogue ou d'un dossier déclaré — et
    // demander une confirmation avant la première exécution d'un fichier reçu.
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
    return;
  }

  if (typeof fn !== "function") {
    console.error(`[attic] Node « ${m.id} » : module.exports n'est pas une fonction (type=${typeof fn})`);
    return;
  }

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
    executer: fn,
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
