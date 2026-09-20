// plugins/clavier-sfz.test.ts — Le nœud de bout en bout, sans disque ni carte son.
//
// La lecture du format est éprouvée ailleurs (`audio/sfz.test.ts`, aller-retour compris avec notre
// exportateur). Ce qui se joue ici est le CÂBLAGE, et c'est là que les fautes se cachent : quelle
// source le nœud choisit, ce qu'il rend quand rien n'a été joué, ce qu'il dit quand des échantillons
// manquent, et s'il dépose bien sa banque pour que le clavier de sa vue ait quelque chose à jouer.
//
// NI ELECTRON NI DÉCODEUR RÉEL : `lireFichierAudio` et `decodeAudioData` sont remplacés par des
// doubles qui font circuler le CHEMIN au lieu des octets — ce qui suffit à vérifier que le bon
// fichier est demandé pour la bonne région, et garde le test instantané.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it, vi } from "vitest";
import { fiches, decodeurElectron } from "./clavier-sfz";
import { banqueVive, oublierBanque } from "../audio/banques-vives";
import { banqueDepuisRendus, type Banque } from "../audio/clavier-banque";

const fiche = fiches.find((f) => f.id === "clavier-sfz")!;
const SR = 22050;

const echantillon = (longueur = 2048) =>
  new AudioBuffer({ numberOfChannels: 1, length: longueur, sampleRate: SR });

const SFZ = `
<global> ampeg_release=0.4
<region> sample=zone-057.wav lokey=55 hikey=59 pitch_keycenter=57 loop_mode=loop_sustain loop_start=1000 loop_end=1900
<region> sample=zone-062.wav lokey=60 hikey=64 pitch_keycenter=62
`;

/**
 * Le monde extérieur, en double : un `.sfz` à un chemin, des WAV à côté.
 *
 * `lireFichierAudio` rend une URL qui est le chemin lui-même, `fetch` en fait des octets, et le
 * décodeur factice retrouve l'échantillon par ce chemin. Les fichiers absents de `presents` ne se
 * décodent pas, ce qui reproduit exactement le cas d'une banque incomplète.
 */
function installerMonde(presents: string[], texte = SFZ) {
  const api = {
    lireTexte: vi.fn(async (chemin: string) => (chemin.endsWith(".sfz") ? texte : null)),
    lireFichierAudio: vi.fn(async (chemin: string) => ({ url: chemin })),
  };
  (globalThis as any).window = { api };
  (globalThis as any).fetch = vi.fn(async (url: string) => ({
    arrayBuffer: async () => new TextEncoder().encode(url).buffer,
  }));
  const runtime = {
    decodeAudioData: vi.fn(async (ab: ArrayBuffer) => {
      const chemin = new TextDecoder().decode(ab);
      if (!presents.some((p) => chemin.endsWith(p))) throw new Error(`absent : ${chemin}`);
      return echantillon();
    }),
  };
  return { api, runtime };
}

function contexte(o: {
  runtime: unknown; id?: string; chemin?: string | undefined; notes?: unknown[];
  entree?: Banque | null; params?: Record<string, string | number>;
}) {
  const params = o.params ?? {};
  return {
    noeud: { id: o.id ?? "n1", data: { sfzChemin: o.chemin, sequenceNotes: o.notes } },
    runtime: o.runtime,
    entree: () => o.entree ?? null,
    entrees: () => (o.entree ? [o.entree] : []),
    paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
    paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
  };
}

const NOTES = [
  { note: 57, velocite: 100, debut: 0, fin: 0.4 },
  { note: 62, velocite: 90, debut: 0.4, fin: 0.8 },
];

