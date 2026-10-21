// src/plugins/chemin-travail.test.ts — Un chemin ne se fabrique pas à partir de ce qui n'est pas
// un chemin.
//
// ÉCRIT D'UN DÉBRIS, le 2026-10-21. Un dossier nommé `[object Promise]` vivait à la racine du
// dépôt, portant neuf fichiers de zéro octet — `python_input_*.wav`, `python_output_*.mid`.
// `obtenirRepertoireTravail` est un `ipcRenderer.invoke`, donc une promesse ; employée sans
// `await`, elle s'interpole en cette chaîne, et le nœud ÉCRIT dans un dossier au nom absurde au
// lieu de refuser.
//
// ET IL ÉTAIT INVISIBLE POUR LA RAISON LA PLUS SIMPLE : ces neuf fichiers étaient SUIVIS, ajoutés
// par le commit initial `e677234`, et un fichier suivi que personne ne modifie n'apparaît ni dans
// `git status` ni dans `git ls-files --others`. Le dossier a vécu dans le dépôt depuis le premier
// jour. Un défaut dont les traces sont committées est un défaut que plus personne ne regarde.
//
// LE DÉFAUT N'ÉTAIT PLUS VIVANT QUAND JE L'AI TROUVÉ : les deux nœuds de script s'en gardaient,
// chacun de son côté, et la source du répertoire attend bien sa promesse. Ce qui manquait était le
// GARDE — et les six autres nœuds qui écrivent dans ce répertoire, qui n'avaient aucune protection.
// Un défaut réparé sans garde est un défaut qui attend son tour.
//
// DEUX CAS QUI COMPTENT PLUS QUE LES AUTRES. Celui de la promesse, parce qu'une promesse est VRAIE
// et passait donc tout test de fausseté — c'est précisément ainsi qu'`export-sfz` la laissait
// passer. Et celui de la forme dans le code, parce qu'une aide que personne n'appelle ne protège
// personne.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { cheminDansTravail } from "./pont-electron";

describe("cheminDansTravail", () => {
  it("UNE PROMESSE EST REFUSÉE, et elle est vraie : aucun test de fausseté ne l'attrapait", () => {
    const r = cheminDansTravail(Promise.resolve("E:/travail"), "sortie.wav");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/attendu|awaited/i);
  });

  it("ce qui n'est pas une chaîne est refusé, et le dossier « undefined » n'existe pas", () => {
    for (const valeur of [undefined, null, 42, {}, []]) {
      const r = cheminDansTravail(valeur, "sortie.wav");
      expect(r.ok, String(valeur)).toBe(false);
    }
  });

  it("une chaîne vide est refusée : elle écrirait à la racine du processus", () => {
    for (const valeur of ["", "   ", "\t"]) {
      expect(cheminDansTravail(valeur, "sortie.wav").ok, JSON.stringify(valeur)).toBe(false);
    }
  });

  it("un chemin normal passe, et la barre finale ne se double pas", () => {
    for (const base of ["E:/travail", "E:/travail/", "E:/travail\\", "E:/travail//", " E:/travail "]) {
      const r = cheminDansTravail(base, "sortie.wav");
      expect(r.ok, base).toBe(true);
      if (r.ok) expect(r.chemin, base).toBe("E:/travail/sortie.wav");
    }
  });

  it("un sous-chemin est rendu tel quel, ce dont l'export SFZ a besoin", () => {
    const r = cheminDansTravail("E:/travail", "banque/do3.wav");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chemin).toBe("E:/travail/banque/do3.wav");
  });
});

// LE GARDE CHERCHE UNE FORME, JAMAIS UN NOM DE COMPOSANT. Il ne connaît pas la liste des nœuds qui
// écrivent sur disque : il lit tous les composants, repère ceux qui touchent au répertoire de
// travail, et exige de chacun qu'il passe par l'une des deux voies sûres. Un nœud neuf qui écrira
// dans ce répertoire tombera de la même façon.
describe("le répertoire de travail dans les composants", () => {
  const dossier = new URL(".", import.meta.url);
  const fichiers = readdirSync(dossier)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "pont-electron.ts")
    .map((f) => ({ nom: f, texte: readFileSync(new URL(f, dossier), "utf8") }));

  // LE CHAMP DU CONTEXTE, ET NON LE MOT. `soundfontGlobal.ts` reçoit un dossier en ARGUMENT et n'en
  // lit que le contenu : il ne fabrique aucun chemin, et ce n'est pas lui que le contexte peut
  // surprendre avec une promesse. Ce garde regarde donc `ctx.repertoireTravail`, la valeur que le
  // moteur passe à chaque exécution — la seule qui ait jamais produit le dossier absurde.
  const quiTouche = fichiers.filter((f) => f.texte.includes("ctx.repertoireTravail"));

  it("des composants y touchent, sans quoi ce garde ne regarderait rien", () => {
    expect(quiTouche.length).toBeGreaterThanOrEqual(6);
  });

  it("AUCUN N'INTERPOLE LE CHAMP DIRECTEMENT DANS UN CHEMIN", () => {
    const fautifs = quiTouche
      .filter((f) => /\$\{[^}]*repertoireTravail/.test(f.texte))
      .map((f) => f.nom);
    expect(fautifs, [
      "Ces composants fabriquent un chemin en interpolant « ctx.repertoireTravail » directement.",
      "Si ce champ n'est pas une chaîne — une promesse non attendue, undefined, null — le chemin",
      "devient « [object Promise]/… » ou « undefined/… », et le fichier PART quand même, dans un",
      "dossier au nom absurde que personne ne retrouvera. Passer par « cheminDansTravail ».",
    ].join("\n")).toEqual([]);
  });

  it("CHACUN PASSE PAR L'UNE DES DEUX VOIES SÛRES", () => {
    // L'AIDE EST EXIGÉE APPELÉE, NON IMPORTÉE, et c'est délibéré : `noUnusedLocals` vaut `false`
    // dans `tsconfig.app.json`, donc un import jamais employé ne fait tomber aucune compilation et
    // aurait suffi à verdir ce cas. La parenthèse est ce qui distingue l'appel de l'import.
    const sansGarde = quiTouche
      .filter((f) => !/cheminDansTravail\s*\(/.test(f.texte)
        && !/await[^;]*obtenirRepertoireTravail/.test(f.texte))
      .map((f) => f.nom);
    expect(sansGarde, [
      "Ces composants lisent le répertoire de travail sans en vérifier la forme. Deux voies sont",
      "sûres, et une seule suffit : appeler « cheminDansTravail », qui refuse ce qui n'est pas un",
      "chemin ; ou attendre « obtenirRepertoireTravail » avec « await », ce que font les deux nœuds",
      "de script, puis refuser une valeur vide.",
    ].join("\n")).toEqual([]);
  });
});
