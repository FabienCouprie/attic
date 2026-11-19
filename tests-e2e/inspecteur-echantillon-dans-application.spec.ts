// tests-e2e/inspecteur-echantillon-dans-application.spec.ts — Un échantillon rechargé dans l'inspecteur remet
// le nœud à zéro, et le Lancer suivant fait entendre le nouveau, même sous le même nom.
//
// ═══ LE DÉFAUT, RELEVÉ LE 2026-11-19 ═══
//
// Le « Sampler MIDI » reçoit son échantillon par l'inspecteur. Son geste, `onChargerFichier` dans
// `ui/InspecteurDuCanevas.tsx`, posait le fichier sur le nœud, sans l'oublier au cache ni le remettre
// à zéro. Deux conséquences :
//   — le nœud et son aval gardaient leur « Terminé » et le son de l'échantillon d'avant jusqu'au
//     Lancer suivant ;
//   — l'empreinte des réglages ne retient que le NOM du fichier : un échantillon rechargé sous le même
//     nom gardait l'entrée de cache d'avant, et aucun Lancer ne le faisait entendre.
//
// ═══ CE QUE CE CAS EXIGE ═══
//
// L'ATTENDU EST CALCULÉ DE ZÉRO : une page neuve où l'on charge d'emblée le second échantillon, puis
// Lancer. Le geste, un premier échantillon lancé puis un second de même nom chargé et lancé, doit
// rendre ce son-là, octet pour octet.
import { expect, test, type Page } from "@playwright/test";

import { apercusEnWav, etatDesNoeuds, relancerEtAttendre, semer } from "./pilote-graphe";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5294);

/** Un WAV mono 16 bits à 44,1 kHz, d'un sinus à cette fréquence. */
function wav(frequence: number, secondes = 0.5): Buffer {
  const sr = 44100, n = Math.round(sr * secondes);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequence * i / sr) * 8000), 44 + i * 2);
  return b;
}
/** Deux échantillons différents, sous le même nom : c'est le cas que l'empreinte ne voyait pas. */
const PREMIER = { name: "echantillon.wav", mimeType: "audio/wav", buffer: wav(330) };
const SECOND = { name: "echantillon.wav", mimeType: "audio/wav", buffer: wav(550) };

const GRAPHE = JSON.stringify({
  nodes: [
    { id: "note", type: "atelier", position: { x: 0, y: 0 }, data: { ficheId: "frontiere-note", parametres: { "Note": 60, "Durée": 0.5 } } },
    { id: "sampler", type: "atelier", position: { x: 450, y: 0 }, data: { ficheId: "sampler-midi", parametres: { "Volume": 30, "Note référence": 60 } } },
    { id: "ecoute", type: "atelier", position: { x: 900, y: 0 }, data: { ficheId: "point-ecoute", parametres: {} } },
  ],
  edges: [
    { id: "e1", source: "note", target: "sampler", sourceHandle: "out:1", targetHandle: "in:0", type: "arete-personnalisee" },
    { id: "e2", source: "sampler", target: "ecoute", sourceHandle: "out:0", targetHandle: "in:0", type: "arete-personnalisee" },
  ],
});

/** Sème le graphe et sélectionne le sampler : l'inspecteur montre son chargement d'échantillon. */
async function ouvrir(page: Page) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await semer(page, devUrl, GRAPHE);
  await page.locator('.react-flow__node[data-id="sampler"]').click({ position: { x: 12, y: 12 } });
}

/** Charge un échantillon par l'inspecteur, et attend qu'il y soit nommé. */
async function charger(page: Page, fichier: typeof PREMIER) {
  await page.locator('.inspecteur input[type=file][accept*=".wav"]').setInputFiles(fichier);
  await expect(page.locator(".inspecteur")).toContainText(fichier.name, { timeout: 10_000 });
}

const statutDe = async (page: Page, id: string) => (await etatDesNoeuds(page)).find((e) => e.id === id)?.statut;
const sonDe = async (page: Page, id: string) => (await apercusEnWav(page)).find((a) => a.id === id)?.base64 ?? "";

test("UN ÉCHANTILLON RECHARGÉ DANS L'INSPECTEUR REMET LE NŒUD À ZÉRO ET S'ENTEND, MÊME SOUS LE MÊME NOM", async ({ page }) => {
  test.setTimeout(240_000);
  // L'ATTENDU, DE ZÉRO : le second échantillon chargé d'emblée.
  await ouvrir(page);
  await charger(page, SECOND);
  await relancerEtAttendre(page);
  const attendu = await sonDe(page, "ecoute");
  expect(attendu, "le point d'écoute ne fait rien entendre").not.toBe("");

  // LE GESTE : le premier échantillon lancé, puis le second chargé.
  await ouvrir(page);
  await charger(page, PREMIER);
  await relancerEtAttendre(page);
  const avecLePremier = await sonDe(page, "ecoute");
  expect(avecLePremier === attendu, "les deux échantillons doivent s'entendre : sinon le cas n'éprouve rien").toBe(false);
  await charger(page, SECOND);
  await expect.soft.poll(() => statutDe(page, "sampler"), {
    message: "l'échantillon rechargé doit remettre le nœud en attente : il montrerait le son de l'ancien",
    timeout: 5000,
  }).toBe("attente");
  await relancerEtAttendre(page);
  expect(await sonDe(page, "ecoute") === attendu, [
    "",
    "APRÈS LE RECHARGEMENT, LE POINT D'ÉCOUTE NE FAIT PAS ENTENDRE LE SECOND ÉCHANTILLON.",
    "",
    "Sous le même nom, l'empreinte des réglages ne change pas : le geste doit oublier le nœud au cache",
    "et le remettre à zéro. Voir `onChargerFichier` dans `ui/InspecteurDuCanevas.tsx`.",
    "",
  ].join("\n")).toBe(true);
});
