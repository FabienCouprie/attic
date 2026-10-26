// tests-e2e/montage-gains-pistes.spec.ts — Le gain de CHAQUE piste du montage agit, pas seulement la première.
//
// ═══ POURQUOI CE CAS EXISTE, ET C'EST LA TROISIÈME FOIS ═══
//
// Relevé par Fabien le 2026-10-26 : « de nouveau les gains et fondus des pistes qui ne sont pas les
// premières sont totalement inopérants ». Deux défauts de cette famille ont déjà été corrigés, et
// aucun n'avait laissé de garde qui PARCOURE LES PISTES :
//
//   · un réglage du montage ne refaisait rien de son aval — la relance passait par le chemin d'un
//     run ciblé, qui n'embrasse que l'amont, après que le moteur avait effacé les descendants ;
//   · le premier geste sur une barre écrivait un morceau pour CHAQUE piste branchée, et les quatre
//     réglages de toutes les pistes cessaient d'agir d'un coup.
//
// LES DEUX ONT ÉTÉ MESURÉS SUR UNE SEULE PISTE. C'est par là que le troisième est passé : rien ne
// vérifiait que la piste 2 se comporte comme la piste 1.
//
// ET LE BANC NE SUFFIT PAS ICI. `COMPOSANT=montage REGLAGE="Gain 2" VALEURS=0,-20 ENTREES=0,1 npm
// run varier` montre que le MOTEUR applique bien −20 dB sur les tranches où la piste 2 sonne. Le
// défaut, s'il existe, est donc dans le chemin de l'INTERFACE — l'inspecteur qui écrit, le réglage
// qui relance, le nœud qui rejoue. Ce cas-ci passe par ce chemin et par aucun autre.
import { expect, test } from "@playwright/test";

import { serveurDeVerification } from "./serveur-de-developpement";
import { semerEtLancer, apercusEnWav } from "./pilote-graphe";
import { niveauxParTranche } from "../src/audio/empreinte-wav";

const devUrl = serveurDeVerification(5248);

/**
 * Deux sons distincts sur les pistes 1 et 2 d'un montage, et sa sortie écoutée.
 *
 * LES DÉBUTS PAR DÉFAUT SÉPARENT LES PISTES DANS LE TEMPS — `Début k` vaut `k × 2` secondes —, et
 * c'est ce qui rend la mesure lisible : la piste 1 sonne de 0 à 1,5 s, la piste 2 de 2 à 3,5 s. Un
 * gain posé sur l'une se lit donc sans démêler l'autre.
 */
const GRAPHE = JSON.stringify({
  nodes: [
    { id: "src-1", type: "atelier", position: { x: 0, y: 0 }, width: 300, height: 200,
      data: { ficheId: "oscillateur", parametres: { Forme: "Sinus", "Fréquence": 220, "Durée": 1.5, Volume: 80 } } },
    { id: "src-2", type: "atelier", position: { x: 0, y: 260 }, width: 300, height: 200,
      data: { ficheId: "oscillateur", parametres: { Forme: "Sinus", "Fréquence": 440, "Durée": 1.5, Volume: 80 } } },
    { id: "mont", type: "atelier", position: { x: 380, y: 100 }, width: 340, height: 300,
      data: { ficheId: "montage", parametres: {} } },
    { id: "out", type: "atelier", position: { x: 780, y: 100 }, width: 300, height: 200,
      data: { ficheId: "sortie-audio", parametres: {} } },
  ],
  edges: [
    { id: "e1", source: "src-1", target: "mont", sourceHandle: "out:0", targetHandle: "in:0" },
    { id: "e2", source: "src-2", target: "mont", sourceHandle: "out:0", targetHandle: "in:1" },
    { id: "e3", source: "mont", target: "out", sourceHandle: "out:0", targetHandle: "in:0" },
  ],
  viewport: { x: 0, y: 0, zoom: 0.7 },
  date: new Date().toISOString(),
});

