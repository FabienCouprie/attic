// core/boucle-plan.test.ts — Le début de boucle qui fait tourner un PLAN, et non un son.
//
// POURQUOI UN FICHIER À PART, ET NON LA SUITE DE `boucle-graphe.test.ts`. Celui-là est inscrit à
// la dette de taille du dépôt, et un fichier en dette ne grossit plus. La règle pousse donc à
// ouvrir un sujet neuf dans un fichier neuf, ce qui se trouve être le bon découpage : ce que l'on
// tient ici n'est pas le dépliage en général, c'est qu'un SECOND début s'y insère sans rien
// changer.
//
// LA DIFFICULTÉ EST L'IMBRICATION, et elle est nommée dans l'en-tête du fichier voisin : deux
// boucles emboîtées ne dépliaient rien, en annonçant « Terminé » en vert, et la vraie raison ne
// vivait que dans la console. Un second début qui ne serait pas reconnu partout rejouerait cette
// faute. C'est pourquoi les cas qui suivent MÊLENT les deux sortes de début, dans les deux sens
// d'emboîtement, plutôt que d'essayer la neuve toute seule.
import { describe, expect, it } from "vitest";
import {
  FICHES_DEBUT, FICHE_DEBUT, FICHE_DEBUT_PLAN, FICHE_FIN,
  GRAINES_PAR_TOUR, deplierBoucles, estDebutDeBoucle, reboucleSurLeTourPrecedent,
} from "./boucle-graphe";
import type { AreteG, NoeudG } from "./meta";

const n = (id: string, ficheId: string, parametres: Record<string, unknown> = {}): NoeudG =>
  ({ id, position: { x: 0, y: 0 }, data: { ficheId, parametres } });
const a = (id: string, source: string, target: string, si = 0, ti = 0): AreteG =>
  ({ id, source, target, sourceHandle: `out:${si}`, targetHandle: `in:${ti}` });

