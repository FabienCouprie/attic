// plugins/moss-mise-en-page.test.ts — Le compilateur de mise en page, et la rédaction qui le nourrit.
//
// LA RÉPONSE CONNUE EST CELLE D'OPENMOSS : l'exemple de `references/layout.md`, une tasse posée en
// `[176, 224, 800, 864]` sur une toile de 1536 × 1024, doit sortir en `[-288, -592, 352, 32]`. Un
// portage qui se tromperait d'ordre ou de centre rendrait des boîtes valides au mauvais endroit, et
// rien d'autre ne le dirait qu'une image ratée deux minutes plus tard.
import { describe, expect, it, vi } from "vitest";
import {
  compilerMiseEnPage, consigneMiseEnPage, estMiseEnPage, redigerMiseEnPage, SCHEMA_BROUILLON, type Generer,
} from "./moss-mise-en-page";

const TASSE = {
  summary: { meta: ["product campaign", "studio photography"], canvas: "single", caption: "A warm studio campaign for a handmade ceramic cup." },
  items: [
    { label: "object", caption: "An ivory ceramic cup.", bbox: [176, 224, 800, 864] },
    { label: "text", caption: "Large dark-green Chinese title.", text: "把日常，过成诗。", bbox: [928, 272, 1408, 448] },
    { label: "text", caption: "Smaller supporting copy on two lines.", text: "一杯温暖\n一刻从容", bbox: [928, 512, 1376, 656] },
  ],
};

const SIMPLE = { summary: { caption: "A gramophone." }, items: [{ label: "object", caption: "A gramophone.", bbox: [0, 0, 32, 32] }] };

describe("le compilateur de mise en page", () => {
  it("REND L'EXEMPLE D'OPENMOSS AU PIXEL PRÈS : haut et gauche moins le centre, en yxyx", () => {
    const sortie = JSON.parse(compilerMiseEnPage(TASSE, 1536, 1024));
    expect(sortie.items.map((i: { bbox: number[] }) => i.bbox)).toEqual([
      [-288, -592, 352, 32], [-240, 160, -64, 640], [0, 160, 144, 608],
    ]);
    expect([sortie.bbox_coord_space, sortie.bbox_format]).toEqual(["abs_centralized", "yxyx"]);
  });

  it("rend UNE ligne, garde les caractères tels quels et l'ordre des champs, sans la taille de la toile", () => {
    const ligne = compilerMiseEnPage(TASSE, 1536, 1024);
    expect(ligne.split("\n")).toHaveLength(1);
    expect(ligne).toContain("把日常，过成诗。");
    expect(JSON.parse(ligne).items[2].text).toBe("一杯温暖\n一刻从容");
    expect(Object.keys(JSON.parse(ligne))).toEqual(["summary", "items", "bbox_coord_space", "bbox_format"]);
    expect(Object.keys(JSON.parse(ligne).items[1])).toEqual(["label", "caption", "text", "bbox"]);
    expect(ligne).not.toMatch(/width|height/);
  });

  it("ENFERME LES BORDS FRACTIONNAIRES avant de centrer : plancher en haut et à gauche, plafond ailleurs", () => {
    const b = { ...SIMPLE, items: [{ ...SIMPLE.items[0], bbox: [10.2, 20.7, 30.1, 40.9] }] };
    expect(JSON.parse(compilerMiseEnPage(b, 64, 64)).items[0].bbox).toEqual([20 - 32, 10 - 32, 41 - 32, 31 - 32]);
  });

  it.each([
    ["une boîte hors de la toile", { ...SIMPLE, items: [{ ...SIMPLE.items[0], bbox: [0, 0, 80, 32] }] }, /exceeds the 64x64 canvas/],
    ["une boîte retournée", { ...SIMPLE, items: [{ ...SIMPLE.items[0], bbox: [32, 0, 0, 32] }] }, /positive width and height/],
    ["une boîte de trois nombres", { ...SIMPLE, items: [{ ...SIMPLE.items[0], bbox: [0, 0, 32] }] }, /\[x1,y1,x2,y2\]/],
    ["un texte sans ses mots", { ...SIMPLE, items: [{ label: "text", caption: "A title.", bbox: [0, 0, 32, 32] }] }, /require literal text/],
    ["un champ inconnu", { ...SIMPLE, items: [{ ...SIMPLE.items[0], id: 3 }] }, /unknown fields \["id"\]/],
    ["une étiquette inconnue", { ...SIMPLE, items: [{ ...SIMPLE.items[0], label: "logo" }] }, /object, character or text/],
    ["une légende vide", { ...SIMPLE, items: [{ ...SIMPLE.items[0], caption: "  " }] }, /nonempty text/],
    ["aucun élément", { ...SIMPLE, items: [] }, /nonempty flat array/],
    ["un résumé sans légende", { ...SIMPLE, summary: {} }, /missing fields \["caption"\]/],
  ])("REFUSE %s plutôt que de la corriger en silence", (_quoi, brouillon, raison) => {
    expect(() => compilerMiseEnPage(brouillon, 64, 64)).toThrow(raison);
  });

  it("refuse une toile qui n'est pas un multiple de seize, comme le modèle", () => {
    expect(() => compilerMiseEnPage(SIMPLE, 60, 64)).toThrow(/multiple of 16/);
  });
});

