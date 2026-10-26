// tests-e2e/types-au-port.spec.ts — Aucun exemple livré ne rend une valeur du mauvais type.
//
// ═══ POURQUOI CE CAS EXISTE ═══
//
// Point 6 d'une revue du dépôt, le 2026-10-25 : « Rien ne vérifie, à l'exécution, qu'une valeur
// correspond au type de son port. Un composant qui déclare une sortie audio peut rendre n'importe
// quoi. » La vérification vit dans `core/types-au-port.ts`, le prédicat sur le TYPE DE FLUX que le
// domaine déclare, et le moteur la pose après chaque exécution de nœud.
//
// LES CAS UNITAIRES ÉPROUVENT LA RÈGLE, PAS SON CÂBLAGE. Rien, dans `core/types-au-port.test.ts`,
// ne dit que le moteur appelle la vérification — ni qu'un prédicat ne crie pas sur un composant
// correct, ce qui serait pire que pas de prédicat du tout : un garde bavard s'apprend à ne plus
// lire.
//
// CE CAS FAIT DONC LES DEUX À LA FOIS. Il lance des graphes livrés et relève chaque ligne « [type] »
// que la console porte : aucune ne doit paraître. Et il vérifie que la vérification TOURNE, en
// désarmant un prédicat depuis la page — sans quoi son silence ne prouverait rien.
import { expect, test } from "@playwright/test";

import { serveurDeVerification } from "./serveur-de-developpement";
import { semerEtLancer } from "./pilote-graphe";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const devUrl = serveurDeVerification(5249);
const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Les graphes éprouvés, choisis pour la VARIÉTÉ DE LEURS TYPES plutôt que pour leur nombre.
 *
 * Un son et un méta, une chaîne de traitement, une courbe de modulation, une séquence de notes :
 * ce sont les quatre types qui déclarent aujourd'hui un prédicat, plus l'audio partout.
 */
const EXEMPLES = [
  "un-synthe-et-sa-bulle-d-effets.json",
  "canon-de-proportions.json",
  "une-voix-devient-de-la-musique.json",
  // LES DEUX DERNIERS SONT LÀ POUR LE RELEVÉ DES FRÉQUENCES, et ils y manquaient. Douze composants
  // — les trois Risset, les six synthétiseurs de Tone, le crible, les écrans et le GENDYN de
  // Xenakis, les pulsars de Roads — génèrent à `ctx.runtime.sampleRate`, c'est-à-dire À LA
  // FRÉQUENCE DE LA CARTE SON. Les trois graphes au-dessus n'en emploient aucun : c'est la seconde
  // raison pour laquelle le relevé se taisait, et la première était l'absence de fichier.
  "ton-glisse-en-trompette-etiree.json",
  "un-son-projete-en-microtonal.json",
];

