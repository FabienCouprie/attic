// ui/journal-de-session.test.ts — Le journal écrit quand il faut, et JAMAIS avant d'être armé.
//
// ═══ CE QUE CES CAS TIENNENT ═══
//
// Point 9 de la revue critique : sans fichier ouvert, fermer l'application perdait tout. Le
// mécanisme de restauration existait déjà — `attic-encours` est relu au démarrage —, personne ne
// l'alimentait.
//
// LE CAS LE PLUS IMPORTANT EST CELUI DE L'ARMEMENT, et il garde contre une destruction. `App.tsx`
// restaure l'en-cours dans un effet ASYNCHRONE : au montage le graphe est vide, et il se remplit
// ensuite. Un journal qui écrirait au premier changement écrirait `{ nodes: [] }` par-dessus la
// session qu'il est censé sauver.
import { describe, expect, it } from "vitest";
import { creerJournalDeSession, DELAI_JOURNAL_MS } from "./journal-de-session";

/** Une horloge qu'on avance à la main : aucun cas ne dépend du temps réel. */
function horloge() {
  let suivant = 1;
  const taches = new Map<number, { f: () => void; ms: number }>();
  return {
    differer: (f: () => void, ms: number) => { const j = suivant++; taches.set(j, { f, ms }); return j; },
    annulerDifferé: (j: unknown) => { taches.delete(j as number); },
    /** Déclenche tout ce qui était programmé. */
    avancer() {
      const aFaire = [...taches.values()];
      taches.clear();
      for (const t of aFaire) t.f();
    },
    enCours: () => taches.size,
    /** Le délai demandé par la dernière tâche programmée. */
    dernierDelai: () => [...taches.values()].at(-1)?.ms,
  };
}

function bac(delaiMs?: number) {
  const h = horloge();
  const ecrits: number[] = [];
  let echoue = false;
  const j = creerJournalDeSession({
    ecrire: () => { if (echoue) return false; ecrits.push(ecrits.length + 1); return true; },
    delaiMs,
    differer: h.differer,
    annulerDifferé: h.annulerDifferé,
  });
  return { h, j, ecrits, faireEchouer: () => { echoue = true; } };
}

