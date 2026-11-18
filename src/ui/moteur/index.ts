// ui/moteur/index.ts — Ce que l'interface connaît du moteur, et rien de plus.
//
// LA SEULE PORTE DU DOSSIER, depuis la pièce P5b du plan de l'architecture par messages. Le moteur est
// construit par le pont (`ui/hooks/useExecutionGraphe.ts`), qui lui donne ses questions et son
// récepteur ; le reste de l'interface ne fait que lui envoyer des commandes. Rien, hors de ce dossier,
// n'importe un autre de ses modules, et `docs/frontiere-moteur.test.ts` le tient, types compris.
export { creerMoteur, type Moteur, type PretsDuMoteur } from "./moteur";
export type { EnvoiDuCache } from "./commandes";
export type { PerimetreCible } from "./passe";
/**
 * Un cache du moteur et ses commandes, sans passe ni ordonnanceur : pour un essai qui range et relit
 * des entrées sans rien lancer. L'application, elle, passe par `creerMoteur`.
 */
export { creerMoteurDuCache } from "./commandes";
