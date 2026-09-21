// plugins/lotGlobal.test.ts — Ce qui décide d'un lot, et ce qui le rend reproductible.
//
// LE TEST QUI COMPTE EST CELUI DU LOT VIDE. Un dossier mal réglé, ou sans rien d'audible, ne doit
// pas rendre un graphe muet : il doit faire UNE passe, celle qui laisse le nœud de début dire ce
// qui ne va pas. Zéro passe est la faute naturelle ici — la boucle ne tourne pas, rien ne
// s'exécute, et l'utilisateur regarde un graphe éteint sans savoir pourquoi.
//
// LE SECOND : L'ORDRE. Un `readdir` ne garantit aucun ordre d'un système à l'autre. Un lot dont
// l'ordre change d'une exécution à l'autre rend tout journal incomparable et toute reprise
// impossible, alors qu'il paraît marcher parfaitement.
import { describe, expect, it } from "vitest";
import {
  EXTENSIONS_AUDIO, FICHE_LOT_DEBUT, assainirNomFichier, fichiersAudio, joindre, lotCourant,
  nomDeSortie, planifierLot, publierLot,
} from "./lotGlobal";

const noeud = (id: string, ficheId: string, dossier?: string) => ({
  id, data: { ficheId, parametres: dossier === undefined ? {} : { Dossier: dossier } },
});

const entree = (nom: string) => ({ nom, chemin: `C:\\son\\${nom}` });

describe("le tri des fichiers", () => {
  it("ne garde que l'audio, et ignore le reste sans bruit", () => {
    const retenus = fichiersAudio([
      entree("a.wav"), entree("notes.txt"), entree("b.MP3"), entree("image.png"),
      entree("c.flac"), entree("projet.attic"), entree("d.aiff"),
    ]);
    expect(retenus.map((f) => f.nom)).toEqual(["a.wav", "b.MP3", "c.flac", "d.aiff"]);
  });

  it("L'ORDRE EST CELUI DES NOMS, et non celui que le système rend", () => {
    const melange = fichiersAudio([entree("c.wav"), entree("a.wav"), entree("b.wav")]);
    expect(melange.map((f) => f.nom)).toEqual(["a.wav", "b.wav", "c.wav"]);
    // Et il ne dépend pas de l'ordre d'entrée : deux listes des mêmes fichiers donnent le même lot.
    const autre = fichiersAudio([entree("b.wav"), entree("c.wav"), entree("a.wav")]);
    expect(autre.map((f) => f.nom)).toEqual(melange.map((f) => f.nom));
  });

  it("une liste absente ou vide ne fait pas tomber la lecture", () => {
    expect(fichiersAudio(null)).toEqual([]);
    expect(fichiersAudio(undefined)).toEqual([]);
    expect(fichiersAudio([])).toEqual([]);
    expect(fichiersAudio([entree("lisezmoi.txt")])).toEqual([]);
  });

  it("les extensions sont reconnues quelle que soit la casse", () => {
    for (const ext of EXTENSIONS_AUDIO) {
      expect(fichiersAudio([entree(`x${ext.toUpperCase()}`)]), ext).toHaveLength(1);
    }
  });
});

