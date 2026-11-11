// core/cache-execution.test.ts — La règle du cache, et son exception.
//
// CE QUE CES CAS TIENNENT, ET POURQUOI ILS EXISTENT. Relevé par Fabien : lancer une sortie texte
// refaisait tourner un extrait vidéo et un export déjà exécutés, et rien dans le dépôt ne disait
// pourquoi. La règle était écrite dans le moteur, et rien ne la gardait : ni `jamaisCache`, ni la
// propagation aux descendants. On pouvait donc retirer la propagation pour gagner du temps, et
// l'application aurait servi de vieux sons sans que rien ne le signale.
//
// CES CAS TIENNENT LES TROIS CHOSES QUI COMPTENT. Qu'un composant inchangé rejoue son résultat ;
// qu'un composant `jamaisCache` entraîne TOUTE sa descendance, même en rendant deux fois la même
// chose ; et qu'une branche sœur ne soit PAS entraînée.
//
// LE DERNIER CAS DIT LE PRIX, et c'est le seul endroit du dépôt qui le démontre : deux tampons
// audio différents de même forme portent la même empreinte. C'est cela qui interdit d'arrêter la
// propagation en comparant les sorties.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it, vi } from "vitest";

// LA RESPIRATION DE LA BOUCLE NE RESPIRE PAS ICI. Elle rend une image au navigateur avant chaque
// nœud, et sans navigateur elle n'est qu'une minuterie : mesuré le 2026-11-11, le cas des trois
// cents tours, deux runs de six cents nœuds, durait 9,3 s, la minuterie de Windows valant une
// quinzaine de millisecondes ; sans elle, 45 ms. Ces cas éprouvent la règle du cache, non la
// fluidité, et la boucle tourne pour le reste telle quelle.
vi.mock("./respirer", async (original) => ({ ...(await original<typeof import("./respirer")>()), respirer: () => Promise.resolve() }));
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  peutReutiliserLeCache, sourceRetraitee, type EmpreintesDuRun, type EntreeDeCache, type LienDeGraphe,
} from "./cache-execution";
import { empreinteValeur, ordreTopologique } from "./graphe";
import { deplierBoucles, FICHE_DEBUT, FICHE_FIN } from "./boucle-graphe";
import { creerTablesDePasse, executerLesNoeuds, type QuestionsDuRetour } from "./execution";
import type { AreteG, NoeudG } from "./meta";
import type { ContexteExecution, FonctionPlugin, PluginDef } from "./types";

const EMPREINTES: EmpreintesDuRun = {
  hashParams: "p", hashEntree: "e", hashSorties: "s", hashValeursEntree: "v",
};

/** Un composant qui rend ce qu'il reçoit, et le même s'il refuse le cache : ce que le cas déclare. */
const relayer: FonctionPlugin<unknown, null> = async (ctx: ContexteExecution<unknown, null>) => ({ valeurs: [ctx.entree(0) ?? "source"] });
const FICHES_DU_RUN: Record<string, PluginDef<unknown, unknown>> = {
  fixe: { sorties: [{ nom: "S", type: "x" }], executer: relayer } as unknown as PluginDef<unknown, unknown>,
  jamais: { sorties: [{ nom: "S", type: "x" }], jamaisCache: true, executer: relayer } as unknown as PluginDef<unknown, unknown>,
};
const NEUTRES: QuestionsDuRetour = {
  porterALaFrequenceDeTravail: async (v) => [...v], heriterDesEntrees: () => {}, ecartNiveau: () => undefined, frequencesMelees: () => [],
};

/**
 * Qui tourne au second run, quand le cache tient ce que le cas déclare.
 *
 * C'EST LA VRAIE BOUCLE DU MOTEUR depuis le 2026-11-11 (pièce 4 du plan du runtime), et non plus sa
 * réplique : celle-ci reprenait l'ordre, la question posée à chaque nœud et le marquage du nœud qui
 * a tourné, et éprouvait donc une copie que rien ne tenait égale au moteur. Le graphe est posé tel
 * que le cas le donne et parcouru dans l'ordre qu'il donne. Un premier run remplit le cache ; il est
 * ramené aux composants que le cas déclare en cache ; le second dit qui tourne.
 *
 * LES SAUTS DE BOUCLE SONT NEUTRES, comme ils l'étaient dans la réplique : ces cas éprouvent la règle
 * du cache sur un graphe déjà déplié, et `core/saut-de-boucle.test.ts` tient les sauts.
 */
