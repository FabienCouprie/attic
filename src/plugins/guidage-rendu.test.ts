// src/plugins/guidage-rendu.test.ts — Le guidage du rendu, et le doublon qu'il a failli créer.
//
// LE RÉGLAGE AJOUTE UN CHAMP À UNE REQUÊTE, et c'est ce qui le rend délicat : une valeur de zéro
// transmise ne serait pas « pas de consigne », ce serait un guidage NUL, c'est-à-dire un rendu qui
// n'écoute plus du tout sa description. Le zéro doit donc laisser le champ ABSENT, ce qui est aussi
// ce qui rend l'ajout sans effet sur les graphes déjà enregistrés.
//
// ET IL A FAILLI EN EXISTER DEUX. « Accompagner une voix » déclarait son propre « Guidage » avant
// que la liste partagée en porte un ; les ajouter l'un et l'autre aurait donné deux réglages de
// même nom sur un même composant, dont un seul aurait été lu. Le second cas ci-dessous cherche
// cette forme sur TOUS les composants, et non sur celui-là.
import { describe, expect, it } from "vitest";
import { guidageDe, PARAMETRES_RENDU } from "./chanson-aides";
import { toutesLesFiches } from "./index";

describe("guidageDe", () => {
  const ctx = (valeur: number) => ({ paramNombre: () => valeur });

  it("ZÉRO NE TRANSMET RIEN : le moteur garde sa consigne, comme avant ce réglage", () => {
    expect(guidageDe(ctx(0))).toEqual({});
  });

  it("une valeur négative ou non finie ne transmet rien non plus", () => {
    expect(guidageDe(ctx(-1))).toEqual({});
    expect(guidageDe(ctx(Number.NaN))).toEqual({});
    expect(guidageDe(ctx(Number.POSITIVE_INFINITY))).toEqual({});
  });

  it("une valeur posée se transmet telle quelle", () => {
    expect(guidageDe(ctx(7.5))).toEqual({ guidage: 7.5 });
    expect(guidageDe(ctx(15))).toEqual({ guidage: 15 });
    expect(guidageDe(ctx(0.5))).toEqual({ guidage: 0.5 });
  });

  it("la liste partagée porte le réglage, et le zéro reste atteignable", () => {
    const g = PARAMETRES_RENDU.find((p) => p.nom === "Guidage") as { plage?: number[] } | undefined;
    expect(g, "« Guidage » doit être dans PARAMETRES_RENDU").toBeDefined();
    // LE ZÉRO DOIT RESTER DANS LA PLAGE, même s'il n'est plus le défaut : c'est la seule valeur qui
    // retrouve le comportement d'avant ce réglage, et une plage qui partirait de 0,5 la rendrait
    // injoignable sans que rien ne le dise.
    expect(g!.plage?.[0]).toBe(0);
  });
});

// LES CINQ RENDUS PARTENT DE 7,5, par décision du propriétaire, et ce cas est là pour que la
// décision se VOIE plutôt que de se découvrir à l'oreille le jour où quelqu'un la change.
//
// CE QU'ELLE COÛTE AUX TROIS QUI PARTENT D'UN AUDIO est mesuré et écrit dans `chanson-aides.ts` :
// sur une reprise, la corrélation avec l'audio source tombe de 0,2099 à 0,1408, et le rendu devient
// MOINS brillant, 4 995 Hz de centroïde contre 4 461. Le raisonnement qui soutient 7,5 sur un rendu
// sans source ne se transporte donc pas tel quel ici. Poser zéro sur ces composants rend le
// comportement d'avant ce réglage.
describe("le défaut du guidage, rendu par rendu", () => {
  const defautDe = (id: string) => {
    const f = toutesLesFiches.find((x) => x.id === id) as { parametres?: { nom: string; defaut?: unknown }[] };
    return f?.parametres?.find((p) => p.nom === "Guidage")?.defaut;
  };

  it("LES CINQ RENDUS PARTENT DE 7,5", () => {
    for (const id of ["rendre-chanson", "reprendre-chanson", "retoucher-chanson",
      "prolonger-chanson", "accompagner-voix"]) {
      expect(defautDe(id), id).toBe(7.5);
    }
  });

  it("celui qui part d'une voix garde sa plage propre, où zéro n'a pas de sens", () => {
    const f = toutesLesFiches.find((x) => x.id === "accompagner-voix") as
      { parametres?: { nom: string; plage?: number[] }[] };
    expect(f.parametres?.find((p) => p.nom === "Guidage")?.plage).toEqual([1, 10]);
  });
});

describe("les paramètres d'un composant", () => {
  const avecParametres = toutesLesFiches.filter((f) => Array.isArray((f as { parametres?: unknown[] }).parametres)
    && ((f as { parametres: unknown[] }).parametres.length > 0));

  it("des composants en déclarent, sans quoi ce garde ne regarderait rien", () => {
    expect(avecParametres.length).toBeGreaterThan(200);
  });

  it("AUCUN NE PORTE DEUX RÉGLAGES DE MÊME NOM", () => {
    const fautifs: string[] = [];
    for (const f of avecParametres as { id: string; parametres: { nom: string }[] }[]) {
      const vus = new Set<string>();
      for (const p of f.parametres) {
        if (vus.has(p.nom)) fautifs.push(`${f.id} : « ${p.nom} »`);
        vus.add(p.nom);
      }
    }
    expect(fautifs, [
      "Ces composants déclarent deux réglages portant le même nom. L'exécuteur les lit par leur",
      "nom : un seul des deux sera donc lu, l'autre restera un curseur qui ne peut rien changer,",
      "et rien ne le dira. La cause habituelle est un réglage ajouté à une liste partagée alors",
      "qu'un composant le déclarait déjà pour son compte ; le remède est de passer par",
      "« parametresRenduAvec », qui remplace au lieu d'ajouter.",
    ].join("\n")).toEqual([]);
  });
});
