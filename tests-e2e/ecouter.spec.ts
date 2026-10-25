// tests-e2e/ecouter.spec.ts — ÉCOUTER : le verbe qui rend un SON, et non un texte de plus.
//
// POURQUOI CE VERBE EXISTE, ET C'EST FABIEN QUI L'A NOMMÉ. « Le but de ce logiciel n'est pas de
// produire des graphes mais des sons. » Or les quatre verbes du pilote rendent tous du TEXTE :
// `décrire` projette le registre, `valider` refuse un graphe, `mesurer` rend des millisecondes et
// une empreinte, `comparer` rend un tableau. La seule chose pour laquelle ce logiciel existe est la
// seule qu'aucun verbe ne rendait.
//
// ET LE BANC TENAIT DÉJÀ LE SON. `comparer` exécute huit réverbérations sur la même entrée, en
// relève la sonie, la couleur et la masse — puis JETTE l'audio. Il existait, en mémoire, le temps
// d'un relevé. Entre « le banc tient le son » et « on l'entend », il n'y avait qu'une écriture de
// fichier : `bufferVersWavBlob` est dans le dépôt depuis toujours.
//
//   COMPOSANT=reverbe-hachee npm run ecouter
//   FAMILLE=Écho npm run ecouter
//   COMPOSANTS=distorsion,bitcrusher,exciter PARAMETRES='{"Mix":100}' npm run ecouter
//
// LE SON D'ESSAI PART AVEC, sous le nom `_entree.wav`. On ne juge pas un effet sans entendre ce qui
// y est entré : une réverbération sur un son qu'on n'a jamais entendu sec ne dit rien, et deux
// effets ne se comparent que sur la même matière.
//
// CHAQUE SORTIE PORTE SON RANG, toujours, même quand il n'y en a qu'une. Une règle qui ne suffixe
// qu'au-delà de la première aurait un cas particulier, donc un jour un écrasement silencieux : on
// écouterait la seconde sortie en croyant tenir la première. Le piège est supprimé, pas gardé.
//
// CE QU'IL NE FAIT PAS : juger. Il rend des sons et leur crête ; c'est l'oreille qui décide.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { DUREE_SEC, FREQUENCE, mesurerComposant } from "./banc-mesure";
import { serveurDeVerification } from "./serveur-de-developpement";
import { FAMILLES_EFFETS } from "../src/plugins/familles-palette";

const devUrl = serveurDeVerification(5239);

const COMPOSANT = process.env.COMPOSANT ?? "";
const FAMILLE = process.env.FAMILLE ?? "";
const COMPOSANTS = process.env.COMPOSANTS ? process.env.COMPOSANTS.split(",").map((s) => s.trim()).filter(Boolean) : [];
const PARAMETRES = process.env.PARAMETRES ? JSON.parse(process.env.PARAMETRES) : {};
const ENTREES = process.env.ENTREES ? process.env.ENTREES.split(",").map((s) => Number(s.trim())) : undefined;

/** Le répertoire des écoutes. Ignoré par git : un son se rejoue, il ne se garde pas. */
const DOSSIER = "ECOUTE";

/**
 * Un nom de fichier sûr, et les accents se TRANSLITÈRENT au lieu de disparaître.
 *
 * Un premier jet remplaçait tout ce qui n'est pas ASCII par un tiret : la famille « Écho » rendait
 * un dossier nommé `-cho`, et « Réverbération » aurait rendu `R-verb-ration`. Un nom de dossier
 * illisible n'empêche rien de fonctionner, ce qui est exactement pourquoi il serait resté.
 */
const sain = (s: string) => s
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .replace(/^-+|-+$/g, "");

test.describe("ecouter", () => {
  test.setTimeout(1_800_000);

  test("un composant, une famille, et le son d'essai avec", async ({ page }) => {
    const membres = COMPOSANTS.length > 0 ? COMPOSANTS
      : FAMILLE ? FAMILLES_EFFETS[FAMILLE]
      : COMPOSANT ? [COMPOSANT] : undefined;
    // SANS RIEN DE DÉSIGNÉ, CE CAS N'A RIEN À FAIRE ENTENDRE : c'est un guichet, pas un garde, et il
    // traverse donc une passe complète sans la déranger — comme `mesurer` et `comparer`.
    test.skip(!membres, "aucun COMPOSANT, FAMILLE ni COMPOSANTS : ce spec est un guichet, pas un garde.");

    expect(membres, [
      "",
      `Famille « ${FAMILLE} » inconnue. Les familles declarees :`,
      ...Object.keys(FAMILLES_EFFETS).map((f) => `  ${f}`),
      "",
    ].join("\n")).toBeTruthy();

    // ON REPART D'UN DOSSIER VIDE. Un fichier d'une passe précédente qui survivrait à un composant
    // devenu muet serait écouté comme s'il venait d'être rendu — la pire façon de se tromper ici,
    // puisque rien dans le son ne dirait sa date.
    const racine = FAMILLE && COMPOSANTS.length === 0 ? join(DOSSIER, sain(FAMILLE)) : DOSSIER;
    rmSync(racine, { recursive: true, force: true });
    mkdirSync(racine, { recursive: true });

    const lignes: string[] = [
      `son d'essai : ${DUREE_SEC} s a ${FREQUENCE} Hz, deux canaux, deterministe`,
      `reglages : ${Object.keys(PARAMETRES).length ? JSON.stringify(PARAMETRES) : "ceux de chaque composant"}`,
      "",
    ];
    let entreeEcrite = false;
    const muets: string[] = [];
    const fautifs: string[] = [];

    for (const id of membres!) {
      const m = await mesurerComposant(page, devUrl, id, {
        parametres: PARAMETRES, entreesAudio: ENTREES, wav: true,
      });
      if (m.erreur) { fautifs.push(`${id} : ${m.erreur}`); continue; }
      let rendus = 0;
      for (const w of m.wavs) {
        if (w.rang === -1) {
          if (entreeEcrite) continue;
          writeFileSync(join(DOSSIER, "_entree.wav"), Buffer.from(w.base64, "base64"));
          entreeEcrite = true;
          lignes.push(`_entree.wav            ${w.secondes.toFixed(2)} s  crete ${w.crete.toFixed(3)}`);
          continue;
        }
        const nom = `${sain(id)}-${w.rang}.wav`;
        writeFileSync(join(racine, nom), Buffer.from(w.base64, "base64"));
        rendus++;
        lignes.push(`${nom.padEnd(42)} ${w.secondes.toFixed(2)} s  crete ${w.crete.toFixed(3)}`
          + (m.message ? `  · ${m.message.slice(0, 60)}` : ""));
      }
      if (rendus === 0) muets.push(id);
    }

    if (muets.length) lignes.push("", "AUCUNE SORTIE AUDIO, rien a ecouter :", ...muets.map((i) => `  ${i}`));
    if (fautifs.length) lignes.push("", "EN ERREUR :", ...fautifs.map((f) => `  ${f}`));
    const rapport = lignes.join("\n");
    writeFileSync(join(DOSSIER, "ecoute.txt"), `${rapport}\n`, "utf8");
    console.log(`\n${rapport}\n\nles fichiers sont dans ${racine}/\n`);

    // LE VERDICT NE PORTE QUE SUR CE QUI A LEVÉ, jamais sur ce qu'on a entendu : écouter n'est pas
    // juger. Un composant sans sortie audio n'est pas une faute, c'est une information.
    expect(fautifs, ["", "CE N'EST PAS LE DEPOT QUI EST EN FAUTE, C'EST LE COMPOSANT.", "", rapport, ""].join("\n"))
      .toEqual([]);
  });
});
