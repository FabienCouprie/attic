// src/workers/tts-local.test.ts — Les deux synthèses Transformers.js passent par le même miroir.
//
// CE QUI EST TENU :
//   1. LE RELAIS COUVRE TOUS LES DÉPÔTS, les neuf, et pas seulement celui qu'on avait en tête en
//      l'écrivant. Celui de Kokoro n'en connaît qu'un ; ici SpeechT5 en a deux, les voix viennent
//      d'un dépôt de JEU DE DONNÉES dont l'adresse n'a pas la même forme, et MMS en a un par
//      langue. Une langue ajoutée à la liste du composant sans l'être ici repartirait sur le
//      réseau sans que rien ne le dise.
//   2. LES DEUX LISTES SE CORRESPONDENT. Le composant et le miroir déclarent chacun leurs langues ;
//      le cas les apparie en lisant les deux fichiers, de sorte qu'aucune ne puisse être offerte
//      sans être miroitée, ni miroitée sans être offerte.
//   3. UNE RÉPONSE HTML N'EST JAMAIS PRISE POUR UN FICHIER. Un serveur de développement répond 200
//      et sa page d'accueil pour un chemin inconnu ; recevoir deux kilo-octets de HTML comme un
//      modèle ONNX donne une erreur d'analyse qui ne dit pas sa cause.
//   4. LE RÉSEAU RESTE OUVERT. Un fichier absent du miroir repart vers l'amont : le relais préfère
//      le local, il ne l'impose pas, et une installation sans miroir doit continuer de marcher.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PAQUETS, localePour, miroirPresent, oublierMiroir, poserRelais } from "./tts-local.js";

const RACINE = resolve(__dirname, "../..");
const lire = (p: string) => readFileSync(resolve(RACINE, p), "utf8");

const reponse = (type: string, ok = true) =>
  ({ ok, headers: { get: () => type }, json: async () => ({}) }) as unknown as Response;

const AMONT_SPEECHT5 = "https://huggingface.co/Xenova/speecht5_tts/resolve/main/";
const AMONT_VOIX = "https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/";

beforeEach(() => oublierMiroir());

