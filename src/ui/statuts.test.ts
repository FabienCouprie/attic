// ui/statuts.test.ts — Le magasin d'états d'exécution.
//
// CE QUI DOIT ÊTRE TENU, et pourquoi chacun compte :
//
//   - LA RÉFÉRENCE EST STABLE quand rien ne change. `useSyncExternalStore` compare les instantanés
//     par identité : rendre un objet neuf à chaque lecture ferait boucler le rendu à l'infini, et
//     ce défaut-là ne se voit pas, il fige l'application.
//   - UN ABONNÉ N'EST PRÉVENU QUE POUR SON NŒUD. C'est toute la raison d'être du magasin : si tous
//     les nœuds étaient prévenus de tout, on aurait recréé, en plus petit, le défaut qu'on corrige.
//   - REPOSER LE MÊME ÉTAT NE PRÉVIENT PERSONNE. Le moteur repose souvent le même message de
//     progression ; chacun aurait provoqué un rendu inutile.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import {
  ETAT_ATTENTE, poserStatut, reinitialiserStatuts, statutDe, statutsPoses, surStatut,
} from "./statuts";

beforeEach(() => reinitialiserStatuts());

describe("lire un état", () => {
  it("rend l'attente pour un nœud dont personne n'a rien dit", () => {
    expect(statutDe("inconnu")).toBe(ETAT_ATTENTE);
    expect(statutDe("inconnu").statut).toBe("attente");
  });

  it("rend LA MÊME référence tant que rien ne change", () => {
    poserStatut("a", "en_cours", "Étape 1/3");
    const premier = statutDe("a");
    expect(statutDe("a")).toBe(premier);
    poserStatut("a", "en_cours", "Étape 1/3");
    expect(statutDe("a")).toBe(premier);
  });

  it("rend une NOUVELLE référence quand quelque chose change", () => {
    poserStatut("a", "en_cours");
    const premier = statutDe("a");
    poserStatut("a", "termine");
    expect(statutDe("a")).not.toBe(premier);
    expect(statutDe("a").statut).toBe("termine");
  });

  it("porte la progression et son origine", () => {
    poserStatut("a", "en_cours", "42 %", true);
    expect(statutDe("a")).toMatchObject({ statut: "en_cours", progression: "42 %", progressionDuNoeud: true });
  });
});

describe("les abonnements", () => {
  it("préviennent l'abonné de leur nœud", () => {
    const vu = vi.fn();
    surStatut("a", vu);
    poserStatut("a", "en_cours");
    expect(vu).toHaveBeenCalledTimes(1);
  });

  it("ne préviennent PAS les abonnés des autres nœuds", () => {
    const a = vi.fn(), b = vi.fn();
    surStatut("a", a);
    surStatut("b", b);
    poserStatut("a", "en_cours");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it("ne préviennent personne quand l'état reposé est identique", () => {
    poserStatut("a", "en_cours", "Étape 1/3");
    const vu = vi.fn();
    surStatut("a", vu);
    poserStatut("a", "en_cours", "Étape 1/3");
    expect(vu).not.toHaveBeenCalled();
  });

  it("se désabonnent, et ne sont plus prévenus", () => {
    const vu = vi.fn();
    const stop = surStatut("a", vu);
    stop();
    poserStatut("a", "en_cours");
    expect(vu).not.toHaveBeenCalled();
  });

  it("supportent plusieurs abonnés sur le même nœud", () => {
    const un = vi.fn(), deux = vi.fn();
    surStatut("a", un);
    surStatut("a", deux);
    poserStatut("a", "termine");
    expect(un).toHaveBeenCalledTimes(1);
    expect(deux).toHaveBeenCalledTimes(1);
  });

  it("survivent à un désabonnement pendant la notification", () => {
    // Un composant qui se démonte en réaction à un changement retire son abonnement pendant que la
    // boucle de notification tourne : elle ne doit pas sauter l'abonné suivant.
    const suivant = vi.fn();
    let stop = () => {};
    stop = surStatut("a", () => stop());
    surStatut("a", suivant);
    poserStatut("a", "termine");
    expect(suivant).toHaveBeenCalledTimes(1);
  });
});

describe("la réinitialisation", () => {
  it("remet les nœuds demandés en attente et prévient", () => {
    poserStatut("a", "termine");
    poserStatut("b", "termine");
    const vu = vi.fn();
    surStatut("a", vu);
    reinitialiserStatuts(["a"]);
    expect(statutDe("a")).toBe(ETAT_ATTENTE);
    expect(statutDe("b").statut).toBe("termine");
    expect(vu).toHaveBeenCalledTimes(1);
  });

  it("sans liste, remet tout le monde", () => {
    poserStatut("a", "termine");
    poserStatut("b", "en_cours");
    reinitialiserStatuts();
    expect(statutsPoses()).toEqual([]);
  });

  it("ne prévient pas pour un nœud qui était déjà en attente", () => {
    const vu = vi.fn();
    surStatut("jamais-pose", vu);
    reinitialiserStatuts(["jamais-pose"]);
    expect(vu).not.toHaveBeenCalled();
  });
});

describe("le graphe ne porte plus l'état d'exécution", () => {
  // CE QUE CE TEST EMPÊCHE DE REVENIR. Tant que `statut` reste présent dans `node.data` — il y est
  // encore posé à la création d'un nœud, sans conséquence —, rien n'empêche quelqu'un de le relire
  // par habitude. Or il n'est plus tenu à jour : ce lecteur-là verrait « attente » pour toujours,
  // et le défaut serait invisible sur un graphe d'essai à un seul nœud.
  it("aucun composant ne lit `data.statut` ni `data.progression`", () => {
    const racine = resolve(__dirname, "..");
    const fautifs: string[] = [];
    const parcourir = (dossier: string) => {
      for (const entree of readdirSync(dossier, { withFileTypes: true })) {
        const chemin = join(dossier, entree.name);
        if (entree.isDirectory()) { parcourir(chemin); continue; }
        if (!/\.(ts|tsx)$/.test(entree.name) || entree.name.startsWith("statuts.")) continue;
        const source = readFileSync(chemin, "utf8");
        source.split("\n").forEach((ligne, i) => {
          if (/^\s*(\/\/|\*)/.test(ligne)) return;
          if (/\bdata\??\.(statut|progression|progressionDuNoeud)\b/.test(ligne)) {
            fautifs.push(`${chemin.slice(racine.length + 1).split(sep).join("/")}:${i + 1}`);
          }
        });
      }
    };
    parcourir(racine);
    expect(fautifs).toEqual([]);
  });
});
