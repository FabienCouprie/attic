// core/execution-retour.test.ts — Ce que le moteur fait du retour d'un exécuteur, éprouvé hors du moteur.
//
// LE TÉMOIN EST L'ANCIEN BLOC, recopié tel quel depuis `ui/hooks/useExecutionGraphe.ts` (master
// 0f9d4a2 et pièce 1, le `try` qui suit `contexteDePasse`) : ses noms d'origine, et ses fermetures
// remplacées par les mêmes prêts. Les contrôles d'annulation n'y sont pas : ils restent au crochet,
// qui sort de sa boucle avant d'appeler le cœur. Le nouveau est rejoué comme le crochet l'appelle,
// dans un seul `try` qui couvre l'exécuteur et son retour.
//
// L'HORLOGE ET LA CONSOLE SONT ESPIONNÉES, et c'est ce qui tient l'ordre : chaque `performance.now()`
// rend la valeur suivante d'un compteur, de sorte qu'un appel de plus ou de moins décale tous les
// temps rangés, et chaque avertissement ou erreur est relevé avec ses arguments.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enregistrerLEchec, enregistrerLeRetour, estResultatEnErreur, type PretsDuRetour, type QuestionsDuRetour, type RetourDeNoeud } from "./execution";
import type { EmpreintesDuRun, EntreeDeCache } from "./cache-execution";
import { valeursEntrantes } from "./graphe";
import type { AreteG, NoeudG } from "./meta";
import { signalerEcartsDeType } from "./types-au-port";
import type { PluginDef } from "./types";

type Trace = unknown[][];

const EMPREINTES: EmpreintesDuRun = { hashParams: "p", hashEntree: "e", hashSorties: "s", hashValeursEntree: "v" };
const audio = (nom: string) => ({ nom, type: "audio" });
const FICHES: Record<string, Partial<PluginDef<unknown, unknown>>> = {
  son: { sorties: [audio("Audio")] },
  permis: { sorties: [audio("Audio")], sortieNullePermise: true },
  muet: { sorties: [] },
};
const trouverDef = (f: string) => FICHES[f] as PluginDef<unknown, unknown> | undefined;
/** Un son d'essai est un objet ; une chaîne, à une sortie audio, est un écart de type. */
const typeFlux = (t: string) => t === "audio" ? { estDuType: (v: unknown) => typeof v === "object" } : undefined;

/** Une conversion qui fabrique de NOUVELLES valeurs, pour qu'on sache lesquelles ont été rangées. */
function questions(o: { leve?: boolean } = {}) {
  const trace: Trace = [];
  const q: QuestionsDuRetour = {
    async porterALaFrequenceDeTravail(valeurs) {
      trace.push(["porter", valeurs.length]);
      if (o.leve) throw new Error("rééchantillonnage impossible");
      return valeurs.map((v) => v && typeof v === "object" ? { ...(v as object), converti: true } : v);
    },
    heriterDesEntrees: (s, e) => { trace.push(["heriter", s.length, e.length]); },
    ecartNiveau: (s, e) => (e.length > 0 && s.some((v) => v != null) ? -3 : undefined),
    frequencesMelees: (e) => (e.some((v) => (v as { melee?: boolean } | null)?.melee) ? [44100, 48000] : []),
  };
  return { q, trace };
}

interface Situation {
  /** L'identifiant aplati du nœud : une copie de boucle se traduit vers « fx ». */
  id?: string;
  fiche?: string;
  executer: () => Promise<RetourDeNoeud>;
  jeton?: { generation: number; perime: () => boolean };
  conversionLeve?: boolean;
  entreeMelee?: boolean;
  consulte?: boolean;
}

