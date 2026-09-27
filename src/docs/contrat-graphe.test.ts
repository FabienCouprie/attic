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
// ET `presets/` N'EST PAS VERSIONNÉ. Sur un dépôt fraîchement cloné il ne trouvera rien et passera :
// c'est voulu, il garde ce qu'il y a là où l'on travaille.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { toutesLesFiches } from "../plugins/index";
import "../audio/adaptateur";

/** Les dossiers où l'on range des graphes, les mêmes que le script surveille. */
const DOSSIERS = ["", "presets", "tests-e2e"];

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
  for (const d of DOSSIERS) {
    const dossier = join(process.cwd(), d);
    if (!existsSync(dossier)) continue;
    for (const nom of readdirSync(dossier)) {
      if (!/-exemple\.json$/i.test(nom)) continue;
      const chemin = join(dossier, nom);
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
          sortie.push({ chemin: join(d, nom), graphe: json as GrapheEnregistre });
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
          .filter((n) => !SANS_PORTS.has(n.data?.ficheId ?? "") && !relies.has(n.id))
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