async function quiTourne(
  ordre: readonly string[],
  liens: readonly LienDeGraphe[],
  jamaisCache: ReadonlySet<string>,
  cachePrecedent: ReadonlyMap<string, unknown>,
): Promise<string[]> {
  const nds: NoeudG[] = ordre.map((id) => ({ id, data: { ficheId: jamaisCache.has(id) ? "jamais" : "fixe", parametres: {} } }));
  const aretesG: AreteG[] = liens.map((l, i) => ({ id: `l${i}`, source: l.source, target: l.target, sourceHandle: "out:0", targetHandle: "in:0" }));
  const cache = new Map<string, EntreeDeCache>();
  const run = async () => {
    const tourne: string[] = [];
    await executerLesNoeuds<null>(
      { ordreFiltre: [...ordre], nds, aretesG, noeudsEnErreur: new Set(), plat: { expansions: new Map() } },
      creerTablesDePasse(),
      {
        runtime: null, repertoireTravail: "", signal: new AbortController().signal,
        trouverDef: (f) => FICHES_DU_RUN[f], trouverPlugin: (f) => FICHES_DU_RUN[f]?.executer as FonctionPlugin<unknown, null> | undefined,
        typeFlux: () => undefined, canoniser: (_p, v) => v, graineDuNoeud: (_id, _nom, brut) => brut,
        lireCache: (id) => cache.get(id), ecrireCache: (id, e) => cache.set(id, e),
        sauts: { copieSautee: () => false, finReprise: () => false, empreintePour: () => undefined },
        questions: () => NEUTRES, poser: () => {}, poserOmbre: () => {}, t: (cle) => cle,
        quandUnNoeudAFini: (id) => { tourne.push(id); },
      },
    );
    return tourne;
  };
  await run();
  for (const id of [...cache.keys()]) if (!cachePrecedent.has(id)) cache.delete(id);
  return run();
}

/** Une chaîne a → b → c, telle que la posait le relevé : extrait, export, sortie texte. */
const CHAINE: LienDeGraphe[] = [{ source: "a", target: "b" }, { source: "b", target: "c" }];
const TOUS_EN_CACHE = new Map([["a", EMPREINTES], ["b", EMPREINTES], ["c", EMPREINTES]]);

describe("un composant peut rejouer son résultat", () => {
  it("QUAND RIEN DE CE DONT IL DÉPEND N'A BOUGÉ", () => {
    expect(peutReutiliserLeCache(false, false, EMPREINTES, EMPREINTES)).toBe(true);
  });

  it("MAIS JAMAIS À SON PREMIER RUN, n'ayant rien à rejouer", () => {
    expect(peutReutiliserLeCache(false, false, undefined, EMPREINTES)).toBe(false);
  });

  it("CHACUNE DES TROIS EMPREINTES QUI LE DÉCRIVENT SUFFIT À LE FAIRE REJOUER", () => {
    for (const cle of ["hashParams", "hashEntree", "hashValeursEntree"] as const) {
      const change = { ...EMPREINTES, [cle]: "autre" };
      expect(peutReutiliserLeCache(false, false, EMPREINTES, change), cle).toBe(false);
    }
  });
});

