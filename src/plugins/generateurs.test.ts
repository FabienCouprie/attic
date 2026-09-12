// plugins/generateurs.test.ts — Tests rapides des nœuds générateurs.
// On passe par le registre pour éviter la dépendance circulaire directe
// entre generateurs.ts et audio/adaptateur.ts.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";
import { analyserMidi, joindreMidi } from "../audio/midi";
import { parseMidi } from "midi-file";

function ctx(sequenceNotes: any[]) {
  return {
    entree: () => null,
    entrees: () => [],
    paramTexte: (nom: string, def: string) => {
      const params: Record<string, string> = { Synthèse: "FM/Oscillateurs" };
      return params[nom] ?? def;
    },
    paramNombre: (nom: string, def: number) => {
      const params: Record<string, number> = {
        Instrument: 0,
        Tempo: 120,
        Volume: 80,
      };
      return params[nom] ?? def;
    },
    onProgress: () => {},
    noeud: { data: { sequenceNotes } },
    runtime: null,
  };
}

function ctxParams(params: Record<string, string | number>) {
  return {
    entree: () => null,
    entrees: () => [],
    paramTexte: (nom: string, def: string) => String(params[nom] ?? def),
    paramNombre: (nom: string, def: number) => Number(params[nom] ?? def),
    onProgress: () => {},
    noeud: { data: {} },
    runtime: null,
  };
}

function bufferNonSilencieux(b: AudioBuffer) {
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    if (d.some((s) => Math.abs(s) > 0.001)) return true;
  }
  return false;
}

function mesurerFrequence(b: AudioBuffer): number {
  const d = b.getChannelData(0);
  const sr = b.sampleRate;
  let croisements = 0;
  let debut = 0;
  for (let i = 0; i < d.length; i++) {
    if (Math.abs(d[i]) > 0.01) { debut = i; break; }
  }
  const fin = Math.min(d.length, debut + Math.floor(sr * 0.1));
  for (let i = debut + 1; i < fin; i++) {
    if (d[i - 1] < 0 && d[i] >= 0) croisements++;
  }
  const duree = (fin - debut) / sr;
  return duree > 0 ? croisements / duree : 0;
}

