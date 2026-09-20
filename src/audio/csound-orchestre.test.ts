// audio/csound-orchestre.test.ts — Ce qui fait qu'un orchestre combiné sonne, ou pas.
//
// Trois pièges, trois familles de tests. LA NUMÉROTATION : deux `instr 1` ne provoquent aucune erreur
// dans Csound — le second remplace le premier et la partition joue le mauvais son. LES TABLES : elles
// doivent passer par `ftgen`, une seule fois par table, sinon deux instruments réclament le même
// numéro. LES CANAUX : `out` et `outs` mélangés donnent un rendu à moitié muet.
//
// Ce que ces tests NE font pas : juger le son. Les hauteurs et les gains de la bibliothèque viennent
// d'une mesure dans l'application, instrument par instrument, à trois octaves — c'est écrit dans
// l'en-tête du module, avec les nombres.
import { describe, expect, it } from "vitest";
import {
  INSTRUMENTS_ORCHESTRE, analyserListeInstruments, construireOrchestre, rapportOrchestreLisible,
  trouverInstrument,
} from "./csound-orchestre";

describe("la bibliothèque", () => {
  it("n'a aucun identifiant en double, et chacun se retrouve", () => {
    const ids = INSTRUMENTS_ORCHESTRE.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(trouverInstrument(id)?.id).toBe(id);
    expect(trouverInstrument("wgbrass")).toBeUndefined(); // écarté : ne tient aucune hauteur
  });

  it("chaque entrée calcule bien `asig`, sans quoi son instrument ne sortirait rien", () => {
    for (const inst of INSTRUMENTS_ORCHESTRE) {
      expect(inst.corps.some((l) => /^\s*asig\s/.test(l)), inst.id).toBe(true);
    }
  });

  it("aucune entrée n'écrit elle-même sa sortie : c'est la composition qui décide mono ou stéréo", () => {
    for (const inst of INSTRUMENTS_ORCHESTRE) {
      for (const l of inst.corps) {
        expect(/^\s*outs?\s/.test(l), `${inst.id} : ${l}`).toBe(false);
      }
    }
  });

  it("aucune entrée ne déclare `instr` ni `endin` : la numérotation ne lui appartient pas", () => {
    for (const inst of INSTRUMENTS_ORCHESTRE) {
      const texte = inst.corps.join("\n");
      expect(texte).not.toContain("instr ");
      expect(texte).not.toContain("endin");
    }
  });

  it("chaque entrée est documentée dans les deux langues, et porte un gain mesuré", () => {
    for (const inst of INSTRUMENTS_ORCHESTRE) {
      expect(inst.note.length, inst.id).toBeGreaterThan(30);
      expect(inst.noteEn.length, inst.id).toBeGreaterThan(30);
      expect(inst.gain, inst.id).toBeGreaterThan(0);
      expect(inst.gain, inst.id).toBeLessThan(20);
    }
  });

  it("ne référence que des tables qu'elle déclare", () => {
    for (const inst of INSTRUMENTS_ORCHESTRE) {
      const texte = inst.corps.join("\n");
      for (const variable of texte.match(/gi[A-Za-z]+/g) ?? []) {
        expect((inst.tables ?? []).some((t) => t.variable === variable), `${inst.id} → ${variable}`).toBe(true);
      }
    }
  });
});

