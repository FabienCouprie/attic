// tests-e2e/mesurer.spec.ts — MESURER : le troisième verbe, et le banc enfin joignable.
//
// POURQUOI CE GUICHET, ET C'EST `AGENTS.md` QUI LE RÉCLAME SANS LE FOURNIR. Il écrit, à propos du
// banc de mesure : « **Ne pas improviser un script de mesure : employer ce banc.** » Or le banc
// n'avait qu'un seul appelant, `empreintes.spec.ts`, qui est UN cas unique parcourant les
// soixante-douze composants surveillés et COMPARANT leurs empreintes à une base. Rien ne permettait
// de mesurer UN composant et de lire ce qu'il fait.
//
// CE QUE CELA COÛTAIT, ET C'EST MESURÉ : 745 graphes semés à la main dans le navigateur sur les
// cinq transcriptions de ce projet, 5 334 appels de JavaScript, aucun tenu par un garde. Chacun
// réécrivait, de zéro, ce que le banc fait déjà mieux — et le banc porte cinq précautions nées de
// trois mesures fausses que j'ai publiées.
//
//   COMPOSANT=echo-ping-pong npm run mesurer
//   COMPOSANT=reverbe-convolution PARAMETRES='{"Mix":50}' npm run mesurer
//
// LE CODE DE SORTIE PORTE LE VERDICT, comme pour « valider » : une fiche inconnue ou un composant
// qui lève font échouer la passe, et le message dit que c'est le COMPOSANT qui est en cause, non le
// dépôt. Sans cela, aucun script ne pourrait s'en servir.
//
// CE QU'IL NE FAIT PAS. Il mesure UN composant nourri d'un son d'essai déterministe, pas un graphe
// câblé : le banc est fait pour cela, et prétendre l'inverse donnerait des chiffres qui ne veulent
// rien dire. Exécuter un graphe entier reste à faire.
import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

import { DUREE_SEC, FREQUENCE, mesurerComposant } from "./banc-mesure";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5237);

/** Ce que la ligne de commande passe, lu une fois. */
const COMPOSANT = process.env.COMPOSANT ?? "";
const PARAMETRES = process.env.PARAMETRES ? JSON.parse(process.env.PARAMETRES) : {};
const MARQUEURS = process.env.MARQUEURS ? process.env.MARQUEURS.split(",").map((s) => s.trim()) : [];
const ENTREES = process.env.ENTREES ? process.env.ENTREES.split(",").map((s) => Number(s.trim())) : undefined;

/** La mesure en texte, telle qu'on veut la lire sur une console. */
function enTexte(id: string, m: Awaited<ReturnType<typeof mesurerComposant>>): string {
  const lignes = [
    `${id}`,
    `  entrée d'essai : ${DUREE_SEC} s à ${FREQUENCE} Hz, deux canaux, déterministe`,
    `  durée          : ${m.ms} ms`,
    // UN GEL NUL ET UN GEL TOTAL NE SE CONFONDENT PAS, et c'est la troisième précaution du banc :
    // zéro message veut dire que le fil n'a jamais pu tourner.
    `  gel du fil     : ${m.gelMs === null ? "TOTAL (aucun message passé)" : `${m.gelMs} ms`}`
    + ` · ${m.messages} message(s)`,
    `  message du nœud: ${m.message ?? "(aucun)"}`,
  ];
  m.empreintes.forEach((e, rang) => {
    lignes.push(`  sortie ${rang}       : ${e ?? "(non audio)"}`);
  });
  for (const [marqueur, trouve] of Object.entries(m.version)) {
    lignes.push(`  marqueur « ${marqueur} » : ${trouve ? "présent" : "ABSENT"}`);
  }
  if (m.erreur) lignes.push(`  ERREUR         : ${m.erreur}`);
  return lignes.join("\n");
}

test.describe("mesurer", () => {
  test.setTimeout(300_000);

  test("un composant, sur le banc, avec ses cinq précautions", async ({ page }) => {
    // SANS COMPOSANT DÉSIGNÉ, CE CAS N'A RIEN À MESURER : c'est le guichet, pas un garde. Il passe
    // donc en silence quand la passe complète le rencontre.
    test.skip(!COMPOSANT, "aucun COMPOSANT désigné : ce spec est un guichet, pas un garde.");

    const m = await mesurerComposant(page, devUrl, COMPOSANT, {
      marqueurs: MARQUEURS, parametres: PARAMETRES, entreesAudio: ENTREES,
    });
    const rapport = enTexte(COMPOSANT, m);
    // LE RAPPORT S'ÉCRIT AVANT LE VERDICT : un refus l'interrompt, et c'est justement le cas où
    // l'on veut relire le détail sur le disque.
    writeFileSync("MESURE.txt", `${rapport}\n`, "utf8");
    console.log(`\n${rapport}\n`);

    expect(m.erreur, [
      "", "", "CE N'EST PAS LE DÉPÔT QUI EST EN FAUTE, C'EST LE COMPOSANT MESURÉ.", "",
      rapport, "",
    ].join("\n")).toBeNull();
  });
});
