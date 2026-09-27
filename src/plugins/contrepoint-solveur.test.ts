// plugins/contrepoint-solveur.test.ts — Le nœud marche-t-il tel qu'il naît ?
//
// POURQUOI CE TEST EXISTE. Le solveur lui-même était éprouvé, et il l'est toujours dans
// `audio/contrepoint-solveur.test.ts` ; le nœud qui l'appelle ne l'était pas. Or il ne fonctionnait
// pas une seule fois avec ses réglages de naissance : son champ « Cantus firmus » est vide par
// défaut, la lecture de ce vide rendait une hauteur zéro au lieu de rien, et le nœud prenait cette
// note pour un cantus écrit. La branche qui engendre un cantus était donc inatteignable, et le nœud
// répondait toujours qu'il lui fallait au moins deux notes.
//
// RELEVÉ DANS L'APPLICATION, non par un test : le nœud posé sur le canevas et lancé tel quel. C'est
// ce que ce fichier rattrape — ce qu'un composant fait AVEC SES DÉFAUTS se vérifie ici désormais.
import { describe, expect, it } from "vitest";

import { fiches } from "./contrepoint-solveur";

const fiche = fiches[0];

/** Un contexte d'exécution minimal, qui rend les défauts de la fiche comme le fait l'application. */
function contexte(sur: Record<string, string | number> = {}, entree?: unknown) {
  const valeurs = new Map<string, string | number>();
  for (const p of fiche.parametres) {
    valeurs.set(p.nom, p.type === "choix" ? (p.optionIds?.[0] ?? String(p.defaut)) : p.defaut as string | number);
  }
  for (const [k, v] of Object.entries(sur)) valeurs.set(k, v);
  return {
    entree: () => entree,
    paramTexte: (n: string, d = "") => String(valeurs.get(n) ?? d),
    paramNombre: (n: string, d = 0) => Number(valeurs.get(n) ?? d),
    paramChoix: (n: string, d = "") => String(valeurs.get(n) ?? d),
    param: (n: string, d?: unknown) => valeurs.get(n) ?? d,
    noeud: { data: {} as Record<string, unknown> },
  };
}

describe("le nœud qui écrit un contrepoint", () => {
  it("TEL QU'IL NAÎT, IL TROUVE UNE LIGNE : le cantus est engendré quand le réglage est vide", async () => {
    const r: any = await fiche.executer!(contexte() as any);
    expect(r.erreur).toBeFalsy();
    expect(r.message).not.toMatch(/deux notes|two notes/);
    const sequence = r.valeurs[0];
    expect(sequence?.notes?.length).toBeGreaterThan(0);
  });

  it("rend les deux voix, chacune sur la sienne", async () => {
    const r: any = await fiche.executer!(contexte({ Notes: 8 }) as any);
    const voix = new Set(r.valeurs[0].notes.map((n: any) => n.voix));
    expect([...voix].sort()).toEqual([0, 1]);
  });

  it("prend le cantus écrit quand il y en a un, et non celui qu'il engendrerait", async () => {
    const ecrit = "60 62 64 65 64 62 60";
    const r: any = await fiche.executer!(contexte({ "Cantus firmus": ecrit }) as any);
    expect(r.message).toContain("réglage");
    // Le cantus est l'une des deux voix, et il est celui qu'on a écrit.
    const parVoix = new Map<number, number[]>();
    for (const n of r.valeurs[0].notes) {
      if (!parVoix.has(n.voix)) parVoix.set(n.voix, []);
      parVoix.get(n.voix)!.push(n.note);
    }
    expect([...parVoix.values()].some((v) => v.join(" ") === ecrit)).toBe(true);
  });

  it("UNE ABSENCE DE SOLUTION N'EST PAS UNE ERREUR, et le nœud continue de le distinguer", async () => {
    // Ce cantus n'admet aucun contrepoint de première espèce dans son propre mode : la recherche
    // explore tout et le conclut. Ce n'est pas une panne, et cela ne doit pas se signaler comme
    // telle — c'est une réponse, et elle a coûté le même travail qu'une autre.
    const r: any = await fiche.executer!(contexte({ "Cantus firmus": "60 62 64 62 60" }) as any);
    expect(r.erreur).toBeFalsy();
    expect(r.valeurs[0]).toBeNull();
    expect(r.message).toMatch(/aucune solution|no solution/);
  });

  it("refuse encore un cantus d'une seule note, qui n'en est pas un", async () => {
    const r: any = await fiche.executer!(contexte({ "Cantus firmus": "60" }) as any);
    expect(r.erreur).toBe(true);
  });

  it("UN RÉGLAGE VIDE N'EST PAS LA HAUTEUR ZÉRO, quelle que soit sa ponctuation", async () => {
    for (const vide of ["", "   ", ",", " ; "]) {
      const r: any = await fiche.executer!(contexte({ "Cantus firmus": vide }) as any);
      expect(r.erreur, `« ${vide} »`).toBeFalsy();
    }
  });
});
