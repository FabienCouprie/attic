// tests-e2e/gel-de-conversion-dans-application.spec.ts — Un fichier à une autre fréquence que le
// projet entre dans le graphe sans arrêter l'interface.
//
// ═══ LE DÉFAUT, SIGNALÉ PAR FABIEN LE 2026-10-27 ═══
//
// « Les nœuds Entrée audio et Explorateur musique sont devenus lents et gèlent pendant
// l'exécution. » Les deux décodent un fichier à SA fréquence (`audio/frequence-source.ts`), et le
// moteur porte ensuite toute sortie à la fréquence du projet (`porterALaFrequenceDeTravail`). Quand
// on DESCEND, la conversion passe par un passe-bas de 191 coefficients, calculé dans le fil de
// l'interface : 19,5 ms par seconde de son et par canal, mesuré dans V8. Quatorze des quinze pistes
// de la collection sont à 48 kHz, et le projet travaille par défaut à 44,1.
//
// ═══ CE QU'IL MESURE, ET LE TÉMOIN QUI LE REND DÉCIDABLE ═══
//
// LE PLUS LONG SILENCE D'UNE SONDE `MessageChannel` pendant le run, et non un temps total : un
// travail long hors du fil est permis, un fil qui ne répond plus ne l'est pas. La sonde est celle
// du banc, et pour la même raison : l'arrière-plan ne la ralentit pas.
//
// LE MÊME FICHIER, PROJET RÉGLÉ À 48 kHz, est le témoin : rien n'y est converti. Ce qui gèle
// encore à 48 kHz vient d'ailleurs que de la conversion — le décodage, l'aperçu, le dessin de
// l'onde —, et ce cas ne le juge pas. Il juge l'ÉCART entre les deux runs.
import { expect, test, type Page } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { serveurDeVerification } from "./serveur-de-developpement";
import { etatDesNoeuds, relancerEtAttendre, semerEtLancer } from "./pilote-graphe";

const devUrl = serveurDeVerification(5264);

/** Deux minutes : la durée d'une piste ordinaire, et assez pour qu'un gel ne se perde pas. */
const DUREE_S = 120;

/** Un WAV stéréo 16 bits à 48 kHz : un la à gauche, un mi à droite, et un peu d'aigu. */
function wavStereo(frequence: number, duree: number): Buffer {
  const n = Math.round(frequence * duree);
  const corps = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const t = i / frequence;
    const aigu = 0.05 * Math.sin(2 * Math.PI * 12000 * t);
    corps.writeInt16LE(Math.round((0.3 * Math.sin(2 * Math.PI * 440 * t) + aigu) * 32767), i * 4);
    corps.writeInt16LE(Math.round((0.3 * Math.sin(2 * Math.PI * 659.25 * t) + aigu) * 32767), i * 4 + 2);
  }
  const tete = Buffer.alloc(44);
  tete.write("RIFF", 0); tete.writeUInt32LE(36 + corps.length, 4); tete.write("WAVE", 8);
  tete.write("fmt ", 12); tete.writeUInt32LE(16, 16); tete.writeUInt16LE(1, 20);
  tete.writeUInt16LE(2, 22); tete.writeUInt32LE(frequence, 24);
  tete.writeUInt32LE(frequence * 4, 28); tete.writeUInt16LE(4, 32); tete.writeUInt16LE(16, 34);
  tete.write("data", 36); tete.writeUInt32LE(corps.length, 40);
  return Buffer.concat([tete, corps]);
}

/** La sonde du banc : un message qui se renvoie à lui-même tant que le fil le laisse passer. */
async function poserSonde(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __sonde?: { instants: number[]; actif: boolean } };
    const sonde = { instants: [] as number[], actif: true };
    w.__sonde = sonde;
    const canal = new MessageChannel();
    canal.port1.onmessage = () => {
      sonde.instants.push(performance.now());
      if (sonde.actif) canal.port2.postMessage(0);
    };
    canal.port2.postMessage(0);
  });
}

/** Le plus long silence de la sonde, et combien de messages sont passés. */
async function lireSonde(page: Page): Promise<{ gelMs: number; messages: number }> {
  return await page.evaluate(() => {
    const sonde = (window as unknown as { __sonde: { instants: number[]; actif: boolean } }).__sonde;
    sonde.actif = false;
    let plus = 0;
    for (let i = 1; i < sonde.instants.length; i++) plus = Math.max(plus, sonde.instants[i] - sonde.instants[i - 1]);
    return { gelMs: Math.round(plus), messages: sonde.instants.length };
  });
}