/** Les niveaux par demi-seconde de ce que le montage fait entendre. */
async function niveauxDuMontage(page: import("@playwright/test").Page): Promise<number[]> {
  const apercus = await apercusEnWav(page);
  const mont = apercus.find((a) => a.id === "mont") ?? apercus.find((a) => a.id === "out");
  expect(mont, `aucun aperçu pour le montage · reçus : ${apercus.map((a) => a.id).join(", ")}`)
    .toBeTruthy();
  const octets = Uint8Array.from(Buffer.from(mont!.base64, "base64")).buffer;
  return niveauxParTranche(octets, 0.5).map((t) => t.db);
}

/** Change un réglage par l'INSPECTEUR, c'est-à-dire par le chemin de l'utilisateur. */
async function reglerParInspecteur(page: import("@playwright/test").Page, libelle: string, valeur: string) {
  await page.locator('.react-flow__node:has-text("Montage")').first().click();
  await page.waitForTimeout(600);
  const champ = page.locator(`.inspecteur-param:has(label:text-is("${libelle}")) input`).first();
  await expect(champ, `le réglage « ${libelle} » n'est pas dans l'inspecteur`).toBeVisible({ timeout: 10_000 });
  await champ.fill(valeur);
  await champ.blur();
}

/** La valeur que l'inspecteur montre pour un réglage. */
async function valeurDansInspecteur(page: import("@playwright/test").Page, libelle: string): Promise<string> {
  const champ = page.locator(`.inspecteur-param:has(label:text-is("${libelle}")) input`).first();
  await expect(champ, `le réglage « ${libelle} » n'est pas dans l'inspecteur`).toBeVisible({ timeout: 10_000 });
  return (await champ.inputValue()) ?? "";
}

