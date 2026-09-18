// ui/infobulle-fiche.test.ts — Le contenu de l'infobulle du catalogue, et son placement.
//
// Le survol n'avait que l'attribut `title` : lent à paraître, sans mise en forme, et
// incapable de montrer les ports — ce qu'on cherche justement en parcourant le
// catalogue. Ces tests tiennent les deux moitiés de ce qui remplace `title` : ce qui est
// montré (dans la bonne langue) et où le panneau se pose (dans la fenêtre).
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { contenuInfobulle, positionInfobulle } from "./infobulle-fiche";
import { toutesLesFiches } from "../plugins/index";
import type { FicheAudio } from "../audio/types-domaine";

const TYPES = {
  couleurFlux: (type: string) => ({ audio: "#2a9d8f", midi: "#e9a13b" }[type] ?? "#999"),
  libelleType: (type: string) => ({ audio: "Audio", midi: "MIDI", controle: "Control" }[type] ?? type),
};

const FICHE = {
  nom: "Boîte à rythmes", nomEn: "Drum Machine",
  resume: "Génère une piste rythmique.", resumeEn: "Generates a drum pattern.",
  entrees: [{ nom: "Tempo", nomEn: "Tempo", type: "controle" }],
  sorties: [
    { nom: "Audio", nomEn: "Audio", type: "audio" },
    { nom: "MIDI batterie", nomEn: "MIDI drums", type: "midi" },
  ],
} as unknown as FicheAudio;

describe("contenu de l'infobulle", () => {
  it("donne le nom, le résumé et les deux listes de ports", () => {
    const c = contenuInfobulle(FICHE, "fr", TYPES);
    expect(c.nom).toBe("Boîte à rythmes");
    expect(c.resume).toBe("Génère une piste rythmique.");
    expect(c.entrees.map((p) => p.nom)).toEqual(["Tempo"]);
    expect(c.sorties.map((p) => p.nom)).toEqual(["Audio", "MIDI batterie"]);
  });

  it("suit la langue, jusque dans le nom des ports", () => {
    const c = contenuInfobulle(FICHE, "en", TYPES);
    expect(c.nom).toBe("Drum Machine");
    expect(c.resume).toBe("Generates a drum pattern.");
    expect(c.sorties.map((p) => p.nom)).toEqual(["Audio", "MIDI drums"]);
    expect(c.entrees[0].libelleType).toBe("Control");
  });

  it("habille chaque port de la couleur de son flux", () => {
    const c = contenuInfobulle(FICHE, "fr", TYPES);
    expect(c.sorties.map((p) => p.couleur)).toEqual(["#2a9d8f", "#e9a13b"]);
    expect(c.entrees[0].couleur).toBe("#999"); // type sans couleur déclarée
  });

  it("accepte une fiche sans port : un générateur n'a pas d'entrée", () => {
    const c = contenuInfobulle({ nom: "Bruit", resume: "…" } as unknown as FicheAudio, "fr", TYPES);
    expect(c.entrees).toEqual([]);
    expect(c.sorties).toEqual([]);
  });

  it("sur le registre réel, chaque fiche donne un contenu affichable", () => {
    for (const f of toutesLesFiches as unknown as FicheAudio[]) {
      const c = contenuInfobulle(f, "en", TYPES);
      expect(c.nom, f.id).toBeTruthy();
      expect(c.resume, f.id).toBeTruthy();
      for (const p of [...c.entrees, ...c.sorties]) {
        expect(p.nom, `${f.id} — un port sans nom`).toBeTruthy();
        expect(p.libelleType, `${f.id} — un port sans type`).toBeTruthy();
      }
    }
  });
});

describe("placement du panneau", () => {
  const cible = { left: 10, top: 300, right: 250, bottom: 320 };
  const panneau = { largeur: 300, hauteur: 160 };
  const fenetre = { largeur: 1280, hauteur: 800 };

  it("se pose à droite de l'entrée, aligné sur son haut", () => {
    expect(positionInfobulle(cible, panneau, fenetre)).toEqual({ left: 258, top: 300 });
  });

  it("remonte plutôt que de sortir par le bas", () => {
    const bas = { ...cible, top: 760, bottom: 780 };
    const { top } = positionInfobulle(bas, panneau, fenetre);
    expect(top + panneau.hauteur).toBeLessThanOrEqual(fenetre.hauteur - 8);
    expect(top).toBe(632);
  });

  it("bascule à gauche quand la fenêtre est trop étroite à droite", () => {
    const etroite = { largeur: 560, hauteur: 800 };
    const large = { left: 200, top: 100, right: 440, bottom: 120 };
    const { left } = positionInfobulle(large, panneau, etroite);
    // À gauche de l'entrée : 200 (son bord gauche) − 8 (marge) − 300 (largeur) = −108…
    // impossible, donc le panneau se colle au bord droit de la fenêtre : 560 − 8 − 300.
    expect(left).toBe(252);
    expect(left + panneau.largeur).toBeLessThanOrEqual(etroite.largeur);
  });

  it("reste dans la fenêtre même quand le panneau est plus grand qu'elle", () => {
    const minuscule = { largeur: 320, hauteur: 120 };
    const p = positionInfobulle(cible, panneau, minuscule);
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.top).toBeGreaterThanOrEqual(8);
  });
});
