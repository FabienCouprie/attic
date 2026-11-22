// plugins/sfz-format.test.ts — Le SFZ tel que la référence le définit, lu et écrit par les nœuds.
//
// LES CAS VIENNENT DE LA RÉFÉRENCE, sfzformat.com, jamais du code : chaque attendu cite l'opcode et
// ce que sa page en dit. Ils passent tous par `executer`, avec un disque et un décodeur en double qui
// rendent un sinus par fichier, ce qui suffit à savoir quelle région joue sur quelle touche.
//
// Ce fichier est né de la revue des notations en texte (2026-11-22). Il tient ce que le relevé a
// trouvé : une région déclarée sans touche qui jouait sur toutes, une valeur illisible remplacée en
// silence par une plage de 128 touches, une redéfinition de `#define` appliquée à tout le fichier, un
// `#include` signalé dans les données mais tu dans le message, `octave_offset` laissé de côté.
import { describe, expect, it, vi } from "vitest";
import { ctxDEssai } from "../core/contexte-essai";
import { fiches as fichesBanque } from "./banque-sfz";
import { fiches as fichesClavier } from "./clavier-sfz";
import { fiches as fichesExport } from "./export-sfz";
import { fiches as fichesSequence } from "./sequence-sur-banque";
import { parametresLecture, voixPourNote, type Banque } from "../audio/clavier-banque";
import { CHEMIN_KIT_EMBARQUE, VOIX_KIT, sfzDuKit } from "../audio/kit-batterie";

const SR = 22050;
const banqueSfz = fichesBanque.find((f) => f.id === "banque-sfz")!;
const clavierSfz = fichesClavier.find((f) => f.id === "clavier-sfz")!;
const exportSfz = fichesExport.find((f) => f.id === "export-sfz")!;
const sequenceSurBanque = fichesSequence.find((f) => f.id === "sequence-sur-banque")!;

function sinus(freq: number, secondes = 1): AudioBuffer {
  const n = Math.round(secondes * SR);
  const a = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = a.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / SR);
  return a;
}

/** Le disque en double : le `.sfz` à un chemin, et un sinus par échantillon nommé. */
function monde(texte: string, sons: Record<string, AudioBuffer>) {
  const api = {
    lireTexte: vi.fn(async (c: string) => (c === "D:/b/i.sfz" ? texte : null)),
    lireFichierAudio: vi.fn(async (c: string) => ({ url: c })),
  };
  (globalThis as any).window = { api };
  (globalThis as any).fetch = vi.fn(async (url: string) => ({ arrayBuffer: async () => new TextEncoder().encode(url).buffer }));
  return {
    decodeAudioData: vi.fn(async (ab: ArrayBuffer) => {
      const s = sons[new TextDecoder().decode(ab).replace("D:/b/", "")];
      if (!s) throw new Error("absent");
      return s;
    }),
  };
}

const SONS = { "a.wav": sinus(220.5), "b.wav": sinus(330.75) };

/** Lit un texte SFZ par le nœud Banque SFZ, et rend la banque et le message. */
async function lire(texte: string): Promise<{ banque: Banque | null; message: string }> {
  const runtime = monde(texte, SONS);
  const r: any = await banqueSfz.executer(ctxDEssai([], { Source: "fichier", "Aperçu": "non", "Type de banque": "hauteurs" },
    { runtime, ficheId: "banque-sfz", data: { sfzChemin: "D:/b/i.sfz" } }) as any);
  return { banque: r.valeurs[0] ?? null, message: String(r.message) };
}

/** Les zones d'une banque lue, réduites à ce que les cas comparent. */
const zones = (b: Banque | null) => (b?.zones ?? []).map((z) => [z.basse, z.haute, z.racine]);

/** Joue des notes par Clavier SFZ, et rend l'audio. */
async function jouer(texte: string, notes: { note: number; velocite: number; debut: number; fin: number }[]) {
  const runtime = monde(texte, SONS);
  const r: any = await clavierSfz.executer(ctxDEssai([], { Source: "fichier", "Relâchement": 20 },
    { runtime, ficheId: "clavier-sfz", data: { sfzChemin: "D:/b/i.sfz", sequenceNotes: notes } }) as any);
  return r.valeurs[0] as AudioBuffer;
}

