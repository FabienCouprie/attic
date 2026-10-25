// docs/contrat-cles-de-reglage.test.ts — Une valeur enregistrée doit encore être lue.
//
// ═══ POURQUOI CE FICHIER EXISTE ═══
//
// RELEVÉ PAR UNE REVUE CRITIQUE DU DÉPÔT, le 2026-10-25, en ces termes : « Les réglages sont indexés
// par leur libellé français. Corriger un accent dans un nom de réglage fait retomber en silence, sur
// la valeur par défaut, tous les projets, exemples et méta-composants qui le portent. »
//
// C'EST VRAI, ET VÉRIFIÉ. `useExecutionGraphe.ts` lit `node.data.parametres[nom]` où `nom` est le
// libellé affiché, et retombe sur le défaut déclaré quand la clé manque. Il n'y a donc AUCUN signal :
// le graphe garde la vieille clé, que plus rien ne lit, et le nœud tourne sur le défaut.
//
// ═══ CE QUE CE GARDE MESURE, ET CE QU'IL NE PEUT PAS MESURER ═══
//
// IL MESURE LES GRAPHES LIVRÉS : chaque clé de `parametres` doit correspondre à un réglage déclaré
// par la fiche du nœud. Une clé orpheline est une valeur que personne ne lira plus — le symptôme
// exact du défaut, pris sur pièces et non supposé.
//
// IL NE PEUT RIEN DIRE DES PROJETS DE L'UTILISATEUR, qui vivent sur son disque. C'est la limite
// honnête de ce garde : il protège ce qui part dans l'installeur, et il rend le renommage d'un
// réglage visible AU MOMENT où on l'écrit, ce qui est le seul moment où la réparation est gratuite.
//
// ═══ ET IL RÉSOUT LES ALIAS, PARCE QUE LE MOTEUR LES RÉSOUT ═══
//
// `core/registre.ts` fait correspondre treize anciens identifiants à des fiches actuelles, dont six
// qui FUSIONNENT des composants différents (`fusionneur` → `melangeur`). Un garde qui lirait
// `toutesLesFiches` par identifiant littéral tiendrait ces nœuds pour inconnus et les écarterait —
// c'est-à-dire qu'il serait aveugle là où le risque est le plus grand, un alias étant précisément un
// endroit où les réglages des deux fiches peuvent ne pas se correspondre.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { registre } from "../audio/adaptateur";
import { tousLesMetas } from "../core";
import { installerMetasExemples } from "../plugins/meta-exemples";

// ═══ LES MÉTA-COMPOSANTS EMBARQUÉS SONT INSTALLÉS, ET IL LE FAUT ═══
//
// UN MÉTA N'EST PAS AU REGISTRE DES FICHES : il vit dans son propre magasin, et `trouverDef` ne le
// rend pas. Un premier jet de ce garde a donc déclaré « fiche inconnue » sur
// `meta-synth-soustractif`, que `plugins/meta-exemples.ts` installe au démarrage — un faux positif
// qui aurait fait chercher une panne là où il n'y en a pas.
//
// ET LE FICHIER D'EXEMPLE NE LE PORTE PAS NON PLUS : `exemples/un-synthe-et-sa-bulle-d-effets.json`
// n'a aucun tableau `metas`. Il s'ouvre quand même, parce que le méta est embarqué dans
// l'application ; ce qui veut dire que ce garde doit regarder LES DEUX SOURCES, sans quoi il
// refuserait un exemple parfaitement valable.
installerMetasExemples();

/** Les dossiers où l'on range des graphes, les mêmes que `contrat-graphe.test.ts` surveille. */
const DOSSIERS = ["", "presets", "exemples", "tests-e2e"];

/**
 * `exemples/` est tout entier sous contrat ; ailleurs, seul ce qui se dit exemple.
 *
 * MÊME RÈGLE QUE LE CONTRAT DE GRAPHE, et pour la même raison : `presets/` est là où l'on
 * travaille, et un graphe en cours de câblage y est momentanément incomplet par nature.
 */
const estExemple = (dossier: string, nom: string) =>
  dossier === "exemples" ? /\.json$/i.test(nom) : /-exemple\.json$/i.test(nom);

interface NoeudEnregistre {
  id: string;
  data?: { ficheId?: string; parametres?: Record<string, unknown> };
}
interface MetaEnregistre { id?: string }
interface GrapheEnregistre { nodes: NoeudEnregistre[]; edges: unknown[]; metas?: MetaEnregistre[] }

