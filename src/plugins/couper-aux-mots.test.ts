// plugins/couper-aux-mots.test.ts — Le montage aux frontières de mots.
//
// LE SIGNAL D'ESSAI EST MARQUÉ RÉGION PAR RÉGION, et c'est ce qui donne à cette batterie sa
// précision : chaque mot occupe une plage remplie d'une valeur qui lui est propre. Le tampon rendu
// dit alors lequel a été gardé et lequel a été jeté, au lieu de laisser une durée en décider, ce
// qu'une durée fait mal dès que deux mots ont la même.
//
// Le double du moteur a la même raison d'être que dans `vosk-asr.test.ts` : `vosk-browser` est un
// paquet UMD qui porte son WebAssembly, pose un global et lance son propre worker, et rien de cela
// ne tourne sous Node. Ce qui se teste ici est le MONTAGE, qui n'a pas besoin de lui.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { MotVosk } from "./vosk-asr";
import type { Segment } from "../audio/silences";

const espion = vi.hoisted(() => ({
  fichiers: [] as string[],
  grammaires: [] as (string[] | undefined)[],
  reponse: { texte: "", mots: [] as { word: string; start: number; end: number; conf: number }[] },
}));

vi.mock("./vosk-asr", async (original) => {
  const vrai = await original<typeof import("./vosk-asr")>();
  return {
    ...vrai,
    chargerModele: async (fichier: string) => { espion.fichiers.push(fichier); return {} as never; },
    transcrire: async (_m: never, _s: Float32Array, o?: { grammaire?: string[] }) => {
      espion.grammaires.push(o?.grammaire);
      return espion.reponse;
    },
  };
});

const {
  complement, fiches, forme, listeDeMots, motsRetenus, planDeCoupe,
} = await import("./couper-aux-mots");
const { MODELES } = await import("./vosk-asr");

const fiche = () => {
  const f = fiches.find((x) => x.id === "couper-aux-mots");
  if (!f) throw new Error("fiche couper-aux-mots introuvable");
  return f;
};

const mot = (word: string, start: number, end: number): MotVosk => ({ word, start, end, conf: 1 });

// Quatre kilohertz : `AudioBuffer` refuse en dessous de trois mille, et le compte reste rond.
const FREQ = 4000;

/** Des réglages complets, dont on ne change que ce que le cas éprouve. */
const reglages = (x: Partial<Parameters<typeof planDeCoupe>[1]> = {}) => ({
  liste: [], retirer: false, margeMs: 0, partout: true, frequence: FREQ, longueur: 40_000, ...x,
});

/**
 * Une prise dont chaque région porte sa propre valeur, et les mots qui la décrivent.
 *
 * `vide` remplit l'intervalle d'avant le mot : c'est ce qui sépare deux mots, et ce qu'on doit
 * retrouver ou ne pas retrouver selon la portée.
 */
function priseMarquee(
  regions: { mot?: string; duree: number; valeur: number }[], canaux = 1,
): { buffer: AudioBuffer; mots: MotVosk[] } {
  const total = regions.reduce((s, r) => s + r.duree, 0);
  const buffer = new AudioBuffer({
    numberOfChannels: canaux, length: Math.round(total * FREQ), sampleRate: FREQ,
  });
  const mots: MotVosk[] = [];
  let t = 0;
  for (const r of regions) {
    const premier = Math.round(t * FREQ);
    const dernier = Math.round((t + r.duree) * FREQ);
    for (let c = 0; c < canaux; c++) {
      const d = buffer.getChannelData(c);
      // Le second canal porte l'opposé : un montage qui déciderait canal par canal s'y verrait.
      for (let i = premier; i < dernier; i++) d[i] = c === 0 ? r.valeur : -r.valeur;
    }
    if (r.mot) mots.push(mot(r.mot, t, t + r.duree));
    t += r.duree;
  }
  return { buffer, mots };
}

