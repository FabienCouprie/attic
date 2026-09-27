// core/metastore.test.ts — Ce qu'un méta-composant dit de lui dans le catalogue.
//
// POURQUOI CE FICHIER EXISTE. Un composant du catalogue porte un résumé et une notice rédigés dans
// sa fiche, et le contrat de notice les tient. Un méta-composant n'a que ce qu'on calcule sur lui,
// « sous-graphe de cinq nœuds, deux entrées, une sortie » : cela dit sa forme, jamais ce qu'il
// fait. Son auteur peut désormais l'écrire, et c'est le seul cas du dépôt où une description vient
// de l'utilisateur. Ce qui se vérifie ici est donc la chaîne entière : que le texte écrit arrive
// jusqu'à la fiche, qu'il n'efface pas le compte des nœuds, et qu'il s'efface lui-même quand on le
// vide.
import { beforeEach, describe, expect, it } from "vitest";

import type { MetaComposant, NoeudG } from "./meta";
import {
  configurerRegistre, decrireMeta, enregistrerMeta, estMeta, supprimerMeta, trouverMeta,
} from "./metastore";

/** Un registre de fortune : on ne veut ici que la fiche telle qu'elle y est déposée. */
const deposees = new Map<string, Record<string, unknown>>();
configurerRegistre({
  enregistrer: (def: any) => { deposees.set(def.id, def); },
  desenregistrer: (id: string) => { deposees.delete(id); },
} as never);

const noeud = (id: string, ficheId: string): NoeudG => ({ id, data: { ficheId } });

const meta = (id: string, sur: Partial<MetaComposant> = {}): MetaComposant => ({
  id, nom: "Mon outil",
  entrees: [{ nom: "Audio", type: "audio" }],
  sorties: [{ nom: "Audio", type: "audio" }],
  mapEntrees: [], mapSorties: [],
  sousNoeuds: [noeud("a", "gain"), noeud("b", "filtre"), noeud("c", "sortie")],
  sousAretes: [],
  ...sur,
});

const fiche = (id: string) => deposees.get(id) as any;

describe("la description qu'un auteur écrit sur son méta-composant", () => {
  beforeEach(() => {
    deposees.clear();
    for (const id of ["m1", "m2"]) if (estMeta(id)) supprimerMeta(id);
  });

  it("SANS DESCRIPTION, LE RÉSUMÉ RESTE CELUI QU'ON CALCULE : la forme du sous-graphe", () => {
    enregistrerMeta(meta("m1"));
    expect(fiche("m1").resume).toBe("Sous-graphe : 3 nœud(s), 1 entrée(s), 1 sortie(s).");
    expect(fiche("m1").resumeEn).toBe("Subgraph: 3 node(s), 1 input(s), 1 output(s).");
  });

  it("AVEC UNE DESCRIPTION, C'EST ELLE QU'ON LIT DANS LE CATALOGUE", () => {
    enregistrerMeta(meta("m1"));
    decrireMeta("m1", "Compresse puis adoucit les aigus.");
    expect(fiche("m1").resume).toBe("Compresse puis adoucit les aigus.");
  });

  it("LE MÊME TEXTE DANS LES DEUX LANGUES, et ce n'est pas un oubli", () => {
    // C'est le texte de son auteur, pas une chaîne de l'application : le traduire mettrait dans sa
    // bouche ce qu'il n'a pas dit, et lui demander deux versions serait lui demander le double.
    enregistrerMeta(meta("m1"));
    decrireMeta("m1", "Compresse puis adoucit les aigus.");
    expect(fiche("m1").resumeEn).toBe(fiche("m1").resume);
  });

  it("LE COMPTE DES NŒUDS N'EST PAS PERDU : il descend dans la notice", () => {
    // Il dit ce que la description ne dira pas : combien de nœuds on déplie en dégroupant.
    enregistrerMeta(meta("m1"));
    decrireMeta("m1", "Compresse puis adoucit les aigus.");
    expect(fiche("m1").notice).toContain("Compresse puis adoucit les aigus.");
    expect(fiche("m1").notice).toContain("3 nœud(s)");
    expect(fiche("m1").noticeEn).toContain("3 node(s)");
  });

  it("VIDER LE CHAMP REND LE RÉSUMÉ CALCULÉ, au lieu de laisser une ligne vide", () => {
    enregistrerMeta(meta("m1"));
    decrireMeta("m1", "Quelque chose.");
    decrireMeta("m1", "   ");
    expect(trouverMeta("m1")!.description).toBeUndefined();
    expect(fiche("m1").resume).toBe("Sous-graphe : 3 nœud(s), 1 entrée(s), 1 sortie(s).");
    expect(fiche("m1").notice).not.toContain("Quelque chose.");
  });

  it("les espaces de bord ne sont pas gardés", () => {
    enregistrerMeta(meta("m1"));
    decrireMeta("m1", "  Deux filtres en série.  ");
    expect(trouverMeta("m1")!.description).toBe("Deux filtres en série.");
  });

  it("la description reste après un réenregistrement, qui suit chaque renommage", () => {
    enregistrerMeta(meta("m1"));
    decrireMeta("m1", "Deux filtres en série.");
    const garde = trouverMeta("m1")!;
    enregistrerMeta({ ...garde, nom: "Autre nom" });
    expect(fiche("m1").nom).toBe("Autre nom");
    expect(fiche("m1").resume).toBe("Deux filtres en série.");
  });

  it("chaque méta porte la sienne, et décrire l'un ne touche pas l'autre", () => {
    enregistrerMeta(meta("m1"));
    enregistrerMeta(meta("m2", { sousNoeuds: [noeud("x", "gain")] }));
    decrireMeta("m1", "Le premier.");
    expect(fiche("m2").resume).toBe("Sous-graphe : 1 nœud(s), 1 entrée(s), 1 sortie(s).");
  });

  it("décrire un méta qui n'existe pas ne casse rien", () => {
    expect(() => decrireMeta("fantome", "Rien.")).not.toThrow();
  });

  it("UN MÉTA RELU D'UN FICHIER RETROUVE SA DESCRIPTION, sans traitement particulier", () => {
    // La relecture d'un projet comme celle de l'en-cours passent le même objet à `enregistrerMeta`.
    // Ce qui compte est donc qu'un objet venu de JSON, et non construit ici, soit accepté tel quel.
    const relu = JSON.parse(JSON.stringify({ ...meta("m1"), description: "Compresse les aigus." }));
    enregistrerMeta(relu as MetaComposant);
    expect(fiche("m1").resume).toBe("Compresse les aigus.");
  });
});
