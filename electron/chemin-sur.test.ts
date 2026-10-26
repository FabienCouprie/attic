// electron/chemin-sur.test.ts — Ouvrir un fichier recu ne doit pas lancer un programme.
//
// CE QUE CES CAS EMPECHENT, ET LA CHAINE ETAIT COMPLETE le 2026-10-25. `fichier:ecrire` ecrit a
// n'importe quel chemin sans validation ; `fichier:ouvrir-chemin` appelait `shell.openPath`, qui
// sous Windows LANCE le fichier avec son programme associe ; et un noeud installe s'evalue par
// `new Function` dans le contexte principal de l'interface, ou `window.api` reste joignable — le
// commentaire « Sans window » y etait faux, `new Function` ne cree aucun bac a sable.
//
// « Ecrire un script puis l'ouvrir » etait donc un enchainement complet a partir d'un fichier recu.
// Ces cas gardent le dernier maillon coupe.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { EXECUTABLES, extensionDe, ouvertureAutorisee, ecritureAutorisee,
  armerJournal, inscrireChemin } = require("./chemin-sur.cjs");

describe("ce que l'ouverture refuse", () => {
  it("REFUSE CE QUI S'EXECUTE, et dit pourquoi", () => {
    for (const nom of ["x.bat", "C:/tmp/x.cmd", "/home/x.sh", "a.exe", "r.ps1", "s.vbs", "i.msi"]) {
      const v = ouvertureAutorisee(nom);
      expect(v.ok, nom).toBe(false);
      expect(v.raison, "un refus muet enverrait chercher la panne ailleurs").toMatch(/lancerait/);
    }
  });

  it("UN RACCOURCI AUSSI, parce qu'il designe une cible arbitraire", () => {
    expect(ouvertureAutorisee("piege.lnk").ok).toBe(false);
    expect(ouvertureAutorisee("piege.url").ok).toBe(false);
  });

  it("ET LES ESPACES DE FIN NE LE DEGUISENT PAS : « x.bat » et « x.bat  » sont le meme fichier", () => {
    // Sous Windows, un nom suivi d'espaces ou de points designe le meme fichier, et une extension
    // lue naivement differe. C'est le contournement le plus court qu'on puisse imaginer.
    expect(ouvertureAutorisee("x.bat ").ok).toBe(false);
    expect(ouvertureAutorisee("x.bat   ").ok).toBe(false);
    expect(ouvertureAutorisee("x.bat.").ok).toBe(false);
    expect(ouvertureAutorisee("x.bat..  ").ok).toBe(false);
  });

  it("et la casse ne le deguise pas davantage", () => {
    for (const nom of ["X.BAT", "x.Exe", "s.PS1"]) expect(ouvertureAutorisee(nom).ok, nom).toBe(false);
  });

  it("LAISSE PASSER CE QUE L'APPLICATION OUVRE VRAIMENT, mesure avant d'ecrire la regle", () => {
    // Les TROIS appelants legitimes d'`ouvrirChemin` ouvrent un `.html` genere : les vues cartes et
    // images. Une barriere qui les casserait serait une barriere qu'on retirerait.
    for (const nom of ["C:/tmp/carte.html", "/tmp/vue.html", "son.wav", "projet.json", "note.txt"]) {
      expect(ouvertureAutorisee(nom).ok, nom).toBe(true);
    }
  });

  it("un chemin vide se refuse plutot que de partir au systeme", () => {
    for (const nom of ["", "   ", null, undefined]) {
      expect(ouvertureAutorisee(nom as unknown as string).ok, String(nom)).toBe(false);
    }
  });
});

// ═══ ET L'ECRITURE, QUI EST LE PREMIER MAILLON ═══
//
// Refuser l'ouverture ne suffisait pas : un fichier hostile peut deja etre la, ou etre lance
// autrement — un raccourci depose dans le dossier de demarrage de Windows s'execute a la session
// suivante sans que personne ne l'ouvre.
describe("ce que l'ecriture refuse", () => {
  it("REFUSE DE DEPOSER UN EXECUTABLE, et dit pourquoi", () => {
    for (const nom of ["C:/Users/x/Startup/p.bat", "a.exe", "r.ps1", "s.vbs", "l.lnk", "w.hta"]) {
      const v = ecritureAutorisee(nom);
      expect(v.ok, nom).toBe(false);
      expect(v.raison).toMatch(/executable/);
    }
  });

  it("MAIS LAISSE ECRIRE UN SCRIPT D'INTERPRETEUR, et la difference est mesuree", () => {
    // `python-processor` et `julia-processor` materialisent de vrais scripts et les lancent par un
    // interpreteur declare, jamais par `shell.openPath`. Un `.py` doit donc pouvoir s'ECRIRE alors
    // qu'il ne doit pas s'OUVRIR — c'est pourquoi les deux listes ne sont pas la meme.
    for (const nom of ["travail.py", "travail.jl", "x.sh"]) {
      expect(ecritureAutorisee(nom).ok, nom).toBe(true);
      expect(ouvertureAutorisee(nom).ok, `${nom} ne doit pas s'ouvrir`).toBe(false);
    }
  });

  it("ET CE QUE L'APPLICATION ECRIT VRAIMENT PASSE : relevé sur les quinze écrivains du pont", () => {
    for (const nom of ["carte.html", "son.wav", "vue.svg", "image.png", "banque.sfz",
      "sous.srt", "film.mp4", "projet.json", "notes.txt", "piste.mid"]) {
      expect(ecritureAutorisee(nom).ok, nom).toBe(true);
    }
  });

  it("et les espaces de fin ne deguisent pas davantage une ecriture", () => {
    expect(ecritureAutorisee("p.bat  ").ok).toBe(false);
    expect(ecritureAutorisee("p.BAT.").ok).toBe(false);
    expect(ecritureAutorisee("").ok).toBe(false);
  });
});

