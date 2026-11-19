// electron/hors-ligne.test.ts — Le mode hors ligne strict : rien ne sort de la machine (pièce C7).
//
// CE QUE CES CAS TIENNENT : ce qui est local ; la coupure de la session, sur un témoin qui prend la
// place de `webRequest` ; le refus des sorties du processus principal, dont un vrai téléchargement
// refusé avant toute connexion ; et un garde : tout module du processus principal qui peut sortir
// (`http`, `https` ou `fetch`) demande `refusHorsLigne`.
import { afterEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";

const require_ = createRequire(import.meta.url);
const hl = require_("./hors-ligne.cjs");
const { telechargerFichier } = require_("./telechargement-modeles.cjs");

afterEach(() => hl.poserHorsLigne(false));

/** Une session témoin : l'écouteur qu'on lui pose, et ce qu'il répond. */
function session() {
  let ecouteur: ((d: { url: string }, r: (x: { cancel?: boolean }) => void) => void) | null = null;
  return {
    webRequest: { onBeforeRequest: (f: typeof ecouteur) => { ecouteur = f; } },
    arme: () => ecouteur !== null,
    repondre: (url: string) => { let rendu: { cancel?: boolean } | null = null; ecouteur!({ url }, (x) => { rendu = x; }); return rendu; },
  };
}

describe("ce qui est local", () => {
  it("LA MACHINE ET CE QUI NE QUITTE PAS LE PROCESSUS", () => {
    for (const a of ["http://localhost:5175/", "http://127.0.0.1:11434/api/tags", "http://[::1]:8080/", "ws://localhost:5175/", "http://app.localhost/",
      "file:///C:/attic/dist/index.html", "data:text/plain,x", "blob:file:///abc", "about:blank", "devtools://devtools/x", "attic-res://modele/x", "attic-fichier://x"]) {
      expect(hl.adresseLocale(a), a).toBe(true);
    }
  });

  it("TOUT LE RESTE, ET UNE ADRESSE ILLISIBLE", () => {
    for (const a of ["https://huggingface.co/x", "https://cdn.jsdelivr.net/npm/x", "http://192.168.1.10:11434", "http://localhost.evil.com/", "ftp://localhost/x", "pas une adresse", ""]) {
      expect(hl.adresseLocale(a), a).toBe(false);
    }
  });
});

describe("la session", () => {
  it("ÉTEINT, RIEN N'EST ARMÉ : `onBeforeRequest` ne garde qu'un écouteur par session", () => {
    const s = session();
    expect(hl.armerHorsLigne(s)).toBe(false);
    expect(s.arme()).toBe(false);
  });

  it("ALLUMÉ, CE QUI SORT EST COUPÉ ET NOMMÉ UNE FOIS PAR ORIGINE ; LE LOCAL PASSE", () => {
    hl.poserHorsLigne(true);
    const s = session();
    const journal: string[] = [];
    expect(hl.armerHorsLigne(s, (l: string) => journal.push(l))).toBe(true);
    expect(s.repondre("https://cdn.jsdelivr.net/npm/onnx/a.wasm")).toEqual({ cancel: true });
    expect(s.repondre("https://cdn.jsdelivr.net/npm/onnx/b.wasm")).toEqual({ cancel: true });
    expect(s.repondre("file:///C:/attic/dist/index.html")).toEqual({});
    expect(s.repondre("http://localhost:5175/src/main.tsx")).toEqual({});
    expect(journal).toEqual(["[attic] hors ligne strict : requête vers https://cdn.jsdelivr.net coupée"]);
  });
});

describe("le processus principal", () => {
  it("ÉTEINT, RIEN N'EST REFUSÉ ; ALLUMÉ, CE QUI SORT L'EST, ET LE MESSAGE DIT LA CLÉ", () => {
    expect(hl.refusHorsLigne("https://huggingface.co/x", "téléchargement")).toBeNull();
    hl.poserHorsLigne(true);
    const journal: string[] = [];
    expect(hl.refusHorsLigne("https://huggingface.co/x", "téléchargement", (l: string) => journal.push(l)))
      .toMatch(/^Hors ligne strict \(clé horsLigne de config\.json, ou ATTIC_HORS_LIGNE\) : téléchargement vers https:\/\/huggingface\.co refusé\.$/);
    expect(hl.refusHorsLigne("http://127.0.0.1:11434", "Ollama")).toBeNull();
    expect(journal).toHaveLength(1);
  });

  it("UN VRAI TÉLÉCHARGEMENT EST REFUSÉ AVANT TOUTE CONNEXION", async () => {
    hl.poserHorsLigne(true);
    const r = await telechargerFichier("https://huggingface.co/modele.onnx", join(tmpdir(), "attic-hors-ligne-jamais.bin"));
    expect(r).toMatchObject({ ok: false });
    expect(r.erreur).toMatch(/Hors ligne strict/);
  });
});

describe("tout module du processus principal qui peut sortir demande le mode", () => {
  const DOSSIER = __dirname;
  const sortants = readdirSync(DOSSIER)
    .filter((f) => f.endsWith(".cjs") && f !== "hors-ligne.cjs")
    .map((f) => ({ f, src: readFileSync(join(DOSSIER, f), "utf8") }))
    .filter(({ src }) => /require\(["'](?:node:)?https?["']\)|\bfetch\(/.test(src));

  it("LES MODULES SONT TROUVÉS : le garde ne passe pas sur un ensemble vide", () => {
    expect(sortants.map((s) => s.f).sort()).toEqual(expect.arrayContaining(["ipc-modeles.cjs", "ipc-moteurs.cjs", "telechargement-modeles.cjs"]));
  });

  it("CHACUN DEMANDE `refusHorsLigne` AVANT DE SORTIR", () => {
    const sourds = sortants.filter(({ src }) => !/\brefusHorsLigne\(/.test(src)).map((s) => s.f);
    expect(sourds, "ces modules peuvent sortir de la machine sans demander le mode hors ligne").toEqual([]);
  });
});
