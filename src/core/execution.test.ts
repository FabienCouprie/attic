// core/execution.test.ts — Protection de la règle « tout-null = échec ».
// Vérifie que les nœuds déclarant sortieNullePermise (transcripteur MIDI vide,
// nœuds-frontière) ne sont PAS marqués en erreur par le moteur.
//
// ET LA DÉCISION D'AVANT L'EXÉCUTION, plus bas : son témoin est l'ancien bloc du moteur.
import { afterEach, describe, it, expect } from "vitest";
import { deciderDuNoeud, estResultatEnErreur, type EntreesDeDecision } from "./execution";
import { peutReutiliserLeCache, sourceRetraitee, type CachePrecedent } from "./cache-execution";
import { empreinteEntrees, empreinteParametres, empreinteSorties, empreinteValeursEntrantes } from "./graphe";
import type { AreteG, NoeudG } from "./meta";
import { configurerServicesDomaine, oublierServicesDomaine, servicesDomaine } from "./services-domaine";
import type { PluginDef } from "./types";

function fakeDef(over: Partial<PluginDef<any, any>> = {}): PluginDef<any, any> {
  return {
    id: "test",
    nom: "Test",
    univers: "U",
    famille: "F",
    resume: "r",
    entrees: [],
    sorties: [{ nom: "Out", type: "audio" }],
    parametres: [],
    executer: async () => ({ valeurs: [] }),
    ...over,
  };
}

describe("estResultatEnErreur", () => {
  it("marque en erreur un résultat entièrement null sur un nœud à sorties", () => {
    const def = fakeDef();
    expect(estResultatEnErreur(def, { valeurs: [null] })).toBe(true);
    expect(estResultatEnErreur(def, { valeurs: [null, null] })).toBe(true);
  });

  it("ne marque PAS en erreur si la fiche déclare sortieNullePermise", () => {
    const def = fakeDef({ sortieNullePermise: true });
    expect(estResultatEnErreur(def, { valeurs: [null] })).toBe(false);
    expect(estResultatEnErreur(def, { valeurs: [null, null] })).toBe(false);
  });

  it("ne marque PAS en erreur un nœud sans sortie", () => {
    const def = fakeDef({ sorties: [] });
    expect(estResultatEnErreur(def, { valeurs: [] })).toBe(false);
  });

  it("respecte le drapeau erreur: true quelle que soit la sortie", () => {
    const def = fakeDef({ sortieNullePermise: true });
    expect(estResultatEnErreur(def, { valeurs: [42], erreur: true })).toBe(true);
  });

  it("ne marque PAS en erreur un résultat partiellement null", () => {
    const def = fakeDef({ sorties: [{ nom: "A", type: "audio" }, { nom: "B", type: "texte" }] });
    expect(estResultatEnErreur(def, { valeurs: [null, "texte"] })).toBe(false);
  });
});

// ═══ LA DÉCISION D'AVANT L'EXÉCUTION ═══
//
// LE TÉMOIN EST L'ANCIEN BLOC, recopié depuis `ui/hooks/useExecutionGraphe.ts` (master 2f5a67f,
// l. 381 à 434), ses branches rendues au lieu d'être appliquées : là où il faisait `continue` ou
// posait un statut, il rend le verdict correspondant. Chaque question qu'il posait — aux sauts de
// boucle, au cache, à la fiche, aux réglages de projet — est écrite dans un journal, et la décision
// doit rendre le même verdict ET le même journal : c'est ce qui tient l'ordre d'évaluation, et non
// le seul résultat.

type Journal = string[];

const n = (id: string, ficheId: string, parametres: Record<string, unknown> = {}): NoeudG =>
  ({ id, data: { ficheId, parametres } });
const a = (source: string, target: string, si = 0, ti = 0): AreteG =>
  ({ id: `${source}-${target}`, source, target, sourceHandle: `out:${si}`, targetHandle: `in:${ti}` });

/** a → b → c, et une branche sœur x → y. « jamais » refuse le cache. */
const NOEUDS = [n("a", "src", { F: 440 }), n("b", "fx", { Gain: 3 }), n("c", "fx"), n("x", "src"), n("y", "jamais")];
const ARETES = [a("a", "b"), a("b", "c"), a("x", "y")];
const FICHES: Record<string, { jamaisCache?: boolean }> = { src: {}, fx: {}, jamais: { jamaisCache: true } };