describe("un prompt déjà en mise en page", () => {
  it("est reconnu quand il est un objet JSON, et seulement alors", () => {
    expect(estMiseEnPage(" {\"summary\": {\"caption\": \"x\"}, \"items\": []} ")).toBe(true);
    expect(estMiseEnPage("an old brass gramophone")).toBe(false);
    expect(estMiseEnPage("{ not json")).toBe(false);
    expect(estMiseEnPage("[1, 2]")).toBe(false);
  });
});

/** Un faux Ollama qui rend ses réponses dans l'ordre et garde ce qu'on lui a demandé. */
function faux(...reponses: { reponse?: string; erreur?: string }[]) {
  const appels: Parameters<Generer>[0][] = [];
  const generer = vi.fn(async (o: Parameters<Generer>[0]) => { appels.push(o); return reponses[appels.length - 1] ?? {}; });
  return { appels, generer };
}

const demande = { demande: "a gramophone", largeur: 64, hauteur: 64, modele: "gemma4:12b", graine: 42 };

describe("la rédaction par un modèle de langue", () => {
  it("DEMANDE UN BROUILLON CONTRAINT PAR LE SCHÉMA, décharge le modèle aussitôt, et suit la graine", async () => {
    const { appels, generer } = faux({ reponse: JSON.stringify(SIMPLE) });
    const r = await redigerMiseEnPage({ ...demande, generer });
    expect(r).toEqual({ ok: true, json: compilerMiseEnPage(SIMPLE, 64, 64), elements: 1 });
    expect(appels).toHaveLength(1);
    expect(appels[0]).toMatchObject({ model: "gemma4:12b", format: SCHEMA_BROUILLON, keepAlive: 0, options: { seed: 42 } });
    expect(appels[0].prompt).toContain("64 pixels wide and 64 pixels high");
    expect(appels[0].prompt).toContain("Request: a gramophone");
  });

  it("UN BROUILLON REFUSÉ EST REDEMANDÉ UNE FOIS, avec la raison du refus", async () => {
    const hors = { ...SIMPLE, items: [{ ...SIMPLE.items[0], bbox: [0, 0, 99, 32] }] };
    const { appels, generer } = faux({ reponse: JSON.stringify(hors) }, { reponse: JSON.stringify(SIMPLE) });
    const r = await redigerMiseEnPage({ ...demande, generer });
    expect(r.ok).toBe(true);
    expect(appels).toHaveLength(2);
    expect(appels[1].prompt).toContain("Your previous draft was rejected: items[0].bbox exceeds the 64x64 canvas");
  });

  it("deux refus de suite rendent la raison du dernier, sans troisième essai", async () => {
    const { appels, generer } = faux({ reponse: "pas du JSON" }, { reponse: "toujours pas" });
    const r = await redigerMiseEnPage({ ...demande, generer });
    expect(r).toEqual({ ok: false, raison: "refus", detail: "the answer is not JSON" });
    expect(appels).toHaveLength(2);
  });

  it("UN SERVEUR INJOIGNABLE N'EST PAS REDEMANDÉ : rien ne changerait au second appel", async () => {
    const { appels, generer } = faux({ erreur: "Serveur Ollama injoignable" });
    const r = await redigerMiseEnPage({ ...demande, generer });
    expect(r).toEqual({ ok: false, raison: "ollama", detail: "Serveur Ollama injoignable" });
    expect(appels).toHaveLength(1);
  });

  it("la consigne garde les mots à écrire dans leur langue, et place les boîtes depuis le coin haut-gauche", () => {
    const c = consigneMiseEnPage("une pochette LE GRENIER", 512, 320);
    expect(c).toContain("verbatim in their original language");
    expect(c).toContain("from the top-left corner, with 0 <= x_min < x_max <= 512 and 0 <= y_min < y_max <= 320");
    expect(c).not.toContain("previous draft");
  });
});
