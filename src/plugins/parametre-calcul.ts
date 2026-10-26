// plugins/parametre-calcul.ts — Le périphérique sur lequel un modèle tourne, déclaré une fois.
//
// ═══ CE QUE CES IDENTIFIANTS SONT, ET POURQUOI ILS NE VALENT PAS PARTOUT ═══
//
// Ce sont les périphériques que comprennent les binaires joints par le PONT NATIF de la famille
// ACE-Step et sherpa : la chaîne vide pour « laisse le moteur choisir », puis `CPU`, `Vulkan0`,
// `Vulkan1`, `CUDA0`. Ils voyagent tels quels jusqu'au binaire, qui les lit.
//
// HUIT DÉCLARATIONS PORTAIENT CETTE LISTE, identiques identifiant pour identifiant, et rien ne
// les tenait ensemble. Un périphérique ajouté au moteur aurait dû être écrit huit fois, et c'est
// la neuvième copie — celle qu'on oublie — qui aurait fait diverger deux nœuds voisins.
//
// ═══ ET ELLE NE VAUT PAS POUR TOUS LES NŒUDS À MODÈLE, CE QUI EST MESURÉ ═══
//
// « Bruitage IA » passe par Stable Audio 3, qui tourne sous DIRECTML et non sous Vulkan ou CUDA :
// voir `electron/stable-audio-3.cjs`, dont la table des fournisseurs ne connaît que `auto`,
// `carte` et `processeur`. Lui donner CETTE liste-ci rendrait TROIS OPTIONS SUR CINQ INERTES, et
// en silence : `FOURNISSEURS[calcul] ?? FOURNISSEURS.auto` retombe sur « auto » pour tout
// identifiant qu'il ne connaît pas. Un réglage qui ne peut rien changer est précisément ce que le
// contrat de composant interdit, et c'est pourquoi ce nœud garde son vocabulaire.
//
// DE MÊME, LES NŒUDS QUI TOURNENT DANS LA PAGE n'ont rien à faire de ces noms : `audio/ia.ts`
// choisit entre « CPU (WASM) » et « GPU (WebGPU) », et Demucs comme l'esthétique tournent sous
// `onnxruntime-node` en processeur dur. Trois moteurs, trois vocabulaires ; un seul est ici.
//
// ═══ LA PHRASE D'INVARIANCE APPARTIENT AU NŒUD, ET NON À LA LISTE ═══
//
// Chacun dit ce que le périphérique NE change PAS chez lui — les instants trouvés, les mots, les
// tours de parole, les notes, le texte rendu —, et « Restaurer un compressé » va jusqu'à donner
// sa mesure. C'est la seule part du texte qui diffère d'un nœud à l'autre, et c'est la seule qui
// vaut d'être lue : elle est donc passée en argument plutôt que perdue dans la mise en commun.

/**
 * Les périphériques que les binaires du pont acceptent. La chaîne vide les laisse choisir.
 *
 * UNE LISTE ET NON UN CHAMP LIBRE. Le contrat des réglages le dit : dès qu'on peut mettre une
 * glissière, une liste déroulante ou un sélecteur, il faut le faire, et le champ libre n'est
 * légitime que pour ce qui n'est pas une valeur. Les périphériques sont une poignée de noms que
 * le moteur reconnaît ; ils se choisissent, ils ne s'écrivent pas.
 */
const CALCULS = [
  { id: "", fr: "Automatique", en: "Automatic" },
  { id: "CPU", fr: "Processeur", en: "Processor" },
  { id: "Vulkan0", fr: "Vulkan 0", en: "Vulkan 0" },
  { id: "Vulkan1", fr: "Vulkan 1", en: "Vulkan 1" },
  { id: "CUDA0", fr: "CUDA 0", en: "CUDA 0" },
];

/** Les identifiants, pour le garde qui refuse qu'une seconde liste apparaisse ailleurs. */
export const IDS_CALCUL: readonly string[] = CALCULS.map((c) => c.id);

