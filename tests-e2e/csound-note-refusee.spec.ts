// tests-e2e/csound-note-refusee.spec.ts — Une note que Csound refuse à l'initialisation est nommée.
//
// LE DÉFAUT, RELEVÉ LE 2026-11-27. Un orchestre qui lit « entree2.wav » sans qu'aucun son ne soit
// écrit sous ce nom fait imprimer à Csound « INIT ERROR … diskin2: entree2.wav: failed to open
// file », qui supprime la note, puis « Score finished in csoundPerformKsmps() with 2 » et « end of
// score ». La boucle de `rendreCsd` ne recevait pourtant de `performBuffer` que des zéros : elle
// tapait cinq fois le plafond de dix mille blocs, en quatre à cinq secondes, et le nœud rendait « la
// partition n'a pas atteint son terme », qui envoie chercher dans une partition qui n'y est pour rien.
// Mesuré au moteur sur diskin2 et soundin, et sur l'Effet Csound sans « Audio 2 » par `npm run
// mesurer`. Un diskin2 à une sortie sur un fichier stéréo faisait la même chose, alors que la doc de
// « Canaux d'entrée » promettait un rendu muet.
//
// CE QUE CE SPEC TIENT. Les trois refus au moteur rendent l'INIT ERROR, en une seule tentative ; deux
// nœuds la rendent dans leur message. Et deux témoins disent que la réparation ne refuse rien de
// plus : deux sons écrits rendent, et une note refusée parmi d'autres qui jouent laisse la partition
// finir, comme avant.
//
// Il ne tourne pas en CI, qui ne lance que les empreintes : il se lance à la demande, sur son port.
import { test, expect } from "@playwright/test";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5287);

/** Les modules du dépôt, chargés dans la page par leur adresse, comme l'application les charge. */
const MODULES = {
  lancer: "/src/audio/lancer-fiche.ts",
  registre: "/src/audio/adaptateur.ts",
  csound: "/src/audio/csound.ts",
};

/** Ce qu'un rendu laisse à lire, réduit à ce que les cas comparent. */
interface Releve {
  erreur: string | null;
  duree: number;
  crete: number;
  initErrors: number;
  tentatives: number;
}