const rms = (a: AudioBuffer, t0: number, t1: number) => {
  const d = a.getChannelData(0);
  const i0 = Math.round(t0 * a.sampleRate), i1 = Math.min(d.length, Math.round(t1 * a.sampleRate));
  let s = 0;
  for (let i = i0; i < i1; i++) s += d[i] * d[i];
  return i1 > i0 ? Math.sqrt(s / (i1 - i0)) : 0;
};

const BONNE = "<region> sample=b.wav lokey=80 hikey=90 pitch_keycenter=85\n";

describe("les touches d'une région, selon la référence", () => {
  it("une région à `lokey=-1 hikey=-1` ne joue sur AUCUNE touche, et le message le dit", async () => {
    // sfzformat.com/opcodes/lokey : « SFZ 2 additionally includes the possibility to set lokey and
    // hikey to -1, to prevent a region from being triggered by any keys ».
    for (const region of ["lokey=-1 hikey=-1", "key=-1"]) {
      const { banque, message } = await lire(`${BONNE}<region> sample=a.wav ${region}`);
      expect(zones(banque), region).toEqual([[80, 90, 85]]);
      expect(message, region).toContain("#2");
    }
  });

  it("une valeur de touche illisible ou hors de 0 à 127 écarte la région, NOMMÉE", async () => {
    for (const region of ["lokey=foo hikey=72", "lokey=200 hikey=210", "key=h4", "key=g#9"]) {
      const { banque, message } = await lire(`${BONNE}<region> sample=a.wav ${region}`);
      expect(zones(banque), region).toEqual([[80, 90, 85]]);
      expect(message, region).toContain(`#2 ${region.split(" ")[0]}`);
    }
  });

  it("`lokey` au-dessus de `hikey` écarte la région, nommée, au lieu d'échanger les bornes", async () => {
    const { banque, message } = await lire(`${BONNE}<region> sample=a.wav lokey=72 hikey=60 pitch_keycenter=66`);
    expect(zones(banque)).toEqual([[80, 90, 85]]);
    expect(message).toContain("#2 lokey=72 hikey=60");
  });

  it("garde les noms de notes de la référence : c4 = 60, dièse `#`, bémol `b`, de C-1 à G9", async () => {
    const attendus: [string, number][] = [
      ["c4", 60], ["C#4", 61], ["eb4", 63], ["C-1", 0], ["g9", 127], ["Cb4", 59], ["B#3", 60],
    ];
    for (const [nom, note] of attendus) {
      const { banque } = await lire(`<region> sample=a.wav lokey=${nom} hikey=${nom} pitch_keycenter=${nom}`);
      expect(zones(banque), nom).toEqual([[note, note, note]]);
    }
  });
});

describe("les autres valeurs, selon la référence", () => {
  it("une valeur illisible ou hors plage écarte la région, nommée", async () => {
    // volume : décibels ; tune : cents ; lovel et hivel : 0 (v1) ou 1 (v2) à 127 ; amp_veltrack :
    // −100 à 100 ; loop_mode : no_loop, one_shot, loop_continuous ou loop_sustain.
    for (const opcode of ["volume=fort", "tune=abc", "hivel=200", "lovel=-5", "amp_veltrack=150", "loop_mode=boucle", "transpose=2.5"]) {
      const { banque, message } = await lire(`${BONNE}<region> sample=a.wav lokey=50 hikey=70 ${opcode}`);
      expect(zones(banque), opcode).toEqual([[80, 90, 85]]);
      expect(message, opcode).toContain(`#2 ${opcode}`);
    }
  });

  it("`amp_veltrack` NÉGATIF inverse la vélocité : à −100, la vélocité 127 se tait", async () => {
    // sfzformat.com/opcodes/amp_veltrack : « from -100 (which would make velocity 127 notes
    // silent, and low-velocity notes loud) to 100 ».
    const audio = await jouer("<region> sample=a.wav key=60 amp_veltrack=-100", [
      { note: 60, velocite: 127, debut: 0, fin: 0.3 }, { note: 60, velocite: 20, debut: 0.5, fin: 0.8 },
    ]);
    expect(rms(audio, 0.05, 0.25)).toBeLessThan(1e-6);
    // Volume 80 %, sinus de crête 0,5 : 0,8 × 0,354 = 0,283 à pleine nuance ; la vélocité 20 en
    // garde 1 − 20/127, soit 0,238.
    expect(rms(audio, 0.55, 0.75)).toBeGreaterThan(0.2);
  });

  it("`pitch` se lit comme `tune`, son alias", async () => {
    const { banque } = await lire("<region> sample=a.wav lokey=50 hikey=70 pitch_keycenter=60 pitch=-50");
    expect(banque?.zones[0].accord).toBe(-50);
  });
});

