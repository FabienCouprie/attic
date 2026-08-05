// @vitest-environment jsdom
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";
import { validerGraphe } from "../core/validation";
import { resoudreEntree } from "../core/graphe";
import { calculerProfilBruit, reduireBruit } from "../audio/effets-dynamique";
import type { AreteG } from "../core/meta";
import type { FicheAudio } from "../audio/types-domaine";

function bruitBlanc(dureeS: number, sr = 44100): AudioBuffer {
  const len = Math.round(dureeS * sr);
  const buf = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  return buf;
}

function signalAvecBruit(signalAmp: number, bruitAmp: number, sr = 44100): AudioBuffer {
  const len = 2 * sr;
  const buf = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const signal = signalAmp * Math.sin(2 * Math.PI * 440 * t);
    const bruit = bruitAmp * (Math.random() * 2 - 1);
    ch[i] = signal + bruit;
  }
  return buf;
}

function bruitHum(dureeS: number, fHum: number, sr = 44100): AudioBuffer {
  const len = Math.round(dureeS * sr);
  const buf = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.sin((2 * Math.PI * fHum * i) / sr);
  return buf;
}

function signalAvecHum(signalAmp: number, humAmp: number, fHum: number, sr = 44100): AudioBuffer {
  const len = 2 * sr;
  const buf = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    ch[i] = signalAmp * Math.sin(2 * Math.PI * 440 * t) + humAmp * Math.sin(2 * Math.PI * fHum * t);
  }
  return buf;
}

function rms(buf: AudioBuffer): number {
  let s = 0;
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < ch.length; i++) { s += ch[i] * ch[i]; n++; }
  }
  return Math.sqrt(s / n);
}

describe("profil-bruit + réduction-bruit en graphe", () => {
  it("les ports controle sont compatibles", () => {
    expect(registre.fluxCompatibles("controle", "controle")).toBe(true);
  });

  it("validerGraphe accepte la connexion profil → réduction", () => {
    const noeuds: any[] = [
      { id: "n1", data: { ficheId: "profil-bruit" } },
      { id: "n2", data: { ficheId: "reduction-bruit" } },
    ];
    const aretes: AreteG[] = [
      { id: "e1", source: "n1", target: "n2", sourceHandle: "out:0", targetHandle: "in:1" },
      { id: "e2", source: "src", target: "n2", sourceHandle: "out:0", targetHandle: "in:0" },
    ];
    const v = validerGraphe(noeuds, aretes, (id) => registre.trouverDef(id), registre.fluxCompatibles);
    expect(v.aretesInvalides.length).toBe(0);
    expect(v.noeudsAffectes.get("n2")).toBeUndefined();
  });

  it("le couple de nœuds réduit l'énergie du bruit", async () => {
    // Profil plus long pour stabiliser la moyenne avec une FFT grande (8192)
    const bruit = bruitBlanc(1.5);
    const profil = calculerProfilBruit(bruit);
    const melange = signalAvecBruit(0.5, 0.2);
    const rmsAvant = rms(melange);
    const reduit = reduireBruit(melange, profil, 0.7);
    const rmsApres = rms(reduit);
    expect(reduit).toBeInstanceOf(AudioBuffer);
    expect(reduit.length).toBe(melange.length);
    expect(rmsApres).toBeLessThan(rmsAvant);
  });

  it("le nœud réduction-bruit renvoie l'audio original si le profil est vide", async () => {
    const def = registre.trouverDef("reduction-bruit") as FicheAudio | undefined;
    expect(def).toBeDefined();
    const audio = bruitBlanc(0.5);
    const profilVide = new Float32Array(4097);
    const res = await def!.executer({
      entree: (i: number) => (i === 0 ? audio : profilVide),
      paramNombre: (_: string, d: number) => d,
      paramTexte: (_: string, d: string) => d,
    } as any);
    expect(res.valeurs[0]).toBe(audio);
    expect(res.message).toContain("vide");
  });

  it("le nœud profil-bruit avertit si le bruit est silencieux", async () => {
    const def = registre.trouverDef("profil-bruit") as FicheAudio | undefined;
    expect(def).toBeDefined();
    const silence = new AudioBuffer({ numberOfChannels: 1, length: 44100, sampleRate: 44100 });
    const res = await def!.executer({
      entree: (_: number) => silence,
      paramNombre: (_: string, d: number) => d,
    } as any);
    expect(res.valeurs[0]).toBeInstanceOf(Float32Array);
    expect(res.message).toContain("vide");
  });

  it("les paramètres Réduction et Plancher ont une métadonnée complète", () => {
    const def = registre.trouverDef("reduction-bruit") as FicheAudio | undefined;
    expect(def).toBeDefined();
    const reduction = def!.parametres.find((p) => p.nom === "Réduction");
    expect(reduction).toBeDefined();
    expect(reduction!.type).toBe("nombre");
    expect(reduction!.plage).toEqual([0, 100]);
    expect(reduction!.defaut).toBe(100);
    const plancher = def!.parametres.find((p) => p.nom === "Plancher");
    expect(plancher).toBeDefined();
    expect(plancher!.type).toBe("nombre");
    expect(plancher!.defaut).toBe(1);
  });

  it("le nœud réduction-bruit expose le mode Notches et les paramètres associés", () => {
    const def = registre.trouverDef("reduction-bruit") as FicheAudio | undefined;
    expect(def).toBeDefined();
    const mode = def!.parametres.find((p) => p.nom === "Mode");
    expect(mode).toBeDefined();
    expect(mode!.type).toBe("choix");
    expect(mode!.options).toContain("Notches");
    const notches = def!.parametres.find((p) => p.nom === "Notches");
    expect(notches).toBeDefined();
    expect(notches!.type).toBe("nombre");
    const q = def!.parametres.find((p) => p.nom === "Q");
    expect(q).toBeDefined();
    expect(q!.type).toBe("nombre");
  });

  it("le mode Notches réduit un ronflement sinusoïdal", async () => {
    const def = registre.trouverDef("reduction-bruit") as FicheAudio | undefined;
    expect(def).toBeDefined();
    // fréquence alignée sur un bin FFT (≈ 129.2 Hz) pour un test reproductible
    const fHum = (44100 / 2048) * 6;
    const hum = bruitHum(1, fHum);
    const profil = calculerProfilBruit(hum);
    const melange = signalAvecHum(0.3, 0.2, fHum);
    const rmsAvant = rms(melange);
    const res = await def!.executer({
      entree: (i: number) => (i === 0 ? melange : profil),
      paramNombre: (_: string, d: number) => d,
      paramTexte: (nom: string, d: string) => (nom === "Mode" ? "Notches" : d),
    } as any);
    const reduit = res.valeurs[0] as AudioBuffer;
    expect(reduit).toBeInstanceOf(AudioBuffer);
    const rmsApres = rms(reduit);
    expect(rmsApres).toBeLessThan(rmsAvant * 0.9);
  });

  it("resoudreEntree renvoie bien le Float32Array sur le port Profil", () => {
    const resultats = new Map<string, any[]>();
    const profil = new Float32Array([1, 2, 3]);
    resultats.set("n1", [profil]);
    const aretes: AreteG[] = [
      { id: "e1", source: "n1", target: "n2", sourceHandle: "out:0", targetHandle: "in:1" },
    ];
    const v = resoudreEntree("n2", 1, aretes, resultats);
    expect(v).toBe(profil);
    expect(v instanceof Float32Array).toBe(true);
  });
});
