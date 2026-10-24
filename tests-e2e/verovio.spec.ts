// tests-e2e/verovio.spec.ts — La gravure de partition, dans l'application.
//
// CE QUI NE SE TESTE PAS HORS DU NAVIGATEUR : le moteur de gravure est un WebAssembly de 8 Mo,
// chargé à la demande par le nœud. La reconnaissance du format et les options sont testées à part
// (src/audio/verovio.test.ts) ; ici on vérifie qu'une notation entre et qu'une portée sort.
import { test, expect } from "@playwright/test";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5231);

const MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
<note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><type>half</type></note>
</measure></part></score-partwise>`;

async function graver(page: any, parametres: Record<string, unknown>) {
  const graphe = { nodes: [{ id: "g", position: { x: 80, y: 40 }, width: 520, height: 420, data: { ficheId: "partition-verovio", parametres } }], edges: [] };
  await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(graphe)]);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 20000 });
  await page.waitForSelector('.react-flow__node[data-id="g"]', { timeout: 15000 });
  await page.click(".attic-btn-lancer");
  await page.waitForFunction(() => {
    const n = document.querySelector('.react-flow__node[data-id="g"]');
    // La gravure, et non l'icône d'un bouton : le SVG rendu vit dans la vue du nœud, dont les
    // classes sont propres à la gravure depuis qu'elle a cessé d'emprunter celles des nœuds VexFlow.
    // L'état vit sur la pastille de statut, et non sur l'enveloppe posée par ReactFlow.
    return !!n && (!!n.querySelector(".attic-node-vue-gravure-inner svg") || !!n.querySelector(".attic-node-statut-puce.erreur"));
  }, null, { timeout: 90000 });
  return page.evaluate(() => {
    const n = document.querySelector('.react-flow__node[data-id="g"]') as HTMLElement;
    const svg = n.querySelector(".attic-node-vue-gravure-inner svg");
    return {
      texte: n.innerText.replace(/\s+/g, " "),
      notes: n.querySelectorAll("g.note").length,
      portees: n.querySelectorAll("g.staff").length,
      viewBox: svg?.getAttribute("viewBox") ?? "",
      erreur: !!n.querySelector(".attic-node-statut-puce.erreur"),
    };
  });
}

test.describe("partition gravée", () => {
  test("ABC PAR DÉFAUT : une portée de huit notes, reconnue toute seule", async ({ page }) => {
    test.setTimeout(180000);
    const r = await graver(page, {});
    console.log(JSON.stringify(r));
    expect(r.erreur).toBe(false);
    expect(r.texte).toContain("ABC");
    expect(r.texte).toContain("page 1");
    expect(r.notes).toBe(8); // C D E F | G A B c
    expect(r.portees).toBeGreaterThan(0);
  });

  test("MUSICXML : trois notes et le nom de la partie", async ({ page }) => {
    test.setTimeout(180000);
    const r = await graver(page, { "Notation": MUSICXML, "Échelle": 50 });
    console.log(JSON.stringify(r));
    expect(r.erreur).toBe(false);
    expect(r.texte).toContain("MusicXML");
    expect(r.texte).toContain("Piano");
    expect(r.notes).toBe(3);
  });

  test("UNE NOTATION QUI N'EN EST PAS UNE : le nœud le dit, au lieu d'une page blanche", async ({ page }) => {
    test.setTimeout(180000);
    const r = await graver(page, { "Notation": "do ré mi fa sol" });
    console.log(JSON.stringify(r));
    expect(r.erreur).toBe(true);
    expect(r.texte).toMatch(/Notation non reconnue|Notation not recognised/);
  });
});