const COMMUN_FR = "« Automatique » laisse le moteur prendre ce qu'il juge le meilleur, ce qui n'est"
  + " pas toujours la carte graphique : une machine à deux cartes expose souvent le circuit intégré"
  + " en premier, et les deux numéros sont là pour les départager. « Processeur » tourne partout,"
  + " et bien plus lentement.";

const COMMUN_EN = "« Automatic » lets the engine take what it deems best, which is not always the"
  + " graphics card: a machine with two cards often exposes the integrated one first, and the two"
  + " numbers are there to tell them apart. « Processor » runs everywhere, and far more slowly.";

/**
 * Le réglage de périphérique d'un nœud du pont.
 *
 * `invariance` dit ce que le choix NE change PAS sur CE nœud — ce que l'utilisateur a besoin de
 * savoir avant d'y toucher. L'omettre ne laisse que le texte commun, ce qui convient aux nœuds
 * dont le rendu varie légitimement d'un périphérique à l'autre.
 */
export const parametreCalcul = (invariance?: string, invarianceEn?: string) => ({
  nom: "Calcul", nomEn: "Compute", type: "choix" as const,
  options: CALCULS.map((c) => c.fr), optionsEn: CALCULS.map((c) => c.en),
  optionIds: CALCULS.map((c) => c.id),
  defaut: "Automatique", defautEn: "Automatic",
  doc: `Le périphérique de calcul.${invariance ? ` ${invariance}` : ""} ${COMMUN_FR}`,
  docEn: `The compute device.${invarianceEn ? ` ${invarianceEn}` : ""} ${COMMUN_EN}`,
});

/** Le réglage sans phrase d'invariance, pour les nœuds qui n'en déclarent pas. */
export const PARAMETRE_CALCUL = parametreCalcul();

// ═══ LE SECOND VOCABULAIRE : DIRECTML, ET IL EST DÉCLARÉ ICI POUR LA MÊME RAISON ═══
//
// Les nœuds qui tournent sous `onnxruntime-node` ne choisissent pas entre Vulkan et CUDA mais
// entre le processeur et la carte, DirectML n'exposant qu'elle. Deux nœuds l'emploient, et ils
// l'écrivaient chacun de leur côté — la même duplication que celle du pont, en plus petit.
//
// « AUTOMATIQUE » REPLIE, LES DEUX AUTRES NON, et ce n'est pas un détail de style : le paquet
// musical de Stable Audio est exporté en int4, que DirectML refuse à l'initialisation avec
// `80070057`. Qui demande un périphérique veut savoir s'il répond, et non obtenir l'autre sans
// être prévenu.

const CALCULS_DML = [
  { id: "auto", fr: "Automatique", en: "Automatic" },
  { id: "carte", fr: "Carte graphique", en: "Graphics card" },
  { id: "processeur", fr: "Processeur", en: "Processor" },
];

/** Les identifiants DirectML, pour le garde. */
export const IDS_CALCUL_DML: readonly string[] = CALCULS_DML.map((c) => c.id);

const DML_FR = "« Automatique » essaie la carte graphique et retombe sur le processeur si elle"
  + " refuse le modèle. « Carte graphique » et « Processeur » imposent l'un ou l'autre, et"
  + " signalent un refus plutôt que d'employer l'autre sans prévenir.";

const DML_EN = "« Automatic » tries the graphics card and falls back to the processor if it"
  + " refuses the model. « Graphics card » and « Processor » impose one or the other, and report"
  + " a refusal rather than using the other without warning.";

/** Le réglage de périphérique d'un nœud qui tourne sous `onnxruntime-node`. */
export const parametreCalculDirectML = (mesure?: string, mesureEn?: string) => ({
  nom: "Calcul", nomEn: "Compute", type: "choix" as const,
  options: CALCULS_DML.map((c) => c.fr), optionsEn: CALCULS_DML.map((c) => c.en),
  optionIds: CALCULS_DML.map((c) => c.id),
  defaut: "Automatique", defautEn: "Automatic",
  doc: `Le périphérique de calcul.${mesure ? ` ${mesure}` : ""} ${DML_FR}`,
  docEn: `The compute device.${mesureEn ? ` ${mesureEn}` : ""} ${DML_EN}`,
});
