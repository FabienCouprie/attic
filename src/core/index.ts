export { creerRegistre } from "./registre";
export type { Registre } from "./registre";
export { aplatirGraphe, creerMeta, indexPort, metasEmployes, nettoyerNoeud,
  frontieresPourEdition, redériverMeta, estFrontiere, ID_ENTREE_FRONTIERE, ID_SORTIE_FRONTIERE } from "./meta";
export type { MetaComposant, NoeudG, AreteG, DefPorts, PortInterne } from "./meta";
export { grapheSansConteneurs } from "./formes-graphe";
export {
  PREFIXE_FICHE_BULLE, PREFIXE_SUBSTITUTION, ancetresBulle, appliquerRepli, bulleCachante, bulleDe,
  bullesVides, estBulle, estCacheParBulle, estRepliee, estSubstitution, ficheDeBulle,
  membresDe, noeudDeFicheBulle, portsDeBulle, sortieDeBulle, traduireConnexion,
} from "./bulles";
export type { PortsBulle } from "./bulles";
export type { GrapheVisible, GrapheSansConteneurs } from "./formes-graphe";
export { trouverMeta, tousLesMetas, estMeta, decrireMeta, enregistrerMeta, supprimerMeta, renommerMeta, surChangementMetas, configurerRegistre as configurerRegistreMeta } from "./metastore";
export { ordreTopologique, placerEnDernier, ancetres, descendants, empreinteEntrees, empreinteParametres, empreinteSorties, empreinteValeur, empreinteValeursEntrantes, fermeraitUnCycle, noeudsEnCycle, resoudreEntree, valeursEntrantes } from "./graphe";
export type { TypeFlux } from "./typesFlux";
export { chargerNodesInstalles, installerNode, configurerRegistreNodes } from "./nodes-installes";
// CE QUE LE CŒUR DEMANDE AU DOMAINE sur ses propres valeurs : empreinte, nom de type, types non
// sérialisables, globales prêtées aux nodes installés. Neutre tant qu'aucun adaptateur n'a répondu.
export { configurerServicesDomaine, oublierServicesDomaine, servicesDomaine } from "./services-domaine";
export type { ServicesDomaine } from "./services-domaine";
export { valider, validerGraphe } from "./validation";
export type { ResultatValidationGraphe } from "./validation";
export { creerAleatoire, hasardDuNoeud } from "./hasard";
export { detecterPertes, formaterRapportPertes } from "./pertes";
export type { ChampPurge } from "./pertes";
export { estResultatEnErreur } from "./execution";
// `TypeValeur` NE FIGURE PLUS ICI : l'union des valeurs d'un domaine est déclarée par ce domaine,
// et passée en paramètre générique. Côté audio, c'est `ValeurAudio` de `audio/types-domaine.ts`.
export type {
  ContexteExecution, FonctionPlugin,
  PortDef, ParametreDef, PluginDef,
} from "./types";
