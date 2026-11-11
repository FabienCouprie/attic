// core/execution-boucle.test.ts — La boucle d'une passe, sortie du moteur, rend ce que rendait le moteur.
//
// LE TÉMOIN EST LA BOUCLE D'AVANT LE CHANTIER, recopiée depuis `ui/hooks/useExecutionGraphe.ts` de
// master 2f5a67f (l. 252 à 281 pour la pose des statuts, 374 à 619 pour la boucle) : son code tel
// quel, ses longs commentaires retirés, ses fermetures remplacées par les mêmes prêts. Il ne passe
// par aucune des trois pièces du plan du runtime, et c'est ce qui prouve qu'ensemble elles rendent
// ce que rendait le moteur.
//
// LE BANC. Des graphes passés par le vrai `preparerLaPasse` et les vrais sauts de boucle, joués deux
// fois, le second run sur le cache du premier ; des fiches d'essai qui couvrent chaque branche ; une
// horloge espionnée ; un seul journal où s'écrivent dans l'ordre les statuts, les ombres, les poses
// rendues au crochet et la console. Le témoin et le nouveau jouent chacun sur leur propre cache.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { creerTablesDePasse, estResultatEnErreur, executerLesNoeuds, type QuestionsDuRetour, type TablesDePasse } from "./execution";
import { peutReutiliserLeCache, sourceRetraitee } from "./cache-execution";
import { contexteDePasse } from "./contexte-de-passe";
import { FICHE_DEBUT, FICHE_FIN } from "./boucle-graphe";
import { empreinteEntrees, empreinteParametres, empreinteSorties, empreinteValeursEntrantes, valeursEntrantes } from "./graphe";
import type { AreteG, MetaComposant, NoeudG } from "./meta";
import { preparerLaPasse, type PlanDePasse } from "./preparation-passe";
import { respirer } from "./respirer";
import { sautsDeBoucles } from "./saut-de-boucle";
import { creerResolveurDeGraines } from "./graines-de-passe";
import { configurerServicesDomaine, oublierServicesDomaine, servicesDomaine } from "./services-domaine";
import { signalerEcartsDeType } from "./types-au-port";
import type { ContexteExecution, FonctionPlugin, PluginDef } from "./types";

type Ctx = ContexteExecution<unknown, unknown>;
type Fiche = Partial<PluginDef<unknown, unknown>> & { executer?: (ctx: Ctx) => Promise<unknown> };
type Journal = unknown[][];

const audio = (nom: string) => ({ nom, type: "audio" });
const son = (s: string) => ({ son: s });
const lu = (ctx: Ctx) => (ctx.entree(0) as { son?: string } | null)?.son ?? "rien";
let controleurCourant = new AbortController();

/** Les fiches d'essai : chacune ouvre une branche de la boucle. */
const FICHES: Record<string, Fiche> = {
  src: { entrees: [], sorties: [audio("Audio")], executer: async () => ({ valeurs: [son("src")] }) },
  fx: { entrees: [audio("Audio")], sorties: [audio("Audio")], executer: async (ctx) => {
    ctx.onProgress?.("moitié");
    return { valeurs: [son(`${lu(ctx)}+fx`)], message: "fx" };
  } },
  jamais: { jamaisCache: true, entrees: [audio("Audio")], sorties: [audio("Audio")], executer: async (ctx) => ({ valeurs: [son(`${lu(ctx)}+j`)] }) },
  montre: { entrees: [audio("Audio")], sorties: [audio("Audio"), audio("Reste")], executer: async (ctx) => ({
    valeurs: [son(String(ctx.sortieBranchee?.(1))), son("reste")], affichage: { vu: 1 }, designe: { pris: 0 }, moteur: { paletteARelire: true },
  }) },
  nul: { entrees: [audio("Audio")], sorties: [audio("Audio")], executer: async () => ({ valeurs: [null], message: "rien" }) },
  leve: { entrees: [], sorties: [audio("Audio")], executer: async () => { throw new Error("boum"); } },
  fantome: { entrees: [audio("Audio")], sorties: [audio("Audio")] },
  annule: { entrees: [audio("Audio")], sorties: [audio("Audio")], executer: async () => {
    controleurCourant.abort();
    return { valeurs: [son("tard")] };
  } },
  sortie: { entrees: [audio("Audio")], sorties: [], executer: async () => ({ valeurs: [] }) },
  [FICHE_DEBUT]: { entrees: [audio("Audio")], sorties: [audio("Audio")], executer: async (ctx) => ({ valeurs: [ctx.entree(0)] }) },
  [FICHE_FIN]: { entrees: [audio("Audio")], sorties: [audio("Audio")], executer: async (ctx) => ({ valeurs: [ctx.entree(0)] }) },
};
const trouverDef = (f: string) => FICHES[f] as PluginDef<unknown, unknown> | undefined;
const trouverPlugin = (f: string) => FICHES[f]?.executer as FonctionPlugin<unknown, unknown> | undefined;
const typeFlux = (t: string) => (t === "audio" ? { estDuType: (v: unknown) => typeof v === "object" } : undefined);
const t = (cle: string) => `${cle}:{source}{i}/{total}{detail}`;

