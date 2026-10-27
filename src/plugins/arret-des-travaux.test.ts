// plugins/arret-des-travaux.test.ts — « Arrêter » demande vraiment la mort du processus enfant.
//
// ═══ LE DÉFAUT, RELEVÉ LE 2026-10-26 ═══
//
// Douze canaux de progression, un seul canal d'annulation, aucun `.kill(` dans `electron/`. Le
// nœud s'arrêtait, le binaire continuait : la carte graphique restait occupée et l'ordonnanceur
// attendait la fin d'un travail que personne n'avait plus demandé.
//
// ═══ CE QUE CES CAS TIENNENT ═══
//
// LA MOITIÉ FRAGILE EST LA DURÉE DE L'ABONNEMENT. Un écouteur laissé derrière soi tuerait le
// travail SUIVANT au premier arrêt demandé, puisque le registre du principal ne distingue pas
// lequel tourne — une panne qui n'apparaîtrait qu'au deuxième run, et qu'on imputerait au nœud.
//
// ET LE DERNIER CAS N'ÉPROUVE PAS CE MODULE MAIS SES APPELANTS : il recalcule, depuis
// `electron/`, quels nœuds lancent un travail, et refuse qu'un seul d'entre eux n'ait pas de
// chemin vers l'arrêt. C'est le garde qu'un nœud neuf traversera sans qu'on y pense.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";

import { arreterLesTravauxAuSignal } from "./arret-des-travaux";

const RACINE = resolve(__dirname, "../..");

describe("l'arrêt des travaux", () => {
  let appels = 0;

  beforeEach(() => {
    appels = 0;
    (globalThis as unknown as { api?: unknown }).api = {
      travauxAnnuler: () => { appels += 1; return Promise.resolve({ ok: true, tues: 1 }); },
    };
  });
  afterEach(() => { delete (globalThis as unknown as { api?: unknown }).api; });

  it("NE DEMANDE RIEN TANT QUE RIEN N'EST ARRÊTÉ", () => {
    const c = new AbortController();
    arreterLesTravauxAuSignal(c.signal);
    expect(appels).toBe(0);
  });

  it("DEMANDE LA MORT DÈS QUE LE SIGNAL TOMBE, sans attendre une ligne d'avancement", () => {
    const c = new AbortController();
    arreterLesTravauxAuSignal(c.signal);
    c.abort();
    expect(appels).toBe(1);
  });

  it("ET SUR UN SIGNAL DÉJÀ TOMBÉ, puisque `addEventListener` ne rappellerait jamais", () => {
    const c = new AbortController();
    c.abort();
    arreterLesTravauxAuSignal(c.signal);
    expect(appels, "l'arrêt arrivé avant l'abonnement est perdu").toBe(1);
  });

  it("NE DEMANDE PLUS RIEN APRÈS LE DÉBRANCHEMENT, et c'est la moitié qui peut se tromper", () => {
    const c = new AbortController();
    const lacher = arreterLesTravauxAuSignal(c.signal);
    lacher();
    c.abort();
    expect(appels, "le travail SUIVANT serait tué par cet arrêt-ci").toBe(0);
  });

  it("NE DEMANDE RIEN SANS SIGNAL, et ne lève pas", () => {
    expect(() => arreterLesTravauxAuSignal(undefined)()).not.toThrow();
    expect(appels).toBe(0);
  });

  it("NE LÈVE PAS HORS APPLICATION, où il n'y a pas de pont", () => {
    delete (globalThis as unknown as { api?: unknown }).api;
    const c = new AbortController();
    const lacher = arreterLesTravauxAuSignal(c.signal);
    expect(() => c.abort()).not.toThrow();
    expect(() => lacher()).not.toThrow();
  });

  it("DEMANDE UNE SEULE FOIS, un signal ne tombant qu'une fois", () => {
    const c = new AbortController();
    arreterLesTravauxAuSignal(c.signal);
    c.abort();
    c.abort();
    expect(appels).toBe(1);
  });
});

// ═══ LE GARDE DES APPELANTS ═══
//
// IL RECALCULE LA LISTE PLUTÔT QUE DE LA PORTER. Une liste écrite à la main vieillit en silence :
// c'est l'inverse de ce qu'on veut d'un garde censé rattraper le nœud de demain. La chaîne se
// remonte donc depuis le registre lui-même.

