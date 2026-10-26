// ui/ordonnanceur-runs.test.ts — Deux exécutions ne se chevauchent plus.
//
// ═══ CE QUE CES CAS TIENNENT ═══
//
// Point 3 de la revue critique du 2026-10-25 : deux runs pouvaient tourner ensemble sur le même
// cache. Le défaut n'était pas un oubli isolé mais une mécanique entière — un garde qui ne couvrait
// que le run global, un contrôleur d'arrêt écrasé, un drapeau booléen remis à faux par le premier
// qui finit. Ce module la remplace, et ces cas la mesurent.
//
// LA PROPRIÉTÉ CENTRALE EST « UNE À LA FOIS », et elle se mesure en COMPTANT LES SIMULTANÉES, non en
// regardant l'ordre : un ordonnanceur qui lancerait tout de suite et finirait dans le bon ordre
// passerait n'importe quel cas écrit sur l'ordre seul.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  creerOrdonnanceur, creteDeSimultanees, fusionDeLot, oublierLaCrete, REGLAGES_DU_MOTEUR,
  type JetonDeRun, type PorteeDeLot,
} from "./ordonnanceur-runs";

/** Une tâche qu'on retient, pour tenir deux demandes en vol en même temps. */
function tacheRetenue(nom: string, journal: string[]) {
  let relacher: (() => void) | null = null;
  const barriere = new Promise<void>((r) => { relacher = r; });
  return {
    nom,
    relacher: () => relacher?.(),
    executer: async (jeton: JetonDeRun) => {
      journal.push(`${nom}:debut:${jeton.generation}`);
      await barriere;
      journal.push(`${nom}:fin:${jeton.generation}${jeton.perime() ? ":PERIME" : ""}`);
      return nom;
    },
  };
}

/** Laisse la file de micro-tâches se vider, pour que les `then` en attente aient eu lieu. */
const souffler = () => new Promise<void>((r) => setTimeout(r, 0));

