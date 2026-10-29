// @vitest-environment jsdom
// core/nodes-installes.test.ts — Quand le code d'un noeud installe s'evalue, et sous quelle condition.
//
// ═══ LE CAS QUI MANQUAIT, ET QUI SE DISAIT ECRIT ═══
//
// `node-essai.test.ts` recopie volontairement la mecanique d'evaluation, et son en-tete promet :
// « si `nodes-installes` change de mecanique, ce cas ne le verra pas tout seul, et c'est pourquoi
// il y a aussi un cas qui tient la FORME de l'appel dans `nodes-installes.ts` ». CE CAS N'EXISTAIT
// PAS. Rien ne lisait ce module, rien n'attachait la copie a l'original.
//
// C'EST LA FAUTE MEME QUE CE DOSSIER DENONCE : une affirmation sur une propriete de securite que
// personne n'avait eprouvee. Le commentaire « Sans window » l'avait deja payee une fois.
//
// ET IL EST ECRIT PAR LE COMPORTEMENT, NON PAR LA FORME. Chercher `new Function` dans une source
// dirait qu'un appel EXISTE, jamais QUAND il a lieu, ce qui est toute la question ici.
import { beforeEach, describe, expect, it } from "vitest";

import {
  CLE_LISTE_NODES, PREFIXE_NODE_INSTALLE, appliquerNodeInstalleDistant,
  chargerNodesInstalles, configurerBacDExecution, configurerRegistreNodes, installerNode, listeDesNodesInstallesStockes,
} from "./nodes-installes";
import type { PluginDef } from "./types";

/** La trace qu'un code evalue laisse derriere lui, et que rien d'autre ne pose. */
const TEMOIN = "__attic_essai_code_evalue__";

/** Un code de noeud qui MARQUE son evaluation, puis se comporte en noeud ordinaire. */
const CODE_TEMOIN = `
  globalThis["${TEMOIN}"] = (globalThis["${TEMOIN}"] ?? 0) + 1;
  module.exports = async () => ({ valeurs: ["tourne"] });
`;

const noeud = (id: string, consenti?: string) => ({
  manifest: {
    id, nom: id, univers: "Autres", famille: "Essai", resume: "Un noeud d'essai.",
    entrees: [], sorties: [{ nom: "Texte", type: "texte" }], parametres: [],
  },
  executerCode: CODE_TEMOIN,
  consenti,
});

/** Un registre d'essai, reduit a ce que ce module lui demande. */
function registreDEssai() {
  const defs = new Map<string, PluginDef<unknown, unknown>>();
  configurerRegistreNodes({
    enregistrer: (d: PluginDef<unknown, unknown>) => { defs.set(d.id, d); },
    tousLesPlugins: () => [...defs.values()],
    desenregistrer: (id: string) => { defs.delete(id); },
    enregistrerTypeFlux: () => {},
  } as never);
  return defs;
}

const evaluations = () => (globalThis as Record<string, unknown>)[TEMOIN] ?? 0;

/**
 * Un bac d'essai, qui evalue DANS LE PROCESSUS.
 *
 * CES CAS MESURENT QUAND LE CODE EST LU, non ou il tourne. L'isolation, elle, se mesure dans un
 * vrai cadre : `tests-e2e/bac-a-sable-noeud.spec.ts` le fait, et c'est le seul endroit qui le
 * puisse — jsdom n'a ni origine opaque ni Web Audio.
 */
function bacDEssai() {
  const poses = new Map<string, (ctx: unknown) => Promise<Record<string, unknown>>>();
  configurerBacDExecution({
    executer: async (cle, code, contexte) => {
      let fn = poses.get(cle);
      if (!fn) {
        const mod = { exports: null as never };
        new Function("module", "exports", "attic", `"use strict";\n${code}`)(mod, mod.exports, {});
        fn = mod.exports as never;
        poses.set(cle, fn!);
      }
      return fn!(contexte);
    },
  });
}

