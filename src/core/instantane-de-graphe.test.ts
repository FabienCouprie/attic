// core/instantane-de-graphe.test.ts — La passe lit le graphe de son départ, et ce qu'on y écrit se relève.
//
// CE QUI DOIT ÊTRE TENU, chaque cas par la vraie boucle (`preparerLaPasse` puis `executerLesNoeuds`) :
//
//   - UN EXÉCUTEUR QUI LIT SON RÉGLAGE APRÈS UNE ATTENTE LIT LA VALEUR DU DÉPART DE LA PASSE, même si
//     le nœud, ou l'interne d'un méta, est modifié en place pendant qu'il attend. C'est ce que fait
//     l'édition d'un méta ouvert. Faute à planter : un instantané qui rend le tableau vivant.
//   - UNE ÉCRITURE D'EXÉCUTEUR SUR `ctx.noeud.data` EST RELEVÉE, au premier niveau comme imbriquée,
//     interne de méta compris, et un nœud qui n'écrit rien ne l'est pas. Faute à planter : un sceau
//     qui ne voit rien.
//   - LA CLÉ DE CACHE EST LA MÊME SUR L'INSTANTANÉ ET SUR LES DONNÉES VIVANTES, sur tous les nœuds des
//     exemples livrés et de leurs métas. Le paquet `.attic` persiste cette clé : une copie qui
//     normaliserait quoi que ce soit serait un changement de format. Faute à planter : une copie par
//     `JSON`, qui perd les fichiers.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { copierPourHistorique } from "../ui/historique";
import { creerTablesDePasse, executerLesNoeuds, type QuestionsDuRetour } from "./execution";
import { empreinteParametres } from "./graphe";
import { metaDeLInstantane, prendreInstantane, scellerLInstantane } from "./instantane-de-graphe";
import type { AreteG, MetaComposant, NoeudG } from "./meta";
import { preparerLaPasse } from "./preparation-passe";
import type { InstantaneDeGraphe } from "./protocole-moteur";
import { sautsDeBoucles } from "./saut-de-boucle";
import { configurerServicesDomaine, oublierServicesDomaine, servicesDomaine } from "./services-domaine";
import type { ContexteExecution, FonctionPlugin, PluginDef } from "./types";

type Ctx = ContexteExecution<unknown, unknown>;
type Fiche = Partial<PluginDef<unknown, unknown>> & { executer?: (ctx: Ctx) => Promise<unknown> };

const QUESTIONS_NEUTRES: QuestionsDuRetour = {
  porterALaFrequenceDeTravail: async (valeurs) => [...valeurs],
  heriterDesEntrees: () => {},
  ecartNiveau: () => undefined,
  frequencesMelees: () => [],
};

/** La porte que le cas ouvre quand il a fini de modifier le graphe vivant. */
let ouvrir: () => void = () => {};
let porte: Promise<void> = Promise.resolve();
const fermerLaPorte = () => { porte = new Promise((r) => { ouvrir = r; }); };

const GAIN = [{ nom: "Gain", type: "nombre", defaut: 0 }];
const FICHES: Record<string, Fiche> = {
  // Lit son réglage APRÈS l'attente, comme un exécuteur lit le sien après un calcul long.
  lent: { entrees: [], sorties: [], parametres: GAIN as never, executer: async (ctx) => {
    await porte;
    return { valeurs: [ctx.paramNombre("Gain", -1)] };
  } },
  ecritDessous: { entrees: [], sorties: [], parametres: GAIN as never, executer: async (ctx) => {
    (ctx.noeud.data.parametres as Record<string, unknown>).Gain = 5;
    return { valeurs: [1] };
  } },
  ecritDessus: { entrees: [], sorties: [], parametres: [], executer: async (ctx) => {
    Reflect.set(ctx.noeud.data, "_trace", 1);
    return { valeurs: [1] };
  } },
  sage: { entrees: [], sorties: [], parametres: GAIN as never, executer: async (ctx) => ({ valeurs: [ctx.paramNombre("Gain", -1)] }) },
};
const trouverDef = (f: string) => FICHES[f] as PluginDef<unknown, unknown> | undefined;

const n = (id: string, ficheId: string, parametres: Record<string, unknown> = {}): NoeudG => ({ id, data: { ficheId, parametres } });
const meta = (id: string, interne: NoeudG): MetaComposant => ({
  id, nom: id, entrees: [], sorties: [], mapEntrees: [], mapSorties: [], sousNoeuds: [interne], sousAretes: [],
});

/** Une passe sur l'instantané, comme le crochet la mène : la préparation lit ses métas, et non le registre. */
async function jouerSur(instantane: InstantaneDeGraphe): Promise<Map<string, unknown[]>> {
  const plan = preparerLaPasse({
    noeuds: instantane.noeuds as NoeudG[], aretes: instantane.aretes as AreteG[], prioriteDemandee: null, versLAval: false,
    trouverMeta: metaDeLInstantane(instantane), trouverDef, fluxCompatibles: (s, c) => s === c, t: (cle) => cle,
  });
  const tables = creerTablesDePasse();
  const cache = new Map();
  const sauts = sautsDeBoucles(plan.deplie.depliees, {
    noeuds: plan.deplie.noeuds, aretes: plan.aretesG, resultats: tables.resultats, cache, toursDesCopies: plan.deplie.toursDesCopies,
    reglages: JSON.stringify(servicesDomaine().reglagesDeProjet()), jamaisCache: () => false,
  });
  await executerLesNoeuds<null>(plan, tables, {
    runtime: null, repertoireTravail: "", signal: new AbortController().signal, trouverDef,
    trouverPlugin: (f) => FICHES[f]?.executer as FonctionPlugin<unknown, null> | undefined,
    typeFlux: () => undefined, canoniser: (_p, v) => v, graineDuNoeud: (_id, _nom, brut) => brut,
    lireCache: (id) => cache.get(id), ecrireCache: (id, e) => cache.set(id, e), sauts,
    questions: () => QUESTIONS_NEUTRES, poser: () => {}, poserOmbre: () => {}, t: (cle) => cle,
    quandUnNoeudAFini: () => {},
  });
  return tables.resultats;
}

