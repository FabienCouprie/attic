// plugins/banque-sfz.test.ts — Le nœud qui apporte le kit, et ce qu'il annonce.
//
// Ce qui se joue ici est le CÂBLAGE : la source par défaut est le kit embarqué, donc un nœud posé sans
// rien régler doit donner une batterie ; le mode imposé doit gagner sur la détection ; et un kit
// introuvable doit être annoncé comme une installation incomplète, pas comme une erreur de
// l'utilisateur — ce sont deux gestes différents.
//
// Le disque est en double : `lireTexte` rend le texte du kit, `lireFichierAudio` un chemin que le
// décodeur factice retrouve. Le vrai kit versionné, lui, est éprouvé dans `audio/kit-batterie.test.ts`.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it, vi } from "vitest";
import { fiches } from "./banque-sfz";
import { CHEMIN_KIT_EMBARQUE, VOIX_KIT, sfzDuKit } from "../audio/kit-batterie";
import { choisirZone, voixPourNote, type Banque } from "../audio/clavier-banque";

const fiche = fiches.find((f) => f.id === "banque-sfz")!;
const SR = 22050;

const echantillon = (longueur = 4096) => {
  const a = new AudioBuffer({ numberOfChannels: 1, length: longueur, sampleRate: SR });
  const d = a.getChannelData(0);
  for (let i = 0; i < longueur; i++) d[i] = Math.sin((2 * Math.PI * 220 * i) / SR) * Math.exp(-i / 2000);
  return a;
};

const SFZ_ETALE = `
<region> sample=bas.wav lokey=21 hikey=59 pitch_keycenter=45
<region> sample=haut.wav lokey=60 hikey=108 pitch_keycenter=72
`;

/** Le monde extérieur en double : un texte par chemin, et des échantillons par nom de fichier. */
function installerMonde(textes: Record<string, string>, presents: string[]) {
  const api = {
    lireTexte: vi.fn(async (chemin: string) => textes[chemin] ?? null),
    lireFichierAudio: vi.fn(async (chemin: string) => ({ url: chemin })),
  };
  (globalThis as any).window = { api };
  (globalThis as any).fetch = vi.fn(async (url: string) => ({
    arrayBuffer: async () => new TextEncoder().encode(url).buffer,
  }));
  const runtime = {
    decodeAudioData: vi.fn(async (ab: ArrayBuffer) => {
      const chemin = new TextDecoder().decode(ab);
      if (!presents.some((p) => chemin.endsWith(p))) throw new Error(`absent : ${chemin}`);
      return echantillon();
    }),
  };
  return { api, runtime };
}

function contexte(runtime: unknown, params: Record<string, string> = {}, data: Record<string, unknown> = {}) {
  return {
    noeud: { id: "n1", data: { ficheId: "banque-sfz", parametres: params, ...data } },
    runtime,
    entree: () => null,
    entrees: () => [],
    paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
    paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
  };
}

const MONDE_KIT = () => installerMonde(
  { [CHEMIN_KIT_EMBARQUE]: sfzDuKit() }, VOIX_KIT.map((v) => v.fichier),
);

