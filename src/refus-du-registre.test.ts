// @vitest-environment jsdom
// refus-du-registre.test.ts — Un projet ouvert dit les méta-composants que le registre refuse.
//
// CE QUE CES CAS TIENNENT. `useImportProjet` chargeait les métas d'un projet reçu sans lire le
// refus du registre : un méta sous l'identifiant d'un natif ou d'un alias était refusé à la console,
// et la personne voyait le natif là où le fichier annonçait son méta, sans un mot. Le message est
// composé à l'exécution : ni le registre anglais ni le garde des vues ne le voient, et l'anglais se
// vérifie ici au détecteur du registre.
import { afterEach, describe, expect, it } from "vitest";

import { francais } from "./docs/detecteur-francais";
import { messageMetasRefuses } from "./refus-du-registre";

const REFUSES = [
  { id: "reverberation", refus: { inscrite: false, raison: "natif" } },
  { id: "filtre", refus: { inscrite: false, raison: "alias", cible: "reponse-filtre" } },
  // LE NOM DU PORT EST UNE DONNÉE DU MÉTA, et il est pris neutre : un « Entrée » ferait crier le
  // détecteur sur un nom que le message recopie et ne traduit pas.
  { id: "meta-x", refus: { inscrite: false, raison: "invalide", fautes: [{ code: "type-inconnu", port: "Audio", type: "lumiere" }] } },
] as const;

describe("le message des méta-composants refusés", () => {
  afterEach(() => { localStorage.clear(); });

  it("RIEN À DIRE QUAND RIEN N'EST REFUSÉ", () => {
    expect(messageMetasRefuses([])).toBeNull();
  });

  it("EN FRANÇAIS, chaque méta et sa raison", () => {
    localStorage.setItem("attic-lang", "fr");
    const m = messageMetasRefuses(REFUSES as never)!;
    expect(m).toMatch(/^Ce fichier porte 3 méta-composant\(s\) que le registre refuse/);
    expect(m).toContain("« reverberation », identifiant d'un composant natif");
    expect(m).toContain("« filtre », ancien identifiant de « reponse-filtre »");
    expect(m).toContain("« meta-x », fiche invalide (le port « Audio » est de type « lumiere », que cette application ne connaît pas)");
  });

  it("EN ANGLAIS, la même chose, sans un mot de français", () => {
    localStorage.setItem("attic-lang", "en");
    const m = messageMetasRefuses(REFUSES as never)!;
    expect(m).toMatch(/^This file carries 3 meta-component\(s\) that the registry refuses/);
    expect(m).toContain("\"filtre\", former identifier of \"reponse-filtre\"");
    expect(m).toContain("port \"Audio\" has type \"lumiere\", which this application does not know");
    expect(m, "le point-virgule anglais n'est pas précédé d'une espace").not.toMatch(/ ;/);
    expect(francais(m), m).toBe(false);
  });

  it("AU DÉMARRAGE, LES MÉTAS GARDÉS ICI : la même liste, et ce que devient leur clé, dans les deux langues", () => {
    localStorage.setItem("attic-lang", "fr");
    const fr = messageMetasRefuses(REFUSES as never, "stockage")!;
    expect(fr).toMatch(/^Cette application gardait 3 méta-composant\(s\) que le registre refuse/);
    expect(fr).toContain("« filtre », ancien identifiant de « reponse-filtre »");
    expect(fr).toContain("sont retirés du stockage ; les autres y restent.");

    localStorage.setItem("attic-lang", "en");
    const en = messageMetasRefuses(REFUSES as never, "stockage")!;
    expect(en).toMatch(/^This application kept 3 meta-component\(s\) that the registry refuses/);
    expect(en).toContain("are removed from storage; the others remain there.");
    expect(francais(en), en).toBe(false);
  });
});