describe("le câblage aval ne compte que pour le composant qui le consulte", () => {
  // RELEVÉ PAR FABIEN : « un nœud Ampleur posé après un débruitage IA déjà exécuté relance le
  // débruitage ». Le câblage des sorties entrait dans la clé de TOUS pour la raison d'un seul.
  const ailleurs = { ...EMPREINTES, hashSorties: "autre" };

  it("UN CÂBLE AJOUTÉ DERRIÈRE UN COMPOSANT QUI NE DEMANDE RIEN NE LE FAIT PAS REJOUER", () => {
    expect(peutReutiliserLeCache(false, false, EMPREINTES, ailleurs)).toBe(true);
    expect(peutReutiliserLeCache(false, false, { ...EMPREINTES, consulteSorties: false }, ailleurs)).toBe(true);
  });

  it("MAIS IL FAIT REJOUER CELUI QUI A DEMANDÉ SI SES SORTIES ÉTAIENT BRANCHÉES", () => {
    // C'est le cas pour lequel l'empreinte des sorties a été créée : brancher un câble sur une
    // sortie restée vide ne relançait rien, et le composant d'aval annonçait « aucune entrée ».
    expect(peutReutiliserLeCache(false, false, { ...EMPREINTES, consulteSorties: true }, ailleurs)).toBe(false);
  });

  it("ET CELUI QUI A DEMANDÉ REJOUE SON CACHE TANT QUE SON CÂBLAGE AVAL NE BOUGE PAS", () => {
    // Le garde ne doit pas devenir « ce composant ne cache plus rien » : consulter ses sorties
    // n'est pas `jamaisCache`, c'est une empreinte de plus à comparer.
    expect(peutReutiliserLeCache(false, false, { ...EMPREINTES, consulteSorties: true }, EMPREINTES)).toBe(true);
  });

  it("UNE ENTRÉE DE CACHE ÉCRITE AVANT LA QUESTION VAUT « N'A PAS DEMANDÉ »", () => {
    // Le champ est absent des entrées d'avant, et le premier run qui suit le renseignera. Le seul
    // risque serait de servir un résultat périmé à un composant qui consulte ses sorties ; or
    // celui-là écrit le champ dès son premier run, et un premier run ne rejoue jamais rien.
    const sansLeChamp: EmpreintesDuRun = { ...EMPREINTES };
    expect(peutReutiliserLeCache(false, false, sansLeChamp, ailleurs)).toBe(true);
  });

  it("ET LES AUTRES RAISONS DE REJOUER RESTENT ENTIÈRES POUR LUI", () => {
    const consulte = { ...EMPREINTES, consulteSorties: true };
    expect(peutReutiliserLeCache(true, false, consulte, EMPREINTES)).toBe(false);
    expect(peutReutiliserLeCache(false, true, consulte, EMPREINTES)).toBe(false);
    for (const cle of ["hashParams", "hashEntree", "hashValeursEntree"] as const) {
      expect(peutReutiliserLeCache(false, false, consulte, { ...EMPREINTES, [cle]: "autre" }), cle).toBe(false);
    }
  });

  it("LE MOTEUR RETIENT LA QUESTION, ET LA PORTE JUSQU'À L'ENTRÉE DE CACHE", () => {
    // POURQUOI CE CAS LIT UNE SOURCE. La règle ci-dessus est juste et ne prouve rien toute seule :
    // elle ne vaut que si le moteur RENSEIGNE `consulteSorties`. Ce joint-là ne se voit sur aucune
    // fonction pure, et le laisser sans garde, c'est laisser la règle se vider sans que rien ne
    // tombe — le résultat étant alors un rejeu inutile, qui ne se remarque qu'à l'oreille et à la
    // montre. Les deux bouts sont attachés PAR LE NOM DE LA VARIABLE : renommer la déplace des deux
    // côtés et le cas tient, en retirer un seul et il tombe.
    // LE CONTEXTE EST CONSTRUIT PAR LE CŒUR depuis le 2026-11-02 (`core/contexte-de-passe.ts`, sortie 4
    // du plan du moteur) : le drapeau s'y lève, et c'est le moteur qui le porte au cache. Les deux
    // bouts restent attachés PAR LE NOM : le contexte rend un lecteur du même nom que son drapeau.
    //
    // ET LE CHEMIN A TROIS BOUTS depuis le 2026-11-11 (pièce 2 du plan du runtime) : l'entrée de
    // cache s'écrit dans le cœur, `core/execution.ts`. Depuis la pièce 3, la boucle y est aussi :
    // le lecteur est reçu du contexte, rendu au retour, et lu par le retour, tout dans ce fichier.
    // Le lecteur doit y passer LUI-MÊME, sous son nom, à chacun de ces trois endroits : un
    // `{ …, drapeau: () => false }` le romprait sans rien changer au nom, et c'est la forme abrégée
    // qui se compte, non le nom. Le crochet ne le voit plus.
    const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), "utf8");
    const contexte = lire("./contexte-de-passe.ts");
    const coeur = lire("./execution.ts").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    const debut = contexte.indexOf("sortieBranchee:");
    expect(debut, "le contexte doit fournir `sortieBranchee` au composant").toBeGreaterThan(0);

    const corps = contexte.slice(debut, debut + 600);
    const drapeau = corps.match(/([A-Za-z_][A-Za-z0-9_]*) = true/)?.[1];
    expect(drapeau, "`sortieBranchee` doit retenir qu'on lui a posé la question").toBeTruthy();
    expect(coeur.includes(`consulteSorties: ${drapeau}()`),
      "ce que `sortieBranchee` a retenu doit partir dans l'entrée de cache, écrite par `core/execution.ts`").toBe(true);
    const passes = coeur.match(new RegExp(String.raw`[{,]\s*${drapeau}\s*[,}]`, "g")) ?? [];
    expect(passes.length,
      "la boucle doit recevoir le lecteur du contexte et le rendre tel quel au retour, qui le lit").toBeGreaterThanOrEqual(3);
  });
});

