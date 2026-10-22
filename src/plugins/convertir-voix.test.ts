// plugins/convertir-voix.test.ts — Les deux refus du pont, avant qu'il ne charge deux giga-octets.
//
// CE QU'IL Y A À GARDER ICI, ET CE QU'IL N'Y A PAS. Le composant est mince : le moteur fait le
// travail, et sa qualité se mesure au banc, pas dans un cas — le relevé du 2026-10-23 est écrit en
// tête de `convertir-voix.ts`, avec les deux chiffres qui comptent. Ce qui se garde, c'est ce que
// le pont dit quand il manque une entrée : le modèle pèse 2 088 399 204 octets, et le charger pour
// découvrir qu'il n'y a rien à convertir serait une minute perdue et un message illisible.
//
// LA CONVERSION DEMANDE DEUX SONS, et c'est ce qui la distingue du clonage, qui demande un son et
// un texte. Les deux refus portent donc sur les deux entrées, séparément.
import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const { convertir } = createRequire(import.meta.url)("../../electron/chatterbox.cjs") as {
  convertir: (o: { source?: Uint8Array; cible?: Uint8Array }) => Promise<{ ok: boolean; journal?: string }>;
};

const QUELQUES_OCTETS = new Uint8Array([1, 2, 3, 4]);

describe("ce que le pont refuse avant de charger le modèle", () => {
  // CES TROIS CAS NE DÉPENDENT PAS DU MODÈLE, et c'est une propriété conquise : le pont voisin les
  // avait écrits dans l'autre ordre, et ils passaient en local par la seule présence du fichier de
  // poids pour tomber en intégration continue, où aucun modèle d'`audio.cpp` n'est présent — ils y
  // recevaient « Modèle absent » là où ils attendaient leur refus. Ce qui ne demande rien se
  // vérifie donc avant ce qui demande deux giga-octets, et chaque cas l'exige explicitement.
  const sansModele = (journal?: string) =>
    expect(journal, "un refus d'entrée ne doit pas dépendre du modèle").not.toMatch(/Modèle absent/);

  it("SANS SOURCE, il nomme l'entrée « Audio »", async () => {
    const r = await convertir({ cible: QUELQUES_OCTETS });
    expect(r.ok).toBe(false);
    expect(r.journal).toContain("Audio");
    expect(r.journal, "le message doit dire quoi brancher").toMatch(/Brancher/);
    sansModele(r.journal);
  });

  it("SANS VOIX CIBLE, il nomme l'entrée « Voix cible »", async () => {
    const r = await convertir({ source: QUELQUES_OCTETS });
    expect(r.ok).toBe(false);
    expect(r.journal).toContain("Voix cible");
    expect(r.journal, "le message doit dire quoi brancher").toMatch(/Brancher/);
    sansModele(r.journal);
  });

  it("et les deux refus ne se confondent pas", async () => {
    // Un seul message pour les deux cas laisserait chercher laquelle des deux entrées manque.
    const sansSource = await convertir({ cible: QUELQUES_OCTETS });
    const sansCible = await convertir({ source: QUELQUES_OCTETS });
    expect(sansSource.journal).not.toBe(sansCible.journal);
    sansModele(sansSource.journal);
    sansModele(sansCible.journal);
  });
});
