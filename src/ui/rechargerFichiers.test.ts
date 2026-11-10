// ui/rechargerFichiers.test.ts — Ce qu'un projet rouvert retrouve de ses fichiers, et ce qu'il ne touche pas.
//
// CE QUE CES CAS GARDENT. `rechargerFichiersPersistes` relit sur le disque les fichiers d'un graphe
// rouvert : à l'import d'un projet, à la reprise de l'en-cours, et au collage d'une coupe venue d'une
// autre fenêtre. Aucun test ne l'éprouvait, et l'épreuve d'aller-retour de la persistance sème des
// chemins fictifs : elle n'exerce que la branche où la lecture échoue. Les cas ci-dessous fixent,
// fiche par fiche, ce qu'elle rend, sur un disque simulé dont chaque réponse est connue.
//
// ET ELLE N'ÉCRIT RIEN DANS CE QU'ON LUI PASSE. Point A6 de la revue d'architecture du 2026-10-31 :
// elle posait le fichier, son nom et son URL dans `n.data` des nœuds reçus, sans rien rendre. Ses
// trois appelants lui passaient des nœuds neufs, si bien qu'aucun nœud vivant n'était touché ; mais
// un quatrième qui lui aurait passé ceux de l'état les aurait modifiés sans `setNodes`, sans que rien
// ne le dise. L'avant-dernier bloc la nourrit de nœuds gelés.
//
// ET AUCUN APPELANT NE JETTE CE QU'ELLE REND. Depuis qu'elle rend au lieu d'écrire, un appel qui
// jette son résultat perd les fichiers relus, en silence : le projet s'ouvre, et ses entrées sont
// vides. Le dernier bloc cherche cette forme dans les sources, comme le fait
// `docs/contrat-ecritures-refusees.test.ts` pour les écritures, et compte les appels qu'il a vus.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { rechargerFichiersPersistes } from "./rechargerFichiers";

/** Ce que le disque simulé rend pour un chemin : des octets, un nom, et l'adresse que le pont donne à un son. */
type Reponse = { nom: string; donnees: Uint8Array; url?: string };

const adresses: string[] = [];
const createObjectURL = URL.createObjectURL;
let disque: Record<string, Reponse | "panne">;
let api: { lireFichierAudio: ReturnType<typeof vi.fn>; lireBinaire: ReturnType<typeof vi.fn> };

const octets = (texte: string) => new TextEncoder().encode(texte);

function lire(chemin: string): Reponse | null {
  const r = disque[chemin];
  if (r === "panne") throw new Error(`lecture impossible : ${chemin}`);
  return r ?? null;
}

beforeEach(() => {
  adresses.length = 0;
  disque = {};
  let n = 0;
  URL.createObjectURL = (() => { const u = `blob:essai/${++n}`; adresses.push(u); return u; }) as typeof URL.createObjectURL;
  api = {
    lireFichierAudio: vi.fn(async (chemin: string) => lire(chemin)),
    lireBinaire: vi.fn(async (chemin: string) => lire(chemin)),
  };
  (globalThis as any).window = { api };
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  URL.createObjectURL = createObjectURL;
  delete (globalThis as any).window;
  vi.restoreAllMocks();
});

const noeud = (id: string, ficheId: string, data: Record<string, unknown> = {}): any =>
  ({ id, type: "atelier", position: { x: 0, y: 0 }, data: { ficheId, statut: "attente", ...data } });

/** Ce que l'appelant obtient : les nœuds que la fonction rend. */
const recharger = (nodes: any[]): Promise<any[]> => rechargerFichiersPersistes(nodes);

/** Le contenu d'un `File`, en texte : il doit être celui que le disque a rendu. */
const contenu = async (f: File) => new TextDecoder().decode(await f.arrayBuffer());

