// core/nodes-installes.ts — Registre des nodes installés dynamiquement (.zip).
// Persiste en localStorage (manifest + code) et sur disque (assets binaires via Electron).
// Au démarrage, recharge les nodes installés et les enregistre comme plugins.

import type { Registre } from "./registre";
import type { PluginDef, PortDef, ParametreDef, TypeValeur } from "./types";

// DI : l'adaptateur configure le registre au démarrage.
let registre: Registre<TypeValeur, AudioContext> | null = null;
export function configurerRegistreNodes(r: Registre<TypeValeur, AudioContext>): void { registre = r; }

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
      AudioBuffer: (typeof AudioBuffer !== "undefined" ? AudioBuffer : undefined),
      Worker: (typeof Worker !== "undefined" ? Worker : undefined),
      fetch: (typeof fetch !== "undefined" ? fetch : undefined),
      URL: (typeof URL !== "undefined" ? URL : undefined),
      TextEncoder: (typeof TextEncoder !== "undefined" ? TextEncoder : undefined),
      TextDecoder: (typeof TextDecoder !== "undefined" ? TextDecoder : undefined),
      btoa: (typeof btoa !== "undefined" ? btoa : undefined),
      atob: (typeof atob !== "undefined" ? atob : undefined),
      Math, Date, JSON, parseInt, parseFloat, isNaN, console,
    };
    // Sans window — le code installé n'a pas accès au DOM/localStorage
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

  const def: PluginDef = {
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
