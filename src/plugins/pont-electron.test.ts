// plugins/pont-electron.test.ts — Reconnaître un canal absent, et ne rien reconnaître d'autre.
//
// CE QUE CE TEST TIENT. Un message en clair ne vaut que s'il est juste : montrer « redémarrez
// l'application » à qui vient de voir son modèle manquer, ou son moteur échouer, serait pire que le
// message brut, parce qu'il enverrait chercher la panne où elle n'est pas.
//
// La reconnaissance exige donc les DEUX morceaux ensemble, la phrase d'Electron et le nom du canal,
// et les cas ci-dessous tiennent les deux moitiés de cette exigence : ce qui doit être reconnu, et
// ce qui ne doit pas l'être.
import { describe, expect, it } from "vitest";
import { canalAbsent, texteErreur } from "./pont-electron";

const RELEVE = "Error invoking remote method 'muscriptor:transcrire': "
  + "Error: No handler registered for 'muscriptor:transcrire'";

describe("reconnaître un canal absent du processus principal", () => {
  it("reconnaît le message relevé dans l'application", () => {
    expect(canalAbsent(RELEVE, "muscriptor:transcrire")).toBe(true);
  });

  it("NE RECONNAÎT PAS UN AUTRE CANAL, même avec la même phrase", () => {
    expect(canalAbsent(RELEVE, "acestep:rendre")).toBe(false);
  });

  it("reconnaît les trois canaux qui s'en servent, chacun sur son propre message", () => {
    // Les trois nœuds qui appellent le processus principal passent par cette règle. Un canal qui
    // ne serait reconnu que par hasard, parce qu'il est le préfixe d'un autre, ne le serait pas ici.
    for (const canal of ["muscriptor:transcrire", "acestep:planifier", "acestep:rendre"]) {
      expect(canalAbsent(`Error invoking remote method '${canal}': `
        + `Error: No handler registered for '${canal}'`, canal), canal).toBe(true);
    }
    // Et « acestep:planifier » ne se reconnaît pas dans le message de « acestep:rendre ».
    expect(canalAbsent("No handler registered for 'acestep:rendre'", "acestep:planifier")).toBe(false);
  });

  it("NE RECONNAÎT PAS UNE AUTRE PANNE DU MÊME CANAL", () => {
    expect(canalAbsent("Error invoking remote method 'muscriptor:transcrire': "
      + "Error: Modèle absent : public/audiocpp/muscriptor-small-f32.gguf", "muscriptor:transcrire")).toBe(false);
    expect(canalAbsent("spawn audiocpp_cli.exe ENOENT", "muscriptor:transcrire")).toBe(false);
    expect(canalAbsent("", "muscriptor:transcrire")).toBe(false);
  });

  it("exige les deux morceaux, et pas seulement l'un d'eux", () => {
    expect(canalAbsent("No handler registered for 'autre:canal'", "muscriptor:transcrire")).toBe(false);
    expect(canalAbsent("muscriptor:transcrire a échoué", "muscriptor:transcrire")).toBe(false);
  });
});

describe("lire le texte d'une erreur, quelle qu'en soit la forme", () => {
  it("lit une Error", () => {
    expect(texteErreur(new Error("tombée"))).toBe("tombée");
  });

  it("lit une chaîne, qu'un canal IPC peut rendre telle quelle", () => {
    expect(texteErreur("tombée")).toBe("tombée");
  });

  it("lit un objet qui porte un message, et ne rend jamais « undefined » tout court", () => {
    expect(texteErreur({ message: "tombée" })).toBe("tombée");
    expect(texteErreur(null)).toBe("null");
    expect(texteErreur(undefined)).toBe("undefined");
  });
});
