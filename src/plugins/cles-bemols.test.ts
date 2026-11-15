// plugins/cles-bemols.test.ts — Une clé en bémol transpose ce que rend le nœud, et ne le rend pas en do.
//
// LE DÉFAUT QUE CE TEST EXISTE POUR EMPÊCHER, relevé le 2026-11-14 par la passe de croisement des
// nomenclatures : le réservoir musical, les multi-réservoirs, le séquenceur mélodique et le color
// looper jouaient Mi♭ et Si♭ en do. Chacun cherchait la clé dans une table qui ne connaît que les
// dièses (`["C", "C#", …]`), et l'identifiant « Eb » de `PARAMETRE_CLE` y rendait −1, ramené à 0. Ils
// lisent désormais le demi-ton par `demiTonDeCle`, la table commune des clés.
//
// LE TEST MESURE LE SON ET NON LA DEMANDE : il lit les notes du MIDI rendu, et chacune doit être
// transposée du bon nombre de demi-tons par rapport au rendu en do.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { lireMidiEnSequence } from "../audio/midi-lecture-sequence";
import { reglagesDeBase } from "../audio/croisement-reglages";
import { couleursVersNotes, type CouleurExtraite } from "../audio/palette-harmonique";
import { formesVersNotes } from "../audio/dessin-sonore";

const FICHES = ["reservoir-musical", "multi-reservoirs", "sequenceur-melodique", "color-looper"];

async function notesRendues(fiche: FicheLancable, cle: string): Promise<number[]> {
  const r = await lancerFiche(fiche, { ...reglagesDeBase(fiche), Clé: cle });
  expect(r.levee, `${fiche.id} en ${cle}`).toBeNull();
  const sorties = (fiche as unknown as { sorties: { type: string }[] }).sorties;
  const midi = r.valeurs[sorties.findIndex((s) => s.type === "midi")] as File;
  const { sequence } = await lireMidiEnSequence(midi);
  return (sequence?.notes ?? []).map((n) => n.note);
}

/** Trois couleurs à trois teintes, assez pour trois degrés différents. */
function couleurs(): CouleurExtraite[] {
  return [[0, 50], [120, 40], [240, 60]].map(([h, l], k) => ({ r: 0, g: 0, b: 0, h, s: 80, l, x: k * 10, y: 5, count: 100 }));
}

describe("la palette harmonique et le dessin sonore, que la passe ne lance pas hors du navigateur", () => {
  // Leurs fiches lisent une image par le DOM ; le calcul des notes, lui, est pur, et c'est là que la
  // clé se lit. Même défaut, trouvé en cherchant la table en dièses dans tout le dépôt.
  const options = { gamme: "majeur", mode: "melodie" as const, octave: 4, portee: 1, duree: 4, nbCouleurs: 3,
    modeRendu: "FM/Oscillateurs" as const, instrument: 0, volume: 0.8, tempo: 120 };
  const palette = (cle: string) => couleursVersNotes(couleurs(), { ...options, cle, ordre: "horizontal" }).map((n) => n.note);
  const dessin = (cle: string) => formesVersNotes(
    couleurs().map((couleur) => ({ couleur, x: couleur.x, y: couleur.y, area: 100, largeur: 10, hauteur: 10 })),
    { ...options, cle, tailleMin: 0 },
  ).map((n) => n.note);
  for (const [nom, rendre] of [["palette-harmonique", palette], ["dessin-sonore", dessin]] as const) {
    it(`${nom} : Mi♭ et Si♭ transposent chaque note de 3 et de 10 demi-tons`, () => {
      const enDo = rendre("C");
      expect(enDo.length).toBeGreaterThan(0);
      for (const [cle, ecart] of [["Eb", 3], ["Bb", 10]] as const) {
        expect([...new Set(rendre(cle).map((n, i) => (((n - enDo[i]) % 12) + 12) % 12))], `${nom} en ${cle}`).toEqual([ecart]);
      }
    });
  }
});

describe("une clé en bémol transpose le rendu", () => {
  for (const id of FICHES) {
    it(`${id} : Mi♭ et Si♭ transposent chaque note de 3 et de 10 demi-tons`, async () => {
      const fiche = registre.trouverDef(id) as unknown as FicheLancable;
      const enDo = await notesRendues(fiche, "C");
      expect(enDo.length).toBeGreaterThan(0);
      for (const [cle, ecart] of [["Eb", 3], ["Bb", 10]] as const) {
        const transposees = await notesRendues(fiche, cle);
        expect(transposees.length).toBe(enDo.length);
        const ecarts = new Set(transposees.map((n, i) => (((n - enDo[i]) % 12) + 12) % 12));
        expect([...ecarts], `${id} en ${cle}`).toEqual([ecart]);
      }
    }, 60_000);
  }
});
