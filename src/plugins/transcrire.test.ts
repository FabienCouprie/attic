// plugins/transcrire.test.ts — Le refus du pont, et le compte de mots du composant.
//
// LA JUSTESSE DU MOTEUR SE MESURE AU BANC, pas dans un cas : le relevé du 2026-10-23 est écrit en
// tête de `transcrire.ts`, et il compare ce moteur au second du dépôt sur des témoins dont j'avais
// écrit le texte. Ce qui se garde ici, c'est ce que le pont dit quand il manque une entrée, et le
// seul calcul que le composant fait de son côté.
import { describe, expect, it } from "vitest";
import { createRequire } from "module";

import { compterMots } from "./transcrire";

const { transcrire } = createRequire(import.meta.url)("../../electron/qwen3-asr.cjs") as {
  transcrire: (o: { audio?: Uint8Array }) => Promise<{ ok: boolean; journal?: string }>;
};

describe("ce que le pont refuse avant de charger le modèle", () => {
  // CES CAS NE DÉPENDENT PAS DU MODÈLE, et c'est une propriété conquise : le pont d'Apollo avait
  // ses contrôles dans l'autre ordre, et ses cas passaient en local par la seule présence du
  // fichier de poids pour tomber en intégration continue, où aucun modèle n'est présent.
  const sansModele = (journal?: string) =>
    expect(journal, "un refus d'entrée ne doit pas dépendre du modèle").not.toMatch(/Modèle absent/);

  it("sans son, il nomme l'entrée « Audio »", async () => {
    const r = await transcrire({});
    expect(r.ok).toBe(false);
    expect(r.journal).toContain("Audio");
    expect(r.journal, "le message doit dire quoi brancher").toMatch(/Brancher/);
    sansModele(r.journal);
  });

  it("et un son vide est traité comme un son absent", async () => {
    const r = await transcrire({ audio: new Uint8Array(0) });
    expect(r.ok).toBe(false);
    expect(r.journal).toContain("Audio");
    sansModele(r.journal);
  });
});

describe("compter les mots d'une transcription", () => {
  it("compte ce qui porte une lettre ou un chiffre", () => {
    expect(compterMots("Le chat noir dort")).toBe(4);
    expect(compterMots("  Le   chat  ")).toBe(2);
    expect(compterMots("")).toBe(0);
  });

  it("LA PONCTUATION SEULE NE COMPTE PAS POUR UN MOT", () => {
    // Un moteur qui rend « ... » ou « — » entre deux phrases gonflerait le compte annoncé, et le
    // rapport du composant mentirait d'autant.
    expect(compterMots("Bonjour . — ... !")).toBe(1);
    expect(compterMots("...")).toBe(0);
  });

  it("une apostrophe ou un trait d'union ne sépare pas", () => {
    // « s'arrêter » et « quelque-chose » sont un mot chacun : c'est le blanc qui sépare, et c'est
    // ainsi que les comptes des deux moteurs ont été comparés au banc.
    expect(compterMots("Le train passera sans s'arrêter")).toBe(5);
    expect(compterMots("peut-être")).toBe(1);
  });

  it("LE TÉMOIN DU RELEVÉ DONNE SON COMPTE EXACT", () => {
    // La phrase dont j'avais écrit le texte, et que ce moteur a rendue telle quelle : quinze mots.
    expect(compterMots("Le chat noir dort sur le tapis rouge devant la grande fenêtre ouverte du salon."))
      .toBe(15);
  });

  it("les chiffres comptent pour des mots", () => {
    expect(compterMots("il est 3 heures")).toBe(4);
  });
});
