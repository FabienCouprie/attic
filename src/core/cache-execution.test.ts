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
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  peutReutiliserLeCache, sourceRetraitee, type EmpreintesDuRun, type LienDeGraphe,
} from "./cache-execution";
import { empreinteValeur, ordreTopologique } from "./graphe";
import { deplierBoucles, FICHE_DEBUT, FICHE_FIN } from "./boucle-graphe";
import type { AreteG, NoeudG } from "./meta";

const EMPREINTES: EmpreintesDuRun = {
  hashParams: "p", hashEntree: "e", hashSorties: "s", hashValeursEntree: "v",
};

/**
 * Le run du moteur, réduit à sa décision de cache.
 *
 * REPREND LA BOUCLE DE `useExecutionGraphe`, ET RIEN D'AUTRE : l'ordre topologique, la question
 * posée à chaque nœud, et le marquage du nœud qui a tourné. C'est ce qui permet d'éprouver la
 * PROPAGATION, qui ne se voit sur aucune des deux fonctions prise seule.
 */
function quiTourne(
  ordre: readonly string[],
  liens: readonly LienDeGraphe[],
  jamaisCache: ReadonlySet<string>,
  cachePrecedent: ReadonlyMap<string, EmpreintesDuRun>,
  empreintes: (id: string) => EmpreintesDuRun = () => EMPREINTES,
): string[] {
  const retraites = new Set<string>();
  for (const id of ordre) {
    const reutilise = peutReutiliserLeCache(
      jamaisCache.has(id),
      sourceRetraitee(id, liens, retraites),
      cachePrecedent.get(id),
      empreintes(id),
    );
    if (!reutilise) retraites.add(id);
  }
  return [...retraites];
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
    const source = readFileSync(
      fileURLToPath(new URL("../ui/hooks/useExecutionGraphe.ts", import.meta.url)), "utf8");
    const debut = source.indexOf("sortieBranchee:");
    expect(debut, "le moteur doit fournir `sortieBranchee` au composant").toBeGreaterThan(0);

    const corps = source.slice(debut, debut + 600);
    const drapeau = corps.match(/([A-Za-z_][A-Za-z0-9_]*) = true/)?.[1];
    expect(drapeau, "`sortieBranchee` doit retenir qu'on lui a posé la question").toBeTruthy();
    expect(source.includes(`consulteSorties: ${drapeau}`),
      "ce que `sortieBranchee` a retenu doit partir dans l'entrée de cache").toBe(true);
  });
});

