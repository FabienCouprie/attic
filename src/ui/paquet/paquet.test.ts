// ui/paquet/paquet.test.ts — L'aller-retour d'un paquet `.attic` : rien de recalculé, tout à l'octet.
//
// LE CACHE EST CELUI DE LA VRAIE BOUCLE DU MOTEUR, `executerLesNoeuds` de `core/execution.ts` : un
// premier run le remplit, le paquet l'emporte, la relecture le rend, et un second run sur le cache
// relu dit QUI TOURNE. C'est le seul compte qui vaille : un nœud repris du cache et un nœud recalculé
// finissent tous deux avec un résultat, et seule l'exécution les distingue.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configurerServicesDomaine, oublierServicesDomaine } from "../../core/services-domaine";
import { creerTablesDePasse, executerLesNoeuds, type QuestionsDuRetour } from "../../core/execution";
import type { EntreeDeCache } from "../../core/cache-execution";
import type { AreteG, NoeudG } from "../../core/meta";
import type { ContexteExecution, FonctionPlugin, PluginDef } from "../../core/types";
import { depuisPaquetAudio, versPaquetAudio } from "../../audio/paquet-audio";
import { ecrirePaquet } from "./ecrire-paquet";
import { lirePaquet } from "./lire-paquet";
import { ecrireZip, extraire, lireRepertoire, RefusPaquet } from "./zip";
import { comparerVersions, sha256 } from "./format-paquet";

beforeAll(() => configurerServicesDomaine({
  empreinte: (v) => (v instanceof AudioBuffer ? `AudioBuffer(${v.length},${v.sampleRate},${v.numberOfChannels})` : null),
  versPaquet: versPaquetAudio, depuisPaquet: depuisPaquetAudio,
}));
afterAll(() => oublierServicesDomaine());

type Ctx = ContexteExecution<unknown, null>;
const son = (n: number, f: (i: number, c: number) => number) => {
  const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: 48000 });
  for (let c = 0; c < 2; c++) b.copyToChannel(Float32Array.from({ length: n }, (_, i) => f(i, c)), c);
  return b;
};
const FICHES: Record<string, PluginDef<unknown, unknown>> = {
  source: { sorties: [{ nom: "S", type: "audio" }], executer: async () => ({
    valeurs: [son(3000, (i, c) => Math.sin(i / (7 + c)) * 0.4)], message: "source prête",
    affichage: { forme: new Float32Array([0.1, 0.2]) },
  }) },
  gain: { sorties: [{ nom: "S", type: "audio" }, { nom: "Z", type: "zones" }], executer: async (ctx: Ctx) => {
    const e = ctx.entree(0) as AudioBuffer;
    return { valeurs: [son(e.length, (i, c) => e.getChannelData(c)[i] * 0.5), [{ debut: 0, duree: undefined }]] };
  } },
  sortie: { sorties: [{ nom: "S", type: "audio" }], executer: async (ctx: Ctx) => ({ valeurs: [ctx.entree(0)] }) },
  carte: { sorties: [{ nom: "S", type: "x" }], executer: async () => ({ valeurs: [new Map([["a", 1]])] }) },
  disque: { sorties: [{ nom: "S", type: "x" }], executer: async () => ({ valeurs: [1], message: "écrit dans C:\\Users\\moi\\carte.html" }) },
  jamais: { sorties: [{ nom: "S", type: "x" }], jamaisCache: true, executer: async () => ({ valeurs: [42] }) },
} as unknown as Record<string, PluginDef<unknown, unknown>>;

const NOEUDS: NoeudG[] = ["a:source", "b:gain", "c:sortie", "d:carte", "e:jamais", "f:disque"]
  .map((s) => { const [id, ficheId] = s.split(":"); return { id, data: { ficheId, parametres: { Gain: 0.5 } } }; });
