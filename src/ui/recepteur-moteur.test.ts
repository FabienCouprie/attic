// ui/recepteur-moteur.test.ts — Le récepteur pose ce que le moteur dit, et n'attend que ce qui doit l'être.
//
// CE QUI DOIT ÊTRE TENU :
//   - un `statut` se pose dans le magasin tel qu'il arrive, progression du nœud comprise, et une
//     ombre se pose sous son propre identifiant, rattachée à son visible : la remise à zéro du
//     visible l'emporte ;
//   - `noeudFini` met le nœud parmi ce qui est à poser, et ne rend une promesse que s'il est regardé :
//     la boucle n'attend qu'alors. Ce qui est posé est ce que le rendu de l'événement dit, sans une
//     table du moteur ;
//   - les statuts de la préparation se posent dans l'ordre où elle les rend ;
//   - le bilan se pose dans l'ordre du ménage d'avant la coupe : les causes de boucle, la pose finale
//     de ce qui n'est pas posé ou dont le message a changé, les temps et les écarts, les demandes
//     gardées, les champs autonomes, puis le statut des conteneurs, lu sur toutes les passes ;
//   - les lecteurs s'écrivent un par un, et un lecteur qui échoue n'emporte pas les suivants.
//
// La pose du correctif elle-même a ses propres tests (`ui/correctif-resultat.test.ts`) ; le journal
// de passe (`tests-e2e/journal-de-passe.spec.ts`) relève dans l'application l'ordre de tout ce qui
// s'écrit, et doit rester identique.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { creerRecepteurDeLaPasse, poserLesStatutsDeLaPreparation, type EvenementDeLaPasse, type PretsDuRecepteur } from "./recepteur-moteur";
import type { PretsDeLAffichage } from "./correctif-resultat";
import { effacerResultats, resultatDe, surEcriture as surResultats } from "./resultats";
import { oublierServicesApercu } from "./services-apercu";
import { poserStatut, reinitialiserStatuts, statutDe, statutsPoses, surEcriture } from "./statuts";
import { Respiration } from "../core/respirer";

type Bilan = Extract<EvenementDeLaPasse, { genre: "bilan" }>;

/** Ce que l'affichage lit, sans un lecteur ni une arête : de quoi poser un texte. */
const affichage = (partiel: Partial<PretsDeLAffichage> = {}): PretsDeLAffichage => ({
  tousNoeudsG: [], trouverDef: (() => undefined) as never, lecteursAEcrire: new Map(), souffle: new Respiration(0),
  aretesRef: { current: [] }, t: (cle) => cle, ...partiel,
});
/** Un nœud visible d'essai. */
const visible = (id: string) => ({ id, data: { ficheId: "texte" } });
/** Un bilan vide, sauf ce que le cas y met. */
const bilan = (partiel: Partial<Bilan> = {}): Bilan => ({
  genre: "bilan", generation: 1, problemesDeBoucle: [], messagesCompletes: [], rendus: [], temps: [], ecarts: [],
  champsAutonomes: [], conteneurs: [], ...partiel,
});

/** Un récepteur d'essai, et le journal des écritures des deux magasins, dans l'ordre. */
function recepteur(regardes: readonly string[], partiel: Partial<PretsDuRecepteur> = {}) {
  let etatDesNoeuds: any[] = [];
  const journal: string[] = [];
  const r = creerRecepteurDeLaPasse({
    affichage: affichage(), noeudsVisibles: () => [], estRegarde: (id) => regardes.includes(id),
    setNodes: (f) => { etatDesNoeuds = typeof f === "function" ? f(etatDesNoeuds) : f; journal.push("setNodes"); },
    ...partiel,
  });
  return { r, journal, etatDesNoeuds: (n?: any[]) => { if (n) etatDesNoeuds = n; return etatDesNoeuds; } };
}

/** Relève les écritures des deux magasins pendant `faire`, dans l'ordre : le nœud et ce qui change. */
async function releverPendant(faire: () => Promise<void> | void): Promise<string[]> {
  const ecrits: string[] = [];
  const lacherStatuts = surEcriture((id, _avant, apres) => { ecrits.push(`statut ${id} ${apres.statut}`); });
  const lacherResultats = surResultats((id, avant, apres) => {
    // LES CLÉS D'AVANT COMPTENT AUSSI : le magasin retire un champ posé à `undefined`.
    const a = avant as Record<string, unknown>, b = apres as Record<string, unknown>;
    const cles = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    ecrits.push(`resultat ${id} ${cles.filter((k) => b[k] !== a[k]).sort().join(",")}`);
  });
  try { await faire(); } finally { lacherStatuts(); lacherResultats(); }
  return ecrits;
}

beforeEach(() => { reinitialiserStatuts(); effacerResultats(); oublierServicesApercu(); });
afterEach(() => { reinitialiserStatuts(); effacerResultats(); });

