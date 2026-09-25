// plugins/ollama.test.ts — Le pont vers le serveur local, et son repli.
//
// CE QUI SE VÉRIFIE ICI NE SE VOIT QU'À L'USAGE, ET TROP TARD. Les deux fonctions du pont doivent
// se comporter PAREIL : passer par le processus principal quand il est là, appeler le serveur
// directement sinon. `ollamaModeles` ne le faisait pas, et l'éditeur de code annonçait « demande
// l'application de bureau » hors d'Electron alors que le serveur répondait. Une divergence de ce
// genre ne casse rien dans l'application empaquetée, donc rien ne la signale.
import { describe, it, expect, afterEach, vi } from "vitest";
import { ollamaGenerer, ollamaModeles } from "./ollama";

const poserFenetre = (api: unknown) => {
  (globalThis as any).window = api === undefined ? {} : { api };
};

afterEach(() => {
  delete (globalThis as any).window;
  vi.unstubAllGlobals();
});

describe("le pont Ollama", () => {
  it("passe par le processus principal quand il est là, pour les deux fonctions", async () => {
    const appels: string[] = [];
    poserFenetre({
      ollamaGenerer: async () => { appels.push("generer"); return { reponse: "salut" }; },
      ollamaModeles: async () => { appels.push("modeles"); return { modeles: ["a", "b"] }; },
    });
    const reseau = vi.fn();
    vi.stubGlobal("fetch", reseau);

    expect(await ollamaGenerer({ model: "m", prompt: "p" })).toEqual({ reponse: "salut" });
    expect(await ollamaModeles()).toEqual({ modeles: ["a", "b"] });
    expect(appels).toEqual(["generer", "modeles"]);
    // AUCUN APPEL RÉSEAU depuis le renderer quand le pont est là : c'est tout l'objet du pont,
    // qui contourne la politique de sécurité de contenu et le contrôle d'origine.
    expect(reseau).not.toHaveBeenCalled();
  });

  it("APPELLE LE SERVEUR DIRECTEMENT SANS LE PONT, pour les deux fonctions", async () => {
    poserFenetre(undefined);
    const reseau = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes("/api/tags")
        ? { models: [{ name: "qwen3:4b" }, { name: "gemma4:12b" }] }
        : { message: { content: "salut" } }),
    }));
    vi.stubGlobal("fetch", reseau as unknown as typeof fetch);

    expect(await ollamaGenerer({ model: "m", prompt: "p" })).toEqual({ reponse: "salut" });
    expect(await ollamaModeles()).toEqual({ modeles: ["qwen3:4b", "gemma4:12b"] });
    expect(reseau).toHaveBeenCalledTimes(2);
    expect(String(reseau.mock.calls[1][0])).toContain("127.0.0.1:11434/api/tags");
  });

  it("dit que le serveur est injoignable plutôt que de rendre une liste vide", async () => {
    poserFenetre(undefined);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch);
    const r = await ollamaModeles();
    expect(r.modeles).toBeUndefined();
    expect(r.erreur).toContain("11434");
  });

  it("rapporte le code d'une réponse refusée, qui n'est pas la même panne", async () => {
    poserFenetre(undefined);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch);
    expect((await ollamaModeles()).erreur).toContain("503");
  });

  it("ne rend pas de nom vide, qu'une réponse mal formée donnerait", async () => {
    poserFenetre(undefined);
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, json: async () => ({ models: [{ name: "bon" }, { name: "" }, {}] }),
    })) as unknown as typeof fetch);
    expect((await ollamaModeles()).modeles).toEqual(["bon"]);
  });
});
