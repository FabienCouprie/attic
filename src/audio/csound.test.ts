// audio/csound.test.ts — Ce qui se teste sans Csound : le texte qu'on lui donne.
//
// Le rendu lui-même demande un navigateur et WebAssembly, et il est vérifié dans
// l'application. Ce qui se teste ici est tout aussi important : le CSD produit doit être
// syntaxiquement complet, la partition doit dire les bonnes notes, les messages de Csound
// doivent être filtrés pour qu'une erreur ressorte du bavardage, et la limitation doit
// ramener sous l'unité sans changer les rapports de niveau.
import { describe, expect, it } from "vitest";
import {
  NOM_SORTIE, construireCsd, limiter, messagesUtiles, nomDuContenu, orchestreLit,
  partitionDepuisNotes, premiereErreur, sourcePartition, substituerNom, texteBranche,
} from "./csound";
import {
  OPCODES, opcode, opcodeDe, orchestreInstrument, orchestreSpectral, tablesInstrument, tablesSpectral,
} from "./csound-opcodes";

const ORCHESTRE = "instr 1\n  out oscili(p5, p4)\nendin";

describe("assemblage du CSD", () => {
  it("écrit les quatre sections dans l'ordre", () => {
    const csd = construireCsd({ orchestre: ORCHESTRE, partition: "i1 0 1 440 0.5" });
    const ordre = ["<CsoundSynthesizer>", "<CsOptions>", "<CsInstruments>", "<CsScore>"];
    let position = -1;
    for (const balise of ordre) {
      const trouve = csd.indexOf(balise);
      expect(trouve, balise).toBeGreaterThan(position);
      position = trouve;
    }
    expect(csd.trimEnd().endsWith("</CsoundSynthesizer>")).toBe(true);
  });

  it("dirige la sortie vers le fichier que le module relira", () => {
    expect(construireCsd({ orchestre: ORCHESTRE, partition: "i1 0 1" })).toContain("-o sortie.wav");
  });

  it("ferme la partition par « e », sans la doubler", () => {
    const sans = construireCsd({ orchestre: ORCHESTRE, partition: "i1 0 1" });
    expect(sans.match(/^e$/gm)?.length).toBe(1);
    const avec = construireCsd({ orchestre: ORCHESTRE, partition: "i1 0 1\ne" });
    expect(avec.match(/^e$/gm)?.length).toBe(1);
  });

  it("n'écrit pas sr : le portage l'impose, et l'annoncer serait mentir", () => {
    expect(construireCsd({ orchestre: ORCHESTRE, partition: "i1 0 1" })).not.toMatch(/^sr\s*=/m);
  });

  it("fixe le plein niveau à un, comme le reste d'Attic", () => {
    expect(construireCsd({ orchestre: ORCHESTRE, partition: "i1 0 1" })).toContain("0dbfs = 1");
  });

  it("n'écrit la graine que si on la demande", () => {
    expect(construireCsd({ orchestre: ORCHESTRE, partition: "i1 0 1" })).not.toContain("seed");
    expect(construireCsd({ orchestre: ORCHESTRE, partition: "i1 0 1", graine: 7 })).toContain("seed 7");
  });

  it("borne le nombre de canaux et la taille de bloc", () => {
    const csd = construireCsd({ orchestre: ORCHESTRE, partition: "i1 0 1", nchnls: 9, ksmps: 0 });
    expect(csd).toContain("nchnls = 2");
    expect(csd).toContain("ksmps = 1");
  });

  it("ajoute les options demandées sans perdre les siennes", () => {
    const csd = construireCsd({ orchestre: ORCHESTRE, partition: "i1 0 1", options: ["--omacro:X=1"] });
    expect(csd).toContain("-o sortie.wav");
    expect(csd).toContain("--omacro:X=1");
  });
});