beforeEach(() => { configurerServicesDomaine({ reglagesDeProjet: () => ({}) }); fermerLaPorte(); });
afterEach(() => { ouvrir(); oublierServicesDomaine(); });

describe("l'instantané du graphe", () => {
  it("L'EXÉCUTEUR LIT LE RÉGLAGE DU DÉPART DE LA PASSE, nœud et interne de méta modifiés en place", async () => {
    const outil = meta("meta-outil", n("cd", "lent", { Gain: 2 }));
    const vivants = [n("a", "lent", { Gain: 1 }), n("outil", "meta-outil")];
    const instantane = prendreInstantane({
      noeuds: vivants, aretes: [], trouverMeta: (f) => (f === outil.id ? outil : undefined), copier: copierPourHistorique,
    });
    const passe = jouerSur(instantane);
    // PENDANT QUE LES DEUX EXÉCUTEURS ATTENDENT : un réglage changé en place, et l'interne d'un méta.
    (vivants[0].data.parametres as Record<string, unknown>).Gain = 9;
    (outil.sousNoeuds[0].data.parametres as Record<string, unknown>).Gain = 9;
    ouvrir();
    const resultats = await passe;
    expect(resultats.get("a"), "le nœud visible").toEqual([1]);
    expect(resultats.get("outil::cd"), "l'interne du méta").toEqual([2]);
  });

  it("UNE ÉCRITURE D'EXÉCUTEUR SUR ctx.noeud.data EST RELEVÉE, imbriquée comprise, et rien d'autre", async () => {
    ouvrir();
    const outil = meta("meta-outil", n("cd", "ecritDessous", { Gain: 2 }));
    const instantane = prendreInstantane({
      noeuds: [n("a", "ecritDessous", { Gain: 1 }), n("b", "ecritDessus"), n("c", "sage", { Gain: 3 }), n("outil", "meta-outil")],
      aretes: [], trouverMeta: (f) => (f === outil.id ? outil : undefined), copier: copierPourHistorique,
    });
    const ecritures = scellerLInstantane(instantane);
    expect(ecritures(), "avant la passe, rien n'a changé").toEqual([]);
    await jouerSur(instantane);
    expect(ecritures().sort()).toEqual(["a", "b", "meta-outil/cd"]);
    // LE GRAPHE VIVANT N'A RIEN REÇU : c'est la copie qu'on a écrite.
    expect(outil.sousNoeuds[0].data.parametres).toEqual({ Gain: 2 });
  });

  it("LA CLÉ DE CACHE EST LA MÊME SUR L'INSTANTANÉ ET SUR LES DONNÉES VIVANTES, sur les exemples livrés", () => {
    const dossier = resolve(__dirname, "../../exemples");
    const fichiers = readdirSync(dossier).filter((f) => f.endsWith(".json"));
    let compares = 0;
    // UN NŒUD QUI PORTE UN FICHIER ET UN TAMPON, que les exemples livrés ne portent pas.
    const fichier = new File([new Uint8Array([1, 2, 3])], "son.wav", { type: "audio/wav" });
    const lourd: NoeudG = { id: "lourd", data: { ficheId: "x", parametres: { Gain: 1 }, audioFichier: fichier, sequenceNotes: [{ hauteur: 60 }], tampon: new Float32Array(4) } };
    const graphes = fichiers.map((f) => JSON.parse(readFileSync(resolve(dossier, f), "utf8")) as { nodes: NoeudG[]; edges: AreteG[]; metas?: MetaComposant[] });
    graphes.push({ nodes: [lourd], edges: [] });
    for (const g of graphes) {
      const metas = new Map((g.metas ?? []).map((m) => [m.id, m]));
      const instantane = prendreInstantane({ noeuds: g.nodes, aretes: g.edges, trouverMeta: (id) => metas.get(id), copier: copierPourHistorique });
      const vivants = [...g.nodes, ...[...metas.values()].flatMap((m) => m.sousNoeuds)];
      const copies = [...instantane.noeuds, ...instantane.metas.flatMap((m) => m.sousNoeuds)];
      expect(copies.length, "l'instantané garde chaque nœud et chaque interne de méta employé").toBe(
        g.nodes.length + [...metas.values()].filter((m) => g.nodes.some((x) => x.data.ficheId === m.id)).reduce((s, m) => s + m.sousNoeuds.length, 0));
      for (const copie of copies) {
        const vivant = vivants.find((v) => v.id === copie.id && v.data.ficheId === copie.data.ficheId)!;
        expect(copie.data, `${copie.id} est une copie`).not.toBe(vivant.data);
        expect(empreinteParametres(copie.data), `${copie.id}`).toBe(empreinteParametres(vivant.data));
        compares++;
      }
    }
    expect(compares, "le cas a comparé quelque chose").toBeGreaterThan(100);
    const copieLourde = prendreInstantane({ noeuds: [lourd], aretes: [], trouverMeta: () => undefined, copier: copierPourHistorique }).noeuds[0];
    expect(copieLourde.data.audioFichier, "un fichier est partagé, et non copié").toBe(fichier);
    expect(copieLourde.data.tampon, "un tableau typé aussi").toBe(lourd.data.tampon);
  });
});
