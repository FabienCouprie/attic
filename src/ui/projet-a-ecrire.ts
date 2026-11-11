// ui/projet-a-ecrire.ts — Ce qu'un projet écrit : le fichier de projet et l'en-cours, d'un graphe racine.
//
// SORTI DE `ui/hooks/usePersistance.ts` le 2026-11-08, première pièce de son découpage (lot 2 de la
// revue d'architecture du 2026-10-31). C'est le corps de `buildExportData`, recopié ligne pour
// ligne : seules ses deux lectures du crochet changent de forme. Le graphe racine arrive en
// argument, et la vue par une fonction appelée aux deux mêmes places qu'avant.
//
// DEUX CHOSES ONT CHANGÉ DEPUIS. Le 2026-11-09, la détection des pertes vient après les nœuds
// propres, et se mesure à eux : elle annonçait purgés cinq champs que le fichier écrit. Le
// 2026-11-11, ce qu'un nœud propre porte vient des tables de `core/saisies.ts` et non plus d'une
// liste écrite ici ; les mêmes vingt champs, dans l'ordre des tables.
//
// CE QUI RESTE AU CROCHET, et pourquoi : `sauvegarderContexteCourant()`, appelé avant tout. À la
// racine il pose une copie du graphe dans `grapheRacineRef` ; dans un méta, il réécrit la définition
// du méta. Ce sont des effets sur l'atelier, et ce module n'en a aucun : il lit la bibliothèque des
// métas et les réglages du domaine, comme avant, et il ne signale qu'en console ce qu'il écarte.
//
// TROIS SAUVEGARDES L'APPELLENT, et c'est ce qui le met à part : l'enregistrement, la sauvegarde
// automatique et l'en-cours relu au démarrage. Le fichier qu'il rend se compare donc octet pour
// octet d'une version du code à l'autre, et `tests-e2e/persistance-aller-retour.spec.ts` le fait.
import type { Edge } from "@xyflow/react";
import { estSubstitution, metasEmployes, tousLesMetas, FORMAT_PROJET, type AreteG, type NoeudG } from "../core";
import { servicesDomaine } from "../core/services-domaine";
import { serialiserMeta } from "./metasLocaux";
import { detecterPertes, formaterRapportPertes } from "../core/pertes";
import { CHAMPS_DU_PROJET } from "../core/saisies";

// Typage volontairement souple, celui du crochet d'où ce corps vient : les nœuds portent un `data` à
// index-signature, et il les manipulait déjà en `any`. Le déplacer n'est pas l'occasion de resserrer.
type NoeudAtelier = any;

/** Le graphe dont on écrit le projet : la racine, jamais l'intérieur d'un méta qu'on regarde. */
export interface GrapheAEcrire { nodes: NoeudAtelier[]; edges: Edge[] }

/**
 * Le fichier de projet et l'en-cours d'un graphe racine.
 *
 * Rend `json`, le texte du fichier ; `encours`, l'objet relu au démarrage, avec sa date ; et les
 * nœuds et arêtes propres dont ils sont faits. `lireVue` est appelée deux fois, pour le fichier
 * puis pour l'en-cours, comme la vue de React Flow l'était.
 */