interface Situation {
  noeudsEnErreur?: string[];
  traitesCeRun?: string[];
  cache?: Record<string, CachePrecedent>;
  sautees?: string[];
  reprises?: string[];
}

/** Les prêts d'une situation, qui écrivent chaque question posée dans le journal. */
function monter(s: Situation) {
  const journal: Journal = [];
  const cache = new Map(Object.entries(s.cache ?? {}));
  const entrees: EntreesDeDecision<CachePrecedent> = {
    noeudsEnErreur: new Set(s.noeudsEnErreur ?? []),
    noeuds: NOEUDS, aretes: ARETES,
    resultats: new Map<string, unknown[]>([["a", ["un son"]], ["x", ["un autre"]]]),
    traitesCeRun: new Set(s.traitesCeRun ?? []),
    lireCache: (id) => { journal.push(`cache ${id}`); return cache.get(id); },
    sauts: {
      copieSautee: (id) => { journal.push(`copieSautee ${id}`); return (s.sautees ?? []).includes(id); },
      finReprise: (id) => { journal.push(`finReprise ${id}`); return (s.reprises ?? []).includes(id); },
    },
    trouverDef: (f) => { journal.push(`fiche ${f}`); return FICHES[f]; },
  };
  configurerServicesDomaine({ reglagesDeProjet: () => { journal.push("reglages"); return { frequence: 48000 }; } });
  return { journal, entrees };
}

/** L'ANCIEN BLOC, ses noms d'origine : `aretes` et `aretesG` étaient le même tableau, `deplie.aretes`. */
function temoin(nodeId: string, e: EntreesDeDecision<CachePrecedent>) {
  const { noeudsEnErreur, traitesCeRun, resultats, sauts, trouverDef } = e;
  const aretesG = e.aretes; const aretes = e.aretes; const nds = e.noeuds;
  const cacheExec = { current: { get: e.lireCache } };
  // Sauter les nœuds en erreur (connexion illégale) — déjà marqués « erreur »
  if (noeudsEnErreur.has(nodeId)) return { genre: "dejaEnErreur" };
  const entreeFautive = aretesG.find((a) => a.target === nodeId && noeudsEnErreur.has(a.source));
  if (entreeFautive) return { genre: "entreeEnErreur", source: entreeFautive.source };
  const node = nds.find((n) => n.id === nodeId);
  if (!node) return { genre: "absent" };
  if (sauts.copieSautee(nodeId, traitesCeRun)) return { genre: "copieSautee", noeud: node };
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
  if (cacheIdentique) return { genre: "cache", noeud: node, entree: entreeCache };
  return { genre: "executer", noeud: node, empreintes: { hashParams, hashEntree: monHashEntree, hashSorties, hashValeursEntree } };
}

/** Les empreintes qu'un nœud porte dans la situation sans cache : de quoi écrire une entrée identique. */
function empreintesDe(id: string): CachePrecedent {
  const d = deciderDuNoeud(id, monter({}).entrees);
  if (d.genre !== "executer") throw new Error(`${id} devait s'exécuter`);
  return { ...d.empreintes };
}

