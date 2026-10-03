// tests-e2e/mesure-hors-fil.spec.ts — La mesure calculée dans un ouvrier est celle du fil.
//
// POURQUOI CE FICHIER, ET CE QUE LA BASE D'EMPREINTES NE PEUT PAS FAIRE.
//
// Le suivi de hauteur de `mesurerCopie` a été sorti du fil de l'interface : la voie à lire, le suivi
// et sa conclusion sont trois morceaux, et le morceau du milieu traverse un worker. Deux composants
// recomposent les trois, « Fiche technique » et « Parcours », et leurs notices promettent qu'ils ne
// peuvent pas se contredire — ni l'un l'autre, ni le nœud « Suiveur de hauteur ».
//
// LA BASE D'EMPREINTES NE SUFFIT PAS ICI. « Parcours » ne rend que du texte : son empreinte audio
// serait vide, et la base la refuserait à juste titre. Et `src/parcours/mesures.test.ts` recompose
// bien les trois morceaux, mais dans Node, où `Worker` n'existe pas : le socle y retombe dans le
// fil, et le test ne prouve donc rien du chemin réellement emprunté par l'application.
//
// CE TEST EMPRUNTE CE CHEMIN-LÀ. Il tourne dans la page, où le worker existe, et compare les seize
// champs de la mesure à ceux de la version en fil. Un écart d'un seul cent ferait échouer ce test, et
// c'est exactement la faute que les deux notices affirment impossible.
import { expect, test } from "@playwright/test";

const devUrl = process.env.DEV_URL || "http://localhost:5175";

test("les seize champs de la mesure sont les mêmes dans un ouvrier et dans le fil", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 30000 });

  const r = await page.evaluate(async () => {
    const mesures: any = await import("/src/parcours/mesures.ts");
    const prise: any = await import("/src/plugins/mesure-hors-fil.ts");

    // Entrée déterministe, comme celle du banc : un générateur congruentiel, jamais Math.random.
    const frequence = 48000;
    const n = frequence * 3;
    const buf = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: frequence });
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let x = 12345 + c;
      for (let i = 0; i < n; i++) {
        const t = i / frequence;
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        d[i] = 0.35 * Math.sin(2 * Math.PI * (220 + c) * t)
             + 0.15 * Math.sin(2 * Math.PI * 660 * t)
             + (x / 0x7fffffff - 0.5) * 0.06;
      }
    }

    const dansLeFil = mesures.mesurerCopie(buf);
    const horsDuFil = await prise.mesurerCopieHorsFil(buf);
    const ecarts: string[] = [];
    for (const cle of Object.keys(dansLeFil)) {
      const a = dansLeFil[cle], b = horsDuFil[cle];
      // `justesseCents` et `ecartCents` valent NaN sans hauteur tenue, et NaN n'est égal à rien.
      const pareil = (Number.isNaN(a) && Number.isNaN(b)) || a === b;
      if (!pareil) ecarts.push(`${cle} : ${a} → ${b}`);
    }

    // SANS HAUTEUR, CE TEST NE PROUVERAIT RIEN : c'est le seul champ qui traverse l'ouvrier, et une
    // entrée sans hauteur tenue les laisserait tous les deux à zéro, donc égaux pour rien.
    return { champs: Object.keys(dansLeFil).length, ecarts, hauteurHz: dansLeFil.hauteurHz };
  });

  expect(r.ecarts, [
    "La mesure calculée dans un ouvrier diffère de celle du fil.",
    "La fiche technique contredirait donc le verdict d'une épreuve, ce que les deux notices nient.",
  ].join("\n")).toEqual([]);
  expect(r.champs, "la mesure a perdu des champs").toBeGreaterThan(14);
  expect(r.hauteurHz, "l'entrée d'essai n'a pas de hauteur tenue : le test ne prouverait rien")
    .toBeGreaterThan(100);
});
