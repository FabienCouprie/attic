// core/langues.test.ts — Les noms de langue sont à un seul endroit, et chaque liste est bornée.
//
// SIX TABLES LES ÉCRIVAIENT À LA MAIN. Le relevé des 503 composants a compté six formes du concept
// « langue » sur huit réglages, et le registre des nomenclatures les déclare : la divergence des
// LISTES est légitime, chaque composant étant borné par les langues que son modèle tient. Ce qui ne
// l'était pas, c'est que les NOMS soient recopiés, car le registre ne peut pas le voir : deux
// tables aux mêmes valeurs ne font qu'une forme à ses yeux, et c'est pourtant deux endroits où une
// orthographe peut dériver.
//
// LE GARDE CHERCHE DONC LA FORME D'UNE TABLE DE NOMS DE LANGUE DANS LA SOURCE, comme celui des
// signatures rythmiques, et non un nom de constante.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";

import { toutesLesFiches } from "../plugins/index";
import {
  LANGUES, LANGUE_AUTO, LIBELLES_HERITES_LANGUES, choixLangues, codeLangue, langue, libelleLangue,
} from "./langues";

describe("la table des langues", () => {
  it("chaque langue porte un identifiant et deux noms", () => {
    for (const l of LANGUES) {
      expect(l.fr.length, l.id).toBeGreaterThan(1);
      expect(l.en.length, l.id).toBeGreaterThan(1);
      expect(langue(l.id), l.id).toBe(l);
    }
  });

  it("aucun identifiant ni aucun nom n'est porté deux fois", () => {
    expect(new Set(LANGUES.map((l) => l.id)).size).toBe(LANGUES.length);
    expect(new Set(LANGUES.map((l) => l.fr)).size).toBe(LANGUES.length);
    expect(new Set(LANGUES.map((l) => l.en)).size).toBe(LANGUES.length);
  });

  it("elle se lit par l'identifiant ET par les deux noms, casse comprise", () => {
    // Un composant sans `optionIds` enregistre son libellé : c'était le cas de la reconnaissance
    // Sherpa, dont la table était écrite à l'envers, du nom vers le code.
    expect(codeLangue("fr")).toBe("fr");
    expect(codeLangue("Français")).toBe("fr");
    expect(codeLangue("french")).toBe("fr");
    expect(codeLangue("Cantonais")).toBe("yue");
  });

  it("LA LANGUE AUTOMATIQUE EST LA CHAÎNE VIDE, qui est la convention du dépôt", () => {
    expect(LANGUE_AUTO).toBe("");
    expect(langue("")?.fr).toBe("Automatique");
    // Et ce qui ne nomme aucune langue y retombe, plutôt que de passer un code inventé au moteur.
    expect(codeLangue("klingon")).toBe(LANGUE_AUTO);
    expect(libelleLangue("klingon"), "un nom inconnu se montre tel quel").toBe("klingon");
  });

  it("les libellés d'autrefois se relisent", () => {
    for (const [ancien, vise] of Object.entries(LIBELLES_HERITES_LANGUES)) {
      expect(codeLangue(ancien), `« ${ancien} »`).toBe(vise);
    }
  });

  it("UN CODE INCONNU FAIT ÉCHOUER LE RÉGLAGE, plutôt qu'offrir une option sans nom", () => {
    expect(() => choixLangues(["fr", "xx"])).toThrow();
    expect(choixLangues(["fr", "en"]).options).toEqual(["Français", "Anglais"]);
    expect(choixLangues(["en", "fr"]).options, "l'ordre est celui du composant")
      .toEqual(["Anglais", "Français"]);
  });
});