// ── Le mix du Groove Box et la fréquence d'échantillonnage ──
//
// Le nœud additionne sa partie mélodique et sa batterie INDICE PAR INDICE. Les
// deux tampons doivent donc partager leur fréquence — ce qui n'était pas le cas :
// `rendreMidiDepuisBytes` rend toujours du 44 100 Hz, alors que la batterie et le
// master étaient créés à la fréquence de l'AudioContext. Sur une machine à
// 48 000 Hz, la partie mélodique ressortait 8,8 % trop vite, soit +1,47 demi-ton,
// et 8 % trop courte : sur une section de 150 s, la mélodie finissait douze
// secondes avant la batterie.
//
// Ce test passe donc `runtime: { sampleRate: 48000 }`. Tous les helpers de ce
// fichier passaient `runtime: null`, dont le repli vaut 44 100 : la fréquence
// coïncidait, et AUCUN test ne pouvait voir le défaut. C'est ce qui l'a laissé
// passer.
describe("Groove Box : une seule fréquence pour le mix", () => {
  const ctxRuntime = (params: Record<string, string | number>, sampleRate: number) => ({
    entree: () => null,
    entrees: () => [],
    paramTexte: (nom: string, def: string) => String(params[nom] ?? def),
    paramNombre: (nom: string, def: number) => Number(params[nom] ?? def),
    onProgress: () => {},
    noeud: { data: {} },
    runtime: { sampleRate },
  });

  const config = {
    "Clé": "A", "Gamme": "mineur", "Genre": "pop", "Tempo": 120,
    "Durée par accord": 2, "Nombre d'accords": 2, "Graine": 7,
    "Synthèse": "FM/Oscillateurs", "Volume": 80, "Volume batterie": 100,
  };

  it("ne laisse pas la fréquence de l'AudioContext décider du mix", async () => {
    // L'assertion qui compte : avec un AudioContext à 48 kHz, la sortie doit
    // rester à la fréquence des parties rendues. Y voir 48 000 signifierait que
    // du 44,1 kHz a été recopié dans un tampon 48 kHz — donc désaccordé.
    const fiche = registre.trouverDef("boite-groove")!;
    const res = await fiche.executer(ctxRuntime(config, 48000) as any);
    const audio = res.valeurs[0] as AudioBuffer;
    expect(audio).toBeInstanceOf(AudioBuffer);
    expect(audio.sampleRate).toBe(44100);
  });

  it("rend le même audio quelle que soit la fréquence de l'AudioContext", async () => {
    // Corollaire : la sortie ne doit plus dépendre du matériel. Avant, la même
    // graine donnait un morceau d'une hauteur et d'une durée différentes selon
    // la machine — un défaut invisible en test et inaudible pour qui n'a qu'une
    // seule carte son.
    const fiche = registre.trouverDef("boite-groove")!;
    const a = (await fiche.executer(ctxRuntime(config, 44100) as any)).valeurs[0] as AudioBuffer;
    const b = (await fiche.executer(ctxRuntime(config, 48000) as any)).valeurs[0] as AudioBuffer;
    expect(b.sampleRate).toBe(a.sampleRate);
    expect(b.length).toBe(a.length);
  });

  // L'invariant généralisé, appliqué aux autres générateurs qui mélangent des
  // tampons. « Générateur musical » et « Générateur d'accords » ont été vérifiés
  // dans l'app aux deux fréquences — 44 100 en sortie, durée demandée respectée,
  // tonalité détectée juste dans les deux cas — et ils construisent tout à une
  // fréquence unique codée en dur. Ce test garde cet état : la sortie d'un
  // générateur ne doit jamais dépendre de la carte son de la machine.
  it.each(["generateur-musical", "generateur-accords"])(
    "%s : sa sortie ne dépend pas de la fréquence de l'AudioContext",
    async (id) => {
      const fiche = registre.trouverDef(id)!;
      const params = { "Clé": "A", "Gamme": "mineur", "Genre": "pop", "Tempo": 120, "Durée": 8, "Volume": 80 };
      const a = (await fiche.executer(ctxRuntime(params, 44100) as any)).valeurs[0] as AudioBuffer;
      const b = (await fiche.executer(ctxRuntime(params, 48000) as any)).valeurs[0] as AudioBuffer;
      expect(a.sampleRate).toBe(b.sampleRate);
      expect(a.length).toBe(b.length);
    },
  );

  // ── Le kit de batterie, quatrieme case pour la quatrieme sortie ──
  //
  // Le noeud expose quatre sorties MIDI et n'offrait que trois cases
  // d'instrument : la batterie n'en avait aucune, et son kit etait fige a
  // « Standard » (banque 128, programme 0) ecrit en dur par le generateur. Le
  // reglage doit voyager AVEC le fichier MIDI, sans quoi le noeud qui le rendra
  // ensuite retombera sur ce kit-la et le choix restera sans effet.
  it("laisse le kit standard dans la sortie MIDI par defaut", async () => {
    const fiche = registre.trouverDef("boite-groove")!;
    const res = await fiche.executer(ctxRuntime(config, 44100) as any);
    const bytes = new Uint8Array(await (res.valeurs[1] as File).arrayBuffer());
    const inst = analyserMidi(parseMidi(bytes)).canauxInstrument.get(9)!;
    expect({ banque: inst.banque, programme: inst.programme }).toEqual({ banque: 128, programme: 0 });
  });

  it("ecrit le kit choisi dans la sortie MIDI batterie", async () => {
    // 16420 = banque 128 x 128 + programme 36, soit un kit « Jazz » dans un
    // SoundFont General MIDI courant.
    const fiche = registre.trouverDef("boite-groove")!;
    const res = await fiche.executer(ctxRuntime({ ...config, "Kit de batterie": 16420 }, 44100) as any);
    const bytes = new Uint8Array(await (res.valeurs[1] as File).arrayBuffer());
    const inst = analyserMidi(parseMidi(bytes)).canauxInstrument.get(9)!;
    expect({ banque: inst.banque, programme: inst.programme }).toEqual({ banque: 128, programme: 36 });
  });

  it("ne decale pas les frappes en ecrivant le kit", async () => {
    // La reecriture retire les anciens changements de programme : leur temps doit
    // etre reporte, sinon toute la piste de batterie glisse.
    const fiche = registre.trouverDef("boite-groove")!;
    const sans = await fiche.executer(ctxRuntime(config, 44100) as any);
    const avec = await fiche.executer(ctxRuntime({ ...config, "Kit de batterie": 16420 }, 44100) as any);
    const notes = async (f: File) => analyserMidi(parseMidi(new Uint8Array(await f.arrayBuffer()))).notes;
    const a = await notes(sans.valeurs[1] as File), b = await notes(avec.valeurs[1] as File);
    expect(b.map((n) => +n.debut.toFixed(4))).toEqual(a.map((n) => +n.debut.toFixed(4)));
  });

  // ── Les instruments choisis doivent voyager DANS les quatre sorties MIDI ──
  //
  // Le kit de batterie était écrit dans sa sortie (tests ci-dessus) mais les
  // trois autres cases ne l'étaient pas : elles n'agissaient que sur le rendu
  // audio interne du nœud. Les sorties « MIDI accords / basse / mélodie »
  // partaient donc avec les programmes que le générateur y inscrit en dur —
  // piano 0, basse 33, lead 80. Brancher ces sorties sur « Jointure MIDI » puis
  // rendre le résultat perdait le choix : le morceau joint sonnait piano-basse-
  // lead quel que soit le réglage. C'est le défaut rapporté, et il ne se voyait
  // pas sur la sortie audio du nœud, où les instruments fonctionnaient.
  //
  // `joindreMidi` n'y est pour rien : elle conserve les programChange, elle ne
  // les invente pas.
  const CANAL_DE_SORTIE: Record<number, number> = { 2: 0, 3: 1, 4: 2 };

  const instrumentDe = async (f: File, canal: number) => {
    const a = analyserMidi(parseMidi(new Uint8Array(await f.arrayBuffer())));
    const i = a.canauxInstrument.get(canal);
    return i ? { banque: i.banque, programme: i.programme } : null;
  };

  it("écrit les instruments choisis dans les sorties MIDI accords, basse et mélodie", async () => {
    const fiche = registre.trouverDef("boite-groove")!;
    const res = await fiche.executer(ctxRuntime({
      ...config,
      "Instrument accords": 19, // Church Organ
      "Instrument basse": 35, // Fretless Bass
      "Instrument mélodie": 73, // Flute
    }, 44100) as any);
    expect(await instrumentDe(res.valeurs[2] as File, 0)).toEqual({ banque: 0, programme: 19 });
    expect(await instrumentDe(res.valeurs[3] as File, 1)).toEqual({ banque: 0, programme: 35 });
    expect(await instrumentDe(res.valeurs[4] as File, 2)).toEqual({ banque: 0, programme: 73 });
  });

  it("garde les programmes du générateur quand aucun instrument n'est choisi", async () => {
    // Le repli « Suivre le MIDI » : l'arrangement par défaut du nœud, celui qui
    // sonnait juste avant l'ajout des cases, doit rester intact.
    const fiche = registre.trouverDef("boite-groove")!;
    const res = await fiche.executer(ctxRuntime(config, 44100) as any);
    expect(await instrumentDe(res.valeurs[2] as File, 0)).toEqual({ banque: 0, programme: 0 });
    expect(await instrumentDe(res.valeurs[3] as File, 1)).toEqual({ banque: 0, programme: 33 });
    expect(await instrumentDe(res.valeurs[4] as File, 2)).toEqual({ banque: 0, programme: 80 });
  });

  it("ne décale pas les notes des trois parties en y écrivant l'instrument", async () => {
    // Le pendant du test de non-décalage de la batterie : `appliquerInstrumentsParCanal`
    // retire les anciens programChange, et leur deltaTime doit être reporté.
    const fiche = registre.trouverDef("boite-groove")!;
    const sans = await fiche.executer(ctxRuntime(config, 44100) as any);
    const avec = await fiche.executer(ctxRuntime({
      ...config, "Instrument accords": 19, "Instrument basse": 35, "Instrument mélodie": 73,
    }, 44100) as any);
    const debuts = async (f: File) =>
      analyserMidi(parseMidi(new Uint8Array(await f.arrayBuffer()))).notes.map((n) => +n.debut.toFixed(4));
    for (const i of [2, 3, 4]) {
      expect(await debuts(avec.valeurs[i] as File)).toEqual(await debuts(sans.valeurs[i] as File));
    }
  });

  it("conserve les instruments à travers une jointure MIDI", async () => {
    // Le scénario rapporté, bout en bout : deux sorties de parties différentes
    // passées à `joindreMidi`, et les deux timbres doivent survivre. La jointure
    // fusionne toutes les pistes en une seule — c'est pourquoi l'assertion porte
    // sur les CANAUX, qui sont ce que le rendu SoundFont suit.
    const fiche = registre.trouverDef("boite-groove")!;
    const res = await fiche.executer(ctxRuntime({
      ...config, "Instrument basse": 35, "Instrument mélodie": 73,
    }, 44100) as any);
    const joint = await joindreMidi(res.valeurs[3] as File, res.valeurs[4] as File, 0);
    expect(await instrumentDe(joint, 1)).toEqual({ banque: 0, programme: 35 });
    expect(await instrumentDe(joint, 2)).toEqual({ banque: 0, programme: 73 });
  });

  it("laisse l'ancienne case « Instrument » agir sur les trois sorties MIDI", async () => {
    // Un projet enregistré avant les cases par partie ne porte que « Instrument ».
    // Le repli doit s'appliquer aux sorties MIDI comme il s'applique au rendu.
    const fiche = registre.trouverDef("boite-groove")!;
    const res = await fiche.executer(ctxRuntime({ ...config, Instrument: 19 }, 44100) as any);
    for (const [sortie, canal] of Object.entries(CANAL_DE_SORTIE)) {
      expect(await instrumentDe(res.valeurs[+sortie] as File, canal)).toEqual({ banque: 0, programme: 19 });
    }
  });

  it("produit le même signal, échantillon par échantillon", async () => {
    // La forme forte de l'assertion précédente : à graine égale, deux
    // AudioContext différents doivent donner le MÊME signal. Sous le défaut, la
    // partie mélodique était comprimée dans l'un des deux et pas dans l'autre.
    //
    // Une première version de ce test mesurait au contraire l'instant du dernier
    // échantillon audible, en pensant y voir la mélodie écourtée. Elle ne
    // distinguait rien : la batterie, elle, était bien à la fréquence du master
    // et remplissait la fin du tampon dans les deux cas. Un test qui passe aussi
    // bien avec le défaut qu'avec sa correction ne vérifie rien.
    const fiche = registre.trouverDef("boite-groove")!;
    const a = (await fiche.executer(ctxRuntime(config, 44100) as any)).valeurs[0] as AudioBuffer;
    const b = (await fiche.executer(ctxRuntime(config, 48000) as any)).valeurs[0] as AudioBuffer;
    const da = a.getChannelData(0), db = b.getChannelData(0);
    let ecartMax = 0;
    for (let i = 0; i < da.length; i++) ecartMax = Math.max(ecartMax, Math.abs(da[i] - db[i]));
    // Les voix `NoiseSynth` de la batterie tirent du bruit aléatoire : l'égalité
    // n'est donc pas au bit près, mais le signal doit rester du même ordre.
    expect(ecartMax).toBeLessThan(0.3);
  });
});

