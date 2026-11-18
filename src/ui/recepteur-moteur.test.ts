// ui/recepteur-moteur.test.ts — Le récepteur pose ce que la boucle dit, et n'attend que la pose d'un
// nœud regardé.
//
// CE QUI DOIT ÊTRE TENU :
//   - un `statut` se pose dans le magasin tel qu'il arrive, progression du nœud comprise, et une
//     ombre se pose sous son propre identifiant, rattachée à son visible : la remise à zéro du
//     visible l'emporte ;
//   - `noeudFini` met le nœud parmi ce qui est à poser, et ne rend une promesse que s'il est regardé :
//     la boucle n'attend qu'alors ;
//   - les statuts de la préparation se posent dans l'ordre où elle les rend.
//
// La pose du correctif elle-même, `calculerCorrectifResultat`, a ses propres tests ; le journal de
// passe (`tests-e2e/journal-de-passe.spec.ts`) relève dans l'application l'ordre de tout ce qui
// s'écrit, et doit rester identique.
import { afterEach, describe, expect, it } from "vitest";

import { creerRecepteurDeLaPasse, poserLesStatutsDeLaPreparation } from "./recepteur-moteur";
import type { EtatDePasse } from "./etat-de-passe";
import { reinitialiserStatuts, statutDe, statutsPoses, surEcriture } from "./statuts";

/** Un récepteur dont aucun nœud n'est visible : la pose d'un nœud fini s'arrête avant le correctif. */
const recepteur = (regardes: readonly string[]) =>
  creerRecepteurDeLaPasse({ passe: {} as EtatDePasse, noeudsVisibles: () => [], estRegarde: (id) => regardes.includes(id) });

afterEach(() => { reinitialiserStatuts(); });

describe("le récepteur des événements de la boucle", () => {
  it("POSE UN STATUT TEL QU'IL ARRIVE, et une ombre sous son identifiant, que la remise à zéro du visible emporte", () => {
    const r = recepteur([]);
    expect(r.recevoir({ genre: "statut", generation: 3, id: "a", statut: "en_cours", progression: "moitié", progressionDuNoeud: true })).toBeUndefined();
    expect(statutDe("a")).toEqual({ statut: "en_cours", progression: "moitié", progressionDuNoeud: true });
    expect(r.recevoir({ genre: "statutOmbre", generation: 3, id: "d#2::tr", visible: "tr", statut: "termine" })).toBeUndefined();
    expect(statutDe("d#2::tr").statut).toBe("termine");
    reinitialiserStatuts(["tr"]);
    expect(statutsPoses()).toEqual(["a"]);
  });

  it("UN NŒUD FINI REJOINT CE QUI EST À POSER, et seul un nœud regardé rend la promesse de sa pose", async () => {
    const r = recepteur(["c"]);
    expect(r.recevoir({ genre: "noeudFini", generation: 1, id: "a" })).toBeUndefined();
    const pose = r.recevoir({ genre: "noeudFini", generation: 1, id: "c" });
    expect(pose).toBeInstanceOf(Promise);
    await pose;
    // `c` est sorti de l'attente par sa pose ; `a` attend la pose finale du ménage.
    expect([...r.aPoser]).toEqual(["a"]);
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
