// tests-e2e/catalogue-sonore.spec.ts — CATALOGUE : les 367 composants qui rendent de l'audio, entendus.
//
// POURQUOI CE CATALOGUE EXISTE, ET C'EST FABIEN QUI A POSÉ LA QUESTION. « Le but de ce logiciel
// n'est pas de produire des graphes mais des sons. » Les six verbes rendent du son à la demande,
// un composant ou un graphe à la fois ; mais pour savoir CE QUE FAIT un composant qu'on n'a jamais
// employé, il faut encore le poser, le câbler et le lancer. Cinq cents composants, c'est cinq cents
// fois ce geste.
//
// CE QU'IL REND : un clip par sortie audio de chaque composant, tous sur LE MÊME SON, plus ce son
// seul sous `_reference.wav`. On ne juge pas un effet sans entendre ce qui y est entré.
//
//   CATALOGUE=1 npm run catalogue
//   CATALOGUE=1 COMPOSANTS=reverbe-hachee,distorsion npm run catalogue
//   CATALOGUE=1 SON=un/autre/son.wav npm run catalogue
//
// ═══ LES QUATRE DÉCISIONS QUI LE DÉFINISSENT, ET ELLES SONT DE FABIEN ═══
//
// 1. LE SON DE RÉFÉRENCE EST UN FICHIER, `son-de-reference.wav`, et non le son d'essai du banc.
//    Celui-ci est fait pour MESURER — trois secondes de deux sinus et d'un filet de bruit, le même
//    à la neuvième décimale — et une réverbération sur deux sinus ne dit rien à l'oreille. Les deux
//    sons coexistent, chacun pour son office, et le son d'essai reste le défaut du banc : aucune
//    des soixante-douze empreintes ne bouge.
//
//    MESURÉ SUR CE FICHIER, ET IL FAUT LE SAVOIR : 2,000 s, 24 bits, stéréo, 24 000 Hz, crête à
//    −10,93 dB, efficace à −28,23 dB, sans écrêtage. À 24 kHz d'échantillonnage, SON PLAFOND EST À
//    12 kHz : tout composant qui agit dans l'octave du haut — exciteurs, correcteurs d'air,
//    étagères aiguës — ne montrera rien ici. Ce n'est pas un défaut du son, c'est le périmètre du
//    catalogue, et il vaut mieux l'écrire que de le découvrir en écoutant.
//
// 2. LES CLIPS SONT EN 32 BITS FLOTTANTS STÉRÉO, ce qu'`exécuter` écrit déjà : rien n'est arrondi,
//    le clip porte le tampon rendu et non sa quantification.
//
// 3. CHAQUE CLIP EST BORNÉ À SIX SECONDES, parce qu'une sortie ne fait pas la durée de son entrée.
//    Mesuré sur `canon-de-proportions` : deux secondes à l'entrée, des aperçus de cinquante-quatre.
//    Sans borne, un catalogue de 367 clips est de taille indéterminée. Le relevé dit toujours LES
//    DEUX durées, celle qu'on entend et celle qui a été rendue.
//
// 4. LE SON EST RÉÉCHANTILLONNÉ À 48 kHz par le banc. Sans cela un composant qui hérite du taux de
//    son entrée rendrait un clip à 24 kHz pendant qu'un composant qui impose le sien en rendrait un
//    à 48, et deux clips voisins ne se compareraient plus.
//
// ═══ CE QU'IL N'EST PAS ═══
//
// CE N'EST PAS UN GARDE, et il ne refuse rien de ce qu'il entend. Il ne tombe que si l'INSTRUMENT
// est cassé — aucun clip produit du tout —, parce qu'un composant qui ne peut pas tourner ici n'est
// pas une faute : le séparateur demande un modèle qu'un poste neuf n'a pas, et sept composants
// demandent l'application de bureau. Le relevé le dit, nœud par nœud, et c'est tout ce qu'on peut
// honnêtement en faire.
//
// LA LISTE DES COMPOSANTS VIENT DU REGISTRE, jamais d'une liste écrite à côté : un composant neuf
// entre dans le catalogue sans que personne y pense.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import { mesurerComposant } from "./banc-mesure";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5242);
const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, "..");

/** Le répertoire du catalogue. Ignoré par git : 367 clips se refont, ils ne se versionnent pas. */
const DOSSIER = "CATALOGUE";

/** La borne de chaque clip, en secondes — décision de Fabien, voir l'en-tête. */
const BORNE_SEC = 6;

