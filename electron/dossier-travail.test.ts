// electron/dossier-travail.test.ts — Le dossier de travail n'est jamais dans le programme.
//
// RELEVÉ PAR FABIEN : « par défaut le work se trouve à l'intérieur du programme, ce qui le range
// dans une installation classique dans Program Files -> attic -> work. Cela ne correspond pas aux
// conventions windows. » L'installeur est `perMachine`, donc une installation classique va bien
// dans C:\Program Files\Attic.
//
// ET LE REPLI NE SUFFISAIT PAS À RATTRAPER LA CONVENTION. Pour un utilisateur standard, créer le
// dossier dans Program Files lève, et l'on se rabattait sur `userData` : le résultat était correct
// par accident. Mais que l'application tourne UNE FOIS en élevé, et l'écriture réussit — il y a dès
// lors deux dossiers de travail selon le contexte d'élévation, sans que rien ne le dise.
//
// POURQUOI CE CAS LIT LA SOURCE. Ce chemin se décide dans le processus principal d'Electron, qui ne
// se monte pas sous Vitest : `app.getPath` n'existe qu'une fois l'application lancée. Ce qui se
// vérifie ici est donc la FORME de la décision, et elle suffit — le défaut était un chemin dérivé
// de l'emplacement de l'exécutable, et c'est cette dérivation que l'on interdit.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = readFileSync(resolve(__dirname, "main.cjs"), "utf8");

/**
 * Le corps du gestionnaire qui rend le dossier de travail, COMMENTAIRES RETIRÉS.
 *
 * Sans ce retrait, le garde se trompait sur son propre sujet : le commentaire qui explique pourquoi
 * `accessSync` n'est pas employé contient le mot `accessSync`, et l'interdiction tombait dessus.
 */
function gestionnaire(): string {
  const debut = SOURCE.indexOf('ipcMain.handle("dossier:travail-defaut"');
  expect(debut, "le gestionnaire du dossier de travail a disparu").toBeGreaterThan(-1);
  const fin = SOURCE.indexOf("ipcMain.handle(", debut + 20);
  const corps = SOURCE.slice(debut, fin > debut ? fin : undefined);
  return corps.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
}

describe("le dossier de travail par défaut", () => {
  it("NE DÉRIVE PAS DE L'EMPLACEMENT DE L'EXÉCUTABLE, qui est Program Files en installation classique", () => {
    const corps = gestionnaire();
    // `__dirname` reste permis pour le cas du DÉVELOPPEMENT, où le dossier du projet est le bon
    // endroit ; c'est `getPath("exe")` qui désigne le programme installé.
    expect(corps, "le dossier de travail ne doit pas se déduire de getPath(\"exe\")")
      .not.toMatch(/getPath\(\s*["']exe["']\s*\)/);
  });

  it("EST SOUS « Documents » EN VERSION PACKAGÉE, où la personne peut le trouver", () => {
    // Le contenu lui appartient : des graphes exportés, des sorties de script. `%APPDATA%` est fait
    // pour l'état qu'on ne doit pas avoir à chercher, et ne convient donc pas au premier choix.
    const corps = gestionnaire();
    expect(corps, "le premier candidat packagé doit être sous Documents")
      .toMatch(/getPath\(\s*["']documents["']\s*\)/);
  });

  it("ET GARDE UN REPLI, un « Documents » redirigé pouvant n'être pas inscriptible", () => {
    const corps = gestionnaire();
    expect(corps).toMatch(/getPath\(\s*["']userData["']\s*\)/);
  });

  it("SONDE L'ÉCRITURE POUR DE VRAI, `accessSync` ne consultant pas les ACL sous Windows", () => {
    // Ce garde-ci ne protège pas le choix du dossier mais la façon de le valider : un dossier
    // pré-existant passait `accessSync(W_OK)` alors que toute écriture échouait ensuite.
    const corps = gestionnaire();
    expect(corps, "la validation doit écrire un témoin, non interroger les droits")
      .toMatch(/writeFileSync/);
    expect(corps).not.toMatch(/accessSync/);
  });
});