describe("rechargerFichiersPersistes : ce que chaque fiche retrouve", () => {
  it("UNE ENTRÉE AUDIO relit son « Chemin », prend le type de l'adresse du pont, et reçoit une URL écoutable", async () => {
    disque["C:/sons/voix.flac"] = { nom: "voix.flac", donnees: octets("flac"), url: "data:audio/flac;base64,AAAA" };
    const [n] = await recharger([noeud("a", "entree-audio", { parametres: { Chemin: "C:/sons/voix.flac" } })]);
    expect(api.lireFichierAudio).toHaveBeenCalledWith("C:/sons/voix.flac");
    expect(n.data.audioFichier).toBeInstanceOf(File);
    expect(n.data.audioFichier.name).toBe("voix.flac");
    expect(n.data.audioFichier.type).toBe("audio/flac");
    expect(await contenu(n.data.audioFichier)).toBe("flac");
    expect(n.data.audioNom).toBe("voix.flac");
    expect(n.data.audioUrl).toBe("blob:essai/1");
    expect(adresses).toEqual(["blob:essai/1"]);
  });

  it("UNE ENTRÉE AUDIO sans type lisible dans l'adresse du pont est prise pour du WAV", async () => {
    disque["C:/sons/x"] = { nom: "x", donnees: octets("x") };
    const [n] = await recharger([noeud("a", "entree-audio", { parametres: { Chemin: "C:/sons/x" } })]);
    expect(n.data.audioFichier.type).toBe("audio/wav");
  });

  it("UNE ENTRÉE AUDIO qui a déjà son fichier n'est pas relue", async () => {
    const deja = new File([octets("d")], "deja.wav");
    const [n] = await recharger([noeud("a", "entree-audio", { parametres: { Chemin: "C:/sons/voix.wav" }, audioFichier: deja })]);
    expect(api.lireFichierAudio).not.toHaveBeenCalled();
    expect(n.data.audioFichier).toBe(deja);
    expect(n.data.audioUrl).toBeUndefined();
    expect(adresses).toEqual([]);
  });

  it("UN LECTEUR MIDI relit son fichier par le binaire, sans URL", async () => {
    disque["C:/midi/theme.mid"] = { nom: "theme.mid", donnees: octets("MThd") };
    const [n] = await recharger([noeud("m", "lecteur-midi", { parametres: { Chemin: "C:/midi/theme.mid" } })]);
    expect(api.lireBinaire).toHaveBeenCalledWith("C:/midi/theme.mid");
    expect(n.data.midiFichier.name).toBe("theme.mid");
    expect(n.data.midiFichier.type).toBe("audio/midi");
    expect(await contenu(n.data.midiFichier)).toBe("MThd");
    expect(n.data.midiNom).toBe("theme.mid");
    expect(adresses).toEqual([]);
  });

  it("UN LECTEUR SVG relit son fichier par le binaire, sans URL", async () => {
    disque["C:/svg/trace.svg"] = { nom: "trace.svg", donnees: octets("<svg/>") };
    const [n] = await recharger([noeud("s", "lecteur-svg", { parametres: { Chemin: "C:/svg/trace.svg" } })]);
    expect(n.data.svgFichier.name).toBe("trace.svg");
    expect(n.data.svgFichier.type).toBe("image/svg+xml");
    expect(n.data.svgNom).toBe("trace.svg");
    expect(adresses).toEqual([]);
  });

  it("UNE ENTRÉE IMAGE prend son type de l'extension : PNG, SVG, et JPEG pour le reste", async () => {
    disque["C:/i/a.PNG"] = { nom: "a.PNG", donnees: octets("p") };
    disque["C:/i/b.svg"] = { nom: "b.svg", donnees: octets("s") };
    disque["C:/i/c.webp"] = { nom: "c.webp", donnees: octets("w") };
    const rendus = await recharger([
      noeud("1", "entree-image", { parametres: { Chemin: "C:/i/a.PNG" } }),
      noeud("2", "entree-image", { parametres: { Chemin: "C:/i/b.svg" } }),
      noeud("3", "entree-image", { parametres: { Chemin: "C:/i/c.webp" } }),
    ]);
    expect(rendus.map((n) => n.data.imageFichier.type)).toEqual(["image/png", "image/svg+xml", "image/jpeg"]);
    expect(rendus.map((n) => n.data.imageNom)).toEqual(["a.PNG", "b.svg", "c.webp"]);
    expect(adresses).toEqual([]);
  });

  it("UN EXPLORATEUR DE MUSIQUE relit sa piste choisie, et non son « Chemin », qui est un dossier", async () => {
    disque["C:/musique/piste.mp3"] = { nom: "piste.mp3", donnees: octets("mp3") };
    const [n] = await recharger([noeud("e", "explorateur-musique", {
      parametres: { Chemin: "C:/musique" }, audioChemin: "C:/musique/piste.mp3",
    })]);
    expect(api.lireFichierAudio).toHaveBeenCalledWith("C:/musique/piste.mp3");
    expect(api.lireFichierAudio).not.toHaveBeenCalledWith("C:/musique");
    expect(n.data.audioFichier.type).toBe("audio/mpeg");
    expect(n.data.audioNom).toBe("piste.mp3");
    expect(n.data.audioUrl).toBe("blob:essai/1");
  });

  it("UN EXPLORATEUR DE MUSIQUE sans piste choisie n'a rien à relire", async () => {
    const [n] = await recharger([noeud("e", "explorateur-musique", { parametres: { Chemin: "C:/musique" } })]);
    expect(api.lireFichierAudio).not.toHaveBeenCalled();
    expect(n.data.audioFichier).toBeUndefined();
  });
});

