// ui/sauvegarde-avant-maj.ts — Ce que la fenêtre confie au processus principal avant une mise à jour.
//
// LA FORME EST CELLE D'AUTREFOIS, une liste par catalogue, et c'est voulu : la restauration
// (`ui/App.tsx`, au chargement) la remet sous les anciennes clés, que les chargeurs migrent vers une
// clé par élément. Une sauvegarde prise par une version précédente se restaure donc de même.
import { listeDesNodesInstallesStockes } from "../core";
import { listeDesMetasStockes } from "./metasLocaux";

export function instantaneAvantMiseAJour() {
  return {
    metas: listeDesMetasStockes(),
    encours: localStorage.getItem("attic-encours"),
    lang: localStorage.getItem("attic-lang"),
    nodesInstalles: listeDesNodesInstallesStockes(),
  };
}
