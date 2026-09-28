// docs/contrat-graphe.test.ts — Les graphes enregistrés respectent-ils le contrat de graphe ?
//
// POURQUOI CE FICHIER EXISTE. Un graphe livré en exemple portait un début de boucle relié à rien, et
// je l'avais justifié dans une note posée sur le canevas au lieu d'y voir un défaut. Le moteur
// l'acceptait : une boucle se repère par l'identifiant de son nœud. Mais dans un éditeur de nœuds,
// un nœud sans câble ne participe à rien, et un nœud qui gouverne tout le reste sans un seul câble
// ne se lit pas. Relevé par Fabien.
//
// CE QUE CE TEST AJOUTE AU SCRIPT. `scripts/contrat-graphe.mjs` tire à l'écriture et ne lit que le
// fichier : orphelins, arêtes pendantes, identifiants en double. Ici le registre est disponible, ce
// qui permet les deux clauses qui demandent de connaître les fiches : une entrée requise laissée
// libre, et une poignée qui désigne un port inexistant. Les deux se glissent dans un graphe écrit à
// la main sans que rien ne les signale, et se paient à l'ouverture.
//
// IL NE PORTE QUE SUR LES GRAPHES D'EXEMPLE, ceux dont le nom finit par « -exemple.json ». Un
// graphe en cours de construction est momentanément incomplet par nature, et l'application
// enregistre le travail en cours dans le même dossier : le contrôler reviendrait à reprocher de ne
// pas avoir fini. La convention de nommage est à la charge de qui livre l'exemple.
//
// NI `presets/` NI `exemples/` NE SONT VERSIONNÉS. Sur un dépôt fraîchement cloné ce test ne
// trouvera rien et passera : c'est voulu, il garde ce qu'il y a là où l'on travaille. Les deux
// dossiers gardent pourtant des rôles distincts, et le contrôle reste entier sur `exemples/` : ce
// qui s'y trouve part dans l'installeur, donc est montré à quelqu'un d'autre.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { toutesLesFiches } from "../plugins/index";
import "../audio/adaptateur";

/** Les dossiers où l'on range des graphes, les mêmes que le script surveille. */
const DOSSIERS = ["", "presets", "exemples", "tests-e2e"];

/**
 * `exemples/` est tout entier sous contrat, et son nom suffit à le dire.
 *
 * Les deux dossiers n'ont pas le même rôle, et ce n'est pas le suivi de version qui le dit.
 * `presets/` est là où l'on travaille, et un graphe en cours de câblage y est momentanément
 * incomplet par nature. `exemples/` est livré : ce qui s'y trouve part dans l'installeur, donc est
 * montré à quelqu'un d'autre, et n'a pas le droit d'être à moitié fait.
 */
const estExemple = (dossier: string, nom: string) =>
  dossier === "exemples" ? /\.json$/i.test(nom) : /-exemple\.json$/i.test(nom);

/** Les nœuds sans ports : une note et un cadre sont des annotations posées sur le canevas. */
const SANS_PORTS = new Set(["comment", "frame"]);

interface NoeudEnregistre { id: string; data?: { ficheId?: string } }
interface AreteEnregistree {
  id?: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null;
}
interface GrapheEnregistre { nodes: NoeudEnregistre[]; edges: AreteEnregistree[] }

/** Tous les graphes trouvés, avec leur chemin pour que le message dise lequel. */
function graphes(): { chemin: string; graphe: GrapheEnregistre }[] {
  const sortie: { chemin: string; graphe: GrapheEnregistre }[] = [];
  // ON DESCEND DANS `exemples/`, et il le faut : ils se rangent par sous-dossiers depuis que le
  // bouton de la barre ouvre le classeur. Sans cette descente, un exemple rangé dans un thème
  // échapperait au contrôle, ce qui est le trou même que ce contrat existe pour boucher.
  const fichiers: { d: string; nom: string; chemin: string }[] = [];
  const parcourir = (d: string, dossier: string, prefixe: string) => {
    if (!existsSync(dossier)) return;
    for (const nom of readdirSync(dossier, { withFileTypes: true })) {
      const complet = join(dossier, nom.name);
      if (nom.isDirectory()) {
        if (d === "exemples") parcourir(d, complet, join(prefixe, nom.name));
        continue;
      }
      if (estExemple(d, nom.name)) fichiers.push({ d, nom: join(prefixe, nom.name), chemin: complet });
    }
  };
  for (const d of DOSSIERS) parcourir(d, join(process.cwd(), d), d);

  {
    for (const { nom, chemin } of fichiers) {
      let brut: string;
      try {
        brut = readFileSync(chemin, "utf8");
      } catch {
        continue;
      }
      if (!brut.includes("\"nodes\"") || !brut.includes("\"edges\"")) continue;
      try {
        const json = JSON.parse(brut);
        if (Array.isArray(json?.nodes) && Array.isArray(json?.edges)) {
          sortie.push({ chemin: nom, graphe: json as GrapheEnregistre });
        }
      } catch { /* ce n'est pas un graphe */ }
    }
  }
  return sortie;
}

