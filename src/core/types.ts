// core/types.ts — Types du moteur et du registre de plugins

import type { ModeMemoire } from "./memoire";

// LA VALEUR TRANSPORTÉE SUR LES ARÊTES N'EST PLUS NOMMÉE ICI, et c'est la dernière chose que le cœur
// savait du domaine audio. Elle l'était sous le nom `TypeValeur`, une union de six types dont
// `AudioBuffer` : le cœur ne manipule les valeurs que de façon opaque, mais il les énumérait.
//
// POURQUOI ELLE A PU PARTIR. Son propre commentaire disait la raison de sa présence : « elle vit
// encore dans le cœur uniquement parce que `core/metastore.ts` et `core/nodes-installes.ts` sont
// mono-domaine ». Ces deux modules fabriquent des fiches dérivées — un méta-composant, un node
// installé à chaud — dont les valeurs ne font que passer ; ils déclarent désormais
// `Registre<unknown, unknown>`, et la raison est tombée.
//
// Chaque domaine déclare donc son union et la passe en paramètre générique : `ValeurAudio` dans
// `audio/types-domaine.ts`, `number | string` dans `core/domaine-nombre.test.ts`. Les contrats
// ci-dessous n'ont aucun défaut, si bien que le compilateur l'exige.

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
  // Une SORTIE de ce nœud est-elle branchée ? Le cœur connaît les arêtes ; sans cela un plugin ne
  // peut pas savoir si ce qu'il s'apprête à calculer sera lu, et doit le calculer à tout hasard.
  //
  // POURQUOI C'EST DANS LE CONTRAT ET NON DANS UN DOMAINE. Le fait « un câble part-il d'ici » est
  // de la topologie, comme les entrées, et rien de ce qui le décide n'appartient à l'audio ou à
  // aucun autre domaine. C'est ce qui permet à une sortie chère d'être rendue seulement quand elle
  // sert : une sortie audio calculée sur chaque nœud à séquence coûtait 8,6 ms par seconde de son,
  // soit une seconde et demie par nœud sur une pièce de trois minutes, écoutée ou non.
  //
  // FACULTATIF : un appelant qui ne le fournit pas laisse le plugin faire comme avant.
  sortieBranchee?: (index: number) => boolean;
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
  // Échec déclaré. Ne pas compter sur le filet « tout-null » : lui seul ne
  // fournit aucun message, et un nœud sans port de sortie n'est pas couvert.
  erreur?: boolean;

  // ── Ce que le composant MONTRE, et c'est un canal déclaré ──
  //
  // POURQUOI CES DEUX CHAMPS EXISTENT. Un exécuteur ne pouvait rendre que des valeurs et un
  // message : tout ce qu'une vue de nœud doit afficher passait donc par un contournement,
  // `(ctx.noeud.data as any)._quelqueChose = …`, dans le sac non typé que l'interface partage
  // entre le moteur, les vues, la persistance, le copier-coller et la remise à zéro. Vingt-neuf
  // champs y étaient écrits par douze composants, et comme ce sac n'a ni type ni propriétaire, le
  // sens de chacun devait être redit ailleurs, dans sept ensembles globaux et une douzaine de
  // fichiers réénumérant les mêmes clés. Un contrat global est un contrat que le composant ne peut
  // ni déclarer ni vérifier : c'est ainsi qu'un champ nouveau survivait à une remise à zéro, et
  // qu'une liste modifiée pour un composant changeait le comportement des quatre cent quarante-huit.
  //
  // LES DEUX SE DISTINGUENT PAR CE QU'UN RÉGLAGE PÉRIME, et cela suffit à les classer sans liste.

  /**
   * Ce que ce run a PRODUIT, et que la vue montre.
   *
   * Une remise à zéro l'efface, et un changement de réglage aussi : le réglage vient de rendre
   * faux ce que le run avait calculé.
   */
  affichage?: Record<string, unknown>;

  /**
   * Ce que ce run a DÉSIGNÉ DE SES ENTRÉES, et que la vue montre.
   *
   * Une remise à zéro l'efface, un changement de réglage le garde : régler ce composant ne touche
   * pas à ce qu'il a reçu. C'est ce qui permet d'entendre un montage pendant qu'on le règle.
   *
   * On y DÉSIGNE, on n'y recopie pas : les tampons nommés là vivent déjà dans le cache
   * d'exécution des composants d'amont, et les nommer ne coûte rien de plus.
   */
  designe?: Record<string, unknown>;

  /**
   * Ce que le composant demande AU MOTEUR, et non à une vue.
   *
   * POURQUOI CE TROISIÈME CANAL EXISTE. Quatre composants parlaient déjà au moteur, et aucun n'avait
   * d'endroit pour le faire : ils écrivaient un champ convenu sur le nœud, que le moteur relisait
   * puis remettait à `undefined`. Cela portait un nom, `CHAMPS_SIGNAL_UNIQUE`, et c'était une
   * quatrième liste de noms de champs tenue à la main — la chose même que les deux autres canaux
   * ont supprimée. Un cinquième composant, l'export, écrivait le sien sans figurer dans cette liste.
   *
   * RIEN DE CECI NE SE POSE SUR LE NŒUD. Le moteur le lit dans le retour du run, agit, et n'en
   * garde rien : il n'y a donc ni classe à décider, ni remise à zéro à prévoir, ni champ à oublier.
   * C'est ce qui ramène les classes de trois à deux, la troisième n'ayant jamais décrit que des
   * champs qui n'avaient pas à être là.
   */
  moteur?: DemandeAuMoteur;
}>;

