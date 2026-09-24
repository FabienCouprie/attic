// src/workers/kokoro-local.test.ts — Les deux synthèses Kokoro passent par le même miroir.
//
// CE QUI EST TENU :
//   1. LES DEUX WORKERS emploient le module partagé, et aucun ne redéclare l'identifiant du
//      modèle. C'est le contrat de parité : une migration ne peut pas rester à moitié, l'anglais
//      passant en local sans le français.
//   2. LE RELAIS COUVRE TOUT LE DÉPÔT, le poids comme les voix. Les voix ont leur adresse écrite
//      en dur dans `kokoro-js`, hors de toute configuration ; une mise à jour qui la changerait
//      rendrait le relais muet, et elles repartiraient sur le réseau sans que rien ne le dise. Ce
//      test est le seul endroit qui s'en aperçoive.
//   3. UNE RÉPONSE HTML N'EST JAMAIS PRISE POUR UN FICHIER. Un serveur de développement répond 200
//      et sa page d'accueil pour un chemin inconnu ; le repli de Transformers.js ne teste que 404,
//      donc c'est ici qu'il faut refuser.
//   4. LA VOIX FRANÇAISE est dans le miroir, alors qu'aucune liste de l'interface ne la nomme.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AMONT, AMONT_VOIX, MIROIR, MODEL_ID, miroirPresent, oublierMiroir, poserRelais,
} from "./kokoro-local.js";

const RACINE = resolve(__dirname, "../..");
const lire = (p: string) => readFileSync(resolve(RACINE, p), "utf8");

const WORKERS = ["src/workers/kokoro-tts-worker.js", "src/workers/kokoro-francais-worker.js"];

const reponse = (type: string, corps = "{}", ok = true) =>
  ({ ok, headers: new Headers({ "content-type": type }), json: async () => JSON.parse(corps) }) as unknown as Response;

beforeEach(() => oublierMiroir());

describe("la parité des deux workers", () => {
  it("LES DEUX emploient le module partagé", () => {
    for (const w of WORKERS) {
      const s = lire(w);
      expect(s, w).toContain('from "./kokoro-local.js"');
      expect(s, w).toContain("installerMiroirKokoro()");
    }
  });

  it("AUCUN ne redéclare l'identifiant du modèle", () => {
    for (const w of WORKERS) {
      expect(lire(w), w).not.toMatch(/const\s+MODEL_ID\s*=/);
    }
  });

  it("les deux appellent le miroir AVANT de charger le modèle", () => {
    for (const w of WORKERS) {
      const s = lire(w);
      expect(s.indexOf("installerMiroirKokoro()"), w).toBeLessThan(s.indexOf("from_pretrained"));
    }
  });
});

describe("l'adresse du dépôt", () => {
  it("est bien celle qu'écrit kokoro-js, en dur, hors de toute configuration", () => {
    const bundle = lire("node_modules/kokoro-js/dist/kokoro.web.js");
    // Le nom du fichier est interpolé par la bibliothèque : on compare le préfixe.
    expect(bundle).toContain(AMONT_VOIX);
  });

  it("le dépôt visé est celui que les workers chargent", () => {
    expect(AMONT_VOIX).toContain(MODEL_ID);
  });
});