const n = (id: string, ficheId: string, parametres: Record<string, unknown> = {}): NoeudG => ({ id, data: { ficheId, parametres } });
const a = (source: string, target: string, si = 0): AreteG =>
  ({ id: `${source}-${target}-${si}`, source, target, sourceHandle: `out:${si}`, targetHandle: "in:0" });
const META: MetaComposant = {
  id: "meta-outil", nom: "Outil", entrees: [], sorties: [audio("Audio")], mapEntrees: [], mapSorties: [{ noeudInterne: "cd", portIndex: 0 }],
  sousNoeuds: [n("ab", "src"), n("cd", "nul")], sousAretes: [a("ab", "cd")],
};
const trouverMeta = (f: string) => (f === "meta-outil" ? META : undefined);

/** Les graphes du banc : une chaîne et ses sœurs, les erreurs, une boucle de trois tours, un méta. */
const GRAPHES: Record<string, { noeuds: NoeudG[]; aretes: AreteG[]; regardes: string[] }> = {
  "chaîne et sœurs": {
    noeuds: [n("a", "src"), n("b", "fx"), n("m", "montre"), n("c", "sortie"), n("x", "src"), n("y", "jamais"), n("z", "fx")],
    aretes: [a("a", "b"), a("b", "m"), a("m", "c"), a("m", "c", 1), a("x", "y"), a("y", "z")], regardes: ["c", "z"],
  },
  "les erreurs": {
    noeuds: [n("a", "src"), n("b", "nul"), n("c", "fx"), n("d", "leve"), n("e", "fx"), n("f", "src"), n("g", "fantome"), n("h", "fx")],
    aretes: [a("a", "b"), a("b", "c"), a("d", "e"), a("f", "g"), a("g", "h")], regardes: ["c", "h"],
  },
  "une boucle de trois tours": {
    noeuds: [n("s", "src"), n("d", FICHE_DEBUT, { Tours: 3 }), n("tr", "fx"), n("f", FICHE_FIN), n("ec", "fx")],
    aretes: [a("s", "d"), a("d", "tr"), a("tr", "f"), a("f", "ec")], regardes: ["ec"],
  },
  "un méta dont un interne échoue": {
    noeuds: [n("outil", "meta-outil"), n("z", "fx"), n("w", "src")], aretes: [a("outil", "z")], regardes: ["z", "w"],
  },
  "une annulation pendant un nœud": {
    noeuds: [n("a", "src"), n("b", "annule"), n("c", "fx"), n("x", "src")], aretes: [a("a", "b"), a("b", "c")], regardes: ["c"],
  },
};

let horloge = 0;
let journal: Journal = [];

function questions(): QuestionsDuRetour {
  return {
    async porterALaFrequenceDeTravail(v) { return v.map((x) => (x && typeof x === "object" ? { ...(x as object), converti: true } : x)); },
    heriterDesEntrees: (s, e) => { journal.push(["heriter", s.length, e.length]); },
    ecartNiveau: (_s, e) => (e.length > 0 ? -1 : undefined),
    frequencesMelees: () => [],
  };
}

