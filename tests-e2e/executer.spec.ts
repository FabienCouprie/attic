// tests-e2e/executer.spec.ts — EXÉCUTER : le verbe qui LANCE un graphe, et rend ce qu'on entend.
//
// CE QUI MANQUAIT, ET POURQUOI C'EST LE DERNIER DES SIX. Les cinq autres verbes voient un composant
// ou un registre : `décrire` projette le catalogue, `valider` refuse un graphe sans le lancer,
// `mesurer` et `comparer` éprouvent un composant SEUL sur un banc, `écouter` en rend le son. Aucun
// ne regardait un graphe CÂBLÉ en train de tourner — et c'est là que vivent les défauts qu'aucun
// composant isolé ne porte.
//
// LE DÉFAUT FONDATEUR EN EST UN. Les cent trente cents de « Étaler sur le clavier » naissaient de la
// RENCONTRE de deux chemins de construction de banque, dont chacun, pris seul, était juste.
//
// ET IL FERME LA BOUCLE DU PILOTE. Jusqu'ici je pouvais proposer un graphe, le poser sur le canevas,
// et attendre que Fabien presse Lancer pour savoir s'il sonnait. Je peux maintenant le lancer
// moi-même et rendre le son avec la proposition.
//
//   GRAPHE=un-son-projete-en-microtonal npm run executer
//   GRAPHE=exemples/canon-de-proportions.json npm run executer
//   GRAPHE=C:/un/graphe/a/moi.json npm run executer
//
// IL RAPPORTE TOUS LES NŒUDS, pas seulement ceux qui ont levé. Un nœud « Terminé » qui ne fait rien
// entendre est une information, souvent la plus utile : c'est le symptôme d'un câble oublié ou d'une
// entrée vide, et un rapport qui ne listerait que les erreurs le tairait.
//
// CE QU'IL NE FAIT PAS : juger le son. Le verdict ne porte que sur ce qui a LEVÉ — même règle
// qu'`écouter`, pour la même raison : c'est l'oreille qui décide, et elle a maintenant les fichiers.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import { apercusEnWav, etatDesNoeuds, semerEtLancer } from "./pilote-graphe";
import { serveurDeVerification } from "./serveur-de-developpement";
import { lireWav } from "../src/audio/empreinte-wav";

const devUrl = serveurDeVerification(5241);
const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, "..");

const GRAPHE = process.env.GRAPHE ?? "";

/** Le répertoire des exécutions. Ignoré par git : un son se rejoue, il ne se garde pas. */
const DOSSIER = "EXECUTION";

/**
 * Un nom de fichier sûr, et les accents se TRANSLITÈRENT au lieu de disparaître.
 *
 * La même règle qu'`écouter`, et elle y a été payée : remplacer tout ce qui n'est pas ASCII par un
 * tiret rendait `-cho` pour « Écho ». Un nom illisible n'empêche rien de fonctionner, ce qui est
 * exactement pourquoi il serait resté.
 */
const sain = (s: string) => s
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .replace(/^-+|-+$/g, "");

/**
 * Où trouver le graphe que l'on a désigné, et les trois formes acceptées.
 *
 * ON NE DEVINE PAS, ET ON NE REPLIE PAS SUR UN EXEMPLE AU HASARD : un nom mal orthographié doit
 * s'arrêter net, non lancer autre chose. Rien n'est plus coûteux qu'un relevé juste sur le mauvais
 * graphe — on y croit, et il ne dit rien du graphe qu'on croyait tenir.
 */
function trouverGraphe(designe: string): { chemin: string; nom: string } | null {
  const candidats = [
    designe,
    join(RACINE, designe),
    join(RACINE, "exemples", designe),
    join(RACINE, "exemples", `${designe}.json`),
  ];
  for (const c of candidats) {
    const p = isAbsolute(c) ? c : resolve(RACINE, c);
    if (existsSync(p) && p.endsWith(".json")) {
      return { chemin: p, nom: sain(p.split(/[/\\]/).pop()!.replace(/\.json$/, "")) };
    }
  }
  return null;
}

/**
 * Quelle fiche porte chaque nœud, lu DANS LE GRAPHE et non dans la page.
 *
 * Le DOM ne porte que l'identifiant de React Flow — `data-id` est le sien. Dans un exemple écrit à
 * la main cet identifiant est parlant (`cloche`, `iso`), mais dans un graphe enregistré par
 * l'application il vaut `dndnode_7`, et un rapport qui n'en dirait pas plus serait illisible là où
 * on en a le plus besoin.
 */
function fichesDuGraphe(json: string): Record<string, string> {
  const g = JSON.parse(json) as { nodes?: { id?: string; data?: { ficheId?: string } }[] };
  const out: Record<string, string> = {};
  for (const n of g.nodes ?? []) if (n.id) out[n.id] = n.data?.ficheId ?? "?";
  return out;
}

