// plugins/sampler-multizones.test.ts — Les quatre réglages qui rendent un arrangement tenable.
//
// POURQUOI ILS SONT SUR CE NŒUD et pas ailleurs : le mélangeur d'Attic n'a AUCUN réglage par piste,
// son propre résumé le dit. Équilibrer quatre instruments demandait donc quatre amplificateurs et
// quatre spatialisations — huit nœuds pour ce qui tient en deux curseurs. La plage de touches, elle,
// permet de partager un même MIDI entre deux banques sans toucher au fichier.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";
import { writeMidi } from "midi-file";
import { fiches } from "./clavier-banque";
import { banqueDepuisRendus, type Banque, type Zone } from "../audio/clavier-banque";

const fiche = fiches.find((f) => f.id === "sampler-multizones")!;
const SR = 22050;
const TPM = 480;

/** Un échantillon audible et constant : sa crête dit tout ce qu'on veut mesurer ici. */
const bloc = (longueur = 4410): AudioBuffer => {
  const a = new AudioBuffer({ numberOfChannels: 1, length: longueur, sampleRate: SR });
  a.getChannelData(0).fill(0.5);
  return a;
};

/** Un MIDI d'une note par temps, sur le canal 1. Les vélocités sont réglables note à note. */
function midi(notes: number[], velocites?: number[]): File {
  const evts: any[] = [{ deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500000 }];
  notes.forEach((note, i) => {
    const velocity = velocites?.[i] ?? 100;
    evts.push({ deltaTime: 0, type: "noteOn", noteNumber: note, velocity, channel: 0 });
    evts.push({ deltaTime: TPM, type: "noteOff", noteNumber: note, velocity: 0, channel: 0 });
  });
  evts.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  const octets = new Uint8Array(writeMidi({
    header: { format: 0, numTracks: 1, ticksPerBeat: TPM }, tracks: [evts],
  } as any));
  return new File([octets as BlobPart], "part.mid", { type: "audio/midi" });
}

/** Une banque de hauteurs à deux zones, couvrant tout le clavier. */
const banquePitch = (): Banque =>
  banqueDepuisRendus([48, 72], [bloc(), bloc()], { largeur: 12, noteBasse: 21, noteHaute: 108 });

/** Une banque à trois couches sur une même plage de touches. */
const banqueCouches = (): Banque => {
  const zones: Zone[] = [
    { racine: 60, basse: 48, haute: 72, audio: bloc(), velBasse: 1, velHaute: 42 },
    { racine: 60, basse: 48, haute: 72, audio: bloc(), velBasse: 43, velHaute: 85 },
    { racine: 60, basse: 48, haute: 72, audio: bloc(), velBasse: 86, velHaute: 127 },
  ];
  return { zones, racineSource: 60, largeur: 12, noteBasse: 48, noteHaute: 72, couches: 3 };
};

/** Un kit : deux sons, deux touches, rien ailleurs. */
const banqueKit = (): Banque => {
  const zones: Zone[] = [
    { racine: 36, basse: 36, haute: 36, audio: bloc(), suitLaTouche: false },
    { racine: 38, basse: 38, haute: 38, audio: bloc(), suitLaTouche: false },
  ];
  return { zones, racineSource: 36, largeur: 0, noteBasse: 36, noteHaute: 38, kit: true };
};

function contexte(midiFile: unknown, banque: Banque | null, params: Record<string, number> = {}) {
  return {
    noeud: { id: "n1", data: { ficheId: "sampler-multizones", parametres: params } },
    runtime: null,
    entree: (i: number) => (i === 0 ? midiFile : banque),
    entrees: () => [midiFile, banque],
    paramTexte: (nom: string, defaut: string) => String((params as any)[nom] ?? defaut),
    paramNombre: (nom: string, defaut: number) => Number((params as any)[nom] ?? defaut),
  };
}

const crete = (a: AudioBuffer, canal: number) => {
  let m = 0;
  for (const v of a.getChannelData(canal)) m = Math.max(m, Math.abs(v));
  return m;
};

