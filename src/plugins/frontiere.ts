// plugins/frontiere.ts — Nœuds-frontière : matérialisent les ports exposés d'un
// méta-composant dans sa vue interne (§3.8). Reliés à un port interne, ils
// définissent une entrée/sortie exposée du méta. Jamais exécutés réellement
// (retirés à la sauvegarde du sous-graphe) ; filtrés de la palette.
import { ID_ENTREE_FRONTIERE, ID_SORTIE_FRONTIERE } from "../core";
import type { FicheAudio } from "../audio/types-domaine";

const defs: FicheAudio[] = [
  {
    id: ID_ENTREE_FRONTIERE, nom: "▸ Entrée exposée", nomEn: "▸ Exposed input",
    univers: "Méta-composants", famille: "Frontière",
    resume: "Point d'entrée exposé d'un méta-composant.",
    resumeEn: "Exposed input point of a meta-component.",
    notice: "À l'intérieur d'un méta-composant, reliez ce bloc à l'entrée d'un nœud interne : cela crée une entrée exposée sur le méta. Le type est hérité du port relié.",
    noticeEn: "Inside a meta-component, connect this block to an inner node's input: it creates an exposed input on the meta. Type is inherited from the connected port.",
    entrees: [], sorties: [{ nom: "Entrée", type: "audio" }],
    parametres: [],
    // L'exécuteur renvoie [null] PAR CONSTRUCTION (marqueur de port, pas un
    // producteur) : le filet « tout-null = échec » ne doit pas s'appliquer.
    sortieNullePermise: true,
    executer: async () => ({ valeurs: [null] }),
  },
  {
    id: ID_SORTIE_FRONTIERE, nom: "Sortie exposée ◂", nomEn: "Exposed output ◂",
    univers: "Méta-composants", famille: "Frontière",
    resume: "Point de sortie exposé d'un méta-composant.",
    resumeEn: "Exposed output point of a meta-component.",
    notice: "À l'intérieur d'un méta-composant, reliez la sortie d'un nœud interne à ce bloc : cela crée une sortie exposée sur le méta. Le type est hérité du port relié.",
    noticeEn: "Inside a meta-component, connect an inner node's output to this block: it creates an exposed output on the meta. Type is inherited from the connected port.",
    entrees: [{ nom: "Sortie", type: "audio" }], sorties: [],
    parametres: [],
    executer: async () => ({ valeurs: [] }),
  },
];

export const fiches: FicheAudio[] = defs;
