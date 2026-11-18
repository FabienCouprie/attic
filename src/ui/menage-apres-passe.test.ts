// ui/menage-apres-passe.test.ts — Ce que le moteur fait après le dernier nœud, éprouvé hors du moteur.
//
// CE QUE CES CAS GARDENT. Ces étapes vivaient au bout de `lancerUnePasse`, et rien ne les éprouvait
// qu'à travers l'application : un conteneur déclaré terminé à tort, une graine absente du message,
// un tampon resté accroché au cache. Sorties du moteur avec leurs tables nommées, elles se jouent ici
// sur un domaine d'essai.
//
// DEPUIS LA PIÈCE P4B, LE MÉNAGE EST LA MOITIÉ DU MOTEUR : il lâche le cache, complète les messages et
// dit ce que la passe a compté et choisi, par des `demande` puis un `bilan`. Ce qui s'en écrit dans
// les magasins, c'est le récepteur qui le pose, et `ui/recepteur-moteur.test.ts` le tient. L'ORDRE
// EST ÉPROUVÉ AUSSI : la cause d'une boucle et la graine tirée doivent être dans les messages AVANT
// que les rendus de la pose finale ne soient choisis.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { menageApresPasse, type ApresLaPasse, type EvenementDuMenage } from "./menage-apres-passe";
import type { EtatDePasse } from "./etat-de-passe";
import { creerCacheDuMoteur } from "./moteur/cache";
import { configurerServicesApercu, oublierServicesApercu } from "./services-apercu";
import type { NoeudG } from "../core";

/** Un son d'essai, que le domaine d'essai dit lourd ou non. */
const son = (lourd: boolean) => ({ tampon: "x", lourd });
/** Un cache du moteur rempli de ces entrées, dans cet ordre. */
const cacheDe = (paires: [string, unknown][]) => {
  const c = creerCacheDuMoteur();
  for (const [id, e] of paires) c.ecrire(id, e as never);
  return c;
};
/** Un nœud visible d'essai : le choix des valeurs lit sa fiche. */
const visible = (id: string, ficheId = "son"): NoeudG => ({ id, data: { ficheId } });

function etat(partiel: Partial<EtatDePasse> = {}): EtatDePasse {
  return {
    resultats: new Map(), messages: new Map(), affichageParNoeud: new Map(), designeParNoeud: new Map(),
    tousNoeudsG: [], aretesReelles: [], ordreFiltre: [], noeudsPlats: [],
    estMetaEnScope: () => true, trouverDef: () => undefined, t: (cle) => cle,
    ...partiel,
  };
}

/** Ce que le ménage dit, dans l'ordre, et les tables d'après passe qu'il lit. */
function apres(partiel: Partial<ApresLaPasse> = {}) {
  const dits: EvenementDuMenage[] = [];
  const a: ApresLaPasse = {
    noeudsVisibles: () => [],
    nds: [], cache: creerCacheDuMoteur(), deplie: { origines: new Map(), problemes: [] }, expansions: new Map(),
    grainesTirees: new Map(), tempsParVisible: new Map(), ecartsParNoeud: new Map(), demandesParNoeud: new Map(),
    ordonnees: [], idsDecoratifs: new Set(), boites: { ids: [], contenu: () => [] },
    generation: 5, emettre: (e) => { dits.push(e); },
    ...partiel,
  };
  /** Le bilan, qui doit être le dernier mot du ménage. */
  const bilan = () => {
    const b = dits.at(-1);
    if (b?.genre !== "bilan") throw new Error("le ménage n'a pas fini par son bilan");
    return b;
  };
  return { a, dits, bilan };
}

