// tests-e2e/restaurer-dans-application.spec.ts — La restauration d'un son compressé, dans la vraie
// application.
//
// CE QUE CE CAS GARDE : que la chaîne entière réponde — composant, préchargement, processus
// principal, exécutable, retour, décodage, affichage — et que le son rendu ait la forme du son
// reçu. Une durée qui change de rapport serait une conversion de cadence faite sur la LONGUEUR au
// lieu de la DURÉE, ce qui transpose le son ; `isoler-voix` porte cette distinction depuis qu'elle
// lui a coûté un défaut.
//
// CE QU'IL NE GARDE PAS, ET IL FAUT L'ÉCRIRE. Le moteur refuse tout ce qui n'est pas du 44 100 Hz,
// et le composant y amène le son avant de le passer. Mais l'application tourne elle-même à
// 44 100 Hz : défaut planté en retirant la conversion, ce cas reste VERT, parce qu'il n'y a rien à
// convertir sur cette machine. Un garde qui ne peut pas tomber n'en est pas un, et cette propriété
// est donc tenue là où elle peut tomber — dans `src/plugins/restaurer-compresse.test.ts`, sur le
// refus que le pont oppose à une autre cadence.
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { etatDesNoeuds, semerEtLancer } from "./pilote-graphe";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const MODELE = join(RACINE, "public", "audiocpp", "apollo-orig.gguf");

function lancer(): Promise<ElectronApplication> {
  return electron.launch({ args: [RACINE], cwd: RACINE, env: { ...process.env, NODE_ENV: "" } });
}

/** La durée du morceau que Fabien a fait passer, déduite des 40 143 349 760 octets refusés. */
const DUREE_MORCEAU = 194;

/**
 * Un WAV stéréo à 44 100 Hz, seize bits : trois accords qui tournent toutes les deux secondes.
 *
 * LE CONTENU NE DÉCIDE DE RIEN ICI, LA DURÉE DÉCIDE DE TOUT : la mémoire que le moteur demande suit
 * le nombre de trames et non ce qu'elles portent, mesuré identique en mono et en stéréo. Des sinus
 * suffisent donc, et ils évitent un générateur de hasard de plus.
 */
function morceau(secondes: number): Buffer {
  const sr = 44100, n = secondes * sr;
  const donnees = Buffer.alloc(n * 4);
  const notes = [220, 277.18, 329.63, 440, 554.37, 659.25];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const accord = Math.floor(t / 2) % 3;
    for (let c = 0; c < 2; c++) {
      let v = 0;
      for (let k = 0; k < 3; k++) v += Math.sin(2 * Math.PI * notes[(accord + k * 2) % 6] * (1 + c * 0.002) * t) * 0.15;
      donnees.writeInt16LE(Math.round(v * 32767), (i * 2 + c) * 2);
    }
  }
  const tete = Buffer.alloc(44);
  tete.write("RIFF", 0, "ascii"); tete.writeUInt32LE(36 + donnees.length, 4); tete.write("WAVE", 8, "ascii");
  tete.write("fmt ", 12, "ascii"); tete.writeUInt32LE(16, 16); tete.writeUInt16LE(1, 20); tete.writeUInt16LE(2, 22);
  tete.writeUInt32LE(sr, 24); tete.writeUInt32LE(sr * 4, 28); tete.writeUInt16LE(4, 32); tete.writeUInt16LE(16, 34);
  tete.write("data", 36, "ascii"); tete.writeUInt32LE(donnees.length, 40);
  return Buffer.concat([tete, donnees]);
}

/** La forme du son d'un nœud, lue dans le moteur et non dans son lecteur. */
async function forme(page: Page, id: string) {
  return await page.evaluate((cible) => {
    const r = (globalThis as unknown as { __attic_execution__?: { resultats?: Map<string, unknown> } })
      .__attic_execution__?.resultats;
    const v = r instanceof Map ? r.get(cible) : null;
    const b = (Array.isArray(v) ? v[0] : v) as AudioBuffer | null;
    return b && typeof b.numberOfChannels === "number"
      ? { canaux: b.numberOfChannels, cadence: b.sampleRate, duree: b.duration } : null;
  }, id);
}