describe("le journal de session", () => {
  it("N'ÉCRIT RIEN AVANT D'ÊTRE ARMÉ, et c'est ce qui empêche d'écraser une session restaurée", () => {
    // SANS CETTE RÈGLE, LE JOURNAL DÉTRUIT CE QU'IL SAUVE. La restauration est asynchrone : au
    // montage le graphe est vide, et une écriture à ce moment-là remplace l'en-cours par du vide.
    const { h, j, ecrits } = bac();
    j.noter();
    j.noter();
    expect(j.enAttente(), "rien ne doit même être programmé").toBe(false);
    expect(h.enCours()).toBe(0);
    h.avancer();
    expect(ecrits).toEqual([]);
  });

  it("et une fois armé, il écrit — après le délai, pas avant", () => {
    const { h, j, ecrits } = bac();
    j.armer();
    expect(j.estArme()).toBe(true);
    j.noter();
    expect(j.enAttente()).toBe(true);
    expect(ecrits, "rien n'est écrit tant que le délai n'est pas échu").toEqual([]);
    h.avancer();
    expect(ecrits).toEqual([1]);
    expect(j.enAttente(), "et l'attente est retombée").toBe(false);
  });

  it("UN GESTE CONTINU N'ÉCRIT QU'UNE FOIS : l'échéance se repousse à chaque changement", () => {
    // Déplacer un nœud produit une dizaine de changements par seconde. Écrire à chacun serait payer
    // dix fois le parcours du graphe pour un seul geste.
    const { h, j, ecrits } = bac();
    j.armer();
    for (let i = 0; i < 20; i++) j.noter();
    expect(h.enCours(), "une seule écriture est programmée").toBe(1);
    h.avancer();
    expect(ecrits).toEqual([1]);
  });

  it("ET LA FERMETURE VIDE CE QUI ATTENDAIT, sans quoi le délai serait une perte garantie", () => {
    const { h, j, ecrits } = bac();
    j.armer();
    j.noter();
    j.vider();
    expect(ecrits, "l'écriture a eu lieu tout de suite").toEqual([1]);
    expect(j.enAttente()).toBe(false);
    h.avancer();
    expect(ecrits, "et elle n'a pas eu lieu deux fois").toEqual([1]);
  });

  it("et vider sans rien en attente n'écrit pas : une fermeture ne réécrit pas l'identique", () => {
    const { j, ecrits } = bac();
    j.armer();
    j.vider();
    expect(ecrits).toEqual([]);
  });

  it("ANNULER OUBLIE SANS ÉCRIRE, ce qu'un démontage doit faire", () => {
    const { h, j, ecrits } = bac();
    j.armer();
    j.noter();
    j.annuler();
    expect(j.enAttente()).toBe(false);
    h.avancer();
    expect(ecrits).toEqual([]);
  });

  it("une écriture qui échoue n'est pas comptée, et ne bloque pas les suivantes", () => {
    // Un quota de stockage dépassé est le cas réel : le journal doit le dire par son compte plutôt
    // que de prétendre avoir écrit.
    const { h, j, faireEchouer } = bac();
    j.armer();
    faireEchouer();
    j.noter();
    h.avancer();
    expect(j.ecritures()).toBe(0);
    j.noter();
    h.avancer();
    expect(j.ecritures(), "et la suivante est bien tentée").toBe(0);
  });

  it("et chaque écriture réussie est comptée", () => {
    const { h, j } = bac();
    j.armer();
    for (let i = 0; i < 3; i++) { j.noter(); h.avancer(); }
    expect(j.ecritures()).toBe(3);
  });

  // ═══ ON N'ÉCRASE QUE CE QU'ON A ÉCRIT SOI-MÊME ═══
  //
  // CE GARDE VIENT D'UNE CI ROUGE, et le mécanisme est réel. Un cas de `pont-electron-vivant`
  // POSE un en-cours depuis la page puis recharge ; `pagehide` déclenchait le vidage, qui écrivait
  // le graphe courant PAR-DESSUS la semence. Le même mécanisme vaut dans l'application : une
  // seconde fenêtre écraserait la session de la première en se fermant.
  describe("devant un en-cours venu d'ailleurs", () => {
    function bacAvecAutrui(autrui: () => boolean) {
      const h = horloge();
      let ecrits = 0;
      const j = creerJournalDeSession({
        ecrire: () => { ecrits += 1; return true; },
        ecritPourAutrui: autrui,
        differer: h.differer, annulerDifferé: h.annulerDifferé,
      });
      return { h, j, lu: () => ecrits };
    }

    it("N'ÉCRIT PAS, et le compte le dit", () => {
      const { h, j, lu } = bacAvecAutrui(() => true);
      j.armer();
      j.noter();
      h.avancer();
      expect(lu(), "rien n'est écrit par-dessus l'autre").toBe(0);
      expect(j.ecritures()).toBe(0);
      expect(j.ecartees(), "et l'écart est compté, non tu").toBe(1);
    });

    it("et le vidage de fermeture ne l'écrase pas davantage", () => {
      const { j, lu } = bacAvecAutrui(() => true);
      j.armer();
      j.noter();
      j.vider();
      expect(lu()).toBe(0);
      expect(j.ecartees()).toBe(1);
    });

    it("MAIS IL ÉCRIT QUAND L'EN-COURS EST LE SIEN, sans quoi il ne servirait plus à rien", () => {
      const { h, j, lu } = bacAvecAutrui(() => false);
      j.armer();
      j.noter();
      h.avancer();
      expect(lu()).toBe(1);
      expect(j.ecartees()).toBe(0);
    });

    it("et l'instant du dernier changement est celui qu'on lui donne à comparer", () => {
      // Le garde reçoit l'instant de NOTRE dernier changement : c'est lui qui distingue « écrit
      // avant nous », qu'on peut écraser, de « écrit après », qu'on ne peut pas.
      const vus: number[] = [];
      const h = horloge();
      const j = creerJournalDeSession({
        ecrire: () => true,
        ecritPourAutrui: (depuis) => { vus.push(depuis); return false; },
        differer: h.differer, annulerDifferé: h.annulerDifferé,
      });
      j.armer();
      const avant = Date.now();
      j.noter();
      h.avancer();
      expect(vus.length).toBe(1);
      expect(vus[0]).toBeGreaterThanOrEqual(avant);
    });
  });

  it("LE DÉLAI EST CELUI QU'ON DEMANDE, et son défaut est déclaré", () => {
    const { h, j } = bac(40);
    j.armer();
    j.noter();
    expect(h.dernierDelai()).toBe(40);

    const parDefaut = bac();
    parDefaut.j.armer();
    parDefaut.j.noter();
    expect(parDefaut.h.dernierDelai()).toBe(DELAI_JOURNAL_MS);
    expect(DELAI_JOURNAL_MS, "au-delà, ce qu'on risque de perdre se sent").toBeLessThanOrEqual(2000);
  });
});
