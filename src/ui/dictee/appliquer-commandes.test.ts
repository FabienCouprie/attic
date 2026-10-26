// ui/dictee/appliquer-commandes.test.ts — Ce qu'une suite de commandes fait au graphe.
//
// ═══ CES CAS NE POUVAIENT PAS EXISTER AVANT, ET C'EST POURQUOI L'EXTRACTION A EU LIEU ═══
//
// L'application d'une dictée vivait dans `ui/App.tsx`, en cent quarante-sept lignes refermées sur
// `setNodes`, `pushHistorique` et `undo`. Sa grammaire et ses règles de placement étaient éprouvées
// — `commandes-dictee.test.ts`, `pose-dictee.test.ts` — mais ce qui les ASSEMBLE ne l'était pas, et
// `tests-e2e/` ne portait aucune épreuve de dictée : le seul chemin qui menait à ces verbes était
// un micro.
//
// CE QUI EST GARDÉ ICI EST DONC L'ASSEMBLAGE : l'enchaînement sans mot de liaison, l'insertion qui
// détourne au lieu de dériver, les refus qui laissent un nœud posé mais libre, et la frontière
// d'« annuler » — la seule commande que ce module ne peut pas calculer d'avance.
import { describe, expect, it, vi } from "vitest";

import { appliquerCommandes, type LienDicte, type OutilsDeDictee } from "./appliquer-commandes";
import type { Commande } from "./commandes-dictee";
import type { AreteDeDictee, NoeudPose } from "./pose-dictee";

const LIEN: LienDicte = {
  sourceHandle: "out:0", targetHandle: "in:0", type: "arete-personnalisee",
  style: { stroke: "#2a9d8f", strokeWidth: 2.5 },
};

/**
 * Un canevas d'essai. `sansLien` nomme les fiches dont aucun port ne s'accorde, ce qui est le seul
 * refus que la dictée doive dire sans rien annuler.
 */
function outils(o: { sansLien?: string[]; inconnues?: string[]; cycles?: boolean } = {}): OutilsDeDictee<NoeudPose> {
  let n = 0;
  return {
    nomDeFiche: (f) => f,
    existe: (f) => !(o.inconnues ?? []).includes(f),
    fabriquerNoeud: (ficheId, position) => ({ id: `n${++n}`, position, data: { ficheId } }),
    lienDicte: (noeuds, source, target) => {
      const fiche = (id: string) => String(noeuds.find((x) => x.id === id)?.data?.ficheId ?? "");
      const refuse = (o.sansLien ?? []).some((f) => f === fiche(source) || f === fiche(target));
      return refuse ? null : LIEN;
    },
    fermeraitUnCycle: () => !!o.cycles,
    traduire: (cle, ...args) => [cle, ...args].join("|"),
  };
}

const vide = { noeuds: [] as NoeudPose[], aretes: [] as AreteDeDictee[], selectionId: null, dernier: null };
const poser = (ficheId: string, parallele = false): Commande => ({ quoi: "poser", ficheId, nom: ficheId, parallele });