const DOSSIER_ELECTRON = resolve(RACINE, "electron");
const DOSSIER_PLUGINS = resolve(RACINE, "src/plugins");

const lireElectron = (f: string) => readFileSync(resolve(DOSSIER_ELECTRON, f), "utf8");
const cjs = readdirSync(DOSSIER_ELECTRON).filter((f) => f.endsWith(".cjs") && f !== "preload.cjs");

/**
 * Les modules du principal qui mènent à un processus enfant.
 *
 * PAR FERMETURE ET NON PAR LISTE : `travaux.cjs` est pris par quatre modules, et sept autres
 * passent par l'un d'eux — les sept familles d'audio.cpp partagent le lanceur de `muscriptor.cjs`.
 */
function modulesDeTravail(): Set<string> {
  const atteints = new Set<string>(["travaux.cjs"]);
  for (let tour = 0; tour < cjs.length; tour++) {
    let neuf = false;
    for (const f of cjs) {
      if (atteints.has(f)) continue;
      const t = lireElectron(f);
      if ([...atteints].some((a) => t.includes(`require("./${a}")`))) { atteints.add(f); neuf = true; }
    }
    if (!neuf) break;
  }
  atteints.delete("travaux.cjs");
  return atteints;
}

/** Les noms locaux qu'un fichier tire d'un `require` de module de travail. */
function nomsImportes(texte: string, travail: Set<string>): string[] {
  const noms: string[] = [];
  for (const m of texte.matchAll(/const \{([^}]+)\} = require\("\.\/([^"]+)"\)/g)) {
    if (!travail.has(m[2])) continue;
    for (const part of m[1].split(",")) {
      // `a` ou `a: b` — c'est le nom LOCAL qui apparaîtra dans le corps du gestionnaire.
      const nom = part.includes(":") ? part.split(":")[1] : part;
      if (nom.trim()) noms.push(nom.trim());
    }
  }
  return noms;
}

/** Les canaux IPC dont le gestionnaire mène à un enfant. */
function canauxDeTravail(): string[] {
  const travail = modulesDeTravail();
  const trouves = new Set<string>();
  for (const f of cjs) {
    const texte = lireElectron(f);
    const noms = nomsImportes(texte, travail);
    // `python:executer` et `julia:executer` engendrent DANS `main.cjs` : leur gestionnaire ne cite
    // aucun module, mais appelle `execFile` et `inscrireTravail` lui-même.
    const morceaux = texte.split(/ipcMain\.handle\(/).slice(1);
    for (const corps of morceaux) {
      const nom = /^\s*["']([^"']+)["']/.exec(corps)?.[1];
      if (!nom) continue;
      const tete = corps.slice(0, 1800);
      if (noms.some((n) => new RegExp(`\\b${n}\\(`).test(tete)) || /inscrireTravail/.test(tete)) {
        trouves.add(nom);
      }
    }
  }
  return [...trouves].sort();
}

/** Le nom de la méthode du préchargement qui invoque tel canal. */
function methodesDuPont(canaux: string[]): Map<string, string> {
  const preload = lireElectron("preload.cjs");
  const par = new Map<string, string>();
  for (const m of preload.matchAll(/([a-zA-Z0-9_]+): *\([^)]*\) *=> *ipcRenderer\.invoke\("([^"]+)"/g)) {
    if (canaux.includes(m[2])) par.set(m[2], m[1]);
  }
  return par;
}

const plugins = readdirSync(DOSSIER_PLUGINS)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => ({ fichier: f, texte: readFileSync(resolve(DOSSIER_PLUGINS, f), "utf8") }));

/**
 * Les relais exportés par un module de nœud : une fonction exportée qui appelle le relais commun.
 *
 * `chanson-locale.ts` ET `chanson-variantes.ts` PASSENT PAR LÀ, et c'est la raison de ce détour :
 * ils ne citent ni le relais ni l'arrêt, mais appellent `suivre` de `chanson-aides.ts`, qui fait
 * les deux. Un garde qui ne saurait pas franchir ce saut les dénoncerait à tort.
 */
