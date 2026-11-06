// audio/ia.test.ts — Le découpage du séparateur MDX-Net, éprouvé sans modèle.
//
// LE DÉFAUT QUE CE FICHIER TIENT, relevé au banc le 2026-11-06. La sortie « Voix » montait à 3 948
// de crête sur le son d'essai, et sur une chanson à +38,5 dB dans le premier quart de seconde puis
// à +25,6 dB à 5,5 s, la première jonction de segments. La synthèse divisait par la somme des
// fenêtres au carré, qui tend vers zéro aux bords d'un segment dont les trames ne débordent pas : un
// spectre que le modèle rend inexact y était multiplié par des milliers.
//
// UNE SESSION FACTICE tient la place du modèle et rend le spectre qu'on lui donne, intact ou
// altéré. Intact, la voix doit être le mélange lui-même, bords et jonction compris ; altéré, l'erreur
// ne doit nulle part dépasser de beaucoup sa valeur efficace. Le mélange dure plus qu'un segment,
// pour qu'une jonction soit éprouvée.
import { describe, expect, it } from "vitest";
import type { InferenceSession } from "onnxruntime-web";
import { separerAvecSession } from "./ia";

const SR = 44100;
const LONGUEUR = 300_000;

/** Deux canaux déterministes, et non nuls dès le premier échantillon. */
function melange(): Float32Array[] {
  return [440, 587].map((f, c) => {
    const x = new Float32Array(LONGUEUR);
    for (let i = 0; i < LONGUEUR; i++) x[i] = 0.4 * Math.sin((2 * Math.PI * f * i) / SR + 0.3 * c) + 0.1;
    return x;
  });
}

function sessionFactice(alterer?: (spectre: Float32Array) => void): InferenceSession {
  return {
    inputNames: ["entree"],
    outputNames: ["sortie"],
    async run(feeds: Record<string, { data: Float32Array; dims: readonly number[] }>) {
      const spectre = new Float32Array(feeds.entree.data);
      alterer?.(spectre);
      return { sortie: { data: spectre, dims: feeds.entree.dims } };
    },
  } as unknown as InferenceSession;
}

describe("le découpage du séparateur MDX-Net", () => {
  it("UN MODÈLE QUI REND SON ENTRÉE REND LE MÉLANGE, du premier échantillon au dernier", async () => {
    const mix = melange();
    const r = await separerAvecSession({ canaux: mix }, sessionFactice());
    let ecart = 0;
    let ou = 0;
    for (let c = 0; c < 2; c++) {
      for (let i = 0; i < LONGUEUR; i++) {
        const e = Math.abs(r.voix![c][i] - mix[c][i]);
        if (e > ecart) { ecart = e; ou = i; }
      }
    }
    expect(ecart, `écart de ${ecart} à l'échantillon ${ou}`).toBeLessThan(1e-4);
  });

  // LA COMPARAISON EST ENTRE LES BORDS ET LE CŒUR, et non avec une borne absolue : l'erreur d'un
  // spectre altéré a sa propre forme, qui fait des crêtes au cœur aussi. Ce qui ne doit pas arriver,
  // c'est qu'elle soit plus forte là où un segment commence ou finit.
  it("UN SPECTRE INEXACT NE S'AMPLIFIE NI AUX BORDS NI À LA JONCTION", async () => {
    const mix = melange();
    const r = await separerAvecSession({ canaux: mix }, sessionFactice((s) => {
      for (let k = 0; k < s.length; k++) s[k] += Math.cos(k * 0.61);
    }));
    // Le premier segment rend ses 257 024 premiers échantillons : la jonction est là.
    const JONCTION = 257_024;
    const ZONE = 8192;
    const auBord = (i: number) => i < ZONE || Math.abs(i - JONCTION) < ZONE;
    let creteBords = 0;
    let creteCoeur = 0;
    let ou = 0;
    for (let i = 0; i < LONGUEUR; i++) {
      const e = Math.abs(r.voix![0][i] - mix[0][i]);
      if (auBord(i)) { if (e > creteBords) { creteBords = e; ou = i; } }
      else if (e > creteCoeur) creteCoeur = e;
    }
    expect(creteCoeur, "l'altération doit se voir, sans quoi ce cas ne prouve rien").toBeGreaterThan(1e-3);
    expect(creteBords, `crête ${creteBords} à l'échantillon ${ou}, contre ${creteCoeur} au cœur`)
      .toBeLessThan(2 * creteCoeur);
  });
});
