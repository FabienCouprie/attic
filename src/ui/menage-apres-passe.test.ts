// ui/menage-apres-passe.test.ts — Ce que le moteur fait après le dernier nœud, éprouvé hors du moteur.
//
// CE QUE CES CAS GARDENT. Ces étapes vivaient au bout de `lancerUnePasse`, et rien ne les éprouvait
// qu'à travers l'application : un conteneur déclaré terminé à tort, une graine absente du message,
// un tampon resté accroché au cache, un lecteur qui emporte le run. Sorties du moteur avec leurs
// tables nommées, elles se jouent ici sur un magasin d'essai et un domaine d'essai. L'ORDRE EST
// ÉPROUVÉ AUSSI : la cause d'une boucle et la graine tirée doivent être dans les messages AVANT la
// pose finale, qui les lit.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ecrireLesLecteurs, menageApresPasse, type ApresLaPasse } from "./menage-apres-passe";
import type { EtatDePasse } from "./etat-de-passe";
import { effacerResultats, resultatDe } from "./resultats";
import { configurerServicesApercu, oublierServicesApercu } from "./services-apercu";
import { poserStatut, reinitialiserStatuts, statutDe } from "./statuts";
import { Respiration } from "../core/respirer";
import type { NoeudG } from "../core";

/** Un son d'essai, que le domaine d'essai dit lourd ou non. */
const son = (lourd: boolean) => ({ tampon: "x", lourd });

function etat(partiel: Partial<EtatDePasse> = {}): EtatDePasse {
  return {
    resultats: new Map(), messages: new Map(), affichageParNoeud: new Map(), designeParNoeud: new Map(),
    tousNoeudsG: [], aretesReelles: [], ordreFiltre: [], noeudsPlats: [],
    estMetaEnScope: () => true, trouverDef: (() => undefined) as never, lecteursAEcrire: new Map(),
    souffle: new Respiration(0), aretesRef: { current: [] }, t: (cle) => cle,
    ...partiel,
  };
}

/** Le journal de ce que le ménage a fait, dans l'ordre, et les tables d'après passe qui y écrivent. */
function apres(partiel: Partial<ApresLaPasse> = {}) {
  const journal: string[] = [];
  const posesFinales: string[][] = [];
  const statuts: [string, string, string | undefined][] = [];
  let noeudsEtat: any[] = [];
  const a: ApresLaPasse = {
    noeudsVisibles: () => [],
    nds: [], cache: new Map(), deplie: { origines: new Map(), problemes: [] }, expansions: new Map(),
    grainesTirees: new Map(), tempsParVisible: new Map(), ecartsParNoeud: new Map(), demandesParNoeud: new Map(),
    ordonnees: [], idsDecoratifs: new Set(), boites: { ids: [], contenu: () => [] },
    dejaPoses: new Set(), aPoser: new Set(),
    poserCeQuiEstPret: async () => { posesFinales.push([...a.aPoser].sort()); journal.push("pose"); a.aPoser.clear(); },
    definirStatut: (id, s, p) => { statuts.push([id, s, p]); poserStatut(id, s, p); journal.push(`statut ${id} ${s}`); },
    setNodes: (f) => { noeudsEtat = typeof f === "function" ? f(noeudsEtat) : f; journal.push("setNodes"); },
    ...partiel,
  };
  return { a, journal, posesFinales, statuts, etatDesNoeuds: (n?: any[]) => { if (n) noeudsEtat = n; return noeudsEtat; } };
}

beforeEach(() => {
  effacerResultats();
  reinitialiserStatuts();
  oublierServicesApercu();
  configurerServicesApercu({
    // Un son lourd n'a d'aperçu utile que regardé ou hors économie : la règle du domaine, réduite.
    apercuUtile: (v, { regarde, economie }) => !(v as { lourd?: boolean })?.lourd || regarde || !economie,
  });
});
afterEach(() => { oublierServicesApercu(); });

describe("le cache, lâché à la fin du run", () => {
  it("UN MEMBRE LOURD D'UNE BULLE REPLIÉE EST LÂCHÉ, un léger est gardé, un nœud hors bulle aussi", async () => {
    const tousNoeudsG: NoeudG[] = [
      { id: "b", data: { ficheId: "bulle::b" } },
      { id: "lourd", data: { ficheId: "son", bulle: "b" } },
      { id: "leger", data: { ficheId: "son", bulle: "b" } },
      { id: "dehors", data: { ficheId: "son" } },
    ];
    const cache = new Map<string, any>([
      ["lourd", { valeurs: [son(true)] }], ["leger", { valeurs: [son(false)] }], ["dehors", { valeurs: [son(true)] }],
    ]);
    const { a } = apres({ cache, noeudsVisibles: () => tousNoeudsG });
    await menageApresPasse(etat({ tousNoeudsG }), a);
    expect([...cache.keys()].sort()).toEqual(["dehors", "leger"]);
  });

  it("LE CORPS D'UNE BOUCLE DÉPLIÉE EST LÂCHÉ, sauf hors économie de mémoire", async () => {
    const copies = () => new Map([["deb#2::echo", "echo"]]);
    const cache = new Map<string, any>([["deb#2::echo", { valeurs: [son(false)] }], ["fin", { valeurs: [son(false)] }]]);
    await menageApresPasse(etat(), apres({ cache, deplie: { origines: copies(), problemes: [] } }).a);
    expect([...cache.keys()]).toEqual(["fin"]);

    const garde = new Map<string, any>([["deb#2::echo", { valeurs: [son(false)] }]]);
    await menageApresPasse(etat({ economieMemoireRef: { current: false } }), apres({ cache: garde, deplie: { origines: copies(), problemes: [] } }).a);
    expect([...garde.keys()]).toEqual(["deb#2::echo"]);
  });
});