describe("l'evaluation du code d'un noeud installe", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>)[TEMOIN] = 0;
    localStorage.clear();
    bacDEssai();
  });

  it("SANS BAC, RIEN NE TOURNE : on ne retombe pas sur une evaluation dans la page", async () => {
    // C'EST LA REGLE QUI TIENT TOUT LE RESTE. Un repli silencieux vers l'absence de barriere est
    // la forme la plus commune des barrieres qui ne protegent rien.
    const defs = registreDEssai();
    configurerBacDExecution(null);
    installerNode(noeud("essai-sans-bac", new Date().toISOString()) as never);
    const executer = defs.get("essai-sans-bac")!.executer as (c: unknown) => Promise<{ erreur?: boolean }>;
    expect((await executer({})).erreur).toBe(true);
    expect(evaluations(), "et surtout : le code n'a pas ete lu").toBe(0);
  });

  it("N'A PAS LIEU A L'INSTALLATION : la fiche se declare sans que le code soit lu", () => {
    const defs = registreDEssai();
    installerNode(noeud("essai-pose", new Date().toISOString()) as never);
    expect(defs.has("essai-pose"), "la fiche doit etre declaree").toBe(true);
    expect(evaluations(), "mais son code ne doit pas avoir tourne").toBe(0);
  });

  it("NI AU DEMARRAGE, ce qui etait le defaut le plus grave", () => {
    // `ui/App.tsx` appelle `chargerNodesInstalles()` au chargement du module, avant meme que React
    // ne rende : le code d'un noeud recu tournait a CHAQUE lancement, sans action de personne.
    const defs = registreDEssai();
    installerNode(noeud("essai-demarrage", new Date().toISOString()) as never);
    (globalThis as Record<string, unknown>)[TEMOIN] = 0;
    defs.clear();

    // LE COMPTE N'EST PAS LA MESURE : la carte du module survit d'un cas a l'autre, et le stockage
    // porte donc aussi les noeuds installes plus haut. Ce qui compte est qu'on relise, qu'on
    // redeclare, et que rien ne s'evalue.
    expect(chargerNodesInstalles(), "le noeud est bien relu du stockage").toBeGreaterThanOrEqual(1);
    expect(defs.has("essai-demarrage"), "et redeclare").toBe(true);
    expect(evaluations(), "mais rien ne s'evalue au demarrage").toBe(0);
  });

  it("ELLE A LIEU AU PREMIER RUN, et une seule fois", async () => {
    const defs = registreDEssai();
    installerNode(noeud("essai-run", new Date().toISOString()) as never);
    const executer = defs.get("essai-run")!.executer as (c: unknown) => Promise<{ valeurs: string[] }>;

    expect(await executer({}), "le noeud rend ce que son code rend").toEqual({ valeurs: ["tourne"] });
    expect(evaluations(), "une evaluation").toBe(1);
    await executer({});
    await executer({});
    expect(evaluations(), "et pas une de plus : le code n'est lu qu'une fois").toBe(1);
  });

  it("ET SANS CONSENTEMENT, ELLE N'A JAMAIS LIEU : le noeud refuse et le dit", async () => {
    // Un noeud installe avant ce lot n'a pas de consentement. Il se declare — sa fiche, ses ports,
    // ses reglages sont connus —, et il refuse de tourner tant qu'on ne l'a pas reimporte.
    const defs = registreDEssai();
    installerNode(noeud("essai-sans") as never);
    const executer = defs.get("essai-sans")!.executer as (c: unknown) => Promise<{ erreur?: boolean; message?: string }>;

    const rendu = await executer({});
    expect(rendu.erreur, "un refus est un resultat, pas une panne").toBe(true);
    expect(rendu.message, "et il dit quoi faire").toMatch(/Exécution|Execution/);
    expect(evaluations(), "LE CODE N'A PAS TOURNE").toBe(0);
  });

  it("et un refus ne s'use pas : trois lancements, zero evaluation", async () => {
    const defs = registreDEssai();
    installerNode(noeud("essai-tetu") as never);
    const executer = defs.get("essai-tetu")!.executer as (c: unknown) => Promise<unknown>;
    await executer({}); await executer({}); await executer({});
    expect(evaluations()).toBe(0);
  });
});

// ═══ UNE CLE PAR NOEUD, et ce qu'une autre fenetre en recoit ═══
//
// La liste `attic-nodes-installes` etait reecrite entiere depuis la memoire de la fenetre : la
// meme faute que la bibliotheque de metas, mesuree le 2026-10-29 sur celle-ci. Un noeud installe
// dans une fenetre effacait du stockage celui qu'une autre venait d'installer.
describe("le stockage des noeuds installes", () => {
  beforeEach(() => { localStorage.clear(); bacDEssai(); });

  it("INSTALLER UN NOEUD N'EFFACE PAS CELUI QU'UNE AUTRE FENETRE A ECRIT", () => {
    registreDEssai();
    localStorage.setItem(PREFIXE_NODE_INSTALLE + "venu-d-ailleurs", JSON.stringify(noeud("venu-d-ailleurs")));
    installerNode(noeud("le-mien") as never);
    expect(localStorage.getItem(PREFIXE_NODE_INSTALLE + "venu-d-ailleurs")).not.toBeNull();
    expect(localStorage.getItem(PREFIXE_NODE_INSTALLE + "le-mien")).not.toBeNull();
  });

  it("L'ANCIENNE LISTE EST MIGREE au chargement, puis retiree", () => {
    const defs = registreDEssai();
    localStorage.setItem(CLE_LISTE_NODES, JSON.stringify([noeud("ancien-a"), noeud("ancien-b")]));
    chargerNodesInstalles();
    expect(localStorage.getItem(CLE_LISTE_NODES)).toBeNull();
    expect(defs.has("ancien-a") && defs.has("ancien-b")).toBe(true);
    expect(JSON.parse(listeDesNodesInstallesStockes()!).length, "et la sauvegarde d'avant mise a jour les rend en liste").toBe(2);
  });

  it("CE QU'UNE AUTRE FENETRE INSTALLE ENTRE DANS LE CATALOGUE D'ICI", () => {
    const defs = registreDEssai();
    const cle = PREFIXE_NODE_INSTALLE + "distant";
    expect(appliquerNodeInstalleDistant(cle, JSON.stringify(noeud("distant")))).toBe(true);
    expect(defs.has("distant")).toBe(true);
    expect(evaluations(), "et son code n'est pas lu pour autant").toBe(0);
    expect(appliquerNodeInstalleDistant(cle, null), "une cle retiree le retire").toBe(true);
    expect(defs.has("distant")).toBe(false);
  });

  it("et une cle qui n'est pas la sienne, ou une valeur illisible, ne change rien", () => {
    registreDEssai();
    expect(appliquerNodeInstalleDistant("attic-lang", "fr")).toBe(false);
    expect(appliquerNodeInstalleDistant(PREFIXE_NODE_INSTALLE + "x", "{illisible")).toBe(false);
    expect(appliquerNodeInstalleDistant(PREFIXE_NODE_INSTALLE + "x", JSON.stringify(noeud("autre-id")))).toBe(false);
  });
});
