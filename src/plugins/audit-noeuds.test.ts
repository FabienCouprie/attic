// plugins/audit-noeuds.test.ts — Les défauts trouvés par l'audit du 2026-09-22, gardés.
//
// L'audit a exécuté les 388 nœuds du registre, réglages par défaut, puis chaque paramètre varié à
// son tour. Ce fichier garde chaque défaut confirmé et corrigé, EN PASSANT PAR LE REGISTRE : c'est
// le câblage entre le nœud et son calcul qui cassait — un paramètre lu puis jeté, une plage dix
// fois trop étroite, une graine tirée sans être montrée —, et un test du seul calcul ne l'aurait
// pas vu.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { writeMidi } from "midi-file";
import { registre } from "../audio/adaptateur";
import { valeurCanoniqueChoix, defautCanoniqueChoix } from "../i18n";
import { plafonnerCrete } from "../audio/commun";

const SR = 44100;

/** Le son de l'audit : deux notes qui s'attaquent, un peu de bruit, crête vers 0,5. */
function son(): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 2, length: SR, sampleRate: SR });
  let e = 11;
  for (let c = 0; c < 2; c++) {
    const x = new Float32Array(SR);
    for (let i = 0; i < SR; i++) {
      e = (e * 1664525 + 1013904223) >>> 0;
      const t = i / SR, env = Math.exp(-((t % 0.5) * 6));
      x[i] = 0.35 * env * Math.sin(2 * Math.PI * (c ? 330 : 220) * t) + 0.15 * Math.sin(2 * Math.PI * 1375 * t) * env + 0.03 * (e / 4294967296 * 2 - 1);
    }
    b.copyToChannel(x, c);
  }
  return b;
}

function midiGamme(canal = 0): File {
  const trk: any[] = [{ deltaTime: 0, type: "setTempo", microsecondsPerBeat: 500000 }];
  for (const nt of [36, 38, 42, 38, 36, 36, 38, 42]) {
    trk.push({ deltaTime: 0, type: "noteOn", channel: canal, noteNumber: nt, velocity: 100 });
    trk.push({ deltaTime: 240, type: "noteOff", channel: canal, noteNumber: nt, velocity: 0 });
  }
  trk.push({ deltaTime: 0, type: "endOfTrack" });
  return new File([new Uint8Array(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [trk] } as any))], "g.mid", { type: "audio/midi" });
}

async function executer(id: string, reglages: Record<string, unknown> = {}, entrees?: unknown[]) {
  const def: any = registre.trouverDef(id);
  expect(def, id).toBeTruthy();
  const params: Record<string, unknown> = {};
  for (const p of def.parametres) params[p.nom] = p.type === "choix" ? defautCanoniqueChoix(p) : p.defaut;
  Object.assign(params, reglages);
  const ent = entrees ?? (def.entrees ?? []).map((p: any) => (p.type === "audio" ? son() : null));
  const ctx = {
    noeud: { id: "t", data: { parametres: params } }, runtime: null, repertoireTravail: "",
    entree: (i: number) => ent[i] ?? null, entrees: () => ent,
    paramNombre: (n: string, d: number) => (typeof params[n] === "number" ? params[n] as number : d),
    paramTexte: (n: string, d: string) => {
      const p = def.parametres.find((x: any) => x.nom === n);
      return p && typeof params[n] === "string" ? String(valeurCanoniqueChoix(p, params[n] as string)) : d;
    },
    onProgress: () => {}, signal: new AbortController().signal,
  };
  return def.executer(ctx);
}

const crete = (b: AudioBuffer) => {
  let m = 0;
  for (let c = 0; c < b.numberOfChannels; c++) for (const v of b.getChannelData(c)) m = Math.max(m, Math.abs(v));
  return m;
};
const audioDe = (r: any): AudioBuffer => (r.valeurs as unknown[]).find((v) => v instanceof AudioBuffer) as AudioBuffer;
const empreinte = (b: AudioBuffer) => { let s = 0; const d = b.getChannelData(0); for (let i = 0; i < d.length; i += 7) s += Math.abs(d[i]) * ((i % 101) + 1); return `${b.length}:${s.toFixed(5)}`; };

