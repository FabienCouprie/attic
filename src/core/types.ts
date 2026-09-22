// core/types.ts — Types du moteur et du registre de plugins

import type { ModeMemoire } from "./memoire";

// Valeur transportée sur les arêtes. Le cœur ne manipule les valeurs que de
// façon opaque : un autre domaine fournit son propre type via le paramètre
// `TValeur` des contrats génériques ci-dessous, sans toucher au cœur.
// Union de valeurs du domaine AUDIO. Elle vit encore dans le cœur uniquement
// parce que `core/metastore.ts` et `core/nodes-installes.ts` sont mono-domaine
// (hypothèse assumée « un domaine par process » — cf. ARCHITECTURE.md §14).
// Un NOUVEAU domaine ne doit PAS l'utiliser : il déclare sa propre union et la
// passe en paramètre générique (les contrats ci-dessous n'ont plus de défaut,
// donc le compilateur l'y oblige). Côté audio, utiliser `FicheAudio` /
// `ValeurAudio` de `audio/types-domaine.ts` plutôt que ce type directement.
export type TypeValeur = AudioBuffer | Float32Array | File | string | { debut: number; duree: number } | null;

// Contexte d'exécution passé à chaque plugin. Générique sur :
//  - `TValeur`  : le type des valeurs sur les arêtes, propre au domaine ;
//  - `TRuntime` : l'environnement d'exécution opaque du domaine (AudioContext
//    côté audio, `null` côté domaine nombre). Le cœur ne l'utilise jamais, il
//    le transmet tel quel au plugin.
//
// `aretes` et `resultats` ne sont PAS dans le contrat : ce sont des détails
// internes du moteur. Les plugins accèdent aux valeurs via `entree()` et
// `entrees()`. Le cœur garantit que `entree(idx)` est non-null pour les ports
// obligatoires (validation avant exécution — cf. validerGraphe).
export interface ContexteExecution<TValeur, TRuntime> {
  noeud: { id: string; data: Record<string, unknown> };
  runtime: TRuntime;
  repertoireTravail: string;
  // Valeur sur l'entrée `index`. Le cœur garantit qu'elle est non-null pour les
  // ports obligatoires (requis !== false). Pour les ports optionnels, utiliser
  // `entrees()` qui peut contenir des null.
  entree: (index: number) => TValeur;
  // Toutes les valeurs branchées en entrée (dans l'ordre des arêtes), null pour
  // les entrées non connectées/non calculées. Le filtrage par type (ex. n'en
  // garder que les AudioBuffer) relève du domaine, pas du cœur.
  entrees: () => (TValeur | null)[];
  paramNombre: (nom: string, defaut: number) => number;
  paramTexte: (nom: string, defaut: string) => string;
  onProgress: (msg: string) => void;
  // Signal d'annulation du run courant (posé par le moteur si l'utilisateur
  // réinitialise un nœud pendant qu'il tourne — cf. useExecutionGraphe.ts).
  // Optionnel : la plupart des plugins sont assez rapides pour l'ignorer sans
  // conséquence. Un plugin avec une boucle longue (des dizaines de secondes ou
  // plus, ex. traitement piste par piste d'une grande collection) devrait
  // vérifier `signal?.aborted` entre deux itérations pour s'arrêter au plus
  // vite plutôt que de continuer en pure perte après un reset.
  signal?: AbortSignal;
}

// CONTRAT D'ÉCHEC (résumé — détail dans PORTING-A-DOMAIN.md §4) :
//  - un plugin qui échoue DOIT poser `erreur: true` (seul porteur d'un message
//    exploitable) ;
//  - filet du moteur : une sortie entièrement nulle sur un nœud qui a des ports
//    de sortie est traitée comme un échec, SAUF si la fiche déclare
//    `sortieNullePermise` (cf. PluginDef) ;
//  - l'erreur se propage transitivement à toute la descendance.
export type FonctionPlugin<TValeur, TRuntime> = (ctx: ContexteExecution<TValeur, TRuntime>) => Promise<{
  valeurs: TValeur[];
  message?: string;
  mp3Url?: string;
  // Échec déclaré. Ne pas compter sur le filet « tout-null » : lui seul ne
  // fournit aucun message, et un nœud sans port de sortie n'est pas couvert.
  erreur?: boolean;
}>;

export interface PortDef {
  // `type` = id d'un type de flux enregistré dans le domaine (voir
  // core/typesFlux). Le domaine audio déclare audio|midi|controle|texte|fichier
  // (spec §3.2) ; un autre domaine peut en déclarer d'autres. La couleur et la
  // compatibilité de connexion sont portées par le registre, plus par le cœur.
  nom: string;
  nomEn?: string;
  type: string;
  sousType?: "stereo" | "mono";
  dynamique?: boolean;
  // Port obligatoire ? Défaut: true. Le cœur valide (validerGraphe) que tout
  // port requis est connecté avant d'exécuter le nœud. Un port optionnel
  // (requis: false) peut être non connecté — le plugin gère le null via entrees().
  requis?: boolean;
  /**
   * Ce port de modulation pilote CE paramètre-là.
   *
   * POURQUOI SUR LE PORT ET NON AILLEURS. Un nœud doit pouvoir voir plusieurs de ses réglages
   * bouger à la fois — un vrai wah déplace sa coupure ET sa résonance, et mettre deux filtres en
   * série ne reproduit pas un filtre dont deux réglages bougent. Un port unique ne le permet pas,
   * et un port qui accepterait plusieurs courbes ne dirait pas laquelle va où : l'ordre des arêtes
   * déciderait du son, et réordonner un câble le changerait en silence. Un port par paramètre
   * modulable, nommant sa cible, enlève toute ambiguïté — et l'inspecteur en tire directement la
   * liste des réglages effectivement pilotés.
   */
  module?: string;
}