describe("la composition de l'orchestre", () => {
  it("NUMÉROTE les instruments à la suite, dans l'ordre demandé", () => {
    const { texte, rapport } = construireOrchestre(["foscil", "wgclar", "pluck"]);
    expect(texte).toContain("instr 1  ; FM (foscil)");
    expect(texte).toContain("instr 2  ; Clarinette (wgclar)");
    expect(texte).toContain("instr 3  ; Karplus-Strong (pluck)");
    expect(rapport.instruments.map((i) => [i.numero, i.id])).toEqual([[1, "foscil"], [2, "wgclar"], [3, "pluck"]]);
  });

  it("compte à partir du numéro demandé, pour s'assembler avec un autre orchestre", () => {
    const { texte } = construireOrchestre(["foscil", "pluck"], { base: 10 });
    expect(texte).toContain("instr 10");
    expect(texte).toContain("instr 11");
    expect(texte).not.toContain("instr 1 ");
  });

  it("DÉDUPLIQUE les tables : cinq instruments qui veulent un sinus se partagent la même", () => {
    const { texte, rapport } = construireOrchestre(["wgbow", "wgclar", "wgflute", "foscil", "fof2"]);
    expect(texte.match(/^giSinus ftgen/gm) ?? []).toHaveLength(1);
    // fof2 en réclame une seconde, la sigmoïde : deux DÉCLARATIONS en tout — on compte les lignes
    // qui commencent par une variable, et non les occurrences du mot, qui apparaît aussi en
    // commentaire.
    expect(texte.match(/^gi\w+ ftgen/gm) ?? []).toHaveLength(2);
    expect(rapport.tables).toHaveLength(2);
  });

  it("crée ses tables par `ftgen` avec un numéro attribué par Csound, jamais un numéro écrit", () => {
    const { texte } = construireOrchestre(["foscil"]);
    // Le premier argument de ftgen est 0 : c'est lui qui demande à Csound d'attribuer le numéro.
    expect(texte).toMatch(/giSinus ftgen 0, 0, /);
    // Et rien ne ressemble à une déclaration de table de partition.
    expect(texte).not.toMatch(/^f\d/m);
  });

  it("n'écrit aucune table quand aucun instrument n'en veut", () => {
    const { texte, rapport } = construireOrchestre(["pluck", "vco2"]);
    expect(texte).not.toContain("ftgen");
    expect(rapport.tables).toEqual([]);
  });

  it("écrit TOUT LE MONDE en mono, ou TOUT LE MONDE en stéréo", () => {
    const mono = construireOrchestre(["foscil", "pluck", "mode"]);
    expect(mono.texte.match(/^\s+out /gm) ?? []).toHaveLength(3);
    expect(mono.texte).not.toContain("outs ");
    expect(mono.rapport.canaux).toBe(1);
    const stereo = construireOrchestre(["foscil", "pluck", "mode"], { canaux: 2 });
    expect(stereo.texte.match(/^\s+outs /gm) ?? []).toHaveLength(3);
    expect(stereo.texte).not.toMatch(/^\s+out /m);
    expect(stereo.rapport.canaux).toBe(2);
  });

  it("applique le gain mesuré de chaque instrument, et le niveau global par-dessus", () => {
    const plein = construireOrchestre(["foscil"]);
    expect(plein.texte).toContain("* 1.0000");
    const moitie = construireOrchestre(["foscil"], { niveau: 0.5 });
    expect(moitie.texte).toContain("* 0.5000");
    // `mode` a le plus grand gain de la bibliothèque : il doit se retrouver tel quel.
    const cloche = construireOrchestre(["mode"]);
    expect(cloche.texte).toContain("* 5.7000");
  });

  it("donne à chaque instrument la même enveloppe, qui ne clique pas", () => {
    const { texte } = construireOrchestre(["foscil", "pluck"]);
    expect(texte.match(/aenv linseg 0, 0\.02, 1/g) ?? []).toHaveLength(2);
  });

  it("écarte un identifiant inconnu sans faire échouer le reste", () => {
    const { rapport } = construireOrchestre(["foscil", "chaise", "pluck"]);
    expect(rapport.instruments.map((i) => i.id)).toEqual(["foscil", "pluck"]);
  });

  it("rend un orchestre vide plutôt que du charabia quand rien n'est choisi", () => {
    const { texte, rapport } = construireOrchestre([]);
    expect(texte).toBe("");
    expect(rapport.instruments).toEqual([]);
  });
});

describe("la liste écrite à la main", () => {
  it("lit les virgules, les espaces et les points-virgules", () => {
    expect(analyserListeInstruments("foscil,pluck")).toEqual(["foscil", "pluck"]);
    expect(analyserListeInstruments("foscil pluck")).toEqual(["foscil", "pluck"]);
    expect(analyserListeInstruments(" foscil ; pluck ")).toEqual(["foscil", "pluck"]);
  });

  it("garde l'ORDRE, puisqu'il décide des numéros", () => {
    expect(analyserListeInstruments("pluck,foscil")).toEqual(["pluck", "foscil"]);
  });

  it("écarte les inconnus et les doublons", () => {
    expect(analyserListeInstruments("foscil,chaise,foscil,pluck")).toEqual(["foscil", "pluck"]);
    expect(analyserListeInstruments("")).toEqual([]);
  });
});