test.describe("les gains de piste du montage", () => {
  test.setTimeout(240_000);

  test("UNE GLISSIERE QUI A CESSE D AGIR EST GRISEE, ET DIT POURQUOI SANS QU ON CLIQUE", async ({ page }) => {
    // ═══ LA CINQUIÈME MANIFESTATION DU MÊME DÉFAUT, ET LA DÉCISION DE FABIEN ═══
    //
    // Depuis que la barre et la glissière sont le même nombre, il ne reste qu'un cas où les quatre
    // réglages d'une piste ne la décrivent plus : elle est COUPÉE en plusieurs morceaux, ou ROGNÉE.
    // Quatre nombres ne décrivent pas trois morceaux.
    //
    // MAIS RIEN NE LE DISAIT À L'ÉCRAN : la glissière restait vive, acceptait une valeur, et cette
    // valeur n'allait nulle part. Le contrat de composant l'exigeait depuis toujours — « un réglage
    // légitimement inerte porte sa raison écrite à côté de lui » —, et ces quatre la portaient
    // derrière un bouton « ? », que personne n'ouvre en tirant une glissière qui ne fait rien.
    //
    // Décision de Fabien : griser la glissière avec sa raison.
    const coupe = JSON.parse(GRAPHE);
    coupe.nodes[2].data.morceaux = [
      { id: "a", piste: 1, debut: 2, dans: 0, duree: 0.7, gain: 0, entree: 10, sortie: 10 },
      { id: "b", piste: 1, debut: 2.8, dans: 0.7, duree: 0, gain: 0, entree: 10, sortie: 10 },
    ];
    await semerEtLancer(page, devUrl, JSON.stringify(coupe), { profondeurExport: 32 });
    await page.locator('.react-flow__node:has-text("Montage")').first().click();
    await page.waitForTimeout(800);

    /** L'opacité du contrôle d'un réglage, et la raison affichée sous son libellé. */
    const etat = (libelle: string) => page
      .locator(`.inspecteur-param:has(label:text-is("${libelle}"))`).first()
      .evaluate((e) => ({
        opacite: (e.querySelector(".inspecteur-range") as HTMLElement | null)?.style.opacity ?? "",
        gestes: (e.querySelector(".inspecteur-range") as HTMLElement | null)?.style.pointerEvents ?? "",
        raison: (e.querySelector(".inspecteur-param-doc") as HTMLElement | null)?.textContent ?? "",
      }));

    const p2 = await etat("Gain 2");
    const p1 = await etat("Gain 1");
    console.log(`piste 2 (coupée) : opacité=${p2.opacite} gestes=${p2.gestes} · raison=« ${p2.raison.slice(0, 60)}… »`);
    console.log(`piste 1 (entière) : opacité=${p1.opacite || "(aucune)"} · raison=« ${p1.raison} »`);

    expect(Number(p2.opacite), [
      "",
      "LA GLISSIÈRE D'UNE PISTE COUPÉE N'EST PAS GRISÉE.",
      "",
      "Elle a cessé d'agir : la fiche le déclare par `inerte`, et l'inspecteur doit le montrer.",
      "Une glissière vive qui n'agit plus accepte une valeur que personne ne lira — c'est le défaut",
      "qu'il a fallu quatre relevés pour trouver.",
      "",
    ].join("\n")).toBeLessThan(1);
    expect(p2.gestes, "et elle ne doit plus accepter de geste").toBe("none");
    expect(p2.raison, [
      "",
      "LA RAISON N'EST PAS LISIBLE SANS CLIQUER.",
      "",
      "C'est tout l'objet de la décision : la raison s'ouvre d'elle-même quand le réglage est inerte.",
      "",
    ].join("\n")).toMatch(/découpée|cut/i);

    // ET LA PISTE ENTIÈRE N'EST PAS TOUCHÉE : aucun grisé, aucune raison imposée.
    expect(p1.opacite, "une piste entière garde sa glissière vive").toBe("");
    expect(p1.raison, "et aucune raison ne s'impose à elle").toBe("");
  });

  test("DEPLACER UNE BARRE DEPLACE SA GLISSIERE : la barre et le reglage sont le MEME nombre", async ({ page }) => {
    // ═══ LE RELEVÉ DE FABIEN, MOT POUR MOT ═══
    //
    // « Il n'y a aucun lien entre les éléments graphiques (fondu), le déplacement des barres et leur
    // équivalent dans l'inspecteur. Par exemple si je déplace la barre de la première piste vers la
    // droite, il n'y a aucune modification équivalente de la glissière Début 1. Cela ne fonctionne
    // donc pas. »
    //
    // Il avait raison, et c'était la cause de toute la famille : le composant tenait DEUX sources de
    // vérité pour les mêmes quatre nombres, avec un interrupteur par piste qui basculait en silence.
    await semerEtLancer(page, devUrl, GRAPHE, { profondeurExport: 32 });
    await page.locator('.react-flow__node:has-text("Montage")').first().click();
    await page.waitForTimeout(800);

    const avant = await valeurDansInspecteur(page, "Début 1");
    const barre = await page.locator("g.ligne-temps-piste").first().locator("rect").first().boundingBox();
    expect(barre, "la barre de la piste 1 n'a pas de boîte").toBeTruthy();
    await page.mouse.move(barre!.x + barre!.width / 2, barre!.y + barre!.height / 2);
    await page.mouse.down();
    await page.mouse.move(barre!.x + barre!.width / 2 + 60, barre!.y + barre!.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(2500);
    const apres = await valeurDansInspecteur(page, "Début 1");

    console.log(`« Début 1 » : avant=${avant} · après avoir tiré la barre vers la droite=${apres}`);
    expect(Number(apres), [
      "",
      "DÉPLACER LA BARRE N'A PAS DÉPLACÉ « Début 1 ».",
      "",
      "La barre et la glissière doivent être deux vues du MÊME nombre. Un geste sur une piste encore",
      "descriptible par ses quatre réglages écrit ces réglages, et non un morceau figé :",
      "voir `EcritureMontage.reglages` dans `audio/montage-morceaux.ts`.",
      "",
    ].join("\n")).toBeGreaterThan(Number(avant));
  });

  test("LE GAIN DE LA PISTE 2 AGIT, et non seulement celui de la piste 1", async ({ page }) => {
    await semerEtLancer(page, devUrl, GRAPHE, { profondeurExport: 32 });
    const avant = await niveauxDuMontage(page);
    console.log(`avant · ${avant.map((v, i) => `${(i * 0.5).toFixed(1)}s=${v.toFixed(1)}`).join(" ")}`);

    // La piste 1 sonne de 0 à 1,5 s, la piste 2 de 2 à 3,5 s. On repère les tranches de chacune sur
    // ce qu'on vient d'entendre, plutôt que de les supposer.
    const tranchesPiste2 = avant.map((v, i) => ({ v, i })).filter((t) => t.i >= 4 && Number.isFinite(t.v));
    expect(tranchesPiste2.length, [
      "",
      "La piste 2 ne sonne pas du tout : le montage ne rend qu'une piste.",
      "",
      `Niveaux relevés : ${avant.map((v) => v.toFixed(1)).join(", ")}`,
      "",
    ].join("\n")).toBeGreaterThan(0);

    await reglerParInspecteur(page, "Gain 2", "-20");
    // La relance après un réglage est différée, puis le graphe tourne.
    await page.waitForTimeout(6000);
    const apres = await niveauxDuMontage(page);
    console.log(`après · ${apres.map((v, i) => `${(i * 0.5).toFixed(1)}s=${v.toFixed(1)}`).join(" ")}`);

    const ecartsPiste2 = tranchesPiste2.map(({ v, i }) => ({ i, ecart: (apres[i] ?? -Infinity) - v }));
    const pire = ecartsPiste2.reduce((a, b) => (Math.abs(b.ecart) > Math.abs(a.ecart) ? b : a));
    console.log(`écart le plus grand sur la piste 2 : ${pire.ecart.toFixed(1)} dB à ${(pire.i * 0.5).toFixed(1)} s`);
    expect(Math.abs(pire.ecart), [
      "",
      "LE GAIN DE LA PISTE 2 N'A RIEN CHANGÉ.",
      "",
      "C'est le relevé de Fabien du 2026-10-26 : « les gains et fondus des pistes qui ne sont pas",
      "les premières sont totalement inopérants ».",
      "",
      "LE MOTEUR, LUI, APPLIQUE BIEN LE GAIN — mesuré par le banc :",
      "  COMPOSANT=montage REGLAGE=\"Gain 2\" VALEURS=0,-20 ENTREES=0,1 npm run varier",
      "donne exactement −20 dB sur les tranches où la piste 2 sonne. Le défaut est donc dans le",
      "chemin de l'interface : l'inspecteur qui écrit, le réglage qui relance, ou le nœud qui rejoue.",
      "",
      `Niveaux avant : ${avant.map((v) => v.toFixed(1)).join(", ")}`,
      `Niveaux après : ${apres.map((v) => v.toFixed(1)).join(", ")}`,
      "",
    ].join("\n")).toBeGreaterThan(10);

    // ET LA PISTE 1 N'A PAS BOUGÉ : un gain de piste ne touche qu'à sa piste.
    const ecartPiste1 = Math.max(...avant.slice(0, 3)
      .map((v, i) => Math.abs((apres[i] ?? -Infinity) - v))
      .filter(Number.isFinite));
    console.log(`écart sur la piste 1 : ${ecartPiste1.toFixed(1)} dB`);
    expect(ecartPiste1, "le gain de la piste 2 ne doit pas toucher la piste 1").toBeLessThan(1);
  });

  test("ET IL AGIT ENCORE APRES UN GESTE SUR LA LIGNE DE TEMPS D UNE AUTRE PISTE", async ({ page }) => {
    // ═══ LE SCÉNARIO DU RELEVÉ, ET C'EST CELUI DU DÉFAUT D'AVANT ═══
    //
    // La règle du composant est que les quatre réglages d'une piste cessent d'agir dès qu'on touche
    // à CETTE piste-là. Un défaut déjà corrigé les tuait TOUTES au premier geste sur n'importe
    // laquelle : la ligne de temps rendait la liste COMPLÉTÉE, donc écrivait un morceau pour chaque
    // piste branchée. Rien ne gardait cette correction par un parcours des pistes, et c'est par là
    // que le relevé du 2026-10-26 pouvait repasser.
    await semerEtLancer(page, devUrl, GRAPHE, { profondeurExport: 32 });
    const avant = await niveauxDuMontage(page);
    console.log(`avant · ${avant.map((v, i) => `${(i * 0.5).toFixed(1)}s=${v.toFixed(1)}`).join(" ")}`);

    // ON TOUCHE À LA PISTE 1, et à elle seule : on tire sa barre sur la ligne de temps.
    await page.locator('.react-flow__node:has-text("Montage")').first().click();
    await page.waitForTimeout(800);
    const barres = page.locator(".ligne-temps-piste");
    const combien = await barres.count();
    console.log(`barres sur la ligne de temps : ${combien}`);
    expect(combien, "la ligne de temps ne montre aucune piste").toBeGreaterThan(1);
    const boite = await barres.first().boundingBox();
    expect(boite, "la barre de la piste 1 n'a pas de boîte").toBeTruthy();
    await page.mouse.move(boite!.x + boite!.width / 2, boite!.y + boite!.height / 2);
    await page.mouse.down();
    await page.mouse.move(boite!.x + boite!.width / 2 + 30, boite!.y + boite!.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(6000);

    // PUIS LE GAIN DE LA PISTE 2, qu'on n'a pas touchée.
    await reglerParInspecteur(page, "Gain 2", "-20");
    await page.waitForTimeout(6000);
    const apres = await niveauxDuMontage(page);
    console.log(`après · ${apres.map((v, i) => `${(i * 0.5).toFixed(1)}s=${v.toFixed(1)}`).join(" ")}`);

    const tranches2 = avant.map((v, i) => ({ v, i })).filter((t) => t.i >= 4 && Number.isFinite(t.v));
    expect(tranches2.length, "la piste 2 ne sonne plus du tout après le geste sur la piste 1")
      .toBeGreaterThan(0);
    const pire = tranches2
      .map((t) => ({ i: t.i, ecart: (apres[t.i] ?? -Infinity) - t.v }))
      .reduce((a, b) => (Math.abs(b.ecart) > Math.abs(a.ecart) ? b : a));
    console.log(`écart sur la piste 2, après un geste sur la piste 1 : ${pire.ecart.toFixed(1)} dB`);
    expect(Math.abs(pire.ecart), [
      "",
      "UN GESTE SUR LA PISTE 1 A TUÉ LE GAIN DE LA PISTE 2.",
      "",
      "C'est le défaut que `morceauxAEcrire` existe pour empêcher : la ligne de temps travaille sur",
      "la liste COMPLÉTÉE, donc elle la rend complétée, et un seul geste écrivait un morceau pour",
      "chaque piste branchée — toutes devenaient découpées, et leurs quatre réglages mouraient.",
      "",
      "La règle est : les réglages d'une piste cessent d'agir dès qu'on touche à CETTE piste-là.",
      "",
      `Niveaux avant : ${avant.map((v) => v.toFixed(1)).join(", ")}`,
      `Niveaux après : ${apres.map((v) => v.toFixed(1)).join(", ")}`,
      "",
    ].join("\n")).toBeGreaterThan(10);
  });

  test("ET UN GESTE SUR SA PROPRE BARRE NE TUE PAS LA GLISSIERE : il ecrit ses reglages", async ({ page }) => {
    // ═══ LE RELEVÉ EXACT DE FABIEN, LE 2026-10-26 ═══
    //
    // « Oui il y a bien une barre, mais cela ne fonctionne pas. Le fondu sur le graphique par
    // poignée fonctionne, mais pas les gains et les fondus en dehors de la première piste. »
    //
    // CE QUE DIT LA RÈGLE DU COMPOSANT : les quatre réglages d'une piste cessent d'agir dès qu'un
    // morceau y est posé, et c'est alors la POIGNÉE DE NIVEAU, en bas à droite de la barre, qui se
    // tire. Une glissière inerte sur une piste découpée n'est donc pas un défaut — c'est la règle.
    //
    // MAIS ALORS LA POIGNÉE DOIT AGIR, et c'est elle que ce cas mesure. Si elle n'agit pas, le
    // niveau d'une piste découpée n'est atteignable par RIEN : c'est exactement le défaut du
    // 2026-09, où le gain d'un morceau n'était écrit qu'à un seul endroit de toute la chaîne.
    await semerEtLancer(page, devUrl, GRAPHE, { profondeurExport: 32 });
    const avant = await niveauxDuMontage(page);
    console.log(`avant · ${avant.map((v, i) => `${(i * 0.5).toFixed(1)}s=${v.toFixed(1)}`).join(" ")}`);

    await page.locator('.react-flow__node:has-text("Montage")').first().click();
    await page.waitForTimeout(800);
    const piste2 = page.locator("g.ligne-temps-piste").nth(1);
    await expect(piste2, "la piste 2 n'a pas de barre").toBeVisible({ timeout: 10_000 });

    // ON DÉCOUPE LA PISTE 2 : on tire sa barre, ce qui y pose un morceau et éteint ses réglages.
    const barre = await piste2.locator("rect").first().boundingBox();
    expect(barre, "la barre de la piste 2 n'a pas de boîte").toBeTruthy();
    await page.mouse.move(barre!.x + barre!.width / 2, barre!.y + barre!.height / 2);
    await page.mouse.down();
    await page.mouse.move(barre!.x + barre!.width / 2 + 25, barre!.y + barre!.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(6000);

    // ═══ LE GESTE S'ENTEND TOUT SEUL, et c'est la correction du 2026-10-26 ═══
    //
    // La vue écrivait son découpage par un `setNodes` nu : rien ne purgeait le cache, rien ne
    // périmait l'aval, rien ne relançait. Le morceau déplacé n'était entendu qu'au PROCHAIN run
    // déclenché par autre chose — et comme la glissière de cette piste est éteinte par le morceau
    // qu'on vient d'y poser, tirer une barre puis tirer la glissière donnait l'impression que RIEN
    // ne fonctionnait, sur toutes les pistes sauf la première.
    const apresDecoupe = await niveauxDuMontage(page);
    console.log(`après la barre tirée · ${apresDecoupe.map((v, i) => `${(i * 0.5).toFixed(1)}s=${v.toFixed(1)}`).join(" ")}`);
    const bougeParLeGeste = apresDecoupe.length !== avant.length
      || avant.some((v, i) => Math.abs((apresDecoupe[i] ?? -Infinity) - v) > 1
        || Number.isFinite(v) !== Number.isFinite(apresDecoupe[i] ?? -Infinity));
    expect(bougeParLeGeste, [
      "",
      "TIRER UNE BARRE SUR LA LIGNE DE TEMPS NE S'ENTEND PAS.",
      "",
      "Le découpage est bien écrit dans le nœud — l'empreinte de cache regarde `morceaux` —, mais une",
      "empreinte qui change ne LANCE rien. Il faut purger le cache, périmer l'aval et relancer, ce que",
      "`onChangerDecoupe` fait désormais, comme un changement de réglage.",
      "",
      `Niveaux avant le geste : ${avant.map((v) => v.toFixed(1)).join(", ")}`,
      `Niveaux après le geste : ${apresDecoupe.map((v) => v.toFixed(1)).join(", ")}`,
      "",
    ].join("\n")).toBe(true);
    await reglerParInspecteur(page, "Gain 2", "-20");
    await page.waitForTimeout(6000);
    const apresGlissiere = await niveauxDuMontage(page);
    const effetGlissiere = Math.max(...apresDecoupe
      .map((v, i) => Math.abs((apresGlissiere[i] ?? -Infinity) - v)).filter(Number.isFinite));
    console.log(`après découpe  · ${apresDecoupe.map((v, i) => `${(i * 0.5).toFixed(1)}s=${v.toFixed(1)}`).join(" ")}`);
    console.log(`après Gain 2   · ${apresGlissiere.map((v, i) => `${(i * 0.5).toFixed(1)}s=${v.toFixed(1)}`).join(" ")}`);
    console.log(`effet de la glissière « Gain 2 » sur une piste découpée : ${effetGlissiere.toFixed(1)} dB`);

    // ═══ ET AUCUN MORCEAU N'EST FIGÉ : LA PISTE RESTE SOUS SES RÉGLAGES ═══
    //
    // C'ÉTAIT L'ASYMÉTRIE QUE FABIEN DÉCRIVAIT, et elle n'existe plus. Avant le 2026-10-26, tirer
    // une barre FIGEAIT un morceau sur cette piste, ce qui éteignait ses quatre réglages en silence :
    // la piste 1 jamais touchée gardait des glissières vivantes, la piste 2 non. D'où « tout sauf la
    // première piste ne fonctionne pas », sans que rien à l'écran ne distingue les deux barres.
    //
    // Un geste sur une piste descriptible écrit maintenant ses RÉGLAGES. Rien ne bascule, et la
    // glissière agit encore.
    const decoupe = await page.evaluate(() => {
      const brut = localStorage.getItem("attic-encours");
      if (!brut) return null;
      const mont = (JSON.parse(brut).nodes ?? []).find((n: any) => n.data?.ficheId === "montage");
      return { morceaux: (mont?.data?.morceaux ?? []).map((m: any) => m.piste), videes: mont?.data?.pistesVidees ?? [] };
    });
    console.log(`morceaux figés, par piste : ${JSON.stringify(decoupe)}`);
    expect(decoupe, "le découpage du montage n'est pas enregistré").toBeTruthy();
    expect(decoupe!.morceaux, [
      "",
      "UN MORCEAU A ÉTÉ FIGÉ PAR UN SIMPLE DÉPLACEMENT DE BARRE.",
      "",
      "Une piste qui porte un seul morceau jouant tout son son reste DESCRIPTIBLE par ses quatre",
      "réglages : le geste doit les écrire, et non figer un morceau. Figer éteint les glissières de",
      "cette piste en silence — c'est le relevé de Fabien du 2026-10-26.",
      "",
      "Ce qui se fige légitimement : une piste COUPÉE en plusieurs, ou ROGNÉE.",
      "",
    ].join("\n")).toEqual([]);

    // ET LA GLISSIÈRE AGIT ENCORE, sur cette piste comme sur l'autre : il n'y a plus qu'une source.
    console.log(`effet de « Gain 2 » après un geste sur SA PROPRE barre : ${effetGlissiere.toFixed(1)} dB`);
    expect(effetGlissiere, [
      "",
      "LA GLISSIÈRE « Gain 2 » NE FAIT PLUS RIEN APRÈS UN GESTE SUR SA PROPRE BARRE.",
      "",
      "C'est exactement le défaut relevé : la piste a basculé dans l'autre régime et sa glissière est",
      "morte. Un geste sur une piste descriptible doit écrire ses réglages, non figer un morceau.",
      "",
    ].join("\n")).toBeGreaterThan(10);
  });
});