describe("le relais", () => {
  it("sert la voix locale quand le miroir répond un vrai fichier", async () => {
    const original = vi.fn(async (url: string) =>
      url.startsWith(MIROIR) ? reponse("application/octet-stream") : reponse("text/plain"));
    const cible = { fetch: original } as unknown as { fetch: typeof fetch };
    poserRelais(cible);
    await cible.fetch(`${AMONT_VOIX}ff_siwis.bin`);
    expect(original).toHaveBeenCalledWith(`${MIROIR}${MODEL_ID}/voices/ff_siwis.bin`, { cache: "force-cache" });
  });

  it("UNE RÉPONSE HTML N'EST JAMAIS PRISE POUR UN FICHIER : on repart vers l'amont", async () => {
    const vues: string[] = [];
    const original = vi.fn(async (url: string) => {
      vues.push(url);
      return reponse(url.startsWith(MIROIR) ? "text/html" : "application/octet-stream");
    });
    const cible = { fetch: original } as unknown as { fetch: typeof fetch };
    poserRelais(cible);
    await cible.fetch(`${AMONT_VOIX}af_heart.bin`);
    expect(vues[0]).toBe(`${MIROIR}${MODEL_ID}/voices/af_heart.bin`);
    expect(vues[1]).toBe(`${AMONT_VOIX}af_heart.bin`);
  });

  // CE CAS A MANQUÉ À LA PREMIÈRE VERSION, et c'est le plus lourd des deux : le relais ne portait
  // que sur les voix, le dépôt du modèle étant confié à `localModelPath`. La mesure a montré les
  // 88 Mo du poids encore tirés du réseau, la configuration et le tokeniseur avec. Un seul
  // mécanisme pour les deux moitiés, et ce test l'exige.
  it("LE POIDS DU MODÈLE passe aussi par le miroir, et pas seulement les voix", async () => {
    const vues: string[] = [];
    const original = vi.fn(async (url: string) => { vues.push(url); return reponse("application/octet-stream"); });
    const cible = { fetch: original } as unknown as { fetch: typeof fetch };
    poserRelais(cible);
    for (const f of ["onnx/model_quantized.onnx", "config.json", "tokenizer.json", "tokenizer_config.json"]) {
      await cible.fetch(`${AMONT}${f}`);
      expect(vues.at(-1), f).toBe(`${MIROIR}${MODEL_ID}/${f}`);
    }
  });

  it("un paramètre de requête ne fait pas manquer le fichier du miroir", async () => {
    const vues: string[] = [];
    const original = vi.fn(async (url: string) => { vues.push(url); return reponse("application/json"); });
    const cible = { fetch: original } as unknown as { fetch: typeof fetch };
    poserRelais(cible);
    await cible.fetch(`${AMONT}config.json?download=true`);
    expect(vues[0]).toBe(`${MIROIR}${MODEL_ID}/config.json`);
  });

  it("une requête qui ne vise pas une voix passe inchangée", async () => {
    const original = vi.fn(async () => reponse("application/json"));
    const cible = { fetch: original } as unknown as { fetch: typeof fetch };
    poserRelais(cible);
    await cible.fetch("https://example.invalid/autre.json");
    expect(original).toHaveBeenCalledWith("https://example.invalid/autre.json", undefined);
  });

  it("posé deux fois, il ne s'empile pas", async () => {
    const original = vi.fn(async () => reponse("application/octet-stream"));
    const cible = { fetch: original } as unknown as { fetch: typeof fetch };
    poserRelais(cible);
    const apres = cible.fetch;
    poserRelais(cible);
    expect(cible.fetch).toBe(apres);
  });
});

describe("le sondage du miroir", () => {
  it("un miroir absent, servi en HTML par le serveur, est déclaré absent", async () => {
    expect(await miroirPresent(async () => reponse("text/html", "{}"))).toBe(false);
  });

  it("un miroir présent est reconnu, et sondé une seule fois", async () => {
    const chercher = vi.fn(async () => reponse("application/json", '{"model_type":"style_text_to_speech_2"}'));
    expect(await miroirPresent(chercher)).toBe(true);
    expect(await miroirPresent(chercher)).toBe(true);
    expect(chercher).toHaveBeenCalledTimes(1);
  });

  it("un réseau muet ne fait pas échouer le sondage", async () => {
    expect(await miroirPresent(async () => { throw new Error("hors service"); })).toBe(false);
  });
});

