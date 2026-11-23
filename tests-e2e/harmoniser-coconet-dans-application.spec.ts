// tests-e2e/harmoniser-coconet-dans-application.spec.ts — Coconet harmonise, sur le vrai point de
// contrôle, et tient sa graine.
//
// CE QUE CETTE ÉPREUVE GARDE, ET POURQUOI ELLE EST LA SEULE. Le tirage tourne dans le worker Magenta,
// qui n'importe aucune des trois bases de dialogue : `couverture-empreintes.test.ts` ne le réclame
// donc pas, et le banc ne sait pas relever l'empreinte d'une séquence. Les tests unitaires tiennent
// la boucle sur un réseau de substitution (`plugins/coconet-helpers.test.ts`) ; ici, c'est le vrai
// réseau, dans le vrai worker, servi par le vrai chemin des points de contrôle.
//
// TROIS PROMESSES DE LA NOTICE, éprouvées chacune :
//   · le soprano reçu ressort à l'identique, note pour note ;
//   · la même graine rend le même choral, deux pages neuves de suite ;
//   · deux graines rendent deux chorals.
// Et l'épreuve RELÈVE ce qu'aucune autre ne relève : la durée d'une harmonisation et l'arrière-plan
// de TensorFlow dans le worker, que la notice ne chiffre pas.
//
// LA MÉLODIE VIENT D'« ÉCRIRE UN CONTREPOINT », qui l'engendre sans fichier : sa voix supérieure est
// le soprano. Le point de contrôle doit être dans `public/magenta/coconet_bach` ; sans lui, l'épreuve
// se saute en le disant, comme les autres épreuves à modèle.
import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { serveurDeVerification } from "./serveur-de-developpement";
import { semer, relancerEtAttendre } from "./pilote-graphe";
import { garderLExecution } from "./execution-gardee";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const POINT = join(RACINE, "public", "magenta", "coconet_bach", "group1-shard1of1");
const devUrl = serveurDeVerification(5295);

interface NoteLue { note: number; debut: number; fin: number; voix?: number }

// LE CONTREPOINT EST ÉCRIT AU-DESSOUS DU CANTUS, et ce n'est pas un détail : au-dessus, sa ligne
// monte jusqu'à D6, hors de l'étendue du réseau, et le nœud refuse la pièce. C'est le second cas.
const graphe = (graine: number, position = "dessous") => JSON.stringify({
  nodes: [
    { id: "cp", position: { x: 0, y: 0 },
      data: { ficheId: "contrepoint-solveur", parametres: { "Notes": 10, "Position": position } } },
    { id: "coco", position: { x: 420, y: 0 },
      data: { ficheId: "harmoniser-coconet", parametres: { "Graine": graine, "Itérations": 16 } } },
  ],
  edges: [{ id: "e1", source: "cp", target: "coco", sourceHandle: "out:0", targetHandle: "in:0" }],
});

/** Sème, lance, et rend les notes reçues et rendues, le message et la durée du lancement. */
async function harmoniser(page: Page, graine: number, position?: string) {
  await semer(page, devUrl, graphe(graine, position));
  await garderLExecution(page);
  const t0 = Date.now();
  await relancerEtAttendre(page);
  const duree = Date.now() - t0;
  const lu = await page.evaluate(() => {
    const r = (globalThis as unknown as { __attic_execution__?: { resultats?: Map<string, unknown[]> } })
      .__attic_execution__!.resultats!;
    const notes = (v: unknown) => ((v as { notes?: unknown[] } | null)?.notes ?? []) as { note: number; debut: number; fin: number; voix?: number }[];
    const simple = (n: { note: number; debut: number; fin: number; voix?: number }) =>
      ({ note: n.note, debut: n.debut, fin: n.fin, voix: n.voix });
    return {
      recues: notes(r.get("cp")?.[0]).map(simple),
      rendues: notes(r.get("coco")?.[0]).map(simple),
      rapport: String(r.get("coco")?.[1] ?? ""),
    };
  });
  const message = await page.locator('[data-id="coco"]').innerText();
  return { ...lu, message, duree };
}

// LA CARTE EST DEMANDÉE, et c'est ce qui rend l'épreuve praticable. Sans ces options, Chromium sans
// tête calcule WebGL par SwiftShader, sur le processeur : relevé le 2026-11-22 sur 160 cases,
// 21,6 s pour 8 itérations et 77,9 s pour 32. Avec ANGLE sur Direct3D 11, la même machine en met
// 5,1 et 6,9, dont la compilation des nuanceurs au premier lancement. Seize itérations suffisent
// aux trois promesses éprouvées ici, qui ne dépendent pas de leur nombre.
test.use({
  launchOptions: { args: process.platform === "win32" ? ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] : [] },
});

test.describe("Harmoniser (Coconet), sur le vrai point de contrôle", () => {
  test.skip(!existsSync(POINT), "Point de contrôle absent : « npm run download:magenta » le pose dans public/magenta/coconet_bach.");
  test.setTimeout(600_000);

  test("LE SOPRANO RESSORT INTACT, LA GRAINE TIENT, DEUX GRAINES DONNENT DEUX CHORALS", async ({ page }) => {
    const a = await harmoniser(page, 4242);
    const b = await harmoniser(page, 4242);
    const c = await harmoniser(page, 17);
    const voix = (ns: NoteLue[], v: number) => ns.filter((n) => (n.voix ?? 0) === v);
    console.log(`\nA : ${a.duree} ms · ${a.rendues.length} notes\n${a.rapport}\n`
      + `B : ${b.duree} ms · C : ${c.duree} ms\nmessage A : ${a.message.replace(/\s+/g, " ")}\n`);

    expect(a.rendues.length, `rien n'est rendu : ${a.message}`).toBeGreaterThan(0);
    // La voix supérieure du contrepoint est le soprano, gardé tel quel.
    expect(voix(a.rendues, 0)).toEqual(voix(a.recues, 0).map((n) => ({ ...n, voix: 0 })));
    for (const v of [1, 2, 3]) expect(voix(a.rendues, v).length, `la voix ${v} est vide`).toBeGreaterThan(0);
    expect(b.rendues, "la même graine a rendu un autre choral").toEqual(a.rendues);
    expect(c.rendues, "deux graines ont rendu le même choral").not.toEqual(a.rendues);
  });

  test("UN SOPRANO AU-DELÀ DE A5 EST REFUSÉ, CHAQUE NOTE NOMMÉE AVEC SA MESURE", async ({ page }) => {
    const r = await harmoniser(page, 4242, "dessus");
    expect(r.rendues).toEqual([]);
    expect(r.message).toMatch(/hauteurs hors de C2 à A5 : [A-G]#?\d \(\d+\.\d\)/);
  });
});