test.describe("restaurer un son compressé, de bout en bout", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.skip(!existsSync(MODELE), "Modèle Apollo absent : le récupérer depuis le panneau des modèles.");
  test.setTimeout(300000);

  test("« RESTAURER UN SON COMPRESSÉ » TRAVERSE LE PONT, ET LA DURÉE NE BOUGE PAS", async () => {
    const app = await lancer();
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");
      await page.evaluate(() => {
        localStorage.setItem("attic-encours", JSON.stringify({
          nodes: [
            { id: "src", position: { x: 0, y: 0 },
              data: { ficheId: "metronome", parametres: { "Tempo": 120, "Durée": 6 } } },
            { id: "res", position: { x: 360, y: 0 },
              data: { ficheId: "restaurer-compresse",
                parametres: { "Dosage": 100, "Tranche": 0, "Calcul": "" } } },
          ],
          edges: [{ id: "e1", source: "src", target: "res", sourceHandle: "out:0", targetHandle: "in:0" }],
        }));
      });
      await page.reload();
      await page.waitForSelector(".attic-app", { timeout: 60000 });
      const noeud = page.locator('[data-id="res"]');
      await noeud.waitFor({ timeout: 60000 });
      await page.getByRole("button", { name: /Lancer/ }).click();
      await expect(noeud).toContainText(/\d+\s*%/, { timeout: 240000 });

      const rendu = await noeud.innerText();
      expect(rendu, "le pont doit répondre, et non manquer").not.toMatch(/nécessite Electron|requires Electron/i);
      expect(rendu, "le modèle doit être trouvé").not.toMatch(/Modèle absent|Model missing/i);

      // LA DURÉE ET LA CADENCE SONT LUES DANS LE MOTEUR, non dans le lecteur du nœud : celui-ci
      // replie le multicanal pour l'écoute, et ne dirait donc pas la vérité sur la sortie.
      const forme = await page.evaluate(() => {
        const r = (globalThis as unknown as { __attic_execution__?: { resultats?: Map<string, unknown> } })
          .__attic_execution__?.resultats;
        const lire = (id: string) => {
          const v = r instanceof Map ? r.get(id) : null;
          const b = (Array.isArray(v) ? v[0] : v) as AudioBuffer | null;
          return b && typeof b.numberOfChannels === "number"
            ? { canaux: b.numberOfChannels, cadence: b.sampleRate, duree: b.duration } : null;
        };
        return { entree: lire("src"), sortie: lire("res") };
      });
      expect(forme.entree, "le métronome doit avoir rendu du son").not.toBe(null);
      expect(forme.sortie, "le composant doit avoir rendu du son").not.toBe(null);
      expect(forme.sortie!.cadence, "la cadence rendue est celle reçue, non celle du moteur")
        .toBe(forme.entree!.cadence);
      // Le moteur rend quelques échantillons de plus ou de moins ; un dixième de seconde suffit
      // à distinguer cela d'une durée qui aurait changé de rapport.
      expect(Math.abs(forme.sortie!.duree - forme.entree!.duree)).toBeLessThan(0.1);
    } finally {
      await app.close();
    }
  });

  // ═══ UN MORCEAU ENTIER, SUR UNE CARTE DE SIX GIGA-OCTETS ═══
  //
  // LE CAS PRÉCÉDENT NE POUVAIT PAS VOIR CE DÉFAUT : six secondes de métronome tiennent en un
  // graphe de moins d'un giga-octet. Le moteur demande 2 068 284 octets par trame de dix
  // millisecondes, et tout le fichier passait d'un seul graphe : 30 s tenaient sur la RTX 2060,
  // 31 s non, et le morceau de Fabien, 194 s, réclamait 40 143 349 760 octets.
  //
  // DEUX NŒUDS ET NON UN, parce que ce sont deux chemins. Le nœud posé avant la correction porte
  // « Tranche » à zéro dans son projet, l'ancien défaut, et c'est lui que Fabien a lancé ; le nœud
  // neuf porte le défaut déclaré. Le premier est celui qu'une correction du seul défaut aurait
  // laissé tomber.
  for (const [cas, parametres] of [
    ["LE NŒUD D'UN PROJET ENREGISTRÉ, « TRANCHE » À ZÉRO", { "Dosage": 100, "Tranche": 0, "Calcul": "" }],
    ["UN NŒUD NEUF, AU DÉFAUT DÉCLARÉ", { "Dosage": 100, "Calcul": "" }],
  ] as const) {
    test(`UN MORCEAU DE ${DUREE_MORCEAU} S REND UN SON ET NON UNE ERREUR DE MÉMOIRE : ${cas}`, async () => {
      test.setTimeout(900000);
      const dossier = mkdtempSync(join(tmpdir(), "attic-apollo-long-"));
      const chemin = join(dossier, "morceau.wav");
      writeFileSync(chemin, morceau(DUREE_MORCEAU));
      const app = await lancer();
      try {
        const page = await app.firstWindow();
        await page.waitForLoadState("domcontentloaded");
        const graphe = JSON.stringify({
          nodes: [
            { id: "src", position: { x: 0, y: 0 }, data: { ficheId: "entree-audio", parametres: { Chemin: "" } } },
            { id: "res", position: { x: 360, y: 0 }, data: { ficheId: "restaurer-compresse", parametres } },
          ],
          edges: [{ id: "e1", source: "src", target: "res", sourceHandle: "out:0", targetHandle: "in:0" }],
        });
        const debut = Date.now();
        await semerEtLancer(page, page.url(), graphe, {
          delaiRunMs: 720000,
          avantDeLancer: async (p) => {
            await p.locator('[data-id="src"] .attic-node-fichier input[type=file]')
              .setInputFiles(chemin, { timeout: 15000 });
            await p.waitForTimeout(1000);
          },
        });
        const secondes = (Date.now() - debut) / 1000;
        const res = (await etatDesNoeuds(page)).find((e) => e.id === "res");
        console.log(`${cas} · ${res?.statut} · ${res?.message ?? "—"} · ${res?.cause ?? "—"} · ${secondes.toFixed(1)} s`);
        expect(res?.statut, `le composant doit rendre un son ; il a dit : ${res?.cause ?? res?.message}`).toBe("termine");

        const entree = await forme(page, "src");
        const sortie = await forme(page, "res");
        expect(entree?.duree, "l'entrée doit porter le morceau entier").toBeGreaterThan(DUREE_MORCEAU - 0.5);
        expect(sortie, "le composant doit avoir rendu du son").not.toBe(null);
        expect(Math.abs(sortie!.duree - entree!.duree), "la durée ne doit pas bouger").toBeLessThan(0.1);
        expect(sortie!.canaux, "le stéréo reste du stéréo").toBe(2);
      } finally {
        await app.close();
        rmSync(dossier, { recursive: true, force: true });
      }
    });
  }
});
