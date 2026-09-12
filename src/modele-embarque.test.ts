// modele-embarque.test.ts — Le modèle livré se lit par le processus principal
// dès qu'il existe, et par `fetch` seulement dans le navigateur seul.
import { describe, it, expect, vi, afterEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { lireModeleEmbarque } from "./modele-embarque";

afterEach(() => vi.unstubAllGlobals());

describe("lireModeleEmbarque", () => {
  it("passe par lireBinaire quand l'API du preload existe, sans jamais appeler fetch", async () => {
    // LE cas du défaut : dans l'app installée, `fetch` cherche le modèle dans
    // `resources/app/dist/oonx/`, où il n'est pas. Il ne doit donc pas être tenté.
    const fetchEspion = vi.fn();
    vi.stubGlobal("fetch", fetchEspion);
    const lireBinaire = vi.fn(async () => ({ donnees: new Uint8Array([1, 2, 3]), nom: "gtcrn.onnx" }));
    const octets = await lireModeleEmbarque("oonx/gtcrn.onnx", { lireBinaire });
    expect(lireBinaire).toHaveBeenCalledWith("oonx/gtcrn.onnx");
    expect(fetchEspion).not.toHaveBeenCalled();
    expect([...new Uint8Array(octets!)]).toEqual([1, 2, 3]);
  });

  it("ne rend que les octets de la vue, pas tout le tampon qui la porte", async () => {
    // Une vue IPC peut être un morceau d'un tampon plus grand. Le rendre entier
    // donnerait à onnxruntime un modèle entouré d'octets étrangers.
    const grand = new Uint8Array([9, 9, 1, 2, 3, 9, 9]);
    const vue = new Uint8Array(grand.buffer, 2, 3);
    const octets = await lireModeleEmbarque("oonx/x.onnx", { lireBinaire: async () => ({ donnees: vue, nom: "x.onnx" }) });
    expect(octets!.byteLength).toBe(3);
    expect([...new Uint8Array(octets!)]).toEqual([1, 2, 3]);
  });

  it("rend null quand le processus principal ne trouve pas le fichier", async () => {
    const octets = await lireModeleEmbarque("oonx/absent.onnx", { lireBinaire: async () => null });
    expect(octets).toBeNull();
  });

  it("se rabat sur fetch dans le navigateur seul, où il n'y a pas de preload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([4, 5]))));
    const octets = await lireModeleEmbarque("oonx/gtcrn.onnx", undefined);
    expect([...new Uint8Array(octets!)]).toEqual([4, 5]);
  });

  it("rend null sur une réponse fetch en erreur", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    expect(await lireModeleEmbarque("oonx/gtcrn.onnx", undefined)).toBeNull();
  });
});

describe("aucun nœud ne lit un modèle livré par fetch direct", () => {
  // Le garde-fou qui aurait évité la 3.2.0 cassée. `fetch("oonx/...")` passe en
  // développement et échoue une fois installé : aucun test unitaire ni aucune
  // vérification dans le navigateur ne peut le voir. Ce test lit donc le source.
  // Les commentaires sont retirés avant la recherche : le code corrigé explique
  // le piège sur place en citant l'appel fautif, et c'est ce qu'on veut garder.
  const sansCommentaires = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const FETCH_OONX = /fetch\(\s*["'`]\.?\/?oonx\//;

  it("n'emploie pas fetch sur un chemin oonx/ dans src/plugins", () => {
    const dossier = join(__dirname, "plugins");
    const fautifs = readdirSync(dossier)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .filter((f) => FETCH_OONX.test(sansCommentaires(readFileSync(join(dossier, f), "utf8"))));
    expect(fautifs).toEqual([]);
  });

  it("voit bien un appel fautif, et ignore le même appel en commentaire", () => {
    // Le contrôle du garde-fou lui-même : un test qui ne peut pas échouer ne
    // vérifie rien, et retirer les commentaires aurait pu tout effacer.
    expect(FETCH_OONX.test(sansCommentaires(`const r = await fetch("oonx/gtcrn.onnx");`))).toBe(true);
    expect(FETCH_OONX.test(sansCommentaires(`  // fetch("oonx/gtcrn.onnx") échoue une fois installée`))).toBe(false);
  });
});
