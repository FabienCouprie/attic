// plugins/csound-partition.test.ts — Le nœud, et ce qu'il refuse de laisser passer en silence.
//
// L'écriture est éprouvée dans `audio/csound-partition.test.ts`, conventions de hauteur comprises. Ce
// qui se joue ici est le câblage, et surtout l'AVEU : un champ réglé sur « Courbe » alors qu'aucune
// courbe n'est branchée vaudrait zéro partout sans rien dire, et l'on chercherait longtemps du côté
// de l'orchestre.
import { describe, expect, it } from "vitest";
import { writeMidi } from "midi-file";
import { fiches } from "./csound-partition";
import { constante } from "../audio/courbe";

const fiche = fiches.find((f) => f.id === "partition-csound")!;
const TPM = 480;

/** Un MIDI dont on choisit les canaux : c'est ce que le nœud doit savoir répartir. */
// Le tempo est 120 — 500 000 microsecondes par noire —, donc une noire dure 0,5 s : c'est cette
// durée qu'on retrouve dans les partitions attendues ci-dessous.
function midi(notes: { note: number; canal: number; velocite?: number }[]): File {
  const tempo: any[] = [
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500000 },
    { deltaTime: 0, meta: true, type: "endOfTrack" },
  ];
  const piste: any[] = [];
  for (const n of notes) {
    piste.push({ deltaTime: 0, type: "noteOn", noteNumber: n.note, velocity: n.velocite ?? 100, channel: n.canal });
    piste.push({ deltaTime: TPM, type: "noteOff", noteNumber: n.note, velocity: 0, channel: n.canal });
  }
  piste.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  const octets = new Uint8Array(writeMidi({
    header: { format: 1, numTracks: 2, ticksPerBeat: TPM }, tracks: [tempo, piste],
  } as any));
  return new File([octets as BlobPart], "notes.mid", { type: "audio/midi" });
}

function contexte(entrees: unknown[], params: Record<string, string | number> = {}) {
  return {
    noeud: { id: "n1", data: { ficheId: "partition-csound", parametres: params } },
    runtime: null,
    entree: (i: number) => entrees[i] ?? null,
    entrees: () => entrees,
    paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
    paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
  };
}

describe("le nœud Partition Csound", () => {
  it("rend une partition et un rapport", async () => {
    const res = await fiche.executer(contexte([midi([{ note: 69, canal: 0 }])]) as any);
    const partition = res.valeurs[0] as string;
    expect(partition.split("\n")[0]).toMatch(/^i1 0\.0000 0\.5000 440\.000 /);
    expect(partition.trim().endsWith("e")).toBe(true);
    expect(res.valeurs[1]).toContain("i1 | 1 | 1");
    expect(res.message).toContain("1 événements");
    expect(res.message).toContain("cps");
  });

  it("écrit la convention demandée, et le message la nomme", async () => {
    const res = await fiche.executer(contexte([midi([{ note: 69, canal: 0 }])], { "Hauteur": "pch" }) as any);
    expect((res.valeurs[0] as string).split("\n")[0]).toContain(" 8.09 ");
    expect(res.message).toContain("pch");
  });

  it("répartit les canaux sur des instruments quand on le demande", async () => {
    const notes = [{ note: 60, canal: 0 }, { note: 64, canal: 1 }, { note: 36, canal: 9 }];
    const sans = await fiche.executer(contexte([midi(notes)]) as any);
    expect(sans.message).toContain("1 instrument(s)");
    const avec = await fiche.executer(contexte([midi(notes)], { "Un instrument par canal": "oui" }) as any);
    expect(avec.message).toContain("3 instrument(s)");
    expect(avec.valeurs[1]).toContain("i3 | 10 | 1");
  });

  it("obéit aux p-fields réglés", async () => {
    const res = await fiche.executer(contexte([midi([{ note: 69, canal: 0, velocite: 64 }])], {
      "p4": "velocite", "p5": "canal", "p6": "constante", "p7": "duree", "Constante": 3.5,
    }) as any);
    expect((res.valeurs[0] as string).split("\n")[0]).toBe("i1 0.0000 0.5000 64 1 3.5000 0.5000");
  });

  it("DIT qu'un champ attend une courbe absente, au lieu d'écrire des zéros en silence", async () => {
    const sans = await fiche.executer(contexte([midi([{ note: 69, canal: 0 }])], { "p6": "courbe" }) as any);
    expect(sans.message).toContain("courbe");
    expect((sans.valeurs[0] as string).split("\n")[0]).toContain(" 0.0000");
    // Avec la courbe branchée, plus d'alerte et la valeur y est.
    const avec = await fiche.executer(contexte(
      [midi([{ note: 69, canal: 0 }]), constante(0.4, 2, 100)], { "p6": "courbe" }) as any);
    expect(avec.message).not.toContain("aucune n'est branchée");
    expect((avec.valeurs[0] as string).split("\n")[0]).toContain("0.4000");
  });

  it("laisse sonner les queues : la marge finale s'écrit en f0", async () => {
    const res = await fiche.executer(contexte([midi([{ note: 60, canal: 0 }])], { "Marge finale": 3 }) as any);
    expect(res.valeurs[0]).toContain("f0 3.5000");
  });

  it("réclame ce qui manque plutôt que de rendre du vide", async () => {
    const sansMidi = await fiche.executer(contexte([null]) as any);
    expect(sansMidi.valeurs).toEqual([null, null]);
    expect(sansMidi.message).toBeTruthy();
    const vide = await fiche.executer(contexte([midi([])]) as any);
    expect(vide.valeurs).toEqual([null, null]);
    expect(vide.message).toContain("note");
  });
});