function graphes(): { chemin: string; graphe: GrapheEnregistre }[] {
  const sortie: { chemin: string; graphe: GrapheEnregistre }[] = [];
  const fichiers: { nom: string; chemin: string }[] = [];
  const parcourir = (d: string, dossier: string, prefixe: string) => {
    if (!existsSync(dossier)) return;
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const complet = join(dossier, entree.name);
      if (entree.isDirectory()) {
        // On descend dans `exemples/`, qui se range par thèmes depuis que la barre ouvre le classeur.
        if (d === "exemples") parcourir(d, complet, join(prefixe, entree.name));
        continue;
      }
      if (estExemple(d, entree.name)) fichiers.push({ nom: join(prefixe, entree.name), chemin: complet });
    }
  };
  for (const d of DOSSIERS) parcourir(d, join(process.cwd(), d), d);

  for (const { nom, chemin } of fichiers) {
    let brut: string;
    try { brut = readFileSync(chemin, "utf8"); } catch { continue; }
    if (!brut.includes("\"nodes\"")) continue;
    try {
      const json = JSON.parse(brut);
      if (Array.isArray(json?.nodes)) sortie.push({ chemin: nom, graphe: json as GrapheEnregistre });
    } catch { /* ce n'est pas un graphe */ }
  }
  return sortie;
}

/**
 * Les nœuds qui n'ont pas de fiche au registre, et c'est normal.
 *
 * Une note et un cadre sont des annotations posées sur le canevas ; une bulle repliée a une fiche
 * fabriquée pour elle seule, à partir des ports de ses membres. Aucun des trois n'a de réglage
 * déclaré au registre, et leur demander d'en avoir n'aurait pas de sens.
 */
const SANS_FICHE = new Set(["comment", "frame"]);
const horsRegistre = (ficheId: string) => SANS_FICHE.has(ficheId) || ficheId.startsWith("bulle::");

/**
 * LES CLÉS QUE LE SHELL POSE LUI-MÊME, et qui ne sont pas des réglages de fiche.
 *
 * Relevé sur les graphes livrés plutôt que deviné : ce sont des champs que l'interface écrit dans
 * `parametres` pour son propre compte. Les compter comme orphelines ferait de ce garde un bruit
 * permanent, et ce qu'on tolère en permanence ne se lit plus.
 */
const CLES_DU_SHELL = new Set<string>([]);

/** Les méta-composants que l'application connaît d'elle-même, par identifiant. */
const METAS_EMBARQUES = new Set(tousLesMetas().map((m) => m.id));

/** Les réglages déclarés pour cet identifiant, ou `null` si rien ne le connaît. */
function reglagesDeclares(ficheId: string, metasDuFichier: Set<string>): Set<string> | null {
  // LE REGISTRE RÉSOUT LES ALIAS, exactement comme le moteur : treize anciens identifiants mènent à
  // une fiche actuelle, dont six qui fusionnent des composants différents.
  const def = registre.trouverDef(ficheId);
  if (def) return new Set(def.parametres.map((p) => p.nom));
  // UN MÉTA N'A PAS DE RÉGLAGE PROPRE : ses valeurs vivent dans ses sous-nœuds. Une clé posée sur un
  // nœud de méta ne serait donc lue par personne, et l'ensemble vide le dit.
  if (metasDuFichier.has(ficheId) || METAS_EMBARQUES.has(ficheId)) return new Set();
  return null;
}