describe("l'exception, et ce qu'elle entraîne", () => {
  it("UN COMPOSANT `jamaisCache` NE REJOUE JAMAIS SON RÉSULTAT", () => {
    expect(peutReutiliserLeCache(true, false, EMPREINTES, EMPREINTES)).toBe(false);
  });

  it("ET IL ENTRAÎNE TOUTE SA DESCENDANCE, c'est la réponse au relevé", async () => {
    // La chaîne du relevé : un extrait vidéo qui ne se cache jamais, un export, une sortie texte.
    // Les trois ont déjà tourné et rien n'a changé ; les trois tournent quand même.
    expect(await quiTourne(["a", "b", "c"], CHAINE, new Set(["a"]), TOUS_EN_CACHE)).toEqual(["a", "b", "c"]);
  });

  it("SANS L'EXCEPTION, LA MÊME CHAÎNE NE REJOUE RIEN", async () => {
    // Le contre-essai, et c'est lui qui prouve que l'exception est bien la cause.
    expect(await quiTourne(["a", "b", "c"], CHAINE, new Set(), TOUS_EN_CACHE)).toEqual([]);
  });

  it("LA PROPAGATION EST TRANSITIVE, et ne s'arrête pas au premier aval", async () => {
    const longue: LienDeGraphe[] = [
      { source: "a", target: "b" }, { source: "b", target: "c" },
      { source: "c", target: "d" }, { source: "d", target: "e" },
    ];
    const cache = new Map(["a", "b", "c", "d", "e"].map((id) => [id, EMPREINTES]));
    expect(await quiTourne(["a", "b", "c", "d", "e"], longue, new Set(["a"]), cache))
      .toEqual(["a", "b", "c", "d", "e"]);
  });

  it("UNE BRANCHE SŒUR N'EST PAS ENTRAÎNÉE, la propagation suivant les arêtes", async () => {
    // Deux branches parallèles depuis deux sources distinctes. Seule celle qui descend du composant
    // non caché rejoue ; l'autre suit dans l'ordre du run sans en dépendre, et reste tranquille.
    // Cela a été une faute : invalider tout l'aval de l'ordre linéaire rejouait les sœurs.
    const liens: LienDeGraphe[] = [{ source: "a", target: "b" }, { source: "x", target: "y" }];
    const cache = new Map(["a", "b", "x", "y"].map((id) => [id, EMPREINTES]));
    expect(await quiTourne(["a", "b", "x", "y"], liens, new Set(["a"]), cache)).toEqual(["a", "b"]);
  });

  it("UN COMPOSANT QUI REJOUE SON CACHE N'ENTRAÎNE PERSONNE", async () => {
    // Le milieu de la chaîne n'a pas tourné : son aval ne doit pas être averti.
    const cache = new Map([["b", EMPREINTES], ["c", EMPREINTES]]);
    // « a » n'a pas de cache, donc il tourne ; « b » aussi, puisqu'il en descend ; « c » de même.
    expect(await quiTourne(["a", "b", "c"], CHAINE, new Set(), cache)).toEqual(["a", "b", "c"]);
    // Mais si « a » a lui aussi son cache, personne ne tourne.
    expect(await quiTourne(["a", "b", "c"], CHAINE, new Set(), TOUS_EN_CACHE)).toEqual([]);
  });
});

