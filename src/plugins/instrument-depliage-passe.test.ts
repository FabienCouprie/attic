// plugins/instrument-depliage-passe.test.ts — L'instrument se déplie par la couture que le cœur lui offre.
//
// CE QUE CE FICHIER TIENT, depuis la pièce P3 du 2026-11-21. Le dépliage de l'instrument a quitté le
// cœur pour `audio/instrument-depliage.ts`, et la préparation d'une passe ne le connaît plus : elle
// applique les dépliages que le domaine lui remet, par `ORCHESTRATION_AUDIO.depliages()`. Un domaine
// qui oublierait de le déclarer jouerait la chaîne d'un instrument une seule fois, à la note de son
// réglage, et la fin d'instrument recevrait un rendu pour dix racines.
//
// Ces cas passent par le vrai registre et la vraie orchestration, comme une passe de l'application.
// Les cas du dépliage lui-même sont dans `audio/instrument-depliage.test.ts`, inchangés.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { registre } from "../audio/adaptateur";
import { racinesInstrument } from "../audio/instrument-depliage";
import type { AreteG, NoeudG } from "../core/meta";
import { preparerLaPasse } from "../core/preparation-passe";
import { ORCHESTRATION_AUDIO } from "./orchestration-domaine";

const n = (id: string, ficheId: string, parametres: Record<string, unknown> = {}): NoeudG =>
  ({ id, position: { x: 0, y: 0 }, data: { ficheId, parametres } });
const a = (id: string, source: string, target: string): AreteG =>
  ({ id, source, target, sourceHandle: "out:0", targetHandle: "in:0" });

/** La fin de l'exemple `un-echo-en-boucle-et-un-instrument` : une zone de six demi-tons, de Do2 à Do4. */
const FIN = n("fin", "instrument-fin", { "Largeur de zone": 6, "Note basse": 48, "Note haute": 72 });
const RACINES = racinesInstrument(FIN);

const passe = (noeuds: NoeudG[], aretes: AreteG[]) => preparerLaPasse({
  noeuds, aretes, prioriteDemandee: null, versLAval: false, trouverMeta: () => undefined,
  trouverDef: (id) => registre.trouverDef(id), fluxCompatibles: registre.fluxCompatibles,
  depliagesDuDomaine: ORCHESTRATION_AUDIO.depliages(), t: (c) => c,
});

describe("l'instrument passe par la couture des dépliages du domaine", () => {
  it("LA CHAÎNE EST RECOPIÉE UNE FOIS PAR RACINE, et chaque copie remonte au nœud visible", () => {
    expect(RACINES.length, "l'instrument d'essai doit avoir plusieurs racines").toBeGreaterThan(1);
    const p = passe(
      [n("note", "frontiere-note"), n("filtre", "reponse-filtre"), FIN],
      [a("e1", "note", "filtre"), a("e2", "filtre", "fin")],
    );
    const copies = p.nds.map((x) => x.id).filter((id) => id.endsWith("::filtre"));
    expect(copies).toEqual(RACINES.map((_, k) => `fin@${k}::filtre`));
    expect(copies.every((id) => p.plat.expansions.get(id) === "filtre")).toBe(true);
    // La note de chaque copie est sa racine : c'est ce qui en fait un instrument.
    const notes = p.nds.filter((x) => x.data.ficheId === "frontiere-note")
      .map((x) => (x.data.parametres as Record<string, unknown>).Note);
    expect(notes).toEqual(RACINES);
    expect(p.avertissements).toEqual([]);
  });

  it("CE QUE L'INSTRUMENT REFUSE S'ÉCRIT SOUS SON LIBELLÉ, comme quand le cœur le dépliait", () => {
    const p = passe([n("filtre", "reponse-filtre"), FIN], [a("e2", "filtre", "fin")]);
    expect(p.avertissements).toEqual(["[attic] Instrument de graphe : fin-sans-note sur fin"]);
  });

  it("IL PASSE AVANT LES BOUCLES : chaque copie de l'instrument porte sa propre boucle", () => {
    const p = passe(
      [
        n("note", "frontiere-note"), n("debut", "boucle-graphe-debut", { Tours: 2 }),
        n("ampli", "amplificateur"), n("bfin", "boucle-graphe-fin"), FIN,
      ],
      [a("e1", "note", "debut"), a("e2", "debut", "ampli"), a("e3", "ampli", "bfin"), a("e4", "bfin", "fin")],
    );
    // Après les boucles, l'instrument aurait recopié une seule boucle déjà dépliée.
    expect(p.deplie.depliees.map((d) => d.tours)).toEqual(RACINES.map(() => 2));
    expect(p.deplie.problemes).toEqual([]);
  });
});
