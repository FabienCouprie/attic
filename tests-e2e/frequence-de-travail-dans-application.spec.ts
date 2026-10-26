// tests-e2e/frequence-de-travail-dans-application.spec.ts — Un graphe entier rend à UNE fréquence,
// celle que le projet déclare.
//
// ═══ LE DÉFAUT MESURÉ, ET C'EST LUI QUI A OUVERT LE CHANTIER ═══
//
// Point 5 d'une revue du dépôt. Sur cette machine la carte son tourne à 48 kHz, et douze composants
// généraient à `ctx.runtime.sampleRate` — la sienne. Relevé AVANT la correction, en lisant la
// fréquence du fichier d'aperçu de chaque nœud :
//
//     ton-glisse-en-trompette-etiree · ton, gliss à 44 100 · ddsp, stretch, ecoute à 48 000
//     un-son-projete-en-microtonal   · echelle, ecoute-echelle à 44 100 · cloche, etale,
//                                      ecoute-banque à 48 000
//     canon-de-proportions           · tout à 44 100
//
// DEUX DES CINQ GRAPHES LIVRÉS RENDAIENT À DEUX FRÉQUENCES À LA FOIS, et lesquels de leurs nœuds
// tombaient où dépendait de la machine qui les ouvrait. Rien ne le disait.
//
// ET LE RECENSEMENT DES FRÉQUENCES MÊLÉES NE POUVAIT PAS LE VOIR : il guette un nœud qui reçoit DEUX
// fréquences, or ici chaque nœud n'en recevait qu'une — la conversion avait lieu À L'INTÉRIEUR d'une
// chaîne, par le rééchantillonneur du navigateur, qui est une interpolation LINÉAIRE (mesuré dans
// `audio/convertir-frequence.test.ts`). C'est pourquoi ce cas-ci lit les fichiers rendus plutôt que
// la console.
//
// ═══ CE QU'IL ÉPROUVE, ET DANS CET ORDRE ═══
//
//   1. LES DEUX GRAPHES QUI ÉTAIENT CASSÉS rendent maintenant à une seule fréquence, 44 100 Hz,
//      qui est le défaut d'un projet qui n'en déclare pas.
//   2. LE SÉLECTEUR DE LA BARRE D'OUTILS COMMANDE VRAIMENT : réglé à 48 kHz, le même graphe rend
//      tout à 48 000, aperçus compris. C'est aussi ce qui garde le cache — la fréquence entre dans
//      sa clé, sans quoi le deuxième lancement reposerait les tampons de l'ancienne.
//   3. ET LE GARDE DE L'INVARIANT SE TAIT : aucune ligne « [frequence] », puisqu'aucun nœud ne peut
//      plus recevoir deux fréquences.
//
// ═══ CE QUE LES DÉFAUTS PLANTÉS ONT APPRIS, ET IL FAUT LE SAVOIR EN LISANT CE CAS ═══
//
// LES DEUX MOITIÉS DE LA RÉPARATION COUVRENT DES GRAPHES DIFFÉRENTS, et chacune a son garde :
//
//   · REMETTRE `ctx.runtime.sampleRate` DANS `tone-synths.ts` LAISSE CE CAS VERT. Le composant
//     fabrique bien à 48 000, et le moteur le reporte aussitôt à 44 100 : la conversion répare ce
//     que le générateur a mal fait. C'est `docs/contrat-frequence-de-travail.test.ts`, qui lit les
//     sources, qui attrape ce défaut — vérifié, il nomme le fichier.
//   · DÉSARMER `porterALaFrequenceDeTravail` FAIT TOMBER CE CAS, et il retrouve exactement la
//     mesure d'avant : `ton-glisse-en-trompette-etiree` à 44 100 ×2 et 48 000 ×3. Les 48 000 de ce
//     graphe ne viennent pas d'un générateur mais du DÉCODAGE, que `contexteDecodage()` fixe à
//     48 kHz — donc rien d'autre que la conversion du moteur ne peut les ramener.
//
// Et `un-son-projete-en-microtonal`, lui, reste à 44 100 même conversion désarmée : son 48 000
// venait d'un générateur, qui lit désormais le projet. La paire se tient : aucun des deux gardes ne
// couvre l'autre, et c'est pourquoi il faut les deux.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { serveurDeVerification } from "./serveur-de-developpement";
import { apercusEnWav, relancerEtAttendre, semerEtLancer } from "./pilote-graphe";

const devUrl = serveurDeVerification(5251);
const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Les deux graphes livrés qui rendaient à deux fréquences, et un témoin qui n'y était pour rien. */
const EXEMPLES = [
  "un-son-projete-en-microtonal.json",
  "ton-glisse-en-trompette-etiree.json",
  "canon-de-proportions.json",
];

/**
 * La fréquence déclarée par le bloc `fmt ` d'un WAV, en PARCOURANT ses blocs.
 *
 * L'aperçu de l'application porte un `iXML` et un `bext` avant ses données : lire un décalage
 * supposé rendrait n'importe quoi.
 */