interface Run {
  plan: PlanDePasse; tables: TablesDePasse; cache: Map<string, unknown>; jeton?: { generation: number; perime: () => boolean };
  sauts: ReturnType<typeof sautsDeBoucles>; graineDuNoeud: (id: string, nom: string, brut: number) => number;
  controller: AbortController; regardes: string[];
}

/** L'ANCIENNE BOUCLE. Ses noms d'origine ; `registreUI()`, `servicesApercu()` et le reste sont les prêts. */
async function temoin(r: Run) {
  const { plan, tables, controller, jeton, sauts, graineDuNoeud } = r;
  const { ordreFiltre, noeudsEnErreur, aretesG, nds, plat } = plan;
  const aretes = plan.deplie.aretes;
  const { resultats, messages, affichageParNoeud, designeParNoeud, demandesParNoeud, ecartsParNoeud, tempsParVisible } = tables;
  const cacheExec = { current: r.cache as Map<string, any> };
  const registreUI = () => ({ trouverPlugin, typeFlux });
  const q = questions(); const servicesApercu = () => q;
  const ctx = "runtime d'essai"; const repertoire = "rep"; const valeurCanoniqueChoix = (_p: unknown, v: string | number) => v;
  const definirStatut = (id: string, s: string, pr?: string, pn = false) => { journal.push(["statut", id, s, pr, pn]); };
  const poserStatutOmbre = (id: string, v: string, s: string) => { journal.push(["ombre", id, v, s]); };
  const aPoser = new Set<string>();
  const estRegarde = (id: string) => r.regardes.includes(id);
  const poserUnNoeud = async (id: string) => { journal.push(["pose", id]); };
  type ValeurTransportee = unknown;
  const traitesCeRun = new Set<string>();
  const marquerMetaEnEchec = (idAplati: string, detail?: string) => {
    const proprio = plat.expansions.get(idAplati);
    if (proprio && proprio !== idAplati) {
      definirStatut(proprio, "erreur", detail ? t("execution.brancheEnEchecDetail").replace("{detail}", detail) : t("execution.brancheEnEchec"));
    }
  };
  const visiblesEnErreur = new Set<string>();
  const poserStatut = (nodeId: string, statut: string, progression?: string, progressionDuNoeud = false) => {
    const visibleId = plat.expansions.get(nodeId) ?? nodeId;
    if (visibleId !== nodeId) poserStatutOmbre(nodeId, visibleId, statut);
    if (statut === "erreur") visiblesEnErreur.add(visibleId);
    else if (visiblesEnErreur.has(visibleId)) return;
    definirStatut(visibleId, statut, progression, progressionDuNoeud);
  };
  for (let i = 0; i < ordreFiltre.length; i++) {
    if (controller.signal.aborted) break;
    const nodeId = ordreFiltre[i];
    if (noeudsEnErreur.has(nodeId)) continue;
    const entreeFautive = aretesG.find((a) => a.target === nodeId && noeudsEnErreur.has(a.source));
    if (entreeFautive) {
      noeudsEnErreur.add(nodeId);
      resultats.set(nodeId, [null]);
      poserStatut(nodeId, "erreur", t("execution.entreeEnErreur").replace("{source}", entreeFautive.source));
      marquerMetaEnEchec(nodeId);
      continue;
    }
    const node = nds.find((n) => n.id === nodeId);
    if (!node) continue;
    if (sauts.copieSautee(nodeId, traitesCeRun)) { poserStatut(nodeId, "termine"); continue; }
    const sourceReprocessee = sourceRetraitee(nodeId, aretes, traitesCeRun);
    const hashParams = empreinteParametres(node.data) + JSON.stringify(servicesDomaine().reglagesDeProjet());
    const monHashEntree = empreinteEntrees(nodeId, aretesG);
    const hashSorties = empreinteSorties(nodeId, aretesG);
    const hashValeursEntree = empreinteValeursEntrantes(nodeId, aretesG, resultats);
    const entreeCache = cacheExec.current.get(nodeId);
    const jamaisCache = trouverDef(node.data.ficheId as string)?.jamaisCache === true;
    const cacheIdentique = entreeCache && (sauts.finReprise(nodeId) || peutReutiliserLeCache(
      jamaisCache, sourceReprocessee, entreeCache,
      { hashParams, hashEntree: monHashEntree, hashSorties, hashValeursEntree },
    ));
    if (cacheIdentique) {
      resultats.set(nodeId, entreeCache.valeurs);
      if (entreeCache.message) messages.set(nodeId, entreeCache.message);
      if (entreeCache.affichage) affichageParNoeud.set(nodeId, entreeCache.affichage);
      if (entreeCache.designe) designeParNoeud.set(nodeId, entreeCache.designe);
      poserStatut(nodeId, "termine");
      if (typeof entreeCache.tempsExecution === "number") {
        const visibleId = plat.expansions.get(nodeId) ?? nodeId;
        tempsParVisible.set(visibleId, (tempsParVisible.get(visibleId) ?? 0) + entreeCache.tempsExecution);
      }
      continue;
    }
    poserStatut(nodeId, "en_cours", t("execution.etape").replace("{i}", String(i + 1)).replace("{total}", String(ordreFiltre.length)));
    await respirer();
    if (controller.signal.aborted) break;
    traitesCeRun.add(nodeId);
    const fn = registreUI().trouverPlugin(node.data.ficheId as string);
    if (!fn) { noeudsEnErreur.add(nodeId); resultats.set(nodeId, [null]); poserStatut(nodeId, "erreur"); marquerMetaEnEchec(nodeId, node.data.ficheId as string); continue; }
    const start = performance.now();
    const ajouterTemps = (ms: number) => {
      const visibleId = plat.expansions.get(nodeId) ?? nodeId;
      tempsParVisible.set(visibleId, (tempsParVisible.get(visibleId) ?? 0) + ms);
    };
    const { ctx: contexteDuNoeud, aConsulteSesSorties } = contexteDePasse<ValeurTransportee, string>({
      noeud: node, aretes: aretesG, resultats, runtime: ctx, repertoireTravail: repertoire,
      trouverDef, canoniser: valeurCanoniqueChoix, graineDuNoeud, signal: controller.signal,
      poserProgression: (msg) => poserStatut(nodeId, "en_cours", msg, true),
    });
    try {
      const res = await fn(contexteDuNoeud);
      if (controller.signal.aborted) break;
      const valeurs = await servicesApercu().porterALaFrequenceDeTravail(res.valeurs as unknown[]);
      resultats.set(nodeId, valeurs as ValeurTransportee[]);
      const entrantes = () => valeursEntrantes<ValeurTransportee>(nodeId, aretesG, resultats) as unknown[];
      servicesApercu().heriterDesEntrees(valeurs, entrantes());
      const ecart = servicesApercu().ecartNiveau(valeurs, entrantes());
      if (ecart !== undefined) ecartsParNoeud.set(nodeId, ecart);
      const melees = servicesApercu().frequencesMelees(entrantes()); if (melees.length) console.warn(`[frequence] ${nodeId}(${node.data.ficheId}) reçoit ${melees.join(" et ")} Hz : la conversion du moteur n'a pas eu lieu`);
      if (res.message) messages.set(nodeId, res.message);
      if (res.affichage) affichageParNoeud.set(nodeId, res.affichage);
      if (res.designe) designeParNoeud.set(nodeId, res.designe);
      if (res.moteur) demandesParNoeud.set(nodeId, res.moteur);
      const defRes = trouverDef(node.data.ficheId as string);
      if (estResultatEnErreur(defRes, res as { valeurs: ValeurTransportee[]; erreur?: boolean })) {
        noeudsEnErreur.add(nodeId);
        poserStatut(nodeId, "erreur", res.message);
        marquerMetaEnEchec(nodeId, node.data.ficheId as string);
        ajouterTemps(performance.now() - start);
      } else {
        const elapsed = performance.now() - start;
        if (!jeton?.perime()) cacheExec.current.set(nodeId, { valeurs: valeurs as ValeurTransportee[], message: res.message, affichage: res.affichage, designe: res.designe, hashParams, hashEntree: monHashEntree, hashSorties, hashValeursEntree, consulteSorties: aConsulteSesSorties(), tempsExecution: elapsed, empreinteBoucle: sauts.empreintePour(nodeId) });
        else console.warn(`[cache] resultat perime ecarte : ${nodeId} (generation ${jeton.generation})`);
        signalerEcartsDeType(nodeId, String(node.data.ficheId), defRes?.sorties ?? [], valeurs, (t) => registreUI().typeFlux(t));
        poserStatut(nodeId, "termine");
        ajouterTemps(elapsed);
      }
    } catch (e: any) {
      if (controller.signal.aborted) break;
      const elapsed = performance.now() - start;
      console.error(`[attic] Nœud « ${node.data.ficheId} » (id=${nodeId}) a échoué :`, e);
      noeudsEnErreur.add(nodeId);
      resultats.set(nodeId, [null]);
      poserStatut(nodeId, "erreur", e?.message ? String(e.message) : undefined);
      marquerMetaEnEchec(nodeId, node.data.ficheId as string);
      ajouterTemps(elapsed);
    }
    aPoser.add(nodeId);
    if (estRegarde(nodeId)) await poserUnNoeud(nodeId);
  }
  return aPoser;
}