/** Les valeurs distinctes d'un canal, dans l'ordre où elles paraissent. */
function valeurs(b: AudioBuffer, canal = 0): number[] {
  const d = b.getChannelData(canal);
  const out: number[] = [];
  for (let i = 0; i < d.length; i++) {
    if (out.length === 0 || Math.abs(d[i] - out[out.length - 1]) > 1e-6) out.push(d[i]);
  }
  return out.map((x) => Number(x.toFixed(3)));
}

async function lancer(audio: AudioBuffer | null, r: Record<string, string | number> = {}) {
  const progres: string[] = [];
  const ctx = {
    entree: () => audio,
    paramTexte: (n: string, d: string) => String(r[n] ?? d),
    paramNombre: (n: string, d: number) => Number(r[n] ?? d),
    onProgress: (t: string) => progres.push(t),
  } as never;
  return { ...(await fiche().executer(ctx)), progres };
}

describe("la forme sous laquelle deux mots se comparent", () => {
  it("met en minuscules, retire les accents et rogne les espaces", () => {
    expect(forme("Ré")).toBe("re");
    expect(forme("  ÉLÈVE  ")).toBe("eleve");
    expect(forme("do")).toBe("do");
  });

  it("découpe une liste sur les espaces et les virgules, et jette les vides", () => {
    expect(listeDeMots("Do, ré  MI,,")).toEqual(["do", "re", "mi"]);
    expect(listeDeMots("")).toEqual([]);
    expect(listeDeMots("   ")).toEqual([]);
  });
});

describe("les mots que la liste retient", () => {
  const dits = [mot("do", 0, 1), mot("ré", 1, 2), mot("mi", 2, 3)];

  it("garde tout quand la liste est vide, et dans l'ordre", () => {
    expect(motsRetenus(dits, reglages()).map((m) => m.word)).toEqual(["do", "ré", "mi"]);
    // Et la liste vide ne se laisse pas inverser : « Action » n'a rien sur quoi agir.
    expect(motsRetenus(dits, reglages({ retirer: true })).map((m) => m.word)).toEqual(["do", "ré", "mi"]);
  });

  it("ne garde que les mots nommés, ou tous les autres selon l'action", () => {
    expect(motsRetenus(dits, reglages({ liste: ["do", "mi"] })).map((m) => m.word)).toEqual(["do", "mi"]);
    expect(motsRetenus(dits, reglages({ liste: ["do", "mi"], retirer: true })).map((m) => m.word)).toEqual(["ré"]);
  });

  it("compare sans tenir compte des accents ni de la casse", () => {
    expect(motsRetenus(dits, reglages({ liste: ["re"] })).map((m) => m.word)).toEqual(["ré"]);
    expect(motsRetenus([mot("ÉLÈVE", 0, 1)], reglages({ liste: ["eleve"] }))).toHaveLength(1);
  });
});