const ARETES: AreteG[] = [
  { id: "ab", source: "a", target: "b", sourceHandle: "out:0", targetHandle: "in:0" },
  { id: "bc", source: "b", target: "c", sourceHandle: "out:0", targetHandle: "in:0" },
];
const NEUTRES: QuestionsDuRetour = { porterALaFrequenceDeTravail: async (v) => [...v], heriterDesEntrees: () => {}, ecartNiveau: () => undefined, frequencesMelees: () => [] };

async function run(cache: Map<string, EntreeDeCache>, cacheSeulement = false) {
  const tourne: string[] = [];
  const tables = creerTablesDePasse();
  await executerLesNoeuds<null>(
    { ordreFiltre: NOEUDS.map((n) => n.id), nds: NOEUDS, aretesG: ARETES, noeudsEnErreur: new Set(), plat: { expansions: new Map() } },
    tables,
    {
      runtime: null, repertoireTravail: "", signal: new AbortController().signal,
      trouverDef: (f) => FICHES[f], trouverPlugin: (f) => FICHES[f]?.executer as FonctionPlugin<unknown, null> | undefined,
      typeFlux: () => undefined, canoniser: (_p, v) => v, graineDuNoeud: (_id, _nom, brut) => brut,
      lireCache: (id) => cache.get(id), ecrireCache: (id, e) => cache.set(id, e),
      sauts: { copieSautee: () => false, finReprise: () => false, empreintePour: () => undefined },
      questions: () => NEUTRES, poser: () => {}, poserOmbre: () => {}, t: (cle) => cle, cacheSeulement,
      quandUnNoeudAFini: (id) => { tourne.push(id); },
    },
  );
  return { tourne, tables };
}

/** Une valeur dite en octets : chaque échantillon, chaque tableau, sa classe. */
function octets(v: unknown): unknown {
  if (v instanceof AudioBuffer) return { f: v.sampleRate, c: Array.from({ length: v.numberOfChannels }, (_, c) => Array.from(new Uint8Array(Float32Array.from(v.getChannelData(c)).buffer))) };
  if (ArrayBuffer.isView(v)) return { classe: v.constructor.name, o: Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
  if (Array.isArray(v)) return v.map(octets);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, octets(x)]));
  return v === undefined ? "<undefined>" : v;
}

const PROJET = JSON.stringify({ formatVersion: 1, nodes: NOEUDS, edges: ARETES }, null, 2);
const voix = new File([new Uint8Array([82, 73, 70, 70, 1, 2, 3])], "voix.wav", { type: "audio/wav", lastModified: 1_600_000_000_000 });
const ecrire = (cache: Map<string, EntreeDeCache>, o: { application?: string; plafond?: number } = {}) => ecrirePaquet({
  projet: PROJET, cache, application: o.application ?? "9.9.9", plafond: o.plafond,
  noeuds: [{ id: "a", data: { ficheId: "source", audioFichier: voix, modeleFichier: new File(["poids"], "m.onnx") } }],
  jamaisCache: (id) => id === "e",
});