describe("le récepteur des événements de la boucle", () => {
  it("POSE UN STATUT TEL QU'IL ARRIVE, et une ombre sous son identifiant, que la remise à zéro du visible emporte", () => {
    const { r } = recepteur([]);
    expect(r.recevoir({ genre: "statut", generation: 3, id: "a", statut: "en_cours", progression: "moitié", progressionDuNoeud: true })).toBeUndefined();
    expect(statutDe("a")).toEqual({ statut: "en_cours", progression: "moitié", progressionDuNoeud: true });
    expect(r.recevoir({ genre: "statutOmbre", generation: 3, id: "d#2::tr", visible: "tr", statut: "termine" })).toBeUndefined();
    expect(statutDe("d#2::tr").statut).toBe("termine");
    reinitialiserStatuts(["tr"]);
    expect(statutsPoses()).toEqual(["a"]);
  });

  it("UN NŒUD FINI REGARDÉ EST POSÉ AUSSITÔT, D'APRÈS SON RENDU, et seul lui rend une promesse", async () => {
    const { r } = recepteur(["c"], { noeudsVisibles: () => [visible("a"), visible("c")] });
    expect(r.recevoir({ genre: "noeudFini", generation: 1, id: "a", rendu: { valeurs: ["texte a"] } })).toBeUndefined();
    const pose = r.recevoir({ genre: "noeudFini", generation: 1, id: "c", rendu: { valeurs: ["texte c"], message: "dit" } });
    expect(pose).toBeInstanceOf(Promise);
    await pose;
    expect(resultatDe("c")).toMatchObject({ scriptGenere: "texte c", audioResultatMessage: "dit" });
    // `a` attend la pose finale du bilan.
    expect(resultatDe("a").scriptGenere).toBeUndefined();
  });

  it("LES STATUTS DE LA PRÉPARATION SE POSENT DANS L'ORDRE où elle les rend", () => {
    const ecrits: string[] = [];
    const lacher = surEcriture((id, _avant, apres) => { ecrits.push(`${id}:${apres.statut}`); });
    try {
      poserLesStatutsDeLaPreparation([{ id: "b", statut: "attente", progression: "boucle" }, { id: "a", statut: "erreur" }, { id: "m", statut: "en_cours" }]);
    } finally { lacher(); }
    expect(ecrits).toEqual(["b:attente", "a:erreur", "m:en_cours"]);
  });
});