describe("partition depuis des notes", () => {
  const notes = [
    { note: 69, velocite: 127, debut: 0, fin: 1 },
    { note: 60, velocite: 64, debut: 0.5, fin: 1.5 },
  ];

  it("écrit la FRÉQUENCE en p4, et non le numéro de note", () => {
    const lignes = partitionDepuisNotes(notes).split("\n");
    // Le la 69 vaut 440 Hz, le do 60 vaut 261,626 Hz.
    expect(lignes[0]).toContain("440.000");
    expect(lignes[1]).toContain("261.626");
  });

  it("met l'amplitude en p5, de zéro à un", () => {
    const lignes = partitionDepuisNotes(notes).split("\n");
    expect(lignes[0].split(/\s+/)[4]).toBe("1.000");
    expect(lignes[1].split(/\s+/)[4]).toBe("0.504");
  });

  it("garde le numéro de note en p6, pour qui en a besoin", () => {
    expect(partitionDepuisNotes(notes).split("\n")[0].split(/\s+/)[5]).toBe("69");
  });

  it("range les notes par instant de départ", () => {
    const desordre = [
      { note: 60, velocite: 90, debut: 2, fin: 3 },
      { note: 62, velocite: 90, debut: 0, fin: 1 },
    ];
    expect(partitionDepuisNotes(desordre).split("\n")[0]).toContain(" 0.0000 ");
  });

  it("donne une durée minimale plutôt qu'une note de durée nulle", () => {
    const zero = [{ note: 60, velocite: 90, debut: 0, fin: 0 }];
    expect(partitionDepuisNotes(zero)).toContain("0.0100");
  });

  it("emploie le numéro d'instrument demandé", () => {
    expect(partitionDepuisNotes(notes, 3).startsWith("i3 ")).toBe(true);
  });

  it("ne rend rien d'une liste vide", () => {
    expect(partitionDepuisNotes([])).toBe("");
  });
});

describe("messages de Csound", () => {
  const bavardage = [
    "--Csound version 6.18 (double samples) Jul 31 2022",
    "libsndfile-1.0.25",
    "sr = 48000.0, kr = 1500.000, ksmps = 32",
    "orch now loaded",
    "SECTION 1:",
    "ftable 1:",
    "end of score.",
    "Elapsed time at end of performance: real: 0.419s",
  ];

  it("ne garde rien d'un rendu qui s'est bien passé", () => {
    expect(messagesUtiles(bavardage).length).toBe(0);
  });

  it("garde l'erreur au milieu du bavardage", () => {
    const avec = [...bavardage, "error:  Unable to find opcode entry for 'partikkel'"];
    expect(messagesUtiles(avec).some((l) => l.includes("partikkel"))).toBe(true);
  });

  it("trouve la première erreur pour le message du nœud", () => {
    expect(premiereErreur(["tout va bien", "error: syntax error in orchestra", "error: autre"]))
      .toBe("error: syntax error in orchestra");
    expect(premiereErreur(["unknown opcode: zzz"])).toContain("unknown opcode");
    expect(premiereErreur(bavardage)).toBeNull();
  });

  it("supporte un message multiligne, comme Csound les envoie", () => {
    expect(premiereErreur(["ligne une\nerror: cannot find file\nligne trois"]))
      .toBe("error: cannot find file");
  });

  it("tronque une erreur interminable", () => {
    expect(premiereErreur([`error: ${"x".repeat(500)}`])!.length).toBeLessThanOrEqual(200);
  });

  it("ne prend pas le bilan « 0 errors in performance » pour une erreur", () => {
    // Csound finit toujours par cette ligne, qui annonce l'absence d'erreur et contient le mot.
    // Elle s'affichait comme cause de tous les rendus vides, en disant le contraire du vrai.
    expect(premiereErreur(["0 errors in performance"])).toBeNull();
    expect(premiereErreur(["end of score.", "0 errors in performance"])).toBeNull();
    // Un bilan non nul, lui, reste un signalement.
    expect(premiereErreur(["2 errors in performance"])).toBe("2 errors in performance");
  });
});