describe("un paquet rouvert ne recalcule rien de ce qu'il porte", () => {
  it("LE SECOND RUN NE FAIT TOURNER QUE CE QUE LE PAQUET N'A PAS PU EMPORTER, et rend les mêmes octets", async () => {
    const cache = new Map<string, EntreeDeCache>();
    const premier = await run(cache);
    expect(premier.tourne).toEqual(["a", "b", "c", "d", "e", "f"]);

    const ecrit = await ecrire(cache);
    expect(ecrit.cache, "emportés : la chaîne entière").toEqual(["a", "b", "c"]);
    expect(ecrit.ecartes.map((e) => `${e.id}:${e.code}`).sort()).toEqual(["d:type", "f:chemin"]);

    const lu = await lirePaquet(ecrit.octets, { application: "9.9.9" });
    expect(lu.projet, "le projet est le texte même de l'export").toBe(PROJET);
    expect([...lu.cache.keys()]).toEqual(["a", "b", "c"]);
    for (const id of ["a", "b", "c"]) {
      const avant = cache.get(id)!, apres = lu.cache.get(id)!;
      for (const cle of ["hashParams", "hashEntree", "hashSorties", "hashValeursEntree"] as const) expect(apres[cle], `${id}.${cle}`).toBe(avant[cle]);
      expect(octets(apres.valeurs), `${id}.valeurs`).toEqual(octets(avant.valeurs));
      expect(octets(apres.affichage), `${id}.affichage`).toEqual(octets(avant.affichage));
      expect([apres.message, apres.tempsExecution, apres.consulteSorties]).toEqual([avant.message, avant.tempsExecution, avant.consulteSorties]);
    }
    // LA SORTIE REND SON ENTRÉE, MÊME OBJET : relue, elle est encore le même tampon que celui de b.
    expect(lu.cache.get("c")!.valeurs[0]).toBe(lu.cache.get("b")!.valeurs[0]);

    const second = await run(lu.cache);
    expect(second.tourne, "seuls l'écarté, le chemin absolu et le jamais-caché tournent").toEqual(["d", "e", "f"]);
    for (const id of ["a", "b", "c"]) {
      expect(octets(second.tables.resultats.get(id)), id).toEqual(octets(premier.tables.resultats.get(id)));
    }
  });

  it("UNE PASSE DE REPOSE N'EXÉCUTE RIEN, et pose ce que le cache tient", async () => {
    const cache = new Map<string, EntreeDeCache>();
    await run(cache);
    const lu = await lirePaquet((await ecrire(cache)).octets, { application: "9.9.9" });
    const repose = await run(lu.cache, true);
    expect(repose.tourne).toEqual([]);
    expect([...repose.tables.resultats.keys()]).toEqual(["a", "b", "c"]);
    expect(repose.tables.messages.get("a")).toBe("source prête");
  });

  it("LES MÉDIAS CHARGÉS PARTENT, ET LE MODÈLE NON", async () => {
    const lu = await lirePaquet((await ecrire(new Map())).octets, { application: "9.9.9" });
    const f = lu.medias.get("a")!.audioFichier as File;
    expect([f.name, f.type, f.lastModified]).toEqual(["voix.wav", "audio/wav", 1_600_000_000_000]);
    expect(new Uint8Array(await f.arrayBuffer())).toEqual(new Uint8Array(await voix.arrayBuffer()));
    expect(Object.keys(lu.medias.get("a")!)).toEqual(["audioFichier"]);
  });

  it("UN PAQUET D'UN ATTIC PLUS ANCIEN REND SON CACHE, et le second run ne recalcule rien de plus", async () => {
    const cache = new Map<string, EntreeDeCache>();
    await run(cache);
    const lu = await lirePaquet((await ecrire(cache, { application: "9.9.8" })).octets, { application: "9.10.0" });
    expect([...lu.cache.keys()]).toEqual(["a", "b", "c"]);
    expect(lu.application).toBe("9.9.8");
    expect(lu.medias.get("a")?.audioFichier).toBeInstanceOf(File);
    expect((await run(lu.cache)).tourne).toEqual(["d", "e", "f"]);
  });

  it("UN PAQUET D'UN ATTIC PLUS RÉCENT EST REFUSÉ ENTIER, sa version pour détail ; une version illisible aussi", async () => {
    const cache = new Map<string, EntreeDeCache>();
    await run(cache);
    const refus = async (ecrit: string, lecteur: string) => {
      const e = await lirePaquet((await ecrire(cache, { application: ecrit })).octets, { application: lecteur }).catch((x: unknown) => x);
      return e instanceof RefusPaquet ? `${e.code}:${e.detail}` : "ouvert";
    };
    expect(await refus("9.10.0", "9.9.8")).toBe("application:9.10.0");
    expect(await refus("10.0.0-beta.1", "9.99.99")).toBe("application:10.0.0-beta.1");
    expect(await refus("5.2.0", "5.2.0-beta.3"), "une version vient après ses préversions").toBe("application:5.2.0");
    expect(await refus("v5.1.2", "5.1.2")).toMatch(/^manifeste:version d'Attic illisible/);
    expect(await refus("5.1.2", "inconnue")).toMatch(/^manifeste:/);
    expect(await refus("inconnue", "inconnue"), "deux versions égales ne se comparent pas : elles s'ouvrent").toBe("ouvert");
    expect(await refus("5.2.0-beta.3", "5.2.0")).toBe("ouvert");
  });

  it("LES VERSIONS SE RANGENT DANS L'ORDRE DE SEMVER, nombres en nombres", () => {
    const rangees = ["1.0.0-1", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2",
      "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.1", "1.0.10", "1.2.0", "1.10.0", "2.0.0", "10.0.0"];
    for (let i = 0; i < rangees.length; i++) {
      for (let j = 0; j < rangees.length; j++) {
        expect(comparerVersions(rangees[i], rangees[j]), `${rangees[i]} / ${rangees[j]}`).toBe(Math.sign(i - j));
      }
    }
    expect(comparerVersions("5.1.2+build.7", "5.1.2")).toBe(0);
    for (const x of ["5.1", "5.1.2.3", "v5.1.2", "05.1.2x", "5.1.2-", "", "inconnue"]) expect(comparerVersions(x, "5.1.2"), x).toBeNull();
  });

  it("CE QUI FERAIT DÉPASSER LE PLAFOND EST ÉCARTÉ, et le paquet reste sous lui", async () => {
    const cache = new Map<string, EntreeDeCache>();
    await run(cache);
    const plafond = new TextEncoder().encode(PROJET).length + 32 * 1024 ** 2 + 100;
    const ecrit = await ecrire(cache, { plafond });
    expect(ecrit.ecartes.filter((e) => e.code === "plafond").map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(ecrit.ecartes.find((e) => e.champ === "audioFichier")).toBeUndefined();
  });
});

/** Les entrées d'un paquet, décompressées, pour en fabriquer un abîmé. */
async function entreesDe(z: Uint8Array): Promise<Map<string, Uint8Array>> {
  const r = lireRepertoire(z);
  const m = new Map<string, Uint8Array>();
  for (const [nom, e] of r) m.set(nom, await extraire(z, e, 1e9));
  return m;
}
const json = (o: Uint8Array) => JSON.parse(new TextDecoder().decode(o));
const enOctets = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));
async function rezip(m: Map<string, Uint8Array>) { return ecrireZip([...m].map(([nom, octets]) => ({ nom, octets, compresser: nom.endsWith(".json") }))); }
const refus = async (z: Uint8Array, plafond?: number) => {
  try { await lirePaquet(z, { application: "9.9.9", plafond }); } catch (e) { if (e instanceof RefusPaquet) return e.code; throw e; }
  return "accepté";
};