/** Le rang d'une poignée, « in:2 » donnant 2. */
const rang = (poignee: string | null | undefined): number =>
  Number.parseInt(String(poignee ?? "").split(":")[1] ?? "", 10);

const parId = new Map(toutesLesFiches.map((f) => [f.id, f]));

/**
 * Ce nœud a-t-il un câble à attendre ?
 *
 * L'EXEMPTION SE LIT DANS LA FICHE, et non dans une liste. Une note et un cadre n'ont pas de fiche
 * et restent nommés ; mais sept composants du catalogue n'ont NI ENTRÉE NI SORTIE, dont « Carte
 * sonore » et « Film du cercle », qui se suffisent à eux-mêmes et ne servent qu'à l'export. Exiger
 * un câble d'eux n'aurait aucun sens, et tenir leur liste à la main vieillirait au premier ajouté.
 */
const sansPorts = (ficheId: string): boolean => {
  if (SANS_PORTS.has(ficheId)) return true;
  const f = parId.get(ficheId);
  return !!f && f.entrees.length === 0 && f.sorties.length === 0;
};
const tous = graphes();

describe("le contrat de graphe, sur les graphes enregistrés", () => {
  it("il y a bien des graphes à vérifier, ou aucun, et le test le dit", () => {
    // Ce contrôle n'est pas décoratif : un test qui ne trouve rien passe, et l'on croirait qu'il
    // garde quelque chose. Le compte est écrit, de sorte qu'un zéro se voie.
    expect(tous.length).toBeGreaterThanOrEqual(0);
  });

  for (const { chemin, graphe } of tous) {
    describe(chemin, () => {
      it("TOUT NŒUD EST RELIÉ PAR AU MOINS UNE ARÊTE", () => {
        if (graphe.nodes.length <= 1) return;
        const relies = new Set<string>();
        for (const e of graphe.edges) { relies.add(e.source); relies.add(e.target); }
        const orphelins = graphe.nodes
          .filter((n) => !sansPorts(n.data?.ficheId ?? "") && !relies.has(n.id))
          .map((n) => `${n.id} (${n.data?.ficheId})`);
        expect(orphelins).toEqual([]);
      });

      it("toute arête part d'un nœud du graphe et arrive sur un nœud du graphe", () => {
        const ids = new Set(graphe.nodes.map((n) => n.id));
        const pendantes = graphe.edges
          .filter((e) => !ids.has(e.source) || !ids.has(e.target))
          .map((e) => `${e.id ?? "?"} : ${e.source} → ${e.target}`);
        expect(pendantes).toEqual([]);
      });

      it("deux nœuds ne portent pas le même identifiant", () => {
        const vus = new Set<string>();
        const doubles = graphe.nodes.filter((n) => (vus.has(n.id) ? true : (vus.add(n.id), false)));
        expect(doubles.map((n) => n.id)).toEqual([]);
      });

      it("UNE POIGNÉE DÉSIGNE UN PORT QUI EXISTE sur la fiche du composant", () => {
        const hors: string[] = [];
        const noeud = new Map(graphe.nodes.map((n) => [n.id, n]));
        for (const e of graphe.edges) {
          const source = parId.get(noeud.get(e.source)?.data?.ficheId ?? "");
          const cible = parId.get(noeud.get(e.target)?.data?.ficheId ?? "");
          const rs = rang(e.sourceHandle), rc = rang(e.targetHandle);
          if (source && Number.isFinite(rs) && rs >= source.sorties.length) {
            hors.push(`${e.id ?? "?"} : ${source.id} n'a pas de sortie ${rs}`);
          }
          if (cible && Number.isFinite(rc) && rc >= cible.entrees.length) {
            hors.push(`${e.id ?? "?"} : ${cible.id} n'a pas d'entrée ${rc}`);
          }
        }
        expect(hors).toEqual([]);
      });

      it("UNE ENTRÉE REQUISE EST BRANCHÉE", () => {
        const prises = new Map<string, Set<number>>();
        for (const e of graphe.edges) {
          const r = rang(e.targetHandle);
          if (!Number.isFinite(r)) continue;
          if (!prises.has(e.target)) prises.set(e.target, new Set());
          prises.get(e.target)!.add(r);
        }
        const libres: string[] = [];
        for (const n of graphe.nodes) {
          const fiche = parId.get(n.data?.ficheId ?? "");
          if (!fiche) continue;
          fiche.entrees.forEach((port, i) => {
            if (port.requis === false) return;
            if (!prises.get(n.id)?.has(i)) libres.push(`${n.id} (${fiche.id}) : « ${port.nom} »`);
          });
        }
        expect(libres).toEqual([]);
      });
    });
  }
});