test.describe("executer", () => {
  test.setTimeout(900_000);

  test("un graphe est lance, et chaque noeud rend ce qu'il a a rendre", async ({ page }) => {
    // SANS GRAPHE DÉSIGNÉ, CE CAS N'A RIEN À LANCER : c'est un guichet, pas un garde, et il traverse
    // donc une passe complète sans la déranger — comme `mesurer`, `comparer` et `écouter`.
    test.skip(!GRAPHE, "aucun GRAPHE : ce spec est un guichet, pas un garde.");

    const cible = trouverGraphe(GRAPHE);
    expect(cible, [
      "",
      `Aucun graphe trouve pour GRAPHE=${GRAPHE}.`,
      "",
      "Trois formes sont acceptees :",
      "  GRAPHE=un-son-projete-en-microtonal        un exemple, par son nom",
      "  GRAPHE=exemples/canon-de-proportions.json  un chemin dans le depot",
      "  GRAPHE=C:/un/graphe/a/moi.json             un chemin absolu",
      "",
    ].join("\n")).not.toBeNull();

    const json = readFileSync(cible!.chemin, "utf8");
    const fiches = fichesDuGraphe(json);

    // ON REPART D'UN DOSSIER VIDE. Un fichier d'une passe précédente qui survivrait à un nœud devenu
    // muet serait écouté comme s'il venait d'être rendu — la pire façon de se tromper ici, puisque
    // rien dans le son ne dirait sa date.
    const racine = join(DOSSIER, cible!.nom);
    rmSync(racine, { recursive: true, force: true });
    mkdirSync(racine, { recursive: true });

    // LE GRAPHE EST SEMÉ DANS LA LOCALSTORAGE D'UN NAVIGATEUR DE PLAYWRIGHT, jamais dans celle de
    // l'application : le contexte est neuf à chaque cas et meurt avec lui. Le travail en cours de
    // Fabien n'est pas touché.
    const debut = Date.now();
    await semerEtLancer(page, devUrl, json);
    const secondes = (Date.now() - debut) / 1000;

    const etats = await etatDesNoeuds(page);
    const apercus = await apercusEnWav(page);

    // ─── LES FICHIERS ───
    const rangs: Record<string, number> = {};
    const fichiers: { id: string; nom: string; secondes: number; crete: number }[] = [];
    for (const a of apercus) {
      // CHAQUE APERÇU PORTE SON RANG, toujours, même quand le nœud n'en a qu'un. Une règle qui ne
      // suffixerait qu'au-delà du premier aurait un cas particulier, donc un jour un écrasement
      // silencieux : on écouterait le second aperçu en croyant tenir le premier.
      //
      // ET LE RANG SE COMPTE PAR NOM DE FICHIER, non par identifiant. Un premier jet le comptait par
      // identifiant : deux nœuds nommés `mon.son` et `mon-son` s'assainissent en un seul nom, et
      // leurs deux rangs 1 se seraient écrasés — le piège même contre lequel la règle du dessus est
      // écrite, réintroduit deux lignes plus bas.
      const base = sain(a.id);
      const rang = (rangs[base] = (rangs[base] ?? 0) + 1);
      const nom = `${base}-${rang}.wav`;
      const octets = Buffer.from(a.base64, "base64");
      writeFileSync(join(racine, nom), octets);
      // LA MESURE SE FAIT SOUS NODE, par le lecteur du dépôt : c'est précisément pourquoi il a été
      // sorti d'un `page.evaluate` le jour où onze cas sont venus l'éprouver.
      const m = lireWav(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) as ArrayBuffer);
      fichiers.push({ id: a.id, nom, secondes: m.taux > 0 ? m.trames / m.taux : 0, crete: m.crete });
    }

    // ─── LE RAPPORT ───
    const entendus = new Set(apercus.map((a) => a.id));
    const lignes: string[] = [
      `graphe  : ${cible!.chemin}`,
      `noeuds  : ${etats.length}`,
      `duree   : ${secondes.toFixed(1)} s`,
      "",
    ];
    const fautifs: string[] = [];
    for (const e of etats.slice().sort((a, b) => a.id.localeCompare(b.id))) {
      const f = fiches[e.id] ?? "?";
      const sons = fichiers.filter((x) => x.id === e.id);
      // UN NŒUD SANS SORTIE AUDIO N'EST PAS EN FAUTE : « Sortie texte » et « Note » n'en ont pas, et
      // la plupart des nœuds de calcul passent leur résultat par un câble sans rien faire entendre.
      const quoi = sons.length
        ? sons.map((s) => `${s.nom} (${s.secondes.toFixed(2)} s, crete ${s.crete.toFixed(3)})`).join(", ")
        : entendus.has(e.id) ? "(apercu illisible)" : "—";
      lignes.push(`${e.statut === "erreur" ? "ERREUR " : "       "}${e.id.padEnd(22)} ${f.padEnd(26)} ${quoi}`
        + (e.message ? `\n           ${e.message.slice(0, 110)}` : ""));
      if (e.statut === "erreur") fautifs.push(`${e.id} (${f}) : ${e.message ?? "sans message"}`);
    }
    lignes.push("", `${fichiers.length} fichier(s) ecrit(s) dans ${racine}/`);
    if (fautifs.length) lignes.push("", "EN ERREUR :", ...fautifs.map((x) => `  ${x}`));

    const rapport = lignes.join("\n");
    writeFileSync(join(racine, "execution.txt"), `${rapport}\n`, "utf8");
    console.log(`\n${rapport}\n`);

    // LE VERDICT NE PORTE QUE SUR CE QUI A LEVÉ, jamais sur ce qu'on a entendu : exécuter n'est pas
    // juger. Un nœud muet n'est pas une faute, c'est une information — et elle est dans le rapport.
    expect(fautifs, ["", "DES NOEUDS ONT LEVE PENDANT L'EXECUTION.", "", rapport, ""].join("\n")).toEqual([]);
  });
});