export interface ParametreDef {
  nom: string;
  nomEn?: string;
  type?: "choix" | "curseur" | "texte" | "dossier" | "nombre" | "sf2instrument" | "couleurs";
  options?: string[];
  optionsEn?: string[];
  optionIds?: string[];
  plage?: [number, number];
  pas?: number;
  defaut: string | number;
  defautEn?: string;
  unite?: string;
  // Unité affichée quand l'interface est en anglais. Sans elle, `unite` est
  // rendue telle quelle dans les deux langues — d'où des « 2 temps » et des
  // « 3 demi-tons » dans une interface anglaise, et dans COMPONENTS.md.
  // À laisser vide pour une unité qui ne se traduit pas (Hz, dB, ms, %…).
  uniteEn?: string;
  doc?: string;
  docEn?: string;
  placeholder?: string;
  placeholderEn?: string;
  hidden?: boolean;
  /**
   * Ce réglage est une borne de modulation, et nomme le paramètre qu'il encadre.
   *
   * POURQUOI LE DIRE AU LIEU DE LE LAISSER DEVINER. Un effet qui accepte une courbe porte trois
   * réglages dont DEUX sont toujours inertes : quand une courbe est branchée, le réglage d'origine
   * ne sert plus ; quand elle ne l'est pas, les deux bornes ne servent pas. L'interface les
   * affichait tous les trois de la même façon, et seule la documentation disait lequel comptait.
   * Cette déclaration lui permet de les réunir en une seule commande, à la place du paramètre
   * qu'elles pilotent et dans ses unités — un hertz n'étant pas un Q, une borne détachée de ce
   * qu'elle borne ne veut rien dire.
   */
  modulationDe?: string;
  /**
   * Le rang de l'entrée à laquelle ce réglage appartient. Il n'est affiché que si elle est branchée :
   * un nœud à huit pistes porte trente-deux réglages, dont ceux des pistes vides ne servent à rien.
   */
  port?: number;
}

// PAS de paramètre par défaut : un domaine DOIT expliciter son type de valeur et
// son runtime. C'est ce qui empêche un nouveau domaine de se lier silencieusement
// à l'union audio (cf. TypeValeur ci-dessus).
export interface PluginDef<TValeur, TRuntime> {
  id: string;
  nom: string;
  nomEn?: string;
  univers: string;
  famille: string;
  resume: string;
  resumeEn?: string;
  notice?: string;
  noticeEn?: string;
  entrees: PortDef[];
  sorties: PortDef[];
  parametres: ParametreDef[];
  executer: FonctionPlugin<TValeur, TRuntime>;
  etiquettes?: string[];

  // ── Indices pour le moteur ──
  // Agnostiques du domaine : ils décrivent un COMPORTEMENT du nœud, pas son
  // identité. Ils existent pour que le moteur n'ait jamais à tester un id de
  // plugin en dur (cf. ARCHITECTURE.md §12 : « sans modifier core »).

  // Ne jamais réutiliser un résultat mis en cache. Pour les nœuds à effet de
  // bord dont le résultat dépend d'un état externe (disque, réseau) que les
  // empreintes de paramètres et d'entrées ne capturent pas. Défaut : false.
  jamaisCache?: boolean;

  // Le nœud gère lui-même son affichage à partir de son `data` (typiquement une
  // source qui montre le média chargé). Le moteur ne matérialise alors pas ses
  // valeurs de sortie dans les champs d'affichage, pour ne pas écraser cet état.
  // Défaut : false.
  affichageAutonome?: boolean;

  // Ce que le nœud exige de la mémoire PENDANT son calcul (cf. core/memoire.ts).
  // « totale » : il ne peut pas commencer avant d'avoir le signal entier — un
  // étirement lit la fin pour écrire le début. « flux » : il avance échantillon
  // par échantillon et pourra, au-delà de DUREE_LONGUE_S, travailler par blocs.
  // Défaut : « totale », le comportement d'aujourd'hui — un nœud non typé ne
  // change donc pas de régime tant que personne n'a lu son algorithme.
  memoire?: ModeMemoire;

  // Une sortie entièrement nulle est un RÉSULTAT VALIDE pour ce nœud (ex. un
  // transcripteur qui n'a rien détecté, un nœud-frontière). Sans ce drapeau, le
  // filet du moteur traite « tout-null sur un nœud à sorties » comme un échec
  // (cf. FonctionPlugin). Défaut : false.
  sortieNullePermise?: boolean;

  // Le nœud passe après tous les autres nœuds du run, et un run lancé depuis lui porte sur le
  // graphe entier. Pour un nœud qui rend compte du travail de tout le graphe (cf.
  // plugins/grapheGlobal.ts) sans en recevoir de valeur par une arête. Défaut : false.
  executerEnDernier?: boolean;
}