describe("la planification d'un lot", () => {
  const trois = () => [entree("a.wav"), entree("b.wav"), entree("c.wav")].map((e) => ({ nom: e.nom, chemin: e.chemin }));

  it("sans début de boucle, il n'y a pas de lot — et cela ne doit rien coûter", () => {
    expect(planifierLot([noeud("1", "gain"), noeud("2", "sortie-audio")], trois)).toBeNull();
  });

  it("une passe par fichier, et le début qui commande est nommé", () => {
    const plan = planifierLot([noeud("d", FICHE_LOT_DEBUT, "C:\\son"), noeud("g", "gain")], trois)!;
    expect(plan.debutId).toBe("d");
    expect(plan.dossier).toBe("C:\\son");
    expect(plan.passes).toBe(3);
    expect(plan.fichiers.map((f) => f.nom)).toEqual(["a.wav", "b.wav", "c.wav"]);
    expect(plan.plusieursDebuts).toBe(false);
  });

  it("UN LOT VIDE FAIT QUAND MÊME UNE PASSE — sinon le graphe reste muet sans raison", () => {
    // Le nœud de début doit s'exécuter pour afficher ce qui ne va pas.
    for (const cas of [
      { noeuds: [noeud("d", FICHE_LOT_DEBUT, "C:\\vide")], fichiers: () => [] },
      { noeuds: [noeud("d", FICHE_LOT_DEBUT, "")], fichiers: trois },
      { noeuds: [noeud("d", FICHE_LOT_DEBUT, "   ")], fichiers: trois },
      { noeuds: [noeud("d", FICHE_LOT_DEBUT)], fichiers: trois },
    ]) {
      const plan = planifierLot(cas.noeuds, cas.fichiers)!;
      expect(plan.passes).toBe(1);
      expect(plan.fichiers).toEqual([]);
    }
  });

  it("le dossier est débarrassé de ses espaces avant d'être lu", () => {
    const vus: string[] = [];
    planifierLot([noeud("d", FICHE_LOT_DEBUT, "  C:\\son  ")], (d) => { vus.push(d); return trois(); });
    expect(vus).toEqual(["C:\\son"]);
  });

  it("deux débuts : le premier commande, et le fait est signalé", () => {
    const plan = planifierLot(
      [noeud("d1", FICHE_LOT_DEBUT, "C:\\un"), noeud("d2", FICHE_LOT_DEBUT, "C:\\deux")], trois)!;
    expect(plan.debutId).toBe("d1");
    expect(plan.plusieursDebuts).toBe(true);
  });
});

describe("les noms écrits", () => {
  it("le nom de sortie est celui de la source, son extension remplacée", () => {
    expect(nomDeSortie("piste.wav", "mp3")).toBe("piste.mp3");
    expect(nomDeSortie("piste.WAVE", "wav")).toBe("piste.wav");
    // C'est ce qui rend un lot relisible : le dossier de sortie se compare fichier à fichier.
    expect(nomDeSortie("01 - intro.flac", "wav")).toBe("01 - intro.wav");
  });

  it("un suffixe se pose avant l'extension, jamais après", () => {
    expect(nomDeSortie("piste.wav", "wav", "-traite")).toBe("piste-traite.wav");
  });

  it("un nom sans extension ne perd rien", () => {
    expect(nomDeSortie("piste", "wav")).toBe("piste.wav");
  });

  it("joindre ne double pas le séparateur, et garde celui du chemin", () => {
    expect(joindre("C:\\son", "a.wav")).toBe("C:\\son\\a.wav");
    expect(joindre("C:\\son\\", "a.wav")).toBe("C:\\son\\a.wav");
    expect(joindre("/home/son", "a.wav")).toBe("/home/son/a.wav");
    expect(joindre("/home/son/", "a.wav")).toBe("/home/son/a.wav");
  });
});

