// src/docs/generer-modulables.test.ts — Le recensement ne se cite pas de mémoire.
//
// POURQUOI CE TEST. J'ai cité le total du recensement après que les exclusions convenues l'avaient
// déjà réduit. Un nombre répété sans être recalculé est faux dès la première avancée. Le fichier est
// donc engendré, et ce test refuse qu'il vieillisse : poser une entrée Modulation sur un composant
// le retire du recensement, et le fichier doit suivre dans le même commit.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { toutesLesFiches } from "../plugins";
import { FAMILLES_EFFETS } from "../plugins/familles-palette";
import { coeursParTrames } from "./coeurs-par-trames";
import { CATEGORIES_ECARTEES, ECARTES, ECARTES_REGLAGE, cibles, dejaModulables, familleDe, idsEcartes, recensementEnTexte } from "./modulables";

const RACINE = resolve(__dirname, "../..");
const CHEMIN = resolve(__dirname, "../..", "MODULABLES.md");
const ecrire = process.env.ECRIRE_MODULABLES === "1";

describe("le recensement des effets à rendre modulables", () => {
  it("il est à jour", () => {
    const texte = recensementEnTexte(
      toutesLesFiches, coeursParTrames(RACINE, toutesLesFiches.map((f) => f.id)));
    if (ecrire) { writeFileSync(CHEMIN, texte, "utf8"); return; }
    expect(existsSync(CHEMIN),
      "MODULABLES.md est absent : lancez « npm run docs:modulables »").toBe(true);
    expect(readFileSync(CHEMIN, "utf8").replace(/\r\n/g, "\n"), [
      "MODULABLES.md ne correspond plus au registre.",
      "Un composant a reçu son entrée Modulation, ou en a perdu une : c'est une bonne nouvelle.",
      "Lancez « npm run docs:modulables ». Ne corrigez pas le fichier à la main.",
    ].join("\n")).toBe(texte);
  });

  it("UN RÉGLAGE PILOTÉ N'EST PLUS À FAIRE", () => {
    // CE CAS DISAIT « UN COMPOSANT QUI ACCEPTE DÉJÀ UNE COURBE N'EST PLUS À FAIRE », et il était
    // devenu faux par construction : le recensement se fait désormais par RÉGLAGE, de sorte qu'un
    // composant peut être à la fois ouvert sur l'un et à faire sur un autre. La forme juste est
    // celle-ci, et elle est plus forte : c'est le réglage PILOTÉ qui sort de la liste, et lui seul.
    const aFaire = new Set(
      cibles(toutesLesFiches).flatMap((c) => c.reglages.map((r) => `${c.id}/${r}`)),
    );
    for (const d of dejaModulables(toutesLesFiches)) {
      expect(aFaire.has(`${d.id}/${d.cible}`),
        `${d.id} : « ${d.cible} » est piloté et figure pourtant à faire`).toBe(false);
    }
  });

  it("UN COMPOSANT ÉCARTÉ N'EST PLUS À FAIRE, et sa raison est écrite", () => {
    const restants = new Set(cibles(toutesLesFiches).map((c) => c.id));
    for (const [id, raison] of idsEcartes()) {
      expect(restants.has(id), `${id} est écarté et figure pourtant à faire`).toBe(false);
      expect(raison.length, `${id} est écarté sans raison écrite`).toBeGreaterThan(20);
    }
  });

  it("chaque composant écarté existe encore dans le registre", () => {
    const ids = new Set(toutesLesFiches.map((f) => f.id));
    const disparus = [...idsEcartes().keys()].filter((id) => !ids.has(id));
    expect(disparus, "une exclusion vise un composant qui n'existe plus").toEqual([]);
  });

  // UNE FAMILLE ÉCARTÉE PAR UN NOM QUI N'EXISTE PLUS N'ÉCARTE RIEN, en silence : la décision serait
  // perdue et les nœuds reviendraient à faire sans que personne l'ait demandé.
  it("chaque famille écartée en bloc existe dans la palette et n'est pas vide", () => {
    for (const famille of Object.keys(CATEGORIES_ECARTEES)) {
      expect(FAMILLES_EFFETS[famille], `la famille « ${famille} » est absente de la palette`).toBeDefined();
      expect((FAMILLES_EFFETS[famille] ?? []).length,
        `la famille « ${famille} » est écartée mais vide`).toBeGreaterThan(0);
    }
  });

  // UNE EXEMPTION QUI NE NOMME PLUS RIEN NE PROTÈGE PLUS RIEN, et elle ne se voit pas : le réglage
  // renommé rentre dans la liste à faire, la décision reste écrite à côté, et on lit une raison qui
  // ne s'applique à rien. C'est la forme que ce cas cherche : la clé désigne-t-elle encore un
  // réglage réel de la fiche qu'elle nomme.
  it("CHAQUE RÉGLAGE ÉCARTÉ UN PAR UN EXISTE ENCORE, et sa raison est écrite", () => {
    const orphelines: string[] = [];
    for (const [cle, raison] of Object.entries(ECARTES_REGLAGE)) {
      const [id, nom] = cle.split("/");
      const f = toutesLesFiches.find((x) => x.id === id);
      if (!f || !((f as any).parametres ?? []).some((p: any) => p.nom === nom)) orphelines.push(cle);
      expect(raison.length, `${cle} est écarté sans raison écrite`).toBeGreaterThan(20);
    }
    expect(orphelines, "ces exemptions visent un réglage qui n'existe plus").toEqual([]);
  });

  it("UN RÉGLAGE ÉCARTÉ UN PAR UN N'EST PLUS À FAIRE", () => {
    const aFaire = new Set(
      cibles(toutesLesFiches).flatMap((c) => c.reglages.map((r) => `${c.id}/${r}`)),
    );
    const restes = Object.keys(ECARTES_REGLAGE).filter((cle) => aFaire.has(cle));
    expect(restes, "ces réglages sont écartés et figurent pourtant à faire").toEqual([]);
  });

  // ÉCARTER UN RÉGLAGE D'UN COMPOSANT DÉJÀ ÉCARTÉ EN ENTIER ne retire rien et vieillit mal : la
  // raison fine se lit alors comme une décision vivante alors que le composant est hors jeu.
  it("aucun réglage écarté ne double un composant écarté en entier", () => {
    const entiers = idsEcartes();
    const doubles = Object.keys(ECARTES_REGLAGE).filter((cle) => entiers.has(cle.split("/")[0]));
    expect(doubles, "ces réglages appartiennent à un composant déjà écarté en entier").toEqual([]);
  });

  // LES DEUX FAÇONS DE SE TROMPER SUR UN NOM, et ce cas tient les deux bouts. Trop serré, le
  // recensement ne voit pas « Seuil Low » et laisse six réglages du compresseur multibande hors de
  // la liste sans que rien le dise. Trop large, il prend « Qualité » pour un « Q » et « Saturation »
  // pour un « ratio », et la liste se remplit de réglages qui ne sont d'aucune famille.
  it("UN NOM SE LIT MOT À MOT : le qualificatif est vu, la sous-chaîne est refusée", () => {
    // Vus : le mot est là, avec un qualificatif, un chiffre, un trait d'union ou un accent.
    expect(familleDe("Seuil Low")).toBe("dynamique");
    expect(familleDe("Ratio High")).toBe("dynamique");
    expect(familleDe("Gain 1")).toBe("niveau");
    expect(familleDe("Temps G")).toBe("temps");
    expect(familleDe("Pré-délai")).toBe("temps");
    expect(familleDe("Fréq min")).toBe("frequence");
    expect(familleDe("Fréquence de l'aigu")).toBe("frequence");
    expect(familleDe("Q")).toBe("frequence");
    // Refusés : le mot de famille n'est qu'une sous-chaîne d'un autre mot.
    expect(familleDe("Qualité"), "« Qualité » n'est pas un « Q »").toBeUndefined();
    expect(familleDe("Saturation"), "« Saturation » n'est pas un « ratio »").toBeUndefined();
    expect(familleDe("Disposition"), "« Disposition » n'est pas une « position »").toBeUndefined();
    expect(familleDe("Époques")).toBeUndefined();
  });

  // Un identifiant nommé qui est déjà couvert par sa famille est une répétition qui vieillira mal.
  it("aucune exclusion nommée ne double une famille écartée", () => {
    const parFamille = new Set(
      Object.keys(CATEGORIES_ECARTEES).flatMap((f) => FAMILLES_EFFETS[f] ?? []),
    );
    const doubles = Object.keys(ECARTES).filter((id) => parFamille.has(id));
    expect(doubles, "ces exclusions sont déjà couvertes par leur famille").toEqual([]);
  });

  it("le recensement REGARDE le catalogue, sans prétendre le couvrir en entier", () => {
    // CE QUE CE CAS TIENT, ET CE QU'IL NE TIENT PLUS. Il exigeait « plus de dix composants restant
    // à faire », ce qui a fini par mordre sur le chantier lui-même : la famille « niveau » faite,
    // il en restait dix, et le contrôle tombait en annonçant un succès. Le nombre de composants
    // qui RESTENT est destiné à descendre jusqu'à zéro ; ce n'est donc pas une mesure de bonne
    // santé. Ce qui ne descend pas, c'est le nombre de composants que le recensement REGARDE,
    // c'est-à-dire ceux qu'il range quelque part : à faire, déjà modulables, ou écartés avec leur
    // raison. Un recensement qui ne range plus personne est cassé ; celui-ci range tout le monde.
    const aFaire = new Set(cibles(toutesLesFiches).map((c) => c.id));
    const deja = new Set(dejaModulables(toutesLesFiches).map((d) => d.id));
    const ecartes = new Set(idsEcartes().keys());
    const regardes = new Set([...aFaire, ...deja, ...ecartes]);
    expect(regardes.size, "le recensement ne range plus personne").toBeGreaterThan(80);
    expect(regardes.size, "le recensement prétend couvrir tout le catalogue")
      .toBeLessThan(toutesLesFiches.length / 2);
    // ET LE PLAFOND EST REBASÉ UNE SECONDE FOIS, pour deux décisions prises ensemble et non par
    // accident. Il valait treize quand la liste comptait des COMPOSANTS, puis quarante quand elle
    // s'est mise à compter des RÉGLAGES. Quatre composants ont ensuite été rouverts, leur motif
    // d'écartement ayant cessé d'être vrai, et les familles se lisent désormais MOT À MOT, ce qui
    // fait entrer les réglages dont le nom porte un qualificatif, « Seuil Low » et « Gain 1 ».
    // Quarante-cinq composants portent donc un réglage à faire, contre trente-trois avant.
    //
    // Ce plafond ne dit pas que le chantier avance : il dit qu'un composant neuf, ou un nom de
    // réglage élargi d'un mot, ne rouvre pas la liste en grand sans que personne le remarque.
    expect(aFaire.size, "la liste à faire a grandi").toBeLessThanOrEqual(50);
  });
});
