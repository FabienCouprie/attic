// plugins/instrument-defaut.test.ts — Sur quel instrument démarre un nœud qui joue du MIDI.
//
// POURQUOI CE TEST EXISTE. La question a été tranchée deux fois de suite, dans les deux sens, et
// c'est pour cela qu'elle mérite d'être écrite quelque part plutôt que d'être redécouverte.
//
// CE QUI A ÉTÉ ESSAYÉ, PUIS ÉCARTÉ. Démarrer sur le piano, programme 0. L'argument était la
// prévisibilité : un fichier qui déclare le programme 127 sort une détonation sans que rien ne
// l'annonce. L'objection l'a emporté : un fichier multi-instruments sortirait alors entièrement au
// piano, ce qui trahit la pièce plus gravement qu'un timbre surprenant n'égare son auditeur.
//
// CE QUI EST RETENU. « Suivre le MIDI », la valeur moins un, qui honore les changements de
// programme et de banque inscrits dans le fichier. Un fichier sans changement de programme donne de
// toute façon le programme 0, donc le piano : le suivi ne coûte rien au cas simple et rend le cas
// orchestré.
import { describe, expect, it } from "vitest";
import { toutesLesFiches } from ".";

/** Les nœuds qui reçoivent un fichier MIDI et le font sonner. */
const LECTEURS_MIDI = ["sortie-midi", "lecteur-midi", "point-ecoute-midi", "capture-midi"];

describe("l'instrument par défaut des nœuds qui jouent du MIDI", () => {
  for (const id of LECTEURS_MIDI) {
    it(`« ${id} » suit le MIDI, pour rendre une pièce telle qu'elle est écrite`, () => {
      const fiche = toutesLesFiches.find((f) => f.id === id);
      expect(fiche, `le nœud ${id} doit exister`).toBeDefined();
      const p = fiche!.parametres.find((x) => x.nom === "Instrument");
      expect(p, `le nœud ${id} doit avoir un réglage Instrument`).toBeDefined();
      expect(p!.defaut, "moins un est « Suivre le MIDI » ; zéro serait le piano imposé").toBe(-1);
      expect(String(p!.doc)).toContain("Suivre le MIDI");
    });
  }

  it("LE TEMPÉRAMENT REND SA SÉQUENCE, et cesse d'être un cul-de-sac", () => {
    // Il calculait des hauteurs fractionnaires, les rendait en son, et les jetait : l'intonation
    // juste ne pouvait ni s'enchaîner ni se graver. La sortie est posée APRÈS les deux autres, de
    // sorte que les arêtes enregistrées, qui visent les ports zéro et un, ne bougent pas.
    const fiche = toutesLesFiches.find((f) => f.id === "temperament")!;
    expect(fiche.sorties.map((s) => s.type)).toEqual(["audio", "texte", "sequence"]);
    expect(fiche.sorties[2].nom).toBe("Séquence");
  });

  it("LE RENDU DE SÉQUENCE N'OFFRE PAS DE SUIVI, n'ayant aucun fichier à suivre", () => {
    // Le cas est différent et se règle autrement : ce nœud reçoit une séquence de notes, jamais un
    // fichier. Un réglage qui proposerait d'en suivre les changements de programme décrirait un
    // comportement sans objet, qui se résoudrait silencieusement au programme 0.
    const fiche = toutesLesFiches.find((f) => f.id === "rendu-sequence")!;
    const p = fiche.parametres.find((x) => x.nom === "Instrument")!;
    expect(p.defaut).toBe(0);
    expect(String(p.doc)).not.toContain("Suivre le MIDI");
  });
});
