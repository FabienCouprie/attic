// ui/configuration.ts — La configuration lue au démarrage, telle que l'interface la reçoit.
//
// POURQUOI CE MODULE. Pièce C0 du plan du fichier de configuration (2026-11-19). Le processus
// principal lit `config.json` avant que l'application ne soit prête (`electron/configuration.cjs`),
// et l'interface en reçoit une copie par `configuration:lire`, en lecture seule : aucun canal ne
// l'écrit.
//
// PAR UN CANAL ORDINAIRE, ET NON SYNCHRONE. Le dépôt n'accepte qu'un appel bloquant au pont, lu avant
// le premier rendu (`electron/pont-canaux.test.ts`) ; la configuration se demande donc une fois, de
// façon asynchrone, et la promesse est gardée.
//
// SANS LE PONT, RIEN : le serveur de développement et les specs tournent sans Electron. Le lecteur
// d'une clé garde alors son propre défaut, celui que le schéma déclare.
export interface ProblemeDeConfiguration {
  code: string;
  cle?: string;
  section?: string;
  ligne?: number;
  detail?: string;
}

export interface ConfigurationRecue {
  /** Le fichier lu : `absent`, `lu`, `illisible`, `refuse`, ou `sans-pont` hors d'Electron. */
  fichier: string;
  chemin?: string;
  valeurs: Readonly<Record<string, unknown>>;
  /** D'où vient chaque valeur : `defaut`, `fichier` ou `environnement`. */
  sources: Readonly<Record<string, string>>;
  problemes: readonly ProblemeDeConfiguration[];
}

const SANS_PONT: ConfigurationRecue = Object.freeze({
  fichier: "sans-pont", valeurs: Object.freeze({}), sources: Object.freeze({}), problemes: Object.freeze([]),
});

let promesse: Promise<ConfigurationRecue> | null = null;

/** La configuration du démarrage, demandée une fois au processus principal. */
export function configurationRecue(): Promise<ConfigurationRecue> {
  promesse ??= (async () => {
    const api = (globalThis as { api?: { configuration?: () => Promise<ConfigurationRecue> } }).api;
    if (typeof api?.configuration !== "function") return SANS_PONT;
    try {
      return Object.freeze(await api.configuration());
    } catch {
      return SANS_PONT;
    }
  })();
  return promesse;
}

/** Oublie la configuration demandée. Pour un test seulement. */
export function oublierConfigurationRecue(): void {
  promesse = null;
}
