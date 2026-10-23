// audio/fenetres-analyse.test.ts — Aucune liste de tailles de fenêtre n'est écrite à la main.
//
// CE QUE LE RELEVÉ A TROUVÉ, ET CE QU'IL A ÉCARTÉ. Vingt et un réglages du parc offrent une taille
// de transformée, sous dix formes au registre des nomenclatures. Trois de ces formes ne diffèrent
// que par les LIBELLÉS, et six sous-ensembles coexistent. En les examinant un par un, aucun n'est
// une dette :
//
//   LES SOUS-ENSEMBLES PORTENT DÉJÀ LEUR RAISON, dans la documentation de leur propre réglage :
//   « elle doit être longue, il faut du temps pour constater qu'une fréquence dure » pour la passe
//   sinusoïdale de la décomposition STN, « elle doit être courte » pour sa passe transitoire,
//   « 2048 est le compromis de l'article » pour la séparation harmonique, « sans effet sur
//   l'étirement » pour la transformée de Csound.
//
//   LES LIBELLÉS DESCRIPTIFS SONT RELATIFS À LEUR PROPRE LISTE : « Ordinaire (2048) » nomme la
//   taille du milieu, et le milieu d'une liste n'est pas celui d'une autre. Une table centrale ne
//   peut donc pas les produire, et les remplacer par le nombre seul retirerait de l'écran ce que
//   leur documentation dit déjà.
//
//   L'ABSENCE DE LISTE ANGLAISE sur deux réglages est une décision écrite à côté d'eux : des
//   tailles de fenêtre ne se traduisent pas.
//
// CE QUI RESTAIT, ET QUE CE FICHIER TIENT. Chaque liste était écrite à la main, et le commentaire
// d'un composant portait déjà la crainte : « une liste neuve en aurait fait une onzième ». Le garde
// cherche LA FORME d'une liste de tailles dans la source, et non un nom de constante, de sorte
// qu'une liste neuve ne puisse pas passer sous un autre nom.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";

import { TAILLES_FENETRE, choixFenetre } from "./fenetres-analyse";

const RACINE = resolve(__dirname, "..");
const MOI = join("audio", "fenetres-analyse.ts");

describe("la table des tailles de fenêtre", () => {
  it("rend les trois listes, dans l'ordre demandé et non dans le sien", () => {
    const c = choixFenetre([4096, 1024, 2048]);
    expect(c.optionIds).toEqual(["4096", "1024", "2048"]);
    expect(c.options).toEqual(c.optionIds);
    expect(c.optionsEn).toEqual(c.optionIds);
  });

  it("REFUSE UNE TAILLE QU'ELLE NE PORTE PAS, plutôt que de rendre une liste amputée", () => {
    // UNE LISTE AMPUTÉE EN SILENCE SERAIT LE PIRE DES DEUX : le réglage offrirait une option de
    // moins que ce que son composant croit offrir, et rien ne le dirait.
    expect(() => choixFenetre([1024, 3000])).toThrow(/3000/);
    expect(() => choixFenetre([128])).toThrow();
  });

  it("ne porte que des puissances de deux, croissantes", () => {
    for (const t of TAILLES_FENETRE) expect(t & (t - 1), String(t)).toBe(0);
    expect([...TAILLES_FENETRE]).toEqual([...TAILLES_FENETRE].sort((a, b) => a - b));
  });

  function sources(dossier: string, trouves: string[] = []): string[] {
    for (const nom of readdirSync(dossier)) {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) { sources(chemin, trouves); continue; }
      if (!nom.endsWith(".ts") && !nom.endsWith(".tsx")) continue;
      if (nom.includes(".test.")) continue;
      trouves.push(chemin);
    }
    return trouves;
  }

  /**
   * Les endroits de ce texte qui ont LA FORME d'une liste de tailles de fenêtre.
   *
   * TROIS CONDITIONS, ET CHACUNE A ÉTÉ GAGNÉE CONTRE UN FAUX POSITIF.
   *
   *   DES CHAÎNES ENTRE CROCHETS, et non des nombres : les tailles d'un réglage sont des chaînes,
   *   puisqu'une option l'est. Une table de longueurs ou de degrés s'écrit en nombres.
   *
   *   TOUTES CONNUES DE LA TABLE. Sans cela, le garde attrapait la liste de réponses d'une
   *   question de quiz, « 1025, 2048, 1024, 4096 », où trois valeurs sur quatre sont des tailles
   *   mais où la première est la réponse juste, le nombre de cases utiles.
   *
   *   CROISSANTES. Un réglage offre ses tailles dans l'ordre, un jeu de réponses les mêle.
   */
  function listesDeTailles(texte: string): string[] {
    const tailles = new Set(TAILLES_FENETRE.map(String));
    const trouvees: string[] = [];
    const lignes = texte.split("\n");
    for (let i = 0; i < lignes.length; i++) {
      const fenetre = lignes.slice(i, i + 4).join("\n");
      for (const [, dedans] of fenetre.matchAll(/\[((?:\s*"[^"]*"\s*,?)+)\]/g)) {
        const membres = [...dedans.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
        if (membres.length < 3) continue;
        if (!membres.every((m) => tailles.has(m))) continue;
        const nombres = membres.map(Number);
        if (!nombres.every((n, k) => k === 0 || n > nombres[k - 1])) continue;
        trouvees.push(`ligne ${i + 1} : ${membres.join(", ")}`);
        i += 3; // la même liste ne se compte pas quatre fois
        break;
      }
    }
    return trouvees;
  }

  it("LE GARDE RECONNAÎT UNE LISTE, ET SEULEMENT ELLE", () => {
    expect(listesDeTailles(`options: ["512", "1024", "2048"],`)).toHaveLength(1);
    expect(listesDeTailles(`optionIds: ["1024","2048","4096","8192"],`)).toHaveLength(1);
    // Deux tailles ne font pas une liste : une phrase les oppose souvent.
    expect(listesDeTailles(`doc: "À 44 100 Hz, 1024 voit 23 ms quand 8192 en voit 186."`)).toEqual([]);
    // Des nombres ne sont pas des options : une table de degrés ou de longueurs n'est pas visée.
    expect(listesDeTailles(`const T = [512, 1024, 2048, 4096];`)).toEqual([]);
    // LE FAUX POSITIF GAGNÉ : les réponses d'une question de quiz sur les cases utiles d'une FFT.
    expect(listesDeTailles(`["1025", "2048", "1024", "4096"], null,`)).toEqual([]);
    // Et une liste mêlée n'est pas un réglage, même si tout y est une taille.
    expect(listesDeTailles(`["4096", "1024", "2048"]`)).toEqual([]);
  });

  it("AUCUN AUTRE FICHIER N'ÉCRIT UNE LISTE DE TAILLES", () => {
    const fautifs: string[] = [];
    for (const chemin of sources(RACINE)) {
      if (chemin.endsWith(MOI)) continue;
      for (const ou of listesDeTailles(readFileSync(chemin, "utf8"))) {
        fautifs.push(`${chemin.slice(RACINE.length + 1)} : ${ou}`);
      }
    }
    expect(fautifs.length, `ces tailles doivent venir de \`audio/fenetres-analyse.ts\`, par \`choixFenetre\` :\n${fautifs.join("\n")}`)
      .toBe(0);
  });
});