describe("audit du 2026-09-22 : des crêtes qui explosaient aux bords", () => {
  // Le recollement divisait par le poids d'une fenêtre qui tend vers zéro au premier échantillon :
  // exact pour une trame inchangée, explosif dès qu'elle est modifiée. Mesuré avant correction.
  const AVANT: Record<string, number> = { "gel-spectral": 465, "flou-spectral": 77, "tracage-spectral": 44, "glissando-interieur": 214, "voice-changer": 24 };
  for (const id of Object.keys(AVANT)) {
    it(`${id} reste sous la pleine échelle (crête ${AVANT[id]} avant correction)`, async () => {
      const a = audioDe(await executer(id));
      expect(a.getChannelData(0).every(Number.isFinite)).toBe(true);
      expect(crete(a)).toBeLessThan(1);
    });
  }
});

describe("audit du 2026-09-22 : des sommes qui dépassaient la pleine échelle", () => {
  for (const id of ["quadrafuzz", "couleur-rgb", "sequenceur-batterie-avance"]) {
    it(`${id} ne dépasse plus 0,99`, async () => {
      expect(crete(audioDe(await executer(id)))).toBeLessThanOrEqual(0.99 + 1e-6);
    });
  }

  it("le plafond ne touche pas un son qui restait dans la pleine échelle", () => {
    const b = son();
    const avant = Array.from(b.getChannelData(0));
    plafonnerCrete(b);
    expect(Array.from(b.getChannelData(0))).toEqual(avant);
  });
});

describe("audit du 2026-09-22 : des réglages sans effet", () => {
  it("CHANGEMENT DE TEMPO : la fenêtre agit désormais", async () => {
    const court = audioDe(await executer("changement-tempo", { "Tempo (%)": 70, "Fenêtre": 10 }));
    const long = audioDe(await executer("changement-tempo", { "Tempo (%)": 70, "Fenêtre": 200 }));
    expect(empreinte(court)).not.toBe(empreinte(long));
  });

  it("RETARD SPECTRAL : la réaction couvre enfin 0 à 95 %, et s'entend", async () => {
    const def: any = registre.trouverDef("retard-spectral");
    expect(def.parametres.find((p: any) => p.nom === "Réaction").plage).toEqual([0, 95]);
    const sans = audioDe(await executer("retard-spectral", { "Réaction": 0 }));
    const avec = audioDe(await executer("retard-spectral", { "Réaction": 80 }));
    expect(empreinte(sans)).not.toBe(empreinte(avec));
  });

  for (const id of ["generateur-fractal", "melodie-aleatoire"]) {
    it(`${id} : le volume agit aussi en FM`, async () => {
      const graine = id === "melodie-aleatoire" ? { Graine: 7 } : {};
      const fort = crete(audioDe(await executer(id, { ...graine, Volume: 100 })));
      const faible = crete(audioDe(await executer(id, { ...graine, Volume: 25 })));
      expect(faible / fort).toBeCloseTo(0.25, 2);
    });
  }
});

describe("audit du 2026-09-22 : un hasard qui ne se rejouait pas", () => {
  // Graine 0 : tirée au sort, et MONTRÉE dans le message pour qu'un bon résultat se rejoue.
  for (const id of ["decoupe-aleatoire", "multi-reservoirs", "reservoir-textuel"]) {
    it(`${id} montre la graine tirée, et cette graine rejoue le même résultat`, async () => {
      const r = await executer(id, { Graine: 0 });
      const m = /graine\s+(\d+)/i.exec(String(r.message));
      expect(m, String(r.message)).toBeTruthy();
      const a = await executer(id, { Graine: Number(m![1]) });
      const b = await executer(id, { Graine: Number(m![1]) });
      const fp = (x: any) => (x.valeurs as unknown[]).map((v) => (v instanceof AudioBuffer ? empreinte(v) : typeof v === "string" ? v : "")).join("|");
      expect(fp(a)).toBe(fp(b));
    });
  }
});

describe("audit du 2026-09-22 : un silence sans explication", () => {
  it("DRUM SYNTH : un MIDI hors du canal 10 est joué, et le message le dit", async () => {
    const r = await executer("drum-synth", {}, [midiGamme(0)]);
    expect(crete(audioDe(r))).toBeGreaterThan(0.01);
    expect(String(r.message)).toMatch(/canal 10 vide|channel 10 empty/);
  });

  it("drum synth : sur le canal 10, rien ne change", async () => {
    const r = await executer("drum-synth", {}, [midiGamme(9)]);
    expect(crete(audioDe(r))).toBeGreaterThan(0.01);
    expect(String(r.message)).not.toMatch(/vide|empty/);
  });
});