describe("le préprocesseur et l'en-tête <control>", () => {
  it("une redéfinition de `#define` vaut À PARTIR D'ELLE, et non pour tout le fichier", async () => {
    const { banque } = await lire("#define $K 60\n<region> sample=a.wav key=$K\n#define $K 72\n<region> sample=b.wav key=$K");
    expect(zones(banque)).toEqual([[60, 60, 60], [72, 72, 72]]);
  });

  it("un `#include` non suivi est DIT dans le message du nœud", async () => {
    const { message } = await lire('#include "autres.sfz"\n<region> sample=a.wav key=60');
    expect(message).toContain("autres.sfz");
  });

  it("une région sans `sample` est dite, avec son rang", async () => {
    const { banque, message } = await lire("<region> key=61\n<region> sample=a.wav key=60");
    expect(zones(banque)).toEqual([[60, 60, 60]]);
    expect(message).toContain("#1");
  });

  it("un générateur `*sine` est nommé comme générateur, et non compté comme échantillon manquant", async () => {
    const { message } = await lire("<region> sample=*sine key=60\n<region> sample=a.wav key=62");
    expect(message).toContain("*sine");
    expect(message).not.toMatch(/manquant/);
  });

  it("`octave_offset` et `note_offset` décalent les touches et la racine de chaque région", async () => {
    // sfzformat.com/opcodes/octave_offset : « this allows changing IPN notation into MMA, so C4 will
    // be MIDI note 48 instead of MIDI note 60 » pour `octave_offset=-1`.
    const region = "<region> sample=a.wav lokey=50 hikey=70 pitch_keycenter=60";
    expect(zones((await lire(`<control> octave_offset=-1\n${region}`)).banque)).toEqual([[38, 58, 48]]);
    expect(zones((await lire(`<control> octave_offset=1\n${region}`)).banque)).toEqual([[62, 82, 72]]);
    expect(zones((await lire(`<control> note_offset=-3\n${region}`)).banque)).toEqual([[47, 67, 57]]);
    expect(zones((await lire(`<control> octave_offset=1 note_offset=2\n${region}`)).banque)).toEqual([[64, 84, 74]]);
    // Ni l'un ni l'autre ne compte plus parmi les opcodes ignorés.
    expect((await lire(`<control> octave_offset=1\n${region}`)).message).not.toMatch(/ignor/);
  });

  it("une région que le décalage sort du clavier est écartée, nommée (et la suivante décalée)", async () => {
    const { banque, message } = await lire(`<control> octave_offset=-2\n${BONNE}<region> sample=a.wav lokey=0 hikey=10 pitch_keycenter=5`);
    expect(zones(banque)).toEqual([[56, 66, 61]]);
    expect(message).toContain("#2");
  });
});

/** Le disque en écriture, pour « Export SFZ » : chaque fichier écrit, dans l'ordre. */
function mondeEcriture() {
  const ecrits = new Map<string, Uint8Array>();
  const ordre: string[] = [];
  (globalThis as any).window = {
    api: { ecrireFichier: vi.fn(async (c: string, o: Uint8Array) => { ordre.push(c); ecrits.set(c, o); return c; }) },
  };
  return { ecrits, ordre };
}

