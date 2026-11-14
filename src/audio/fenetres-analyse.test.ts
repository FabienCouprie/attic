// audio/fenetres-analyse.test.ts — Aucune liste de tailles de fenêtre n'est écrite à la main.
//
// CE QUE LE RELEVÉ A TROUVÉ, ET CE QU'IL A ÉCARTÉ. Vingt-trois réglages du parc offrent une taille
// de transformée. Depuis la passe de complétude du 2026-11-14, ils offrent la table entière, sauf
// quatre dont l'algorithme dit la borne, déclarée en coupe au domaine « fenêtre d'analyse » :
//
//   LES LIBELLÉS DESCRIPTIFS, « Ordinaire (2048) », viennent de la table par `choixFenetreNomme`.
//   Ils étaient relatifs à leur liste, et s'écrivaient trois fois à la main ; les listes devenues
//   entières, chaque libellé dit ce que sa taille fait voir, le même partout.
//
//   L'ABSENCE DE LISTE ANGLAISE sur deux réglages est une décision écrite à côté d'eux : des
//   tailles de fenêtre ne se traduisent pas.
//
// CE QUI RESTAIT, ET QUE CE FICHIER TIENT. Chaque liste était écrite à la main, et le commentaire
// d'un composant portait déjà la crainte : « une liste neuve en aurait fait une onzième ». Le garde
// cherche LA FORME d'une liste de tailles dans la source, et non un nom de constante, de sorte
// qu'une liste neuve ne puisse pas passer sous un autre nom.
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";

import { TAILLES_FENETRE, choixFenetre, choixFenetreNomme } from "./fenetres-analyse";
import { registre } from "./adaptateur";
import { valeurCanoniqueChoix } from "../i18n";

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

  it("les libellés nommés restent appariés à leur taille, dans l'ordre demandé", () => {
    const c = choixFenetreNomme([4096, 2048]);
    expect(c.optionIds).toEqual(["4096", "2048"]);
    expect(c.options).toEqual(["Fine en fréquence (4096)", "Ordinaire (2048)"]);
    expect(c.optionsEn).toEqual(["Sharp in frequency (4096)", "Ordinary (2048)"]);
    expect(() => choixFenetreNomme([3000])).toThrow(/3000/);
  });

  it("UN PROJET ANCIEN ROUVRE SUR SA TAILLE : chaque libellé d'avant l'élargissement se résout", () => {
    // Les listes à libellés avaient deux, trois ou quatre tailles ; 256 et 512 y sont entrés AVANT
    // elles, et « Très fine (8192) » a changé de nom. Un libellé se résout par son rang dans la liste
    // d'aujourd'hui, appariée, ou par `optionsHeritees` : aucun ne doit glisser sur une autre taille.
    const avant: [string, string, string][] = [
      ["Fine en temps (1024)", "Sharp in time (1024)", "1024"],
      ["Ordinaire (2048)", "Ordinary (2048)", "2048"],
      ["Fine en fréquence (4096)", "Sharp in frequency (4096)", "4096"],
      ["Très fine (8192)", "Very sharp (8192)", "8192"],
    ];
    const reglages: [string, [string, string, string][]][] = [
      ["rugosite", avant.slice(0, 3)], ["flou-spectral", avant], ["gel-spectral", avant],
      ["glissando-interieur", avant], ["tracage-spectral", avant], ["masquage", avant.slice(1, 3)],
    ];
    const fautes: string[] = [];
    for (const [id, anciens] of reglages) {
      const p = registre.trouverDef(id)?.parametres?.find((x) => x.nom === "Finesse");
      if (!p) { fautes.push(`${id} : pas de « Finesse »`); continue; }
      for (const [fr, en, taille] of anciens) {
        for (const libelle of [fr, en, taille]) {
          const lu = valeurCanoniqueChoix(p, libelle);
          if (lu !== taille) fautes.push(`${id} : « ${libelle} » se lit ${String(lu)} au lieu de ${taille}`);
        }
      }
    }
    expect(fautes).toEqual([]);
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
      // LE MOTIF EST DÉTERMINISTE, ET CE N'EST PAS UN DÉTAIL DE STYLE. Écrit « une suite d'éléments
      // suivis d'une virgule facultative », il laissait deux façons de découper la même entrée, et
      // le retour arrière y devenait exponentiel sur une liste longue sans crochet fermant. Ici
      // chaque élément suivant EXIGE sa virgule, de sorte qu'il n'y a qu'un découpage possible.
      for (const [, dedans] of fenetre.matchAll(/\[\s*("[^"]*"(?:\s*,\s*"[^"]*")*)\s*\]/g)) {
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

  /**
   * LES FICHIERS QUI ÉCRIVENT DES TAILLES SANS LES OFFRIR, et pourquoi. Une inscription du croisement
   * relève les valeurs OBSERVÉES sous lesquelles un réglage coïncide ou reste inerte : la remplacer par
   * la table la rendrait fausse dès qu'une seule taille s'en sépare. Ce fichier ne déclare aucun
   * réglage.
   */
  const RELEVES = [join("audio", "croisement-inscriptions.ts")];

  it("AUCUN AUTRE FICHIER N'ÉCRIT UNE LISTE DE TAILLES", () => {
    // Un relevé renommé laisserait ici une exemption orpheline, qui couvrirait un autre fichier.
    expect(RELEVES.filter((r) => !existsSync(join(RACINE, r))), "ce relevé n'existe plus : retirer sa ligne").toEqual([]);
    const fautifs: string[] = [];
    for (const chemin of sources(RACINE)) {
      if (chemin.endsWith(MOI) || RELEVES.some((r) => chemin.endsWith(r))) continue;
      for (const ou of listesDeTailles(readFileSync(chemin, "utf8"))) {
        fautifs.push(`${chemin.slice(RACINE.length + 1)} : ${ou}`);
      }
    }
    expect(fautifs.length, `ces tailles doivent venir de \`audio/fenetres-analyse.ts\`, par \`choixFenetre\` :\n${fautifs.join("\n")}`)
      .toBe(0);
  });
});