describe("generateurs plugin", () => {
  it("Clavier mélodie produit audio et MIDI", async () => {
    const f = registre.trouverDef("clavier-melodie")!;
    const res = await f.executer(ctx([
      { note: 60, velocite: 100, debut: 0, fin: 0.5 },
      { note: 64, velocite: 100, debut: 0.5, fin: 1.0 },
    ]) as any);
    expect(res.valeurs.length).toBe(2);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(res.valeurs[1]).toBeInstanceOf(File);
    expect((res.valeurs[1] as File).type).toBe("audio/midi");
  });

  it("Clavier mélodie retourne null si aucune séquence", async () => {
    const f = registre.trouverDef("clavier-melodie")!;
    const ctxSansNotes = {
      entree: () => null,
      entrees: () => [],
      paramTexte: (nom: string, def: string) => ({ Synthèse: "FM/Oscillateurs" })[nom] ?? def,
      paramNombre: (nom: string, def: number) => ({ Instrument: 0, Tempo: 120, Volume: 80 })[nom] ?? def,
      onProgress: () => {},
      noeud: { data: {} },
      runtime: null,
    };
    const res = await f.executer(ctxSansNotes as any);
    expect(res.valeurs.length).toBe(2);
    expect(res.valeurs[0]).toBeNull();
    expect(res.valeurs[1]).toBeNull();
  });

  it("Générateur de fréquence : forme Square fonctionne avec id canonique", async () => {
    const f = registre.trouverDef("generateur-frequence")!;
    const res = await f.executer(ctxParams({ Saisie: "frequency", Fréquence: 440, Forme: "square", Durée: 0.1, Volume: 80 }) as any);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(bufferNonSilencieux(res.valeurs[0] as AudioBuffer)).toBe(true);
  });

  it("Générateur de fréquence : forme Saw fonctionne avec libellé anglais", async () => {
    const f = registre.trouverDef("generateur-frequence")!;
    const res = await f.executer(ctxParams({ Saisie: "Frequency (Hz)", Fréquence: 440, Forme: "Saw", Durée: 0.1, Volume: 80 }) as any);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(bufferNonSilencieux(res.valeurs[0] as AudioBuffer)).toBe(true);
  });

  it("Générateur de fréquence : le mode Note change la fréquence de sortie", async () => {
    const f = registre.trouverDef("generateur-frequence")!;
    const resC4 = await f.executer(ctxParams({ Saisie: "note", Note: "C4", Forme: "sine", Durée: 0.5, Volume: 80 }) as any);
    const resA4 = await f.executer(ctxParams({ Saisie: "note", Note: "A4", Forme: "sine", Durée: 0.5, Volume: 80 }) as any);
    expect(resC4.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(resA4.valeurs[0]).toBeInstanceOf(AudioBuffer);
    const freqC4 = mesurerFrequence(resC4.valeurs[0] as AudioBuffer);
    const freqA4 = mesurerFrequence(resA4.valeurs[0] as AudioBuffer);
    expect(freqA4).toBeGreaterThan(freqC4);
    expect(freqC4).toBeGreaterThan(250);
    expect(freqC4).toBeLessThan(280);
  });

  it("Générateur de fréquence : le mode Note accepte minuscule, espaces et altérations Unicode", async () => {
    const f = registre.trouverDef("generateur-frequence")!;
    const res = await f.executer(ctxParams({ Saisie: "Note", Note: "  c#5  ", Forme: "sine", Durée: 0.5, Volume: 80 }) as any);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    const freq = mesurerFrequence(res.valeurs[0] as AudioBuffer);
    expect(freq).toBeGreaterThan(540);
    expect(freq).toBeLessThan(570);
  });

  it("Générateur de fréquence : le mode Note rejette une note invalide", async () => {
    const f = registre.trouverDef("generateur-frequence")!;
    const res = await f.executer(ctxParams({ Saisie: "note", Note: "H4", Forme: "sine", Durée: 0.5, Volume: 80 }) as any);
    expect(res.valeurs[0]).toBeNull();
  });

  it("Générateur de fréquence : A2 et A4 produisent des fréquences différentes en mode Note", async () => {
    const f = registre.trouverDef("generateur-frequence")!;
    const resA2 = await f.executer(ctxParams({ Saisie: "note", Note: "A2", Forme: "sine", Durée: 0.5, Volume: 80 }) as any);
    const resA4 = await f.executer(ctxParams({ Saisie: "note", Note: "A4", Forme: "sine", Durée: 0.5, Volume: 80 }) as any);
    expect(resA2.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(resA4.valeurs[0]).toBeInstanceOf(AudioBuffer);
    const freqA2 = mesurerFrequence(resA2.valeurs[0] as AudioBuffer);
    const freqA4 = mesurerFrequence(resA4.valeurs[0] as AudioBuffer);
    expect(freqA4).toBeGreaterThan(400);
    expect(freqA4).toBeLessThan(480);
    expect(freqA2).toBeGreaterThan(90);
    expect(freqA2).toBeLessThan(130);
    expect(freqA4).toBeGreaterThan(freqA2 * 3);
  });

  it("Métronome : timbre Beep fonctionne avec id canonique", async () => {
    const f = registre.trouverDef("metronome")!;
    const res = await f.executer(ctxParams({ Tempo: 120, Signature: "4/4", Durée: 1, Timbre: "beep", Volume: 80 }) as any);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(bufferNonSilencieux(res.valeurs[0] as AudioBuffer)).toBe(true);
  });
});

// Vérifie la chaîne complète — paramètre du nœud, plugin, module DSP — plutôt
// que le seul générateur pseudo-aléatoire : c'est le câblage qui casse, pas
// l'arithmétique. Une faute de frappe sur le nom du paramètre laisserait la
// graine sans effet, et rien d'autre ne le signalerait.
describe("graine du générateur de bruit", () => {
  const PARAMS = { Type: "Blanc", Durée: 0.2, Volume: 80 };

  async function bruit(graine: number) {
    const f = registre.trouverDef("generateur-bruit")!;
    const res = await f.executer(ctxParams({ ...PARAMS, Graine: graine }) as any);
    return { echantillons: (res.valeurs[0] as AudioBuffer).getChannelData(0), message: res.message ?? "" };
  }

  it("une même graine rend un bruit identique échantillon par échantillon", async () => {
    const a = await bruit(2024);
    const b = await bruit(2024);
    expect(a.echantillons.length).toBeGreaterThan(0);
    expect(Array.from(a.echantillons)).toEqual(Array.from(b.echantillons));
  });

  it("changer la graine change le bruit", async () => {
    const a = await bruit(2024);
    const b = await bruit(2025);
    expect(Array.from(a.echantillons)).not.toEqual(Array.from(b.echantillons));
  });

  it("graine à 0 : le bruit change d'une exécution à l'autre", async () => {
    // Comportement voulu pour un générateur de bruit — c'est le hasard qu'on
    // vient y chercher. La graine se fixe seulement quand on veut garder un
    // rendu précis.
    const a = await bruit(0);
    const b = await bruit(0);
    expect(Array.from(a.echantillons)).not.toEqual(Array.from(b.echantillons));
  });

  it("le message affiche la graine réellement utilisée, y compris tirée au sort", async () => {
    // Sans cela, un bruit obtenu avec une graine à 0 serait définitivement
    // perdu : rien n'indiquerait quoi recopier dans le champ pour le refaire.
    const tiree = await bruit(0);
    const graine = Number(/graine (\d+)/.exec(tiree.message)?.[1]);
    expect(Number.isInteger(graine)).toBe(true);
    expect(graine).toBeGreaterThan(0);
    // Et cette graine, recopiée dans le champ, redonne bien le même bruit.
    const rejouee = await bruit(graine);
    expect(Array.from(rejouee.echantillons)).toEqual(Array.from(tiree.echantillons));
  });
});

describe("graine de la pièce de Lucier", () => {
  // Ici la graine par défaut est FIXE, à l'inverse du bruit : la pièce est le
  // sujet de l'œuvre, et vingt itérations dans une pièce chaque fois différente
  // ne donneraient jamais deux fois le même résultat.
  async function lucier(params: Record<string, string | number>) {
    const f = registre.trouverDef("piece-lucier")!;
    const source = new AudioBuffer({ numberOfChannels: 1, length: 4410, sampleRate: 44100 });
    const d = source.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.sin(2 * Math.PI * 220 * i / 44100) * 0.5;
    const res = await f.executer({
      ...ctxParams({ Itérations: 2, Type: "Room", Taille: 50, Decay: 0.3, "Pre-delay": 0, Damping: 30, ...params }),
      entree: () => source,
      runtime: null,
    } as any);
    return (res.valeurs[0] as AudioBuffer).getChannelData(0);
  }

  it("sans rien régler, deux exécutions donnent la même pièce", async () => {
    expect(Array.from(await lucier({}))).toEqual(Array.from(await lucier({})));
  });

  it("changer la graine donne une autre pièce", async () => {
    expect(Array.from(await lucier({ Graine: 1 }))).not.toEqual(Array.from(await lucier({ Graine: 2 })));
  });
});
