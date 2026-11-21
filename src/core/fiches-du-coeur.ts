// core/fiches-du-coeur.ts — Les fiches et les types de flux que le cœur fournit à tout domaine.
//
// AUJOURD'HUI, LES DEUX NŒUDS-FRONTIÈRE D'UN MÉTA-COMPOSANT, et le type de leur port. Le méta est un
// mécanisme du cœur : `frontieresPourEdition` ÉCRIT leurs identifiants sur les nœuds qu'il
// synthétise, `redériverMeta` les lit, et la validation saute leurs câbles. Leurs fiches vivaient
// pourtant dans le domaine audio, `plugins/frontiere.ts`, qui importait du cœur les identifiants, et
// leur type de flux dans `audio/adaptateur.ts`. Un second domaine qui voulait des méta-composants
// devait donc redéclarer les deux fiches sous ces identifiants-là, et le type avec elles.
//
// DÉPLACÉES ICI LE 2026-11-21, sur décision de Fabien : pièce P1 du plan des identifiants du cœur,
// variante M-a. Le domaine les INCLUT, il ne les déclare plus : son catalogue étale `fichesDuCoeur()`
// et son registre inscrit `typesFluxDuCoeur()`. Le registre refuse une fiche dont un port porte un
// type qu'il n'a pas : les deux vont donc ensemble.
//
// RIEN DU DOMAINE ICI, et le garde des identifiants le tient : une fiche de ce module ne porte que des
// ports de types que ce module déclare. Le type de valeur et le runtime du domaine entrent en
// paramètres génériques, et les exécuteurs ne rendent rien, puisque ces nœuds ne calculent pas : ils
// sont retirés de la définition d'un méta à la sauvegarde, et la palette ne les propose pas.
import { ID_ENTREE_FRONTIERE, ID_SORTIE_FRONTIERE } from "./meta";
import type { PluginDef } from "./types";
import type { TypeFlux } from "./typesFlux";

/** Le type du port d'un nœud-frontière. Ce port n'a pas de type à lui : il prend celui du port interne relié. */
export const TYPE_FRONTIERE = "frontiere";

/**
 * Les types de flux que le cœur déclare, à inscrire par tout domaine qui inclut `fichesDuCoeur()`.
 *
 * GRIS NEUTRE, PARCE QU'UN NŒUD-FRONTIÈRE N'A PAS DE TYPE À LUI. Il marque, à l'intérieur d'un
 * méta-composant, l'endroit où un port sera exposé ; ce port prend le type du port interne auquel la
 * frontière se relie. Ses deux blocs étaient déclarés « audio », si bien qu'ils s'affichaient en vert
 * quoi qu'on y branche : on croyait y lire un type, et c'était toujours le même.
 */
export function typesFluxDuCoeur(): TypeFlux[] {
  return [{ id: TYPE_FRONTIERE, couleur: "#8a8f98", libelle: "Port exposé" }];
}

/**
 * Les fiches que le cœur fournit à tout domaine, pour son type de valeur et son runtime.
 *
 * L'ENTRÉE REND `[null]` PAR CONSTRUCTION : c'est un marqueur de port, pas un producteur, et le filet
 * « tout-null = échec » du moteur ne doit pas s'y appliquer, d'où `sortieNullePermise`.
 *
 * D'OÙ `TV | null` DANS LE TYPE RENDU. Le moteur tient déjà `null` pour « pas de valeur », et un
 * domaine dont l'union l'admet, comme `ValeurAudio`, reçoit exactement `PluginDef<TV, TR>`. Un domaine
 * dont l'union ne l'admet pas se le voit dire par le compilateur en inscrivant ces fiches, ce qui est
 * vrai : la frontière d'entrée rend `null`.
 */
export function fichesDuCoeur<TV, TR>(): PluginDef<TV | null, TR>[] {
  return [
    {
      id: ID_ENTREE_FRONTIERE, nom: "▸ Entrée exposée", nomEn: "▸ Exposed input",
      univers: "Méta-composants", famille: "Frontière",
      resume: "Point d'entrée exposé d'un méta-composant.",
      resumeEn: "Exposed input point of a meta-component.",
      notice: "Ce bloc marque une entrée exposée à l'intérieur d'un méta-composant. Relié à l'entrée d'un composant interne, il ajoute au méta une entrée du type de ce port. Sa sortie « Entrée » porte ce que le méta reçoit sur cette entrée.",
      noticeEn: "This block marks an exposed input inside a meta-component. Connected to an inner node's input, it adds to the meta an input of that port's type. Its « Input » output carries what the meta receives on that input.",
      entrees: [], sorties: [{ nom: "Entrée", nomEn: "Input", type: TYPE_FRONTIERE }],
      parametres: [],
      sortieNullePermise: true,
      executer: async () => ({ valeurs: [null] }),
    },
    {
      id: ID_SORTIE_FRONTIERE, nom: "Sortie exposée ◂", nomEn: "Exposed output ◂",
      univers: "Méta-composants", famille: "Frontière",
      resume: "Point de sortie exposé d'un méta-composant.",
      resumeEn: "Exposed output point of a meta-component.",
      notice: "Ce bloc marque une sortie exposée à l'intérieur d'un méta-composant. Relié à la sortie d'un composant interne, il ajoute au méta une sortie du type de ce port. Son entrée « Sortie » reçoit ce que le méta rend sur cette sortie.",
      noticeEn: "This block marks an exposed output inside a meta-component. Connected to an inner node's output, it adds to the meta an output of that port's type. Its « Output » input receives what the meta returns on that output.",
      entrees: [{ nom: "Sortie", nomEn: "Output", type: TYPE_FRONTIERE }], sorties: [],
      parametres: [],
      executer: async () => ({ valeurs: [] }),
    },
  ];
}
