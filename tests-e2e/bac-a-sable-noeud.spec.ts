// tests-e2e/bac-a-sable-noeud.spec.ts — Un nœud installé n'atteint plus le pont, et fait encore de l'audio.
//
// ═══ LE SEUL ENDROIT QUI PUISSE LE MESURER ═══
//
// `src/core/node-essai.test.ts` mesure ce qu'un code évalué DANS LA PAGE atteint, et il a montré
// qu'il atteignait tout : `window`, `localStorage`, et le pont par `window.api`. Ces cas-ci
// mesurent l'autre côté de la barrière — ce qu'il atteint depuis le CADRE ISOLÉ.
//
// JSDOM NE PEUT PAS LE DIRE : il n'a ni origine opaque, ni Web Audio. Un cas unitaire qui
// prétendrait éprouver cette isolation mesurerait sa propre imitation, ce qui est la façon la plus
// sûre de croire protégé ce qui ne l'est pas. Le banc vit donc dans un vrai navigateur.
//
// ET LES DEUX MOITIÉS COMPTENT AUTANT. Retirer le pont en retirant l'audio aurait été facile et
// inutile : un nœud installé doit encore pouvoir rendre du son. C'est pourquoi le choix s'est porté
// sur un cadre et non sur un Worker, où ni `AudioContext` ni `AudioBuffer` n'existent.
import { expect, test } from "@playwright/test";

import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5259);

/**
 * Un nœud d'essai qui SONDE sa prison, puis rend un son. Il ne commet rien.
 *
 * L'ORIGINE EFFECTIVE SE LIT PAR « self.origin », ET NON PAR « location.origin ». Le second reflète
 * l'ADRESSE chargée : il valait « null » tant que la page était posée par `srcdoc`, et vaut
 * l'adresse du serveur depuis qu'elle a la sienne (2026-10-27), sans que rien de l'isolation n'ait
 * changé. Le stockage du cadre, refusé à une origine opaque, en est le second témoin.
 */
const CODE_SONDE = `
  module.exports = async (ctx) => {
    const vu = { origine: String(self.origin), adresse: String(location.origin), api: typeof window.api,
      parent: "?", stockage: "?", reglages: null };
    try { vu.parent = typeof window.parent.api; } catch (e) { vu.parent = "REFUSE:" + e.name; }
    try { vu.stockage = "ACCESSIBLE:" + localStorage.length; } catch (e) { vu.stockage = "REFUSE:" + e.name; }
    vu.reglages = ctx.reglagesDeProjet || null;

    const hz = ctx.paramNombre("Fréquence", 440);
    const c = new OfflineAudioContext(1, 2205, 44100);
    const o = c.createOscillator(); o.frequency.value = hz; o.connect(c.destination); o.start();
    const rendu = await c.startRendering();
    let crete = 0; const d = rendu.getChannelData(0);
    for (let i = 0; i < d.length; i++) crete = Math.max(crete, Math.abs(d[i]));

    ctx.onProgress("sonde faite");
    return { valeurs: [{ __audio: true, canaux: [d], frequence: rendu.sampleRate }], vu, crete };
  };
`;

test.describe("le bac à sable d'un nœud installé", () => {
  test("LE PONT EST HORS DE PORTÉE, ET L'AUDIO EST INTACT", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 30_000 });

    const rendu = await page.evaluate(async (code) => {
      const bac = (globalThis as unknown as { __attic_bac__?: {
        executer: (cle: string, code: string, ctx: Record<string, unknown>,
          surProgres: (m: string) => void, signal?: AbortSignal) => Promise<Record<string, unknown>>;
        oublier: (cle: string) => void;
      } }).__attic_bac__;
      if (!bac) return { absent: true };
      const progres: string[] = [];
      const r = await bac.executer("essai-bac", code, {
        noeud: { id: "n-1", data: { parametres: { "Fréquence": 660 } } },
        repertoireTravail: "", parametres: { "Fréquence": 660 },
        entrees: [], sortiesBranchees: [true], reglagesDeProjet: { frequenceDeTravail: 44100 },
      }, (m) => progres.push(m));
      bac.oublier("essai-bac");
      return { ...r, progres };
    }, CODE_SONDE);

    expect(rendu.absent, "la couture du bac doit être posée").toBeUndefined();

    const vu = (rendu as { vu: Record<string, string> }).vu;
    console.log("[bac] vu depuis le cadre :", JSON.stringify(vu));
    expect(vu.origine, "le cadre a une origine OPAQUE").toBe("null");
    expect(vu.stockage, "une origine opaque n'a pas de stockage : le cadre en a un").toMatch(/^REFUSE:SecurityError$/);
    expect(vu.api, "`window.api` n'existe pas dans le cadre").toBe("undefined");
    expect(vu.parent, [
      "",
      "LE CADRE ATTEINT SON PARENT, DONC LE PONT.",
      "",
      "Une origine opaque doit rendre `window.parent` injoignable. Si cette ligne tombe, c'est que",
      "`allow-same-origin` a été ajouté au bac à sable, et le bac ne protège plus rien.",
      "",
    ].join("\n")).toMatch(/^REFUSE:SecurityError$/);

    // ET L'AUDIO : un oscillateur rendu DANS le cadre, à la fréquence que le réglage demandait.
    expect((rendu as { crete: number }).crete, "un oscillateur rend une crête à un").toBeCloseTo(1, 1);
    const valeurs = (rendu as { valeurs: { __audio?: boolean; frequence?: number; canaux?: unknown[] }[] }).valeurs;
    expect(valeurs?.[0]?.__audio, "le son traverse la frontière sous sa forme transportable").toBe(true);
    expect(valeurs[0].frequence).toBe(44100);
    expect((valeurs[0].canaux as ArrayLike<number>[])[0].length).toBe(2205);

    expect((rendu as { progres: string[] }).progres, "l'avancement traverse aussi").toEqual(["sonde faite"]);
  });

  test("ET LES RÉGLAGES DU DOMAINE ARRIVENT, qui remplacent le runtime", async ({ page }) => {
    // `ctx.runtime` ne traverse pas : c'est un contexte audio du moteur. Ce qu'un nœud en tirait —
    // la fréquence de travail — lui arrive désormais en donnée.
    test.setTimeout(120_000);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 30_000 });

    const vu = await page.evaluate(async (code) => {
      const bac = (globalThis as unknown as { __attic_bac__?: {
        executer: (cle: string, code: string, ctx: Record<string, unknown>, p: (m: string) => void) => Promise<Record<string, unknown>>;
        oublier: (cle: string) => void;
      } }).__attic_bac__;
      const r = await bac!.executer("essai-reglages", code, {
        noeud: { id: "n-1", data: { parametres: {} } }, repertoireTravail: "",
        parametres: {}, entrees: [], sortiesBranchees: [true],
        reglagesDeProjet: { frequenceDeTravail: 48000 },
      }, () => {});
      bac!.oublier("essai-reglages");
      return (r as { vu: { reglages: Record<string, number> } }).vu.reglages;
    }, CODE_SONDE);

    expect(vu?.frequenceDeTravail).toBe(48000);
  });
});
