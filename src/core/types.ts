// core/types.ts — Types du moteur et du registre de plugins

export type StatutExecution = "attente" | "en_cours" | "termine" | "erreur";

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
  doc?: string;
  docEn?: string;
  placeholder?: string;
  placeholderEn?: string;
  hidden?: boolean;
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

  // Une sortie entièrement nulle est un RÉSULTAT VALIDE pour ce nœud (ex. un
  // transcripteur qui n'a rien détecté, un nœud-frontière). Sans ce drapeau, le
  // filet du moteur traite « tout-null sur un nœud à sorties » comme un échec
  // (cf. FonctionPlugin). Défaut : false.
  sortieNullePermise?: boolean;
}
