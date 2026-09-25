// docs/generer-inventaire-ui.test.ts — INTERFACE.md : sa régénération, et sa vérification.
//
// Même dispositif que COMPONENTS.md, pour la même raison : un fichier versionné qui dérive de la
// source ne vaut que si quelque chose le tient à jour. `npm run docs:interface` le réécrit ;
// la suite échoue tant qu'il n'a pas été versionné.
//
// CE QUE CE TEST PROTÈGE. Pas l'exactitude d'un affichage — aucun test hors navigateur ne peut la
// juger. Il protège la VISIBILITÉ : qu'on ne puisse pas changer la vue, la taille ou le lecteur
// d'un composant sans qu'une ligne le dise. L'échec cite le premier écart, donc le premier
// composant touché.
import "node-web-audio-api/polyfill.js";
import { it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toutesLesFiches } from "../plugins/index";
import "../audio/adaptateur";
import { genererInventaireMarkdown, inventorier, listePourBalayage } from "./inventaire-ui";

const CHEMIN = join(process.cwd(), "INTERFACE.md");
const CHEMIN_BALAYAGE = join(process.cwd(), "tests-e2e", "composants-vues.json");
const ecrire = process.env.ECRIRE_INVENTAIRE === "1";

/** Le JSON que le balayage navigateur consomme, écrit et vérifié comme INTERFACE.md. */
const listeBalayage = () => `${JSON.stringify(listePourBalayage(toutesLesFiches as any), null, 2)}\n`;

it.skipIf(!ecrire)("écrit INTERFACE.md et la liste du balayage", () => {
  const md = genererInventaireMarkdown(toutesLesFiches as any);
  writeFileSync(CHEMIN, md);
  writeFileSync(CHEMIN_BALAYAGE, listeBalayage());
  console.log(`INTERFACE.md : ${toutesLesFiches.length} composants, ${md.split("\n").length} lignes.`);
});

it.skipIf(ecrire)("la liste du balayage navigateur correspond au registre", () => {
  expect(existsSync(CHEMIN_BALAYAGE),
    "tests-e2e/composants-vues.json est absent : lancez « npm run docs:interface »").toBe(true);
  const actuel = readFileSync(CHEMIN_BALAYAGE, "utf8").replace(/\r\n/g, "\n");
  expect(actuel,
    "La liste des composants habillés d'une vue a changé : lancez « npm run docs:interface » et versionnez.")
    .toBe(listeBalayage());
});

it.skipIf(ecrire)("INTERFACE.md correspond aux tables d'affichage", () => {
  expect(existsSync(CHEMIN), "INTERFACE.md est absent : lancez « npm run docs:interface »").toBe(true);
  const actuel = readFileSync(CHEMIN, "utf8").replace(/\r\n/g, "\n").split("\n");
  const attendu = genererInventaireMarkdown(toutesLesFiches as any).split("\n");
  const n = Math.max(actuel.length, attendu.length);
  let ecart: string | null = null;
  for (let k = 0; k < n; k++) {
    if (actuel[k] !== attendu[k]) {
      ecart = `ligne ${k + 1} — dans le fichier : ${(actuel[k] ?? "(fin)").slice(0, 140)} — attendu : ${(attendu[k] ?? "(fin)").slice(0, 140)}`;
      break;
    }
  }
  expect(ecart, [
    "INTERFACE.md n'est plus à jour : un composant a changé d'habillage.",
    "Regardez QUEL composant, et si ce changement était voulu — c'est la question que ce fichier existe pour poser.",
    "Puis lancez « npm run docs:interface » et versionnez le résultat.",
  ].join("\n")).toBeNull();
});

// LE LECTEUR GÉNÉRIQUE N'EST RETIRÉ QUE SI UNE VUE DÉCLARE PORTER LE SIEN, par `porteLecteur`
// dans le registre des vues. La règle se lisait auparavant sur la seule présence d'une vue
// « avant », au motif qu'une vue custom gère l'audio : c'était faux pour la plupart d'entre elles,
// et huit générateurs rendaient un son que rien ne permettait d'écouter dans le composant.
//
// La liste ci-dessous est celle des composants qui déclarent porter leur lecteur. Un nouveau venu
// fait échouer ce test : il faut alors vérifier dans la source que sa vue rend bien une balise
// `audio`, et l'inscrire ici en connaissance de cause.
const SANS_LECTEUR_GENERIQUE_ET_SORTIE_AUDIO = [
  // Ces vues DECLARENT porter un moyen d'ecouter, par `porteLecteur` dans le registre des vues.
  // Verifie dans la source : chacune rend une balise `audio`.
  "cercle-pulsant", "entree-audio", "explorateur-musique", "sampler-personnalise",
];

it.skipIf(ecrire)("aucun composant ne perd son lecteur audio sans qu'on l'ait vu", () => {
  const releve = inventorier(toutesLesFiches as any)
    .filter((l) => !l.lecteurGenerique && l.vueAvant !== "—")
    .filter((l) => {
      const f = (toutesLesFiches as any[]).find((x) => x.id === l.id);
      return (f?.sorties ?? []).some((s: any) => s.type === "audio");
    })
    .map((l) => l.id).sort();
  const nouveaux = releve.filter((id) => !SANS_LECTEUR_GENERIQUE_ET_SORTIE_AUDIO.includes(id));
  const partis = SANS_LECTEUR_GENERIQUE_ET_SORTIE_AUDIO.filter((id) => !releve.includes(id));
  expect({ nouveaux, partis }, [
    "La liste des composants dont la vue masque le lecteur audio a changé.",
    "NOUVEAUX : leur vue doit donner un moyen d'écouter, sinon leur son est inaudible dans le nœud.",
    "PARTIS : un composant a retrouvé son lecteur, ou perdu sa sortie audio — mettez la liste à jour.",
  ].join("\n")).toEqual({ nouveaux: [], partis: [] });
});