/** Les tables et les prêts d'une passe, qui écrivent chaque pose dans une trace. */
function monter(s: Situation) {
  const id = s.id ?? "fx";
  const noeud: NoeudG = { id, data: { ficheId: s.fiche ?? "son", parametres: {} } };
  const aretes: AreteG[] = [{ id: "e", source: "src", target: id, sourceHandle: "out:0", targetHandle: "in:0" }];
  const statuts: Trace = [];
  const cache = new Map<string, EntreeDeCache>();
  const { q, trace } = questions({ leve: s.conversionLeve });
  const p: PretsDuRetour = {
    aretes, expansions: new Map([["d#1::fx", "fx"], ["outil1::cd", "outil1"]]),
    resultats: new Map<string, unknown[]>([["src", [{ son: "entrée", melee: s.entreeMelee }]]]),
    messages: new Map(), affichageParNoeud: new Map(), designeParNoeud: new Map(), demandesParNoeud: new Map(),
    ecartsParNoeud: new Map(), tempsParVisible: new Map([["fx", 5]]), noeudsEnErreur: new Set(),
    ecrireCache: (cle, e) => cache.set(cle, e),
    empreinteBoucle: (cle) => (cle === "fx" ? "boucle-fx" : undefined),
    jeton: s.jeton, trouverDef, typeFlux, questions: () => q,
    poserStatut: (...a) => { statuts.push(["statut", ...a]); },
    marquerMetaEnEchec: (...a) => { statuts.push(["meta", ...a]); },
  };
  const consulte = s.consulte ?? false;
  const n = { id, noeud, empreintes: EMPREINTES, aConsulteSesSorties: () => consulte, debut: 1000 };
  return { p, n, statuts, cache, trace };
}

/** Ce qu'une passe a retenu, à comparer : chaque table, le cache, les statuts, les questions, la console. */
function releve(x: ReturnType<typeof monter>, console_: Trace) {
  const { p } = x;
  return {
    resultats: [...p.resultats], messages: [...p.messages], affichage: [...p.affichageParNoeud],
    designe: [...p.designeParNoeud], demandes: [...p.demandesParNoeud], ecarts: [...p.ecartsParNoeud],
    temps: [...p.tempsParVisible], enErreur: [...p.noeudsEnErreur], cache: [...x.cache],
    statuts: x.statuts, questions: x.trace, console: console_,
  };
}

/** L'ANCIEN BLOC, tel quel : `servicesApercu()`, `registreUI()`, `cacheExec` et `sauts` sont les prêts. */
async function temoin(s: Situation, x: ReturnType<typeof monter>) {
  const { p, n } = x;
  const nodeId = n.id; const node = n.noeud; const start = n.debut; const jeton = p.jeton;
  const { resultats, messages, affichageParNoeud, designeParNoeud, demandesParNoeud, ecartsParNoeud, tempsParVisible, noeudsEnErreur } = p;
  const aretesG = p.aretes; const plat = { expansions: p.expansions };
  const servicesApercu = p.questions;
  const registreUI = () => ({ typeFlux: p.typeFlux });
  const cacheExec = { current: { set: p.ecrireCache } };
  const sauts = { empreintePour: p.empreinteBoucle };
  const { poserStatut, marquerMetaEnEchec } = p;
  const aConsulteSesSorties = n.aConsulteSesSorties;
  const { hashParams, hashEntree: monHashEntree, hashSorties, hashValeursEntree } = n.empreintes;
  type ValeurTransportee = unknown;
  const ajouterTemps = (ms: number) => {
    const visibleId = plat.expansions.get(nodeId) ?? nodeId;
    tempsParVisible.set(visibleId, (tempsParVisible.get(visibleId) ?? 0) + ms);
  };
  try {
    const res = await s.executer();
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
    const elapsed = performance.now() - start;
    console.error(`[attic] Nœud « ${node.data.ficheId} » (id=${nodeId}) a échoué :`, e);
    noeudsEnErreur.add(nodeId);
    resultats.set(nodeId, [null]);
    poserStatut(nodeId, "erreur", e?.message ? String(e.message) : undefined);
    marquerMetaEnEchec(nodeId, node.data.ficheId as string);
    ajouterTemps(elapsed);
  }
}

/** Le nouveau, appelé comme le crochet l'appelle. */
async function nouveau(s: Situation, x: ReturnType<typeof monter>) {
  try {
    const res = await s.executer();
    await enregistrerLeRetour(x.n, res, x.p);
  } catch (e) {
    enregistrerLEchec(x.n, e, x.p);
  }
}