/** Le graphe d'un composant source relié à une sortie : la source est celle qu'on éprouve. */
const grapheDe = (ficheId: string, parametres: Record<string, string>) => JSON.stringify({
  nodes: [
    { id: "piste", position: { x: 0, y: 0 }, width: 320, height: 380, data: { ficheId, parametres } },
    { id: "sortie", position: { x: 420, y: 0 }, data: { ficheId: "sortie-audio", parametres: {} } },
  ],
  edges: [
    { id: "e0", source: "piste", target: "sortie", sourceHandle: "out:0", targetHandle: "in:0", type: "arete-personnalisee" },
  ],
});

/**
 * Les deux runs : projet à 44,1 kHz, où le fichier est converti, puis le témoin à 48 kHz, et le
 * verdict. `charger` pose le fichier sur la source par le geste propre à ce composant.
 */
async function eprouver(page: Page, graphe: string, charger: (p: Page) => Promise<void>): Promise<void> {
  // ═══ 1. LE PROJET À 44,1 kHz, SON DÉFAUT : LE FICHIER À 48 kHz EST CONVERTI ═══
  let t0 = 0;
  await semerEtLancer(page, devUrl, graphe, {
    profondeurExport: 32,
    avantDeLancer: async (p) => {
      await charger(p);
      await p.waitForTimeout(3000);
      await poserSonde(p);
      t0 = Date.now();
    },
  });
  const converti = { ...(await lireSonde(page)), runMs: Date.now() - t0 };
  const etats = await etatDesNoeuds(page);
  for (const e of etats) console.log(`  ${e.id} · ${e.statut} · ${e.message ?? "—"}${e.cause ? ` · ${e.cause}` : ""}`);
  expect(etats.every((e) => e.statut === "termine"), "le graphe doit aboutir").toBe(true);

  // ═══ 2. LE TÉMOIN : LE MÊME FICHIER, PROJET À 48 kHz, RIEN À CONVERTIR ═══
  await page.locator(".attic-frequence-travail").selectOption("48000", { timeout: 15_000 });
  await page.waitForTimeout(1500);
  await poserSonde(page);
  t0 = Date.now();
  await relancerEtAttendre(page, { profondeurExport: 32 });
  const temoin = { ...(await lireSonde(page)), runMs: Date.now() - t0 };

  console.log(`converti 48 000 -> 44 100 · plus long gel ${converti.gelMs} ms · ${converti.messages} messages · run ${converti.runMs} ms`);
  console.log(`témoin à 48 000          · plus long gel ${temoin.gelMs} ms · ${temoin.messages} messages · run ${temoin.runMs} ms`);

  // ═══ 3. LA CONVERSION N'AJOUTE PAS DE GEL ═══
  //
  // UNE SECONDE DE MARGE sur le témoin, et l'écart à franchir est grand. Mesuré le 2026-10-27 sur
  // l'Entrée audio : 13 020 ms de gel avec la conversion dans le fil, 529 ms une fois sortie,
  // 501 ms pour le témoin. Une machine deux fois plus rapide gèlerait encore six secondes.
  expect(converti.gelMs, [
    "",
    "LA CONVERSION DE FRÉQUENCE GÈLE DE NOUVEAU L'INTERFACE.",
    "",
    `Plus long gel : ${converti.gelMs} ms converti, ${temoin.gelMs} ms pour le témoin sans conversion.`,
    "Le moteur porte chaque sortie à la fréquence du projet par `porterALaFrequenceDeTravail`, dans",
    "`plugins/apercu-domaine.ts` ; le calcul d'un canal doit y passer par `porterHorsDuFil`, un",
    "travailleur par canal. Sans lui, `convertirVersFrequence` calcule dans le fil.",
    "",
  ].join("\n")).toBeLessThan(temoin.gelMs + 1000);
}