describe("la décision d'avant l'exécution", () => {
  afterEach(() => oublierServicesDomaine());

  const SITUATIONS: [string, Situation][] = [
    ["sans cache", {}],
    ["déjà en erreur", { noeudsEnErreur: ["b"] }],
    ["entrée en erreur", { noeudsEnErreur: ["a"] }],
    ["copie sautée", { sautees: ["b", "y"] }],
    ["cache identique", { cache: { b: empreintesDe("b"), c: empreintesDe("c"), y: empreintesDe("y") } }],
    ["source retraitée", { traitesCeRun: ["a"], cache: { b: empreintesDe("b") } }],
    ["réglage changé, fin reprise", { cache: { b: { ...empreintesDe("b"), hashParams: "autre" } }, reprises: ["b"] }],
    ["réglage changé, sans reprise", { cache: { b: { ...empreintesDe("b"), hashParams: "autre" } } }],
    ["câblage aval changé, consulté", { cache: { b: { ...empreintesDe("b"), hashSorties: "autre", consulteSorties: true } } }],
    ["câblage aval changé, jamais consulté", { cache: { b: { ...empreintesDe("b"), hashSorties: "autre" } } }],
  ];

  it("REND LE VERDICT DU MOTEUR, ET POSE SES QUESTIONS DANS LE MÊME ORDRE, sur dix situations", () => {
    let comparees = 0;
    const genres = new Set<string>();
    for (const [nom, s] of SITUATIONS) {
      for (const id of ["a", "b", "c", "x", "y", "absent"]) {
        const ancien = monter(s);
        const attendu = temoin(id, ancien.entrees);
        genres.add(attendu.genre);
        const nouveau = monter(s);
        const rendu = deciderDuNoeud(id, nouveau.entrees);
        expect(rendu, `${nom}, ${id}`).toEqual(attendu);
        expect(nouveau.journal, `${nom}, ${id} : les questions`).toEqual(ancien.journal);
        comparees++;
      }
    }
    expect(comparees).toBe(60);
    // LE TÉMOIN A RENDU LES SIX VERDICTS : une comparaison qui ne verrait que des nœuds à exécuter
    // serait verte sans rien éprouver de la décision.
    expect([...genres].sort()).toEqual(["absent", "cache", "copieSautee", "dejaEnErreur", "entreeEnErreur", "executer"]);
  });

  it("UNE ENTRÉE EN ERREUR SE PROPAGE, que la source ait échoué à la validation ou au run", () => {
    // À la validation : la source est en erreur avant le run.
    const validation = monter({ noeudsEnErreur: ["a"] });
    expect(deciderDuNoeud("b", validation.entrees)).toEqual({ genre: "entreeEnErreur", source: "a" });
    // Au run : le moteur l'ajoute en chemin, et le nœud suivant le voit.
    const run = monter({});
    expect(deciderDuNoeud("a", run.entrees).genre).toBe("executer");
    (run.entrees.noeudsEnErreur as Set<string>).add("a");
    expect(deciderDuNoeud("b", run.entrees)).toEqual({ genre: "entreeEnErreur", source: "a" });
    // Et une branche sœur n'en sait rien.
    expect(deciderDuNoeud("y", run.entrees).genre).toBe("executer");
  });

  it("UNE COPIE SAUTÉE NE DEMANDE NI CACHE NI EMPREINTE", () => {
    const s = monter({ sautees: ["b"] });
    expect(deciderDuNoeud("b", s.entrees).genre).toBe("copieSautee");
    expect(s.journal).toEqual(["copieSautee b"]);
  });

  it("UNE FIN REPRISE REND SON ENTRÉE SANS COMPARER SES EMPREINTES", () => {
    const entree = { ...empreintesDe("b"), hashParams: "réglage d'un autre run" };
    expect(deciderDuNoeud("b", monter({ cache: { b: entree }, reprises: ["b"] }).entrees))
      .toEqual({ genre: "cache", noeud: NOEUDS[1], entree });
    expect(deciderDuNoeud("b", monter({ cache: { b: entree } }).entrees).genre).toBe("executer");
  });

  it("UN NŒUD `jamaisCache` S'EXÉCUTE, son entrée fût-elle identique", () => {
    expect(deciderDuNoeud("y", monter({ cache: { y: empreintesDe("y") } }).entrees).genre).toBe("executer");
    expect(deciderDuNoeud("c", monter({ cache: { c: empreintesDe("c") } }).entrees).genre).toBe("cache");
  });

  it("UNE SOURCE RETRAITÉE FAIT REJOUER SON AVAL, et lui seul", () => {
    const s = monter({ traitesCeRun: ["a"], cache: { b: empreintesDe("b"), y: empreintesDe("y") } });
    expect(deciderDuNoeud("b", s.entrees).genre).toBe("executer");
  });

  it("LE CÂBLAGE AVAL NE COMPTE QUE POUR QUI L'A CONSULTÉ", () => {
    const consulte = { ...empreintesDe("b"), hashSorties: "un autre câblage", consulteSorties: true };
    const ignore = { ...empreintesDe("b"), hashSorties: "un autre câblage" };
    expect(deciderDuNoeud("b", monter({ cache: { b: consulte } }).entrees).genre).toBe("executer");
    expect(deciderDuNoeud("b", monter({ cache: { b: ignore } }).entrees).genre).toBe("cache");
  });

  it("LES RÉGLAGES DE PROJET ENTRENT DANS LA CLÉ, lus à chaque nœud", () => {
    const entree = empreintesDe("b");
    const s = monter({ cache: { b: entree } });
    configurerServicesDomaine({ reglagesDeProjet: () => ({ frequence: 44100 }) });
    expect(deciderDuNoeud("b", s.entrees).genre).toBe("executer");
  });
});