let horloge = 0;
let journal: Trace = [];
beforeEach(() => {
  horloge = 1000;
  journal = [];
  vi.spyOn(performance, "now").mockImplementation(() => (horloge += 7));
  vi.spyOn(console, "warn").mockImplementation((...a) => { journal.push(["warn", ...a]); });
  vi.spyOn(console, "error").mockImplementation((...a) => {
    journal.push(["error", ...a.map((v) => (v instanceof Error ? `Error(${v.message})` : v))]);
  });
});
afterEach(() => { vi.restoreAllMocks(); });

/** Joue une situation par le témoin puis par le nouveau, chacun sur des prêts neufs et la même horloge. */
async function lesDeux(s: Situation) {
  const ancien = monter(s);
  horloge = 1000; journal = [];
  await temoin(s, ancien);
  const attendu = releve(ancien, journal);
  const neuf = monter(s);
  horloge = 1000; journal = [];
  await nouveau(s, neuf);
  return { attendu, rendu: releve(neuf, journal), neuf };
}

const son = (s: string) => ({ son: s });
const SITUATIONS: [string, Situation][] = [
  ["un succès qui parle et montre", { executer: async () => ({
    valeurs: [son("rendu")], message: "fait", affichage: { courbe: [1] }, designe: { pris: 0 }, moteur: { paletteARelire: true },
  }) }],
  ["un succès sur une copie de boucle", { id: "d#1::fx", executer: async () => ({ valeurs: [son("tour 2")] }) }],
  ["un succès qui a demandé ses sorties", { consulte: true, executer: async () => ({ valeurs: [son("x")] }) }],
  ["des fréquences mêlées en entrée", { entreeMelee: true, executer: async () => ({ valeurs: [son("x")] }) }],
  ["un écart de type au port", { executer: async () => ({ valeurs: ["une chaîne là où un son est promis"] }) }],
  ["un retour tout-nul", { executer: async () => ({ valeurs: [null], message: "entrée manquante" }) }],
  ["un retour tout-nul dans un méta", { id: "outil1::cd", executer: async () => ({ valeurs: [null] }) }],
  ["une sortie nulle permise", { fiche: "permis", executer: async () => ({ valeurs: [null] }) }],
  ["un échec déclaré", { executer: async () => ({ valeurs: [son("x")], erreur: true, message: "refusé" }) }],
  ["un nœud sans sortie", { fiche: "muet", executer: async () => ({ valeurs: [] }) }],
  ["une exception de l'exécuteur", { executer: async () => { throw new Error("boum"); } }],
  ["une exception qui n'est pas une erreur", { executer: async () => { throw "texte nu"; } }],
  ["une conversion qui lève", { conversionLeve: true, executer: async () => ({ valeurs: [son("x")] }) }],
  ["un jeton périmé", { jeton: { generation: 7, perime: () => true }, executer: async () => ({ valeurs: [son("x")] }) }],
  ["un jeton frais", { jeton: { generation: 8, perime: () => false }, executer: async () => ({ valeurs: [son("x")] }) }],
];

