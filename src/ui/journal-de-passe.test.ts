// ui/journal-de-passe.test.ts — La sonde des trois magasins relève chaque écriture, et rien sans elle.
//
// CE QUI DOIT ÊTRE TENU, et pourquoi chacun compte :
//
//   - SANS LA GLOBALE DE LA SPEC, RIEN N'EST ARMÉ. Le module s'arme au chargement de l'application :
//     s'il s'abonnait toujours, chaque écriture de chaque passe paierait un journal que personne ne
//     lit, et la mémoire grossirait sans fin.
//   - L'ORDRE EST CELUI DES ÉCRITURES, entre les trois magasins. C'est tout ce que la spec compare.
//   - UNE ÉCRITURE QUI NE CHANGE RIEN N'EST PAS RELEVÉE. Le moteur repose volontiers le même
//     correctif ; le relever ferait dépendre le journal d'appels qui n'ont aucun effet.
//   - UN RÉSULTAT SE RELÈVE PAR CE QU'IL CHANGE, valeurs décrites : posés, changés, retirés.
//   - DÉSARMÉE, LA SONDE SE TAIT.
import { afterEach, describe, expect, it } from "vitest";

import { armerLeJournalDePasse, decrire, type EntreeDuJournal } from "./journal-de-passe";
import { definirPrioritaire } from "./priorite";
import { effacerResultats, poserResultat } from "./resultats";
import { poserApercu, poserStatut, poserStatutOmbre, reinitialiserStatuts } from "./statuts";

let desarmer: (() => void) | null = null;
afterEach(() => {
  desarmer?.(); desarmer = null;
  reinitialiserStatuts(); effacerResultats(); definirPrioritaire(null);
});

describe("le journal de passe", () => {
  it("N'EST PAS ARMÉ SANS LA GLOBALE DE LA SPEC", () => {
    expect((globalThis as { __attic_journal_de_passe__?: unknown }).__attic_journal_de_passe__).toBeUndefined();
    expect(armerLeJournalDePasse()).toBeNull();
    expect(armerLeJournalDePasse({ length: 0 })).toBeNull();
  });

  it("RELÈVE LES TROIS MAGASINS DANS L'ORDRE DES ÉCRITURES, et non ce qui ne change rien", () => {
    const journal: EntreeDuJournal[] = [];
    desarmer = armerLeJournalDePasse(journal);
    definirPrioritaire("b");
    poserStatut("a", "en_cours", "Étape 1/2");
    poserStatut("a", "en_cours", "Étape 1/2");
    poserResultat("a", { message: "fini", erreur: undefined });
    poserResultat("a", { message: "fini" });
    poserStatutOmbre("m::x", "m", "termine");
    poserApercu("a", 0.5);
    poserResultat("a", { message: "refait", erreur: true });
    poserResultat("a", { erreur: undefined });
    reinitialiserStatuts(["a"]);
    effacerResultats(["a"]);
    definirPrioritaire(null);

    expect(journal.map((e) => (e.magasin === "priorite" ? `${e.magasin} ${e.apres}` : `${e.magasin} ${e.id}`)))
      .toEqual(["priorite b", "statuts a", "resultats a", "statuts m::x", "statuts a", "resultats a",
        "resultats a", "statuts a", "resultats a", "priorite null"]);
    expect(journal[1]).toEqual({ magasin: "statuts", id: "a",
      avant: { statut: "attente", progressionDuNoeud: false },
      apres: { statut: "en_cours", progression: "Étape 1/2", progressionDuNoeud: false } });
    expect(journal[4]).toMatchObject({ apres: { statut: "en_cours", apercu: 0.5 } });
    expect(journal[2]).toEqual({ magasin: "resultats", id: "a", poses: { message: '"fini"' }, ajoutes: ["message"], retires: [] });
    // `message` ÉTAIT LÀ, `erreur` NON : seul le second est neuf.
    expect(journal[5]).toEqual({ magasin: "resultats", id: "a", poses: { message: '"refait"', erreur: "true" }, ajoutes: ["erreur"], retires: [] });
    expect(journal[6]).toEqual({ magasin: "resultats", id: "a", poses: {}, ajoutes: [], retires: ["erreur"] });
    expect(journal[7]).toMatchObject({ apres: { statut: "attente" } });
    expect(journal[8]).toEqual({ magasin: "resultats", id: "a", poses: {}, ajoutes: [], retires: ["message"] });
  });

  it("SE TAIT UNE FOIS DÉSARMÉ", () => {
    const journal: EntreeDuJournal[] = [];
    armerLeJournalDePasse(journal)!();
    poserStatut("a", "termine");
    poserResultat("a", { message: "x" });
    definirPrioritaire("a");
    expect(journal).toEqual([]);
  });

  it("DÉCRIT UNE VALEUR PAR SA FORME, et coupe une chaîne longue", () => {
    expect(decrire("blob:http://x/1")).toBe('"blob:http://x/1"');
    expect(decrire("a".repeat(250))).toBe(`"${"a".repeat(200)}…"`);
    expect([decrire(3.5), decrire(false), decrire(null), decrire(undefined)]).toEqual(["3.5", "false", "null", "undefined"]);
    expect(decrire([1, 2, 3])).toBe("Array(3)");
    expect(decrire(new Float32Array(4))).toBe("Float32Array(16 o)");
    expect(decrire({ z: 1, a: { b: 2 } })).toBe("{a,z}");
    expect(decrire(new Map())).toBe("Map");
  });
});