function frequenceDuWav(o: Uint8Array): number | null {
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
  for (let p = 12; p + 8 <= o.length; ) {
    const id = String.fromCharCode(...o.subarray(p, p + 4));
    const n = v.getUint32(p + 4, true);
    if (id === "fmt " && p + 16 <= o.length) return v.getUint32(p + 12, true);
    p += 8 + n + (n % 2);
  }
  return null;
}

test.describe("la fréquence de travail, dans l'application", () => {
  test.setTimeout(600_000);

  test("UN GRAPHE LIVRE REND A UNE SEULE FREQUENCE, ET LE SELECTEUR LA COMMANDE", async ({ page }) => {
    const plaintes: string[] = [];
    page.on("console", (m) => { if (m.text().startsWith("[frequence] ")) plaintes.push(m.text()); });

    const taux = async (): Promise<Map<number, string[]>> => {
      const parFrequence = new Map<number, string[]>();
      for (const a of await apercusEnWav(page)) {
        const f = frequenceDuWav(Buffer.from(a.base64, "base64")) ?? 0;
        parFrequence.set(f, [...(parFrequence.get(f) ?? []), a.id]);
      }
      return parFrequence;
    };
    const dire = (nom: string, m: Map<number, string[]>) =>
      `${nom} · ${[...m.entries()].map(([f, ids]) => `${f} Hz ×${ids.length} (${ids.join(",")})`).join(" | ")}`;

    const carte = await (async () => {
      await page.goto(devUrl);
      await page.waitForSelector(".attic-app", { timeout: 15_000 });
      return page.evaluate(() => new AudioContext().sampleRate);
    })();
    console.log(`carte son · ${carte} Hz`);

    // ═══ 1. LE DÉFAUT DU PROJET : TOUT À 44 100, QUELLE QUE SOIT LA CARTE ═══
    for (const nom of EXEMPLES) {
      const graphe = readFileSync(join(RACINE, "exemples", nom), "utf8");
      await semerEtLancer(page, devUrl, graphe, { profondeurExport: 32 });
      const m = await taux();
      console.log(dire(nom, m));
      expect([...m.keys()], [
        "",
        `LE GRAPHE « ${nom} » REND À PLUSIEURS FRÉQUENCES À LA FOIS.`,
        "",
        "C'est le défaut du point 5, et il revient. LA CAUSE EST QUE LE MOTEUR NE PORTE PLUS LES",
        "SORTIES À LA FRÉQUENCE DU PROJET : voir `porterALaFrequenceDeTravail` dans",
        "`plugins/apercu-domaine.ts`, appelé par `ui/hooks/useExecutionGraphe.ts` juste avant de",
        "poser les valeurs dans les résultats.",
        "",
        "CE N'EST PAS un composant qui lit la carte son, et le relevé des défauts plantés le dit :",
        "remettre `ctx.runtime.sampleRate` dans `tone-synths.ts` laisse CE CAS VERT, parce que la",
        "conversion du moteur répare aussitôt ce que le composant a mal fabriqué. Ce défaut-là est",
        "attrapé par `docs/contrat-frequence-de-travail.test.ts`, qui lit les sources.",
        "",
      ].join("\n")).toEqual([44100]);
    }

    // ═══ 2. LE SÉLECTEUR COMMANDE, ET LE CACHE NE MENT PAS ═══
    //
    // LE MÊME GRAPHE EST RELANCÉ SANS ÊTRE RESEMÉ : c'est exactement le cas où le cache pouvait
    // reposer les tampons de l'ancienne fréquence, le réglage paraissant inopérant au deuxième run.
    // La fréquence entre dans la clé de cache depuis `useExecutionGraphe.ts`.
    await page.locator(".attic-frequence-travail").selectOption("48000", { timeout: 15_000 });
    await page.waitForTimeout(500);
    await relancerEtAttendre(page, { profondeurExport: 32 });

    const apres = await taux();
    console.log(dire("après le sélecteur à 48 kHz", apres));
    expect([...apres.keys()], [
      "",
      "LE SÉLECTEUR DE FRÉQUENCE DE TRAVAIL N'A PAS COMMANDÉ LE RENDU.",
      "",
      "Deux lectures, et le relevé ci-dessus dit laquelle :",
      "",
      "  · 44 100 partout — le cache a reposé les tampons d'avant. La fréquence doit entrer dans la",
      "    clé de cache, ce que fait `useExecutionGraphe.ts` par `reglagesDeProjet()` ;",
      "  · plusieurs fréquences — un composant ne lit pas `frequenceDeTravail()`.",
      "",
    ].join("\n")).toEqual([48000]);

    // ═══ 3. ET LE GARDE DE L'INVARIANT S'EST TU TOUT DU LONG ═══
    for (const p of plaintes) console.log(`  ${p}`);
    expect(plaintes, [
      "",
      "UN NŒUD A REÇU DEUX FRÉQUENCES.",
      "",
      "L'invariant est rompu : tout ce qui circule sur une arête doit être à la fréquence du projet,",
      "parce que le moteur porte les sorties de chaque nœud avant de les poser dans les résultats.",
      "Ce recensement a servi à mesurer avant de convertir ; il ne doit plus jamais parler.",
      "",
    ].join("\n")).toEqual([]);
  });
});