describe("le relais des deux synthèses", () => {
  it("DÉTOURNE CHACUN DES DÉPÔTS DÉCLARÉS, et pas seulement le premier", () => {
    const tous = PAQUETS.flatMap((p) => p.depots.map((d) => ({ depot: d, jeu: Boolean(p.jeuDeDonnees) })));
    expect(tous.length, "le miroir doit porter plusieurs dépôts").toBeGreaterThan(5);
    for (const { depot, jeu } of tous) {
      const amont = `https://huggingface.co/${jeu ? "datasets/" : ""}${depot}/resolve/main/config.json`;
      const vers = localePour(amont);
      expect(vers, `${depot} n'est pas détourné`).not.toBeNull();
      expect(vers!.base).toContain(depot);
      expect(vers!.reste).toBe("config.json");
    }
  });

  it("distingue le dépôt de jeu de données de celui de modèle, dont l'adresse diffère", () => {
    // LE PIÈGE : `huggingface.co/Xenova/x` et `huggingface.co/datasets/Xenova/x` se ressemblent,
    // et une correspondance écrite sur la première forme laisserait les voix partir sur le réseau.
    expect(localePour(`${AMONT_VOIX}cmu_us_slt_arctic-wav-arctic_a0001.bin`)).not.toBeNull();
    expect(localePour(`${AMONT_VOIX}cmu_us_slt_arctic-wav-arctic_a0001.bin`)!.base)
      .toContain("cmu-arctic-xvectors-extracted");
  });

  it("laisse passer ce qui ne vise aucun dépôt connu", () => {
    for (const url of ["https://example.org/x.onnx", "/local/deja.json", "", "https://huggingface.co/autre/depot/resolve/main/a"]) {
      expect(localePour(url), url).toBeNull();
    }
  });

  it("retire la question que Vite ajoute au chemin", () => {
    expect(localePour(`${AMONT_SPEECHT5}onnx/encoder_model.onnx?download=true`)!.reste)
      .toBe("onnx/encoder_model.onnx");
  });

  it("sert le miroir quand il répond, et repart vers l'amont quand il se tait", async () => {
    // L'ESPION SE GARDE À PART : poser le relais remplace `cible.fetch`, de sorte que l'espion
    // n'est plus là où on l'avait mis.
    const espion = vi.fn()
      .mockResolvedValueOnce(reponse("application/octet-stream"))
      .mockResolvedValueOnce(reponse("text/html"))
      .mockResolvedValueOnce(reponse("application/octet-stream"));
    const cible: any = { fetch: espion };
    const relais = poserRelais(cible);

    await relais(`${AMONT_SPEECHT5}config.json`);
    expect(espion.mock.calls[0][0]).toContain("/oonx/tts-speecht5/Xenova/speecht5_tts/config.json");

    // Deuxième tour : le miroir rend du HTML, donc l'amont doit être réinterrogé.
    await relais(`${AMONT_SPEECHT5}config.json`);
    expect(espion.mock.calls[2][0]).toBe(`${AMONT_SPEECHT5}config.json`);
  });

  it("SUIT LA BASE QUE LA PAGE TRANSMET, sans quoi le miroir ne vaut qu'en développement", async () => {
    // LE DÉFAUT QUE CE CAS EMPÊCHE : une adresse enracinée écrite en dur. Dans un worker,
    // `self.location` est l'URL du script ; et l'application empaquetée sert sa page depuis
    // `file://`, où `/oonx/…` ne résout rien. Le miroir n'aurait alors valu qu'en développement,
    // et les deux paquets du manifeste n'auraient jamais servi là où ils comptent.
    const { reglerBase } = await import("./tts-local.js");
    reglerBase("attic-res://oonx");
    try {
      expect(localePour(`${AMONT_SPEECHT5}config.json`)!.base).toBe("attic-res://oonx/tts-speecht5/Xenova/speecht5_tts/");
    } finally {
      reglerBase("/oonx");
    }
    expect(localePour(`${AMONT_SPEECHT5}config.json`)!.base).toBe("/oonx/tts-speecht5/Xenova/speecht5_tts/");
  });

  it("transmet cette base depuis la page, et non depuis le worker", () => {
    // `base-modeles.ts` porte le calcul et son pourquoi ; le composant l'appelle et le passe.
    const source = lire("src/plugins/tts.ts");
    expect(source).toContain("baseModeleLivre");
    expect(source).toContain("baseMiroir");
    expect(lire("src/workers/tts-worker.js")).toContain("baseMiroir");
  });

  it("ne se pose qu'une fois sur la même cible", () => {
    const cible: any = { fetch: vi.fn() };
    const premier = poserRelais(cible);
    expect(poserRelais(cible)).toBe(premier);
  });

  it("ne tient pas une page HTML pour un miroir en place", async () => {
    expect(await miroirPresent(async () => reponse("text/html"))).toBe(false);
    oublierMiroir();
    expect(await miroirPresent(async () => reponse("application/json"))).toBe(true);
  });

  it("tient un miroir muet pour absent, plutôt que d'échouer", async () => {
    expect(await miroirPresent(async () => { throw new Error("hors ligne"); })).toBe(false);
  });
});

describe("les langues offertes et les langues miroitées", () => {
  it("SE CORRESPONDENT EXACTEMENT, sans liste écrite deux fois à la main", () => {
    const offertes = [...lire("src/plugins/tts.ts").matchAll(/model: "Xenova\/mms-tts-([a-z]{3})"/g)]
      .map((m) => m[1]).sort();
    const miroitees = PAQUETS.flatMap((p) => p.depots)
      .filter((d) => d.startsWith("Xenova/mms-tts-"))
      .map((d) => d.slice("Xenova/mms-tts-".length)).sort();
    expect(offertes.length, "le composant doit offrir des langues").toBeGreaterThan(0);
    expect(miroitees, "une langue offerte doit être miroitée, et réciproquement").toEqual(offertes);
  });

  it("n'offrent plus les trois dont le dépôt amont a disparu", () => {
    // RELEVÉ EN LES INTERROGEANT : `ita`, `nld` et `pol` rendent 401 là où les sept autres rendent
    // 200. Les laisser dans la liste, c'est offrir un choix qui échoue.
    // LA LISTE, ET NON LE FICHIER : l'en-tête du composant NOMME ces trois-là pour dire pourquoi
    // elles sont parties. Chercher dans tout le fichier reviendrait à interdire d'en expliquer la
    // raison, ce qui est le contraire de ce qu'on veut.
    const offertes = [...lire("src/plugins/tts.ts").matchAll(/model: "Xenova\/mms-tts-([a-z]{3})"/g)]
      .map((m) => m[1]);
    for (const morte of ["ita", "nld", "pol"]) {
      expect(offertes, `mms-tts-${morte} est revenu dans la liste`).not.toContain(morte);
    }
  });

  it("emploient le miroir partagé, et le worker ne redéclare aucune adresse amont", () => {
    const worker = lire("src/workers/tts-worker.js");
    expect(worker).toContain("installerMiroirTts");
    expect(worker, "le worker ne doit pas écrire d'adresse HuggingFace en dur")
      .not.toMatch(/https:\/\/huggingface\.co/);
  });
});