/** Ce qu'un composant peut demander au moteur. Voir `moteur` dans le retour d'un exécuteur. */
export interface DemandeAuMoteur {
  /**
   * Le graphe à embarquer dans le fichier que ce run écrit.
   *
   * Sérialisé, tel qu'il ira dans le WAV : un projet se retrouve ainsi dans le son qu'il a produit.
   */
  grapheAEmbarquer?: string;
  /**
   * Des nœuds et des arêtes à poser sur le canevas, décrits par leur fiche.
   *
   * Une arête désigne ses deux bouts par leur RANG dans `nodes`, et non par un identifiant : le
   * composant qui décrit un graphe ne connaît pas les identifiants que le canevas donnera.
   */
  grapheACreer?: {
    nodes: { ficheId: string; label: string }[];
    edges: { source: number; target: number }[];
  };
  /**
   * Un graphe TROUVÉ dans un fichier importé, à poser sur le canevas.
   *
   * Distinct du précédent parce qu'il arrive sous la forme d'un graphe enregistré, avec des
   * identifiants de nœuds, là où l'autre décrit des fiches et des rangs.
   */
  grapheTrouve?: { nodes: { id: string; ficheId: string }[]; edges: { source: string; target: string }[] };
  /** Un composant vient d'être installé : la palette doit se relire. */
  paletteARelire?: boolean;
}

