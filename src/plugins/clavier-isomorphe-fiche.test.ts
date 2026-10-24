// plugins/clavier-isomorphe-fiche.test.ts — Ce que le composant rend, et ce qu'il dit de sa source.
//
// CE QUE CES CAS TIENNENT, ET QUE `audio/clavier-isomorphe.test.ts` NE TIENT PAS. L'arithmétique du
// réseau y est éprouvée à part ; ici c'est la FICHE qui est exercée, donc trois décisions qu'aucun
// calcul ne porte :
//
//   - le repli quand rien n'est branché est NOMMÉ, et ne se confond pas avec un accordage reçu ;
//   - deux sorties nulles sont un résultat valide, et non une erreur, sur un clavier non encore joué ;
//   - l'accordage reçu part vers la vue par le canal `designe`, qui est son seul chemin.
//
// LE CAS QUI COMPTE LE PLUS EST LE TROISIÈME : un réplique à douze degrés faute d'entrée branchée
// rendrait exactement les mêmes hauteurs qu'un tempérament à douze demandé, et rien ne distinguerait
// les deux situations si le message ne le disait pas.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { registre } from "../audio/adaptateur";
import { accordageEgal, type Accordage } from "../audio/accordage";
import { CASES } from "../audio/clavier-isomorphe";
import { estResultatEnErreur } from "../core/execution";
import { traduire } from "../i18n";

/** Le contexte d'exécution : une entrée, des réglages, et la séquence posée sur le nœud. */
function ctx(o: { accordage?: Accordage | null; params?: Record<string, string | number>; notes?: unknown[] }) {
  const params = o.params ?? {};
  return {
    entree: () => o.accordage ?? null,
    entrees: () => [o.accordage ?? null],
    paramTexte: (nom: string, def: string) => String(params[nom] ?? def),
    paramNombre: (nom: string, def: number) => Number(params[nom] ?? def),
    onProgress: () => {},
    noeud: { data: { sequenceNotes: o.notes } },
    runtime: null,
  } as never;
}

const fiche = () => registre.trouverDef("clavier-isomorphe")!;

describe("la fiche du clavier isomorphe", () => {
  it("l'accordage reçu part vers la vue par `designe`, avec la tonique du réglage", async () => {
    const recu = accordageEgal(19, 1200, 48, "dix-neuf degrés égaux");
    const res = await fiche().executer(ctx({ accordage: recu, params: { Tonique: 72 } })) as never as
      { designe?: { accordage?: Accordage }; message?: string };
    expect(res.designe?.accordage?.degres).toEqual(recu.degres);
    // LA TONIQUE DU RÉGLAGE REMPLACE CELLE QUE L'ACCORDAGE PORTE, comme partout dans cette chaîne.
    expect(res.designe?.accordage?.reference).toBe(72);
    expect(res.designe?.accordage?.origine).toBe("dix-neuf degrés égaux");
  });

  it("le saut suit l'accordage reçu, et le message le dit", async () => {
    const douze = await fiche().executer(ctx({ accordage: accordageEgal(12) })) as never as { message?: string };
    const dixNeuf = await fiche().executer(ctx({ accordage: accordageEgal(19) })) as never as { message?: string };
    expect(douze.message).toContain("7");
    expect(dixNeuf.message).toContain("11");
    expect(douze.message).toContain(String(CASES));
  });

  // ─── La décision sur le repli ───
  it("SANS ENTRÉE BRANCHÉE, LE MESSAGE NOMME LE REPLI", async () => {
    const res = await fiche().executer(ctx({ accordage: null, params: { "Degrés par période": 12 } })) as never as
      { message?: string; designe?: { accordage?: Accordage } };
    expect(res.message).toContain(traduire("iso.repli"));
    expect(res.designe?.accordage?.degres).toHaveLength(12);
  });

  it("et un accordage reçu à douze degrés ne porte pas cette mention", async () => {
    const recu = await fiche().executer(ctx({ accordage: accordageEgal(12) })) as never as { message?: string };
    const repli = await fiche().executer(ctx({ accordage: null, params: { "Degrés par période": 12 } })) as never as
      { message?: string };
    // Les deux rendent les mêmes hauteurs ; seul le message les distingue, et c'est tout l'objet.
    expect(recu.message).not.toContain(traduire("iso.repli"));
    expect(repli.message).not.toBe(recu.message);
  });

  it("le repli suit son réglage, et non un nombre écrit en dur", async () => {
    const res = await fiche().executer(ctx({ accordage: null, params: { "Degrés par période": 31 } })) as never as
      { designe?: { accordage?: Accordage }; message?: string };
    expect(res.designe?.accordage?.degres).toHaveLength(31);
    // Dans un tempérament à trente et un degrés, la quinte la plus proche en vaut dix-huit.
    expect(res.message).toContain("18");
  });

  // ─── Deux sorties nulles sont un résultat valide ───
  it("UN CLAVIER NON ENCORE JOUÉ N'EST PAS EN ERREUR", async () => {
    const def = fiche();
    const res = await def.executer(ctx({ accordage: accordageEgal(19) })) as never as
      { valeurs: unknown[]; erreur?: boolean };
    expect(res.valeurs).toEqual([null, null]);
    expect(def.sortieNullePermise, "le drapeau est ce qui empêche le filet du moteur de crier").toBe(true);
    expect(estResultatEnErreur(def as never, res as never)).toBe(false);
  });

  it("une séquence jouée ressort en notes fractionnaires et en audio", async () => {
    const recu = accordageEgal(19);
    // Deux degrés d'un tempérament à dix-neuf : le premier est juste, le second ne tombe pas sur un
    // demi-ton, 1200/19 valant 63,16 cents.
    const notes = [
      { note: 60, velocite: 100, debut: 0, fin: 0.3 },
      { note: 60 + 63.157894736842103 / 100, velocite: 100, debut: 0.3, fin: 0.6 },
    ];
    const res = await fiche().executer(ctx({ accordage: recu, notes })) as never as
      { valeurs: unknown[]; message?: string };
    const sequence = res.valeurs[0] as { notes: typeof notes; titre?: string };
    expect(sequence.notes).toHaveLength(2);
    expect(Number.isInteger(sequence.notes[1].note)).toBe(false);
    expect(sequence.notes[1].note).toBeCloseTo(60.6316, 4);
    expect(res.valeurs[1]).toBeInstanceOf(AudioBuffer);
    expect((res.valeurs[1] as AudioBuffer).duration).toBeGreaterThan(0.5);
    expect(res.message).toContain("2");
  });

  it("la fiche déclare une entrée d'accordage et deux sorties, sans MIDI", async () => {
    const def = fiche();
    expect(def.entrees.map((e) => e.type)).toEqual(["accordage"]);
    // AUCUNE SORTIE MIDI : un fichier MIDI porte la hauteur sur un octet entier, où un degré
    // fractionnaire serait arrondi. C'est écrit dans la notice, et tenu ici.
    expect(def.sorties.map((s) => s.type)).toEqual(["sequence", "audio"]);
  });
});