beforeEach(() => {
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
    const cache = cacheDe([
      ["lourd", { valeurs: [son(true)] }], ["leger", { valeurs: [son(false)] }], ["dehors", { valeurs: [son(true)] }],
    ]);
    const { a } = apres({ cache, noeudsVisibles: () => tousNoeudsG });
    await menageApresPasse(etat({ tousNoeudsG }), a);
    expect([...cache.entrees().keys()].sort()).toEqual(["dehors", "leger"]);
  });

  it("LE CORPS D'UNE BOUCLE DÉPLIÉE EST LÂCHÉ, sauf hors économie de mémoire", async () => {
    const copies = () => new Map([["deb#2::echo", "echo"]]);
    const cache = cacheDe([["deb#2::echo", { valeurs: [son(false)] }], ["fin", { valeurs: [son(false)] }]]);
    await menageApresPasse(etat(), apres({ cache, deplie: { origines: copies(), problemes: [] } }).a);
    expect([...cache.entrees().keys()]).toEqual(["fin"]);

    const garde = cacheDe([["deb#2::echo", { valeurs: [son(false)] }]]);
    await menageApresPasse(etat({ economieMemoireRef: { current: false } }), apres({ cache: garde, deplie: { origines: copies(), problemes: [] } }).a);
    expect([...garde.entrees().keys()]).toEqual(["deb#2::echo"]);
  });
});

describe("les messages complétés, puis les rendus de la pose finale", () => {
  it("LA CAUSE D'UNE BOUCLE NON DÉPLIÉE SE DIT SOUS LE NŒUD VISIBLE, et son rendu la porte", async () => {
    const passe = etat();
    const { a, bilan } = apres({
      deplie: { origines: new Map(), problemes: [{ noeudId: "m::deb", code: "debut-sans-fin" }] },
      expansions: new Map([["m::deb", "m"]]),
      noeudsVisibles: () => [visible("m")],
    });
    await menageApresPasse(passe, a);
    expect(passe.messages.get("m")).toBe("boucle.probleme.debut-sans-fin");
    expect(bilan().problemesDeBoucle).toEqual([["m", "boucle.probleme.debut-sans-fin"]]);
    // Déjà posé ou non, il repasse : son message a changé après la boucle.
    expect(bilan().messagesCompletes).toEqual(["m"]);
    expect(bilan().rendus).toEqual([["m", { valeurs: [], message: "boucle.probleme.debut-sans-fin" }]]);
  });

  it("LA GRAINE TIRÉE S'AJOUTE AU MESSAGE, sauf si le nombre y est déjà, et tout nœud qui en a tiré une repasse", async () => {
    const passe = etat({ messages: new Map([["a", "joué"], ["b", "graine 42 retenue"]]) });
    const { a, bilan } = apres({
      grainesTirees: new Map([
        ["a", [{ nom: "Graine", valeur: 7 }]], ["b", [{ nom: "Graine", valeur: 42 }]], ["c", [{ nom: "Hasard", valeur: 3 }]],
      ]),
    });
    await menageApresPasse(passe, a);
    expect(passe.messages.get("a")).toBe("joué · graine 7");
    expect(passe.messages.get("b")).toBe("graine 42 retenue");
    expect(passe.messages.get("c")).toBe("hasard 3");
    expect(bilan().messagesCompletes).toEqual(["a", "b", "c"]);
  });

  it("LES RENDUS SONT CHOISIS UNE FOIS LES MESSAGES COMPLÉTÉS, et un nœud sans rien à montrer n'en a pas", async () => {
    const valeur = { tampon: "a" };
    const passe = etat({ resultats: new Map([["a", [valeur]]]), messages: new Map([["a", "joué"]]) });
    const { a, bilan } = apres({
      noeudsVisibles: () => [visible("a"), visible("vide")],
      grainesTirees: new Map([["a", [{ nom: "Graine", valeur: 7 }]]]),
    });
    await menageApresPasse(passe, a);
    expect(bilan().rendus).toEqual([["a", { valeurs: [valeur], message: "joué · graine 7" }]]);
    // Les valeurs passent par référence, telles que la boucle les a rangées.
    expect(bilan().rendus[0][1].valeurs[0]).toBe(valeur);
  });

  it("LE TEMPS ET L'ÉCART DE NIVEAU PARTENT DANS LE BILAN, par nœud visible et dans l'ordre de leurs tables", async () => {
    const { a, bilan } = apres({
      tempsParVisible: new Map([["b", 4], ["a", 12]]), ecartsParNoeud: new Map([["a", -3]]),
    });
    await menageApresPasse(etat(), a);
    expect(bilan().temps).toEqual([["b", 4], ["a", 12]]);
    expect(bilan().ecarts).toEqual([["a", -3]]);
  });
});