// Le système de fichiers de Csound n'écrase pas un fichier existant et n'en efface aucun :
// écrire deux sons sous le même nom laisse le premier en place, et l'orchestre relit donc
// toujours le premier son de la session. Le nom tiré du contenu est ce qui rend la chose sûre.
describe("noms de fichiers du système virtuel", () => {
  const octets = (valeurs: number[]) => Uint8Array.from(valeurs);

  it("donne deux noms différents à deux contenus différents", () => {
    expect(nomDuContenu(octets([1, 2, 3]), "entree1.wav"))
      .not.toBe(nomDuContenu(octets([1, 2, 4]), "entree1.wav"));
  });

  it("donne le même nom au même contenu, pour ne pas le réécrire", () => {
    expect(nomDuContenu(octets([9, 8, 7]), "entree1.wav"))
      .toBe(nomDuContenu(octets([9, 8, 7]), "entree1.wav"));
  });

  it("distingue deux ordres du même octet — un simple total ne suffirait pas", () => {
    expect(nomDuContenu(octets([1, 2]), "e.wav")).not.toBe(nomDuContenu(octets([2, 1]), "e.wav"));
  });

  it("garde le nom d'origine en suffixe, pour que le fichier reste lisible", () => {
    expect(nomDuContenu(octets([0]), "entree2.wav").endsWith("-entree2.wav")).toBe(true);
  });

  it("substitue le nom partout, dans l'orchestre comme dans la partition", () => {
    const csd = construireCsd({
      orchestre: `instr 1\n  a1 diskin2 "entree1.wav", 1\n  out a1\nendin`,
      partition: `f1 0 0 1 "entree1.wav" 0 0 0\ni1 0 1`,
    });
    const reecrit = substituerNom(csd, "entree1.wav", "eabcd-entree1.wav");
    expect(reecrit).not.toContain(`"entree1.wav"`);
    expect(reecrit.match(/eabcd-entree1\.wav/g)!.length).toBe(2);
  });

  it("nomme la sortie par une constante, puisqu'elle est substituée avant chaque rendu", () => {
    expect(construireCsd({ orchestre: ORCHESTRE, partition: "i1 0 1" }))
      .toContain(`-o ${NOM_SORTIE}`);
    expect(substituerNom(`-o ${NOM_SORTIE}`, NOM_SORTIE, "sortie-7.wav")).toBe("-o sortie-7.wav");
  });
});

// Le code d'un nœud Csound peut venir du champ de l'inspecteur ou d'un autre nœud du graphe, et
// la partition a une source de plus, le MIDI. La règle importe moins que le fait qu'elle soit
// DITE : on éditait un champ que le nœud ignorait sans un mot.
describe("d'où vient le code", () => {
  it("prend l'entrée branchée plutôt que le champ", () => {
    expect(texteBranche("instr 2\nendin", "instr 1\nendin"))
      .toEqual({ texte: "instr 2\nendin", provenance: "port" });
  });

  it("retombe sur le champ quand rien n'est branché, ou quand l'entrée est vide", () => {
    expect(texteBranche(null, "champ").provenance).toBe("inspecteur");
    expect(texteBranche(undefined, "champ").provenance).toBe("inspecteur");
    // Une entrée qui ne porte que des blancs n'est pas du code : ce n'est pas une intention.
    expect(texteBranche("   \n  ", "champ")).toEqual({ texte: "champ", provenance: "inspecteur" });
    // Ni un texte qui n'est pas un texte.
    expect(texteBranche(42, "champ").provenance).toBe("inspecteur");
  });

  it("donne la priorité au MIDI sur les deux autres sources", () => {
    expect(sourcePartition(37, null).source).toBe("midi");
    expect(sourcePartition(37, "i1 0 1 440 0.5").source).toBe("midi");
  });

  it("dit que la partition branchée n'a pas servi, quand le MIDI l'emporte", () => {
    expect(sourcePartition(37, "i1 0 1 440 0.5").ignoree).toBe("port");
    // Sans partition branchée, il n'y a rien à signaler : le champ n'est pas un branchement.
    expect(sourcePartition(37, null).ignoree).toBeNull();
  });

  it("prend l'entrée texte quand le MIDI est absent ou vide de notes", () => {
    expect(sourcePartition(0, "i1 0 1 440 0.5")).toEqual({ source: "port", ignoree: null });
  });

  it("retombe sur le champ quand ni MIDI ni entrée texte", () => {
    expect(sourcePartition(0, null)).toEqual({ source: "inspecteur", ignoree: null });
    expect(sourcePartition(0, "").source).toBe("inspecteur");
  });
});