describe("le plan de coupe", () => {
  it("rend la marge de part et d'autre de chaque mot", () => {
    const { gardes } = planDeCoupe([mot("a", 1, 2)], reglages({ margeMs: 100 }));
    expect(gardes).toEqual([{ debut: 3600, fin: 8400 }]);
  });

  it("ne sort pas du signal, ni avant le début ni après la fin", () => {
    const { gardes } = planDeCoupe([mot("a", 0, 0.5), mot("b", 9.8, 10)],
      reglages({ margeMs: 500, longueur: 40_000 }));
    expect(gardes[0].debut).toBe(0);
    expect(gardes[gardes.length - 1].fin).toBe(40_000);
  });

  it("LA MARGE RECOLLE LES MOTS VOISINS, et c'est ce qui tient une phrase d'un seul tenant", () => {
    const dits = [mot("a", 1, 2), mot("b", 2.15, 3)];
    // Deux marges de cent millisecondes couvrent les cent cinquante de l'intervalle : un morceau.
    expect(planDeCoupe(dits, reglages({ margeMs: 100 })).gardes).toHaveLength(1);
    // Deux marges de cinquante ne les couvrent pas : deux morceaux.
    expect(planDeCoupe(dits, reglages({ margeMs: 50 })).gardes).toHaveLength(2);
  });

  it("remet les mots dans l'ordre du temps avant de recoller", () => {
    // Plusieurs énoncés arrivent par résultats successifs : rien ne garantit l'ordre reçu, et un
    // recollement qui le supposerait écrirait des segments à l'envers.
    const desordre = [mot("b", 5, 6), mot("a", 1, 2)];
    expect(planDeCoupe(desordre, reglages()).gardes).toEqual([
      { debut: 4000, fin: 8000 }, { debut: 20_000, fin: 24_000 },
    ]);
  });

  it("aux bords, ne rend qu'un morceau, du premier mot au dernier", () => {
    const dits = [mot("a", 1, 2), mot("b", 5, 6), mot("c", 8, 9)];
    expect(planDeCoupe(dits, reglages({ partout: false })).gardes)
      .toEqual([{ debut: 4000, fin: 36_000 }]);
    expect(planDeCoupe(dits, reglages({ partout: true })).gardes).toHaveLength(3);
  });

  it("ne rend rien quand la liste ne retient aucun mot", () => {
    const r = planDeCoupe([mot("a", 1, 2)], reglages({ liste: ["z"] }));
    expect(r.gardes).toEqual([]);
    expect(r.retenus).toEqual([]);
  });

  it("écarte un mot dont l'empan est vide, plutôt que d'écrire un segment de longueur nulle", () => {
    expect(planDeCoupe([mot("a", 1, 1)], reglages({ margeMs: 0 })).gardes).toEqual([]);
    // Avec une marge, le même mot a un empan : il reparaît.
    expect(planDeCoupe([mot("a", 1, 1)], reglages({ margeMs: 50 })).gardes)
      .toEqual([{ debut: 3800, fin: 4200 }]);
  });
});

describe("le reste", () => {
  it("prend l'avant, l'entre-deux et l'après", () => {
    const gardes: Segment[] = [{ debut: 100, fin: 200 }, { debut: 500, fin: 600 }];
    expect(complement(gardes, 1000)).toEqual([
      { debut: 0, fin: 100 }, { debut: 200, fin: 500 }, { debut: 600, fin: 1000 },
    ]);
  });

  it("est vide quand tout est gardé, et entier quand rien ne l'est", () => {
    expect(complement([{ debut: 0, fin: 1000 }], 1000)).toEqual([]);
    expect(complement([], 1000)).toEqual([{ debut: 0, fin: 1000 }]);
  });

  it("LE GARDÉ ET LE RESTE FONT LE TOUT, sans recouvrement ni trou", () => {
    const gardes: Segment[] = [{ debut: 0, fin: 120 }, { debut: 300, fin: 450 }];
    const total = (s: readonly Segment[]) => s.reduce((n, x) => n + (x.fin - x.debut), 0);
    expect(total(gardes) + total(complement(gardes, 1000))).toBe(1000);
  });
});

