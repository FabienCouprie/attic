// ui/etat-de-passe.ts — Les tables d'une passe, nommées une fois.
//
// POURQUOI UN TYPE À PART. Le moteur d'exécution tenait ses tables dans la fermeture de
// `lancerUnePasse`, et chaque fonction qui en sortait devait les recevoir une à une : la pose d'un
// correctif en lisait seize. Les nommer ici, c'est les nommer une fois, et c'est ce qui permet au
// ménage d'après passe de les recevoir à son tour, par le même objet. Rien n'y est copié : ce sont
// les tables du moteur elles-mêmes, qu'il remplit pendant la boucle et que le ménage lit après.
//
// CE SONT LES TABLES DU MOTEUR, ET LE RÉCEPTEUR NE LES REÇOIT PLUS, depuis la pièce P4b du plan de
// l'architecture par messages. Le choix des valeurs d'un nœud visible les lit au cœur
// (`core/rendu-du-visible.ts`, qui en nomme la part qu'il lit), et le moteur dit ce qu'il a choisi ;
// l'affichage reçoit ses propres prêts, `PretsDeLAffichage` dans `ui/correctif-resultat.ts`.
// `docs/frontiere-moteur.test.ts` tient qu'aucun de ceux qui posent dans les magasins n'importe ce
// module.
import type { TablesDuRendu } from "../core/rendu-du-visible";
import type { Lecture } from "./correctif-resultat";

export interface EtatDePasse extends TablesDuRendu {
  /** Le message de chaque nœud : le ménage y complète la graine tirée et la cause d'une boucle. */
  messages: Map<string, string>;
  /** La bascule d'économie de mémoire, lue au moment du ménage. */
  economieMemoireRef?: Lecture<boolean>;
  t: (cle: string) => string;
}