// Un son branché est écrit dans le système de fichiers virtuel, et il ne s'y passe rien de plus :
// c'est l'orchestre qui décide de le lire. Le nœud rendait un son inchangé sans le dire.
describe("l'orchestre lit-il le son branché", () => {
  it("le voit dans un diskin2", () => {
    expect(orchestreLit(`instr 1\n  a1 diskin2 "entree1.wav", 1\n  out a1\nendin`, "entree1.wav"))
      .toBe(true);
  });

  it("le voit dans une table de partition, GEN01 lisant un fichier", () => {
    expect(orchestreLit(`f1 0 0 1 "entree1.wav" 0 0 0`, "entree1.wav")).toBe(true);
  });

  it("ne le voit pas quand l'orchestre ne le nomme pas", () => {
    expect(orchestreLit("instr 1\n  out oscili(0.5, 440)\nendin", "entree1.wav")).toBe(false);
  });

  it("ne compte pas un diskin2 mis en commentaire pendant un essai", () => {
    expect(orchestreLit(`instr 1\n  ; a1 diskin2 "entree1.wav", 1\n  out oscili(0.5, 440)\nendin`,
      "entree1.wav")).toBe(false);
    expect(orchestreLit(`// a1 diskin2 "entree1.wav", 1`, "entree1.wav")).toBe(false);
    expect(orchestreLit(`/* a1 diskin2 "entree1.wav", 1 */`, "entree1.wav")).toBe(false);
  });

  it("distingue le second fichier du premier", () => {
    const o = `a1 diskin2 "entree1.wav", 1`;
    expect(orchestreLit(o, "entree1.wav")).toBe(true);
    expect(orchestreLit(o, "entree2.wav")).toBe(false);
  });
});

describe("limitation", () => {
  const canal = (valeurs: number[]) => Float32Array.from(valeurs);

  it("ne touche à rien sous le seuil", () => {
    const c = canal([0.1, -0.5, 0.9]);
    expect(limiter([c])).toBeCloseTo(0.9, 6);
    // Comparaison approchée : un Float32Array arrondit 0,1 à 0,10000000149.
    [0.1, -0.5, 0.9].forEach((attendu, i) => expect(c[i]).toBeCloseTo(attendu, 6));
  });

  it("ramène sous le seuil et rend la crête d'origine", () => {
    const c = canal([2.18, -1, 0.5]);
    const crete = limiter([c]);
    expect(crete).toBeCloseTo(2.18, 5);
    let max = 0;
    for (const x of c) max = Math.max(max, Math.abs(x));
    expect(max).toBeLessThanOrEqual(0.9500001);
  });

  it("garde les rapports de niveau intacts", () => {
    const c = canal([2, 1, 0.5]);
    limiter([c]);
    expect(c[0] / c[1]).toBeCloseTo(2, 6);
    expect(c[1] / c[2]).toBeCloseTo(2, 6);
  });

  it("traite les deux canaux avec le même gain", () => {
    const g = canal([2, 0]), d = canal([0, 1]);
    limiter([g, d]);
    // Le gain vient de la crête globale : la droite doit être divisée comme la gauche.
    expect(d[1]).toBeCloseTo(0.475, 5);
  });

  it("supporte un canal vide", () => {
    expect(limiter([canal([])])).toBe(0);
  });
});