describe("le retour d'un exécuteur", () => {
  it("RANGE CE QUE RANGEAIT LE MOTEUR, table pour table, sur quinze situations", async () => {
    // L'UNE APRÈS L'AUTRE : l'horloge et le journal sont partagés, et deux situations jouées ensemble
    // mêleraient leurs relevés.
    const tous: Awaited<ReturnType<typeof lesDeux>>["attendu"][] = [];
    for (const [nom, s] of SITUATIONS) {
      const { attendu, rendu } = await lesDeux(s);
      expect(rendu, nom).toEqual(attendu);
      tous.push(attendu);
    }
    // Le témoin a bien rangé quelque chose de chaque sorte : un relevé vide des deux côtés serait égal.
    expect(tous.some((r) => r.cache.length > 0)).toBe(true);
    expect(tous.some((r) => r.enErreur.length > 0)).toBe(true);
    expect(tous.some((r) => r.console.some((c) => c[0] === "warn"))).toBe(true);
    expect(tous.some((r) => r.console.some((c) => c[0] === "error"))).toBe(true);
  });

  it("LES VALEURS CONVERTIES VONT AUX RÉSULTATS ET AU CACHE, et non celles que l'exécuteur a rendues", async () => {
    const rendu = son("brut");
    const x = monter({ executer: async () => ({ valeurs: [rendu] }) });
    await nouveau({ executer: async () => ({ valeurs: [rendu] }) }, x);
    const range = x.p.resultats.get("fx")!;
    expect(range).toEqual([{ son: "brut", converti: true }]);
    expect(x.cache.get("fx")!.valeurs).toBe(range);
    expect(x.cache.get("fx")!.valeurs[0]).not.toBe(rendu);
  });

  it("UN RETOUR TOUT-NUL EST UN ÉCHEC, son méta le dit, et rien ne va au cache", async () => {
    const s: Situation = { id: "outil1::cd", executer: async () => ({ valeurs: [null], message: "rien" }) };
    const x = monter(s);
    await nouveau(s, x);
    expect([...x.p.noeudsEnErreur]).toEqual(["outil1::cd"]);
    expect(x.statuts).toEqual([["statut", "outil1::cd", "erreur", "rien"], ["meta", "outil1::cd", "son"]]);
    expect(x.cache.size).toBe(0);
  });

  it("UNE SORTIE NULLE PERMISE TERMINE, et se range au cache", async () => {
    const s: Situation = { fiche: "permis", executer: async () => ({ valeurs: [null] }) };
    const x = monter(s);
    await nouveau(s, x);
    expect(x.statuts).toEqual([["statut", "fx", "termine"]]);
    expect(x.cache.has("fx")).toBe(true);
  });

  it("UNE EXCEPTION REND [null] ET SON MESSAGE, qu'elle vienne de l'exécuteur ou de la conversion", async () => {
    for (const s of [
      { executer: async () => { throw new Error("boum"); } },
      { conversionLeve: true, executer: async () => ({ valeurs: [son("x")] }) },
    ] as Situation[]) {
      const x = monter(s);
      await nouveau(s, x);
      expect(x.p.resultats.get("fx")).toEqual([null]);
      expect(x.statuts[0]?.slice(0, 3)).toEqual(["statut", "fx", "erreur"]);
      expect(typeof x.statuts[0]?.[3]).toBe("string");
      expect(x.cache.size).toBe(0);
    }
  });

  it("UN JETON PÉRIMÉ N'ÉCRIT RIEN AU CACHE, et dit sa génération", async () => {
    const s: Situation = { jeton: { generation: 7, perime: () => true }, executer: async () => ({ valeurs: [son("x")] }) };
    const x = monter(s);
    await nouveau(s, x);
    expect(x.cache.size).toBe(0);
    expect(journal).toContainEqual(["warn", "[cache] resultat perime ecarte : fx (generation 7)"]);
    expect(x.statuts.at(-1)).toEqual(["statut", "fx", "termine"]);
  });

  it("LE TEMPS SE CUMULE SUR LE NŒUD VISIBLE, et non sur la copie", async () => {
    const s: Situation = { id: "d#1::fx", executer: async () => ({ valeurs: [son("x")] }) };
    const x = monter(s);
    await nouveau(s, x);
    expect([...x.p.tempsParVisible]).toEqual([["fx", 5 + 7]]);
    expect(x.cache.get("d#1::fx")!.tempsExecution).toBe(7);
  });

  it("L'ENTRÉE DE CACHE RETIENT CE QUE LE NŒUD A DEMANDÉ, au moment où elle s'écrit", async () => {
    for (const consulte of [true, false]) {
      const s: Situation = { consulte, executer: async () => ({ valeurs: [son("x")] }) };
      const x = monter(s);
      await nouveau(s, x);
      expect(x.cache.get("fx")!.consulteSorties).toBe(consulte);
      expect(x.cache.get("fx")!.empreinteBoucle).toBe("boucle-fx");
    }
  });
});
