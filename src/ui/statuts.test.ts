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
  ETAT_ATTENTE, poserApercu, poserStatut, poserStatutOmbre, reinitialiserStatuts, statutDe, statutsPoses,
  surStatut,
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

describe("où en est le lecteur, posé à côté du statut", () => {
  // CE QUE CE CANAL EXISTE POUR DIRE. Le calcul d'un nœud est fini, son résultat est posé, et son
  // lecteur s'encode encore : 2,3 s pour cinq minutes de son, 46 s pour une heure, mesuré. Sans
  // cette mention l'attente est muette, et c'est ce silence qui faisait croire à un lecteur perdu.

  it("ne touche pas au statut, ni à la progression du nœud", () => {
    poserStatut("a", "termine", "fini", true);
    poserApercu("a", 0.4);
    expect(statutDe("a")).toMatchObject({
      statut: "termine", progression: "fini", progressionDuNoeud: true, apercu: 0.4,
    });
  });

  it("ARRONDIT AU CENTIÈME, et ne prévient pas deux fois pour le même chiffre", () => {
    // L'écriture d'un WAV appelle ceci à chaque tranche, soit trois mille six cents fois pour une
    // heure de son : sans l'arrondi, le nœud se redessinerait autant de fois pour le même chiffre.
    const vu = vi.fn();
    surStatut("a", vu);
    poserApercu("a", 0.4001);
    expect(statutDe("a").apercu).toBe(0.4);
    poserApercu("a", 0.4049);
    expect(vu).toHaveBeenCalledTimes(1);
    poserApercu("a", 0.41);
    expect(vu).toHaveBeenCalledTimes(2);
  });

  it("borne la part entre zéro et un", () => {
    poserApercu("a", -3);
    expect(statutDe("a").apercu).toBe(0);
    poserApercu("a", 12);
    expect(statutDe("a").apercu).toBe(1);
  });

  it("se retire par `undefined`", () => {
    poserApercu("a", 0.5);
    poserApercu("a", undefined);
    expect(statutDe("a").apercu).toBeUndefined();
  });

  it("UN STATUT NEUF L'EFFACE, parce qu'un autre calcul commence", () => {
    // La mention porte sur le résultat qui vient d'être posé. Un statut neuf veut dire que ce
    // résultat est en train d'être remplacé, et le lecteur qui s'écrivait ne le concerne plus.
    poserStatut("a", "termine");
    poserApercu("a", 0.7);
    poserStatut("a", "en_cours");
    expect(statutDe("a").apercu).toBeUndefined();
  });

  it("la référence reste stable quand la part ne change pas", () => {
    poserApercu("a", 0.25);
    const premier = statutDe("a");
    poserApercu("a", 0.25);
    expect(statutDe("a")).toBe(premier);
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

describe("les ombres, l'état des nœuds que l'écran ne montre pas", () => {
  // CE QU'ELLES EXISTENT POUR DIRE. Le moteur reporte l'état d'un nœud aplati sur son méta, et le
  // perdait : au run suivant, le méta ne savait plus lesquels de ses nœuds avaient tourné.
  it("se lisent sous leur propre identifiant, sans toucher au nœud visible", () => {
    poserStatutOmbre("m::a", "m", "termine");
    expect(statutDe("m::a").statut).toBe("termine");
    expect(statutDe("m")).toBe(ETAT_ATTENTE);
  });

  it("REPARTENT AVEC LEUR NŒUD VISIBLE : remettre un méta à zéro remet à zéro ce qu'il contient", () => {
    poserStatutOmbre("m::a", "m", "termine");
    poserStatutOmbre("n::a", "n", "termine");
    poserStatut("m", "termine");
    reinitialiserStatuts(["m"]);
    expect(statutDe("m::a")).toBe(ETAT_ATTENTE);
    expect(statutDe("n::a").statut).toBe("termine");
  });

  it("une ombre remise à zéro ne se rattache plus à rien", () => {
    poserStatutOmbre("m::a", "m", "termine");
    reinitialiserStatuts(["m::a"]);
    poserStatut("m::a", "termine");
    reinitialiserStatuts(["m"]);
    expect(statutDe("m::a").statut).toBe("termine");
  });
});

describe("le graphe ne porte plus l'état d'exécution", () => {
  // CE QUE CES CAS EMPÊCHENT DE REVENIR. Le statut, la progression et la priorité vivent dans des
  // magasins, celui-ci et `ui/priorite.ts`. Un lecteur qui les chercherait dans `node.data` par
  // habitude verrait « attente » pour toujours, et le défaut serait invisible sur un graphe d'essai à
  // un seul nœud. Jusqu'à la pièce 3 du plan DonneesNoeud, le statut y était encore posé à la création
  // de chaque nœud, en treize endroits, et la priorité recopiée dans tous les nœuds à chaque ▶.
  const racine = resolve(__dirname, "..");
  /** Chaque ligne de code de `src/` qui répond au motif, commentaires et magasin des statuts exclus. */
  const lignes = (motif: RegExp, garder: (nom: string) => boolean): string[] => {
    const fautifs: string[] = [];
    const parcourir = (dossier: string) => {
      for (const entree of readdirSync(dossier, { withFileTypes: true })) {
        const chemin = join(dossier, entree.name);
        if (entree.isDirectory()) { parcourir(chemin); continue; }
        if (!/\.(ts|tsx)$/.test(entree.name) || entree.name.startsWith("statuts.") || !garder(entree.name)) continue;
        readFileSync(chemin, "utf8").split("\n").forEach((ligne, i) => {
          if (/^\s*(\/\/|\*)/.test(ligne)) return;
          if (motif.test(ligne)) fautifs.push(`${chemin.slice(racine.length + 1).split(sep).join("/")}:${i + 1}`);
        });
      }
    };
    parcourir(racine);
    return fautifs;
  };
  const ETAT = "statut|progression|progressionDuNoeud|prioritaire";

  it("aucun composant ne lit `data.statut`, `data.progression` ni `data.prioritaire`", () => {
    // LA LECTURE SOUS UNE AFFIRMATION DE TYPE EN EST AUSSI. `(sn.data as { statut?: string }).statut`
    // relisait le statut des nœuds d'un méta, et la première forme de ce motif ne la voyait pas.
    expect(lignes(new RegExp(String.raw`\bdata\??\.(${ETAT})\b|\bdata as [^)]*\)\??\.(${ETAT})\b`), () => true)).toEqual([]);
  });

  it("aucune source ne pose plus le statut « attente » ni la priorité sur un nœud", () => {
    // CE QUE CE CAS TIENT, ET CE QU'IL NE TIENT PAS. Il empêche les treize écritures retirées de
    // revenir telles qu'on les recopierait ; une écriture sous une autre forme lui échapperait. C'est
    // la fermeture du type, pièce 5 du plan, qui les refusera toutes. Les cas de test en sont exclus :
    // leurs données d'essai peuvent porter un statut pour éprouver qu'il n'est pas relu.
    // Un statut suivi de `|` est un type, non une écriture ; une priorité précédée de `let` est la
    // variable du magasin, non une clé de `data`.
    const ecriture = /\bstatut\s*:\s*["']attente["'](?!\s*\|)|(?<!\b(?:let|const|var)\s+)\bprioritaire\s*:/;
    expect(lignes(ecriture, (nom) => !/\.test\.tsx?$/.test(nom))).toEqual([]);
  });
});
