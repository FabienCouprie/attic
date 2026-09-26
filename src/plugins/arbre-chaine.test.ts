// plugins/arbre-chaine.test.ts — Ce qu'on dessine est-il ce qu'on entend, sur toute la chaîne ?
//
// POURQUOI EN BOUCLE, ET SUR TOUT LE CATALOGUE. Fabien a parié que non. Un essai sur un arbre
// choisi ne prouverait rien : les défauts de ce genre se cachent dans les cas de bord, un silence
// en dernier, une mesure qui ne commence pas par une note, une division dans une division. Le
// catalogue en contient plusieurs centaines et se déroule en une seconde ; il n'y a donc aucune
// raison de n'en éprouver qu'un.
//
// CE QUE LA BOUCLE VÉRIFIE, du texte de l'arbre jusqu'au son rendu :
//   1. le nombre de notes vaut celui des événements qui ne sont pas des silences ;
//   2. chaque note tombe au même instant et dure aussi longtemps que son événement ;
//   3. les hauteurs tournent dans l'ordre donné, les silences n'en consommant aucune ;
//   4. LE SON RENDU DURE CE QUE DURE LA MESURE, silence final compris.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import { derouler, dureeArbre, ecrireArbre, lireArbre, type Mesure } from "../audio/arbre-rythmique";
import { catalogueArbres } from "../audio/arbres-catalogue";
import { estSequence, type Sequence } from "../audio/sequence";
import { fiches as fichesArbre } from "./arbre-rythmique";
import { fiches as fichesSequence } from "./sequence";

const rythme = fichesArbre.find((f) => f.id === "rythme-sur-hauteurs")!;
const rendu = fichesSequence.find((f) => f.id === "rendu-sequence")!;

const contexte = (entrees: unknown[], params: Record<string, string | number> = {}) => ({
  noeud: { id: "n1", data: { ficheId: "x", parametres: params } },
  runtime: null,
  entree: (i: number) => entrees[i] ?? null,
  entrees: () => entrees,
  paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
  paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
});

const TEMPO = 120;
const HAUTEURS = "60 62 64 65 67 69 71";

/** Passe un arbre dans le nœud et rend la séquence obtenue. */
async function parLeNoeud(texte: string, params: Record<string, string | number> = {}): Promise<Sequence> {
  const res = await rythme.executer(contexte([texte, HAUTEURS, null], { Tempo: TEMPO, ...params }) as any);
  expect(estSequence(res.valeurs[0]), `${texte} : la sortie doit être une séquence`).toBe(true);
  return res.valeurs[0] as unknown as Sequence;
}

describe("du dessin au son, sur tout le catalogue", () => {
  const catalogue = catalogueArbres({ emplacementsMax: 3, partsMax: 3 });

  it("LE NOMBRE DE NOTES ET LEURS INSTANTS SUIVENT L'ARBRE, sur chacun", async () => {
    for (const mesure of catalogue) {
      const texte = ecrireArbre([mesure]);
      const attendus = derouler([mesure], TEMPO).filter((e) => !e.silence);
      const seq = await parLeNoeud(texte);
      expect(seq.notes.length, texte).toBe(attendus.length);
      seq.notes.forEach((n, i) => {
        expect(n.debut, `${texte} note ${i} début`).toBeCloseTo(attendus[i].debut, 9);
        expect(n.fin - n.debut, `${texte} note ${i} durée`).toBeCloseTo(attendus[i].duree, 9);
      });
    }
  });

  it("LES HAUTEURS TOURNENT DANS L'ORDRE, un silence n'en consommant aucune", async () => {
    const attendues = HAUTEURS.split(" ").map(Number);
    for (const mesure of catalogue) {
      const texte = ecrireArbre([mesure]);
      const seq = await parLeNoeud(texte);
      seq.notes.forEach((n, i) => {
        expect(n.note, `${texte} note ${i}`).toBe(attendues[i % attendues.length]);
      });
    }
  });

  it("aucune note ne déborde de la mesure", async () => {
    for (const mesure of catalogue) {
      const texte = ecrireArbre([mesure]);
      const duree = dureeArbre([mesure], TEMPO);
      const seq = await parLeNoeud(texte);
      for (const n of seq.notes) {
        expect(n.debut, texte).toBeGreaterThanOrEqual(-1e-9);
        expect(n.fin, texte).toBeLessThanOrEqual(duree + 1e-9);
      }
    }
  });
});

describe("le son rendu dure-t-il ce que dure l'arbre", () => {
  // LE CAS QUI FAIT DOUTER : un arbre qui finit par un silence. La séquence s'arrête à sa dernière
  // NOTE, et le rendu calcule sa longueur sur elle ; le silence final n'aurait alors aucune durée.
  const CAS: [string, string][] = [
    ["quatre noires", "(4/4 (1 1 1 1))"],
    ["silence au milieu", "(4/4 (1 -2 1))"],
    ["silence en dernier", "(4/4 (1 1 1 -1))"],
    ["deux silences en dernier", "(4/4 (1 1 -1 -1))"],
    ["silence en premier", "(4/4 (-1 1 1 1))"],
    ["triolet puis silence", "(4/4 (1 (1 (1 1 1)) 1 -1))"],
    ["deux mesures, silence final", "((4/4 (1 1 1 1)) (4/4 (1 1 1 -1)))"],
  ];

  for (const [nom, texte] of CAS) {
    it(`« ${nom} » : le son dure autant que la mesure`, async () => {
      const mesures: Mesure[] = lireArbre(texte);
      const attendue = dureeArbre(mesures, TEMPO);
      const seq = await parLeNoeud(texte);
      const res = await rendu.executer(contexte([seq], { Synthèse: "fm", Timbre: "pur" }) as any);
      const audio = res.valeurs[0] as AudioBuffer;
      expect(audio, nom).toBeInstanceOf(AudioBuffer);
      expect(audio.duration, `${nom} : ${texte}`).toBeCloseTo(attendue, 3);
    });
  }
});