/** La nouvelle boucle, appelée comme le crochet l'appelle. */
async function nouveau(r: Run) {
  const aPoser = new Set<string>();
  await executerLesNoeuds<string>(r.plan, r.tables, {
    runtime: "runtime d'essai", repertoireTravail: "rep", signal: r.controller.signal, jeton: r.jeton, trouverDef,
    trouverPlugin, typeFlux, canoniser: (_p, v) => v, graineDuNoeud: r.graineDuNoeud,
    lireCache: (id) => r.cache.get(id) as never, ecrireCache: (id, e) => r.cache.set(id, e),
    sauts: r.sauts, questions, t,
    poser: (id, s, pr, pn = false) => { journal.push(["statut", id, s, pr, pn]); },
    poserOmbre: (id, v, s) => { journal.push(["ombre", id, v, s]); },
    quandUnNoeudAFini: (id) => {
      aPoser.add(id);
      if (r.regardes.includes(id)) return (async () => { journal.push(["pose", id]); })();
    },
  });
  return aPoser;
}

/** Prépare et joue une passe d'un graphe sur un cache, par l'une ou l'autre boucle, et relève tout. */
async function jouer(nom: string, boucle: typeof temoin, cache: Map<string, unknown>, jeton?: Run["jeton"]) {
  const g = GRAPHES[nom];
  const plan = preparerLaPasse({
    noeuds: g.noeuds, aretes: g.aretes, prioriteDemandee: null, versLAval: false,
    trouverMeta, trouverDef, fluxCompatibles: (s, c) => s === c, t,
  });
  const tables = creerTablesDePasse();
  const { deplie } = plan;
  const sauts = sautsDeBoucles(deplie.depliees, {
    noeuds: deplie.noeuds, aretes: plan.aretesG, resultats: tables.resultats, cache: cache as never,
    toursDesCopies: deplie.toursDesCopies, reglages: JSON.stringify(servicesDomaine().reglagesDeProjet()),
    jamaisCache: (id) => trouverDef(deplie.noeuds.find((x) => x.id === id)?.data.ficheId as string)?.jamaisCache === true,
  });
  const { graineDuNoeud } = creerResolveurDeGraines({ toursDesCopies: deplie.toursDesCopies, origines: deplie.origines, expansions: plan.plat.expansions });
  const controller = new AbortController();
  controleurCourant = controller;
  horloge = 1000; journal = [];
  const aPoser = await boucle({ plan, tables, cache, jeton, sauts, graineDuNoeud, controller, regardes: g.regardes });
  return {
    journal, aPoser: [...aPoser], enErreur: [...plan.noeudsEnErreur], cache: [...cache],
    tables: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, [...(v as Map<string, unknown>)]])),
  };
}

