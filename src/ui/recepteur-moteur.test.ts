// ui/recepteur-moteur.test.ts — Le récepteur pose ce que le moteur dit, et n'attend que ce qui doit l'être.
//
// CE QUI DOIT ÊTRE TENU :
//   - un `statut` se pose dans le magasin tel qu'il arrive, progression du nœud comprise, et une
//     ombre se pose sous son propre identifiant, rattachée à son visible : la remise à zéro du
//     visible l'emporte ;
//   - `noeudFini` met le nœud parmi ce qui est à poser, et ne rend une promesse que s'il est regardé :
//     la boucle n'attend qu'alors. Ce qui est posé est ce que le rendu de l'événement dit, sans une
//     table du moteur ;
//   - `passeCommencee` dit que le moteur tourne pour une passe globale seulement, pose les statuts de
//     la préparation dans l'ordre où elle les rend, et donne les nœuds de la passe : un membre de
//     bulle repliée n'est pas regardé, même sélectionné ;
//   - `passeTerminee` remet à zéro les « en cours » d'un arrêt, dit que le moteur ne tourne plus
//     pour une passe globale, et efface la priorité ;
//   - le bilan se pose dans l'ordre du ménage d'avant la coupe : les causes de boucle, la pose finale
//     de ce qui n'est pas posé ou dont le message a changé, les temps et les écarts, les demandes
//     gardées, les champs autonomes, puis le statut des conteneurs, lu sur toutes les passes ;
//   - les lecteurs s'écrivent un par un, et un lecteur qui échoue n'emporte pas les suivants.
//
// La pose du correctif elle-même a ses propres tests (`ui/correctif-resultat.test.ts`) ; le journal
// de passe (`tests-e2e/journal-de-passe.spec.ts`) relève dans l'application l'ordre de tout ce qui
// s'écrit, et doit rester identique.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { creerRecepteurDuMoteur, type LiaisonDuRecepteur, type PretsDuRecepteur } from "./recepteur-moteur";
import type { EvenementDuMoteur } from "../core/protocole-moteur";
import { definirPrioritaire, noeudPrioritaire } from "./priorite";
import { effacerResultats, resultatDe, surEcriture as surResultats } from "./resultats";
import { oublierServicesApercu } from "./services-apercu";
import { poserStatut, reinitialiserStatuts, statutDe, statutsPoses, surEcriture } from "./statuts";
import { Respiration } from "../core/respirer";

type Bilan = Extract<EvenementDuMoteur<unknown>, { genre: "bilan" }>;
type Commencee = Extract<EvenementDuMoteur<unknown>, { genre: "passeCommencee" }>;

/**
 * Ce que l'affichage lit, sans un lecteur ni une arête : de quoi poser un texte. UN MÉTA EST OUVERT,
 * pour que seul un nœud sélectionné soit regardé : sans cela, tout nœud sans arête sortante le serait.
 */
const affichage = (): PretsDuRecepteur["affichage"] => ({
  trouverDef: (() => undefined) as never,
  aretesRef: { current: [] }, pileMetaRef: { current: [{ metaId: "m", nom: "m" }] },
});
/** Une passe qui commence, sur ces nœuds, sans statut. */
const commencee = (partiel: Partial<Commencee> = {}): Commencee => ({
  genre: "passeCommencee", generation: 1, ordre: [], statuts: [], noeuds: [], numero: 0, ...partiel,
});
/** Un nœud visible d'essai. */
const visible = (id: string) => ({ id, data: { ficheId: "texte" } });
/** Un bilan vide, sauf ce que le cas y met. */
const bilan = (partiel: Partial<Bilan> = {}): Bilan => ({
  genre: "bilan", generation: 1, problemesDeBoucle: [], messagesCompletes: [], rendus: [], temps: [], ecarts: [],
  champsAutonomes: [], conteneurs: [], ...partiel,
});

/**
 * Un récepteur d'essai, et le journal de ce qu'il écrit hors des magasins, dans l'ordre. LES NŒUDS
 * REGARDÉS SONT SÉLECTIONNÉS dans les nœuds visibles que le cas donne : c'est ce que le récepteur lit.
 * Les rappels de l'atelier passent par la liaison, que le cas donne ou non.
 */