/** Exporte une banque par le nœud, et rend le texte SFZ écrit et la liste des écritures. */
async function exporter(banque: Banque, nom = "x.sfz") {
  const { ecrits, ordre } = mondeEcriture();
  const r: any = await exportSfz.executer(ctxDEssai([banque], { Nom: nom }, { ficheId: "export-sfz", repertoireTravail: "D:/t" }) as any);
  const octets = r.valeurs[0] ? ecrits.get(r.valeurs[0]) : undefined;
  return { texte: octets ? new TextDecoder().decode(octets) : "", ordre, message: String(r.message) };
}

describe("les boucles et `one_shot`, selon la référence", () => {
  it("`loop_end` est INCLUS : `loop_start=1000 loop_end=1999` boucle sur mille échantillons", async () => {
    // sfzformat.com/opcodes/loop_end : « This is inclusive - the sample specified is played as
    // part of the loop ». La boucle d'une zone garde, elle, sa fin exclue.
    const { banque } = await lire("<region> sample=a.wav lokey=50 hikey=70 pitch_keycenter=60 loop_mode=loop_sustain loop_start=1000 loop_end=1999");
    expect(banque?.zones[0].boucle).toEqual({ debut: 1000, fin: 2000 });
  });

  it("l'export écrit la fin INCLUSE : une boucle de mille échantillons sort en `loop_end=1999`", async () => {
    const { texte } = await exporter({
      zones: [{ racine: 60, basse: 0, haute: 127, audio: sinus(220.5), boucle: { debut: 1000, fin: 2000 } }],
      racineSource: 60, largeur: 67, noteBasse: 0, noteHaute: 127,
    });
    expect(texte).toMatch(/loop_start=1000 loop_end=1999\b/);
  });

  it("`one_shot` joue l'échantillon JUSQU'AU BOUT : la crash du kit intégré sonne toute sa durée", async () => {
    // sfzformat.com/opcodes/loop_mode : « sample will play from start to end, ignoring note off ».
    // Le kit intégré déclare `loop_mode=one_shot` ; sa crash dure 1,2 s.
    const dossier = CHEMIN_KIT_EMBARQUE.replace(/\/[^/]*$/, "");
    const sons: Record<string, AudioBuffer> = {};
    for (const v of VOIX_KIT) sons[v.fichier] = sinus(300, v.duree);
    const api = {
      lireTexte: vi.fn(async (c: string) => (c === CHEMIN_KIT_EMBARQUE ? sfzDuKit() : null)),
      lireFichierAudio: vi.fn(async (c: string) => ({ url: c })),
    };
    (globalThis as any).window = { api };
    (globalThis as any).fetch = vi.fn(async (url: string) => ({ arrayBuffer: async () => new TextEncoder().encode(url).buffer }));
    const runtime = { decodeAudioData: vi.fn(async (ab: ArrayBuffer) => sons[new TextDecoder().decode(ab).replace(`${dossier}/`, "")]) };
    const kit: any = await banqueSfz.executer(ctxDEssai([], { Source: "integre", "Aperçu": "non" }, { runtime, ficheId: "banque-sfz" }) as any);
    const crash = VOIX_KIT.find((v) => v.fichier === "crash.wav")!;
    const joue: any = await sequenceSurBanque.executer(ctxDEssai(
      [{ notes: [{ note: crash.note, velocite: 100, debut: 0, fin: 0.1 }], tempo: 120 }, kit.valeurs[0]], {},
      { ficheId: "sequence-sur-banque" }) as any);
    const audio = joue.valeurs[0] as AudioBuffer;
    expect(audio.duration).toBeGreaterThanOrEqual(crash.duree);
    expect(rms(audio, 0.4, 1.0)).toBeGreaterThan(0.1);
    // Le jeu en direct reçoit la même consigne : ignorer le relâchement de la touche.
    expect(parametresLecture(voixPourNote(kit.valeurs[0], crash.note, 100)!).unCoup).toBe(true);
    // Et l'export le réécrit : relu ailleurs, le kit reste un kit qui sonne jusqu'au bout.
    expect((await exporter(kit.valeurs[0])).texte).toMatch(/loop_mode=one_shot/);
  });

  it("une zone ordinaire garde son relâchement : rien ne sonne après la touche et son fondu", async () => {
    const audio = await jouer("<region> sample=a.wav key=60", [{ note: 60, velocite: 100, debut: 0, fin: 0.1 }]);
    expect(rms(audio, 0.15, audio.duration)).toBeLessThan(1e-6);
  });
});

