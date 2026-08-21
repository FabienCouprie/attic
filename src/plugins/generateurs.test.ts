// plugins/generateurs.test.ts — Tests rapides des nœuds générateurs.
// On passe par le registre pour éviter la dépendance circulaire directe
// entre generateurs.ts et audio/adaptateur.ts.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";

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