describe("le rapport, qui est un squelette de partition", () => {
  // CE QUI CHANGE TOUT : le message du nœud dit déjà « i1 wgclar, i2 mode », et il est visible sans
  // rien brancher. Un rapport qui ne ferait que le répéter ne servirait à rien. Celui-ci se COLLE
  // dans le champ Partition et se joue — d'où ces tests, qui vérifient qu'il est une partition
  // VALIDE et non un texte qui y ressemble.
  const utiles = (texte: string) =>
    texte.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith(";"));

  it("ne contient que des lignes de partition valides, hors commentaires", () => {
    const texte = rapportOrchestreLisible(construireOrchestre(["wgclar", "mode", "fof2"]).rapport);
    for (const ligne of utiles(texte)) {
      expect(ligne, ligne).toMatch(/^(i\d+ [\d.]+ [\d.]+ [\d.]+ [\d.]+|f0 [\d.]+|e)$/);
    }
  });

  it("joue chaque instrument à son tour, une seconde chacun", () => {
    const { rapport } = construireOrchestre(["wgclar", "mode", "gbuzz"]);
    const notes = utiles(rapportOrchestreLisible(rapport)).filter((l) => l.startsWith("i"));
    expect(notes).toEqual([
      "i1 0.0 1.0 440.000 0.6",
      "i2 1.0 1.0 440.000 0.6",
      "i3 2.0 1.0 440.000 0.6",
    ]);
  });

  it("respecte le contrat des p-fields : la hauteur en hertz, puis l'amplitude", () => {
    const texte = rapportOrchestreLisible(construireOrchestre(["foscil"]).rapport);
    const [, debut, duree, p4, p5] = utiles(texte)[0].split(" ");
    expect(Number(debut)).toBe(0);
    expect(Number(duree)).toBe(1);
    expect(Number(p4)).toBe(440);      // le la3, reconnaissable d'oreille
    expect(Number(p5)).toBeGreaterThan(0);
    expect(Number(p5)).toBeLessThanOrEqual(1);
  });

  it("laisse sonner la dernière queue, et se termine par `e`", () => {
    const lignes = utiles(rapportOrchestreLisible(construireOrchestre(["mode", "pluck"]).rapport));
    expect(lignes[lignes.length - 2]).toBe("f0 3.0"); // deux notes, une seconde de queue
    expect(lignes[lignes.length - 1]).toBe("e");
  });

  it("garde le numéro de départ, pour rester collable tel quel", () => {
    const texte = rapportOrchestreLisible(construireOrchestre(["foscil"], { base: 7 }).rapport);
    expect(utiles(texte)[0]).toMatch(/^i7 /);
  });

  it("dit quel réglage de canaux poser, la moitié du rendu en dépendant", () => {
    expect(rapportOrchestreLisible(construireOrchestre(["foscil"]).rapport)).toContain("Canaux");
    expect(rapportOrchestreLisible(construireOrchestre(["foscil"], { canaux: 2 }).rapport)).toContain("stéréo");
    expect(rapportOrchestreLisible(construireOrchestre(["foscil"], { canaux: 2 }).rapport, true)).toContain("stereo");
  });

  it("commente sa documentation, que Csound ignore : tout est collable d'un bloc", () => {
    const texte = rapportOrchestreLisible(construireOrchestre(["wgbow"]).rapport);
    const commentaires = texte.split("\n").filter((l) => l.startsWith(";"));
    expect(commentaires.length).toBeGreaterThan(4);
    // Le nom et la note de l'instrument y sont, mais en commentaire.
    expect(texte).toContain("; i1 — Corde frottée (wgbow)");
    expect(texte).toContain("Helmholtz");
    // Et les longues notes sont repliées : aucune ligne à rallonge.
    for (const l of texte.split("\n")) expect(l.length, l).toBeLessThan(110);
  });

  it("d'un orchestre vide, ne rend aucune note — et pas un `e` orphelin", () => {
    const texte = rapportOrchestreLisible(construireOrchestre([]).rapport);
    expect(utiles(texte)).toEqual([]);
  });
});

describe("le rapport", () => {
  it("dit quel numéro est quel instrument — sans quoi la partition est à deviner", () => {
    const { rapport } = construireOrchestre(["wgclar", "mode"], { canaux: 2 });
    const texte = rapportOrchestreLisible(rapport);
    expect(texte).toContain("2 instrument(s)");
    expect(texte).toContain("stéréo");
    expect(texte).toContain("p4 = hauteur en hertz");
    expect(texte).toContain("i1 — Clarinette (wgclar)");
    expect(texte).toContain("i2 — Résonance modale (mode)");
  });

  it("nomme les tables créées, qui expliquent les lignes en tête d'orchestre", () => {
    const texte = rapportOrchestreLisible(construireOrchestre(["fof2"]).rapport);
    expect(texte).toContain("sinus (GEN10)");
    expect(texte).toContain("sigmoïde (GEN19)");
  });
});