/**
 * Exporte une banque, puis la relit par « Banque SFZ » : chaque WAV écrit rend le son de la zone
 * qui l'a fait écrire, dans l'ordre des écritures. C'est l'aller-retour complet, par les deux nœuds.
 */
async function allerRetour(banque: Banque, type = "auto") {
  const ecrit = await exporter(banque);
  const wavs = ecrit.ordre.filter((c) => c.endsWith(".wav"));
  const sons = new Map(wavs.map((c, i) => [c, banque.zones[i].audio]));
  (globalThis as any).window = { api: {
    lireTexte: vi.fn(async (c: string) => (c === "D:/t/x.sfz" ? ecrit.texte : null)),
    lireFichierAudio: vi.fn(async (c: string) => ({ url: c })),
  } };
  (globalThis as any).fetch = vi.fn(async (url: string) => ({ arrayBuffer: async () => new TextEncoder().encode(url).buffer }));
  const runtime = { decodeAudioData: vi.fn(async (ab: ArrayBuffer) => sons.get(new TextDecoder().decode(ab)) ?? null) };
  const r: any = await banqueSfz.executer(ctxDEssai([], { Source: "fichier", "Aperçu": "non", "Type de banque": type },
    { runtime, ficheId: "banque-sfz", data: { sfzChemin: "D:/t/x.sfz" } }) as any);
  return { ...ecrit, wavs, relue: r.valeurs[0] as Banque | null };
}

describe("l'export, relu par le lecteur", () => {
  const A = sinus(220.5), B = sinus(330.75), C = sinus(441);

  it("GARDE le volume et le tempérament d'une zone : `volume` en décibels, `pitch_keytrack` en cents", async () => {
    const { texte, relue } = await allerRetour({
      zones: [{ racine: 60, basse: 0, haute: 64, audio: A, gain: 0.5 }, { racine: 72, basse: 65, haute: 127, audio: B, centsParTouche: 63.16 }],
      racineSource: 66, largeur: 55, noteBasse: 0, noteHaute: 127,
    });
    expect(texte).toMatch(/volume=-6\.02/);
    expect(texte).toMatch(/pitch_keytrack=63\.16\b/);
    expect(relue?.zones[0].gain).toBeCloseTo(0.5, 9);
    expect(relue?.zones[1].centsParTouche).toBe(63.16);
  });

  it("GARDE un kit : ses zones ne suivent pas la touche, `pitch_keytrack=0`, même larges", async () => {
    const { texte, relue } = await allerRetour({
      zones: [{ racine: 36, basse: 30, haute: 40, audio: A, suitLaTouche: false }, { racine: 50, basse: 45, haute: 55, audio: B, suitLaTouche: false }],
      racineSource: 36, largeur: 6, noteBasse: 30, noteHaute: 55, kit: true,
    });
    expect(texte.match(/pitch_keytrack=0\b/g)?.length).toBe(2);
    expect(relue?.kit).toBe(true);
    expect(relue?.zones.every((z) => z.suitLaTouche === false)).toBe(true);
  });

  it("écrit UN FICHIER PAR SON : deux zones à la même racine ne s'écrasent plus", async () => {
    const { wavs, relue } = await allerRetour({
      zones: [{ racine: 60, basse: 0, haute: 59, audio: A }, { racine: 60, basse: 60, haute: 127, audio: C, accord: 50 }],
      racineSource: 60, largeur: 67, noteBasse: 0, noteHaute: 127,
    });
    expect(new Set(wavs).size).toBe(2);
    expect(relue?.zones.find((z) => z.basse === 0)?.audio).toBe(A);
    expect(relue?.zones.find((z) => z.basse === 60)?.audio).toBe(C);
  });

  it("mais un même son partagé par deux zones reste un seul fichier", async () => {
    const { wavs, texte } = await allerRetour({
      zones: [{ racine: 60, basse: 0, haute: 59, audio: A }, { racine: 60, basse: 60, haute: 127, audio: A, accord: 50 }],
      racineSource: 60, largeur: 67, noteBasse: 0, noteHaute: 127,
    });
    expect(new Set(wavs).size).toBe(1);
    expect(texte.match(/sample=x\/zone-060\.wav/g)?.length).toBe(2);
  });

  it("REFUSE un nom qui porte `=`, interdit dans un chemin d'échantillon, et n'écrit rien", async () => {
    // sfzformat.com/opcodes/sample : « names with blank spaces and other special characters
    // (excepting the = character) are allowed ».
    const { ordre, message } = await exporter({
      zones: [{ racine: 60, basse: 0, haute: 127, audio: A }], racineSource: 60, largeur: 67, noteBasse: 0, noteHaute: 127,
    }, "a=b.sfz");
    expect(ordre).toEqual([]);
    expect(message).toContain("=");
  });
});

