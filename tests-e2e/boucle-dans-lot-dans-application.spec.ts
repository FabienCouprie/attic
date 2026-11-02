// tests-e2e/boucle-dans-lot-dans-application.spec.ts — Une boucle par passes posée dans un graphe mené
// par lot boucle encore, et pour chaque fichier.
//
// ═══ L'EMBOÎTEMENT QU'AUCUN CAS N'ÉPROUVAIT, ET POURQUOI IL COMPTE ═══
//
// Les deux pilotes de passes s'emboîtent dans l'ordre où ils se lisent : le lot dehors, qui rejoue
// le graphe une fois par fichier, et les boucles par passes dedans, qui le rejouent une fois par
// morceau. Cette ligne du pilote du lot a déjà appelé `lancerUnePasse` DIRECTEMENT, si bien qu'une
// boucle par voix, par créneau ou par cercle posée dans un graphe mené par lot n'était jamais
// PLANIFIÉE : chaque fichier menait une seule passe, la boucle ne bouclait pas, et rien ne le
// disait. Corrigé, relevé par Fabien, et gardé nulle part : `usePilotesDePasse.ts` le dit en tête,
// et `frontiere-domaine.test.ts` en fait la condition de toute généralisation des pilotes.
//
// ═══ CE QUE CE CAS REFAIT ═══
//
// Un lot de deux fichiers dont le graphe porte, à côté de la chaîne audio, une boucle par créneau à
// trois créneaux refermée sur elle-même : le créneau est sa propre séquence. Le pilote du lot doit
// mener, pour CHAQUE fichier, la passe de découverte puis deux passes de plus ; la fin de boucle
// annonce alors « 3 créneaux remplis ». Sous le défaut, elle dit « aucune boucle ouverte, laissé tel
// quel » : la boucle n'a jamais été planifiée. Et le lot écrit toujours ses deux fichiers, pas six :
// la chaîne audio, dont rien ne change d'une passe de créneau à l'autre, est servie par le cache.
//
// LA FAUSSE `window.api` EST CELLE DE `boucle-collection.spec.ts` : deux pistes en entrée, un dossier
// de sortie qui note ce qu'on y écrit. Le lot écrit par le processus principal, qui n'existe pas
// dans un navigateur. Le pilotage, lui, est celui de `pilote-graphe.ts`, comme le contrat l'exige.
import { expect, test } from "@playwright/test";

import { etatDesNoeuds, semerEtLancer } from "./pilote-graphe";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5277);

/** Deux pistes dans « entree », un dossier « sortie » qui note ce qu'on y écrit. */
const FAUSSE_API = () => {
  const sr = 44100, n = sr / 2;
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 440 * i / sr) * 8000, true);
  const octets = new Uint8Array(buf);
  (window as any).__ecrits = [];
  (window as any).api = {
    lireDossier: async (chemin: string) => String(chemin).includes("entree")
      ? [{ nom: "une.wav", chemin: "C:/entree/une.wav" }, { nom: "deux.wav", chemin: "C:/entree/deux.wav" }]
      : (window as any).__ecrits.map((e: any) => ({ nom: String(e.chemin).split("/").pop(), chemin: e.chemin })),
    lireFichierAudio: async (chemin: string) => {
      const b64 = btoa(Array.from(octets, (o: number) => String.fromCharCode(o)).join(""));
      return { url: `data:audio/wav;base64,${b64}`, donnees: octets, nom: String(chemin).split("/").pop() };
    },
    ecrireFichier: async (chemin: string, donnees: ArrayBuffer) => {
      (window as any).__ecrits.push({ chemin, octets: donnees.byteLength });
      return { ok: true };
    },
    choisirDossier: async () => null,
  };
};

/** Le lot sur la ligne du haut, la boucle par créneau sur celle du bas, dans le même graphe. */
const GRAPHE = JSON.stringify({
  nodes: [
    { id: "ld", position: { x: 0, y: 0 }, data: { ficheId: "boucle-collection-debut", parametres: { Dossier: "C:/entree" } } },
    { id: "g", position: { x: 300, y: 0 }, data: { ficheId: "amplificateur", parametres: {} } },
    { id: "lf", position: { x: 620, y: 0 }, data: { ficheId: "boucle-collection-fin",
      parametres: { "Dossier sortie": "C:/sortie", Suffixe: "-x", Format: "WAV", "Si le fichier existe": "Écraser" } } },
    { id: "cd", position: { x: 0, y: 300 }, data: { ficheId: "boucle-creneau-debut",
      parametres: { "Créneaux": 3, "Départs": "0:6", "Durées": "2", Tempo: 120 } } },
    { id: "cf", position: { x: 300, y: 300 }, data: { ficheId: "boucle-creneau-fin", parametres: {} } },
  ],
  edges: [
    { id: "e1", source: "ld", target: "g", sourceHandle: "out:0", targetHandle: "in:0" },
    { id: "e2", source: "g", target: "lf", sourceHandle: "out:0", targetHandle: "in:0" },
    { id: "e3", source: "cd", target: "cf", sourceHandle: "out:0", targetHandle: "in:0" },
  ],
});

test("UNE BOUCLE PAR CRÉNEAU DANS UN LOT BOUCLE POUR CHAQUE FICHIER, et le lot n'écrit pas plus", async ({ page }) => {
  // LE SOUNDFONT DOIT AVOIR FINI DE SE CHARGER AVANT QU'ON LANCE. Son chargement automatique aboutit
  // quelques secondes après l'ouverture et vidait le cache d'exécution à son arrivée : tombé au milieu
  // du lot, il faisait rejouer la chaîne audio à la passe suivante, et le lot écrivait son second
  // fichier deux fois. Relevé en écrivant ce cas, trois écritures pour deux fichiers ; ce n'est pas
  // l'emboîtement qui fuit. Le défaut est corrigé à part (`ui/soundfont-cache.ts`, le vidage attend
  // la fin du run) ; ce cas-ci attend quand même l'instrument, pour ne tenir que l'emboîtement et ne
  // pas dépendre de l'instant où un chargement aboutit. Sous StrictMode l'effet part deux fois : on
  // attend les deux arrivées, ou quinze secondes si une seule vient.
  let sf2Charges = 0;
  page.on("console", (m) => { if (/SF2 global chargé/.test(m.text())) sf2Charges++; });
  await page.addInitScript(FAUSSE_API);
  await semerEtLancer(page, devUrl, GRAPHE, {
    avantDeLancer: async (p) => {
      for (let attente = 0; sf2Charges < 2 && attente < 15000; attente += 250) await p.waitForTimeout(250);
      await p.waitForTimeout(1000);
    },
  });

  const etats = await etatDesNoeuds(page);
  const fin = etats.find((e) => e.id === "cf");
  expect(fin?.statut, "la fin de boucle par créneau a abouti").toBe("termine");
  // C'EST LA LIGNE QUI PORTE L'EMBOÎTEMENT : trois créneaux, donc trois passes menées DANS le lot.
  // Sous le défaut, « aucune boucle ouverte, laissé tel quel ».
  expect(fin?.message ?? "", "la boucle a été planifiée et menée jusqu'à son dernier créneau")
    .toMatch(/^3 créneaux remplis/);
  // Et le lot a écrit ses deux fichiers, pas six : les passes de créneau n'ont pas rejoué la chaîne
  // audio, servie par le cache. Dans l'ordre alphabétique des sources, comme le lot les lit.
  const ecrits = await page.evaluate(() => (window as any).__ecrits.map((e: any) => e.chemin));
  expect(ecrits).toEqual(["C:/sortie/deux-x.wav", "C:/sortie/une-x.wav"]);
});