describe("l'ordonnanceur d'exécutions", () => {
  it("N'EN LAISSE TOURNER QU'UNE À LA FOIS, et c'est toute la raison de son existence", async () => {
    const o = creerOrdonnanceur();
    let simultanees = 0;
    let crete = 0;
    const une = async () => {
      simultanees += 1;
      crete = Math.max(crete, simultanees);
      await souffler();
      simultanees -= 1;
    };
    await Promise.all([o.demander(une), o.demander(une), o.demander(une)]);
    expect(crete, "deux exécutions en vol en même temps sont le défaut relevé").toBe(1);
  });

  it("et la seconde ATTEND SON TOUR : elle ne commence pas avant que la première ait fini", async () => {
    const journal: string[] = [];
    const o = creerOrdonnanceur();
    const a = tacheRetenue("a", journal);
    const b = tacheRetenue("b", journal);
    const pa = o.demander(a.executer);
    const pb = o.demander(b.executer);
    await souffler();
    expect(journal, "« b » ne doit pas avoir commencé").toEqual(["a:debut:1"]);
    expect(o.enCours()).toBe(true);
    expect(o.enAttente()).toBe(1);

    a.relacher();
    await souffler();
    expect(journal).toEqual(["a:debut:1", "a:fin:1", "b:debut:2"]);
    b.relacher();
    expect(await Promise.all([pa, pb])).toEqual(["a", "b"]);
    expect(o.enCours()).toBe(false);
  });

  it("LE JETON DIT QU'UNE EXÉCUTION EST PÉRIMÉE, ce qui est le seul moyen de ne pas écouter sa queue", async () => {
    // UN COMPOSANT QUI NE CONSULTE PAS SON SIGNAL CONTINUE EN ARRIÈRE-PLAN — c'est écrit dans
    // `useExecutionGraphe.ts` — et écrit son résultat quand il finit. Le jeton est ce qui permet de
    // l'écarter au lieu de le laisser abîmer le graphe qui tourne maintenant.
    const o = creerOrdonnanceur();
    let vieux: JetonDeRun | null = null;
    await o.demander(async (jeton) => { vieux = jeton; });
    expect(vieux!.perime(), "seule, elle n'est pas périmée").toBe(false);
    await o.demander(async () => { /* la suivante */ });
    expect(vieux!.perime(), "une exécution plus récente a commencé : l'ancienne est périmée").toBe(true);
  });

  it("et la génération croît d'une exécution à la suivante", async () => {
    const o = creerOrdonnanceur();
    expect(o.generation(), "avant toute exécution").toBe(0);
    const vues: number[] = [];
    await o.demander(async (j) => { vues.push(j.generation); });
    await o.demander(async (j) => { vues.push(j.generation); });
    expect(vues).toEqual([1, 2]);
    expect(o.generation()).toBe(2);
  });

  it("UNE TÂCHE QUI LÈVE NE BLOQUE PAS LA FILE, sinon un seul composant fautif gèlerait l'application", async () => {
    const journal: string[] = [];
    const o = creerOrdonnanceur();
    const pa = o.demander(async () => { throw new Error("je lève"); });
    const pb = o.demander(async () => { journal.push("b"); return "b"; });
    await expect(pa).rejects.toThrow("je lève");
    expect(await pb).toBe("b");
    expect(journal, "la suivante a bien eu lieu").toEqual(["b"]);
    expect(o.enCours()).toBe(false);
  });

  it("LA FILE EST BORNÉE, et c'est LA PLUS ANCIENNE EN ATTENTE QUI TOMBE", async () => {
    // Cinq clics pendant un run de trois minutes ne veulent pas dire « rejoue cinq fois » : ils
    // veulent dire « finalement, ceci ». Une demande écartée rend `undefined` et ne lève pas.
    const journal: string[] = [];
    const o = creerOrdonnanceur({ enAttenteMax: 1 });
    const a = tacheRetenue("a", journal);
    const pa = o.demander(a.executer);
    await souffler();
    const pb = o.demander(async () => { journal.push("b"); return "b"; });
    const pc = o.demander(async () => { journal.push("c"); return "c"; });
    expect(o.enAttente(), "une seule attend").toBe(1);
    a.relacher();
    expect(await pa).toBe("a");
    expect(await pb, "la plus ancienne en attente est écartée, et ne lève pas").toBeUndefined();
    expect(await pc).toBe("c");
    expect(journal, "« b » n'a jamais tourné").toEqual(["a:debut:1", "a:fin:1", "c"]);
  });

  it("et la file se vide sur demande, ce qui est ce qu'« Arrêter » doit faire", async () => {
    const journal: string[] = [];
    const o = creerOrdonnanceur({ enAttenteMax: 4 });
    const a = tacheRetenue("a", journal);
    const pa = o.demander(a.executer);
    await souffler();
    const pb = o.demander(async () => { journal.push("b"); return "b"; });
    const pc = o.demander(async () => { journal.push("c"); return "c"; });
    expect(o.enAttente()).toBe(2);
    expect(o.viderLaFile()).toBe(2);
    expect(o.enAttente()).toBe(0);
    a.relacher();
    expect(await pa).toBe("a");
    expect(await pb).toBeUndefined();
    expect(await pc).toBeUndefined();
    expect(journal, "ni « b » ni « c » n'ont tourné").toEqual(["a:debut:1", "a:fin:1"]);
  });

  // ═══ LA FUSION DES DEMANDES EN ATTENTE ═══
  //
  // Relevé le 2026-10-26 : la file n'en tenait qu'une, et la plus récente gagnait. Une relance
  // automatique vers l'aval — celle qui répare ce qu'un changement de réglage vient d'effacer —
  // était donc écartée par un ▶ cliqué juste après, et l'aval restait « En attente », c'est-à-dire
  // le défaut même que la relance existait pour réparer.
  describe("la fusion des demandes", () => {
    /** Le lanceur du moteur, réduit à ce qui se mesure : ce qu'on lui demande de couvrir. */
    const lanceur = (journal: string[], vus: (PorteeDeLot | undefined)[]) =>
      async (_noeud: string | undefined, portee: PorteeDeLot | undefined, _jeton?: JetonDeRun) => {
        journal.push("lot");
        vus.push(portee);
        return "lot";
      };

    it("FOND DEUX DEMANDES DE MÊME CIBLE, et l'aval survit au ▶ qui le suit", async () => {
      const journal: string[] = [];
      const vus: (PorteeDeLot | undefined)[] = [];
      const o = creerOrdonnanceur();
      const lot = lanceur(journal, vus);
      const a = tacheRetenue("a", journal);
      const pa = o.demander(a.executer);
      await souffler();

      // La relance automatique après réglage : elle demande l'aval.
      const pRelance = o.demander((j) => lot("n1", { versLAval: true }, j),
        fusionDeLot("n1", { versLAval: true }, lot));
      // Le ▶ du même nœud, cliqué juste après : il ne demande pas l'aval.
      const pClic = o.demander((j) => lot("n1", undefined, j), fusionDeLot("n1", undefined, lot));

      expect(o.enAttente(), "une demande fondue ne fait pas grandir la file").toBe(1);
      a.relacher();
      await pa;
      expect(await pRelance, "la relance n'est plus écartée en silence").toBe("lot");
      expect(await pClic, "et le clic reçoit le même résultat").toBe("lot");
      expect(journal.filter((x) => x === "lot").length, "un seul run, et non deux").toBe(1);
      expect(vus, "L'AVAL DEMANDÉ PAR LA RELANCE A SURVÉCU au clic qui ne le demandait pas")
        .toEqual([{ versLAval: true }]);
    });

    it("et deux cibles différentes ne se fondent pas : elles attendent chacune leur tour", async () => {
      // ═══ CE CAS DISAIT L'INVERSE, ET C'EST LA REVUE QUI A EU RAISON ═══
      //
      // Il affirmait que la plus ancienne tombait, au motif que l'union de deux nœuds n'existe pas
      // — le seul run qui les couvre tous deux est le run GLOBAL. C'était vrai de l'UNION, et
      // faux comme conclusion : la réponse n'est ni l'union ni le rejet, mais la FILE. Avec les
      // réglages du moteur, les deux cibles se rejouent l'une après l'autre, et l'amont commun
      // n'est calculé qu'une fois grâce au cache.
      const journal: string[] = [];
      const vus: (PorteeDeLot | undefined)[] = [];
      const o = creerOrdonnanceur(REGLAGES_DU_MOTEUR);
      const lot = lanceur(journal, vus);
      const a = tacheRetenue("a", journal);
      const pa = o.demander(a.executer);
      await souffler();

      const p1 = o.demander((j) => lot("n1", undefined, j), fusionDeLot("n1", undefined, lot));
      const p2 = o.demander((j) => lot("n2", undefined, j), fusionDeLot("n2", undefined, lot));

      expect(o.enAttente(), "elles ne se fondent pas : deux intentions, deux places").toBe(2);
      a.relacher();
      expect(await pa).toBe("a");
      expect(await p1, "la plus ancienne n'est plus écartée").toBe("lot");
      expect(await p2).toBe("lot");
      expect(journal.filter((x) => x === "lot").length, "les deux ont tourné").toBe(2);
    });

    it("MAIS LA BORNE N'A PAS DISPARU : au-delà de quatre cibles, la plus ancienne tombe", async () => {
      // Elle a cessé de valoir UN, elle n'a pas cessé d'exister : une rafale ne doit pas rejouer
      // indéfiniment ce que plus personne n'attend.
      const journal: string[] = [];
      const vus: (PorteeDeLot | undefined)[] = [];
      const o = creerOrdonnanceur(REGLAGES_DU_MOTEUR);
      const lot = lanceur(journal, vus);
      const a = tacheRetenue("a", journal);
      const pa = o.demander(a.executer);
      await souffler();

      const demandes = ["n1", "n2", "n3", "n4", "n5"].map((n) =>
        o.demander((j) => lot(n, undefined, j), fusionDeLot(n, undefined, lot)));
      expect(o.enAttente(), "quatre au plus").toBe(4);
      a.relacher();
      await pa;
      expect(await demandes[0], "la plus ancienne est tombée").toBeUndefined();
      for (const p of demandes.slice(1)) expect(await p).toBe("lot");
      expect(journal.filter((x) => x === "lot").length).toBe(4);
    });

    it("ET L'ORDRE D'ARRIVÉE EST TENU : la relance en attente passe avant le clic qui l'a suivie", async () => {
      const journal: string[] = [];
      const vus: (PorteeDeLot | undefined)[] = [];
      const o = creerOrdonnanceur(REGLAGES_DU_MOTEUR);
      const lot = async (noeud: string | undefined, _p: PorteeDeLot | undefined, _j?: JetonDeRun) => {
        journal.push(String(noeud));
        return "lot";
      };
      void vus;
      const a = tacheRetenue("a", journal);
      const pa = o.demander(a.executer);
      await souffler();

      o.demander((j) => lot("n1", undefined, j), fusionDeLot("n1", undefined, lot));
      o.demander((j) => lot("n2", undefined, j), fusionDeLot("n2", undefined, lot));
      a.relacher();
      await pa;
      await souffler();
      await souffler();
      expect(journal.filter((x) => x === "n1" || x === "n2")).toEqual(["n1", "n2"]);
    });

    it("ET DEUX RUNS GLOBAUX SE FONDENT AUSSI, l'aval de l'un servant à l'autre", async () => {
      // Un run global n'a pas de nœud visé ; il est sa propre cible, et deux d'entre eux se
      // fondaient déjà en se chassant — mais en perdant l'aval que l'un des deux demandait.
      const journal: string[] = [];
      const vus: (PorteeDeLot | undefined)[] = [];
      const o = creerOrdonnanceur();
      const lot = lanceur(journal, vus);
      const a = tacheRetenue("a", journal);
      const pa = o.demander(a.executer);
      await souffler();

      const p1 = o.demander((j) => lot(undefined, { versLAval: true }, j),
        fusionDeLot(undefined, { versLAval: true }, lot));
      const p2 = o.demander((j) => lot(undefined, undefined, j),
        fusionDeLot(undefined, undefined, lot));

      a.relacher();
      await pa;
      expect(await p1).toBe("lot");
      expect(await p2).toBe("lot");
      expect(vus).toEqual([{ versLAval: true }]);
    });
  });

  // ═══ LA POLITIQUE, QUI EST UNE QUESTION D'USAGE ET NON DE MÉCANIQUE ═══
  describe("en politique « passer-devant »", () => {
    it("DEMANDE L'ARRÊT DE CE QUI TOURNE, au lieu de le laisser aller jusqu'au bout", async () => {
      const journal: string[] = [];
      let arrets = 0;
      const o = creerOrdonnanceur({ politique: "passer-devant", arreter: () => { arrets += 1; } });
      const a = tacheRetenue("a", journal);
      const pa = o.demander(a.executer);
      await souffler();
      const pb = o.demander(async () => { journal.push("b"); return "b"; });
      expect(arrets, "l'arrêt est demandé dès que la seconde se présente").toBe(1);

      // ET ELLE ATTEND QUAND MÊME SON TOUR : un arrêt est demandé, pas immédiat. Partir tout de
      // suite rouvrirait le chevauchement même qu'on ferme.
      expect(journal, "« b » n'a pas commencé avant la fin de « a »").toEqual(["a:debut:1"]);
      a.relacher();
      expect(await pa).toBe("a");
      expect(await pb).toBe("b");
    });

    it("et sans rien en vol, elle ne demande aucun arrêt", async () => {
      let arrets = 0;
      const o = creerOrdonnanceur({ politique: "passer-devant", arreter: () => { arrets += 1; } });
      await o.demander(async () => "seule");
      expect(arrets).toBe(0);
    });
  });

  describe("en politique « attendre » (le défaut)", () => {
    it("ne demande JAMAIS d'arrêt : le travail en cours va jusqu'à son terme", async () => {
      const journal: string[] = [];
      let arrets = 0;
      const o = creerOrdonnanceur({ arreter: () => { arrets += 1; } });
      const a = tacheRetenue("a", journal);
      const pa = o.demander(a.executer);
      await souffler();
      const pb = o.demander(async () => "b");
      expect(arrets).toBe(0);
      a.relacher();
      await Promise.all([pa, pb]);
      expect(arrets).toBe(0);
    });
  });

  // ═══ LA CRÊTE PUBLIÉE, QUI EST L'INSTRUMENT DU CAS DE BOUT EN BOUT ═══
  describe("la crête de simultanées", () => {
    it("reste à UN quand l'ordonnanceur fait son travail", async () => {
      oublierLaCrete();
      const o = creerOrdonnanceur({ enAttenteMax: 5 });
      await Promise.all([1, 2, 3, 4].map(() => o.demander(async () => { await souffler(); })));
      expect(creteDeSimultanees()).toBe(1);
    });

    it("ET ELLE MONTERAIT SI DEUX TOURNAIENT, sans quoi elle ne mesurerait rien", async () => {
      // SANS CE CAS, LA CRÊTE SERAIT UN VERT TAUTOLOGIQUE : un compteur qui ne saurait pas compter
      // deux resterait à un pour une raison qui n'est pas celle qu'on croit. Deux ordonnanceurs
      // distincts n'ont aucune file commune — c'est exactement la situation d'avant, deux `lancer`
      // sans verrou partagé.
      oublierLaCrete();
      const a = creerOrdonnanceur();
      const b = creerOrdonnanceur();
      await Promise.all([
        a.demander(async () => { await souffler(); }),
        b.demander(async () => { await souffler(); }),
      ]);
      expect(creteDeSimultanees(), "la crête doit voir deux exécutions concurrentes").toBe(2);
    });
  });
});