/** Un WAV minimal, avec ou sans bloc `smpl` portant la « MIDI unity note ». */
function wav(racine: number | null): Uint8Array {
  const octets = (...parts: Uint8Array[]) => {
    const r = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let i = 0;
    for (const p of parts) { r.set(p, i); i += p.length; }
    return r;
  };
  const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
  const texte = (s: string) => new TextEncoder().encode(s);
  const bloc = (id: string, donnees: Uint8Array) => octets(texte(id), u32(donnees.length), donnees);
  const fmt = new Uint8Array(16);
  const f = new DataView(fmt.buffer);
  f.setUint16(0, 1, true); f.setUint16(2, 1, true); f.setUint32(4, SR, true); f.setUint32(8, SR * 2, true);
  f.setUint16(12, 2, true); f.setUint16(14, 16, true);
  const smpl = new Uint8Array(36);
  if (racine !== null) new DataView(smpl.buffer).setUint32(12, racine, true);
  const corps = octets(texte("WAVE"), bloc("fmt ", fmt), ...(racine === null ? [] : [bloc("smpl", smpl)]), bloc("data", new Uint8Array(8)));
  return octets(texte("RIFF"), u32(corps.length), corps);
}

/** Lit un SFZ dont les WAV portent de vrais octets : `la.wav` déclare la racine 69, `sans.wav` aucune. */
async function lireAvecWav(texte: string) {
  const fichiers: Record<string, Uint8Array> = { "D:/b/la.wav": wav(69), "D:/b/sans.wav": wav(null) };
  (globalThis as any).window = { api: {
    lireTexte: vi.fn(async (c: string) => (c === "D:/b/i.sfz" ? texte : null)),
    lireFichierAudio: vi.fn(async (c: string) => ({ url: c })),
  } };
  (globalThis as any).fetch = vi.fn(async (url: string) => ({ arrayBuffer: async () => fichiers[url].slice().buffer }));
  const runtime = { decodeAudioData: vi.fn(async () => sinus(440)) };
  const r: any = await banqueSfz.executer(ctxDEssai([], { Source: "fichier", "Aperçu": "non", "Type de banque": "hauteurs" },
    { runtime, ficheId: "banque-sfz", data: { sfzChemin: "D:/b/i.sfz" } }) as any);
  return { banque: r.valeurs[0] as Banque | null, message: String(r.message) };
}

