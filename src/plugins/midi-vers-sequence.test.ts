// plugins/midi-vers-sequence.test.ts — La porte d'entrée du flux de notes, et ce qui la traverse.
//
// POURQUOI CE TEST EXISTE. Le flux « séquence » savait naître d'un calcul spectral et finir en son.
// Il ne savait pas naître de ce que le reste du catalogue produit, c'est-à-dire des fichiers MIDI :
// aucun des quatre cents composants ne pouvait l'alimenter. Une fonction reprise d'ailleurs restait
// donc isolée, ce que l'évaluation d'OpenMusic désignait comme le défaut à éviter.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";
import { writeMidi } from "midi-file";
import { fiches } from "./midi-vers-sequence";
import { estSequence } from "../audio/sequence";

const fiche = fiches.find((f) => f.id === "midi-vers-sequence")!;
const TPM = 480;

/** Un fichier MIDI dont on choisit les notes, leur canal et le tempo. */
function midi(notes: { note: number; canal: number }[], bpm = 120): File {
  const tempo: any[] = [
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: Math.round(60_000_000 / bpm) },
    { deltaTime: 0, meta: true, type: "endOfTrack" },
  ];
  const piste: any[] = [];
  for (const n of notes) {
    piste.push({ deltaTime: 0, type: "noteOn", noteNumber: n.note, velocity: 90, channel: n.canal });
    piste.push({ deltaTime: TPM, type: "noteOff", noteNumber: n.note, velocity: 0, channel: n.canal });
  }
  piste.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  const octets = new Uint8Array(writeMidi({
    header: { format: 1, numTracks: 2, ticksPerBeat: TPM }, tracks: [tempo, piste],
  } as any));
  return new File([octets as BlobPart], "essai.mid", { type: "audio/midi" });
}

const contexte = (entrees: unknown[], params: Record<string, string | number> = {}) => ({
  noeud: { id: "n1", data: { ficheId: "midi-vers-sequence", parametres: params } },
  runtime: null,
  entree: (i: number) => entrees[i] ?? null,
  entrees: () => entrees,
  paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
  paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
});

describe("MIDI vers séquence", () => {
  it("REND UNE SÉQUENCE QUE LE FLUX RECONNAÎT", async () => {
    const res = await fiche.executer(contexte([midi([{ note: 60, canal: 0 }, { note: 64, canal: 0 }])]) as any);
    expect(estSequence(res.valeurs[0]), "la sortie doit passer le contrôle de forme du flux").toBe(true);
    const s = res.valeurs[0] as any;
    expect(s.notes.map((n: any) => n.note)).toEqual([60, 64]);
    expect(s.tempo).toBe(120);
  });

  it("LE TEMPO DU FICHIER L'EMPORTE SUR LE RÉGLAGE", async () => {
    // Le réglage n'est qu'un défaut pour les fichiers muets ; celui du fichier a été écrit par qui
    // a produit la pièce, et c'est lui qui donnera les bonnes valeurs de note à la gravure.
    const res = await fiche.executer(contexte([midi([{ note: 60, canal: 0 }], 90)], { Tempo: 200 }) as any);
    expect((res.valeurs[0] as any).tempo).toBe(90);
  });

  it("le canal filtre, et moins un prend tout", async () => {
    const f = midi([{ note: 60, canal: 0 }, { note: 67, canal: 3 }]);
    const tout = await fiche.executer(contexte([f]) as any);
    expect((tout.valeurs[0] as any).notes.length).toBe(2);
    const seul = await fiche.executer(contexte([f], { Canal: 3 }) as any);
    expect((seul.valeurs[0] as any).notes.map((n: any) => n.note)).toEqual([67]);
  });

  it("DIT QUEL CANAL EST VIDE au lieu de rendre une séquence sans note", async () => {
    // Une séquence vide se propagerait jusqu'au rendu, qui dirait seulement « séquence vide » :
    // la cause, un numéro de canal qui n'existe pas dans ce fichier, se chercherait longtemps.
    const res = await fiche.executer(contexte([midi([{ note: 60, canal: 0 }])], { Canal: 7 }) as any);
    expect(res.valeurs[0]).toBe(null);
    expect(res.message).toContain("7");
  });

  it("laisse passer le MIDI reçu, pour ne pas couper une chaîne existante", async () => {
    const f = midi([{ note: 60, canal: 0 }]);
    const res = await fiche.executer(contexte([f]) as any);
    expect(res.valeurs[1]).toBe(f);
  });

  it("refuse ce qui n'est pas un fichier, sans faire semblant", async () => {
    const res = await fiche.executer(contexte(["pas un fichier"]) as any);
    expect(res.valeurs[0]).toBe(null);
  });
});