describe("le montage, de bout en bout", () => {
  // Trois mots séparés par du silence marqué : chaque région porte sa propre valeur.
  const scene = () => priseMarquee([
    { duree: 0.5, valeur: 0.01 },
    { mot: "do", duree: 1, valeur: 0.1 },
    { duree: 0.5, valeur: 0.02 },
    { mot: "ré", duree: 1, valeur: 0.2 },
    { duree: 0.5, valeur: 0.03 },
    { mot: "mi", duree: 1, valeur: 0.3 },
    { duree: 0.5, valeur: 0.04 },
  ]);

  it("rend le montage, le reste puis le texte, dans l'ordre déclaré", async () => {
    const { buffer, mots } = scene();
    espion.reponse = { texte: "do ré mi", mots };
    const r = await lancer(buffer, { Portée: "partout", Marge: 0 });
    expect(r.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(r.valeurs[1]).toBeInstanceOf(AudioBuffer);
    expect(r.valeurs[2]).toBe("do ré mi");
  });

  it("GARDE EXACTEMENT LES RÉGIONS DES MOTS, et le reste porte exactement les autres", async () => {
    const { buffer, mots } = scene();
    espion.reponse = { texte: "do ré mi", mots };
    const r = await lancer(buffer, { Portée: "partout", Marge: 0 });
    expect(valeurs(r.valeurs[0] as AudioBuffer)).toEqual([0.1, 0.2, 0.3]);
    expect(valeurs(r.valeurs[1] as AudioBuffer)).toEqual([0.01, 0.02, 0.03, 0.04]);
  });

  it("aux bords, conserve ce qui est entre le premier et le dernier mot", async () => {
    const { buffer, mots } = scene();
    espion.reponse = { texte: "do ré mi", mots };
    const r = await lancer(buffer, { Portée: "bords", Marge: 0 });
    expect(valeurs(r.valeurs[0] as AudioBuffer)).toEqual([0.1, 0.02, 0.2, 0.03, 0.3]);
    expect(valeurs(r.valeurs[1] as AudioBuffer)).toEqual([0.01, 0.04]);
  });

  it("la marge rend du son de part et d'autre, donc un montage plus long", async () => {
    const { buffer, mots } = scene();
    espion.reponse = { texte: "do ré mi", mots };
    const sans = await lancer(buffer, { Portée: "partout", Marge: 0 });
    const avec = await lancer(buffer, { Portée: "partout", Marge: 100 });
    expect((avec.valeurs[0] as AudioBuffer).length)
      .toBe((sans.valeurs[0] as AudioBuffer).length + 6 * 400);
    expect(valeurs(avec.valeurs[0] as AudioBuffer)[0]).toBe(0.01);
  });

  it("la liste garde ou retire les mots nommés", async () => {
    const { buffer, mots } = scene();
    espion.reponse = { texte: "do ré mi", mots };
    const garde = await lancer(buffer, { Portée: "partout", Marge: 0, Mots: "do, mi", Action: "garder" });
    const retire = await lancer(buffer, { Portée: "partout", Marge: 0, Mots: "do, mi", Action: "retirer" });
    expect(valeurs(garde.valeurs[0] as AudioBuffer)).toEqual([0.1, 0.3]);
    expect(garde.valeurs[2]).toBe("do mi");
    expect(valeurs(retire.valeurs[0] as AudioBuffer)).toEqual([0.2]);
    expect(retire.valeurs[2]).toBe("ré");
  });

  it("coupe tous les canaux aux mêmes endroits", async () => {
    const { buffer, mots } = priseMarquee([
      { duree: 0.5, valeur: 0.01 }, { mot: "do", duree: 1, valeur: 0.1 }, { duree: 0.5, valeur: 0.02 },
    ], 2);
    espion.reponse = { texte: "do", mots };
    const r = await lancer(buffer, { Portée: "partout", Marge: 0 });
    const out = r.valeurs[0] as AudioBuffer;
    expect(out.numberOfChannels).toBe(2);
    expect(valeurs(out, 0)).toEqual([0.1]);
    expect(valeurs(out, 1)).toEqual([-0.1]);
  });

  it("LE MONTAGE ET LE RESTE FONT LA PRISE ENTIÈRE", async () => {
    const { buffer, mots } = scene();
    espion.reponse = { texte: "do ré mi", mots };
    const r = await lancer(buffer, { Portée: "partout", Marge: 50 });
    expect((r.valeurs[0] as AudioBuffer).length + (r.valeurs[1] as AudioBuffer).length)
      .toBe(buffer.length);
  });

  it("compte dans son message les mots gardés, les mots dits, et les deux durées", async () => {
    const { buffer, mots } = scene();
    espion.reponse = { texte: "do ré mi", mots };
    const r = await lancer(buffer, { Portée: "partout", Marge: 0, Mots: "do", Action: "garder" });
    expect(r.message).toContain("1 mots gardés sur 3");
    expect(r.message).toContain("5.00 s → 1.00 s");
  });

  it("choisit le fichier de modèle de la langue demandée", async () => {
    const { buffer, mots } = scene();
    espion.reponse = { texte: "do", mots };
    espion.fichiers.length = 0;
    await lancer(buffer, { Langue: "en" });
    await lancer(buffer, { Langue: "fr" });
    expect(espion.fichiers).toEqual([MODELES.en.fichier, MODELES.fr.fichier]);
  });

  it("passe le vocabulaire en grammaire, découpé et sans accents", async () => {
    const { buffer, mots } = scene();
    espion.reponse = { texte: "do", mots };
    espion.grammaires.length = 0;
    await lancer(buffer, { Vocabulaire: "Do, ré  MI" });
    await lancer(buffer, { Vocabulaire: "" });
    expect(espion.grammaires[0]).toEqual(["do", "re", "mi"]);
    expect(espion.grammaires[1]).toEqual([]);
  });

  it("refuse l'absence d'entrée audio, en rendant une valeur par sortie déclarée", async () => {
    const r = await lancer(null);
    expect(r.valeurs).toEqual([null, null, null]);
    expect(r.valeurs).toHaveLength(fiche().sorties.length);
  });

  it("quand aucun mot n'est reconnu, toute la prise passe au reste", async () => {
    const { buffer } = scene();
    espion.reponse = { texte: "", mots: [] };
    const r = await lancer(buffer);
    expect(r.valeurs[0]).toBeNull();
    expect(r.valeurs[1]).toBe(buffer);
    expect(r.message).toContain("Aucun mot reconnu");
  });

  it("quand la liste ne retient rien, le dit et rend la prise au reste", async () => {
    const { buffer, mots } = scene();
    espion.reponse = { texte: "do ré mi", mots };
    const r = await lancer(buffer, { Mots: "sol", Action: "garder" });
    expect(r.valeurs[0]).toBeNull();
    expect(r.valeurs[1]).toBe(buffer);
    expect(r.valeurs[2]).toBe("");
    expect(r.message).toContain("Aucun des 3 mots");
  });
});

describe("déclarations", () => {
  it("prend un audio et rend le montage, le reste et le texte", () => {
    expect(fiche().entrees.map((e) => e.type)).toEqual(["audio"]);
    expect(fiche().sorties.map((s) => s.type)).toEqual(["audio", "audio", "texte"]);
    expect(fiche().sorties.map((s) => s.nom)).toEqual(["Audio", "Reste", "Texte"]);
  });

  it("nomme chacun de ses réglages dans son exécuteur, les traduit et les documente", () => {
    const source = fiche().executer.toString();
    for (const p of fiche().parametres) {
      expect(source.includes(`"${p.nom}"`), p.nom).toBe(true);
      expect(p.nomEn, p.nom).toBeTruthy();
      expect(p.doc, p.nom).toBeTruthy();
      expect(p.docEn, p.nom).toBeTruthy();
    }
  });

  it("écrit chacun de ses réglages et chacune de ses sorties dans sa notice, dans les deux langues", () => {
    for (const p of fiche().parametres) {
      expect(fiche().notice, p.nom).toContain(p.nom);
      expect(fiche().noticeEn, p.nomEn).toContain(p.nomEn!);
    }
    for (const s of fiche().sorties) {
      expect(fiche().notice, s.nom).toContain(s.nom);
    }
  });

  it("offre une langue par modèle livré, et pas une de plus", () => {
    expect(fiche().parametres.find((p) => p.nom === "Langue")?.optionIds).toEqual(Object.keys(MODELES));
  });

  it("et les deux modèles le portent au manifeste, sans quoi rien n'annoncerait leur téléchargement", () => {
    const manifeste = JSON.parse(readFileSync("scripts/modeles-manifest.json", "utf8"));
    for (const { id } of Object.values(MODELES)) {
      const entree = manifeste.modeles.find((m: { id: string }) => m.id === id);
      expect(entree?.noeuds, id).toContain("couper-aux-mots");
    }
  });
});
