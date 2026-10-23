// core/oui-non.test.ts — La paire oui/non vient d'un seul endroit, et l'ordre est une donnée.
//
// LE CONCEPT LE PLUS PARTAGÉ DU CATALOGUE, ET LE PLUS RECOPIÉ. Trente-huit réglages offrent un
// oui ou un non, et chacun écrivait sa paire à la main. Cinq posaient `yes` et `no` dans les
// projets quand trente et un posaient `oui` et `non` ; deux d'entre eux affichaient « oui » et
// « non » en minuscules, et un troisième n'avait pas de liste anglaise du tout.
//
// L'ORDRE N'EST PAS UNE DIVERGENCE À CORRIGER, et c'est la chose à ne pas se tromper ici. La
// valeur d'un réglage enregistrée dans un projet se résout PAR LA POSITION : le libellé retrouvé
// dans `options` donne l'identifiant de même rang dans `optionIds`. Retourner une liste ferait
// donc qu'un projet rouvert répondrait le CONTRAIRE de ce qu'il disait, en silence. Les deux
// ordres sont offerts, et le composant garde le sien.
//
// LE GARDE CHERCHE LA FORME D'UNE PAIRE DANS LA SOURCE, et non un nom de constante, puisque le
// registre des nomenclatures ne voit pas deux paires identiques écrites deux fois.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";

import { LIBELLES_HERITES_OUI_NON, OUI_NON, choixOuiNon } from "./oui-non";

const RACINE = resolve(__dirname, "..");
const MOI = join("core", "oui-non.ts");

describe("la paire oui ou non", () => {
  it("rend les trois listes dans l'ordre demandé", () => {
    expect(choixOuiNon().optionIds).toEqual(["oui", "non"]);
    expect(choixOuiNon().options).toEqual(["Oui", "Non"]);
    expect(choixOuiNon().optionsEn).toEqual(["Yes", "No"]);
    expect(choixOuiNon("non").optionIds).toEqual(["non", "oui"]);
    expect(choixOuiNon("non").options).toEqual(["Non", "Oui"]);
    expect(choixOuiNon("non").optionsEn).toEqual(["No", "Yes"]);
  });

  it("LES TROIS LISTES SE CORRESPONDENT RANG PAR RANG, dans les deux ordres", () => {
    // C'EST LA PROPRIÉTÉ DONT TOUT DÉPEND : un projet enregistré se résout par la position, donc
    // un libellé et son identifiant doivent tomber au même rang dans les deux langues.
    for (const premier of ["oui", "non"] as const) {
      const c = choixOuiNon(premier);
      for (let i = 0; i < c.optionIds.length; i++) {
        const rang = OUI_NON.ids.indexOf(c.optionIds[i]);
        expect(c.options[i], `rang ${i}`).toBe(OUI_NON.fr[rang]);
        expect(c.optionsEn[i], `rang ${i}`).toBe(OUI_NON.en[rang]);
      }
    }
  });

  it("chaque ancienne écriture désigne un identifiant de la paire", () => {
    for (const [ancienne, id] of Object.entries(LIBELLES_HERITES_OUI_NON)) {
      expect(OUI_NON.ids, `« ${ancienne} » désigne « ${id} », qui n'est pas de la paire`).toContain(id);
    }
    // LES QUATRE ÉCRITURES QUI ONT VÉCU DANS LE PARC sont nommées une par une, sans quoi un projet
    // enregistré sous l'une d'elles retomberait sur le défaut.
    for (const ancienne of ["yes", "no", "Yes", "No", "oui", "non", "On", "Off"]) {
      expect(LIBELLES_HERITES_OUI_NON[ancienne], `« ${ancienne} » n'est pas déclarée`).toBeTruthy();
    }
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
   * Les endroits de ce texte qui ont LA FORME d'une paire oui/non écrite à la main.
   *
   * EXACTEMENT DEUX ÉLÉMENTS, et tous deux de la paire. Une liste plus longue qui contiendrait
   * « non » n'est pas une paire : ce serait un autre vocabulaire qui la recoupe.
   */
  function pairesEcrites(texte: string): string[] {
    const mots = new Set(["oui", "non", "Oui", "Non", "yes", "no", "Yes", "No"]);
    const trouvees: string[] = [];
    texte.split("\n").forEach((ligne, i) => {
      for (const [, dedans] of ligne.matchAll(/\[\s*("[^"]*"(?:\s*,\s*"[^"]*")*)\s*\]/g)) {
        const membres = [...dedans.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
        if (membres.length !== 2) continue;
        if (!membres.every((m) => mots.has(m))) continue;
        trouvees.push(`ligne ${i + 1} : ${membres.join(", ")}`);
      }
    });
    return trouvees;
  }

  it("LE GARDE RECONNAÎT UNE PAIRE, ET SEULEMENT ELLE", () => {
    expect(pairesEcrites(`options: ["Oui", "Non"],`)).toHaveLength(1);
    expect(pairesEcrites(`optionIds: ["no", "yes"],`)).toHaveLength(1);
    // Trois valeurs ne font pas une paire : c'est un autre vocabulaire.
    expect(pairesEcrites(`options: ["Oui", "Non", "Peut-être"],`)).toEqual([]);
    // Et une paire dont un membre n'en est pas n'en est pas une.
    expect(pairesEcrites(`options: ["Oui", "Jamais"],`)).toEqual([]);
  });

  it("AUCUN EXÉCUTEUR NE COMPARE SON RÉGLAGE À « yes » OU « no »", () => {
    // LE GARDE QUI AURAIT ATTRAPÉ MA FAUTE. Cinq exécuteurs comparaient leur réglage à la chaîne
    // `"yes"`, parce que c'était l'identifiant de leur liste. Les identifiants devenus `oui` et
    // `non`, chacune de ces comparaisons serait restée DÉFINITIVEMENT FAUSSE, et le réglage inerte
    // sans que rien ne le dise. Ce sont les cas d'épreuve des composants qui l'ont vu ; celui-ci le
    // voit sur la source entière, y compris là où aucun cas ne passe.
    const fautifs: string[] = [];
    for (const chemin of sources(RACINE)) {
      if (chemin.endsWith(MOI)) continue;
      readFileSync(chemin, "utf8").split("\n").forEach((ligne, i) => {
        if (/[!=]==\s*"(yes|no)"/.test(ligne)) {
          fautifs.push(`${chemin.slice(RACINE.length + 1)} ligne ${i + 1} : ${ligne.trim().slice(0, 80)}`);
        }
      });
    }
    expect(fautifs.length, `lire la valeur par \`estOui\` de \`core/oui-non.ts\` :\n${fautifs.join("\n")}`).toBe(0);
  });

  it("AUCUN AUTRE FICHIER N'ÉCRIT LA PAIRE", () => {
    const fautifs: string[] = [];
    for (const chemin of sources(RACINE)) {
      if (chemin.endsWith(MOI)) continue;
      for (const ou of pairesEcrites(readFileSync(chemin, "utf8"))) {
        fautifs.push(`${chemin.slice(RACINE.length + 1)} : ${ou}`);
      }
    }
    expect(fautifs.length, `cette paire doit venir de \`core/oui-non.ts\`, par \`choixOuiNon\` :\n${fautifs.join("\n")}`)
      .toBe(0);
  });
});
