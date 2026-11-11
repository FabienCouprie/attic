// ui/gestes-noeud.test.ts — Les gestes du contexte appellent la version courante, et ne bougent pas.
//
// CE QUE LE CONTEXTE PROMET, et c'est ce qui se tient ici. Un geste appelé appelle ce qu'`App.tsx`
// fournit À CE MOMENT, et non ce qu'il fournissait quand le nœud a été posé : c'est le défaut des
// fermetures recopiées dans `data`. Et un geste garde la même identité d'un rendu à l'autre : la
// valeur du contexte ne changeant jamais, aucun nœud n'est redessiné, aucun effet ne repart.
import { describe, expect, it } from "vitest";
import { gestesDelegues, type GestesNoeud } from "./gestes-noeud";

describe("les gestes du contexte", () => {
  it("APPELLENT LA VERSION COURANTE, et non celle du moment où on les a lus", () => {
    const journal: string[] = [];
    let version = 1;
    const courants = () => {
      const v = version;
      return { onReinitialiser: (id: string) => { journal.push(`v${v}:${id}`); } } as Partial<GestesNoeud>;
    };
    const gestes = gestesDelegues(courants);
    const lu = gestes.onReinitialiser;
    lu("a");
    version = 2;
    lu("b");
    expect(journal).toEqual(["v1:a", "v2:b"]);
  });

  it("GARDENT LEUR IDENTITÉ, de sorte qu'un effet qui en dépend ne repart pas", () => {
    const gestes = gestesDelegues(() => ({}));
    expect(gestes.onChangerParametre).toBe(gestes.onChangerParametre);
    expect(gestes.onChangerParametre).not.toBe(gestes.onChargerAudio);
  });

  it("HORS D'UN ATELIER, UN GESTE NE FAIT RIEN, comme un nœud qui n'en portait pas", () => {
    const gestes = gestesDelegues(() => null);
    expect(() => gestes.onSupprimerNoeud("a")).not.toThrow();
    expect(gestes.onSupprimerNoeud("a")).toBeUndefined();
  });

  it("PASSENT LEURS ARGUMENTS TELS QUELS", () => {
    const recus: unknown[][] = [];
    const gestes = gestesDelegues(() => ({ onChangerParametre: (...a: unknown[]) => { recus.push(a); } }) as Partial<GestesNoeud>);
    gestes.onChangerParametre("n", "Gain", 3);
    expect(recus).toEqual([["n", "Gain", 3]]);
  });
});