function relaisExportes(): Map<string, string[]> {
  const par = new Map<string, string[]>();
  for (const { fichier, texte } of plugins) {
    const noms: string[] = [];
    for (const m of texte.matchAll(/export function ([a-zA-Z0-9_]+)\(/g)) {
      const apres = texte.slice(m.index ?? 0, (m.index ?? 0) + 400);
      if (/relayerProgression/.test(apres)) noms.push(m[1]);
    }
    if (noms.length) par.set(fichier.replace(/\.ts$/, ""), noms);
  }
  return par;
}

/**
 * Un module arrange-t-il l'arrêt, directement ou par un relais importé ?
 *
 * `relayerProgression` VAUT PREUVE, ET C'EST UNE DETTE QUE LE CAS DU BAS PAIE : treize nœuds s'en
 * contentent, si bien qu'un relais qui cesserait d'arranger l'arrêt les perdrait tous les treize
 * SANS QU'AUCUN CAS NE TOMBE. Je l'ai mesuré en le cassant. C'est pourquoi un cas nommé tient le
 * relais lui-même : c'est là que la chaîne touche le fond, et le seul endroit où elle peut céder
 * en silence.
 */
function arrangeLArret(texte: string, relais: Map<string, string[]>): boolean {
  if (/arreterLesTravauxAuSignal|relayerProgression/.test(texte)) return true;
  for (const [module, noms] of relais) {
    if (!new RegExp(`from "\\./${module}"`).test(texte)) continue;
    if (noms.some((n) => new RegExp(`\\b${n}\\(ctx`).test(texte))) return true;
  }
  return false;
}

describe("les nœuds qui lancent un travail", () => {
  const canaux = canauxDeTravail();
  const methodes = methodesDuPont(canaux);
  const relais = relaisExportes();

  it("SE RETROUVENT, sinon ce garde est vert pour rien", () => {
    // UN GARDE QUI NE TROUVE RIEN EST LE FAUX VERT LE PLUS COURANT DE CE DÉPÔT. Les chiffres sont
    // ceux relevés le 2026-10-27 ; ils peuvent monter, non tomber à zéro sans qu'on le sache.
    expect(canaux.length, `canaux de travail : ${canaux.join(", ")}`).toBeGreaterThanOrEqual(15);
    expect(methodes.size).toBeGreaterThanOrEqual(15);
    expect(relais.size, "aucun relais exporté trouvé").toBeGreaterThanOrEqual(1);
  });

  it("ONT TOUS UN CHEMIN VERS L'ARRÊT, et aucun n'y échappe", () => {
    const sans: string[] = [];
    for (const { fichier, texte } of plugins) {
      const lance = [...methodes.values()].filter((m) => new RegExp(`\\b${m}\\(`).test(texte));
      if (!lance.length) continue;
      if (!arrangeLArret(texte, relais)) sans.push(`${fichier} (${lance.join(", ")})`);
    }
    expect(sans, "ces nœuds lancent un travail que « Arrêter » ne tuerait pas").toEqual([]);
  });

  it("ET LE RELAIS COMMUN ARRANGE L'ARRÊT, puisque treize d'entre eux s'en contentent", () => {
    // SANS CE CAS, LE GARDE DU DESSUS EST CREUX POUR TREIZE NŒUDS SUR SEIZE : il accepte
    // `relayerProgression` comme preuve, et ne regarde pas si le relais tient sa part. Mesuré en
    // vidant `arreterLesTravauxAuSignal` de `progression-pont.ts` : les dix cas restaient verts.
    const relaisCommun = plugins.find(({ fichier }) => fichier === "progression-pont.ts");
    expect(relaisCommun, "progression-pont.ts est introuvable").toBeDefined();
    expect(
      relaisCommun!.texte,
      "le relais ne demande plus l'arrêt : treize nœuds le perdent sans que rien ne tombe",
    ).toMatch(/arreterLesTravauxAuSignal\(ctx\.signal\)/);
  });

  it("ET ILS SONT SEIZE, relevés le 2026-10-27 : le chiffre dit ce que le garde couvre", () => {
    const lanceurs = plugins
      .filter(({ texte }) => [...methodes.values()].some((m) => new RegExp(`\\b${m}\\(`).test(texte)))
      .map(({ fichier }) => fichier);
    expect(lanceurs.length, lanceurs.join(", ")).toBeGreaterThanOrEqual(16);
  });
});
