// audio/kit-niveaux.test.ts — Le kit de percussions est-il d'aplomb, et connaît-il ce qu'on lui offre ?
//
// CE QUI ÉTAIT DE TRAVERS. Les voix du kit étaient réglées chacune pour elle-même, et le résultat
// allait de un à huit. Relevé dans l'application, sur une frappe seule au volume maximal : la
// cymbale crash montait à 2,123 et le charley ouvert à 2,087, quand le clap ne faisait que 0,250 et
// la grosse caisse 0,786. Tout ce qui passe un s'écrête à la lecture ; et ce qui est huit fois trop
// bas oblige à monter le volume, ce qui écrête le reste. Après réglage, les onze voix sortent entre
// 0,786 et 0,801.
//
// POURQUOI CES MESURES NE SONT PAS REJOUÉES ICI, et il faut le dire plutôt que de faire semblant.
// Le polyfill Web Audio de Node ne rend pas `MetalSynth` comme un navigateur : la même frappe de
// charley ouvert y sort à 1,5 × 10⁸ au lieu de 0,8, et la crash à 4 × 10⁷. Un contrôle de niveau
// écrit ici ne mesurerait donc pas ce que l'application produit, et le faire passer demanderait des
// bornes si larges qu'il ne dirait plus rien. Les chiffres ci-dessus viennent du rendu réel, dans
// l'application ; ce fichier tient ce qui se vérifie sans rendre du son.
import { describe, expect, it } from "vitest";

import { PERCUSSIONS_CHOIX } from "./batterie-midi";
import { declenchementsPour } from "./percussions-placement";
import { NIVEAUX_PERCUSSION } from "./tone-synths";

describe("les niveaux du kit", () => {
  it("CHAQUE VOIX PORTE LE SIEN : une voix sans niveau sortirait au hasard de son réglage", () => {
    for (const [nom, niveau] of Object.entries(NIVEAUX_PERCUSSION)) {
      expect(Number.isFinite(niveau), nom).toBe(true);
      expect(niveau, nom).toBeGreaterThan(0);
    }
    expect(Object.keys(NIVEAUX_PERCUSSION).length).toBeGreaterThanOrEqual(11);
  });

  it("aucun facteur n'est absurde : un zéro rendrait la voix muette, un grand nombre la ferait saturer", () => {
    for (const [nom, niveau] of Object.entries(NIVEAUX_PERCUSSION)) {
      expect(niveau, nom).toBeGreaterThan(0.05);
      expect(niveau, nom).toBeLessThan(10);
    }
  });

  it("LES DEUX MOITIÉS DE LA CAISSE CLAIRE GARDENT LEUR DOSAGE : même facteur sur le corps et le bruit", () => {
    // Elles sont jouées ensemble sur la note 38. Deux facteurs différents ne changeraient pas le
    // niveau de la caisse claire, ils changeraient sa sonorité.
    expect(NIVEAUX_PERCUSSION.snare).toBe(NIVEAUX_PERCUSSION.snareNoise);
  });
});

describe("les percussions que le placement ne connaissait pas", () => {
  // TROIS CHOIX SUR HUIT SE JOUAIENT EN GROSSE CAISSE dans « Rythme euclidien » : le tom basse, la
  // cloche et les claves n'étaient pas dans la table, et le repli renvoie la grosse caisse pour tout
  // ce qu'elle ignore. Le MIDI, lui, était juste : le défaut ne s'entendait que sur la sortie audio.
  const voixDe = (note: number) => declenchementsPour(note).map((d) => d.voix).join("+");

  it("LE TOM BASSE, LA CLOCHE ET LES CLAVES ONT CHACUN LEUR VOIX", () => {
    const kick = voixDe(36);
    for (const note of [41, 56, 75]) expect(voixDe(note), String(note)).not.toBe(kick);
    expect(voixDe(56)).not.toBe(voixDe(75));
  });

  it("le tom basse emprunte la voix des toms, un cran plus bas", () => {
    expect(voixDe(41)).toBe(voixDe(45));
    expect(declenchementsPour(41)[0].hauteur).not.toBe(declenchementsPour(45)[0].hauteur);
  });

  it("toute voix nommée par le placement a son niveau, et réciproquement", () => {
    // Une voix jouée sans entrée dans la table des niveaux ne serait pas rendue du tout : le rendu
    // écarte ce qu'il ne trouve pas. Le contrôle se fait sur les deux sens pour qu'un ajout d'un
    // côté sans l'autre se voie.
    const jouees = new Set<string>();
    for (let note = 35; note <= 81; note++) for (const d of declenchementsPour(note)) jouees.add(d.voix);
    for (const voix of jouees) expect(NIVEAUX_PERCUSSION, voix).toHaveProperty(voix);
    for (const voix of Object.keys(NIVEAUX_PERCUSSION)) expect([...jouees], voix).toContain(voix);
  });

  it("TOUT CE QUE LE CATALOGUE OFFRE AU CHOIX EST DANS LA TABLE, et rien n'y retombe sur le repli", async () => {
    // Le contrôle porte sur les listes réellement présentées : celle du rythme euclidien et celle
    // que partagent les autres composants. Une percussion offerte mais absente de la table se
    // jouerait en grosse caisse sans que rien ne le dise.
    // LA FICHE SE CHERCHE DANS LE REGISTRE ENTIER, et non dans le fichier qui la portait : elle a
    // changé de fichier au découpage des générateurs, et ce test s'est cassé pour cette seule
    // raison. Passer par la liste complète le rend insensible à un regroupement futur.
    const { toutesLesFiches } = await import("../plugins");
    const euclidien = toutesLesFiches.find((f) => f.id === "rythme-euclidien")!;
    const offertes = new Set<number>([
      ...PERCUSSIONS_CHOIX.map((p) => p.note),
      ...(euclidien.parametres.find((p) => p.nom === "Percussion")?.optionIds ?? []).map(Number),
    ]);
    expect(offertes.size).toBeGreaterThan(8);
    const kick = voixDe(36);
    for (const note of offertes) {
      if (note === 36) continue;
      expect(voixDe(note), `note ${note} offerte au choix`).not.toBe(kick);
    }
  });
});
