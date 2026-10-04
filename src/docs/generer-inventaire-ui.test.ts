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
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toutesLesFiches } from "../plugins";
// Le shell demande son registre au lieu de l'importer : ce test exerce `vues-domaine/vues.tsx`, il
// doit donc en déposer un, comme le fait la racine de composition.
import { registre } from "../audio/adaptateur";
import { configurerRegistreUI, type RegistreUI } from "../ui/registre-actif";

configurerRegistreUI(registre as unknown as RegistreUI);
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
  // Le montage et la maquette depuis que leur ligne de temps a quitté l'inspecteur : elle porte son
  // `<audio>` caché, ses boutons, et la tête de lecture qui suit la musique sur le dessin. Deux jeux
  // de commandes pour un même son se contrediraient, et la tête ne saurait lequel suivre. Comme le
  // lecteur générique, elle ne paraît qu'une fois le graphe exécuté, faute de son à écouter avant.
  "maquette", "montage",
  // Le sélecteur multi-zones, dont l'onde porte son `<audio>` caché, son bouton, son compteur et sa
  // tête de lecture. On y cherche un instant en cliquant le dessin, là où se tracent les zones.
  "selecteur-multi-zones",
];

// ET L'AUTRE SENS : UNE VUE QUI PORTE DÉJÀ UN LECTEUR DOIT LE DÉCLARER — relevé par Fabien : « le
// sélecteur multizone a un deuxième lecteur, le sien, et un lecteur classique supplémentaire ». Le
// cas ci-dessus garde le sens dangereux, un son devenu inaudible ; celui-ci garde le sens visible,
// deux jeux de commandes pour un même son. Les deux sont la même règle, lue dans ses deux sens, et
// rien ne tenait le second : `porteLecteur` était une déclaration que personne ne confrontait au
// rendu.
//
// LE FAIT SE CHERCHE DANS LA SOURCE, ET C'EST UNE FORME : la vue rend-elle une balise `audio`,
// directement ou par un composant qu'elle rend ? Une liste de noms se serait oubliée au premier
// ajouté — c'est exactement ce qui vient d'arriver.
//
// LE FILTRE EST CELUI DU CAS VOISIN, la sortie audio du composant, et il n'est pas décoratif : le
// « Lecteur musique » rend un `<audio>` sans avoir ni entrée ni sortie. Le sien joue un dossier du
// disque, jamais un résultat, donc aucun lecteur générique ne vient s'y ajouter.
const UI = join(process.cwd(), "src", "vues-domaine");

/** Le corps d'une fonction exportée, jusqu'au prochain export. */
function corpsDe(nom: string, sources: Map<string, string>): string | null {
  for (const src of sources.values()) {
    const i = src.indexOf(`export function ${nom}(`);
    if (i < 0) continue;
    const suite = src.slice(i + 1);
    const j = suite.indexOf("\nexport ");
    return j < 0 ? suite : suite.slice(0, j);
  }
  return null;
}

/** Cette vue rend-elle une balise `audio`, directement ou par un composant qu'elle rend ? */
function rendUnAudio(nom: string, sources: Map<string, string>, vus = new Set<string>()): boolean {
  if (vus.has(nom)) return false;
  vus.add(nom);
  const corps = corpsDe(nom, sources);
  if (corps === null) return false;
  if (/<audio\b/.test(corps)) return true;
  for (const m of corps.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)) {
    if (rendUnAudio(m[1], sources, vus)) return true;
  }
  return false;
}

it.skipIf(ecrire)("UNE VUE QUI REND SON PROPRE LECTEUR LE DÉCLARE, sinon le nœud en montre deux", () => {
  const sources = new Map<string, string>();
  const parcourir = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) parcourir(p);
      else if (/\.tsx?$/.test(e.name)) sources.set(p, readFileSync(p, "utf8"));
    }
  };
  parcourir(UI);

  // Le registre se relit dans sa source : son type ne sort pas du module, et c'est la LIGNE qui
  // porte à la fois la vue et la déclaration.
  const registre = readFileSync(join(UI, "vues.tsx"), "utf8");
  const aSortieAudio = (id: string) =>
    ((toutesLesFiches as any[]).find((f) => f.id === id)?.sorties ?? [])
      .some((s: any) => s.type === "audio");

  const muets: string[] = [];
  for (const ligne of registre.split("\n")) {
    const m = ligne.match(/correspond:\s*parId\(([^)]*)\).*?vue:\s*([A-Za-z0-9_]+)/);
    if (!m || /porteLecteur:\s*true/.test(ligne)) continue;
    if (!rendUnAudio(m[2], sources)) continue;
    for (const id of m[1].split(",").map((s) => s.trim().replace(/"/g, ""))) {
      if (aSortieAudio(id)) muets.push(`${id} (${m[2]})`);
    }
  }
  expect(muets.sort(), [
    "Ces vues rendent leur propre lecteur sans le déclarer : le nœud en montrera DEUX.",
    "Posez « porteLecteur: true » sur leur entrée du registre, dans src/vues-domaine/vues.tsx.",
    "Si les deux lecteurs sont voulus — deux sons différents à comparer —, dites-le en commentaire ici.",
  ].join("\n")).toEqual([]);
});

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