describe("ce qui part vers l'atelier", () => {
  it("CHAQUE DEMANDE EST DITE AVANT LE BILAN, dans l'ordre où les composants l'ont rendue", async () => {
    const spec = { nodes: [{ ficheId: "gain", label: "Gain" }], edges: [] };
    const { a, dits } = apres({
      demandesParNoeud: new Map<string, any>([["g", { grapheACreer: spec }], ["p1", { paletteARelire: true }]]),
    });
    await menageApresPasse(etat(), a);
    expect(dits.map((e) => (e.genre === "demande" ? `demande ${e.id}` : e.genre))).toEqual(["demande g", "demande p1", "bilan"]);
    expect(dits[0]).toMatchObject({ demande: { grapheACreer: spec } });
  });

  it("LES CHAMPS AUTONOMES PARTENT DANS LE BILAN, et les deux canaux déclarés n'y sont pas", async () => {
    const { a, bilan } = apres({
      nds: [
        { id: "carte", data: { ficheId: "carte", _carteHtmlUrl: "blob:c", _affichage: { x: 1 } } },
        { id: "pareil", data: { ficheId: "x", _carteSonore: "s" } },
        { id: "rien", data: { ficheId: "y" } },
      ],
    });
    await menageApresPasse(etat(), a);
    // Les canaux déclarés ne passent pas par ici : ils viennent du retour de l'exécuteur ou du cache.
    expect(bilan().champsAutonomes).toEqual([["carte", { _carteHtmlUrl: "blob:c" }], ["pareil", { _carteSonore: "s" }]]);

    const sans = apres({ nds: [{ id: "a", data: { ficheId: "x" } }] });
    await menageApresPasse(etat(), sans.a);
    expect(sans.bilan().champsAutonomes).toEqual([]);
  });
});

describe("les conteneurs que la passe a touchés", () => {
  const boites = { ids: ["b"], contenu: (_c: string, ids: readonly string[]) => ids.filter((id) => id.startsWith("m")) };

  it("UN CONTENEUR DONT UN MEMBRE A TOURNÉ EST DIT AVEC SES MEMBRES EXÉCUTABLES, les décoratifs en moins", async () => {
    const { a, bilan } = apres({ boites, ordonnees: ["m1", "m2", "m3"], idsDecoratifs: new Set(["m3"]) });
    await menageApresPasse(etat({ ordreFiltre: ["m1"] }), a);
    expect(bilan().conteneurs).toEqual([["b", ["m1", "m2"]]]);
  });

  it("UN CONTENEUR HORS DU RUN N'Y EST PAS", async () => {
    const { a, bilan } = apres({ boites, ordonnees: ["m1"] });
    await menageApresPasse(etat({ ordreFiltre: ["z"] }), a);
    expect(bilan().conteneurs).toEqual([]);
  });
});

describe("ce que le ménage dit, et quand il a fini", () => {
  it("CHAQUE ÉVÉNEMENT PORTE LA GÉNÉRATION DE SA PASSE", async () => {
    const { a, dits } = apres({ demandesParNoeud: new Map<string, any>([["p", { paletteARelire: true }]]) });
    await menageApresPasse(etat(), a);
    expect(dits.map((e) => e.generation)).toEqual([5, 5]);
  });

  it("LE MÉNAGE ATTEND LA POSE DU BILAN : il ne rend la main qu'une fois le récepteur fini", async () => {
    let finir!: () => void;
    const pose = new Promise<void>((r) => { finir = r; });
    const { a } = apres({ emettre: (e) => (e.genre === "bilan" ? pose : undefined) });
    let fini = false;
    const menage = menageApresPasse(etat(), a).then(() => { fini = true; });
    await new Promise((r) => setTimeout(r, 0));
    expect(fini).toBe(false);
    finir();
    await menage;
    expect(fini).toBe(true);
  });
});