describe("pourquoi la propagation ne peut pas se décider sur les sorties", () => {
  it("DEUX SONS DIFFÉRENTS DE MÊME FORME PORTENT LA MÊME EMPREINTE", () => {
    // C'EST LE FAIT QUI PORTE TOUTE LA RÈGLE. Un moteur qui arrêterait la propagation en comparant
    // les sorties ne verrait aucune différence entre ces deux tampons, et servirait le premier là
    // où le second est attendu. Comme un traitement rend le plus souvent une durée inchangée, la
    // faute serait la règle et non l'exception.
    const ctx = new OfflineAudioContext(1, 1000, 44100);
    const silence = ctx.createBuffer(1, 1000, 44100);
    const bruit = ctx.createBuffer(1, 1000, 44100);
    const d = bruit.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.sin(i);

    expect(silence.getChannelData(0)[7]).not.toBe(bruit.getChannelData(0)[7]);
    expect(empreinteValeur(silence)).toBe(empreinteValeur(bruit));
  });

  it("ET DEUX FICHIERS DE MÊME NOM ET MÊME TAILLE AUSSI", () => {
    const a = new File([new Uint8Array(16).fill(1)], "extrait.mp4", { type: "video/mp4" });
    const b = new File([new Uint8Array(16).fill(2)], "extrait.mp4", { type: "video/mp4" });
    expect(empreinteValeur(a)).toBe(empreinteValeur(b));
  });
});

describe("la source retraitée se lit sur les arêtes", () => {
  it("un composant sans entrée n'est jamais entraîné", () => {
    expect(sourceRetraitee("a", CHAINE, new Set(["b", "c"]))).toBe(false);
  });

  it("une entrée suffit, et il n'en faut qu'une", () => {
    const liens: LienDeGraphe[] = [{ source: "a", target: "c" }, { source: "b", target: "c" }];
    expect(sourceRetraitee("c", liens, new Set(["b"]))).toBe(true);
    expect(sourceRetraitee("c", liens, new Set())).toBe(false);
  });
});