describe("Sampler multi-zones", () => {
  it("joue ce qu'on lui donne, sans réglage", async () => {
    const res = await fiche.executer(contexte(midi([48, 60, 72]), banquePitch()) as any);
    const audio = res.valeurs[0] as AudioBuffer;
    expect(audio).toBeInstanceOf(AudioBuffer);
    expect(res.message).toContain("3 notes");
  });

  describe("la plage de touches", () => {
    it("IGNORE les notes en dehors, et les compte", async () => {
      const res = await fiche.executer(contexte(midi([36, 48, 60, 72, 96]), banquePitch(),
        { "Note basse": 48, "Note haute": 72 }) as any);
      expect(res.message).toContain("3 notes");
      expect(res.message).toContain("2 hors plage");
    });

    it("permet de partager un MIDI entre deux banques : les deux moitiés sont complémentaires", async () => {
      const notes = [36, 40, 48, 60, 72, 84];
      const bas = await fiche.executer(contexte(midi(notes), banquePitch(), { "Note haute": 59 }) as any);
      const haut = await fiche.executer(contexte(midi(notes), banquePitch(), { "Note basse": 60 }) as any);
      expect(bas.message).toContain("3 notes");
      expect(haut.message).toContain("3 notes");
      // Aucune note n'est jouée deux fois, aucune n'est perdue.
      expect(bas.message).toContain("3 hors plage");
      expect(haut.message).toContain("3 hors plage");
    });

    it("le dit clairement quand la plage ne laisse rien passer, au lieu de rendre du silence", async () => {
      const res = await fiche.executer(contexte(midi([48, 60]), banquePitch(),
        { "Note basse": 100, "Note haute": 110 }) as any);
      expect(res.valeurs[0]).toBeNull();
      expect(res.message).toContain("Aucune note dans la plage");
    });

    it("borne une plage écrite à l'envers plutôt que de tout refuser", async () => {
      const res = await fiche.executer(contexte(midi([60]), banquePitch(),
        { "Note basse": 72, "Note haute": 48 }) as any);
      // Note haute est remontée à Note basse : la plage devient une seule touche, 72.
      expect(res.valeurs[0]).toBeNull();
      expect(res.message).toContain("72");
    });
  });

  describe("la transposition", () => {
    it("décale les notes et l'annonce", async () => {
      const res = await fiche.executer(contexte(midi([60]), banquePitch(), { "Transposition": 12 }) as any);
      expect(res.message).toContain("+12");
    });

    it("s'applique APRÈS la plage de touches : c'est la note écrite qu'on borne", async () => {
      // La note 60 est dans la plage 48–72 ; transposée de +24 elle en sortirait, et doit quand même
      // être jouée — sinon un réglage de plage écrit sur la partition dépendrait de la transposition.
      const res = await fiche.executer(contexte(midi([60]), banquePitch(),
        { "Note basse": 48, "Note haute": 72, "Transposition": 24 }) as any);
      expect(res.message).toContain("1 notes");
      expect(res.message).not.toContain("hors plage");
    });

    it("ne sort jamais de l'étendue MIDI, même poussée aux bornes", async () => {
      const grave = await fiche.executer(contexte(midi([2]), banquePitch(), { "Transposition": -24 }) as any);
      const aigu = await fiche.executer(contexte(midi([125]), banquePitch(), { "Transposition": 24 }) as any);
      expect(grave.valeurs[0]).toBeInstanceOf(AudioBuffer);
      expect(aigu.valeurs[0]).toBeInstanceOf(AudioBuffer);
    });
  });

  describe("le panoramique", () => {
    it("place la partie à gauche ou à droite", async () => {
      const gauche = await fiche.executer(contexte(midi([60]), banquePitch(), { "Panoramique": -100 }) as any);
      const a = gauche.valeurs[0] as AudioBuffer;
      expect(crete(a, 0)).toBeGreaterThan(0.1);
      expect(crete(a, 1)).toBeLessThan(1e-6);
      const droite = await fiche.executer(contexte(midi([60]), banquePitch(), { "Panoramique": 100 }) as any);
      const b = droite.valeurs[0] as AudioBuffer;
      expect(crete(b, 0)).toBeLessThan(1e-6);
      expect(crete(b, 1)).toBeGreaterThan(0.1);
    });

    it("ne touche à rien au centre : le réglage par défaut n'a aucun effet", async () => {
      const centre = await fiche.executer(contexte(midi([60]), banquePitch()) as any);
      const decale = await fiche.executer(contexte(midi([60]), banquePitch(), { "Panoramique": 0 }) as any);
      const a = centre.valeurs[0] as AudioBuffer, b = decale.valeurs[0] as AudioBuffer;
      expect(crete(a, 0)).toBeCloseTo(crete(b, 0), 6);
      expect(crete(a, 0)).toBeCloseTo(crete(a, 1), 6);
    });
  });

  describe("avec un kit", () => {
    it("COMPTE les notes sans son au lieu de les faire passer pour jouées", async () => {
      const res = await fiche.executer(contexte(midi([36, 37, 38, 60]), banqueKit()) as any);
      expect(res.message).toContain("2 sans son dans le kit"); // 37 et 60 n'existent pas
      expect(res.message).toContain("écart max 0");
    });

    it("et n'annonce aucun écart de rééchantillonnage, puisqu'un kit ne transpose rien", async () => {
      const res = await fiche.executer(contexte(midi([36, 38]), banqueKit()) as any);
      expect(res.message).toContain("écart max 0");
      expect(res.message).not.toContain("sans son");
    });
  });

  it("réclame ce qui manque plutôt que de rendre du vide", async () => {
    expect((await fiche.executer(contexte(null, banquePitch()) as any)).valeurs[0]).toBeNull();
    const sansBanque = await fiche.executer(contexte(midi([60]), null) as any);
    expect(sansBanque.valeurs[0]).toBeNull();
    expect(sansBanque.message).toBeTruthy();
  });
});

describe("avec une banque à couches", () => {
  it("DIT combien de couches ont été touchées : un MIDI plat n'en réveille qu'une", async () => {
    const plat = await fiche.executer(contexte(midi([60, 62, 64]), banqueCouches()) as any);
    expect(plat.message).toContain("1 couches touchées sur 3");
    const nuance = await fiche.executer(contexte(midi([60, 62, 64], [20, 60, 110]), banqueCouches()) as any);
    expect(nuance.message).toContain("3 couches touchées sur 3");
  });

  it("ne parle pas de couches quand la banque n'en a pas", async () => {
    const res = await fiche.executer(contexte(midi([60]), banquePitch()) as any);
    expect(res.message).not.toContain("couches");
  });
});
