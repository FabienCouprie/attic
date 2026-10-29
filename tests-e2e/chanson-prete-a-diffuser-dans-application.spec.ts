// tests-e2e/chanson-prete-a-diffuser-dans-application.spec.ts — L'exemple tient ce que sa note promet, dans Electron.
//
// CE QUE LA BASE DES EXEMPLES NE PEUT PAS DIRE. `empreintes-exemples.spec.ts` joue chaque exemple
// dans un navigateur, où ACE-Step n'existe pas : elle relève pour celui-ci « Nécessite Electron », et
// rien de la chaîne de finition. Cette épreuve le lance dans l'application de bureau, tel qu'il est
// livré, et tient les deux promesses de sa note : une crête vraie sous −1 dBTP et une sonie de
// −14 LUFS. Elle relit la crête vraie par `audio/crete-vraie.ts` sur le son rapporté, et non sur la
// seule foi du message.
//
// ELLE ÉCRIT LE SON BRUT ET LE SON FINI dans son dossier de résultats, pour qu'on les écoute côte à
// côte : c'est l'oreille qui juge la finition, la mesure ne tient que les plafonds.
//
// Elle se saute sans build, sans le moteur ou sans les modèles d'ACE-Step.
import { test, expect, _electron as electron, type Page } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { creteVraie } from "../src/audio/crete-vraie";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const MOTEUR = join(RACINE, "bin", "acestep", "ace-synth.exe");
const MODELES = ["acestep-5Hz-lm-0.6B-Q8_0.gguf", "acestep-v15-turbo-Q6_K.gguf", "vae-BF16.gguf", "Qwen3-Embedding-0.6B-Q8_0.gguf"]
  .map((f) => join(RACINE, "public", "acestep", f));
const EXEMPLE = join(RACINE, "exemples", "une-chanson-prete-a-diffuser.json");

/** Le message affiché d'un nœud. */
const message = (page: Page, id: string) =>
  page.locator(`[data-id="${id}"] .attic-node-message`).first().textContent({ timeout: 5000 }).catch(() => "");

/** Le son d'un nœud en WAV flottant 32 bits, et ses canaux, lus dans les résultats de l'exécution. */
async function sonDe(page: Page, id: string) {
  return page.evaluate(async (nid) => {
    const r = (globalThis as unknown as { __attic_execution__?: { resultats?: Map<string, unknown[]> } }).__attic_execution__?.resultats;
    const b = (r instanceof Map ? r.get(nid)?.[0] : null) as AudioBuffer | null;
    if (!b) return null;
    const n = b.length, c = b.numberOfChannels, octets = new DataView(new ArrayBuffer(44 + n * c * 4));
    const ecrire = (o: number, s: string) => { for (let i = 0; i < s.length; i++) octets.setUint8(o + i, s.charCodeAt(i)); };
    ecrire(0, "RIFF"); octets.setUint32(4, 36 + n * c * 4, true); ecrire(8, "WAVE"); ecrire(12, "fmt ");
    octets.setUint32(16, 16, true); octets.setUint16(20, 3, true); octets.setUint16(22, c, true);
    octets.setUint32(24, b.sampleRate, true); octets.setUint32(28, b.sampleRate * c * 4, true);
    octets.setUint16(32, c * 4, true); octets.setUint16(34, 32, true); ecrire(36, "data"); octets.setUint32(40, n * c * 4, true);
    const canaux = Array.from({ length: c }, (_, k) => b.getChannelData(k));
    for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) octets.setFloat32(44 + (i * c + k) * 4, canaux[k][i], true);
    let binaire = "";
    const vue = new Uint8Array(octets.buffer);
    for (let i = 0; i < vue.length; i += 0x8000) binaire += String.fromCharCode(...vue.subarray(i, i + 0x8000));
    return { base64: btoa(binaire), canaux: c, duree: b.duration };
  }, id);
}

/** Les canaux d'un WAV flottant 32 bits écrit par `sonDe`. */
function canauxDe(wav: Buffer, c: number): Float32Array[] {
  const n = (wav.length - 44) / 4 / c, sortie = Array.from({ length: c }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) sortie[k][i] = wav.readFloatLE(44 + (i * c + k) * 4);
  return sortie;
}

test.describe("« Une chanson prête à diffuser », de bout en bout", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.skip(!existsSync(MOTEUR), "acestep.cpp absent : « npm run outils ».");
  test.skip(!MODELES.every(existsSync), "Modèles d'ACE-Step absents : les récupérer depuis le panneau des modèles.");
  test.setTimeout(900000);

  test("LA CHAÎNE REND UNE CRÊTE VRAIE SOUS −1 dBTP ET UNE SONIE DE −14 LUFS", async ({}, info) => {
    const app = await electron.launch({ args: [RACINE], cwd: RACINE, env: { ...process.env, NODE_ENV: "" } });
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");
      await page.evaluate((g) => localStorage.setItem("attic-encours", g), readFileSync(EXEMPLE, "utf8"));
      await page.reload();
      await page.waitForSelector(".attic-app", { timeout: 60000 });
      await page.locator('[data-id="mesure"]').waitFor({ timeout: 60000 });
      const debut = Date.now();
      await page.getByRole("button", { name: /Lancer/ }).click();
      await expect(page.locator('[data-id="mesure"] .attic-node-message')).toContainText("LUFS", { timeout: 840000 });
      const duree = Math.round((Date.now() - debut) / 1000);

      const messages: Record<string, string> = {};
      for (const id of ["rendre", "egaliseur", "compresseur", "limiteur", "normaliseur", "mesure"]) messages[id] = (await message(page, id)) ?? "";
      const brut = await sonDe(page, "rendre"), fini = await sonDe(page, "mesure");
      expect(brut, "le rendu brut doit être lisible").not.toBe(null);
      expect(fini, "le son fini doit être lisible").not.toBe(null);
      const wavBrut = Buffer.from(brut!.base64, "base64"), wavFini = Buffer.from(fini!.base64, "base64");
      writeFileSync(info.outputPath("1-brut.wav"), wavBrut);
      writeFileSync(info.outputPath("2-fini.wav"), wavFini);

      const tpFini = 20 * Math.log10(creteVraie(canauxDe(wavFini, fini!.canaux)));
      const tpBrut = 20 * Math.log10(creteVraie(canauxDe(wavBrut, brut!.canaux)));
      const lufs = Number((messages.mesure.match(/LUFS (-?\d+(?:\.\d+)?)/) ?? [])[1]);
      const rapport = [
        `${duree} s de Lancer à la mesure · ${brut!.duree.toFixed(1)} s de son`,
        `crête vraie : brut ${tpBrut.toFixed(2)} dBTP, fini ${tpFini.toFixed(2)} dBTP`,
        ...Object.entries(messages).map(([id, m]) => `${id} : ${m}`),
      ].join("\n");
      console.log(rapport);

      expect(tpFini, rapport).toBeLessThanOrEqual(-1 + 0.01);
      expect(Math.abs(lufs + 14), rapport).toBeLessThanOrEqual(0.5);
    } finally {
      await app.close();
    }
  });
});