describe("rechargerFichiersPersistes : ce qui reste tel quel", () => {
  it("SANS « CHEMIN », SANS FICHE, OU POUR UNE FICHE QUI NE RELIT RIEN, le nœud n'est pas lu", async () => {
    disque["C:/x"] = { nom: "x", donnees: octets("x") };
    const rendus = await recharger([
      noeud("1", "entree-audio", { parametres: {} }),
      { id: "2", data: { parametres: { Chemin: "C:/x" } } },
      noeud("3", "gain", { parametres: { Chemin: "C:/x" } }),
    ]);
    expect(api.lireFichierAudio).not.toHaveBeenCalled();
    expect(api.lireBinaire).not.toHaveBeenCalled();
    expect(rendus.map((n) => Object.keys(n.data).sort())).toEqual([
      ["ficheId", "parametres", "statut"], ["parametres"], ["ficheId", "parametres", "statut"],
    ]);
  });

  it("UN FICHIER INTROUVABLE laisse le nœud sans fichier", async () => {
    const [n] = await recharger([noeud("a", "entree-audio", { parametres: { Chemin: "C:/absent.wav" } })]);
    expect(api.lireFichierAudio).toHaveBeenCalledWith("C:/absent.wav");
    expect(n.data.audioFichier).toBeUndefined();
    expect(adresses).toEqual([]);
  });

  it("UNE LECTURE QUI LÈVE est dite à la console, et les nœuds suivants sont relus quand même", async () => {
    disque["C:/panne.wav"] = "panne";
    disque["C:/bon.wav"] = { nom: "bon.wav", donnees: octets("b") };
    const rendus = await recharger([
      noeud("1", "entree-audio", { parametres: { Chemin: "C:/panne.wav" } }),
      noeud("2", "entree-audio", { parametres: { Chemin: "C:/bon.wav" } }),
    ]);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(rendus[0].data.audioFichier).toBeUndefined();
    expect(rendus[1].data.audioNom).toBe("bon.wav");
  });

  it("SANS LE PONT D'ELECTRON, rien n'est lu et les nœuds reviennent tels quels", async () => {
    delete (globalThis as any).window.api;
    const n = noeud("a", "entree-audio", { parametres: { Chemin: "C:/sons/voix.wav" } });
    const rendus = await recharger([n]);
    expect(rendus).toHaveLength(1);
    expect(rendus[0].data).toEqual(n.data);
  });
});

