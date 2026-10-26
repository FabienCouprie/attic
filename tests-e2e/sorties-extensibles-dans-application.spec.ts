// tests-e2e/sorties-extensibles-dans-application.spec.ts — Un nœud ouvre et referme ses SORTIES.
//
// ═══ POURQUOI CE CAS EXISTE, ET POURQUOI IL EST DE BOUT EN BOUT ═══
//
// La règle vit dans `ui/ports-extensibles.ts` et ses cas unitaires l'éprouvent. Mais le CÂBLAGE de
// cette règle aux sorties est dans `AtelierNode.tsx`, un `.tsx` : `vite.config.ts` ne ramasse que
// les fichiers `.test.ts`, et un cas en `.test.tsx` ne serait jamais exécuté. Le seul endroit où
// l'on peut voir une poignée paraître est donc l'application.
//
// CE QU'IL ÉPROUVE, DANS CET ORDRE :
//
//   1. UN SÉPARATEUR NEUF MONTRE DEUX SORTIES, pas seize. Il les déclare toutes les seize, qui est
//      le nombre de canaux de la plus grande disposition de ce dépôt ; un stéréo n'en emploie deux.
//   2. LE « + » EN OUVRE UNE DE PLUS, et la poignée paraît.
//   3. LE « − » REFUSE DE CACHER UNE SORTIE CÂBLÉE. C'est la règle du bas, et c'est elle qui
//      empêche un câble de disparaître parce qu'on a raccourci le nœud.
import { expect, test } from "@playwright/test";

import { serveurDeVerification } from "./serveur-de-developpement";
import { semerEtLancer } from "./pilote-graphe";

const devUrl = serveurDeVerification(5255);

// Le séparateur reçoit un son, et sa TROISIÈME sortie est câblée : elle doit donc rester visible
// quoi qu'on demande, et le « − » se refuser.
const GRAPHE = JSON.stringify({
  nodes: [
    { id: "ton", position: { x: -420, y: 0 }, data: { ficheId: "generateur-frequence", parametres: { "Durée": 1 } } },
    { id: "sep", position: { x: 40, y: 0 }, data: { ficheId: "separateur-canaux", parametres: {} } },
    { id: "ecoute", position: { x: 520, y: 0 }, data: { ficheId: "sortie-audio", parametres: {} } },
  ],
  edges: [
    { id: "e0", source: "ton", target: "sep", sourceHandle: "out:0", targetHandle: "in:0", type: "arete-personnalisee" },
    { id: "e1", source: "sep", target: "ecoute", sourceHandle: "out:2", targetHandle: "in:0", type: "arete-personnalisee" },
  ],
});

/** Un graphe sans aucun câble sur le séparateur : il doit alors montrer son défaut. */
const GRAPHE_NU = JSON.stringify({
  nodes: [{ id: "sep", position: { x: 0, y: 0 }, data: { ficheId: "separateur-canaux", parametres: {} } }],
  edges: [],
});

const sorties = (page: import("@playwright/test").Page) =>
  page.locator('[data-id="sep"] .attic-node-ports-col.right .attic-node-port');
const compteur = (page: import("@playwright/test").Page) =>
  page.locator('[data-id="sep"] .attic-node-ports-col.right .attic-node-ports-plus');

test.describe("les sorties extensibles, dans l'application", () => {
  test.setTimeout(300_000);

  test("UN SEPARATEUR NEUF MONTRE DEUX SORTIES SUR SEIZE, ET LE + LES OUVRE", async ({ page }) => {
    await semerEtLancer(page, devUrl, GRAPHE_NU, { profondeurExport: 32 });
    const n = await sorties(page).count();
    const boite = await page.locator('[data-id="sep"]').boundingBox();
    console.log(`séparateur neuf · ${n} sortie(s) dessinée(s) · ${Math.round(boite!.height)} px de haut`);
    expect(n, [
      "",
      "LE SÉPARATEUR NE DESSINE PLUS DEUX SORTIES À LA NAISSANCE.",
      "",
      "Il en déclare seize, qui est le nombre de canaux de la plus grande disposition de ce dépôt,",
      "et n'en dessine que ce qu'il emploie. Seize dessinées font un nœud de 448 pixels portant",
      "quatorze ports vides. La règle est dans `ui/ports-extensibles.ts` et la déclaration",
      "`sortiesExtensibles` dans la fiche du composant.",
      "",
    ].join("\n")).toBe(2);

    // LE « + » OUVRE UNE SORTIE DE PLUS, et la poignée paraît sur le nœud.
    await compteur(page).getByRole("button", { name: "+" }).click({ timeout: 15_000 });
    await expect.poll(async () => await sorties(page).count(), { timeout: 15_000 }).toBe(3);
    await compteur(page).getByRole("button", { name: "−" }).click({ timeout: 15_000 });
    await expect.poll(async () => await sorties(page).count(), { timeout: 15_000 }).toBe(2);
  });

  test("ET LE MOINS REFUSE DE CACHER UNE SORTIE CABLEE", async ({ page }) => {
    // La troisième sortie porte un câble : le nœud en montre donc trois, et le « − » est éteint.
    await semerEtLancer(page, devUrl, GRAPHE, { profondeurExport: 32 });
    expect(await sorties(page).count(),
      "une sortie câblée au-delà du défaut doit forcer le nœud à la montrer").toBe(3);
    const moins = compteur(page).getByRole("button", { name: "−" });
    expect(await moins.isDisabled(), [
      "",
      "LE « − » ACCEPTE DE CACHER UNE SORTIE QUI PORTE UN CÂBLE.",
      "",
      "C'est la règle du bas de `ui/ports-extensibles.ts` : le compte affiché ne descend jamais sous",
      "le dernier port branché. Sans elle, raccourcir le nœud ferait disparaître une poignée, et",
      "`ui/validerGraphe.ts` retirerait l'arête qui s'y accrochait.",
      "",
    ].join("\n")).toBe(true);
  });
});