describe("les clés de réglage des graphes livrés", () => {
  const tous = graphes();

  it("il y a bien des graphes à contrôler, sans quoi ce garde ne dirait rien", () => {
    expect(tous.length).toBeGreaterThan(0);
  });

  it("CHAQUE CLÉ CORRESPOND À UN RÉGLAGE DÉCLARÉ : une valeur enregistrée doit encore être lue", () => {
    const orphelines: string[] = [];
    let cles = 0;
    let noeuds = 0;
    for (const { chemin, graphe } of tous) {
      const metasDuFichier = new Set((graphe.metas ?? []).map((m) => String(m?.id ?? "")));
      for (const n of graphe.nodes ?? []) {
        const ficheId = n.data?.ficheId;
        if (!ficheId || horsRegistre(ficheId)) continue;
        const parametres = n.data?.parametres;
        if (!parametres || typeof parametres !== "object") continue;
        const declares = reglagesDeclares(ficheId, metasDuFichier);
        if (!declares) continue; // fiche inconnue : c'est l'affaire du cas suivant.
        noeuds++;
        for (const cle of Object.keys(parametres)) {
          cles++;
          if (declares.has(cle) || CLES_DU_SHELL.has(cle)) continue;
          orphelines.push(`${chemin} · nœud ${n.id} (${ficheId}) · « ${cle} »`
            + ` — la fiche déclare : ${[...declares].join(", ") || "aucun réglage"}`);
        }
      }
    }
    console.log(`clés contrôlées : ${cles} sur ${noeuds} nœud(s) de ${tous.length} graphe(s)`);
    // CE GARDE DOIT AVOIR REGARDÉ QUELQUE CHOSE. Sans ce seuil, un résolveur cassé rendrait `null`
    // partout, zéro clé serait contrôlée, et le cas serait vert — c'est la forme de faux vert que ce
    // dépôt paie le plus souvent.
    expect(cles, "aucune clé contrôlée : le résolveur de fiches ne rend plus rien")
      .toBeGreaterThan(100);
    expect(orphelines, [
      "",
      `${orphelines.length} clé(s) de réglage ne correspondent à aucun réglage de leur fiche.`,
      "",
      "CHACUNE EST UNE VALEUR PERDUE EN SILENCE. Les réglages sont indexés par leur LIBELLÉ : le",
      "moteur lit `parametres[nom]`, ne trouve rien, et retombe sur le défaut déclaré sans un mot.",
      "Le graphe garde la vieille clé, que plus rien ne lira.",
      "",
      "DEUX RÉPARATIONS, ET LA PREMIÈRE EST PRESQUE TOUJOURS LA BONNE :",
      "  · corriger la clé dans le graphe, si le réglage a été renommé ;",
      "  · ou rendre à la fiche le réglage qu'elle a perdu.",
      "",
      ...orphelines.map((o) => `  ${o}`),
      "",
    ].join("\n")).toEqual([]);
  });

  it("ET CHAQUE FICHE EST CONNUE, alias et métas résolus : un nœud sans fiche ne se dessine pas", () => {
    const inconnues: string[] = [];
    for (const { chemin, graphe } of tous) {
      const metasDuFichier = new Set((graphe.metas ?? []).map((m) => String(m?.id ?? "")));
      for (const n of graphe.nodes ?? []) {
        const ficheId = n.data?.ficheId;
        if (!ficheId || horsRegistre(ficheId)) continue;
        if (!reglagesDeclares(ficheId, metasDuFichier)) {
          inconnues.push(`${chemin} · nœud ${n.id} · « ${ficheId} »`);
        }
      }
    }
    expect(inconnues, [
      "",
      `${inconnues.length} nœud(s) portent une fiche que rien ne connaît.`,
      "",
      "À l'ouverture, un tel nœud ne trouve ni ports ni réglages : ses câbles sont écartés par",
      "`filtrerAretesInvalides` et son travail est perdu. Trois endroits peuvent le connaître :",
      "la table `ALIAS` de `core/registre.ts` si la fiche a été renommée, le tableau `metas` du",
      "fichier lui-même, ou `plugins/meta-exemples.ts` pour un méta embarqué.",
      "",
      ...inconnues.map((o) => `  ${o}`),
      "",
    ].join("\n")).toEqual([]);
  });

  // ═══ ET LES SOUS-NŒUDS DES MÉTAS EMBARQUÉS, qui sont la même exposition ═══
  //
  // UN MÉTA PORTE DES GRAPHES EN DUR DANS LA SOURCE, et leurs sous-nœuds ont des réglages indexés
  // par libellé comme tous les autres : `{ Forme: "Dent de scie", Fréquence: 110 }`. Renommer
  // « Fréquence » dans la fiche de l'oscillateur ferait retomber le méta embarqué sur son défaut,
  // en silence, sans qu'aucun fichier de graphe soit en cause.
  it("LES SOUS-NŒUDS DES MÉTAS EMBARQUÉS portent eux aussi des clés qui existent", () => {
    const orphelines: string[] = [];
    let cles = 0;
    for (const meta of tousLesMetas()) {
      for (const sous of meta.sousNoeuds ?? []) {
        const def = registre.trouverDef(sous.data?.ficheId as string);
        if (!def) {
          orphelines.push(`méta « ${meta.id} » · sous-nœud ${sous.id} · fiche inconnue`
            + ` « ${sous.data?.ficheId} »`);
          continue;
        }
        const declares = new Set(def.parametres.map((p) => p.nom));
        for (const cle of Object.keys(sous.data?.parametres ?? {})) {
          cles++;
          if (declares.has(cle)) continue;
          orphelines.push(`méta « ${meta.id} » · sous-nœud ${sous.id} (${sous.data?.ficheId})`
            + ` · « ${cle} » — la fiche déclare : ${[...declares].join(", ") || "aucun réglage"}`);
        }
      }
    }
    console.log(`clés de sous-nœuds de métas contrôlées : ${cles}`);
    expect(orphelines.join("\n") || "aucune", "un méta embarqué retombe sur ses défauts en silence")
      .toBe("aucune");
  });
});
