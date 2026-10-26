// tests-e2e/lexique-dictee.spec.ts — Le moteur vocal ne jette aucun mot de la grammaire.
//
// ═══ LE SEUL INSTRUMENT QUI PUISSE VÉRIFIER CECI ═══
//
// `plugins/lexique-vosk.ts` tient la liste des mots que le modèle français n'a pas, et son en-tête
// dit comment elle a été faite : démarrer la dictée, lire la console, relever chaque ligne
// « Ignoring word missing in vocabulary ». Cette liste est INCOMPLÈTE PAR CONSTRUCTION, et tout
// garde unitaire qui s'y fie l'est aussi.
//
// CE QUE CELA A COÛTÉ, MESURÉ LE 2026-10-26. Cent quarante noms parlés avaient été écrits et
// vérifiés contre cette liste. Lancée pour de bon, la dictée a rendu ONZE mots manquants — dont
// TROIS employés dans ces noms. « atténuateur », « inharmonique » et « résonants » ne se
// prononçaient pas davantage que les mots qu'ils remplaçaient : trois composants réparés sur le
// papier, muets en vrai. Les huit autres entraient amputés dans la grammaire depuis toujours.
//
// ═══ POURQUOI IL N'EST PAS DANS LA PASSE ORDINAIRE ═══
//
// Il lance son propre navigateur avec un micro simulé, charge le modèle — une archive de
// quarante mégaoctets — et attend que la grammaire soit bâtie. Cela se compte en minutes. C'est un
// garde qu'on lance, comme la base d'empreintes :
//
//   npm run test:lexique-dictee
//
// ET LES AVERTISSEMENTS SORTENT DU WORKER de `vosk-browser`, non du fil principal : un
// `page.on("console")` seul ne les voit pas. On s'attache donc à toutes les cibles par CDP.
import { expect, test, chromium } from "@playwright/test";

import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5258);

/** Le temps qu'il faut pour dégeler l'archive du modèle et bâtir la machine d'états. */
const ATTENTE_GRAMMAIRE_MS = 90_000;

test("AUCUN MOT DE LA GRAMMAIRE NE MANQUE AU LEXIQUE DU MOTEUR", async () => {
  test.setTimeout(600_000);
  const navigateur = await chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  try {
    const contexte = await navigateur.newContext({ permissions: ["microphone"] });
    const page = await contexte.newPage();

    const lignes: string[] = [];
    const noter = (t: string) => { if (t && !lignes.includes(t)) lignes.push(t); };
    page.on("console", (m) => noter(m.text()));

    const cdp = await contexte.newCDPSession(page);
    await cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    cdp.on("Target.attachedToTarget" as never, async (ev: never) => {
      const { sessionId } = ev as unknown as { sessionId: string };
      try {
        await cdp.send("Runtime.enable" as never, {} as never, sessionId as never);
        await cdp.send("Log.enable" as never, {} as never, sessionId as never);
      } catch { /* une cible partie avant qu'on s'y attache */ }
    });
    cdp.on("Runtime.consoleAPICalled" as never, (ev: never) => {
      const e = ev as unknown as { args?: { value?: unknown }[] };
      noter((e.args ?? []).map((a) => String(a?.value ?? "")).join(" "));
    });
    cdp.on("Log.entryAdded" as never, (ev: never) => {
      noter(String((ev as unknown as { entry?: { text?: string } }).entry?.text ?? ""));
    });

    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 30_000 });
    await page.waitForTimeout(2500);
    await page.locator('button[title*="Dicter le graphe"]').first().click({ timeout: 20_000 });
    await page.waitForTimeout(ATTENTE_GRAMMAIRE_MS);

    // LE MODÈLE DOIT AVOIR ÉTÉ CHARGÉ, sans quoi ce cas serait vert pour n'avoir rien fait : le
    // silence d'un moteur qui n'a pas démarré ressemble trait pour trait à celui d'une grammaire
    // parfaite. La ligne de dégel de l'archive est la preuve qu'il a travaillé.
    expect(lignes.some((l) => l.includes("vosk-model-small-fr")), [
      "",
      "LE MODÈLE VOCAL N'A PAS ÉTÉ CHARGÉ, et ce cas ne prouve donc rien.",
      "",
      "Il attend la ligne de dégel de l'archive. Le modèle vit dans `public/oonx/` et se récupère",
      "par le panneau des modèles ; sans lui, la dictée ne démarre pas et la console reste muette.",
      "",
    ].join("\n")).toBe(true);

    const manquants = [...new Set(lignes
      .map((l) => /Ignoring word missing in vocabulary:\s*'([^']+)'/.exec(l)?.[1])
      .filter((m): m is string => !!m))].sort();
    console.log(`mots jetés par le moteur : ${manquants.length ? manquants.join(" ") : "aucun"}`);
    expect(manquants, [
      "",
      "LE MOTEUR JETTE DES MOTS DE LA GRAMMAIRE.",
      "",
      "Chacun est un composant qui entre AMPUTÉ dans la reconnaissance : il reste de son nom ce que",
      "le lexique sait dire, et ce reste concurrence un nom bien réel. C'est le défaut que",
      "`plugins/lexique-vosk.ts` existe pour empêcher.",
      "",
      "Les ajouter à `HORS_LEXIQUE_FR`, puis relancer `src/plugins/noms-parles.test.ts` : il dira",
      "quels composants deviennent indicibles, et quels noms parlés sont à refaire.",
      "",
    ].join("\n")).toEqual([]);
  } finally {
    await navigateur.close();
  }
});