describe("le début de boucle sur un plan", () => {
  it("DÉPLIE COMME L'AUTRE : la chaîne est recopiée autant de fois qu'il y a de tours", () => {
    const r = deplierBoucles(
      [n("plan", "planifier-chanson"), n("d", FICHE_DEBUT_PLAN, { Tours: 4 }),
        n("rendu", "rendre-chanson"), n("f", FICHE_FIN)],
      [a("e0", "plan", "d"), a("e1", "d", "rendu"), a("e2", "rendu", "f")],
    );
    expect(r.problemes).toEqual([]);
    expect(r.noeuds.filter((x) => x.data.ficheId === "rendre-chanson").length).toBe(4);
    expect(r.noeuds.some((x) => x.data.ficheId === FICHE_DEBUT_PLAN), "le début doit disparaître").toBe(false);
  });

  it("CHAQUE TOUR REPART DU PLAN, et aucun du tour précédent", () => {
    // LE DÉFAUT QUE CE CAS ARRÊTE, VU DANS L'APPLICATION AVANT D'ÊTRE ÉCRIT ICI. Le dépliage
    // CHAÎNE les tours : le tour k reçoit ce que le tour k−1 a déposé sur la fin, et c'est la bonne
    // sémantique pour un son, qui se compose. Un plan, non : trois tours du même descriptif ne sont
    // pas un plan transposé trois fois. Branché sur le rebouclage, le deuxième tour recevait sur
    // son entrée TEXTE l'audio rendu par le premier, et la fin de boucle annonçait « Entrée en
    // erreur » quand le premier tour, lui, était vert.
    //
    // DÉFAUT REPLANTÉ en remettant `FICHE_DEBUT_PLAN` dans l'ensemble des débuts qui rebouclent :
    // ce cas tombe, et lui seul — les cas de chaînage de `boucle-graphe.test.ts` tiennent l'autre
    // sens, et c'est pourquoi la liste des rebouclants est nommée des deux côtés.
    const r = deplierBoucles(
      [n("plan", "planifier-chanson"), n("d", FICHE_DEBUT_PLAN, { Tours: 3 }),
        n("rendu", "rendre-chanson"), n("f", FICHE_FIN)],
      [a("e0", "plan", "d"), a("e1", "d", "rendu"), a("e2", "rendu", "f")],
    );
    expect(r.problemes).toEqual([]);
    const copies = r.noeuds.filter((x) => x.data.ficheId === "rendre-chanson").map((x) => x.id);
    expect(copies.length).toBe(3);
    for (const id of copies) {
      expect(r.aretes.filter((x) => x.target === id).map((x) => x.source), id).toEqual(["plan"]);
    }
    expect(reboucleSurLeTourPrecedent(FICHE_DEBUT_PLAN)).toBe(false);
    expect(reboucleSurLeTourPrecedent(FICHE_DEBUT), "la boucle audio doit continuer de composer").toBe(true);
  });

  it("ET SES GRAINES VARIENT PAR TOUR, ce qui est la raison d'être de ce composant", () => {
    // SANS CELA LE NŒUD NE SERVIRAIT À RIEN : trois tours du même plan avec la même graine
    // rendraient trois fois le même son, et la boucle ne ferait que l'allonger.
    const r = deplierBoucles(
      [n("d", FICHE_DEBUT_PLAN, { Tours: 3, Graines: GRAINES_PAR_TOUR }),
        n("rendu", "rendre-chanson"), n("f", FICHE_FIN)],
      [a("e1", "d", "rendu"), a("e2", "rendu", "f")],
    );
    expect(r.problemes).toEqual([]);
    const tours = r.noeuds
      .filter((x) => x.data.ficheId === "rendre-chanson")
      .map((x) => r.toursDesCopies.get(x.id));
    expect(tours.length).toBe(3);
    expect(new Set(tours).size, "trois tours doivent porter trois numéros").toBe(3);
  });

  it("et à graines identiques, aucun tour n'est numéroté", () => {
    const r = deplierBoucles(
      [n("d", FICHE_DEBUT_PLAN, { Tours: 3, Graines: "Identiques" }),
        n("rendu", "rendre-chanson"), n("f", FICHE_FIN)],
      [a("e1", "d", "rendu"), a("e2", "rendu", "f")],
    );
    expect(r.toursDesCopies.size).toBe(0);
  });

  it("UN PLAN DANS LE VENTRE D'UNE BOUCLE AUDIO SE DÉPLIE, et le compte est le produit", () => {
    // L'IMBRICATION DES DEUX SORTES, dans ce sens-là : la boucle extérieure porte l'audio, et
    // l'intérieure le plan.
    const r = deplierBoucles(
      [n("s", "gen"), n("d1", FICHE_DEBUT, { Tours: 2 }), n("d2", FICHE_DEBUT_PLAN, { Tours: 3 }),
        n("rendu", "rendre-chanson"), n("f2", FICHE_FIN), n("f1", FICHE_FIN)],
      [a("e0", "s", "d1"), a("e1", "d1", "d2"), a("e2", "d2", "rendu"),
        a("e3", "rendu", "f2"), a("e4", "f2", "f1")],
    );
    expect(r.problemes).toEqual([]);
    expect(r.noeuds.filter((x) => x.data.ficheId === "rendre-chanson").length).toBe(2 * 3);
  });

  it("ET DANS L'AUTRE SENS AUSSI, le plan au-dehors et l'audio au-dedans", () => {
    const r = deplierBoucles(
      [n("plan", "planifier-chanson"), n("d1", FICHE_DEBUT_PLAN, { Tours: 2 }),
        n("rendu", "rendre-chanson"), n("d2", FICHE_DEBUT, { Tours: 3 }), n("t", "transposition"),
        n("f2", FICHE_FIN), n("f1", FICHE_FIN)],
      [a("e0", "plan", "d1"), a("e1", "d1", "rendu"), a("e2", "rendu", "d2"), a("e3", "d2", "t"),
        a("e4", "t", "f2"), a("e5", "f2", "f1")],
    );
    expect(r.problemes).toEqual([]);
    expect(r.noeuds.filter((x) => x.data.ficheId === "transposition").length).toBe(2 * 3);
    expect(r.noeuds.filter((x) => x.data.ficheId === "rendre-chanson").length).toBe(2);
  });

  it("LES DEUX SORTES DE DÉBUT SONT DÉCLARÉES ENSEMBLE, et le moteur les reconnaît toutes deux", () => {
    // LE GARDE QUI TIENT LA RÉPARATION. Le moteur comparait à une constante ; un second début
    // ajouté sans toucher à cette comparaison aurait laissé la boucle non dépliée, et le nœud
    // aurait annoncé qu'il laisse passer le plan au lieu de boucler. Défaut replanté en remettant
    // la comparaison : quatre des cas ci-dessus tombent.
    expect([...FICHES_DEBUT]).toEqual([FICHE_DEBUT, FICHE_DEBUT_PLAN]);
    for (const id of FICHES_DEBUT) expect(estDebutDeBoucle(id), id).toBe(true);
    expect(estDebutDeBoucle(FICHE_FIN)).toBe(false);
    expect(estDebutDeBoucle(undefined)).toBe(false);
  });
});