test.describe("une note refusée à l'initialisation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 60_000 });
  });

  test("au moteur : l'INIT ERROR est rendue en une seule tentative, et les témoins rendent", async ({ page }) => {
    test.setTimeout(300_000);
    const r = await page.evaluate(async (m) => {
      const { construireCsd, rendreCsd } = await import(/* @vite-ignore */ m.csound);
      const NL = String.fromCharCode(10);
      const sinus = (canaux: number) => {
        const b = new AudioBuffer({ numberOfChannels: canaux, length: 44100, sampleRate: 44100 });
        for (let c = 0; c < canaux; c++) {
          const d = new Float32Array(44100);
          for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * 440 * (c + 1) * i / 44100);
          b.copyToChannel(d, c);
        }
        return b;
      };
      const e1 = { nom: "entree1.wav", buffer: sinus(1) };
      const e2 = { nom: "entree2.wav", buffer: sinus(1) };
      const lit2 = (opcode: string) => ["instr 1", '  a1 diskin2 "entree1.wav", 1',
        `  a2 ${opcode} "entree2.wav"${opcode === "diskin2" ? ", 1" : ""}`, "  out (a1 + a2) * 0.5", "endin"].join(NL);
      const cas = {
        diskin2: { orchestre: lit2("diskin2"), partition: "i1 0 2", entrees: [e1] },
        soundin: { orchestre: lit2("soundin"), partition: "i1 0 2", entrees: [e1] },
        stereo: { orchestre: ["instr 1", '  a1 diskin2 "entree1.wav", 1', "  out a1", "endin"].join(NL),
          partition: "i1 0 1", entrees: [{ nom: "entree1.wav", buffer: sinus(2), stereo: true }] },
        temoinDeuxSons: { orchestre: lit2("diskin2"), partition: "i1 0 2", entrees: [e1, e2] },
        temoinUneNoteParmiDautres: {
          orchestre: ["instr 1", "  out oscili(0.3, 440)", "endin", "instr 2", '  a1 diskin2 "entree2.wav", 1',
            "  out a1", "endin"].join(NL),
          partition: ["i1 0 1", "i2 0.5 0.5", "i1 1 1"].join(NL), entrees: [e1],
        },
      };
      const sortie: Record<string, unknown> = {};
      for (const [nom, c] of Object.entries(cas)) {
        const x = await rendreCsd(construireCsd({ orchestre: c.orchestre, partition: c.partition }), c.entrees);
        const lignes = (x.messages as string[]).flatMap((l) => l.split(NL));
        sortie[nom] = {
          erreur: x.erreur, duree: x.audio ? x.audio.duration : 0, crete: x.crete,
          initErrors: lignes.filter((l) => /INIT ERROR/.test(l)).length,
          tentatives: lignes.filter((l) => l.trim().startsWith("(tentative")).length,
        };
      }
      return sortie;
    }, MODULES) as Record<string, Releve>;

    const refus: [string, RegExp][] = [
      ["diskin2", /^INIT ERROR .*diskin2: entree2\.wav: failed to open file/],
      ["soundin", /^INIT ERROR .*opcode soundin.*entree2\.wav: failed to open file/],
      ["stereo", /^INIT ERROR .*number of output args inconsistent with number of file channels/],
    ];
    for (const [nom, cause] of refus) {
      expect(r[nom].erreur, nom).toMatch(cause);
      expect(r[nom].erreur, nom).not.toContain("n'a pas atteint son terme");
      // UNE SEULE TENTATIVE : la cause est dans l'orchestre, la reprendre ne la changerait pas.
      expect(r[nom].initErrors, nom).toBe(1);
      expect(r[nom].tentatives, nom).toBe(0);
      expect(r[nom].duree, nom).toBe(0);
    }
    expect(r.temoinDeuxSons.erreur).toBeNull();
    expect(r.temoinDeuxSons.duree).toBeGreaterThan(1.9);
    expect(r.temoinDeuxSons.crete).toBeGreaterThan(0.1);
    // LA NOTE REFUSÉE AU MILIEU NE BLOQUE RIEN : la partition finit, et le reste joue.
    expect(r.temoinUneNoteParmiDautres.erreur).toBeNull();
    expect(r.temoinUneNoteParmiDautres.initErrors).toBe(1);
    expect(r.temoinUneNoteParmiDautres.duree).toBeGreaterThan(1.9);
    expect(r.temoinUneNoteParmiDautres.crete).toBeGreaterThan(0.25);
  });

  test("dans les nœuds : l'Effet Csound sans Audio 2 et le nœud Csound mal apparié nomment la cause", async ({ page }) => {
    test.setTimeout(300_000);
    const r = await page.evaluate(async (m) => {
      const { lancerFiche } = await import(/* @vite-ignore */ m.lancer);
      const { registre } = await import(/* @vite-ignore */ m.registre);
      const F = (id: string) => registre.trouverDef(id);
      const NL = String.fromCharCode(10);
      const stereo = new AudioBuffer({ numberOfChannels: 2, length: 44100, sampleRate: 44100 });
      for (let c = 0; c < 2; c++) {
        const d = new Float32Array(44100);
        for (let i = 0; i < d.length; i++) d[i] = 0.4 * Math.sin(2 * Math.PI * 330 * (c + 1) * i / 44100);
        stereo.copyToChannel(d, c);
      }
      const effet = await lancerFiche(F("csound-effet"), {
        Orchestre: ["instr 1", '  a1 diskin2 "entree1.wav", 1', '  a2 diskin2 "entree2.wav", 1',
          "  out (a1 + a2) * 0.5", "endin"].join(NL),
      }, { entrees: [stereo, null, null] });
      const csound = await lancerFiche(F("csound"), {
        Orchestre: ["instr 1", '  a1 diskin2 "entree1.wav", 1', "  out a1", "endin"].join(NL),
        Partition: "i1 0 1", "Canaux d'entrée": "stereo",
      }, { entrees: [stereo, null, null, null] });
      const lu = (x: { message: string; erreurRendue: boolean; levee: unknown; valeurs: unknown[] }) => ({
        message: x.message, erreur: x.erreurRendue, levee: x.levee ? String(x.levee) : null,
        audio: x.valeurs[0] instanceof AudioBuffer,
      });
      return { effet: lu(effet), csound: lu(csound) };
    }, MODULES);

    expect(r.effet.levee).toBeNull();
    expect(r.effet.erreur).toBe(true);
    expect(r.effet.audio).toBe(false);
    expect(r.effet.message).toMatch(/INIT ERROR .*diskin2: entree2\.wav: failed to open file/);
    expect(r.effet.message).not.toContain("n'a pas atteint son terme");
    expect(r.csound.levee).toBeNull();
    expect(r.csound.erreur).toBe(true);
    expect(r.csound.audio).toBe(false);
    expect(r.csound.message).toMatch(/INIT ERROR .*number of output args inconsistent/);
    expect(r.csound.message).not.toContain("n'a pas atteint son terme");
  });
});
