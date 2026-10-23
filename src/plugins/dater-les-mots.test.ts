// plugins/dater-les-mots.test.ts — Le refus du pont, et le débit qu'il rend.
//
// CE QUI SE GARDE ICI. La justesse du moteur se mesure au banc, pas dans un cas : le relevé du
// 2026-10-23 est écrit en tête de `dater-les-mots.ts`, et il vaut mieux qu'un seuil — ses quinze
// mots ont été confrontés à ceux d'un SECOND moteur, l'aligneur Qwen3, sur le même son. Ce qui se
// garde, c'est ce que le pont dit quand il manque une entrée, et le seul calcul que le composant
// fait de son côté.
import { describe, expect, it } from "vitest";
import { createRequire } from "module";

import { motsParMinute } from "./dater-les-mots";

const { transcrire, secondes, CADENCE_MOTEUR } =
  createRequire(import.meta.url)("../../electron/parakeet.cjs") as {
    transcrire: (o: { audio?: Uint8Array }) => Promise<{ ok: boolean; journal?: string }>;
    secondes: (indice: number) => number;
    CADENCE_MOTEUR: number;
  };

describe("la cadence dans laquelle le moteur compte", () => {
  it("vaut seize kilohertz, et c'est elle qui convertit les indices", () => {
    // MESURÉE, NON SUPPOSÉE : les instants rendus se sont accordés avec ceux de l'aligneur, qui
    // compte dans la même cadence, à deux tics de 80 ms près au pire.
    expect(CADENCE_MOTEUR).toBe(16000);
    expect(secondes(1280)).toBeCloseTo(0.08, 6);
  });

  it("LA RÉSOLUTION SE LIT DANS SES INDICES : des multiples de quatre-vingts millisecondes", () => {
    for (const indice of [0, 1280, 3840, 8960, 16640, 2842880]) {
      const pas = secondes(indice) / 0.08;
      expect(Math.round(pas), String(indice)).toBeCloseTo(pas, 6);
    }
  });
});

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
    // Zéro octet n'est pas un WAV : le dire tout de suite vaut mieux que laisser le moteur
    // s'étouffer dessus et rendre son erreur en anglais.
    const r = await transcrire({ audio: new Uint8Array(0) });
    expect(r.ok).toBe(false);
    expect(r.journal).toContain("Audio");
    sansModele(r.journal);
  });
});

describe("le débit de parole", () => {
  const mot = (debut: number, fin: number) => ({ mot: "x", debut, fin });

  it("compte les mots sur la durée qu'ils couvrent, et non sur celle du son", () => {
    // Trois mots en une seconde font cent quatre-vingts mots par minute, que le son dure une
    // seconde ou dix : c'est un débit de PAROLE, pas une densité de fichier.
    expect(motsParMinute([mot(0, 0.3), mot(0.3, 0.6), mot(0.6, 1)])).toBeCloseTo(180, 6);
  });

  it("se tait quand la mesure n'a pas de sens", () => {
    expect(motsParMinute([])).toBe(null);
    expect(motsParMinute([mot(0, 0.5)]), "un seul mot ne donne pas de débit").toBe(null);
    expect(motsParMinute([mot(1, 1), mot(1, 1)]), "une durée nulle ne se divise pas").toBe(null);
  });

  it("LE TÉMOIN DU RELEVÉ DONNE UN DÉBIT DE LECTURE PLAUSIBLE", () => {
    // Les quinze mots du témoin vont de 0,080 s à 4,400 s, soit 4,320 s de parole : cela fait deux
    // cent huit mots par minute, un débit de lecture soutenue. Si la formule se trompait d'un
    // facteur — en prenant la durée du son au lieu de celle de la parole, ou l'inverse — le chiffre
    // sortirait de cet ordre de grandeur, et c'est ce que ce cas garde.
    const temoin = Array.from({ length: 15 }, (_, i) => mot(0.08 + i * 0.288, 0.08 + (i + 1) * 0.288));
    expect(temoin[0].debut).toBeCloseTo(0.08, 6);
    expect(temoin[14].fin).toBeCloseTo(4.4, 6);
    expect(Math.round(motsParMinute(temoin)!)).toBe(208);
  });
});
