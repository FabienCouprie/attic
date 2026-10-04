// ui/services-apercu.ts — Ce que le shell demande au domaine sur les valeurs qu'un nœud a produites.
//
// POURQUOI CE CINQUIÈME POTEAU, ET C'ÉTAIT LE DERNIER VRAI COUPLAGE DU SHELL.
//
// `ui/hooks/useExecutionGraphe.ts` est le chemin d'exécution de TOUS les domaines : il trie le
// graphe, appelle les exécuteurs, tient le cache, et compose ce que chaque nœud montre. Il importait
// huit fonctions du domaine audio pour la dernière de ces tâches, et nommait `AudioBuffer` à trois
// endroits — pour trouver la sortie représentative, pour en lire la durée, pour écrire son WAV.
//
// AUCUNE DE CES QUESTIONS N'EST CELLE DU SHELL. Lesquelles de mes sorties représentent ce que j'ai
// produit ? Combien de temps cela dure-t-il ? Comment en fait-on un aperçu qu'on puisse écouter et
// enregistrer ? De combien le niveau a-t-il changé ? Un domaine d'images, de données ou de texte y
// répondrait autrement, et aucun ne répondrait par un tampon audio.
//
// LES DÉFAUTS SONT NEUTRES. Un domaine qui ne déclare rien n'a pas d'aperçu : pas de lecteur, pas de
// pastille d'écart, pas de croquis de courbe. Le graphe s'exécute, les valeurs circulent, et le
// canevas ne montre que ce qu'un nœud rend de lui-même. Rien ne casse.

/** Ce qu'il faut pour fabriquer l'aperçu d'une valeur. */
export interface OptionsApercu {
  /** Un graphe à embarquer dans le fichier produit, si le nœud l'a demandé. */
  grapheAEmbarquer?: string;
  /** La sortie peut tomber hors de la plage valide : la ramener avant d'écrire. */
  securiser: boolean;
  /** La profondeur d'écriture choisie dans la barre d'outils. */
  bits: 16 | 24 | 32;
  /**
   * Le nom du nœud, pour les métadonnées du fichier. Fourni SEULEMENT quand l'aperçu de ce nœud est
   * le fichier qu'il livre (`apercuEstLeFichier`) : calculer ces métadonnées parcourt la valeur
   * entière, et un aperçu intermédiaire n'est jamais livré.
   */
  nomPourMetadonnees?: string;
  /** De quoi rendre la main entre deux tranches d'écriture, pour ne pas figer l'interface. */
  souffle: { tour: () => Promise<boolean> };
}

/** Ce que le domaine répond au shell sur les valeurs produites. */
export interface ServicesApercu {
  /**
   * Parmi les sorties d'un nœud, celle qui REPRÉSENTE ce qu'il a produit.
   *
   * Côté audio, le premier tampon : les autres sorties audio, quand il y en a, en sont des
   * sous-produits — la réponse impulsionnelle d'une réverbération, le résidu d'une analyse.
   */
  valeurRepresentative(valeurs: readonly unknown[]): unknown | undefined;

  /**
   * Garder un aperçu de cette valeur vaut-il ce qu'il coûte en mémoire ?
   *
   * LE MOTEUR POSAIT DEUX QUESTIONS, et il n'avait à en poser qu'une. Il demandait la DURÉE de la
   * valeur, puis la comparait à un seuil que `core/memoire.ts` portait — seuil justifié par le poids
   * d'un tampon de flottants 32 bits et de son aperçu WAV, c'est-à-dire par de l'arithmétique audio
   * logée dans le cœur. Ce que pèse une valeur et à partir de quand cela compte relèvent du même
   * domaine : la question est donc entière.
   *
   * `regarde` et `economie` sont des faits du shell — ce nœud est-il sélectionné ou terminal, la
   * bascule d'économie de mémoire est-elle active — et c'est lui qui les fournit.
   */
  apercuUtile(valeur: unknown, o: { regarde: boolean; economie: boolean }): boolean;

  /** Un aperçu écoutable et enregistrable de cette valeur. */
  blobApercu(valeur: unknown, o: OptionsApercu): Promise<Blob | null>;

  /** Ce qu'une courbe produite donne à dessiner, réduit à quelques centaines de points. */
  apercuCourbe(valeurs: readonly unknown[]): number[] | undefined;

  /** De combien ce nœud a changé le niveau de ce qu'il a reçu, en décibels. */
  ecartNiveau(sorties: readonly unknown[], entrees: readonly unknown[]): number | undefined;

  /**
   * Fait hériter aux sorties ce que les entrées portaient et que le calcul ne reproduit pas.
   *
   * Côté audio, la disposition des canaux : un effet ordinaire fabrique un tampon neuf, et sans cela
   * il effacerait au passage l'étiquette « 7.1.4 » que son entrée portait.
   */
  heriterDesEntrees(sorties: readonly unknown[], entrees: readonly unknown[]): void;
}

const NEUTRES: ServicesApercu = {
  valeurRepresentative: () => undefined,
  // Sans domaine, aucune valeur ne mérite d'aperçu : il n'y en a aucun à construire.
  apercuUtile: () => false,
  blobApercu: async () => null,
  apercuCourbe: () => undefined,
  ecartNiveau: () => undefined,
  heriterDesEntrees: () => {},
};

let services: ServicesApercu = NEUTRES;

/** Le domaine répond au shell. Ce qu'il ne déclare pas garde la réponse neutre. */
export function configurerServicesApercu(partiels: Partial<ServicesApercu>): void {
  services = { ...NEUTRES, ...partiels };
}

/** Les réponses du domaine, neutres tant qu'aucune n'a été déposée. */
export const servicesApercu = (): ServicesApercu => services;

/** Rend les réponses neutres. Pour un test qui veut éprouver le shell seul. */
export function oublierServicesApercu(): void {
  services = NEUTRES;
}