describe("un paquet abîmé est refusé, en entier", () => {
  let sain: Uint8Array;
  beforeAll(async () => {
    const cache = new Map<string, EntreeDeCache>();
    await run(cache);
    sain = (await ecrire(cache)).octets;
  });
  const avec = async (f: (m: Map<string, Uint8Array>) => void | Promise<void>) => {
    const m = await entreesDe(sain);
    await f(m);
    return rezip(m);
  };
  const manifeste = (f: (j: Record<string, any>) => void) => avec((m) => { const j = json(m.get("paquet.json")!); f(j); m.set("paquet.json", enOctets(j)); });

  it("LE PAQUET SAIN S'OUVRE : le témoin des refus qui suivent", async () => {
    expect(await refus(sain)).toBe("accepté");
    expect(await refus(await avec(() => {}))).toBe("accepté");
  });

  it("SANS MANIFESTE, D'UN AUTRE FORMAT, D'UNE VERSION FUTURE", async () => {
    expect(await refus(await avec((m) => { m.delete("paquet.json"); }))).toBe("manifeste");
    expect(await refus(await manifeste((j) => { j.format = "autre"; }))).toBe("manifeste");
    expect(await refus(await manifeste((j) => { j.version = 2; }))).toBe("version");
    expect(await refus(await manifeste((j) => { j.version = "1"; }))).toBe("manifeste");
    expect(await refus(await manifeste((j) => { j.entrees = j.entrees.filter((e: { nom: string }) => e.nom !== "donnees.json"); }))).toBe("manifeste");
  });

  it("UNE ENTRÉE NOMMÉE ABSENTE, D'UNE AUTRE TAILLE, D'UNE AUTRE EMPREINTE", async () => {
    expect(await refus(await avec((m) => { m.delete("donnees/000000.bin"); }))).toBe("absente");
    expect(await refus(await manifeste((j) => { j.entrees[0].octets += 1; }))).toBe("taille");
    const faux = await avec((m) => { const p = m.get("projet.json")!.slice(); p[5] ^= 1; m.set("projet.json", p); });
    expect(await refus(faux)).toBe("empreinte");
  });

  it("UNE BOMBE : la somme déclarée dépasse le plafond, et rien n'est décompressé", async () => {
    expect(await refus(sain, 1000)).toBe("plafond");
  });

  it("UN PROJET QUI N'EST PAS UN OBJET, DES DONNÉES SANS LEUR FORME", async () => {
    const remplacer = (nom: string, contenu: Uint8Array) => avec(async (m) => {
      m.set(nom, contenu);
      const j = json(m.get("paquet.json")!);
      const e = j.entrees.find((x: { nom: string }) => x.nom === nom);
      e.octets = contenu.length; e.sha256 = await sha256(contenu);
      m.set("paquet.json", enOctets(j));
    });
    expect(await refus(await remplacer("projet.json", enOctets([1, 2])))).toBe("projet");
    expect(await refus(await remplacer("projet.json", new TextEncoder().encode("{pas du json")))).toBe("projet");
    expect(await refus(await remplacer("donnees.json", enOctets({ cache: {} })))).toBe("donnees");
  });

  it("UNE ENTRÉE INCONNUE EST IGNORÉE SANS ÊTRE LUE, mais un nom qui sort de l'archive fait tout refuser", async () => {
    const m = await entreesDe(sain);
    const z = await ecrireZip([...[...m].map(([nom, octets]) => ({ nom, octets })), { nom: "plus/tard.bin", octets: new Uint8Array(9), compresser: true }]);
    // L'ENTRÉE INCONNUE EST CORROMPUE APRÈS COUP : la lire la ferait tomber au CRC.
    const r = lireRepertoire(z).get("plus/tard.bin")!;
    const abime = z.slice(); abime[r.debut] ^= 0xff;
    const lu = await lirePaquet(abime, { application: "9.9.9" });
    expect(lu.ignorees).toEqual(["plus/tard.bin"]);
    expect(lu.cache.size).toBe(3);
    // LE MÊME PAQUET, L'ENTRÉE INCONNUE RENOMMÉE À LONGUEUR ÉGALE POUR SORTIR DE L'ARCHIVE.
    const slip = z.slice();
    const evil = new TextEncoder().encode("../tard.bin__");
    expect(evil.length).toBe("plus/tard.bin".length);
    const dv = new DataView(slip.buffer);
    const fin = slip.length - 22;
    let o = dv.getUint32(fin + 16, true);
    for (let k = 0; k < dv.getUint16(fin + 10, true); k++) {
      const l = dv.getUint16(o + 28, true);
      if (new TextDecoder().decode(slip.subarray(o + 46, o + 46 + l)) === "plus/tard.bin") {
        slip.set(evil, o + 46); slip.set(evil, dv.getUint32(o + 42, true) + 30);
      }
      o += 46 + l;
    }
    expect(await refus(slip)).toBe("chemin");
  });
});