describe("les messages complétés, puis la pose finale", () => {
  it("LA CAUSE D'UNE BOUCLE NON DÉPLIÉE SE DIT SUR LE NŒUD VISIBLE, avant la pose, qui la reprend", async () => {
    const passe = etat();
    const { a, journal, posesFinales } = apres({
      deplie: { origines: new Map(), problemes: [{ noeudId: "m::deb", code: "debut-sans-fin" }] },
      expansions: new Map([["m::deb", "m"]]),
      noeudsVisibles: () => [{ id: "m" }],
      dejaPoses: new Set(["m"]),
    });
    await menageApresPasse(passe, a);
    expect(passe.messages.get("m")).toBe("boucle.probleme.debut-sans-fin");
    expect(statutDe("m").statut).toBe("erreur");
    // Déjà posé, il repasse quand même : son message a changé après la boucle.
    expect(posesFinales).toEqual([["m"]]);
    expect(journal.indexOf("statut m erreur")).toBeLessThan(journal.indexOf("pose"));
  });

  it("LA GRAINE TIRÉE S'AJOUTE AU MESSAGE, sauf si le nombre y est déjà", async () => {
    const passe = etat({ messages: new Map([["a", "joué"], ["b", "graine 42 retenue"]]) });
    const { a } = apres({
      grainesTirees: new Map([
        ["a", [{ nom: "Graine", valeur: 7 }]], ["b", [{ nom: "Graine", valeur: 42 }]], ["c", [{ nom: "Hasard", valeur: 3 }]],
      ]),
    });
    await menageApresPasse(passe, a);
    expect(passe.messages.get("a")).toBe("joué · graine 7");
    expect(passe.messages.get("b")).toBe("graine 42 retenue");
    expect(passe.messages.get("c")).toBe("hasard 3");
  });

  it("LA POSE FINALE NE REPREND QUE CE QUI N'EST PAS POSÉ, et ce dont le message a changé", async () => {
    const { a, posesFinales } = apres({
      noeudsVisibles: () => [{ id: "pose" }, { id: "neuf" }, { id: "graine" }],
      dejaPoses: new Set(["pose", "graine"]),
      grainesTirees: new Map([["graine", [{ nom: "Graine", valeur: 1 }]]]),
    });
    await menageApresPasse(etat(), a);
    expect(posesFinales).toEqual([["graine", "neuf"]]);
  });

  it("LE TEMPS ET L'ÉCART DE NIVEAU VONT DANS LE MAGASIN, par nœud visible", async () => {
    const { a } = apres({ tempsParVisible: new Map([["a", 12]]), ecartsParNoeud: new Map([["a", -3]]) });
    await menageApresPasse(etat(), a);
    expect(resultatDe("a")).toMatchObject({ tempsExecution: 12, ecartNiveau: -3 });
  });
});

describe("ce qui part vers l'atelier", () => {
  it("UNE DEMANDE DE GRAPHE PART AU SHELL, une palette à relire aussi, une seule fois", async () => {
    const graphes: string[] = [];
    let relectures = 0;
    const spec = { nodes: [{ ficheId: "gain", label: "Gain" }], edges: [] };
    const { a } = apres({
      demandesParNoeud: new Map<string, any>([["g", { grapheACreer: spec }], ["p1", { paletteARelire: true }], ["p2", { paletteARelire: true }]]),
      onGrapheGenere: (id, s) => graphes.push(`${id}:${s.nodes.length}`),
      onNodeInstalle: () => { relectures++; },
    });
    await menageApresPasse(etat(), a);
    expect(graphes).toEqual(["g:1"]);
    expect(relectures).toBe(1);
  });

  it("LES CHAMPS AUTONOMES SONT REPORTÉS SUR L'ÉTAT, et un nœud inchangé garde son objet", async () => {
    const { a, journal, etatDesNoeuds } = apres({
      nds: [
        { id: "carte", data: { ficheId: "carte", _carteHtmlUrl: "blob:c", _affichage: { x: 1 } } },
        { id: "pareil", data: { ficheId: "x", _carteSonore: "s" } },
        { id: "rien", data: { ficheId: "y" } },
      ],
    });
    const pareil = { id: "pareil", data: { ficheId: "x", _carteSonore: "s" } };
    const rien = { id: "rien", data: { ficheId: "y" } };
    etatDesNoeuds([{ id: "carte", data: { ficheId: "carte" } }, pareil, rien]);
    await menageApresPasse(etat(), a);
    const apresCoup = etatDesNoeuds();
    expect(apresCoup[0].data._carteHtmlUrl).toBe("blob:c");
    // Les canaux déclarés ne passent pas par ici : ils viennent du retour de l'exécuteur ou du cache.
    expect(apresCoup[0].data._affichage).toBeUndefined();
    expect(apresCoup[1]).toBe(pareil);
    expect(apresCoup[2]).toBe(rien);
    expect(journal.filter((j) => j === "setNodes")).toHaveLength(1);
  });

  it("ET RIEN N'EST POSÉ SUR L'ÉTAT quand aucun nœud n'a de champ autonome", async () => {
    const { a, journal } = apres({ nds: [{ id: "a", data: { ficheId: "x" } }] });
    await menageApresPasse(etat(), a);
    expect(journal).not.toContain("setNodes");
  });
});