describe("bibliothèque d'opcodes", () => {
  it("ne contient que des opcodes essayés, et les décrit", () => {
    for (const o of OPCODES) {
      expect(o.id, o.id).toMatch(/^[a-z0-9]+$/);
      expect(o.fr.length, o.id).toBeGreaterThan(3);
      expect(o.en.length, o.id).toBeGreaterThan(3);
      expect(o.reglages.length, o.id).toBeGreaterThan(20);
      expect(o.gain, o.id).toBeGreaterThan(0);
    }
  });

  // `partikkel` n'est pas absent faute de marcher — il a son propre nœud, « Particules », parce
  // qu'un opcode à quarante arguments ne se règle pas par un curseur unique. Les trois autres, si.
  it("n'inclut pas partikkel, qui a son nœud, ni les opcodes à fichiers de données", () => {
    const ids = OPCODES.map((o) => o.id);
    expect(ids).not.toContain("partikkel");
    expect(ids).not.toContain("pvsmorph");
    expect(ids).not.toContain("hrtfmove2");
    expect(ids).not.toContain("lpread");
  });

  it("retombe sur le premier opcode quand on en demande un inconnu", () => {
    expect(opcode("zzz").id).toBe("wgbow");
  });

  it("reste dans la famille demandée quand l'opcode a disparu", () => {
    // Un graphe enregistré peut nommer « pvsmorph », retiré après essai. Le repli doit
    // rester spectral : donner un instrument à un nœud spectral le faisait échouer sans
    // que rien n'explique pourquoi.
    expect(opcodeDe("spectral", "pvsmorph").sorte).toBe("spectral");
    expect(opcodeDe("spectral", "zzz").sorte).toBe("spectral");
    expect(opcodeDe("instrument", "pvscross").sorte).toBe("instrument");
    // Et un opcode connu de la bonne famille est rendu tel quel.
    expect(opcodeDe("spectral", "mincer").id).toBe("mincer");
    expect(opcodeDe("instrument", "wgclar").id).toBe("wgclar");
  });

  it("écrit un instrument complet, borné, qui emploie p4 et p5", () => {
    for (const o of OPCODES.filter((x) => x.sorte === "instrument")) {
      const orc = orchestreInstrument(o, { pression: 0.5, position: 0.3, vibrato: 0.2, frequenceVibrato: 5 });
      expect(orc.startsWith("instr 1"), o.id).toBe(true);
      expect(orc.trimEnd().endsWith("endin"), o.id).toBe(true);
      expect(orc, o.id).toContain("p5");
      expect(orc, o.id).toContain("out ");
      expect(orc, o.id).toContain(o.id);
    }
  });

  it("borne les réglages extrêmes au lieu d'écrire des valeurs absurdes", () => {
    for (const o of OPCODES.filter((x) => x.sorte === "instrument")) {
      for (const extreme of [-5, 0, 1, 99]) {
        const orc = orchestreInstrument(o, {
          pression: extreme, position: extreme, vibrato: extreme, frequenceVibrato: extreme,
        });
        // Aucun nombre négatif, aucun NaN dans l'orchestre produit.
        expect(orc, `${o.id} ${extreme}`).not.toMatch(/NaN|Infinity/);
        expect(orc.match(/-\d/g), `${o.id} ${extreme}`).toBeNull();
      }
    }
  });

  it("écrit la chaîne d'analyse et de resynthèse des opcodes spectraux", () => {
    for (const o of OPCODES.filter((x) => x.sorte === "spectral" && x.id !== "mincer")) {
      const orc = orchestreSpectral(o, { morphing: 0.5, transposition: 0, fenetre: 1024 });
      expect(orc, o.id).toContain("pvsanal");
      expect(orc, o.id).toContain("pvsynth");
      expect(orc, o.id).toContain(o.id);
      expect(orc, o.id).toContain("entree1.wav");
      expect(orc, o.id).toContain("entree2.wav");
    }
  });

  it("donne à mincer un pointeur de lecture en a-rate, sans quoi il est refusé", () => {
    const orc = orchestreSpectral(opcode("mincer"), { morphing: 0.5, transposition: 7, fenetre: 1024 });
    expect(orc).toMatch(/atime\s+line/);
    expect(orc).toContain("mincer atime");
    // Sept demi-tons : un rapport de 1,4983.
    expect(orc).toContain("1.4983");
  });

  it("borne la taille de fenêtre aux valeurs admises", () => {
    const orc = orchestreSpectral(opcode("pvscross"), { morphing: 0.5, transposition: 0, fenetre: 999 });
    expect(orc).toContain("1024");
    expect(orc).toContain("256");
  });

  it("déclare les tables dont chaque opcode a besoin", () => {
    expect(tablesInstrument(opcode("wgbow"))).toContain("f1 0 16384 10 1");
    expect(tablesInstrument(opcode("fof2"))).toContain("f2");
    expect(tablesSpectral(opcode("mincer"))).toContain("entree1.wav");
    expect(tablesSpectral(opcode("pvscross"))).toBe("");
  });
});