describe("`pitch_keycenter=sample`, selon la référence", () => {
  // sfzformat.com/opcodes/pitch_keycenter : « This causes the SFZ player to look in the sample file
  // metadata for the keycenter value. If [...] the file metadata does not contain pitch
  // information, it defaults to MIDI note 0. »
  it("prend la racine que déclare le WAV, dans son bloc `smpl`", async () => {
    const { banque, message } = await lireAvecWav("<region> sample=la.wav lokey=60 hikey=80 pitch_keycenter=sample");
    expect(zones(banque)).toEqual([[60, 80, 69]]);
    expect(message).not.toMatch(/racine/);
  });

  it("sans métadonnée, joue depuis la note 0 et le DIT", async () => {
    const { banque, message } = await lireAvecWav("<region> sample=sans.wav lokey=60 hikey=80 pitch_keycenter=sample");
    expect(zones(banque)).toEqual([[60, 80, 0]]);
    expect(message).toContain("sans.wav");
  });

  it("le décalage de <control> et `transpose` s'ajoutent à la racine du fichier", async () => {
    const { banque } = await lireAvecWav("<control> octave_offset=-1\n<region> sample=la.wav lokey=60 hikey=80 pitch_keycenter=sample transpose=2");
    expect(zones(banque)).toEqual([[48, 68, 69 - 12 - 2]]);
  });
});

describe("`default_path`, en-tête par en-tête", () => {
  // sfzformat.com/headers/control : « a new control header resets default_path only and not other
  // control settings ». Un seul chemin valait pour tout le fichier : le dernier.
  const AILLEURS = { "A/x.wav": sinus(220.5), "B/y.wav": sinus(330.75), "z.wav": sinus(441) };
  async function lireAilleurs(texte: string) {
    const runtime = monde(texte, AILLEURS);
    const r: any = await banqueSfz.executer(ctxDEssai([], { Source: "fichier", "Aperçu": "non", "Type de banque": "hauteurs" },
      { runtime, ficheId: "banque-sfz", data: { sfzChemin: "D:/b/i.sfz" } }) as any);
    return { banque: r.valeurs[0] as Banque | null, message: String(r.message) };
  }

  it("chaque région cherche dans le `default_path` de son <control>", async () => {
    const { banque, message } = await lireAilleurs(
      "<control> default_path=A/\n<region> sample=x.wav key=60\n<control> default_path=B/\n<region> sample=y.wav key=62");
    expect(zones(banque)).toEqual([[60, 60, 60], [62, 62, 62]]);
    expect(message).not.toMatch(/manquant/);
  });

  it("un <control> sans `default_path` le remet à zéro", async () => {
    const { banque, message } = await lireAilleurs("<control> default_path=A/\n<region> sample=x.wav key=60\n<control>\n<region> sample=z.wav key=64");
    expect(zones(banque)).toEqual([[60, 60, 60], [64, 64, 64]]);
    expect(message).not.toMatch(/manquant/);
  });
});

describe("l'en-tête d'un .sfz exporté suit la langue de l'interface", () => {
  // Décision de Fabien : « The interface language ». Il s'écrivait en français, interface anglaise
  // comprise : « // Banque de clavier exportée… », « Touches couvertes ».
  async function sousLangue<T>(langue: "fr" | "en", faire: () => Promise<T>): Promise<T> {
    const avant = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      value: { getItem: (c: string) => (c === "attic-lang" ? langue : null), setItem: () => {} }, configurable: true,
    });
    try { return await faire(); } finally {
      if (avant) Object.defineProperty(globalThis, "localStorage", avant);
      else delete (globalThis as unknown as Record<string, unknown>).localStorage;
    }
  }
  const BANQUE: Banque = {
    zones: [{ racine: 60, basse: 0, haute: 127, audio: sinus(220.5) }], racineSource: 60, largeur: 67, noteBasse: 0, noteHaute: 127,
  };
  const commentaires = (texte: string) => texte.split("\n").filter((l) => l.startsWith("//"));

  it("en anglais, aucun commentaire français", async () => {
    const { texte } = await sousLangue("en", () => exporter(BANQUE));
    expect(commentaires(texte).length).toBeGreaterThan(0);
    expect(commentaires(texte).filter((l) => /[éèêàùç]|\b(de|des|zones de|racine|touches)\b/i.test(l))).toEqual([]);
  });

  it("en français, l'en-tête reste français", async () => {
    const { texte } = await sousLangue("fr", () => exporter(BANQUE));
    expect(commentaires(texte).join(" ")).toContain("Touches couvertes");
  });
});