const DEMANDE = process.env.CATALOGUE === "1";
const COMPOSANTS = process.env.COMPOSANTS
  ? process.env.COMPOSANTS.split(",").map((s) => s.trim()).filter(Boolean) : [];
const SON = process.env.SON ?? join(ICI, "son-de-reference.wav");

/**
 * Un nom de fichier sûr, et les accents se TRANSLITÈRENT au lieu de disparaître.
 *
 * La même règle qu'`écouter` et qu'`exécuter`, et elle y a été payée : remplacer tout ce qui n'est
 * pas ASCII par un tiret rendait `-cho` pour « Écho ».
 */
const sain = (s: string) => s
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .replace(/^-+|-+$/g, "");

interface Entree {
  id: string;
  nom: string;
  famille: string | null;
  univers: string | null;
  /** Un fichier par sortie audio, avec ce qu'on entend et ce qui a été rendu. */
  clips: { fichier: string; rang: number; secondesEntendues: number; secondesRendues: number; crete: number }[];
  message: string | null;
  erreur: string | null;
  ms: number;
  /** Les valeurs rendues qui ne correspondent pas au type de leur port. Voir `core/types-au-port.ts`. */
  ecartsType: { rang: number; port: string; attendu: string; recu: string }[];
}

test.describe("catalogue", () => {
  // Trois cent soixante-sept composants, une page neuve par composant : cela se compte en dizaines
  // de minutes. C'est un verbe qu'on lance, comme la base des empreintes.
  test.setTimeout(10_800_000);

  test("chaque composant qui rend de l'audio est entendu sur le meme son", async ({ page }) => {
    // SANS `CATALOGUE=1`, CE CAS NE FAIT RIEN : c'est un guichet, pas un garde, et il traverse donc
    // une passe complète sans la déranger — comme `mesurer`, `comparer`, `écouter` et `exécuter`.
    test.skip(!DEMANDE, "CATALOGUE=1 absent : ce spec est un guichet, et il coûte des dizaines de minutes.");

    // ─── LE SON DE RÉFÉRENCE, LU UNE FOIS ET DÉCRIT DANS LE RELEVÉ ───
    const octetsSon = readFileSync(SON);
    const sourceWav = octetsSon.toString("base64");

    // ─── LA LISTE VIENT DU REGISTRE ───
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 15000 });
    const fiches = await page.evaluate(async () => {
      const idx = await import("/src/plugins/index.ts") as unknown as {
        toutesLesFiches: { id: string; nom: string; famille?: string; univers?: string;
          sorties?: { type: string }[] }[];
      };
      return idx.toutesLesFiches
        .filter((f) => (f.sorties ?? []).some((s) => s.type === "audio"))
        .map((f) => ({ id: f.id, nom: f.nom, famille: f.famille ?? null, univers: f.univers ?? null }))
        .sort((a, b) => a.id.localeCompare(b.id));
    });

    const aFaire = COMPOSANTS.length > 0 ? fiches.filter((f) => COMPOSANTS.includes(f.id)) : fiches;
    expect(aFaire.length, [
      "Aucun composant à cataloguer.",
      COMPOSANTS.length > 0 ? `COMPOSANTS ne nomme rien du registre : ${COMPOSANTS.join(", ")}` : "",
    ].join("\n")).toBeGreaterThan(0);

    // ON REPART D'UN DOSSIER VIDE. Un clip d'une passe précédente qui survivrait à un composant
    // devenu muet serait écouté comme s'il venait d'être rendu, et rien dans le son ne dirait sa
    // date — c'est la pire façon de se tromper ici.
    rmSync(DOSSIER, { recursive: true, force: true });
    mkdirSync(DOSSIER, { recursive: true });

    const entrees: Entree[] = [];
    let referenceEcrite = false;
    let clipsEcrits = 0;

    for (const [i, f] of aFaire.entries()) {
      const m = await mesurerComposant(page, devUrl, f.id, {
        wav: true, sourceWav, wavMaxSec: BORNE_SEC, wavBits: 32,
      });
      const e: Entree = {
        id: f.id, nom: f.nom, famille: f.famille, univers: f.univers,
        clips: [], message: m.message, erreur: m.erreur, ms: Math.round(m.ms),
        // CE QUE LE COMPOSANT PROMET SUR SES PORTS, ET CE QU IL REND. Le catalogue est le site a
        // plus haute valeur pour cette question : il parcourt les composants UN PAR UN, la ou le
        // moteur ne voit que ceux posés dans un graphe. Point 6 d une revue du dépôt.
        ecartsType: m.ecartsType,
      };
      for (const w of m.wavs) {
        // LE RANG −1 EST LE SON DE RÉFÉRENCE, et il s'écrit UNE SEULE FOIS : le banc le rend à
        // chaque mesure, et l'écrire 367 fois coûterait 367 copies du même fichier.
        if (w.rang === -1) {
          if (referenceEcrite) continue;
          writeFileSync(join(DOSSIER, "_reference.wav"), Buffer.from(w.base64, "base64"));
          referenceEcrite = true;
          continue;
        }
        const nom = `${sain(f.id)}-${w.rang}.wav`;
        writeFileSync(join(DOSSIER, nom), Buffer.from(w.base64, "base64"));
        clipsEcrits++;
        e.clips.push({
          fichier: nom, rang: w.rang,
          secondesEntendues: Number(w.secondes.toFixed(3)),
          // CE QUE LE COMPOSANT A VRAIMENT RENDU, et non ce qu'on en garde. Un premier jet reportait
          // ici la durée du FICHIER sous ce nom-là : une sortie bornée se serait annoncée entière, et
          // l'on aurait cru qu'un composant rend six secondes quand il en rend cinquante-quatre. Le
          // banc porte désormais les deux durées, et c'est pour cela qu'il les porte.
          secondesRendues: Number(w.secondesRendues.toFixed(3)),
          crete: Number(w.crete.toFixed(6)),
        });
      }
      entrees.push(e);
      if ((i + 1) % 25 === 0 || i + 1 === aFaire.length) {
        console.log(`${i + 1}/${aFaire.length} · ${clipsEcrits} clip(s) · dernier : ${f.id}`);
      }
    }

    // ─── LE RELEVÉ ───
    const muets = entrees.filter((e) => e.clips.length === 0 && !e.erreur);
    const fautifs = entrees.filter((e) => e.erreur);
    const manifeste = {
      sonDeReference: {
        fichier: SON.replace(/\\/g, "/").split("/").pop(),
        octets: octetsSon.length,
        // Ce que la mesure a dit de ce fichier, écrit ici pour qu'un catalogue se rattache à son
        // entrée : deux catalogues faits sur deux sons ne se comparent pas.
        decrit: "2,000 s · 24 bits · stéréo · 24 000 Hz · crête −10,93 dB · efficace −28,23 dB",
        plafondHz: 12000,
      },
      borneSec: BORNE_SEC,
      profondeur: "32 bits flottants, le format qu'écrit le dépôt",
      composants: entrees.length,
      clips: clipsEcrits,
      muets: muets.map((e) => e.id),
      enErreur: Object.fromEntries(fautifs.map((e) => [e.id, e.erreur])),
      // CE QUI MENT SUR SON PORT, par composant. Une liste vide est le relevé qu'on espère, et elle
      // vaut comme mesure : elle dit que les prédicats déclarés ne crient sur personne.
      ecartsDeType: Object.fromEntries(entrees.filter((e) => e.ecartsType?.length)
        .map((e) => [e.id, e.ecartsType])),
      entrees,
    };
    writeFileSync(join(DOSSIER, "catalogue.json"), `${JSON.stringify(manifeste, null, 2)}\n`, "utf8");

    const resume = [
      "",
      `son de référence : ${manifeste.sonDeReference.decrit}`,
      `composants       : ${entrees.length}`,
      `clips écrits     : ${clipsEcrits}, bornés à ${BORNE_SEC} s`,
      `sans sortie audio: ${muets.length}`,
      `en erreur        : ${fautifs.length}`,
      "",
    ].join("\n");
    if (fautifs.length) {
      console.log(["EN ERREUR :", ...fautifs.map((e) => `  ${e.id} : ${e.erreur?.slice(0, 110)}`)].join("\n"));
    }
    if (muets.length) {
      console.log(["AUCUNE SORTIE AUDIO, rien à entendre :", ...muets.map((e) => `  ${e.id}`)].join("\n"));
    }
    console.log(`${resume}les fichiers sont dans ${DOSSIER}/\n`);

    // LE VERDICT NE PORTE QUE SUR L'INSTRUMENT, jamais sur ce qu'on a entendu. Un composant qui ne
    // peut pas tourner ici n'est pas une faute : il demande un modèle qu'un poste neuf n'a pas, ou
    // l'application de bureau. Mais si AUCUN clip n'est sorti, c'est le catalogue qui est cassé.
    expect(clipsEcrits, [
      "", "AUCUN CLIP N'A ÉTÉ ÉCRIT. Ce n'est pas un composant qui est en cause, c'est l'instrument.",
      resume,
    ].join("\n")).toBeGreaterThan(0);
  });
});