describe("rechargerFichiersPersistes : n'écrit rien dans ce qu'on lui passe", () => {
  /** Gèle un nœud et tout ce qu'il porte d'objets simples : une écriture en place y lève. */
  function geler<T>(v: T): T {
    if (v && typeof v === "object" && !(v instanceof Blob)) {
      for (const x of Object.values(v)) geler(x);
      Object.freeze(v);
    }
    return v;
  }

  it("DES NŒUDS GELÉS SONT RECHARGÉS QUAND MÊME : le fichier arrive sur une copie", async () => {
    disque["C:/sons/voix.wav"] = { nom: "voix.wav", donnees: octets("v") };
    disque["C:/midi/theme.mid"] = { nom: "theme.mid", donnees: octets("m") };
    const entree = geler([
      noeud("a", "entree-audio", { parametres: { Chemin: "C:/sons/voix.wav" } }),
      noeud("m", "lecteur-midi", { parametres: { Chemin: "C:/midi/theme.mid" } }),
    ]);
    const rendus = await rechargerFichiersPersistes(entree);
    expect(console.warn).not.toHaveBeenCalled();
    expect(rendus.map((n: any) => [n.data.audioNom, n.data.midiNom])).toEqual([["voix.wav", undefined], [undefined, "theme.mid"]]);
    expect(entree[0].data).not.toHaveProperty("audioFichier");
    expect(entree[1].data).not.toHaveProperty("midiFichier");
  });

  it("UN NŒUD QUI N'A RIEN REÇU EST RENDU TEL QUEL, et un nœud rechargé garde tout le reste", async () => {
    disque["C:/sons/voix.wav"] = { nom: "voix.wav", donnees: octets("v") };
    const rappel = () => {};
    const inchange = noeud("g", "gain", { parametres: { Gain: 2 } });
    const recharge = noeud("a", "entree-audio", { parametres: { Chemin: "C:/sons/voix.wav" }, nom: "Voix", onSupprimerNoeud: rappel });
    const rendus = await rechargerFichiersPersistes([inchange, recharge]);
    expect(rendus[0]).toBe(inchange);
    expect(rendus[1]).not.toBe(recharge);
    expect(rendus[1].id).toBe("a");
    expect(rendus[1].position).toBe(recharge.position);
    expect(rendus[1].data.parametres).toBe(recharge.data.parametres);
    expect(rendus[1].data.nom).toBe("Voix");
    expect(rendus[1].data.onSupprimerNoeud).toBe(rappel);
    expect(recharge.data).not.toHaveProperty("audioFichier");
  });
});

describe("rechargerFichiersPersistes : aucun appelant ne jette ce qu'elle rend", () => {
  const SRC = fileURLToPath(new URL("..", import.meta.url));

  /** Les sources, hors tests : un test qui CITE la forme fautive ne la porte pas. */
  function sources(dossier: string): string[] {
    const rendu: string[] = [];
    for (const nom of readdirSync(dossier)) {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) rendu.push(...sources(chemin));
      else if (/\.(ts|tsx)$/.test(nom) && !/\.test\.tsx?$/.test(nom)) rendu.push(chemin);
    }
    return rendu;
  }

  /** Les commentaires retirés, comme dans le garde des écritures. */
  const sansCommentaires = (texte: string) =>
    texte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

  /** Une instruction qui appelle le rechargement et jette les nœuds rendus. */
  const JETE = /^\s*(?:await\s+|void\s+)?rechargerFichiersPersistes\s*\(/;
  /** Tout appel, hors la définition : c'est le dénominateur. */
  const APPEL = /(?<!function\s)rechargerFichiersPersistes\s*\(/g;

  const jetes = (texte: string) =>
    sansCommentaires(texte).split(/\r?\n/).flatMap((l, i) => (JETE.test(l) ? [i + 1] : []));

  it("LE MOTIF RECONNAÎT LA FORME FAUTIVE, et pas les formes qui lisent le résultat", () => {
    expect(jetes("        await rechargerFichiersPersistes(nodesRestaures);")).toEqual([1]);
    expect(jetes("  void rechargerFichiersPersistes(n);")).toEqual([1]);
    expect(jetes("  rechargerFichiersPersistes(n);")).toEqual([1]);
    expect(jetes("  const importedNodes = await rechargerFichiersPersistes(nodesLus);")).toEqual([]);
    expect(jetes("  setNodes(await rechargerFichiersPersistes(nodesRestaures));")).toEqual([]);
    expect(jetes("  const r = a ? await rechargerFichiersPersistes(x) : null;")).toEqual([]);
    expect(jetes("  // await rechargerFichiersPersistes(x);")).toEqual([]);
  });

  it("AUCUN APPEL NE JETTE LES NŒUDS RECHARGÉS", () => {
    let appels = 0;
    const fautes: string[] = [];
    for (const f of sources(SRC)) {
      const texte = readFileSync(f, "utf8");
      appels += (sansCommentaires(texte).match(APPEL) ?? []).length;
      for (const ligne of jetes(texte)) fautes.push(`${relative(SRC, f)}:${ligne}`);
    }
    // LE DÉNOMINATEUR : trois appelants le 2026-11-10, l'import, l'en-cours et le collage. Sous
    // trois, le garde ne regarde plus le bon endroit.
    expect(appels, "le garde ne voit plus les appelants : il regarde ailleurs").toBeGreaterThanOrEqual(3);
    expect(fautes, "ces appels jettent les nœuds rechargés : poser ce que la fonction rend").toEqual([]);
  });
});
