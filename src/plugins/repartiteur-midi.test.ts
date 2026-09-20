// plugins/repartiteur-midi.test.ts — Le nœud, et ce que son message annonce.
//
// La logique de répartition est éprouvée dans `audio/repartition-midi.test.ts`. Ici on vérifie le
// CÂBLAGE et l'AVEU : cinq sorties, une partie vide qui rend `null` plutôt qu'un fichier sans notes,
// le reste qui recueille ce qu'on n'a pas assigné, et un message qui dit où est passé quoi. C'est ce
// message qui, dans un graphe à quatre samplers, distingue « cette partie n'a rien reçu » de « le
// sampler qui la joue est mal réglé » — les deux se voient pareil en écoutant.
import { describe, expect, it } from "vitest";
import { writeMidi } from "midi-file";
import { fiches, analyserListePistes } from "./repartiteur-midi";
import { compterNotes } from "../audio/repartition-midi";

const fiche = fiches.find((f) => f.id === "repartiteur-midi")!;
const TPM = 480;

function arrangement(parties: { canal: number; nom: string; notes: number[] }[], tempoBpm = 96): Uint8Array {
  const tempo: any[] = [
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: Math.round((60 / tempoBpm) * 1e6) },
    { deltaTime: 0, meta: true, type: "endOfTrack" },
  ];
  const pistes = parties.map((p) => {
    const evts: any[] = [{ deltaTime: 0, meta: true, type: "trackName", text: p.nom }];
    for (const note of p.notes) {
      evts.push({ deltaTime: 0, type: "noteOn", noteNumber: note, velocity: 90, channel: p.canal });
      evts.push({ deltaTime: TPM, type: "noteOff", noteNumber: note, velocity: 0, channel: p.canal });
    }
    evts.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
    return evts;
  });
  return new Uint8Array(writeMidi({
    header: { format: 1, numTracks: pistes.length + 1, ticksPerBeat: TPM }, tracks: [tempo, ...pistes],
  } as any));
}

const QUATRE = () => arrangement([
  { canal: 0, nom: "Mélodie", notes: [72, 74, 76, 77] },
  { canal: 1, nom: "Accords", notes: [60, 64, 67] },
  { canal: 2, nom: "Basse", notes: [36, 43] },
  { canal: 9, nom: "Batterie", notes: [36, 38, 42, 42, 36, 38] },
]);

const fichier = (bytes: Uint8Array, nom = "arrangement.mid") =>
  new File([bytes as BlobPart], nom, { type: "audio/midi" });

function contexte(entree: unknown, params: Record<string, string> = {}) {
  return {
    noeud: { id: "n1", data: { ficheId: "repartiteur-midi", parametres: params } },
    runtime: null,
    entree: () => entree,
    entrees: () => [entree],
    paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
    paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
  };
}

const octets = async (v: unknown): Promise<Uint8Array> =>
  new Uint8Array(await (v as File).arrayBuffer());

