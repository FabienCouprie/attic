// plugins/noms-herites.test.ts — Ce qu'un nom de réglage hérité doit être pour ne rien casser.
//
// ═══ POURQUOI CE CHAMP EXISTE ═══
//
// Un projet n'enregistre pas ses réglages par un identifiant stable mais par leur LIBELLÉ.
// Renommer un réglage rend donc injoignable la valeur d'un fichier déjà écrit : le projet rouvert
// retombe en silence sur le défaut, ce qui change la musique sans rien dire. Le chargement le
// SIGNALE depuis le 2026-10-25 ; `nomsHerites` le RÉCUPÈRE.
//
// L'AUTRE RÉPARATION A ÉTÉ MESURÉE ET ÉCARTÉE : re-clé-er le catalogue sur des identifiants
// stables toucherait 1983 réglages et invaliderait tout projet enregistré sur le disque de
// quelqu'un. Ce champ ne demande aucun changement de clé.
//
// ═══ ET LE CATALOGUE N'EN DÉCLARE AUCUN AUJOURD'HUI, CE QUI SE DIT ═══
//
// Le mécanisme précède son premier usage : `contrat-cles-de-reglage.test.ts` a mesuré ZÉRO clé
// orpheline sur les 19 graphes livrés, donc aucun renommage passé n'est à rattraper. Un garde qui
// surveille un ensemble vide ne prouve rien tant qu'il ne le dit pas — un cas inscrit donc le
// chiffre, pour que le jour où il monte soit un jour où l'on regarde. Le comportement, lui, est
// éprouvé sur des fiches d'essai dans `ui/pertes-chargement.test.ts`.
import { describe, expect, it } from "vitest";

import { registre } from "../audio/adaptateur";
import "../composition";

const fiches = () => registre.tousLesPlugins()
  .filter((d) => !d.id.startsWith("__") && !d.id.startsWith("frontiere"));

/** Chaque nom hérité déclaré du catalogue, avec la fiche et le réglage qui le réclament. */
function heritages(): { ficheId: string; reglage: string; ancien: string; vivants: Set<string> }[] {
  const out: { ficheId: string; reglage: string; ancien: string; vivants: Set<string> }[] = [];
  for (const d of fiches()) {
    const ps = (d as unknown as { parametres?: { nom: string; nomsHerites?: string[] }[] }).parametres ?? [];
    const vivants = new Set(ps.map((p) => p.nom));
    for (const p of ps) {
      for (const ancien of p.nomsHerites ?? []) {
        out.push({ ficheId: d.id, reglage: p.nom, ancien, vivants });
      }
    }
  }
  return out;
}

describe("les noms de réglage hérités", () => {
  it("AUCUN NE PORTE LE NOM D'UN RÉGLAGE EN SERVICE de la même fiche", () => {
    // Il volerait sa valeur au chargement : le fichier porte « Gain », et le réglage « Gain »
    // vivant se retrouverait vidé au profit d'un autre. Le chargement se protège déjà, mais une
    // déclaration pareille est une faute à corriger, pas à tolérer en silence.
    const fautifs = heritages()
      .filter((h) => h.vivants.has(h.ancien))
      .map((h) => `${h.ficheId} · « ${h.reglage} » hérite de « ${h.ancien} », qui est vivant`);
    expect(fautifs, [
      "",
      "UN NOM HÉRITÉ EST AUSSI LE NOM D'UN RÉGLAGE EN SERVICE.",
      "",
      "Au chargement, il volerait la valeur de ce réglage-là. Un nom hérité ne nomme que du PASSÉ :",
      "si le nom existe encore, c'est qu'il n'a pas été renommé.",
      "",
    ].join("\n")).toEqual([]);
  });

  it("ET DEUX RÉGLAGES NE SE DISPUTENT PAS LE MÊME ANCIEN NOM", () => {
    // Le chargement tranche par l'ordre de déclaration, ce qui est arbitraire : une valeur
    // enregistrée irait à l'un ou à l'autre selon l'écriture de la fiche.
    const vus = new Map<string, string>();
    const doublons: string[] = [];
    for (const h of heritages()) {
      const cle = `${h.ficheId}::${h.ancien}`;
      const deja = vus.get(cle);
      if (deja) doublons.push(`${h.ficheId} · « ${h.ancien} » réclamé par « ${deja} » et « ${h.reglage} »`);
      else vus.set(cle, h.reglage);
    }
    expect(doublons, [
      "",
      "DEUX RÉGLAGES D'UNE MÊME FICHE RÉCLAMENT LE MÊME ANCIEN NOM.",
      "",
      "La valeur enregistrée irait à l'un ou à l'autre selon l'ordre d'écriture de la fiche. Un",
      "ancien nom désigne un réglage et un seul.",
      "",
    ].join("\n")).toEqual([]);
  });

  it("et le catalogue en compte ZÉRO aujourd'hui, ce qui est dit plutôt que tu", () => {
    // ═══ UN GARDE QUI SURVEILLE LE VIDE NE PROUVE RIEN TANT QU'IL NE LE DIT PAS ═══
    //
    // Le mécanisme précède son premier usage. Ce chiffre n'est pas un plafond : il monte au
    // premier renommage, et c'est alors que les deux cas ci-dessus commencent à mordre.
    expect(heritages().length, [
      "",
      "LE NOMBRE DE NOMS HÉRITÉS A CHANGÉ.",
      "",
      "S'il a MONTÉ : un réglage vient d'être renommé, et c'est une bonne nouvelle — le mécanisme",
      "sert enfin. Inscrire le nouveau chiffre ici, et vérifier que les deux cas ci-dessus passent.",
      "",
      "S'il a DESCENDU : un héritage a été retiré. Un projet enregistré qui porte encore l'ancien",
      "nom reperdra donc son réglage, en silence. Le retirer se décide, il ne se subit pas.",
      "",
    ].join("\n")).toBe(0);
  });
});