// Ce chemin ne s'exécute qu'une fois l'archive publiée sur la release, donc jamais pendant le
// travail courant : c'est exactement là qu'un défaut attendrait le plus mauvais moment pour se
// montrer. Il est donc exercé ici sur une archive fabriquée, sans réseau.
describe("le dépliage de l'archive publiée", () => {
  const { depuisArchive } = require("../../scripts/download-kokoro.cjs");
  const AdmZip = require("adm-zip");
  const { mkdtempSync, existsSync, statSync, readFileSync: lireBrut } = require("node:fs");
  const { tmpdir } = require("node:os");
  const { join } = require("node:path");

  const CONTENU = new Map([
    ["config.json", Buffer.from('{"a":1}')],
    ["onnx/model_quantized.onnx", Buffer.from("poids")],
    ["voices/ff_siwis.bin", Buffer.from("voix francaise")],
  ]);
  const FICHIERS = [...CONTENU].map(([nom, b]) => ({ nom, octets: b.length }));

  /** Une archive dans la forme que produit `modeles.cjs --publier` : chemins préfixés du modèle. */
  function archive(contenu = CONTENU) {
    const zip = new AdmZip();
    for (const [nom, octets] of contenu) zip.addFile(`kokoro-82m/${MODEL_ID}/${nom}`, octets);
    return zip.toBuffer();
  }
  const servir = (octets: Buffer) => async () =>
    ({ ok: true, arrayBuffer: async () => octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) });

  it("chaque fichier atterrit à son chemin relatif, préfixe du modèle retiré", async () => {
    const cible = mkdtempSync(join(tmpdir(), "kokoro-"));
    const octets = archive();
    await depuisArchive({ url: "https://exemple.invalide/a.zip", octets: octets.length },
      FICHIERS, cible, servir(octets));
    for (const [nom, attendu] of CONTENU) {
      expect(existsSync(join(cible, ...nom.split("/"))), nom).toBe(true);
      expect(lireBrut(join(cible, ...nom.split("/"))).equals(attendu), nom).toBe(true);
    }
  });

  it("une archive de taille inattendue est refusée, et rien n'est écrit", async () => {
    const cible = mkdtempSync(join(tmpdir(), "kokoro-"));
    const octets = archive();
    await expect(depuisArchive({ url: "https://exemple.invalide/a.zip", octets: octets.length + 1 },
      FICHIERS, cible, servir(octets))).rejects.toThrow(/octets au lieu de/);
    expect(existsSync(join(cible, "config.json"))).toBe(false);
  });

  it("un fichier tronqué dans l'archive est refusé", async () => {
    const cible = mkdtempSync(join(tmpdir(), "kokoro-"));
    const abimee = new Map(CONTENU);
    abimee.set("onnx/model_quantized.onnx", Buffer.from("po"));
    const octets = archive(abimee);
    await expect(depuisArchive({ url: "https://exemple.invalide/a.zip", octets: octets.length },
      FICHIERS, cible, servir(octets))).rejects.toThrow(/dans l'archive au lieu de/);
  });

  it("un fichier déjà en place et de la bonne taille n'est pas réécrit", async () => {
    const cible = mkdtempSync(join(tmpdir(), "kokoro-"));
    const octets = archive();
    const source = { url: "https://exemple.invalide/a.zip", octets: octets.length };
    await depuisArchive(source, FICHIERS, cible, servir(octets));
    const chemin = join(cible, "onnx", "model_quantized.onnx");
    const avant = statSync(chemin).mtimeMs;
    // Une seconde passe ne doit ni échouer, ni retoucher ce qui est déjà juste.
    await depuisArchive(source, FICHIERS, cible, servir(octets));
    expect(statSync(chemin).mtimeMs).toBe(avant);
  });

  it("une archive qui ne porte rien d'attendu est refusée plutôt que tenue pour un succès", async () => {
    const cible = mkdtempSync(join(tmpdir(), "kokoro-"));
    const zip = new AdmZip();
    zip.addFile("autre-chose/lisez-moi.txt", Buffer.from("rien"));
    const octets = zip.toBuffer();
    await expect(depuisArchive({ url: "https://exemple.invalide/a.zip", octets: octets.length },
      FICHIERS, cible, servir(octets))).rejects.toThrow(/aucun des fichiers attendus/);
  });
});

describe("ce que le miroir doit contenir", () => {
  const { retenu } = require("../../scripts/download-kokoro.cjs");

  it("LA VOIX FRANÇAISE y est, bien qu'aucune liste de l'interface ne la nomme", () => {
    expect(lire("src/workers/kokoro-francais-worker.js")).toContain('VOICE_FR = "ff_siwis"');
    expect(retenu("voices/ff_siwis.bin")).toBe(true);
  });

  it("les voix que propose la synthèse anglaise y sont toutes", () => {
    const fiche = lire("src/plugins/tts-kokoro.ts");
    const voix = [...new Set([...fiche.matchAll(/"([abefhijpz][fm]_[a-z]+)"/g)].map((m) => m[1]))];
    expect(voix.length).toBeGreaterThan(20);
    for (const v of voix) expect(retenu(`voices/${v}.bin`), v).toBe(true);
  });

  it("le poids quantifié y est, et les autres exports du dépôt n'y sont pas", () => {
    expect(retenu("onnx/model_quantized.onnx")).toBe(true);
    for (const autre of ["onnx/model.onnx", "onnx/model_fp16.onnx", "onnx/model_q4.onnx", "onnx/model_q8f16.onnx"]) {
      expect(retenu(autre), autre).toBe(false);
    }
  });
});
