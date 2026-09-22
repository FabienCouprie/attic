// audio/demonstration.test.ts — Le plan et la bande-son d'une démonstration.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import {
  bandeSon, choisirApercu, DECALAGE_SON, ordreDeLecture, dureeJouable, etapesDeLExecution, MARGE_FIN, planifier, segmentA,
  type DescriptionFiche,
} from "./demonstration";
import type { ExecutionCourante } from "../plugins/grapheGlobal";

function sinus(duree: number, f = 440, sr = 44100, canaux = 1): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: canaux, length: Math.round(duree * sr), sampleRate: sr });
  for (let c = 0; c < canaux; c++) {
    const x = b.getChannelData(c);
    for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * f * i) / sr);
  }
  return b;
}

const courbe = { valeurs: new Float32Array([0, 0.5, 1]), cadence: 100 };
const image = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });

const FICHES: Record<string, DescriptionFiche> = {
  source: { nom: "Source", resume: "Un son.", parametres: [{ nom: "Fréquence", defaut: 440 }, { nom: "Fréquence min", defaut: 20, modulationDe: "Fréquence" }] },
  filtre: { nom: "Filtre", resume: "Filtre un son.", parametres: [{ nom: "Coupure", defaut: 1000 }, { nom: "Mode", defaut: "Passe-bas" }] },
  courbe: { nom: "Courbe", resume: "Une courbe.", parametres: [] },
  demo: { nom: "Démonstration", resume: "", parametres: [] },
};

function execution(): ExecutionCourante {
  return {
    ordre: ["d", "s", "f", "c", "vide", "boucle#1", "boucle#2"],
    noeuds: [
      { id: "d", data: { ficheId: "demo" } },
      { id: "s", data: { ficheId: "source", parametres: { "Fréquence": 220 } } },
      { id: "f", data: { ficheId: "filtre", label: "Mon filtre" } },
      { id: "c", data: { ficheId: "courbe" } },
      { id: "vide", data: { ficheId: "filtre" } },
      { id: "boucle#1", data: { ficheId: "filtre" } },
      { id: "boucle#2", data: { ficheId: "filtre" } },
    ],
    resultats: new Map<string, unknown[]>([
      ["d", [image]],
      ["s", [sinus(1)]],
      ["f", [sinus(1, 880), "un message texte"]],
      ["c", [courbe]],
      ["vide", [null]],
      ["boucle#1", [sinus(0.5)]],
      ["boucle#2", [sinus(0.25)]],
    ]),
    aretes: [],
    messages: new Map([["s", "1 s"]]),
    expansions: new Map([["boucle#1", "boucle"], ["boucle#2", "boucle"]]),
  };
}

const etapes = () => etapesDeLExecution(execution(), (id) => FICHES[id] ?? null, (id) => id === "demo");

describe("choisirApercu", () => {
  it("préfère le son, puis l'image, la courbe, le texte", () => {
    const son = sinus(0.1);
    expect(choisirApercu(["texte", courbe, image, son])?.genre).toBe("audio");
    expect(choisirApercu(["texte", courbe, image])?.genre).toBe("image");
    expect(choisirApercu(["texte", courbe])?.genre).toBe("courbe");
    expect(choisirApercu(["texte"])?.genre).toBe("texte");
  });

  it("rien de montrable : null — ni un texte blanc, ni un fichier qui n'est pas une image", () => {
    expect(choisirApercu([null, "   ", new File([], "a.mid", { type: "audio/midi" })])).toBeNull();
    expect(choisirApercu(undefined)).toBeNull();
  });
});

describe("etapesDeLExecution", () => {
  it("suit l'ordre du calcul, écarte la démonstration et ce qui n'a rien rendu", () => {
    expect(etapes().map((e) => e.id)).toEqual(["s", "f", "c", "boucle"]);
  });

  it("le titre est le libellé du nœud s'il en a un, sinon le nom de la fiche", () => {
    const [s, f] = etapes();
    expect(s.titre).toBe("Source");
    expect(f.titre).toBe("Mon filtre");
  });

  it("les réglages : la valeur du nœud, sinon le défaut ; jamais les bornes de modulation", () => {
    const [s, f] = etapes();
    expect(s.reglages).toEqual(["Fréquence : 220"]);
    expect(f.reglages).toEqual(["Coupure : 1000", "Mode : Passe-bas"]);
    expect(s.message).toBe("1 s");
  });

  it("les copies d'une boucle n'ont qu'une étape, avec le résultat du dernier tour", () => {
    const b = etapes()[3];
    expect(b.apercu.genre).toBe("audio");
    expect((b.apercu as { son: AudioBuffer }).son.duration).toBeCloseTo(0.25, 3);
  });
});

describe("ordreDeLecture", () => {
  const ar = (source: string, target: string) => ({ source, target });

  it("suit une chaîne jusqu'au bout avant de passer à la branche suivante", () => {
    // Le moteur a calculé les deux sources d'abord : A, B, puis leurs traitements.
    const aretes = [ar("A", "A1"), ar("A1", "A2"), ar("B", "B1")];
    expect(ordreDeLecture(["A", "B", "A1", "B1", "A2"], aretes)).toEqual(["A", "A1", "A2", "B", "B1"]);
  });

  it("ne montre jamais un nœud avant ce qu'il reçoit : un mélange attend ses deux branches", () => {
    const aretes = [ar("A", "M"), ar("B", "M"), ar("A", "A1")];
    const r = ordreDeLecture(["A", "B", "A1", "M"], aretes);
    expect(r.indexOf("M")).toBeGreaterThan(r.indexOf("B"));
    expect(r.indexOf("M")).toBeGreaterThan(r.indexOf("A"));
    expect(r).toEqual(["A", "A1", "B", "M"]);
  });

  it("sans arête, l'ordre du moteur", () => {
    expect(ordreDeLecture(["C", "A", "B"], [])).toEqual(["C", "A", "B"]);
  });
});