export function projetAEcrire(racine: GrapheAEcrire, lireVue: () => unknown) {
  // CE QU'UN NŒUD PROPRE PORTE VIENT DES TABLES : les saisies conservées, puis la structure
  // enregistrée, `CHAMPS_DU_PROJET` de `core/saisies.ts`. Vingt noms étaient écrits ici à la main,
  // chacun avec la panne qu'avait causée son oubli ; la raison de chacun est désormais dans sa table.
  // Chaque clé est posée même quand elle vaut `undefined`, comme avant : la détection des pertes, plus
  // bas, lit sur ce nœud propre ce que le fichier garde.
  const cleanNodes = racine.nodes.map(({ id, type, position, width, height, data }) => ({
    id, type, position, width, height,
    data: Object.fromEntries([...CHAMPS_DU_PROJET].map((c) => [c, data[c]])),
  }));

  // ── Détection des pertes de données (Chantier B) ──
  //
  // CE QUI EST PERDU SE MESURE À CE QUI VIENT D'ÊTRE ÉCRIT : les champs d'un nœud propre, lus sur
  // l'objet ci-dessus, qui les porte tous même quand ils valent `undefined`. La détection venait
  // avant lui et comparait à la table des saisies, qui ne les nomme pas tous : voir `core/pertes.ts`.
  const pertes: { noeud: string; champs: ReturnType<typeof detecterPertes> }[] = [];
  for (const [i, n] of racine.nodes.entries()) {
    const champsPurges = detecterPertes(n.data as Record<string, unknown>, new Set(Object.keys(cleanNodes[i].data)));
    if (champsPurges.length > 0) {
      pertes.push({ noeud: n.data?.ficheId ?? n.id, champs: champsPurges });
    }
  }
  if (pertes.length > 0) {
    const rapport = formaterRapportPertes(pertes);
    console.warn(`[attic] Données non-sérialisables purgées lors de l'export :\n${rapport}`);
  }

  // LES ARÊTES DE SUBSTITUTION NE SE SAUVEGARDENT PAS : ce sont des objets d'affichage, refaits au
  // chargement par la normalisation. Les écrire les ferait s'accumuler d'une sauvegarde à l'autre.
  const cleanEdges = racine.edges
    .filter((e: { id: string }) => !estSubstitution(e as unknown as AreteG))
    .map(({ id, source, target, sourceHandle, targetHandle, type, style }: any) => ({
      id, source, target, sourceHandle, targetHandle, type, style,
    }));
  // UN PROJET N'EMPORTE QUE LES MÉTAS QU'IL EMPLOIE, relevé par Fabien. Il recopiait ici toute la
  // bibliothèque de la session : un graphe livré posait les composants personnels de qui l'avait
  // enregistré dans la palette de qui l'ouvrait. La bibliothèque, elle, reste entière dans
  // ses clés `attic-meta:<id>` ; c'est le fichier de projet, et lui seul, qui se restreint.
  const metas = metasEmployes(racine.nodes as unknown as NoeudG[], tousLesMetas()).map(serialiserMeta);
  // LE NUMÉRO DE FORMAT, EN PREMIER DANS LE FICHIER, et c'est la seule place qui vaille : on le
  // lit alors sans dérouler le reste. Il vaut 1, qui est le format de TOUS les fichiers écrits
  // jusqu'ici — leur donner un numéro ne les change pas, cela les nomme. Voir `core/format-projet`.
  // ET LES RÉGLAGES DU DOMAINE VOYAGENT AVEC LE PROJET — côté audio, sa fréquence de travail.
  // Sans cela le réglage ne vaudrait que pour la session : un fichier rouvert ailleurs, ou demain,
  // rendrait un autre son, et c'est exactement le défaut qu'il répare. CE FICHIER NE SAIT PAS CE
  // QU'IL ÉCRIT, et c'est voulu : il demande au domaine ce qu'il a à mettre dans le fichier, par
  // `core/services-domaine.ts`. Un garde l'exige — changer de domaine est un but du projet.
  const json = JSON.stringify({
    formatVersion: FORMAT_PROJET, ...servicesDomaine().reglagesDeProjet(),
    nodes: cleanNodes, edges: cleanEdges, metas, viewport: lireVue(),
  }, null, 2);

  const encours = {
    // LES NŒUDS MÊMES DU FICHIER, et non une liste à part. La reprise de séance relit cet objet, et
    // il énumérait ses clés à la main : il oubliait les quatre noms de fichier et `nomFichier`, que
    // `hooks/useEnCours.ts` relit pourtant, de sorte qu'une séance reprise sans le fichier sur le
    // disque montrait un nœud sans nom. Relevé le 2026-11-11 ; voir `ui/en-cours-a-relire.test.ts`.
    // `cleanEdges` a déjà écarté les arêtes de substitution.
    nodes: cleanNodes,
    edges: cleanEdges.map((e: any) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })),
    viewport: lireVue(),
    ...servicesDomaine().reglagesDeProjet(),
    date: new Date().toISOString(),
  };

  return { json, cleanNodes, cleanEdges, encours };
}