function recepteur(regardes: readonly string[], partiel: Partial<PretsDuRecepteur> & Omit<LiaisonDuRecepteur, "t"> = {}) {
  let etatDesNoeuds: any[] = [];
  const journal: string[] = [];
  const { onGrapheGenere, onNodeInstalle, ...prets } = partiel;
  const visibles = prets.noeudsVisibles ?? (() => []);
  const r = creerRecepteurDuMoteur({
    affichage: affichage(), respiration: () => new Respiration(0),
    setNodes: (f) => { etatDesNoeuds = typeof f === "function" ? f(etatDesNoeuds) : f; journal.push("setNodes"); },
    enExecution: (tourne) => { journal.push(`enExecution ${tourne}`); },
    liaison: () => ({ t: (cle) => cle, onGrapheGenere, onNodeInstalle }),
    ...prets,
    noeudsVisibles: () => visibles().map((n) => regardes.includes(n.id) ? { ...n, selected: true } : n),
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

beforeEach(() => { reinitialiserStatuts(); effacerResultats(); oublierServicesApercu(); definirPrioritaire(null); });
afterEach(() => { reinitialiserStatuts(); effacerResultats(); definirPrioritaire(null); });

describe("le début et la fin d'une passe", () => {
  it("UNE PASSE GLOBALE DIT QUE LE MOTEUR TOURNE, PUIS POSE LES STATUTS DE LA PRÉPARATION dans l'ordre où elle les rend", () => {
    const { r, journal } = recepteur([]);
    const ecrits: string[] = [];
    const lacher = surEcriture((id, _avant, apres) => { ecrits.push(`${id}:${apres.statut}`); journal.push(`statut ${id}`); });
    try {
      const statuts = [{ id: "b", statut: "attente", progression: "boucle" }, { id: "a", statut: "erreur" }, { id: "m", statut: "en_cours" }];
      expect(r.recevoir(commencee({ statuts }))).toBeUndefined();
    } finally { lacher(); }
    expect(ecrits).toEqual(["b:attente", "a:erreur", "m:en_cours"]);
    expect(statutDe("b").progression).toBe("boucle");
    expect(journal).toEqual(["enExecution true", "statut b", "statut a", "statut m"]);
  });

  it("UNE PASSE CIBLÉE NE DIT RIEN DU MOTEUR, ni en commençant ni en finissant", () => {
    const { r, journal } = recepteur([]);
    r.recevoir(commencee({ cible: "c" }));
    r.recevoir({ genre: "passeTerminee", generation: 1, cible: "c", raison: "fin" });
    expect(journal).toEqual([]);
  });

  it("LA FIN D'UNE PASSE EFFACE LA PRIORITÉ, et seul un arrêt remet à zéro ce qui restait « en cours »", () => {
    const fin = recepteur([]);
    poserStatut("x", "en_cours"); poserStatut("y", "termine"); definirPrioritaire("x");
    fin.r.recevoir({ genre: "passeTerminee", generation: 1, raison: "fin" });
    expect(statutDe("x").statut).toBe("en_cours");
    expect(noeudPrioritaire()).toBeNull();
    expect(fin.journal).toEqual(["enExecution false"]);

    const tombee = recepteur([]);
    tombee.r.recevoir({ genre: "passeTerminee", generation: 2, raison: "erreur" });
    expect(statutDe("x").statut).toBe("en_cours");

    const arret = recepteur([]);
    arret.r.recevoir({ genre: "passeTerminee", generation: 3, raison: "arret" });
    expect(statutsPoses()).toEqual(["y"]);
  });

  it("LES NŒUDS DE LA PASSE DISENT QUI EST DANS UNE BULLE REPLIÉE : celui-là n'est pas regardé, même sélectionné", async () => {
    const membre = { id: "m", data: { ficheId: "texte", bulle: "B" } };
    const { r } = recepteur(["m"], { noeudsVisibles: () => [membre] });
    const avant = r.recevoir({ genre: "noeudFini", generation: 1, id: "m", rendu: { valeurs: ["avant"] } });
    expect(avant).toBeInstanceOf(Promise);
    await avant;
    r.recevoir(commencee({ noeuds: [{ id: "B", data: { ficheId: "bulle::B" } }, membre] }));
    expect(r.recevoir({ genre: "noeudFini", generation: 1, id: "m", rendu: { valeurs: ["après"] } })).toBeUndefined();
  });
});

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

describe("ce qui est périmé est écarté (pièce P6)", () => {
  it("UNE REMISE À ZÉRO ÉCARTE CE QUE LA PASSE DIT ENCORE DE CES NŒUDS, de leur contenu, et d'eux seuls", async () => {
    const { r } = recepteur([], { noeudsVisibles: () => [visible("m"), visible("b")] });
    r.recevoir(commencee({ numero: 3 }));
    r.recevoir({ genre: "perimes", generation: 1, numero: 4, ids: ["m"] });
    const ecrits = await releverPendant(async () => {
      r.recevoir({ genre: "statut", generation: 1, id: "m", statut: "termine", progressionDuNoeud: false });
      r.recevoir({ genre: "statutOmbre", generation: 1, id: "m::x", visible: "m", statut: "termine" });
      r.recevoir({ genre: "statut", generation: 1, id: "b", statut: "termine", progressionDuNoeud: false });
      await r.recevoir(bilan({
        rendus: [["m", { valeurs: ["m"] }], ["b", { valeurs: ["b"] }]],
        temps: [["m", 5], ["b", 6]], ecarts: [["m::x", -1], ["b", -2]],
      }));
    });
    expect(ecrits).toEqual(["statut b termine", "resultat b scriptGenere", "resultat b tempsExecution", "resultat b ecartNiveau"]);
  });

  it("UNE PASSE PARTIE APRÈS LA REMISE N'EST PAS ÉCARTÉE", () => {
    const { r } = recepteur([]);
    r.recevoir({ genre: "perimes", generation: 1, numero: 4, ids: ["m"] });
    r.recevoir(commencee({ numero: 4 }));
    r.recevoir({ genre: "statut", generation: 2, id: "m", statut: "termine", progressionDuNoeud: false });
    expect(statutDe("m").statut).toBe("termine");
  });

  it("UN GRAPHE ABANDONNÉ ÉCARTE TOUT, lecteurs compris, et ne laisse personne « en cours »", async () => {
    const ecrits: string[] = [];
    const lecteursAEcrire = new Map<string, () => Promise<string | undefined>>([["a", async () => { ecrits.push("a"); return "blob:a"; }]]);
    const { r } = recepteur([], { lecteurs: () => lecteursAEcrire, noeudsVisibles: () => [visible("a")] });
    r.recevoir(commencee());
    r.recevoir({ genre: "statut", generation: 1, id: "a", statut: "en_cours", progressionDuNoeud: false });
    r.recevoir({ genre: "perimes", generation: 1, numero: 1, ids: "tout" });
    r.recevoir({ genre: "statut", generation: 1, id: "a", statut: "termine", progressionDuNoeud: false });
    expect(statutDe("a").statut).toBe("en_cours");
    await r.recevoir(bilan({ rendus: [["a", { valeurs: ["a"] }]] }));
    expect(ecrits).toEqual([]);
    expect(resultatDe("a").scriptGenere).toBeUndefined();
    r.recevoir({ genre: "passeTerminee", generation: 1, raison: "fin" });
    expect(statutsPoses()).toEqual([]);
  });
});

describe("les lecteurs, écrits après que tout est posé, dans la promesse du bilan", () => {
  it("CHACUN EST POSÉ DÈS QU'IL EST PRÊT, et un lecteur qui échoue n'emporte pas les suivants", async () => {
    const lecteursAEcrire = new Map<string, () => Promise<string | undefined>>([
      ["a", async () => "blob:a"], ["casse", async () => { throw new Error("encodage"); }], ["b", async () => "blob:b"],
    ]);
    const { r } = recepteur([], {
      lecteurs: () => lecteursAEcrire,
      noeudsVisibles: () => [{ id: "a", data: { ficheId: "echo" } }, { id: "b", data: { ficheId: "gain" } }],
    });
    r.recevoir(commencee());
    const erreur = console.error;
    console.error = () => {};
    try {
      await r.recevoir(bilan());
    } finally { console.error = erreur; }
    expect(resultatDe("a")).toMatchObject({ audioResultatUrl: "blob:a", audioResultatNom: "echo.wav" });
    expect(resultatDe("b")).toMatchObject({ audioResultatUrl: "blob:b", audioResultatNom: "gain.wav" });
    expect(resultatDe("casse").audioResultatUrl).toBeUndefined();
    // L'avancement de l'écriture est effacé, même après l'échec.
    expect(statutDe("casse").apercu).toBeUndefined();
  });

  it("UNE PASSE ARRÊTÉE N'ÉCRIT PAS LE LECTEUR SUIVANT, et la passe d'après repart d'un état neuf", async () => {
    const ecrits: string[] = [];
    let arreter = () => {};
    const lecteursAEcrire = new Map<string, () => Promise<string | undefined>>([
      ["a", async () => { ecrits.push("a"); arreter(); return "blob:a"; }],
      ["b", async () => { ecrits.push("b"); return "blob:b"; }],
    ]);
    const { r } = recepteur([], { lecteurs: () => lecteursAEcrire });
    arreter = () => { r.recevoir({ genre: "passeArretee", generation: 1 }); };
    r.recevoir(commencee());
    await r.recevoir(bilan());
    expect(ecrits).toEqual(["a"]);

    // LA PASSE SUIVANTE N'EST PAS ARRÊTÉE : `passeCommencee` remet l'état à neuf.
    arreter = () => {};
    r.recevoir(commencee({ generation: 2 }));
    await r.recevoir(bilan({ generation: 2 }));
    expect(ecrits).toEqual(["a", "a", "b"]);
  });
});