export interface PortDef {
  // `type` = id d'un type de flux enregistré dans le domaine (voir
  // core/typesFlux). Le domaine audio déclare audio|midi|controle|texte|fichier
  // (spec §3.2) ; un autre domaine peut en déclarer d'autres. La couleur et la
  // compatibilité de connexion sont portées par le registre, plus par le cœur.
  nom: string;
  nomEn?: string;
  type: string;
  /**
   * Une précision sur le type, propre au domaine.
   *
   * ELLE ÉNUMÉRAIT `"stereo" | "mono"`, et c'était du vocabulaire audio dans le cœur — la dernière
   * fuite, trouvée en vérifiant plutôt qu'en la cherchant : mon garde interrogeait les noms de types
   * du domaine, pas son vocabulaire. Le cœur ne lit jamais ce champ ; seules les fiches le déclarent
   * et la documentation générée l'affiche. Il reste donc une chaîne, que chaque domaine remplit des
   * précisions qui ont un sens chez lui.
   */
  sousType?: string;
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

/**
 * Les genres de paramètre que le cœur connaît, parce que leur saisie ne suppose aucun domaine.
 *
 * `couleurs` EN FAIT PARTIE, ET CE N'EST PAS UNE EXCEPTION : une liste de couleurs se saisit par un
 * composant qui n'importe que React. N'importe quel domaine peut en vouloir une, comme il peut
 * vouloir un champ de texte ou un chemin de fichier.
 */
export type GenreParametreGenerique =
  | "choix" | "curseur" | "texte" | "fichier" | "dossier" | "nombre" | "couleurs";

/**
 * Le genre d'un paramètre : l'un de ceux du cœur, ou un genre propre au domaine.
 *
 * POURQUOI L'UNION EST OUVERTE. Elle nommait `"sf2instrument"`, c'est-à-dire un préréglage de
 * banque SoundFont : le cœur énumérait un genre de saisie que seul l'audio connaît, et l'inspecteur
 * portait la branche qui le rend. Un domaine d'images aurait hérité d'un genre de paramètre parlant
 * d'instruments. Le domaine déclare donc les siens, et les fait rendre par le registre de
 * `ui/widgets-parametre.ts`.
 *
 * `string & {}` garde l'autocomplétion des genres du cœur tout en acceptant les autres : sans cette
 * intersection, TypeScript réduirait l'union entière à `string` et plus rien ne serait suggéré.
 */
export type GenreParametre = GenreParametreGenerique | (string & {});

export interface ParametreDef {
  nom: string;
  nomEn?: string;
  type?: GenreParametre;
  options?: string[];
  optionsEn?: string[];
  optionIds?: string[];
  /**
   * Les libellés que ce choix a portés autrefois, et l'identifiant que chacun désignait.
   *
   * POURQUOI CE CHAMP EXISTE. Un projet enregistré garde la valeur d'un choix, et cette valeur se
   * résout par le RANG du libellé dans `options` ou `optionsEn`. Renommer un libellé, ou en insérer
   * un, rend donc injoignable une valeur ancienne : le projet rouvert retombe en silence sur le
   * défaut, ce qui change la musique sans rien dire. Ce champ nomme les anciens libellés, et rien
   * d'autre ne peut le faire à sa place : deux composants ont pu porter des libellés différents
   * pour la même option.
   */
  optionsHeritees?: Record<string, string>;
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
  /**
   * Les extensions proposées par le sélecteur d'un paramètre `"fichier"`, sans le point.
   *
   * UN CHEMIN NE S'ÉCRIT PAS À LA MAIN. Un paramètre qui désigne un fichier ou un dossier porte le
   * type `"fichier"` ou `"dossier"`, jamais `"texte"` : le champ reste saisissable, mais un bouton
   * ouvre le dialogue du système, qui seul donne un chemin exact. Sans extensions déclarées, le
   * dialogue accepte tout. La règle est vérifiée par `plugins/coherence-chemins.test.ts`.
   */
  extensions?: string[];
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
  /**
   * Ce réglage est une GRAINE d'aléa, et le moteur la résout avant que le composant ne la lise.
   *
   * POURQUOI LE DÉCLARER AU LIEU DE LE DEVINER — relevé par Fabien : « il y a un excès de
   * décentralisation, il faut le corriger partout où c'est possible, le fonctionnement sur les
   * graines doit être homogène ». Soixante-seize réglages de graine vivaient dans soixante-cinq
   * fichiers, et la convention du projet — zéro ou moins veut dire « tire au sort », et la graine
   * tirée se rend pour qu'un résultat réussi soit rejouable — n'était appliquée que par treize
   * d'entre eux. Ailleurs, une graine à zéro était une graine FIXE valant zéro, qui rendait toujours
   * la même chose, alors que la documentation de plusieurs annonçait le contraire.
   *
   * ET LE RÔLE SE DÉCLARE, IL NE SE CHERCHE PAS DANS LE NOM. Un garde qui reconnaîtrait une graine
   * à son libellé serait le même garde que celui qui a laissé passer cinq tables de gammes : il
   * marcherait jusqu'au premier composant qui l'appelle autrement. La déclaration est ici, et un cas
   * permanent refuse qu'un réglage nommé comme une graine ne la porte pas.
   *
   * CE QUE LE MOTEUR EN FAIT : il résout la valeur une fois par nœud et par run, la mélange au
   * numéro du tour quand une boucle le demande explicitement, et la rend telle quelle au composant.
   * Aucun composant n'a à changer : `hasardDuNoeud` est idempotente sur une graine déjà résolue.
   */
  graine?: true;
}

// PAS de paramètre par défaut : un domaine DOIT expliciter son type de valeur et
// son runtime. C'est ce qui empêche un nouveau domaine de se lier silencieusement
// à l'union d'un autre — celle de l'audio est `ValeurAudio`, dans
// `audio/types-domaine.ts`, et le cœur ne la nomme nulle part.
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

  // AUCUN LECTEUR AUDIO GENERIQUE SUR CE NŒUD : ses sorties audio sont des pairs, et aucune ne
  // représente à elle seule ce que le nœud produit — les six pistes d'un séparateur, les deux
  // canaux d'un dédoubleur. Ailleurs, l'aperçu joue la PREMIÈRE sortie audio, qui est le résultat
  // du nœud ; ses autres sorties audio, quand il en a, en sont des sous-produits — la réponse
  // impulsionnelle d'une réverbération, le résidu d'une analyse. La règle se lisait auparavant sur
  // le seul NOMBRE de sorties audio, ce qui privait de lecteur des nœuds dont la première sortie
  // est bel et bien le son traité. Défaut : false.
  sansApercuAudio?: boolean;