test.describe("un fichier à une autre fréquence, dans l'application", () => {
  test.setTimeout(600_000);

  let chemin = "";
  test.beforeAll(() => {
    chemin = join(mkdtempSync(join(tmpdir(), "attic-gel-")), "piste-48k.wav");
    writeFileSync(chemin, wavStereo(48000, DUREE_S));
  });

  test("L'ENTREE AUDIO : LA CONVERSION NE GELE PAS L'INTERFACE", async ({ page }) => {
    await eprouver(page, grapheDe("entree-audio", { Chemin: "" }), async (p) => {
      await p.locator('[data-id="piste"] .attic-node-fichier input[type=file]')
        .setInputFiles(chemin, { timeout: 15_000 });
    });
  });

  test("ET LE SON CONVERTI HORS DU FIL EST CELUI DU CALCUL DANS LE FIL, au bit près", async ({ page }) => {
    // LA PREUVE QUE `docs/couverture-empreintes.test.ts` DEMANDE À TOUT TRAVAILLEUR DE CALCUL, faite
    // ici parce que `frequence-worker.ts` ne sert aucun composant : il sert le moteur, que le banc
    // des empreintes ne traverse pas. Le moteur convertit un bruit stéréo par ses travailleurs, le
    // calcul dans le fil convertit le même, et l'on compte les échantillons qui diffèrent. Les
    // constructions de `Worker` sont comptées : sans elles, deux calculs dans le fil passeraient.
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 15_000 });
    const r = await page.evaluate(async () => {
      const charger = (chemin: string) => import(/* @vite-ignore */ chemin) as Promise<any>;
      const { APERCU_AUDIO } = await charger("/src/plugins/apercu-domaine.ts");
      const { convertirVersFrequence } = await charger("/src/audio/convertir-frequence.ts");
      const { frequenceDeTravail } = await charger("/src/audio/frequence-de-travail.ts");
      const projet: number = frequenceDeTravail();
      const depart = projet === 48000 ? 44100 : 48000;
      const son = new AudioBuffer({ numberOfChannels: 2, length: depart * 3, sampleRate: depart });
      let s = 12345;
      for (let c = 0; c < 2; c++) {
        const x = son.getChannelData(c);
        for (let i = 0; i < x.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; x[i] = s / 2 ** 32 - 0.5; }
      }
      const Origine = window.Worker;
      let travailleurs = 0;
      window.Worker = class extends Origine {
        constructor(url: string | URL, o?: WorkerOptions) { super(url, o); travailleurs += 1; }
      };
      const [hors] = await APERCU_AUDIO.porterALaFrequenceDeTravail([son]);
      window.Worker = Origine;
      const dans = await convertirVersFrequence(son, projet);
      let differents = 0;
      for (let c = 0; c < 2; c++) {
        const a = hors.getChannelData(c), b = dans.getChannelData(c);
        if (a.length !== b.length) return { projet, travailleurs, differents: -1, longueur: a.length };
        for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) differents += 1;
      }
      return { projet, travailleurs, differents, longueur: hors.length, frequence: hors.sampleRate };
    });
    console.log(`bruit stéréo de 3 s porté à ${r.projet} Hz · ${r.travailleurs} travailleurs · ${r.longueur} échantillons · ${r.differents} différents`);
    expect(r.travailleurs, "la conversion du moteur n'est pas passée par ses travailleurs").toBe(2);
    expect(r.frequence).toBe(r.projet);
    expect(r.differents, "le son converti hors du fil n'est pas celui du calcul dans le fil").toBe(0);
  });

  test("L'EXPLORATEUR MUSIQUE : LA CONVERSION NE GELE PAS L'INTERFACE", async ({ page }) => {
    // LE COMPOSANT NE LIT LE DISQUE QUE PAR LE PONT, qui n'existe pas dans un navigateur : une
    // fausse `window.api` lui présente un dossier d'une piste, comme `explorateur-musique.spec.ts`.
    // La piste est servie par une route, plutôt que portée dans le script : elle pèse 23 Mo.
    await page.route("**/__piste-48k.wav", (r) => r.fulfill({ path: chemin, contentType: "audio/wav" }));
    await page.addInitScript(() => {
      (window as unknown as { api: unknown }).api = {
        lireDossier: async () => [{ nom: "piste-48k.wav", chemin: "music collection/piste-48k.wav" }],
        lireFichierAudio: async () => ({
          url: "", nom: "piste-48k.wav",
          donnees: new Uint8Array(await (await fetch("/__piste-48k.wav")).arrayBuffer()),
        }),
        choisirDossier: async () => null,
      };
    });
    await eprouver(page, grapheDe("explorateur-musique", { Chemin: "music collection" }), async (p) => {
      const noeud = p.locator('.react-flow__node[data-id="piste"]');
      await noeud.locator(".attic-node-fichier-btn").first().click();
      await noeud.locator("select.attic-node-select").selectOption({ index: 0 }, { timeout: 15_000 });
    });
  });
});