describe("le bilan de la passe, posé dans l'ordre du ménage", () => {
  it("LA CAUSE D'UNE BOUCLE PASSE LE NŒUD EN ERREUR AVANT LA POSE FINALE, qui le reprend même déjà posé", async () => {
    const { r } = recepteur(["m"], { noeudsVisibles: () => [visible("m")] });
    await r.recevoir({ genre: "noeudFini", generation: 1, id: "m", rendu: { valeurs: ["avant"] } });
    const ecrits = await releverPendant(() => r.recevoir(bilan({
      problemesDeBoucle: [["m", "boucle vide"]], messagesCompletes: ["m"], rendus: [["m", { valeurs: [], message: "boucle vide" }]],
    })));
    expect(ecrits).toEqual(["statut m erreur", "resultat m audioResultatMessage,scriptGenere"]);
    expect(resultatDe("m").audioResultatMessage).toBe("boucle vide");
  });

  it("LA POSE FINALE PREND CE QUI A FINI SANS ÊTRE POSÉ, puis ce qui ne l'est pas, puis ce dont le message a changé", async () => {
    const { r } = recepteur(["pose", "graine"], {
      noeudsVisibles: () => [visible("pose"), visible("neuf"), visible("graine"), visible("fini")],
    });
    for (const id of ["pose", "graine", "fini", "m::interne"]) {
      await r.recevoir({ genre: "noeudFini", generation: 1, id, rendu: { valeurs: [`${id} 1`] } });
    }
    const rendus: Bilan["rendus"] = ["pose", "neuf", "graine", "fini"].map((id) => [id, { valeurs: [`${id} 2`] }]);
    const ecrits = await releverPendant(() => r.recevoir(bilan({ messagesCompletes: ["graine"], rendus })));
    // `fini` a fini dans la boucle sans être regardé ; `m::interne` n'est pas visible et n'est pas posé.
    expect(ecrits).toEqual(["resultat fini scriptGenere", "resultat neuf scriptGenere", "resultat graine scriptGenere"]);
    expect(resultatDe("pose").scriptGenere).toBe("pose 1");
    expect(resultatDe("graine").scriptGenere).toBe("graine 2");
  });

  it("UN NŒUD VISIBLE SANS RENDU N'EST PAS POSÉ, et ne sera pas repris", async () => {
    const { r } = recepteur([], { noeudsVisibles: () => [visible("vide")] });
    expect(await releverPendant(() => r.recevoir(bilan()))).toEqual([]);
  });

  it("LE TEMPS ET L'ÉCART DE NIVEAU VONT DANS LE MAGASIN APRÈS LA POSE FINALE, par nœud visible", async () => {
    const { r } = recepteur([], { noeudsVisibles: () => [visible("a")] });
    const ecrits = await releverPendant(() => r.recevoir(bilan({
      rendus: [["a", { valeurs: ["a"] }]], temps: [["a", 12]], ecarts: [["a", -3]],
    })));
    expect(ecrits).toEqual(["resultat a scriptGenere", "resultat a tempsExecution", "resultat a ecartNiveau"]);
    expect(resultatDe("a")).toMatchObject({ tempsExecution: 12, ecartNiveau: -3 });
  });

  it("UNE DEMANDE DE GRAPHE ATTEND LE BILAN POUR PARTIR, une palette à relire aussi, une seule fois", async () => {
    const graphes: string[] = [];
    let relectures = 0;
    const { r } = recepteur([], {
      onGrapheGenere: (id, s) => graphes.push(`${id}:${s.nodes.length}`),
      onNodeInstalle: () => { relectures++; },
    });
    const spec = { nodes: [{ ficheId: "gain", label: "Gain" }], edges: [] };
    r.recevoir({ genre: "demande", generation: 1, id: "g", demande: { grapheACreer: spec } });
    r.recevoir({ genre: "demande", generation: 1, id: "p1", demande: { paletteARelire: true } });
    r.recevoir({ genre: "demande", generation: 1, id: "p2", demande: { paletteARelire: true } });
    expect(graphes).toEqual([]);
    await r.recevoir(bilan());
    expect(graphes).toEqual(["g:1"]);
    expect(relectures).toBe(1);
  });

  it("LES CHAMPS AUTONOMES SONT REPORTÉS SUR L'ÉTAT, et un nœud inchangé garde son objet", async () => {
    const { r, journal, etatDesNoeuds } = recepteur([]);
    const pareil = { id: "pareil", data: { ficheId: "x", _carteSonore: "s" } };
    const rien = { id: "rien", data: { ficheId: "y" } };
    etatDesNoeuds([{ id: "carte", data: { ficheId: "carte" } }, pareil, rien]);
    await r.recevoir(bilan({ champsAutonomes: [["carte", { _carteHtmlUrl: "blob:c" }], ["pareil", { _carteSonore: "s" }]] }));
    const apresCoup = etatDesNoeuds();
    expect(apresCoup[0].data._carteHtmlUrl).toBe("blob:c");
    expect(apresCoup[1]).toBe(pareil);
    expect(apresCoup[2]).toBe(rien);
    expect(journal.filter((j) => j === "setNodes")).toHaveLength(1);

    const sans = recepteur([]);
    await sans.r.recevoir(bilan());
    expect(sans.journal).not.toContain("setNodes");
  });

  it("UN CONTENEUR EST TERMINÉ SI TOUS ONT FINI, EN ATTENTE AVEC LE COMPTE SINON, et laissé s'il est en erreur", async () => {
    poserStatut("m1", "termine"); poserStatut("m2", "termine");
    await recepteur([]).r.recevoir(bilan({ conteneurs: [["b", ["m1", "m2"]]] }));
    expect(statutDe("b").statut).toBe("termine");

    reinitialiserStatuts(); poserStatut("m1", "termine");
    await recepteur([]).r.recevoir(bilan({ conteneurs: [["b", ["m1", "m2"]]] }));
    expect(statutDe("b")).toMatchObject({ statut: "attente", progression: "conteneur.partiel" });

    reinitialiserStatuts(); poserStatut("b", "erreur", "le sien"); poserStatut("m1", "termine");
    const ecrits = await releverPendant(() => recepteur([]).r.recevoir(bilan({ conteneurs: [["b", ["m1"]]] })));
    expect(ecrits).toEqual([]);
    expect(statutDe("b").progression).toBe("le sien");
  });
});

describe("les lecteurs, écrits après que tout est posé", () => {
  it("CHACUN EST POSÉ DÈS QU'IL EST PRÊT, et un lecteur qui échoue n'emporte pas les suivants", async () => {
    const lecteursAEcrire = new Map<string, () => Promise<string | undefined>>([
      ["a", async () => "blob:a"], ["casse", async () => { throw new Error("encodage"); }], ["b", async () => "blob:b"],
    ]);
    const { r } = recepteur([], {
      affichage: affichage({ lecteursAEcrire }),
      noeudsVisibles: () => [{ id: "a", data: { ficheId: "echo" } }, { id: "b", data: { ficheId: "gain" } }],
    });
    const erreur = console.error;
    console.error = () => {};
    try {
      await r.ecrireLesLecteurs(new AbortController().signal);
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
    await recepteur([], { affichage: affichage({ lecteursAEcrire }) }).r.ecrireLesLecteurs(arret.signal);
    expect(ecrits).toEqual(["a"]);
  });
});
