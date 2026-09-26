// plugins/quantification-chaine.test.ts — Ce qu'on écrit, le calcul le retrouve-t-il ?
//
// POURQUOI PAR LES NŒUDS, ET NON PAR LES FONCTIONS SEULES. `quantification.test.ts` éprouve le
// calcul ; il ne dit rien de ce qui l'entoure dans un graphe : le tempo pris à la séquence plutôt
// qu'au réglage, la durée déclarée qui dépasse la dernière note, les hauteurs reportées sur les
// attaques écrites. C'est là que les défauts se logent, parce que chaque pièce est juste séparément.
//
// CE QUE LA BOUCLE VÉRIFIE, du texte de l'arbre à l'arbre retrouvé :
//   1. la chaîne ne rend jamais d'erreur sur un arbre du catalogue ;
//   2. les attaques écrites retombent aux instants joués, une par note reçue ;
//   3. les hauteurs reçues se retrouvent dans l'ordre sur les attaques ;
//   4. un silence final s'écrit, la durée de la séquence faisant loi.
import { describe, expect, it } from "vitest";

import { derouler, ecrireArbre, lireArbre } from "../audio/arbre-rythmique";
import { catalogueArbres } from "../audio/arbres-catalogue";
import { estSequence, type Sequence } from "../audio/sequence";
import { fiches as fichesArbre } from "./arbre-rythmique";
import { fiches as fichesQuantification } from "./quantification";

const rythme = fichesArbre.find((f) => f.id === "rythme-sur-hauteurs")!;
const quantifier = fichesQuantification.find((f) => f.id === "quantifier-rythme")!;

const contexte = (entrees: unknown[], params: Record<string, string | number> = {}) => ({
  noeud: { id: "n1", data: { ficheId: "x", parametres: params } },
  runtime: null,
  entree: (i: number) => entrees[i] ?? null,
  entrees: () => entrees,
  paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
  paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
});

const TEMPO = 120;
const HAUTEURS = "60 62 64 65 67 69 71";

/** L'arbre passé par le nœud qui le joue, puis par celui qui le réécrit. */
async function allerRetour(texte: string, params: Record<string, string | number> = {}) {
  const joue = await rythme.executer(
    contexte([texte, HAUTEURS, null], { Tempo: TEMPO }) as any,
  );
  expect(estSequence(joue.valeurs[0]), `${texte} : la sortie doit être une séquence`).toBe(true);
  const sequence = joue.valeurs[0] as unknown as Sequence;
  const ecrit = await quantifier.executer(
    contexte([sequence], { Compromis: 35, ...params }) as any,
  );
  return { sequence, arbre: ecrit.valeurs[0] as string, ecrit };
}

describe("de l'arbre joué à l'arbre réécrit, sur tout le catalogue", () => {
  // Le catalogue à un étage, silences compris : c'est ce que le calcul doit reconnaître sans
  // hésiter, et les silences sont précisément le cas où une écriture peut se perdre.
  const catalogue = catalogueArbres({ emplacementsMax: 3, partsMax: 3 });

  it("LES ATTAQUES ÉCRITES RETOMBENT AUX INSTANTS JOUÉS, sur les quatre-vingt-quatre", async () => {
    expect(catalogue.length, "le compte annoncé doit être le vrai").toBe(84);
    const manques: string[] = [];
    for (const mesure of catalogue) {
      const texte = ecrireArbre([mesure]);
      const joues = derouler([mesure], TEMPO).filter((e) => !e.silence);
      if (joues.length === 0) continue;
      const { arbre, ecrit } = await allerRetour(texte);
      if (ecrit.erreur) { manques.push(`${texte} : ${ecrit.message}`); continue; }
      const ecrits = derouler(lireArbre(arbre), TEMPO).filter((e) => !e.silence);
      const juste = ecrits.length === joues.length
        && joues.every((e, i) => Math.abs(ecrits[i].debut - e.debut) < 1e-6);
      if (!juste) manques.push(`${texte} donne ${arbre}`);
    }
    expect(manques.slice(0, 5).join(" | "), `${manques.length} arbres manqués`).toBe("");
  });

  it("LES HAUTEURS REÇUES SE RETROUVENT DANS L'ORDRE sur les attaques écrites", async () => {
    const attendues = HAUTEURS.split(" ").map(Number);
    for (const mesure of catalogue.slice(0, 40)) {
      const texte = ecrireArbre([mesure]);
      if (derouler([mesure], TEMPO).filter((e) => !e.silence).length === 0) continue;
      const { ecrit } = await allerRetour(texte);
      const rendue = ecrit.valeurs[1] as unknown as Sequence;
      expect(estSequence(rendue), texte).toBe(true);
      rendue.notes.forEach((n, i) => {
        expect(n.note, `${texte} note ${i}`).toBe(attendues[i % attendues.length]);
      });
    }
  });
});

describe("ce que le nœud prend à la séquence", () => {
  it("LE TEMPO DE LA SÉQUENCE PASSE DEVANT LE RÉGLAGE, et le message le dit", async () => {
    const joue = await rythme.executer(
      contexte(["(4/4 (1 1 1 1))", HAUTEURS, null], { Tempo: 60 }) as any,
    );
    // Le réglage du nœud dit 180 ; la séquence porte 60. C'est 60 qui doit servir, sans quoi les
    // durées seraient lues au tiers de leur valeur et l'écriture partirait en subdivisions.
    const ecrit = await quantifier.executer(
      contexte([joue.valeurs[0]], { Tempo: 180, Compromis: 35 }) as any,
    );
    expect(ecrit.valeurs[0]).toBe("(4/4 (1 1 1 1))");
    expect(ecrit.message).toContain("séquence");
  });

  it("UN SILENCE FINAL S'ÉCRIT, la durée déclarée faisant loi", async () => {
    // Une mesure de notes puis une mesure vide : la dernière note s'arrête au milieu du tout, et
    // seule la durée de la séquence dit que l'écriture continue.
    const texte = "((4/4 (1 1 1 1)) (4/4 (-1 -1 -1 -1)))";
    const { sequence, arbre } = await allerRetour(texte, { Compromis: 90 });
    expect(sequence.duree).toBeCloseTo(4, 9);
    expect(lireArbre(arbre)).toHaveLength(2);
    expect(arbre).toBe("((4/4 (1 1 1 1)) (4/4 (-1)))");
  });
});