describe("le nœud Répartiteur MIDI", () => {
  it("rend cinq sorties, une par partie plus le reste", () => {
    expect(fiche.sorties.map((s) => s.nom)).toEqual(["Partie 1", "Partie 2", "Partie 3", "Batterie", "Reste"]);
  });

  it("répartit seul un arrangement à quatre canaux, batterie comprise", async () => {
    const res = await fiche.executer(contexte(fichier(QUATRE())) as any);
    const [p1, p2, p3, bat, reste] = res.valeurs;
    expect(await compterNotes(await octets(p1))).toBe(4);
    expect(await compterNotes(await octets(p2))).toBe(3);
    expect(await compterNotes(await octets(p3))).toBe(2);
    expect(await compterNotes(await octets(bat))).toBe(6);
    expect(reste).toBeNull();
    // Le message annonce l'inventaire puis la destination de chaque canal.
    expect(res.message).toContain("15 notes");
    expect(res.message).toContain("1:c1·4");
    expect(res.message).toContain("bat:c10·6");
  });

  it("ne perd aucune note : la somme des parties fait le total", async () => {
    const bytes = QUATRE();
    const res = await fiche.executer(contexte(fichier(bytes)) as any);
    let somme = 0;
    for (const v of res.valeurs) if (v) somme += compterNotes(await octets(v));
    expect(somme).toBe(compterNotes(bytes));
  });

  it("envoie au RESTE ce qui n'entre pas dans les quatre parties, et le nomme", async () => {
    const bytes = arrangement([
      { canal: 0, nom: "A", notes: [60] }, { canal: 1, nom: "B", notes: [62] },
      { canal: 2, nom: "C", notes: [64] }, { canal: 3, nom: "D", notes: [65] },
      { canal: 4, nom: "E", notes: [67] }, { canal: 9, nom: "Bat", notes: [36] },
    ]);
    const res = await fiche.executer(contexte(fichier(bytes)) as any);
    expect(res.valeurs[4]).not.toBeNull();
    expect(compterNotes(await octets(res.valeurs[4]))).toBe(2); // canaux 4 et 5
    expect(res.message).toContain("reste:4, 5");
  });

  it("rend NULL pour une partie vide, plutôt qu'un fichier sans notes", async () => {
    const res = await fiche.executer(contexte(fichier(arrangement([{ canal: 0, nom: "A", notes: [60] }]))) as any);
    expect(res.valeurs[0]).not.toBeNull();
    expect(res.valeurs[1]).toBeNull();
    expect(res.valeurs[2]).toBeNull();
    expect(res.valeurs[3]).toBeNull();
    expect(res.message).toContain("2:—");
  });

  it("obéit aux canaux écrits à la main, plages comprises", async () => {
    const bytes = QUATRE();
    const res = await fiche.executer(contexte(fichier(bytes), {
      "Répartition": "canaux", "Partie 1": "1-2", "Partie 2": "3", "Partie 3": "", "Batterie": "10",
    }) as any);
    expect(compterNotes(await octets(res.valeurs[0]))).toBe(7); // canaux 1 et 2 réunis
    expect(compterNotes(await octets(res.valeurs[1]))).toBe(2);
    expect(res.valeurs[2]).toBeNull();
    expect(compterNotes(await octets(res.valeurs[3]))).toBe(6);
  });

  it("découpe PAR PISTES quand les voix partagent un canal", async () => {
    const choeur = arrangement([
      { canal: 0, nom: "Soprano", notes: [72, 74] },
      { canal: 0, nom: "Alto", notes: [67, 69] },
      { canal: 0, nom: "Ténor", notes: [60, 62] },
      { canal: 0, nom: "Basse", notes: [48, 50, 52] },
    ]);
    // En mode canaux, tout tomberait dans la partie 1 : c'est le même canal.
    const parCanal = await fiche.executer(contexte(fichier(choeur), {
      "Répartition": "canaux", "Partie 1": "1", "Partie 2": "2", "Partie 3": "3", "Batterie": "10",
    }) as any);
    expect(compterNotes(await octets(parCanal.valeurs[0]))).toBe(9);
    expect(parCanal.valeurs[1]).toBeNull();
    // En mode pistes, chaque voix a sa sortie.
    const parPiste = await fiche.executer(contexte(fichier(choeur), {
      "Répartition": "pistes", "Partie 1": "2", "Partie 2": "3", "Partie 3": "4", "Batterie": "5",
    }) as any);
    expect(compterNotes(await octets(parPiste.valeurs[0]))).toBe(2);
    expect(compterNotes(await octets(parPiste.valeurs[1]))).toBe(2);
    expect(compterNotes(await octets(parPiste.valeurs[2]))).toBe(2);
    expect(compterNotes(await octets(parPiste.valeurs[3]))).toBe(3);
  });

  it("dit ce qui manque plutôt que de rendre du vide", async () => {
    const sans = await fiche.executer(contexte(null) as any);
    expect(sans.valeurs).toEqual([null, null, null, null, null]);
    expect(sans.message).toBeTruthy();
    const muet = await fiche.executer(contexte(fichier(arrangement([{ canal: 0, nom: "A", notes: [] }]))) as any);
    expect(muet.valeurs).toEqual([null, null, null, null, null]);
    expect(muet.message).toContain("note");
  });

  it("nomme les fichiers de sortie d'après celui d'entrée", async () => {
    const res = await fiche.executer(contexte(fichier(QUATRE(), "morceau.mid")) as any);
    expect((res.valeurs[0] as File).name).toBe("morceau-p1.mid");
    expect((res.valeurs[3] as File).name).toBe("morceau-p4.mid");
  });

  it("lit une liste de pistes sans la borne des seize canaux", () => {
    expect(analyserListePistes("2,3")).toEqual([2, 3]);
    expect(analyserListePistes("1-4")).toEqual([1, 2, 3, 4]);
    expect(analyserListePistes("20")).toEqual([20]);
    expect(analyserListePistes("0")).toEqual([]);
    expect(analyserListePistes("")).toEqual([]);
  });
});