// ═══ LE RELEVE N'EST PAS UNE BARRIERE, ET IL EST INERTE QUAND ON NE LE DEMANDE PAS ═══
describe("le journal des chemins", () => {
  it("NE S'ARME PAS SANS `ATTIC_JOURNAL_CHEMINS=1`", () => {
    // Un journal sur chaque ecriture serait un cout permanent pour une mesure ponctuelle, et une
    // ligne de plus sur le disque de quelqu'un qui ne l'a pas demandee.
    const avant = process.env.ATTIC_JOURNAL_CHEMINS;
    delete process.env.ATTIC_JOURNAL_CHEMINS;
    expect(armerJournal(tmpdir())).toBeNull();
    // Et inscrire sans journal arme ne fait rien, sans lever.
    expect(() => inscrireChemin("ecrire", "C:/x/y.wav", true)).not.toThrow();
    if (avant !== undefined) process.env.ATTIC_JOURNAL_CHEMINS = avant;
  });

  it("ET IL INSCRIT CE QU'IL VOIT, refus compris, en une ligne par evenement", () => {
    // UNE LIGNE PAR EVENEMENT, EN JSONL : un releve qui se relit en cours de route ne doit pas
    // dependre d'une fermeture propre, l'application pouvant etre tuee.
    const avant = process.env.ATTIC_JOURNAL_CHEMINS;
    const dossier = mkdtempSync(join(tmpdir(), "attic-journal-"));
    process.env.ATTIC_JOURNAL_CHEMINS = "1";
    try {
      const chemin = armerJournal(dossier);
      expect(chemin).toBeTruthy();
      inscrireChemin("ecrire", "C:/choisi/son.wav", true);
      inscrireChemin("ouvrir", "C:/piege/x.bat", false);
      const lignes = readFileSync(chemin as string, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
      // TROIS LIGNES : l'armement, puis les deux evenements. L'armement s'ecrit TOUT DE SUITE, et
      // c'est le signal observable — un premier jet ne signalait l'armement que par un
      // `console.log`, invisible sous Windows pour le processus principal d'Electron : on pouvait
      // armer le releve, ne rien voir, et conclure qu'il ne tournait pas.
      expect(lignes).toHaveLength(3);
      expect(lignes[0], "le fichier existe des l'armement, meme sans aucun evenement")
        .toMatchObject({ quoi: "arme" });
      expect(lignes[1]).toMatchObject({ quoi: "ecrire", chemin: "C:/choisi/son.wav", accepte: true });
      expect(lignes[2]).toMatchObject({ quoi: "ouvrir", accepte: false });
      expect(lignes[1].t, "l'horodatage dit quand, pour recouper avec un parcours").toBeTruthy();
    } finally {
      if (avant === undefined) delete process.env.ATTIC_JOURNAL_CHEMINS;
      else process.env.ATTIC_JOURNAL_CHEMINS = avant;
      rmSync(dossier, { recursive: true, force: true });
    }
  });
});

describe("lire une extension", () => {
  it("SE LIT APRES LE DERNIER SEPARATEUR, sinon un dossier nomme `v1.2` en fabrique une", () => {
    expect(extensionDe("C:/depot/v1.2/fichier")).toBe("");
    expect(extensionDe("C:/depot/v1.2/fichier.wav")).toBe(".wav");
    expect(extensionDe("/a/b.c/d")).toBe("");
  });

  it("et un fichier cache n'a pas d'extension pour autant", () => {
    expect(extensionDe(".gitignore")).toBe("");
    expect(extensionDe("/home/u/.bashrc")).toBe("");
  });

  it("la liste des executables porte les formes de Windows qui comptent", () => {
    for (const e of [".bat", ".cmd", ".exe", ".ps1", ".vbs", ".lnk", ".msi", ".hta"]) {
      expect(EXECUTABLES.has(e), e).toBe(true);
    }
  });
});