// ── LE CACHE AUTOUR D'UNE BOUCLE, qui est l'endroit où l'on ne peut pas raisonner de tête ──
//
// POURQUOI CES CAS EXISTENT, demandé par Fabien : « erreurs de cache pour les nœuds situés avant et
// après les boucles de type ABC, comportement suspect détecté à l'oreille, non systématique,
// rejouer le workflow les corrige ».
//
// CE QUI REND CET ENDROIT PARTICULIER. Une boucle n'est pas exécutée telle qu'elle est dessinée :
// son contenu est RECOPIÉ un exemplaire par tour, sous des identifiants engendrés, et c'est le
// graphe déplié que le moteur parcourt. Or la remise à zéro d'un réglage, elle, efface le cache des
// descendants VISIBLES : les copies n'en sont pas, leurs entrées de cache lui échappent donc
// entièrement. Rien ne garantissait que le moteur les rejoue tout de même.
//
// CE QUI LES SAUVE, ET QUE CES CAS TIENNENT : la propagation. Une copie reçoit son entrée de la
// copie du tour précédent, et la première la reçoit de l'amont de la boucle. Un amont qui rejoue
// entraîne donc la chaîne entière, tour après tour, jusqu'à la fin de boucle et au-delà. Si cette
// propagation se rompait, une boucle servirait le son du run d'avant, ce qui ne s'entend pas.
describe("le cache d'une boucle dépliée", () => {
  const noeudsDeLaBoucle = (tours: number): NoeudG[] => [
    { id: "src", data: { ficheId: "generateur-frequence" } },
    { id: "avant", data: { ficheId: "amplificateur" } },
    { id: "deb", data: { ficheId: FICHE_DEBUT, parametres: { Tours: tours } } },
    { id: "dans", data: { ficheId: "amplificateur" } },
    { id: "finA", data: { ficheId: FICHE_FIN } },
    { id: "apres", data: { ficheId: "amplificateur" } },
  ];
  const aretesDeLaBoucle: AreteG[] = [
    { id: "1", source: "src", target: "avant" },
    { id: "2", source: "avant", target: "deb" },
    { id: "3", source: "deb", target: "dans" },
    { id: "4", source: "dans", target: "finA" },
    { id: "5", source: "finA", target: "apres" },
  ] as AreteG[];

  /** Le graphe tel que le MOTEUR le parcourt : déplié, dans son ordre topologique. */
  function deplie(tours: number) {
    const r = deplierBoucles(noeudsDeLaBoucle(tours), aretesDeLaBoucle);
    expect(r.problemes, "le graphe d'essai doit être câblé correctement").toEqual([]);
    const liens = r.aretes.map((a) => ({ source: a.source, target: a.target }));
    return { ordre: ordreTopologique(r.noeuds.map((n) => n.id), r.aretes), liens, ids: r.noeuds.map((n) => n.id) };
  }

  it("le banc déplie bien : une copie du contenu par tour, sous un identifiant engendré", () => {
    // Sans ce plancher, un dépliage devenu muet ferait passer tous les cas suivants au vert.
    const { ids } = deplie(3);
    expect(ids.filter((id) => id.includes("::dans"))).toEqual(
      ["deb#0::dans", "deb#1::dans", "deb#2::dans"]);
  });

  it("AU PREMIER RUN TOUT TOURNE, copies comprises", async () => {
    const { ordre, liens, ids } = deplie(3);
    expect((await quiTourne(ordre, liens, new Set(), new Map())).sort()).toEqual([...ids].sort());
  });

  it("ET AU RUN SUIVANT, RIEN NE TOURNE : une boucle inchangée ne se recalcule pas", async () => {
    const { ordre, liens, ids } = deplie(3);
    const tout = new Map(ids.map((id) => [id, EMPREINTES]));
    expect(await quiTourne(ordre, liens, new Set(), tout)).toEqual([]);
  });

  it("UN RÉGLAGE CHANGÉ EN AMONT ENTRAÎNE CHAQUE TOUR, puis la fin et l'aval", async () => {
    // C'est le cas exact du relevé. La remise à zéro d'un réglage efface le cache des descendants
    // VISIBLES — `avant`, `deb`, `finA`, `apres` — et ne peut pas toucher celui des copies, qui
    // n'existent pas hors du dépliage. Sans propagation, les trois tours serviraient le son d'avant.
    const { ordre, liens, ids } = deplie(3);
    const cache = new Map(ids.map((id) => [id, EMPREINTES]));
    cache.delete("avant");
    const tournent = await quiTourne(ordre, liens, new Set(), cache);
    expect(tournent, "chaque tour doit être entraîné, et aucun ne doit resservir son cache").toEqual(
      ["avant", "deb#0::dans", "deb#1::dans", "deb#2::dans", "finA", "apres"]);
    expect(tournent, "et la source, elle, n'a aucune raison de rejouer").not.toContain("src");
  });

  it("ET CELA TIENT SUR TROIS CENTS TOURS, le réglage n'ayant plus de plafond", async () => {
    // Le nombre de tours était clos à trente-deux ; il est ouvert, et seul le nombre total de
    // COPIES est borné. Trois cents tours d'un ventre d'un nœud restent sous ce plafond-là.
    const TOURS = 300;
    const { ordre, liens, ids } = deplie(TOURS);
    const cache = new Map(ids.map((id) => [id, EMPREINTES]));
    cache.delete("avant");
    const tournent = await quiTourne(ordre, liens, new Set(), cache);
    const copies = ids.filter((id) => id.includes("::dans"));
    expect(copies.length).toBe(TOURS);
    for (const c of copies) expect(tournent, `le tour ${c} doit rejouer`).toContain(c);
    expect(tournent).toContain("apres");
  });

  it("UN COMPOSANT `jamaisCache` DANS LA BOUCLE ENTRAÎNE TOUS LES TOURS QUI LE SUIVENT", async () => {
    // Un lecteur de fichier, un tirage au sort : son résultat peut changer sans qu'aucune empreinte
    // ne bouge. Le tour où il se trouve rejoue, donc le suivant aussi, de proche en proche.
    const { ordre, liens, ids } = deplie(4);
    const cache = new Map(ids.map((id) => [id, EMPREINTES]));
    const tournent = await quiTourne(ordre, liens, new Set(["deb#1::dans"]), cache);
    expect(tournent).toEqual(["deb#1::dans", "deb#2::dans", "deb#3::dans", "finA", "apres"]);
    expect(tournent, "le tour d'avant n'a aucune raison de rejouer").not.toContain("deb#0::dans");
  });

  it("ET L'AMONT DE LA BOUCLE N'EST JAMAIS ENTRAÎNÉ PAR ELLE : la propagation ne remonte pas", async () => {
    const { ordre, liens, ids } = deplie(3);
    const cache = new Map(ids.map((id) => [id, EMPREINTES]));
    const tournent = await quiTourne(ordre, liens, new Set(["finA"]), cache);
    expect(tournent).toEqual(["finA", "apres"]);
    for (const amont of ["src", "avant", "deb#0::dans", "deb#1::dans", "deb#2::dans"]) {
      expect(tournent, `${amont} est en amont : le rejouer serait du temps perdu`).not.toContain(amont);
    }
  });

  it("DEUX BOUCLES CÔTE À CÔTE NE S'ENTRAÎNENT PAS L'UNE L'AUTRE", async () => {
    // Une branche sœur n'est pas une descendance, et ce fut une faute autrefois. Sur deux boucles
    // elle se paierait n fois, une par tour.
    const noeuds: NoeudG[] = [
      { id: "src", data: { ficheId: "generateur-frequence" } },
      { id: "debA", data: { ficheId: FICHE_DEBUT, parametres: { Tours: 2 } } },
      { id: "dansA", data: { ficheId: "amplificateur" } },
      { id: "finA", data: { ficheId: FICHE_FIN } },
      { id: "debB", data: { ficheId: FICHE_DEBUT, parametres: { Tours: 2 } } },
      { id: "dansB", data: { ficheId: "amplificateur" } },
      { id: "finB", data: { ficheId: FICHE_FIN } },
    ];
    const aretes = [
      { id: "1", source: "src", target: "debA" }, { id: "2", source: "debA", target: "dansA" },
      { id: "3", source: "dansA", target: "finA" },
      { id: "4", source: "src", target: "debB" }, { id: "5", source: "debB", target: "dansB" },
      { id: "6", source: "dansB", target: "finB" },
    ] as AreteG[];
    const r = deplierBoucles(noeuds, aretes);
    expect(r.problemes).toEqual([]);
    const liens = r.aretes.map((a) => ({ source: a.source, target: a.target }));
    const ordre = ordreTopologique(r.noeuds.map((n) => n.id), r.aretes);
    const cache = new Map(r.noeuds.map((n) => [n.id, EMPREINTES]));
    const tournent = await quiTourne(ordre, liens, new Set(["debA#0::dansA"]), cache);
    for (const b of tournent) expect(b, "aucune copie de la boucle B ne doit être entraînée").not.toContain("dansB");
    expect(tournent).not.toContain("finB");
    expect(tournent).toContain("finA");
  });
});