// ═══ ET L'ORDONNANCEUR EST LA SEULE PORTE D'ENTRÉE DU MOTEUR ═══
//
// POURQUOI CE CAS LIT LA SOURCE. La crête ci-dessus compte ce qui passe PAR l'ordonnanceur : un
// appel qui le contournerait n'y figurerait pas, et le cas de bout en bout serait vert sur un
// contournement. Les deux vont donc par paire — l'un dit que la mécanique tourne, l'autre qu'on ne
// peut pas passer à côté.
//
// `useExecutionGraphe.ts` est un fichier en dette de la norme de taille : ce garde vit ici, et non
// dans un contrat de `src/docs/`, pour ne rien ajouter là où rien ne doit s'ajouter.
describe("le moteur d'exécution", () => {
  const SOURCE = readFileSync(join(__dirname, "hooks", "useExecutionGraphe.ts"), "utf8");

  /**
   * La source SANS SES COMMENTAIRES, et c'est une faute déjà payée.
   *
   * Le garde du garde retiré a d'abord été ROUGE sur un fichier correct : le commentaire qui
   * explique sa disparition CITE le code disparu, et l'interdiction tombait dessus. C'est le même
   * piège que le commentaire d'`accessSync` dans `electron/dossier-travail.test.ts`, et que
   * l'homonyme qui survivait dans l'expression surveillée.
   */
  const CODE = SOURCE.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

  it("N'EXPOSE QU'UNE PORTE, et elle passe par l'ordonnanceur", () => {
    const rendu = SOURCE.slice(SOURCE.lastIndexOf("return { lancer"));
    expect(rendu, "le hook doit rendre `lancer` et `arreter`").toContain("arreter");
    // La définition de `lancer` rendu au shell : elle doit déléguer.
    const def = SOURCE.match(/const lancer = useCallback\([^;]*/)?.[0] ?? "";
    expect(def, "`lancer` doit passer par `ordonnanceur.demander`").toContain("ordonnanceur.demander");
  });

  it("et le garde qui jetait une demande en silence a bien disparu", () => {
    // Il s'écrivait `if (!noeudPrioritaireId && enExecRef.current) return;`. Deux verrous dont l'un
    // jette la demande sans un mot valent moins qu'un seul qui la garde en file.
    expect(CODE).not.toMatch(/if\s*\(\s*!noeudPrioritaireId\s*&&\s*enExecRef\.current\s*\)\s*return/);
  });

  it("ET IL N'Y A PLUS DEUX SOURCES DE VÉRITÉ sur « est-ce que ça tourne »", () => {
    // `enCoursRef` était un booléen que le premier run fini remettait à faux pendant que l'autre
    // tournait. C'est l'ordonnanceur qui le sait maintenant, et il le compte.
    expect(CODE.includes("enCoursRef.current"),
      "`enCoursRef` est remplacé par `ordonnanceur.enCours()`").toBe(false);
  });

  it("et le cache n'est écrit que par une exécution qui n'est pas périmée", () => {
    // La seule écriture du cache de tout le moteur. Un composant qui ne consulte pas son signal
    // continue en arrière-plan ; son résultat ne doit pas atterrir dans le graphe qui tourne.
    const ecriture = SOURCE.match(/[^\n]*cacheExec\.current\.set\([^\n]*/)?.[0] ?? "";
    expect(ecriture, "l'écriture du cache a disparu ou changé de forme").not.toBe("");
    expect(ecriture, "elle doit être gardée par le jeton de génération").toContain("perime()");
  });
});