describe("le statut final d'un conteneur, d'après tout son contenu", () => {
  const boites = { ids: ["b"], contenu: (_c: string, ids: readonly string[]) => ids.filter((id) => id.startsWith("m")) };

  it("TERMINÉ SI TOUS ONT FINI, EN ATTENTE AVEC LE COMPTE SINON, et les décoratifs ne comptent pas", async () => {
    poserStatut("m1", "termine"); poserStatut("m2", "termine");
    const { a, statuts } = apres({ boites, ordonnees: ["m1", "m2", "m3"], idsDecoratifs: new Set(["m3"]) });
    await menageApresPasse(etat({ ordreFiltre: ["m1"] }), a);
    expect(statuts.at(-1)).toEqual(["b", "termine", undefined]);

    reinitialiserStatuts(); poserStatut("m1", "termine");
    const deux = apres({ boites, ordonnees: ["m1", "m2"] });
    await menageApresPasse(etat({ ordreFiltre: ["m1"] }), deux.a);
    expect(deux.statuts.at(-1)).toEqual(["b", "attente", "conteneur.partiel"]);
  });

  it("UN CONTENEUR HORS DU RUN, OU DÉJÀ EN ERREUR, N'EST PAS TOUCHÉ", async () => {
    const horsDuRun = apres({ boites, ordonnees: ["m1"] });
    await menageApresPasse(etat({ ordreFiltre: ["z"] }), horsDuRun.a);
    expect(horsDuRun.statuts).toEqual([]);

    poserStatut("b", "erreur");
    const enErreur = apres({ boites, ordonnees: ["m1"] });
    await menageApresPasse(etat({ ordreFiltre: ["m1"] }), enErreur.a);
    expect(enErreur.statuts).toEqual([]);
  });
});

describe("les lecteurs, écrits après que tout est posé", () => {
  it("CHACUN EST POSÉ DÈS QU'IL EST PRÊT, et un lecteur qui échoue n'emporte pas les suivants", async () => {
    const lecteursAEcrire = new Map<string, () => Promise<string | undefined>>([
      ["a", async () => "blob:a"], ["casse", async () => { throw new Error("encodage"); }], ["b", async () => "blob:b"],
    ]);
    const erreur = console.error;
    console.error = () => {};
    try {
      await ecrireLesLecteurs(etat({ lecteursAEcrire }), {
        signal: new AbortController().signal,
        noeudsVisibles: () => [{ id: "a", data: { ficheId: "echo" } }, { id: "b", data: { ficheId: "gain" } }],
      });
    } finally { console.error = erreur; }
    expect(resultatDe("a")).toMatchObject({ audioResultatUrl: "blob:a", audioResultatNom: "echo.wav" });
    expect(resultatDe("b")).toMatchObject({ audioResultatUrl: "blob:b", audioResultatNom: "gain.wav" });
    expect(resultatDe("casse").audioResultatUrl).toBeUndefined();
    // L'avancement de l'écriture est effacé, même après l'échec.
    expect(statutDe("casse").apercu).toBeUndefined();
  });

  it("UNE ANNULATION ARRÊTE L'ÉCRITURE avant le lecteur suivant", async () => {
    const arret = new AbortController();
    const ecrits: string[] = [];
    const lecteursAEcrire = new Map<string, () => Promise<string | undefined>>([
      ["a", async () => { ecrits.push("a"); arret.abort(); return "blob:a"; }],
      ["b", async () => { ecrits.push("b"); return "blob:b"; }],
    ]);
    await ecrireLesLecteurs(etat({ lecteursAEcrire }), { signal: arret.signal, noeudsVisibles: () => [] });
    expect(ecrits).toEqual(["a"]);
  });
});