describe("l'exception, et ce qu'elle entraîne", () => {
  it("UN COMPOSANT `jamaisCache` NE REJOUE JAMAIS SON RÉSULTAT", () => {
    expect(peutReutiliserLeCache(true, false, EMPREINTES, EMPREINTES)).toBe(false);
  });

  it("ET IL ENTRAÎNE TOUTE SA DESCENDANCE, c'est la réponse au relevé", () => {
    // La chaîne du relevé : un extrait vidéo qui ne se cache jamais, un export, une sortie texte.
    // Les trois ont déjà tourné et rien n'a changé ; les trois tournent quand même.
    expect(quiTourne(["a", "b", "c"], CHAINE, new Set(["a"]), TOUS_EN_CACHE)).toEqual(["a", "b", "c"]);
  });

  it("SANS L'EXCEPTION, LA MÊME CHAÎNE NE REJOUE RIEN", () => {
    // Le contre-essai, et c'est lui qui prouve que l'exception est bien la cause.
    expect(quiTourne(["a", "b", "c"], CHAINE, new Set(), TOUS_EN_CACHE)).toEqual([]);
  });

  it("LA PROPAGATION EST TRANSITIVE, et ne s'arrête pas au premier aval", () => {
    const longue: LienDeGraphe[] = [
      { source: "a", target: "b" }, { source: "b", target: "c" },
      { source: "c", target: "d" }, { source: "d", target: "e" },
    ];
    const cache = new Map(["a", "b", "c", "d", "e"].map((id) => [id, EMPREINTES]));
    expect(quiTourne(["a", "b", "c", "d", "e"], longue, new Set(["a"]), cache))
      .toEqual(["a", "b", "c", "d", "e"]);
  });

  it("UNE BRANCHE SŒUR N'EST PAS ENTRAÎNÉE, la propagation suivant les arêtes", () => {
    // Deux branches parallèles depuis deux sources distinctes. Seule celle qui descend du composant
    // non caché rejoue ; l'autre suit dans l'ordre du run sans en dépendre, et reste tranquille.
    // Cela a été une faute : invalider tout l'aval de l'ordre linéaire rejouait les sœurs.
    const liens: LienDeGraphe[] = [{ source: "a", target: "b" }, { source: "x", target: "y" }];
    const cache = new Map(["a", "b", "x", "y"].map((id) => [id, EMPREINTES]));
    expect(quiTourne(["a", "b", "x", "y"], liens, new Set(["a"]), cache)).toEqual(["a", "b"]);
  });

  it("UN COMPOSANT QUI REJOUE SON CACHE N'ENTRAÎNE PERSONNE", () => {
    // Le milieu de la chaîne n'a pas tourné : son aval ne doit pas être averti.
    const cache = new Map([["b", EMPREINTES], ["c", EMPREINTES]]);
    // « a » n'a pas de cache, donc il tourne ; « b » aussi, puisqu'il en descend ; « c » de même.
    expect(quiTourne(["a", "b", "c"], CHAINE, new Set(), cache)).toEqual(["a", "b", "c"]);
    // Mais si « a » a lui aussi son cache, personne ne tourne.
    expect(quiTourne(["a", "b", "c"], CHAINE, new Set(), TOUS_EN_CACHE)).toEqual([]);
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

  it("AU PREMIER RUN TOUT TOURNE, copies comprises", () => {
    const { ordre, liens, ids } = deplie(3);
    expect(quiTourne(ordre, liens, new Set(), new Map()).sort()).toEqual([...ids].sort());
  });

  it("ET AU RUN SUIVANT, RIEN NE TOURNE : une boucle inchangée ne se recalcule pas", () => {
    const { ordre, liens, ids } = deplie(3);
    const tout = new Map(ids.map((id) => [id, EMPREINTES]));
    expect(quiTourne(ordre, liens, new Set(), tout)).toEqual([]);
  });

  it("UN RÉGLAGE CHANGÉ EN AMONT ENTRAÎNE CHAQUE TOUR, puis la fin et l'aval", () => {
    // C'est le cas exact du relevé. La remise à zéro d'un réglage efface le cache des descendants
    // VISIBLES — `avant`, `deb`, `finA`, `apres` — et ne peut pas toucher celui des copies, qui
    // n'existent pas hors du dépliage. Sans propagation, les trois tours serviraient le son d'avant.
    const { ordre, liens, ids } = deplie(3);
    const cache = new Map(ids.map((id) => [id, EMPREINTES]));
    cache.delete("avant");
    const tournent = quiTourne(ordre, liens, new Set(), cache);
    expect(tournent, "chaque tour doit être entraîné, et aucun ne doit resservir son cache").toEqual(
      ["avant", "deb#0::dans", "deb#1::dans", "deb#2::dans", "finA", "apres"]);
    expect(tournent, "et la source, elle, n'a aucune raison de rejouer").not.toContain("src");
  });

  it("ET CELA TIENT SUR TROIS CENTS TOURS, le réglage n'ayant plus de plafond", () => {
    // Le nombre de tours était clos à trente-deux ; il est ouvert, et seul le nombre total de
    // COPIES est borné. Trois cents tours d'un ventre d'un nœud restent sous ce plafond-là.
    const TOURS = 300;
    const { ordre, liens, ids } = deplie(TOURS);
    const cache = new Map(ids.map((id) => [id, EMPREINTES]));
    cache.delete("avant");
    const tournent = quiTourne(ordre, liens, new Set(), cache);
    const copies = ids.filter((id) => id.includes("::dans"));
    expect(copies.length).toBe(TOURS);
    for (const c of copies) expect(tournent, `le tour ${c} doit rejouer`).toContain(c);
    expect(tournent).toContain("apres");
  });

  it("UN COMPOSANT `jamaisCache` DANS LA BOUCLE ENTRAÎNE TOUS LES TOURS QUI LE SUIVENT", () => {
    // Un lecteur de fichier, un tirage au sort : son résultat peut changer sans qu'aucune empreinte
    // ne bouge. Le tour où il se trouve rejoue, donc le suivant aussi, de proche en proche.
    const { ordre, liens, ids } = deplie(4);
    const cache = new Map(ids.map((id) => [id, EMPREINTES]));
    const tournent = quiTourne(ordre, liens, new Set(["deb#1::dans"]), cache);
    expect(tournent).toEqual(["deb#1::dans", "deb#2::dans", "deb#3::dans", "finA", "apres"]);
    expect(tournent, "le tour d'avant n'a aucune raison de rejouer").not.toContain("deb#0::dans");
  });

  it("ET L'AMONT DE LA BOUCLE N'EST JAMAIS ENTRAÎNÉ PAR ELLE : la propagation ne remonte pas", () => {
    const { ordre, liens, ids } = deplie(3);
    const cache = new Map(ids.map((id) => [id, EMPREINTES]));
    const tournent = quiTourne(ordre, liens, new Set(["finA"]), cache);
    expect(tournent).toEqual(["finA", "apres"]);
    for (const amont of ["src", "avant", "deb#0::dans", "deb#1::dans", "deb#2::dans"]) {
      expect(tournent, `${amont} est en amont : le rejouer serait du temps perdu`).not.toContain(amont);
    }
  });

  it("DEUX BOUCLES CÔTE À CÔTE NE S'ENTRAÎNENT PAS L'UNE L'AUTRE", () => {
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
    const tournent = quiTourne(ordre, liens, new Set(["debA#0::dansA"]), cache);
    for (const b of tournent) expect(b, "aucune copie de la boucle B ne doit être entraînée").not.toContain("dansB");
    expect(tournent).not.toContain("finB");
    expect(tournent).toContain("finA");
  });
});