beforeEach(() => {
  vi.spyOn(performance, "now").mockImplementation(() => (horloge += 7));
  vi.spyOn(console, "warn").mockImplementation((...x) => { journal.push(["warn", ...x]); });
  vi.spyOn(console, "error").mockImplementation((...x) => { journal.push(["error", ...x.map((v) => (v instanceof Error ? v.message : v))]); });
  configurerServicesDomaine({ reglagesDeProjet: () => ({ frequence: 48000 }) });
});
afterEach(() => { vi.restoreAllMocks(); oublierServicesDomaine(); });

/** Deux runs, le second sur le cache du premier, par les deux boucles. */
async function deuxRuns(nom: string, jeton?: Run["jeton"]) {
  const cacheAncien = new Map<string, unknown>(); const cacheNeuf = new Map<string, unknown>();
  const runs = [];
  for (let k = 0; k < 2; k++) {
    const attendu = await jouer(nom, temoin, cacheAncien, jeton);
    const rendu = await jouer(nom, nouveau, cacheNeuf, jeton);
    runs.push({ attendu, rendu });
  }
  return runs;
}

describe("la boucle d'une passe", () => {
  it("REND CE QUE RENDAIT LA BOUCLE D'AVANT LE CHANTIER, sur cinq graphes et deux runs chacun", async () => {
    const vus = new Set<string>();
    for (const nom of Object.keys(GRAPHES)) {
      for (const [k, { attendu, rendu }] of (await deuxRuns(nom)).entries()) {
        expect(rendu, `${nom}, run ${k + 1}`).toEqual(attendu);
        for (const e of attendu.journal) vus.add(e[0] === "statut" ? `statut:${e[2]}` : String(e[0]));
      }
    }
    // LE TÉMOIN A TOUT TRAVERSÉ : un relevé qui ne verrait que des nœuds terminés serait égal pour rien.
    expect([...vus].sort()).toEqual(
      ["error", "heriter", "ombre", "pose", "statut:en_cours", "statut:erreur", "statut:termine"].sort());
  });

  it("ET SOUS UN JETON PÉRIMÉ, qui n'écrit rien au cache", async () => {
    for (const { attendu, rendu } of await deuxRuns("chaîne et sœurs", { generation: 4, perime: () => true })) {
      expect(rendu).toEqual(attendu);
      expect(rendu.cache).toEqual([]);
    }
  });

  it("LE SECOND RUN SERT LE CACHE SANS CLIGNOTER, et ne rend au crochet que ce qui a tourné", async () => {
    const [, second] = await deuxRuns("chaîne et sœurs");
    const enCours = second.rendu.journal.filter((e) => e[0] === "statut" && e[2] === "en_cours").map((e) => e[1]);
    // `y` refuse le cache et tourne ; `z`, sa seule descendante, le suit ; la chaîne `a b m c` ne bouge pas.
    expect([...new Set(enCours)]).toEqual(["y", "z"]);
    expect(second.rendu.aPoser).toEqual(["y", "z"]);
  });

  it("UNE BOUCLE DE GRAPHE INCHANGÉE NE REPART PAS AU SECOND RUN, et ses copies le disent sur leur ombre", async () => {
    const [premier, second] = await deuxRuns("une boucle de trois tours");
    const copies = (r: typeof premier.rendu) => r.journal.filter((e) => e[0] === "ombre").map((e) => e[1]);
    expect(new Set(copies(premier.rendu)).size).toBe(3);
    expect(second.rendu.journal.filter((e) => e[0] === "statut" && e[2] === "en_cours")).toEqual([]);
    expect(copies(second.rendu).length).toBeGreaterThan(0);
  });

  it("ANNULÉE PENDANT UN NŒUD, LA BOUCLE NE LE STATUE PAS, et n'enchaîne rien", async () => {
    const [premier] = await deuxRuns("une annulation pendant un nœud");
    const statues = premier.rendu.journal.filter((e) => e[0] === "statut").map((e) => `${e[1]}:${e[2]}`);
    expect(statues.at(-1)).toBe("b:en_cours");
    expect(statues).not.toContain("c:en_cours");
    // Ce qui a tourné avant `b` est rendu au crochet, `b` ne l'est pas.
    expect(premier.rendu.aPoser).not.toContain("b");
    expect(premier.rendu.aPoser).toContain("a");
  });
});