describe("suitLaPrecedente", () => {
  it("vrai quand une arête relie deux étapes, même par un nœud qui n'a rien montré", () => {
    const e = execution();
    e.aretes = [{ source: "s", target: "vide" }, { source: "vide", target: "f" }];
    e.ordre = ["s", "c", "vide", "f"];
    const etapes = etapesDeLExecution(e, (id) => FICHES[id] ?? null, (id) => id === "demo");
    expect(etapes.map((x) => x.id)).toEqual(["s", "f", "c"]);
    expect(etapes.map((x) => x.suitLaPrecedente)).toEqual([false, true, false]);
  });

  it("les réglages traduits sont lus sous leur nom d'origine, avec leur unité", () => {
    const e = execution();
    const anglais = etapesDeLExecution(e, (id) => id === "source"
      ? { nom: "Source", resume: "", parametres: [{ nom: "Frequency", cle: "Fréquence", defaut: 440, unite: "Hz" }] }
      : null, () => false, true);
    expect(anglais[0].reglages).toEqual(["Frequency : 220 Hz"]);
  });
});

describe("planifier", () => {
  it("un segment par étape, bout à bout ; un titre ajoute un carton de 3 s", () => {
    const p = planifier(etapes(), { dureeParNoeud: 5 });
    expect(p.ouverture).toBe(0);
    expect(p.segments.map((s) => s.debut)).toEqual([0, 5, 10, 15]);
    expect(p.duree).toBe(20);
    const t = planifier(etapes(), { dureeParNoeud: 5, titre: "Essai" });
    expect(t.ouverture).toBe(3);
    expect(t.duree).toBe(23);
    expect(segmentA(t, 1)).toBeNull();
    expect(segmentA(t, 8.5)?.index).toBe(1);
    expect(segmentA(t, 99)?.index).toBe(3);
  });
});

describe("bandeSon", () => {
  const SR = 48000;
  const niveau = (b: AudioBuffer, a: number, z: number) => {
    const x = b.getChannelData(0);
    let m = 0;
    for (let i = Math.floor(a * SR); i < Math.floor(z * SR); i++) m = Math.max(m, Math.abs(x[i]));
    return m;
  };

  it("pose chaque son à sa place, silence ailleurs", () => {
    const p = planifier(etapes(), { dureeParNoeud: 4 });
    const b = bandeSon(p, SR);
    expect(b.sampleRate).toBe(SR);
    expect(b.numberOfChannels).toBe(2);
    expect(b.length).toBe(16 * SR);
    expect(niveau(b, 0, DECALAGE_SON - 0.01)).toBe(0);
    expect(niveau(b, DECALAGE_SON + 0.1, DECALAGE_SON + 0.9)).toBeGreaterThan(0.45);
    expect(niveau(b, 1.5, 4)).toBe(0); // le son d'une seconde est fini
    expect(niveau(b, 8, 12)).toBe(0); // la courbe ne s'entend pas
    expect(niveau(b, 12 + DECALAGE_SON + 0.05, 12 + DECALAGE_SON + 0.2)).toBeGreaterThan(0.45);
  });

  it("garde la hauteur en changeant de fréquence d'échantillonnage : 44,1 kHz posé à 48 kHz", () => {
    const p = planifier(etapes().slice(0, 1), { dureeParNoeud: 4 });
    const x = bandeSon(p, SR).getChannelData(0);
    let passages = 0;
    const a = Math.floor((DECALAGE_SON + 0.1) * SR), z = a + SR / 2;
    for (let i = a + 1; i < z; i++) if (x[i - 1] < 0 && x[i] >= 0) passages++;
    expect(passages / 0.5).toBeCloseTo(440, -1);
  });

  it("coupe un son trop long avec un fondu, avant la fin du segment", () => {
    const long = etapes()[0];
    (long.apercu as { son: AudioBuffer }).son = sinus(10);
    const p = planifier([long], { dureeParNoeud: 3 });
    const seg = p.segments[0];
    expect(dureeJouable((long.apercu as { son: AudioBuffer }).son, seg)).toBeCloseTo(3 - DECALAGE_SON - MARGE_FIN, 6);
    const b = bandeSon(p, SR);
    expect(niveau(b, 3 - MARGE_FIN, 3)).toBe(0);
    expect(niveau(b, 3 - MARGE_FIN - 0.03, 3 - MARGE_FIN)).toBeLessThan(0.15);
    expect(niveau(b, 1, 2)).toBeGreaterThan(0.45);
  });

  it("un son mono s'entend sur les deux canaux", () => {
    const p = planifier(etapes().slice(0, 1), { dureeParNoeud: 3 });
    const b = bandeSon(p, SR);
    const i = Math.floor((DECALAGE_SON + 0.5) * SR);
    expect(b.getChannelData(1)[i]).toBe(b.getChannelData(0)[i]);
  });
});