describe("appliquer une suite de commandes dictées", () => {
  it("UNE SUITE DE NOMS FORME UNE CHAÎNE, sans un seul mot de liaison", () => {
    // C'est ce qui rend la dictée praticable : nommer un composant le pose ET le branche sur le
    // courant, qui devient à son tour le courant.
    const r = appliquerCommandes([poser("reverbe"), poser("compresseur"), poser("sortie")], vide, outils());
    expect(r.lot.nouveaux.map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
    expect(r.lot.aretes.map((a) => `${a.source}→${a.target}`), [
      "",
      "LES COMPOSANTS DICTÉS NE S'ENCHAÎNENT PLUS.",
      "",
      "Nommer un composant doit le poser ET le relier au courant : c'est ce qui dispense de dire le",
      "lien, et sans quoi il faudrait un mot de liaison entre chaque nom.",
      "",
    ].join("\n")).toEqual(["n1→n2", "n2→n3"]);
    expect(r.lot.dernier, "le dernier posé devient le courant").toBe("n3");
    expect(r.lot.avis).toBeUndefined();
  });

  it("« EN PARALLÈLE » POSE SANS ENCHAÎNER", () => {
    const r = appliquerCommandes([poser("a"), poser("b", true)], vide, outils());
    expect(r.lot.nouveaux).toHaveLength(2);
    expect(r.lot.aretes, "aucun câble ne doit être posé").toEqual([]);
    expect(r.lot.dernier).toBe("n2");
  });

  it("LA SÉLECTION L'EMPORTE SUR LE DERNIER DICTÉ : c'est ce qui fait coopérer la voix et la souris", () => {
    // On clique sur un nœud déjà posé, et la dictée reprend depuis lui.
    const etat = {
      ...vide,
      noeuds: [{ id: "vieux", position: { x: 0, y: 0 }, data: { ficheId: "ancien" } }] as NoeudPose[],
      selectionId: "vieux", dernier: null,
    };
    const r = appliquerCommandes([poser("neuf")], etat, outils());
    expect(r.lot.aretes.map((a) => a.source)).toEqual(["vieux"]);
  });

  it("UNE RÉFÉRENCE DÉSIGNE, ELLE NE CRÉE PAS : si elle ne désigne rien, rien n'est posé", () => {
    // Poser quand même, sans le lien demandé, ferait passer un refus pour une réussite.
    const cmd: Commande = { quoi: "poser", ficheId: "compresseur", nom: "compresseur", parallele: false,
      position: { refFicheId: "reverbe", ou: "apres" } };
    const r = appliquerCommandes([cmd], vide, outils());
    expect(r.lot.nouveaux, "aucun nœud ne doit être posé").toEqual([]);
    expect(String(r.lot.avis)).toContain("dictee.referenceAbsente");
  });

  it("INSÉRER DÉTOURNE CE QUI PARTAIT DE LA RÉFÉRENCE, au lieu d'en dériver une branche", () => {
    // ═══ C'EST LA DIFFÉRENCE ENTRE ALLONGER UNE CHAÎNE ET LA BRANCHER EN Y ═══
    //
    // « ajoute un compresseur après la réverbération » doit faire PASSER le son par le compresseur.
    // Sans le détournement, la réverbération alimenterait deux branches et le son d'origine
    // continuerait de sortir sans compression.
    const etat = {
      ...vide,
      noeuds: [
        { id: "rev", position: { x: 0, y: 0 }, data: { ficheId: "reverbe" } },
        { id: "out", position: { x: 300, y: 0 }, data: { ficheId: "sortie" } },
      ] as NoeudPose[],
      aretes: [{ id: "e1", source: "rev", target: "out" }] as AreteDeDictee[],
    };
    const cmd: Commande = { quoi: "poser", ficheId: "compresseur", nom: "compresseur", parallele: false,
      position: { refFicheId: "reverbe", ou: "apres" } };
    const r = appliquerCommandes([cmd], etat, outils());
    expect(r.lot.nouveaux).toHaveLength(1);
    expect(r.lot.aDetourner, [
      "",
      "UNE INSERTION NE DÉTOURNE PLUS CE QUI PARTAIT DE LA RÉFÉRENCE.",
      "",
      "Le son ne passerait alors PAS par le composant inséré : la référence alimenterait deux",
      "branches, et l'original continuerait de sortir sans traitement.",
      "",
    ].join("\n")).toEqual([{ id: "e1", vers: "n1", ou: "apres" }]);
    expect(r.lot.aretes.map((a) => `${a.source}→${a.target}`)).toEqual(["rev→n1"]);
  });

  it("ET UNE INSERTION IMPOSSIBLE EST ABANDONNÉE ENTIÈRE, redirections comprises", () => {
    // Rediriger ce qui part de la référence vers un nœud qui ne peut rien en recevoir COUPERAIT la
    // chaîne au lieu de l'allonger. Le nœud reste sur le canevas, libre, et on le dit.
    const etat = {
      ...vide,
      noeuds: [
        { id: "rev", position: { x: 0, y: 0 }, data: { ficheId: "reverbe" } },
        { id: "out", position: { x: 300, y: 0 }, data: { ficheId: "sortie" } },
      ] as NoeudPose[],
      aretes: [{ id: "e1", source: "rev", target: "out" }] as AreteDeDictee[],
    };
    const cmd: Commande = { quoi: "poser", ficheId: "texte", nom: "texte", parallele: false,
      position: { refFicheId: "reverbe", ou: "apres" } };
    const r = appliquerCommandes([cmd], etat, outils({ sansLien: ["texte"] }));
    expect(r.lot.nouveaux, "le nœud reste posé").toHaveLength(1);
    expect(r.lot.aDetourner, "mais rien n'est détourné").toEqual([]);
    expect(r.lot.aretes).toEqual([]);
    expect(String(r.lot.avis)).toContain("dictee.sansLien");
    expect(r.lot.dernier, "et il devient tout de même le courant").toBe("n1");
  });

  it("« RELIER » NE POSE RIEN, donc son refus se dit autrement", () => {
    const etat = {
      ...vide,
      noeuds: [
        { id: "a", position: { x: 0, y: 0 }, data: { ficheId: "texte" } },
        { id: "b", position: { x: 300, y: 0 }, data: { ficheId: "sortie" } },
      ] as NoeudPose[],
    };
    const r = appliquerCommandes([{ quoi: "relier", de: "texte", vers: "sortie" }], etat,
      outils({ sansLien: ["texte"] }));
    expect(r.lot.nouveaux).toEqual([]);
    expect(String(r.lot.avis)).toContain("dictee.lienImpossible");
  });

  it("et une arête qui refermerait un cycle est refusée, comme à la souris", () => {
    const avertir = vi.spyOn(console, "warn").mockImplementation(() => {});
    const etat = {
      ...vide,
      noeuds: [
        { id: "a", position: { x: 0, y: 0 }, data: { ficheId: "un" } },
        { id: "b", position: { x: 300, y: 0 }, data: { ficheId: "deux" } },
      ] as NoeudPose[],
    };
    const r = appliquerCommandes([{ quoi: "relier", de: "un", vers: "deux" }], etat, outils({ cycles: true }));
    expect(r.lot.aretes, "une arête qui referme un cycle rend muette une branche").toEqual([]);
    expect(avertir).toHaveBeenCalled();
    avertir.mockRestore();
  });

  it("LES TROIS GESTES DE SÉANCE SONT RETENUS, ET NON FAITS SUR-LE-CHAMP", () => {
    // « pose un compresseur et lance » doit lancer un graphe qui PORTE le compresseur. Les faire
    // dans la boucle les ferait porter sur le graphe d'avant.
    const r = appliquerCommandes([poser("a"), { quoi: "lancer" }, { quoi: "recentrer" }], vide, outils());
    expect(r.lot.nouveaux, "le nœud doit être dans le lot, donc versé AVANT le lancement").toHaveLength(1);
    expect(r.seance).toEqual({ lancer: true, arreter: false, recentrer: true });
  });

  it("« ANNULER » ARRÊTE LA SUITE ET REND CE QU'IL RESTE À FAIRE", () => {
    // ═══ LA SEULE COMMANDE QUI NE SE CALCULE PAS D'AVANCE ═══
    //
    // Elle verse ce qui attend, DÉFAIT, puis repart de l'état obtenu — que ce module ne peut pas
    // prévoir, l'historique ne lui appartenant pas. C'est elle qui a tenu ce code dans `App.tsx`.
    const r = appliquerCommandes([poser("a"), { quoi: "annuler" }, poser("b")], vide, outils());
    expect(r.lot.nouveaux, "ce qui précède l'annulation doit être versé d'abord").toHaveLength(1);
    expect(r.annulerEnsuite, [
      "",
      "« ANNULER » NE REND PLUS LA MAIN À L'APPELANT.",
      "",
      "Il doit verser ce qui attend, défaire, puis redemander avec `reste` : l'état d'après une",
      "annulation ne se calcule pas ici, l'historique appartenant au canevas.",
      "",
    ].join("\n")).toBe(true);
    expect(r.reste, "et ce qui suit l'annulation reste à faire").toEqual([poser("b")]);
  });

  it("une fiche inconnue est refusée sans rien poser", () => {
    const r = appliquerCommandes([poser("fantome")], vide, outils({ inconnues: ["fantome"] }));
    expect(r.lot.nouveaux).toEqual([]);
    expect(String(r.lot.avis)).toContain("fantome");
  });

  it("et l'avis rendu est le DERNIER, non le premier", () => {
    // Une suite dont le dernier geste échoue doit dire ce qui vient d'échouer, et non un refus
    // survenu trois mots plus tôt.
    const cmd = (f: string): Commande => ({ quoi: "poser", ficheId: f, nom: f, parallele: false,
      position: { refFicheId: "absent", ou: "apres" } });
    const r = appliquerCommandes([cmd("premier"), cmd("dernier")], vide, outils());
    expect(String(r.lot.avis)).toContain("absent");
  });
});
