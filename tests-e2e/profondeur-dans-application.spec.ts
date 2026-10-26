// tests-e2e/profondeur-dans-application.spec.ts — Le sélecteur de profondeur agit sur ce qui est
// déjà rendu, sans rejouer un seul nœud.
//
// ═══ LE DÉFAUT, MESURÉ ICI MÊME AVANT D'ÊTRE RÉPARÉ ═══
//
//     rendu, défaut 24 bits                        24 bits · 44 100 Hz
//     sélecteur à 32 bits, sans relancer           24 bits · 44 100 Hz
//     sélecteur à 32 bits, PUIS LANCER             24 bits · 44 100 Hz   ← inopérant
//     et ensuite fréquence à 48 kHz, puis Lancer   32 bits · 48 000 Hz
//
// LES 32 BITS N'APPARAISSAIENT QUE PAR ACCIDENT, quand le changement de FRÉQUENCE faisait manquer
// le cache. Et le même blob est le fichier sauvegardé : changer la profondeur puis enregistrer
// écrivait l'ancienne, sans qu'une ligne ne le signale.
//
// AUCUN GARDE NE L'ATTRAPAIT, et la raison est instructive : toutes les épreuves posent
// `attic-profondeur-export` AVANT le premier lancement — elles éprouvaient la valeur, jamais son
// CHANGEMENT. D'où ce cas-ci, qui le change en cours de séance.
//
// ET IL VÉRIFIE AUSSI CE QU'IL NE FAUT PAS FAIRE : la fréquence de travail, elle, DOIT faire
// recalculer — elle change ce que les nœuds produisent. Les deux réglages sont voisins dans la
// barre et de natures différentes ; ce cas tient les deux comportements côte à côte pour que la
// distinction ne se perde pas.
import { expect, test } from "@playwright/test";

import { serveurDeVerification } from "./serveur-de-developpement";
import { apercusEnWav, relancerEtAttendre, semerEtLancer } from "./pilote-graphe";

const devUrl = serveurDeVerification(5252);

/** Un générateur d'une seconde : le plus petit graphe qui produise un aperçu. */
const GRAPHE = JSON.stringify({
  nodes: [{ id: "ton", position: { x: 0, y: 0 },
    data: { ficheId: "generateur-frequence", parametres: { "Durée": 1 } } }],
  edges: [],
});

/** Les bits et la fréquence du bloc `fmt ` d'un WAV, en parcourant ses blocs. */
function fmt(o: Uint8Array): { bits: number; taux: number } | null {
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
  for (let p = 12; p + 8 <= o.length; ) {
    const id = String.fromCharCode(...o.subarray(p, p + 4));
    const n = v.getUint32(p + 4, true);
    if (id === "fmt " && p + 24 <= o.length) {
      return { taux: v.getUint32(p + 12, true), bits: v.getUint16(p + 22, true) };
    }
    p += 8 + n + (n % 2);
  }
  return null;
}

test.describe("la profondeur d'export, dans l'application", () => {
  test.setTimeout(300_000);

  test("LE SELECTEUR REFAIT L APERCU SANS RELANCER, ET LA FREQUENCE EXIGE UN RUN", async ({ page }) => {
    const lu = async () => {
      const a = (await apercusEnWav(page))[0];
      expect(a, "le nœud n'a pas livré d'aperçu").toBeTruthy();
      const f = fmt(Buffer.from(a.base64, "base64"));
      return { bits: f?.bits, taux: f?.taux, octets: a.octets };
    };

    await semerEtLancer(page, devUrl, GRAPHE, { profondeurExport: 24 });
    const depart = await lu();
    console.log(`rendu · ${depart.bits} bits · ${depart.taux} Hz · ${depart.octets} octets`);
    expect(depart.bits, "le graphe doit partir à la profondeur semée").toBe(24);

    // ═══ 1. LA PROFONDEUR AGIT SANS QU'ON RELANCE ═══
    await page.locator(".attic-profondeur-export").selectOption("32", { timeout: 15_000 });
    // ON ATTEND LA CHOSE MESURÉE, ET NON UN TÉMOIN. Mon premier jet guettait le changement
    // d'ADRESSE de l'aperçu — et relevait l'adresse de départ APRÈS avoir changé le sélecteur, si
    // bien que la comparaison ne pouvait jamais devenir vraie. Un instrument faux fait accuser le
    // code ; celui-ci interroge la profondeur du fichier, qui est exactement ce que le cas affirme.
    await expect.poll(async () => (await lu()).bits, { timeout: 60_000, intervals: [500] }).toBe(32);
    const apres = await lu();
    console.log(`après le sélecteur à 32, SANS relancer · ${apres.bits} bits · ${apres.taux} Hz · ${apres.octets} octets`);
    expect(apres.bits, [
      "",
      "LE SÉLECTEUR DE PROFONDEUR N'A PAS REFAIT L'APERÇU.",
      "",
      "Il était inopérant, et même en relançant : l'adresse de l'aperçu est réutilisée tant que le",
      "tampon est le même objet. Le remède est `ui/refaire-apercus.ts`, appelé par",
      "`ui/SelecteurProfondeurExport.tsx` — et SURTOUT PAS la clé de cache, qui ferait recalculer",
      "une heure de son pour un changement d'écriture.",
      "",
      "Comme ce blob est AUSSI le fichier sauvegardé, le défaut faisait enregistrer l'ancienne",
      "profondeur sans qu'une ligne ne le signale.",
      "",
    ].join("\n")).toBe(32);
    expect(apres.taux, "la fréquence ne doit pas avoir bougé : seule l'écriture change").toBe(depart.taux);
    expect(apres.octets, "trente-deux bits pèsent plus que vingt-quatre").toBeGreaterThan(depart.octets);

    // ═══ 2. ET LA FRÉQUENCE, ELLE, EXIGE UN RUN — LES DEUX NE SONT PAS SYMÉTRIQUES ═══
    //
    // Elle change ce que les nœuds CALCULENT : la refaire sans recalculer rendrait un fichier dont
    // l'en-tête mentirait sur son contenu. Ce cas garde donc la distinction, et non seulement la
    // réparation.
    await page.locator(".attic-frequence-travail").selectOption("48000", { timeout: 15_000 });
    await page.waitForTimeout(4000);
    const sansRun = await lu();
    console.log(`après le sélecteur de fréquence, SANS relancer · ${sansRun.bits} bits · ${sansRun.taux} Hz`);
    expect(sansRun.taux, [
      "",
      "LA FRÉQUENCE DE TRAVAIL A CHANGÉ L'APERÇU SANS QU'ON RELANCE.",
      "",
      "Elle ne doit pas : elle décide de ce que les nœuds PRODUISENT, et un aperçu réécrit sans",
      "recalcul porterait un en-tête qui mentirait sur son contenu. Seule la profondeur, qui ne",
      "touche que l'écriture, se refait sans run.",
      "",
    ].join("\n")).toBe(depart.taux);

    await relancerEtAttendre(page, {});
    const avecRun = await lu();
    console.log(`après avoir relancé · ${avecRun.bits} bits · ${avecRun.taux} Hz · ${avecRun.octets} octets`);
    expect(avecRun.taux, "et après Lancer, la fréquence du projet s'applique").toBe(48000);
    expect(avecRun.bits, "la profondeur choisie tient au travers du run").toBe(32);
  });
});