  // HORS CATALOGUE : cette fiche existe pour qu'un nœud se dessine et se câble, jamais pour être
  // choisie. `trouverDef` la rend, `tousLesPlugins` ne la rend pas.
  //
  // POURQUOI UNE PROPRIÉTÉ ET NON DES FILTRES. Ce qui énumère le registre est la palette, mais aussi
  // le quiz, le vocabulaire de génération de graphe, la documentation et le gestionnaire de nodes.
  // Filtrer à chacun de ces endroits, c'est autant d'occasions d'en oublier un, et un oubli ne se
  // voit pas : une fiche qui n'a rien à faire là passe pour un composant. Le fait se déclare donc une
  // fois, et un seul endroit l'honore. C'est le cas des bulles, dont la fiche est dérivée des membres
  // et n'existe que dans le projet qui les porte. Défaut : false.
  horsCatalogue?: boolean;

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

  // Les entrées de ce nœud s'affichent À LA DEMANDE : la fiche les déclare toutes, et chaque nœud
  // n'en dessine que ce qu'il utilise, avec deux boutons pour s'allonger et se raccourcir. Le
  // moteur, lui, les voit toutes — c'est un fait d'affichage (cf. ui/ports-extensibles.ts).
  entreesExtensibles?: { min: number; defaut: number };

  // Le nœud passe après tous les autres nœuds du run, et un run lancé depuis lui porte sur le
  // graphe entier. Pour un nœud qui rend compte du travail de tout le graphe (cf.
  // plugins/grapheGlobal.ts) sans en recevoir de valeur par une arête. Défaut : false.
  executerEnDernier?: boolean;

  // CHANGER UN RÉGLAGE RELANCE LE NŒUD, au lieu d'effacer son résultat et d'attendre qu'on relance.
  //
  // POURQUOI CE N'EST PAS LE COMPORTEMENT DE TOUS. Un changement de réglage périme le résultat : le
  // moteur l'efface, et l'on relance quand on veut. C'est ce qu'il faut pour un nœud dont le calcul
  // coûte des secondes, sinon régler un curseur lancerait dix rendus.
  //
  // Mais un nœud dont le calcul PROPRE est négligeable, et dont l'amont est en cache, se relance pour
  // presque rien — et son résultat effacé coûte, lui, très cher : le Montage porte une ligne de temps
  // qu'on règle EN ÉCOUTANT, et déplacer une piste faisait disparaître le son qu'on écoutait. Un
  // réglage qu'on ne peut pas juger à l'oreille ne se règle pas.
  //
  // La relance est temporisée par l'interface : le champ numérique de l'inspecteur écrit à chaque
  // frappe, et « 12,5 » lancerait trois fois. Défaut : false.
  relanceAutomatique?: boolean;

  // L'APERÇU DE CE NŒUD EST LE FICHIER QU'IL LIVRE, et non un résultat intermédiaire. L'interface
  // peut donc y attacher ce qu'un fichier livré doit porter : dans le domaine audio, un bloc de
  // métadonnées décrivant d'où vient le son.
  //
  // POURQUOI UNE PROPRIÉTÉ ET NON UNE LISTE D'IDENTIFIANTS. Le fait était écrit dans le shell, sous
  // la forme d'un tableau d'identifiants de composants du domaine, sur le chemin d'exécution de tous
  // les domaines. Deux défauts : ajouter un nœud d'export demandait de modifier un fichier d'UI, et
  // un autre domaine héritait d'une liste qui ne parlait pas de lui. Le nœud déclare donc le fait,
  // et le moteur le lui demande.
  //
  // CE N'EST PAS VRAI DE TOUS, et c'est pourquoi la propriété existe : calculer ces métadonnées
  // parcourt le son entier, et un aperçu qui n'est jamais livré ne vaut pas ce parcours.
  // Défaut : false.
  apercuEstLeFichier?: boolean;

  // LA SORTIE DE CE NŒUD PEUT TOMBER HORS DE LA PLAGE VALIDE DU DOMAINE, et doit donc passer par
  // son recadrage avant d'être livrée. C'est le cas des nœuds qui calculent leurs valeurs à partir
  // d'une expression ou d'un script fournis par l'utilisateur : rien ne les borne.
  //
  // POURQUOI UNE PROPRIÉTÉ ET NON UNE LISTE D'IDENTIFIANTS. Le fait était écrit dans le shell, sous
  // la forme de cinq identifiants de composants du domaine, sur le chemin d'exécution de tous les
  // domaines. Écrire un sixième nœud à formule demandait de modifier un fichier d'UI, et l'oubli ne
  // se voyait pas : la sortie partait simplement sans recadrage.
  //
  // LE RECADRAGE LUI-MÊME APPARTIENT AU DOMAINE. Le cœur ne dit que le fait ; ce qu'est une plage
  // valide et comment on y ramène une valeur, c'est au domaine de le savoir. Défaut : false.
  sortieHorsPlagePossible?: boolean;
}