test.describe("les types aux ports", () => {
  test.setTimeout(300_000);

  test("AUCUN EXEMPLE LIVRE NE REND UNE VALEUR DU MAUVAIS TYPE", async ({ page }) => {
    const ecarts: string[] = [];
    // ═══ ET LE GARDE DES FRÉQUENCES PASSE PAR LE MÊME GUICHET — point 5 de la revue ═══
    //
    // IL A CHANGÉ DE NATURE EN COURS DE CHANTIER, et c'est écrit ici parce que son silence ne se lit
    // pas de la même façon avant et après. Il a d'abord été un RECENSEMENT : mesurer sur combien
    // d'arêtes une conversion implicite avait lieu, avant de convertir quoi que ce soit.
    //
    // MAINTENANT LE MOTEUR CONVERTIT : il porte les sorties de chaque nœud à la fréquence du projet
    // avant de les poser dans les résultats. Aucun nœud ne peut donc plus recevoir deux fréquences,
    // et ce garde NE DOIT PLUS JAMAIS PARLER. S'il parle, l'invariant est rompu.
    //
    // CE QU'IL NE VOIT PAS, ET IL FAUT LE SAVOIR : un graphe ENTIER décalé. Il guette un nœud qui
    // reçoit DEUX fréquences, or le défaut mesuré du point 5 était autre — douze composants
    // généraient à la fréquence de la CARTE SON, chaque nœud n'en recevant qu'une, et deux des cinq
    // graphes ci-dessous rendaient à deux fréquences à la fois sans qu'une seule ligne paraisse.
    // C'est `frequence-de-travail-dans-application.spec.ts` qui lit les fichiers rendus et le voit.
    //
    // ET LE MOTEUR APPELLE BIEN CE GARDE, ce qu'un zéro ne prouverait pas tout seul : défaut planté
    // dans `plugins/apercu-domaine.ts` pour qu'il réponde toujours, **treize nœuds** ont été
    // signalés sur `canon-de-proportions`, chacun nommant son composant et ses deux fréquences.
    // C'est la paire que ce dépôt exige — un garde muet, et la preuve qu'il pouvait parler.
    const frequences = new Set<string>();
    page.on("console", (m) => {
      const t = m.text();
      if (t.startsWith("[type] ")) ecarts.push(t);
      if (t.startsWith("[frequence] ")) frequences.add(t);
    });

    for (const nom of EXEMPLES) {
      const graphe = readFileSync(join(RACINE, "exemples", nom), "utf8");
      await semerEtLancer(page, devUrl, graphe, { profondeurExport: 32 });
      console.log(`${nom} · ${ecarts.length} écart(s) de type · ${frequences.size} nœud(s) qui mêlent des fréquences`);
    }
    // LA FRÉQUENCE DE LA CARTE SON EST RELEVÉE, parce que c'est elle qui décide de ce que douze
    // composants génèrent : le relevé ci-dessus ne s'interprète pas sans elle.
    console.log(`carte son · ${await page.evaluate(() => new AudioContext().sampleRate)} Hz`);

    for (const f of frequences) console.log(`  ${f}`);
    for (const e of ecarts) console.log(`  ${e}`);
    expect(ecarts, [
      "",
      "UN COMPOSANT REND UNE VALEUR QUI N'EST PAS DU TYPE QU'IL PROMET.",
      "",
      "Le message nomme le nœud, son composant et son port. Deux lectures possibles :",
      "",
      "  · le composant est en faute, et son port le dit depuis toujours ;",
      "  · ou le PRÉDICAT est trop serré, et c'est lui qu'il faut corriger — un prédicat faux est",
      "    pire que pas de prédicat, parce qu'on apprend à ne plus le lire.",
      "",
      "Les prédicats sont déclarés dans `src/audio/adaptateur.ts`, sur les types de flux.",
      "",
    ].join("\n")).toEqual([]);
  });

  test("ET LA VERIFICATION TOURNE VRAIMENT : un predicat desarme fait parler la console", async ({ page }) => {
    // ═══ SANS CE CAS, LE SILENCE DU PRÉCÉDENT NE PROUVERAIT RIEN ═══
    //
    // Un moteur qui n'appellerait pas la vérification rendrait exactement le même vide. On désarme
    // donc le prédicat de l'audio DEPUIS LA PAGE, sur le registre vivant, et l'on vérifie que la
    // console se met à parler. C'est la paire que ce dépôt exige : un garde qui se tait, et la
    // preuve qu'il pouvait parler.
    const ecarts: string[] = [];
    page.on("console", (m) => { if (m.text().startsWith("[type] ")) ecarts.push(m.text()); });

    const graphe = readFileSync(join(RACINE, "exemples", EXEMPLES[0]), "utf8");
    await semerEtLancer(page, devUrl, graphe, { profondeurExport: 32 });
    expect(ecarts, "le graphe doit être sain avant qu'on désarme").toEqual([]);

    const desarme = await page.evaluate(() => {
      const reg = (window as unknown as { __attic_registre__?: {
        typeFlux: (id: string) => { estDuType?: (v: unknown) => boolean } | undefined } }).__attic_registre__;
      const t = reg?.typeFlux("audio");
      if (!t) return false;
      t.estDuType = () => false;
      return true;
    });
    expect(desarme, [
      "",
      "Le registre n'est pas joignable depuis la page : ce cas ne peut rien désarmer.",
      "",
      "`src/audio/adaptateur.ts` le pose sur `window.__attic_registre__` pour que les épreuves de",
      "bout en bout puissent interroger les types de flux vivants.",
      "",
    ].join("\n")).toBe(true);

    await page.locator('button[title*="Lancer"]').first().click({ timeout: 15_000 });
    await page.waitForTimeout(12_000);
    console.log(`écarts après désarmement : ${ecarts.length}`);
    for (const e of ecarts.slice(0, 4)) console.log(`  ${e}`);
    expect(ecarts.length, [
      "",
      "LA VÉRIFICATION NE TOURNE PAS.",
      "",
      "Le prédicat de l'audio a été désarmé et aucune ligne « [type] » n'a paru : le moteur n'appelle",
      "donc pas `signalerEcartsDeType` après l'exécution d'un nœud, et le silence du cas précédent ne",
      "prouve rien.",
      "",
    ].join("\n")).toBeGreaterThan(0);
  });
});