describe("le nœud Banque SFZ", () => {
  it("donne le KIT INTÉGRÉ sans qu'on règle quoi que ce soit", async () => {
    const { runtime, api } = MONDE_KIT();
    const res = await fiche.executer(contexte(runtime) as any);
    expect(api.lireTexte).toHaveBeenCalledWith(CHEMIN_KIT_EMBARQUE);
    const banque = res.valeurs[0] as unknown as Banque;
    expect(banque.kit).toBe(true);
    expect(banque.zones.length).toBe(VOIX_KIT.length);
    expect(res.message).toContain("kit");
    expect(res.message).toContain("Attic");
    // L'aperçu fait entendre les huit sons : c'est la seule façon de vérifier un kit sans MIDI.
    expect(res.valeurs[1]).toBeInstanceOf(AudioBuffer);
    expect((res.valeurs[1] as AudioBuffer).duration).toBeGreaterThan(VOIX_KIT.length * 0.2);
  });

  it("cherche les échantillons À CÔTÉ du .sfz du kit", async () => {
    const { runtime, api } = MONDE_KIT();
    await fiche.executer(contexte(runtime) as any);
    const demandes = api.lireFichierAudio.mock.calls.map((c) => c[0]);
    expect(demandes[0]).toBe("./sfz/kit-attic/grosse-caisse.wav");
    expect(demandes.length).toBe(VOIX_KIT.length);
  });

  it("le kit ne transpose rien et laisse muette une touche sans son", async () => {
    const { runtime } = MONDE_KIT();
    const res = await fiche.executer(contexte(runtime) as any);
    const banque = res.valeurs[0] as unknown as Banque;
    expect(voixPourNote(banque, 36)!.ratio).toBeCloseTo(1, 10);
    expect(voixPourNote(banque, 49)!.ratio).toBeCloseTo(1, 10);
    expect(choisirZone(banque, 37)).toBeNull();
    expect(choisirZone(banque, 60)).toBeNull();
  });

  it("dit que l'INSTALLATION est incomplète quand le kit intégré manque", async () => {
    const { runtime } = installerMonde({}, []);
    const res = await fiche.executer(contexte(runtime) as any);
    expect(res.valeurs).toEqual([null, null]);
    expect(res.message).toContain("installation");
    expect(res.message).toContain("kit:generer");
  });

  it("charge un fichier du disque quand on le lui demande", async () => {
    const { runtime, api } = installerMonde({ "E:/sons/piano.sfz": SFZ_ETALE }, ["bas.wav", "haut.wav"]);
    const res = await fiche.executer(contexte(runtime,
      { "Source": "fichier" }, { sfzChemin: "E:/sons/piano.sfz", sfzNom: "piano.sfz" }) as any);
    expect(api.lireTexte).toHaveBeenCalledWith("E:/sons/piano.sfz");
    const banque = res.valeurs[0] as unknown as Banque;
    expect(banque.kit).toBeUndefined();            // deux régions larges : ce n'est pas un kit
    expect(banque.zones.length).toBe(2);
    expect(res.message).not.toContain("Attic");
  });

  it("réclame un fichier plutôt que de charger le kit en douce", async () => {
    const { runtime } = installerMonde({}, []);
    const res = await fiche.executer(contexte(runtime, { "Source": "fichier" }) as any);
    expect(res.valeurs).toEqual([null, null]);
    expect(res.message).toContain("📂");
  });

  it("le type imposé gagne sur la détection, dans les deux sens", async () => {
    const { runtime } = MONDE_KIT();
    const enHauteurs = await fiche.executer(contexte(runtime, { "Type de banque": "hauteurs" }) as any);
    const bh = enHauteurs.valeurs[0] as unknown as Banque;
    expect(bh.kit).toBeUndefined();
    // Le comportement qu'on cherchait à éviter, ici demandé explicitement : la touche 37 joue la
    // grosse caisse un demi-ton plus haut.
    expect(choisirZone(bh, 37)?.racine).toBe(36);
    expect(voixPourNote(bh, 37)!.ratio).toBeCloseTo(Math.pow(2, 1 / 12), 6);

    const { runtime: r2 } = installerMonde({ "E:/x.sfz": SFZ_ETALE }, ["bas.wav", "haut.wav"]);
    const enKit = await fiche.executer(contexte(r2,
      { "Source": "fichier", "Type de banque": "kit" }, { sfzChemin: "E:/x.sfz" }) as any);
    const bk = enKit.valeurs[0] as unknown as Banque;
    expect(bk.kit).toBe(true);
    expect(voixPourNote(bk, 59)!.ratio).toBeCloseTo(1, 10);
  });

  it("sait se passer d'aperçu quand on ne le veut pas", async () => {
    const { runtime } = MONDE_KIT();
    const res = await fiche.executer(contexte(runtime, { "Aperçu": "non" }) as any);
    expect(res.valeurs[0]).not.toBeNull();
    expect(res.valeurs[1]).toBeNull();
  });

  it("compte les échantillons introuvables plutôt que de jouer un kit troué en silence", async () => {
    const { runtime } = installerMonde({ [CHEMIN_KIT_EMBARQUE]: sfzDuKit() }, ["grosse-caisse.wav", "caisse-claire.wav"]);
    const res = await fiche.executer(contexte(runtime) as any);
    const banque = res.valeurs[0] as unknown as Banque;
    expect(banque.zones.length).toBe(2);
    expect(res.message).toContain(`${VOIX_KIT.length - 2} échantillon(s) manquant(s)`);
  });
});

describe("les couches de vélocité, au niveau du nœud", () => {
  const TROIS_COUCHES = `
    <region> sample=doux.wav lokey=57 hikey=59 pitch_keycenter=57 lovel=1 hivel=42
    <region> sample=moyen.wav lokey=57 hikey=59 pitch_keycenter=57 lovel=43 hivel=85
    <region> sample=fort.wav lokey=57 hikey=59 pitch_keycenter=57 lovel=86 hivel=127
    <region> sample=doux.wav lokey=60 hikey=62 pitch_keycenter=60 lovel=1 hivel=85
    <region> sample=fort.wav lokey=60 hikey=62 pitch_keycenter=60 lovel=86 hivel=127
  `;
  const monde = () => installerMonde({ "E:/piano.sfz": TROIS_COUCHES },
    ["doux.wav", "moyen.wav", "fort.wav"]);
  const executer = (runtime: unknown, params: Record<string, string> = {}) =>
    fiche.executer(contexte(runtime, { "Source": "fichier", ...params }, { sfzChemin: "E:/piano.sfz" }) as any);

  it("annonce le nombre de couches, et garde toutes les zones", async () => {
    const { runtime } = monde();
    const res = await executer(runtime);
    const banque = res.valeurs[0] as unknown as Banque;
    expect(banque.zones.length).toBe(5);
    expect(banque.couches).toBe(3);
    expect(res.message).toContain("3 couches de vélocité");
  });

  it("l'APERÇU joue une note par touche, puis un escalier de nuances", async () => {
    const { runtime } = monde();
    const res = await executer(runtime);
    const apercu = res.valeurs[1] as AudioBuffer;
    // Deux racines (57 et 60) et trois couches sur celle du milieu : deux notes, une pause, trois
    // notes. Sans le dédoublonnage par racine, l'aperçu aurait joué cinq notes dont trois identiques.
    expect(apercu).toBeInstanceOf(AudioBuffer);
    expect(apercu.duration).toBeGreaterThan(5 * 0.35);
    expect(apercu.duration).toBeLessThan(9 * 0.35);
  });

  it("le fichier sans couche garde exactement le comportement d'avant", async () => {
    const { runtime } = installerMonde({ "E:/piano.sfz": SFZ_ETALE }, ["bas.wav", "haut.wav"]);
    const res = await executer(runtime);
    const banque = res.valeurs[0] as unknown as Banque;
    expect(banque.couches).toBeUndefined();
    expect(res.message).not.toContain("couches");
  });
});