describe("LE NOM VENU DU GRAPHE EST ASSAINI AVANT DE DEVENIR UN CHEMIN", () => {
  // Ce nom n'est pas saisi par l'utilisateur : il sort d'un nœud, qui a pu être « Modifier le
  // texte » ou un modèle de langue. Il part ensuite directement dans un chemin de fichier.
  it("AUCUN SÉPARATEUR NE SURVIT — un nom ne peut pas sortir de son dossier", () => {
    // Le cas qui compte : sans cela, ce nom écrirait deux dossiers plus haut.
    expect(assainirNomFichier("..\\..\\windows\\system32\\pilote")).toBe("....windowssystem32pilote");
    expect(assainirNomFichier("../../etc/passwd")).toBe("....etcpasswd");
    expect(assainirNomFichier("sous/dossier/piste")).toBe("sousdossierpiste");
    for (const nom of ["a/b", "a\\b", "a//b", "a\\\\b"]) {
      expect(assainirNomFichier(nom), nom).not.toMatch(/[\\/]/);
    }
  });

  it("une lettre de lecteur ne passe pas non plus", () => {
    expect(assainirNomFichier("C:\\ailleurs\\piste")).toBe("Cailleurspiste");
    expect(assainirNomFichier("D:piste")).toBe("Dpiste");
  });

  it("les caractères que le système refuse sont retirés", () => {
    expect(assainirNomFichier('pi<st>e:"|?*ok')).toBe("pisteok");
    expect(assainirNomFichier("avant\u0000apres")).toBe("avantapres");
    expect(assainirNomFichier("ligne\nsuite")).toBe("lignesuite");
  });

  it("LES POINTS ET ESPACES DE FIN PARTENT, parce que Windows les retire en silence", () => {
    // Deux noms distincts se retrouveraient identiques une fois écrits, et s'écraseraient.
    expect(assainirNomFichier("piste.")).toBe("piste");
    expect(assainirNomFichier("piste   ")).toBe("piste");
    expect(assainirNomFichier("piste. . .")).toBe("piste");
  });

  it("les noms réservés aux périphériques sont écartés", () => {
    for (const reserve of ["CON", "con", "PRN", "aux", "NUL", "COM1", "lpt9"]) {
      expect(assainirNomFichier(reserve), reserve).toBe("");
    }
    // Mais un nom qui les contient sans s'y réduire reste valable.
    expect(assainirNomFichier("concert")).toBe("concert");
    expect(assainirNomFichier("nullement")).toBe("nullement");
  });

  it("rend une chaîne vide quand il ne reste rien — à l'appelant de retomber sur la source", () => {
    for (const rien of ["", "   ", "/", "\\/", "...", "?*<>", "..", "."]) {
      expect(assainirNomFichier(rien), JSON.stringify(rien)).toBe("");
    }
  });

  it("un nom ordinaire, accents compris, traverse sans être abîmé", () => {
    expect(assainirNomFichier("01 - Intro (prise 2)")).toBe("01 - Intro (prise 2)");
    expect(assainirNomFichier("été à Noël")).toBe("été à Noël");
    expect(assainirNomFichier("piste_final-v3")).toBe("piste_final-v3");
  });

  it("la longueur est bornée, le système n'acceptant pas n'importe quoi", () => {
    expect(assainirNomFichier("a".repeat(500))).toHaveLength(200);
  });

  it("et le nom assaini se combine avec l'extension et le suffixe", () => {
    expect(nomDeSortie(assainirNomFichier("../piste.wav"), "wav", "-v2")).toBe("..piste-v2.wav");
  });
});

describe("l'état ambiant", () => {
  it("se pose, se lit, et s'efface", () => {
    expect(lotCourant()).toBeNull();
    publierLot({ debutId: "d", index: 1, fichiers: [{ nom: "a.wav", chemin: "C:\\a.wav" }], journal: [], nomsEcrits: [] });
    expect(lotCourant()?.index).toBe(1);
    publierLot(null);
    expect(lotCourant()).toBeNull();
  });

  it("le journal est partagé : ce qu'une passe y écrit, la suivante le retrouve", () => {
    // C'est ainsi que la fin de boucle rend un journal complet à la dernière passe, alors que
    // chaque passe ne connaît que son propre fichier.
    const journal: string[] = [];
    publierLot({ debutId: "d", index: 0, fichiers: [], journal, nomsEcrits: [] });
    lotCourant()!.journal.push("premier");
    publierLot({ debutId: "d", index: 1, fichiers: [], journal, nomsEcrits: [] });
    lotCourant()!.journal.push("second");
    expect(journal).toEqual(["premier", "second"]);
    publierLot(null);
  });
});
