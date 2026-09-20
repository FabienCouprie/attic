// audio/csound-formules.test.ts — Une formule et sa partition doivent se correspondre.
//
// CE QUI SE VÉRIFIE ICI n'est pas le son — il a été mesuré dans l'application, formule par formule —
// mais la COHÉRENCE entre les trois choses qu'une entrée porte : l'orchestre, les p-fields déclarés,
// et la partition d'essai. Les trois peuvent diverger sans que rien ne le dise : une partition qui
// appelle un instrument que l'orchestre ne définit pas ne produit aucune erreur de compilation, elle
// ne joue simplement rien.
import { describe, expect, it } from "vitest";
import { FORMULES, partitionFormule, texteFormule, trouverFormule } from "./csound-formules";

/** Les lignes de notes d'une partition, hors commentaires. */
const lignesNotes = (partition: readonly string[]) =>
  partition.map((l) => l.trim()).filter((l) => /^i\d/.test(l));

describe("la bibliothèque de formules", () => {
  it("a des identifiants uniques, tous retrouvables", () => {
    const ids = FORMULES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(trouverFormule(id)?.id).toBe(id);
    expect(trouverFormule("inconnue")).toBeUndefined();
  });

  it("chaque orchestre est COMPLET : autant d'`instr` que d'`endin`", () => {
    for (const f of FORMULES) {
      const texte = f.orchestre.join("\n");
      const debuts = (texte.match(/^instr \d+/gm) ?? []).length;
      const fins = (texte.match(/^endin$/gm) ?? []).length;
      expect(debuts, f.id).toBeGreaterThan(0);
      expect(fins, f.id).toBe(debuts);
    }
  });

  it("chaque partition n'appelle QUE des instruments que son orchestre définit", () => {
    // La faute que ce test attrape ne lève aucune erreur dans Csound : une partition qui appelle un
    // instrument absent ne joue rien, en silence.
    for (const f of FORMULES) {
      const definis = new Set((f.orchestre.join("\n").match(/^instr (\d+)/gm) ?? [])
        .map((l) => l.replace("instr ", "")));
      for (const ligne of lignesNotes(f.partition)) {
        const numero = /^i(\d+)/.exec(ligne)![1];
        expect(definis, `${f.id} : ${ligne}`).toContain(numero);
      }
    }
  });

  it("chaque note de l'instrument principal porte EXACTEMENT les p-fields déclarés", () => {
    // Trois champs de base — numéro, début, durée — puis un par champ déclaré. Un champ de moins et
    // l'orchestre lit zéro ; un de plus et personne ne le lit.
    for (const f of FORMULES) {
      const attendus = 3 + f.champs.length;
      for (const ligne of lignesNotes(f.partition)) {
        // Les instruments auxiliaires — la réverbération du bus, par exemple — n'ont pas les mêmes
        // p-fields : on ne vérifie que l'instrument 1, celui que les champs décrivent.
        if (!ligne.startsWith("i1 ")) continue;
        expect(ligne.split(/\s+/).length, `${f.id} : ${ligne}`).toBe(attendus);
      }
    }
  });

  it("chaque formule déclare ses p-fields à partir de p4, dans l'ordre", () => {
    for (const f of FORMULES) {
      expect(f.champs.length, f.id).toBeGreaterThanOrEqual(2);
      f.champs.forEach((c, i) => expect(c.champ, f.id).toBe(`p${i + 4}`));
      for (const c of f.champs) {
        expect(c.fr.length, `${f.id} ${c.champ}`).toBeGreaterThan(3);
        expect(c.en.length, `${f.id} ${c.champ}`).toBeGreaterThan(3);
      }
    }
  });

  it("le NIVEAU passe par `gkNiveau` dans chaque ligne de sortie", () => {
    for (const f of FORMULES) {
      for (const ligne of f.orchestre) {
        if (!/^\s*outs?\s/.test(ligne)) continue;
        expect(ligne, `${f.id} : ${ligne}`).toContain("gkNiveau");
      }
    }
  });

  it("écrit `out` en mono et `outs` en stéréo, jamais les deux", () => {
    for (const f of FORMULES) {
      const texte = f.orchestre.join("\n");
      const mono = (texte.match(/^\s*out\s/gm) ?? []).length;
      const stereo = (texte.match(/^\s*outs\s/gm) ?? []).length;
      if (f.canaux === 2) { expect(stereo, f.id).toBeGreaterThan(0); expect(mono, f.id).toBe(0); }
      else { expect(mono, f.id).toBeGreaterThan(0); expect(stereo, f.id).toBe(0); }
    }
  });

  it("est documentée dans les deux langues", () => {
    for (const f of FORMULES) {
      expect(f.note.length, f.id).toBeGreaterThan(40);
      expect(f.noteEn.length, f.id).toBeGreaterThan(40);
      expect(f.fr.length, f.id).toBeGreaterThan(3);
      expect(f.en.length, f.id).toBeGreaterThan(3);
    }
  });
});

describe("l'écriture de l'orchestre", () => {
  it("déclare le niveau demandé, et rappelle les p-fields en commentaire", () => {
    const texte = texteFormule(FORMULES[0], { niveau: 0.5 });
    expect(texte).toContain("gkNiveau init 0.5000");
    expect(texte).toContain("; p4 = fréquence en hertz");
    expect(texte).toContain("instr 1");
  });

  it("borne un niveau hors plage plutôt que d'écrire un orchestre qui sature", () => {
    expect(texteFormule(FORMULES[0], { niveau: 5 })).toContain("gkNiveau init 1.0000");
    expect(texteFormule(FORMULES[0], { niveau: -2 })).toContain("gkNiveau init 0.0000");
  });

  it("dit en tête si la sortie est stéréo — le nœud Csound doit être réglé pareil", () => {
    const bus = trouverFormule("reverbe-bus")!;
    expect(texteFormule(bus)).toContain("sortie stéréo");
    expect(texteFormule(FORMULES[0])).toContain("sortie mono");
  });
});

describe("la partition d'essai", () => {
  it("se termine par `e`, et son `f0` couvre la dernière note", () => {
    for (const f of FORMULES) {
      const lignes = partitionFormule(f).split("\n");
      expect(lignes[lignes.length - 1], f.id).toBe("e");
      const f0 = Number(/^f0 ([\d.]+)/.exec(lignes[lignes.length - 2])![1]);
      const finMax = Math.max(...lignesNotes(f.partition).map((l) => {
        const p = l.split(/\s+/);
        return Number(p[1]) + Number(p[2]);
      }));
      expect(f0, f.id).toBeGreaterThanOrEqual(finMax);
    }
  });

  it("garde les commentaires qui expliquent ce qu'elle démontre", () => {
    const fm = partitionFormule(trouverFormule("fm")!);
    expect(fm).toContain(";");
    expect(fm).toContain("indice");
  });

  it("le bus de réverbération lance SA réverbération avant les notes", () => {
    // Sans le `i99` en tête, la réverbération ne tourne pas et l'on n'entend que le son sec : c'est
    // la faute classique de cette structure.
    const lignes = lignesNotes(trouverFormule("reverbe-bus")!.partition);
    expect(lignes[0]).toMatch(/^i99 0 /);
    const duree = Number(lignes[0].split(/\s+/)[2]);
    const derniereNote = Math.max(...lignes.slice(1).map((l) => {
      const p = l.split(/\s+/);
      return Number(p[1]) + Number(p[2]);
    }));
    expect(duree).toBeGreaterThan(derniereNote);
  });
});
