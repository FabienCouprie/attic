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
  /**
   * Où en est l'écriture, de 0 à 1, appelé à chaque tranche.
   *
   * POURQUOI LE SHELL LE DEMANDE. Écrire l'aperçu d'une heure de son prend quarante-six secondes,
   * et le nœud a déjà dit « terminé ». Sans cela, l'attente est muette.
   */
  onAvance?: (fraction: number) => void;
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

  /**
   * Les fréquences qui se mêlent sur les entrées de ce nœud, s'il y en a plusieurs.
   *
   * ═══ UN RECENSEMENT D'ABORD, UN GARDE D'INVARIANT ENSUITE ═══
   *
   * Point 5 d'une revue du dépôt : « aucune fréquence d'échantillonnage commune au graphe ». Elle a
   * d'abord servi à MESURER AVANT DE CONVERTIR, et le relevé a dit ce qu'il fallait savoir : sur une
   * carte à 48 kHz, deux des cinq graphes livrés rendaient à deux fréquences à la fois.
   *
   * MAINTENANT QUE `porterALaFrequenceDeTravail` EXISTE, ELLE NE DOIT PLUS JAMAIS RIEN RENDRE : tout
   * ce qui circule sur une arête est à la fréquence du projet, donc aucun nœud ne peut plus recevoir
   * deux fréquences. Si elle parle, c'est que la conversion n'a pas eu lieu — et c'est devenu sa
   * vraie valeur : elle est le garde de l'invariant, et non plus un compteur.
   *
   * ELLE REND LES FRÉQUENCES DISTINCTES, dans l'ordre, et une liste de moins de deux éléments
   * signifie qu'il n'y a rien à signaler. Ce que « fréquence » veut dire appartient au domaine : le
   * shell ne sait que l'endroit où la question se pose.
   */
  frequencesMelees(entrees: readonly unknown[]): number[];

  /**
   * Les valeurs d'un nœud, portées à la fréquence de travail du projet.
   *
   * ═══ L'INVARIANT DU GRAPHE, ET IL TIENT EN UNE PHRASE ═══
   *
   * Tout ce qui circule sur une arête est à la fréquence du projet. Le moteur le demande à la SORTIE
   * de chaque nœud, et non à l'entrée : une valeur lue par trois nœuds serait sinon convertie trois
   * fois, et son aperçu — celui qu'on écoute et qu'on enregistre — ne serait à la bonne fréquence
   * sur aucun des trois.
   *
   * CE QUE LE DOMAINE DÉCIDE ICI, et que le shell ne peut pas savoir : ce qu'est une fréquence, quel
   * rééchantillonneur l'applique, et laquelle est celle du projet. Le shell ne sait que l'endroit où
   * la question se pose — le seul point où les sorties d'un nœud sont sous la main avant d'être
   * posées dans les résultats.
   *
   * ELLE REND LE MÊME TABLEAU quand il n'y a rien à faire, ce qui est le cas ordinaire : un graphe
   * entier à la fréquence du projet ne paie pas un échantillon.
   */
  porterALaFrequenceDeTravail(valeurs: readonly unknown[]): Promise<unknown[]>;
}

const NEUTRES: ServicesApercu = {
  valeurRepresentative: () => undefined,
  // Sans domaine, aucune valeur ne mérite d'aperçu : il n'y en a aucun à construire.
  apercuUtile: () => false,
  blobApercu: async () => null,
  apercuCourbe: () => undefined,
  ecartNiveau: () => undefined,
  heriterDesEntrees: () => {},
  // Sans domaine, aucune valeur ne porte de fréquence : il n’y a rien à mêler, ni à convertir. Et
  // le tableau est rendu TEL QUEL — un domaine neutre ne doit pas perdre les valeurs du graphe.
  frequencesMelees: () => [],
  porterALaFrequenceDeTravail: async (valeurs) => [...valeurs],
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
