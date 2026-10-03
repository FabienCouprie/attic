// plugins/orchestration-domaine.ts — Ce que le domaine audio pose et répond autour d'un run.
//
// POURQUOI CE FICHIER. Le moteur d'exécution importait `plugins/grapheGlobal` et nommait
// `boucle-collection-debut` en dur pour savoir quels dossiers lire. Poser un état ambiant et dire
// quels dossiers un graphe demande sont des questions de domaine, pas de moteur.
//
// Les réponses sont ici, et la racine de composition les dépose dans `ui/services-orchestration.ts`.

import { fichiersAudio, FICHE_LOT_DEBUT } from "./lotGlobal";
import { publierGrapheCourant, publierExecutionCourante } from "./grapheGlobal";
import type { ServicesOrchestration } from "../ui/services-orchestration";

/** Le paramètre où un début de boucle collection porte son dossier. */
const PARAMETRE_DOSSIER = "Dossier";

export const ORCHESTRATION_AUDIO: ServicesOrchestration = {
  publierGraphe: (graphe) => { publierGrapheCourant(graphe as never); },
  publierExecution: (execution) => { publierExecutionCourante(execution as never); },

  // LES DÉBUTS DE BOUCLE COLLECTION DISENT LEUR DOSSIER, et c'est tout ce que le moteur a besoin de
  // savoir : une liste de chemins à faire lire. Quel composant les porte, et sous quel paramètre,
  // ne le concerne pas — il en tenait l'identifiant en dur.
  dossiersALire: (noeuds) => {
    const chemins = new Set<string>();
    for (const n of noeuds as { data?: { ficheId?: string; parametres?: Record<string, unknown> } }[]) {
      if (n.data?.ficheId !== FICHE_LOT_DEBUT) continue;
      const d = String(n.data?.parametres?.[PARAMETRE_DOSSIER] ?? "").trim();
      if (d) chemins.add(d);
    }
    return [...chemins];
  },

  // Ce qu'un dossier lu donne de utile : les fichiers audio, et le tri est celui du domaine.
  fichiersUtiles: (contenu) => fichiersAudio(contenu as never),
};