describe("le nœud Clavier SFZ", () => {
  it("lit un fichier, rend l'audio joué, son MIDI, et repasse la banque", async () => {
    const { runtime, api } = installerMonde(["zone-057.wav", "zone-062.wav"]);
    const res = await fiche.executer(contexte({
      runtime, chemin: "E:/sons/piano/banque.sfz", notes: NOTES,
    }) as any);
    // Les échantillons ont bien été cherchés À CÔTÉ du .sfz, et non à la racine.
    expect(api.lireFichierAudio.mock.calls.map((c) => c[0]))
      .toEqual(["E:/sons/piano/zone-057.wav", "E:/sons/piano/zone-062.wav"]);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect((res.valeurs[1] as File).type).toBe("audio/midi");
    // `TypeValeur`, l'union du cœur, ne connaît pas la banque : elle circule sur les arêtes comme
    // valeur de domaine, et le cœur la transporte sans la nommer. D'où le passage par `unknown`.
    const banque = res.valeurs[2] as unknown as Banque;
    expect(banque.zones.length).toBe(2);
    expect(banque.noteBasse).toBe(55);
    expect(banque.noteHaute).toBe(64);
    // Le message dit ce qu'il a lu — zones, largeur — et le relâchement déclaré par le fichier.
    expect(res.message).toContain("2 zones");
    expect(res.message).toContain("400 ms");
    expect(res.message).toContain("2 notes");
  });

  it("dépose la banque pour que le clavier de la vue ait quelque chose à jouer", async () => {
    oublierBanque("n7");
    const { runtime } = installerMonde(["zone-057.wav", "zone-062.wav"]);
    await fiche.executer(contexte({ runtime, id: "n7", chemin: "E:/s/b.sfz" }) as any);
    expect(banqueVive("n7")?.banque.zones.length).toBe(2);
    // Et le nom du fichier suit la banque : la vue n'a plus a deviner d'ou elle vient.
    expect(banqueVive("n7")?.nom).toBe("b.sfz");
  });

  it("rend la banque même si rien n'a été joué, et le dit", async () => {
    const { runtime } = installerMonde(["zone-057.wav", "zone-062.wav"]);
    const res = await fiche.executer(contexte({ runtime, chemin: "E:/s/b.sfz", notes: [] }) as any);
    expect(res.valeurs[0]).toBeNull();
    expect(res.valeurs[1]).toBeNull();
    expect((res.valeurs[2] as unknown as Banque).zones.length).toBe(2);
    expect(res.message).toContain("rien de joué");
  });

  it("COMPTE les échantillons introuvables plutôt que de jouer une banque trouée en silence", async () => {
    const { runtime } = installerMonde(["zone-057.wav"]);
    const res = await fiche.executer(contexte({ runtime, chemin: "E:/s/b.sfz", notes: NOTES }) as any);
    expect((res.valeurs[2] as unknown as Banque).zones.length).toBe(1);
    expect(res.message).toContain("1 échantillon(s) manquant(s)");
  });

  it("refuse clairement quand il n'y a ni fichier ni banque", async () => {
    const { runtime } = installerMonde([]);
    const res = await fiche.executer(contexte({ runtime, chemin: undefined }) as any);
    expect(res.valeurs).toEqual([null, null, null]);
    expect(res.message).toContain("📂");
  });

  it("dit que le fichier est illisible quand il n'est pas là", async () => {
    const { runtime } = installerMonde([]);
    const res = await fiche.executer(contexte({ runtime, chemin: "E:/s/absent.txt" }) as any);
    expect(res.message).toContain("illisible");
  });

  it("ne rend aucune zone jouable, et le dit, quand tous les échantillons manquent", async () => {
    const { runtime } = installerMonde([]);
    const res = await fiche.executer(contexte({ runtime, chemin: "E:/s/b.sfz" }) as any);
    expect(res.valeurs[2]).toBeNull();
    expect(res.message).toContain("Aucune zone jouable");
  });

  describe("le choix de la source", () => {
    const entrante = (): Banque => banqueDepuisRendus(
      [60, 72], [echantillon(), echantillon()], { largeur: 2, noteBasse: 21, noteHaute: 108 },
    );

    it("prend la banque du graphe quand elle est branchée, sans toucher au disque", async () => {
      const { runtime, api } = installerMonde(["zone-057.wav", "zone-062.wav"]);
      const res = await fiche.executer(contexte({
        runtime, chemin: "E:/s/b.sfz", entree: entrante(), notes: NOTES,
      }) as any);
      expect(api.lireTexte).not.toHaveBeenCalled();
      expect((res.valeurs[2] as unknown as Banque).zones.length).toBe(2);
      expect(res.message).toContain("banque du graphe");
    });

    it("mais lit le fichier si on le lui demande, banque branchée ou non", async () => {
      const { runtime, api } = installerMonde(["zone-057.wav", "zone-062.wav"]);
      const res = await fiche.executer(contexte({
        runtime, chemin: "E:/s/b.sfz", entree: entrante(), notes: NOTES,
        params: { Source: "fichier" },
      }) as any);
      expect(api.lireTexte).toHaveBeenCalled();
      expect(res.message).toContain("2 zones");
    });

    it("et réclame une banque quand on impose l'entrée sans rien y brancher", async () => {
      const { runtime } = installerMonde([]);
      const res = await fiche.executer(contexte({
        runtime, chemin: "E:/s/b.sfz", params: { Source: "entree" },
      }) as any);
      expect(res.valeurs).toEqual([null, null, null]);
    });
  });

  it("son décodeur rend null sur un fichier illisible, au lieu de faire échouer tout le chargement", async () => {
    const { runtime, api } = installerMonde(["zone-057.wav"]);
    const decoder = decodeurElectron(api, runtime as any);
    expect(await decoder("E:/s/zone-057.wav")).toBeInstanceOf(AudioBuffer);
    expect(await decoder("E:/s/inconnu.wav")).toBeNull();
  });
});