describe("ce que les composants offrent", () => {
  /** Les réglages à choix dont au moins deux identifiants nomment une langue. */
  function reglagesDeLangue(): { ou: string; ids: string[]; fr: string[] }[] {
    const out: { ou: string; ids: string[]; fr: string[] }[] = [];
    for (const f of toutesLesFiches as { id: string; parametres?: unknown[] }[]) {
      for (const p of (f.parametres ?? []) as {
        nom: string; type?: string; options?: unknown[]; optionIds?: string[];
      }[]) {
        const ids = (p.optionIds ?? (p.type === "choix" ? p.options : undefined) ?? []).map(String);
        const connus = ids.filter((x) => x !== LANGUE_AUTO && langue(x)?.id === x).length;
        if (connus < 2) continue;
        out.push({ ou: `${f.id}·${p.nom}`, ids, fr: (p.options ?? []).map(String) });
      }
    }
    return out;
  }

  it("ils sont au moins dix, et le garde les trouve", () => {
    expect(reglagesDeLangue().length).toBeGreaterThanOrEqual(10);
  });

  it("TOUT IDENTIFIANT OFFERT NOMME UNE LANGUE DE LA TABLE", () => {
    const fautifs: string[] = [];
    for (const r of reglagesDeLangue()) {
      for (const id of r.ids) {
        if (langue(id)?.id === id) continue;
        fautifs.push(`${r.ou} offre « ${id} », que la table ne nomme pas`);
      }
    }
    expect(fautifs.length, fautifs.join("\n")).toBe(0);
  });

  it("ET UN MÊME IDENTIFIANT PORTE LE MÊME NOM PARTOUT", () => {
    // C'est la propriété que le registre des nomenclatures ne peut pas tenir : il compte les formes
    // distinctes et deux tables identiques n'en font qu'une. Ici on compare nom par nom.
    const fautifs: string[] = [];
    for (const r of reglagesDeLangue()) {
      for (const [rang, id] of r.ids.entries()) {
        const vu = r.fr[rang];
        if (vu === undefined) continue;
        const attendu = langue(id)?.fr;
        if (attendu && vu !== attendu) {
          fautifs.push(`${r.ou} : « ${id} » s'affiche « ${vu} » et non « ${attendu} »`);
        }
      }
    }
    expect(fautifs.length, fautifs.join("\n")).toBe(0);
  });
});

describe("la table est à un seul endroit", () => {
  const RACINE = resolve(__dirname, "..");
  const MOI = join("core", "langues.ts");

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
   * Les endroits de ce texte qui ont LA FORME d'une table de noms de langue : trois noms au moins,
   * pris parmi ceux de la table, sur la même ligne ou dans le même objet.
   *
   * LA LIGNE EST LA BONNE MAILLE, et c'est mesuré : les six tables du dépôt écrivaient un nom par
   * ligne, donc chercher par ligne ne les verrait pas. On cherche donc par FENÊTRE de quelques
   * lignes, ce qui attrape aussi bien une liste étalée qu'une liste serrée.
   */
  function tablesDeLangues(texte: string): string[] {
    const noms = LANGUES.filter((l) => l.id !== LANGUE_AUTO).map((l) => l.fr);
    const lignes = texte.split("\n");
    const trouvees: string[] = [];
    for (let i = 0; i < lignes.length; i++) {
      const fenetre = lignes.slice(i, i + 12).join("\n");
      const combien = noms.filter((n) => fenetre.includes(`"${n}"`)).length;
      if (combien >= 3) {
        trouvees.push(`ligne ${i + 1} : ${combien} noms de langue`);
        i += 11; // la même table ne se compte pas douze fois
      }
    }
    return trouvees;
  }

  it("LE GARDE RECONNAÎT UNE TABLE DE NOMS, ET SEULEMENT ELLE", () => {
    expect(tablesDeLangues(`const L = ["Français", "Anglais", "Espagnol"];`)).toHaveLength(1);
    expect(tablesDeLangues(`{ id: "fr", fr: "Français" },\n{ id: "en", fr: "Anglais" },\n{ id: "es", fr: "Espagnol" },`))
      .toHaveLength(1);
    // Deux noms ne font pas une table : « Français » et « Anglais » se rencontrent dans une phrase.
    expect(tablesDeLangues(`doc: "Entre le Français et l'Anglais, le modèle choisit seul."`)).toEqual([]);
  });

  it("AUCUN AUTRE FICHIER N'ÉCRIT LES NOMS DE LANGUE", () => {
    const fautifs: string[] = [];
    for (const chemin of sources(RACINE)) {
      if (chemin.endsWith(MOI)) continue;
      for (const ou of tablesDeLangues(readFileSync(chemin, "utf8"))) {
        fautifs.push(`${chemin.slice(RACINE.length + 1)} : ${ou}`);
      }
    }
    expect(fautifs.length, `ces noms doivent venir de \`core/langues.ts\` :\n${fautifs.join("\n")}`).toBe(0);
  });
});
