// audio/csound.ts — Enveloppe autour de Csound compilé en WebAssembly.
//
// Csound est un langage de synthèse écrit en 1986 par Barry Vercoe au MIT, descendant direct
// de MUSIC 11 et donc de MUSIC V — la lignée qui a inventé la synthèse numérique. Il compte
// environ mille neuf cents opcodes, dont plusieurs n'ont aucun équivalent ailleurs, et son
// portage WebAssembly permet de le faire tourner ici sans rien installer.
//
// Un programme Csound se compose de deux parties, et cette séparation est sa marque de
// fabrique : l'ORCHESTRE définit des instruments, la PARTITION dit quand les jouer et avec
// quels arguments. Les deux tiennent dans un fichier CSD.
//
// Cinq pièges ont été trouvés à la mesure pendant l'intégration, et ce module existe
// surtout pour les enfermer une fois pour toutes :
//
//  1. UNE SEULE INSTANCE. Créer un Csound par rendu fonctionne trois fois puis se BLOQUE
//     sans erreur au quatrième. L'instance est donc unique, au niveau du module, et réutilisée
//     — cinq rendus successifs mesurés à 127, 124, 101, 97 puis 91 ms, sans fuite.
//  2. SON SYSTÈME DE FICHIERS N'ÉCRASE RIEN, et c'est le piège le plus vicieux des cinq parce
//     qu'il réussit silencieusement. Voir `nomDuContenu`.
//  3. LIRE AVANT DE NETTOYER. `cleanup()` retronque le fichier de sortie à son en-tête de
//     quatre-vingts octets. On lit le WAV, ensuite seulement on remet Csound à zéro.
//  4. LA FRÉQUENCE D'ÉCHANTILLONNAGE EST IMPOSÉE par la carte son, souvent 48 kHz, et
//     `--sample-rate` est ignoré. On décode donc le WAV dans un contexte à 44 100 Hz : le
//     rééchantillonneur du décodeur fait la conversion, et il la fait BIEN — mesuré à 82,9 dB
//     de rapport signal/erreur à 10 kHz, là où une interpolation cubique donne 29 dB. Cette
//     conversion ne coûte rien puisqu'il fallait décoder de toute façon.
//  5. LA SORTIE PEUT DÉPASSER L'UNITÉ — crête de 2,18 mesurée sur un morphing spectral.
//     Csound ne limite pas, c'est à l'appelant de le faire.

import { bufferVersWavBlob } from "./io";

/** Fréquence d'échantillonnage d'Attic. Csound rend à celle de la carte, on ramène ici. */
export const FREQUENCE_ECH = 44100;

/**
 * Garde-fou : un orchestre qui ne s'arrête jamais ne doit pas figer le graphe.
 *
 * Un tampon de 4096 trames à 48 kHz fait douze appels par seconde de son : dix mille appels
 * couvrent donc largement un quart d'heure d'audio. Un plafond démesuré ne protégeait de
 * rien — avec quatre millions d'appels, un orchestre sans fin bloquait le graphe un quart
 * d'heure avant d'abandonner, et l'on ne savait pas pourquoi.
 */
const BLOCS_MAX = 10_000;

/**
 * Nombre de tentatives par rendu.
 *
 * Un rendu sur dix se perd : Csound annonce dans ses messages avoir écrit ses deux mille blocs
 * de huit kilo-octets, la partition va bien jusqu'à son terme, la crête annoncée est bonne — et
 * le fichier de sortie ne contient que son en-tête de quatre-vingts octets, avant comme après
 * `cleanup()`, à cinq lectures d'affilée. Les données n'arrivent jamais jusqu'au système de
 * fichiers virtuel, et rien du côté de l'appelant ne distingue un rendu perdu d'un rendu réussi
 * avant d'avoir lu le fichier.
 *
 * Mesuré sur quarante rendus identiques : quatre pertes, et les quatre rattrapées à la PREMIÈRE
 * reprise, jamais deux de suite. Les pertes sont donc indépendantes, et trois tentatives
 * ramènent le risque d'un rendu sur dix à un sur mille. Une reprise ne coûte que sur l'échec,
 * et le son est déjà écrit : il ne se réécrit pas.
 */
const TENTATIVES = 3;

export interface OptionsCsd {
  orchestre: string;
  partition: string;
  /** Options de ligne de commande supplémentaires. */
  options?: string[];
  nchnls?: number;
  ksmps?: number;
  /** Graine du hasard : Csound est reproductible si on la fixe. */
  graine?: number;
}

/**
 * Assemble un fichier CSD.
 *
 * `sr` n'est volontairement PAS écrit : le portage WebAssembly l'impose de toute façon, et
 * l'inscrire donnerait l'illusion d'un réglage qui n'en est pas un. `0dbfs = 1` fixe le
 * plein niveau à un, ce qui est la convention moderne et celle d'Attic.
 */
/**
 * Le nom du fichier de sortie tel qu'il est écrit dans le CSD.
 *
 * Il est SUBSTITUÉ par un nom unique juste avant le rendu : deux rendus ne doivent pas écrire
 * le même chemin, faute de quoi `readFile` rend une fois sur dix l'entrée de répertoire du
 * rendu précédent — c'est-à-dire l'en-tête de quatre-vingts octets laissé par son `cleanup()`,
 * et le nœud annonçait alors « l'orchestre n'a rien produit » sans rien avoir à se reprocher.
 * Mesuré à trois échecs sur vingt rendus identiques, zéro après.
 */
export const NOM_SORTIE = "sortie.wav";

export function construireCsd(o: OptionsCsd): string {
  // « -b 4096 » fixe le tampon logiciel à 4096 trames, ce qui n'a rien d'esthétique : c'est
  // le nombre d'échantillons que Csound calcule par appel de `performBuffer`, donc le pas
  // de notre boucle de rendu. Mesuré dans l'application, une boucle par bloc de ksmps
  // demandait des milliers d'allers-retours vers le worklet et mettait près d'une minute
  // par nœud ; avec ce tampon, il en faut une soixantaine pour cinq secondes.
  const options = [`-o ${NOM_SORTIE}`, "-W", "--format=float", "-m0", "-d", "-b 4096",
    ...(o.options ?? [])];
  const entetes = [
    `ksmps = ${Math.max(1, Math.floor(o.ksmps ?? 32))}`,
    `nchnls = ${Math.max(1, Math.min(2, Math.floor(o.nchnls ?? 1)))}`,
    "0dbfs = 1",
    o.graine !== undefined ? `seed ${Math.max(0, Math.floor(o.graine))}` : "",
  ].filter(Boolean);
  return [
    "<CsoundSynthesizer>",
    "<CsOptions>",
    options.join(" "),
    "</CsOptions>",
    "<CsInstruments>",
    ...entetes,
    o.orchestre.trim(),
    "</CsInstruments>",
    "<CsScore>",
    o.partition.trim(),
    // Le « e » final ferme la partition : sans lui, Csound n'a aucune raison de s'arrêter.
    /(^|\n)\s*e\s*(\n|$)/.test(o.partition) ? "" : "e",
    "</CsScore>",
    "</CsoundSynthesizer>",
  ].filter((l) => l !== "").join("\n");
}

// ── D'où vient le code ──────────────────────────────────────────────────────────
//
// Un orchestre et une partition peuvent venir de deux endroits : du champ de l'inspecteur, où
// l'utilisateur les écrit, ou d'un autre nœud du graphe qui les a produits. La règle d'Attic est
// celle d'ABC → MIDI et de la continuation Stable Audio : une entrée texte branchée et non vide
// gagne, et le champ de l'inspecteur reste l'exemple qui travaille quand rien n'est branché.
//
// La partition a une source de plus, le MIDI, et c'est elle qui l'emporte sur les deux autres.
// Ce qui manquait n'était pas la règle mais sa VISIBILITÉ : on éditait un champ que le nœud
// ignorait sans un mot. D'où ces fonctions, qui rendent la source choisie pour que le nœud
// puisse la nommer.

/** D'où vient un texte : de l'entrée branchée, ou du champ de l'inspecteur. */
export type Provenance = "port" | "inspecteur";

export function texteBranche(port: unknown, champ: string): { texte: string; provenance: Provenance } {
  return typeof port === "string" && port.trim()
    ? { texte: port, provenance: "port" }
    : { texte: champ, provenance: "inspecteur" };
}

/** Les trois sources possibles d'une partition, dans l'ordre de priorité. */
export type SourcePartition = "midi" | "port" | "inspecteur";

/**
 * Choisit la source de la partition, et dit ce qui a été laissé de côté.
 *
 * Le MIDI l'emporte : une note branchée est un acte plus explicite qu'un champ resté rempli, et
 * plus explicite aussi qu'un texte que le graphe a produit. Quand les deux entrées sont
 * branchées à la fois, celle qui n'a pas servi est rendue dans `ignoree` — pour être dite, pas
 * pour être tue.
 */
export function sourcePartition(
  notesMidi: number, port: unknown,
): { source: SourcePartition; ignoree: "port" | null } {
  const porteDuTexte = typeof port === "string" && port.trim().length > 0;
  if (notesMidi > 0) return { source: "midi", ignoree: porteDuTexte ? "port" : null };
  if (porteDuTexte) return { source: "port", ignoree: null };
  return { source: "inspecteur", ignoree: null };
}

/**
 * L'orchestre lit-il ce fichier d'entrée ?
 *
 * Un son branché sur un nœud Csound est écrit dans le système de fichiers virtuel, et il ne s'y
 * passe rien de plus : c'est l'orchestre qui décide de le lire, par `diskin2` ou `soundin`. Un
 * son branché et un orchestre qui ne le nomme jamais est donc presque toujours un oubli, et le
 * nœud rendait jusqu'ici un son inchangé sans rien dire.
 *
 * Les commentaires sont retirés avant de chercher : un `diskin2` mis en commentaire pendant un
 * essai ne doit pas passer pour une lecture. Csound commente par point-virgule, par double
 * barre oblique, et par blocs à l'étoile comme en C.
 */
export function orchestreLit(orchestre: string, nom: string): boolean {
  const sansCommentaires = orchestre
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/(;|\/\/).*$/, ""))
    .join("\n");
  return sansCommentaires.includes(nom);
}

export interface NoteCsound {
  note: number;
  velocite: number;
  debut: number;
  fin: number;
}

/**
 * Écrit une partition depuis des notes MIDI.
 *
 * La convention retenue, et elle est documentée dans les nœuds : `p4` porte la FRÉQUENCE en
 * hertz plutôt que le numéro de note, et `p5` l'amplitude de zéro à un. C'est ce qui permet
 * d'écrire un orchestre sans se soucier de la conversion, et c'est l'usage le plus répandu
 * dans les exemples de Csound.
 */
export function partitionDepuisNotes(notes: NoteCsound[], instrument = 1): string {
  return [...notes]
    .sort((a, b) => a.debut - b.debut || a.note - b.note)
    .map((n) => {
      const duree = Math.max(0.01, n.fin - n.debut);
      const frequence = 440 * 2 ** ((n.note - 69) / 12);
      return `i${instrument} ${n.debut.toFixed(4)} ${duree.toFixed(4)} `
        + `${frequence.toFixed(3)} ${(n.velocite / 127).toFixed(3)} ${n.note}`;
    })
    .join("\n");
}

/**
 * Ne garde des messages de Csound que ce qui aide.
 *
 * Csound est bavard : il imprime sa version, ses modules, et dessine même les tables de
 * fonction en ASCII. Ce qui intéresse l'utilisateur d'un nœud, ce sont les erreurs.
 */
export function messagesUtiles(messages: string[]): string[] {
  const interessant = /error|erreur|warning|attention|unknown opcode|syntax|cannot|illegal|not found|used before|undefined/i;
  const bruit = /^--Csound version|^\[commit|^libsndfile|^graphics suppressed|^sr =|^0dBFS|^orch now loaded|^audio buffered|^rtaudio|^reading \d|^writing \d|^SECTION|^ftable|^new alloc|^inactive allocs|^end of score|^Elapsed time|^\d+ \d+ sample blks|^B\s+\d|^\s*[_.'\- ]+$/;
  return messages
    .flatMap((m) => m.split("\n"))
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !bruit.test(l))
    .filter((l) => interessant.test(l) || /^instr \d+|^Score finished/.test(l) === false)
    .slice(0, 40);
}

/**
 * Cherche la première ligne d'erreur, pour le message du nœud.
 *
 * Csound termine TOUJOURS par « 0 errors in performance », qui annonce l'absence d'erreur et
 * contient le mot. Cette ligne se faisait prendre pour la cause de tous les rendus vides ou
 * silencieux, et le nœud l'affichait à l'utilisateur comme explication — la pire des réponses,
 * puisqu'elle dit le contraire de ce qu'elle semble dire. Un bilan non nul, lui, est gardé :
 * les vraies lignes d'erreur le précèdent de toute façon, et c'est la première qui est rendue.
 */
export function premiereErreur(messages: string[]): string | null {
  for (const ligne of messages.flatMap((m) => m.split("\n"))) {
    if (/^\s*0 errors? in performance/i.test(ligne.trim())) continue;
    if (/error|unknown opcode|syntax error|used before|cannot find/i.test(ligne)) {
      return ligne.trim().slice(0, 200);
    }
  }
  return null;
}

/**
 * Limite la sortie à l'unité, par écrasement doux.
 *
 * Csound ne borne rien : un orchestre mal réglé rend des crêtes au-delà de un, et le buffer
 * saturerait à la lecture. On écrase donc au-dessus d'un seuil au lieu de normaliser, pour
 * que deux rendus successifs gardent le même niveau relatif.
 */
export function limiter(canaux: Float32Array[], seuil = 0.95): number {
  let crete = 0;
  for (const c of canaux) {
    for (let i = 0; i < c.length; i++) crete = Math.max(crete, Math.abs(c[i]));
  }
  if (crete <= seuil) return crete;
  const gain = seuil / crete;
  for (const c of canaux) {
    for (let i = 0; i < c.length; i++) c[i] *= gain;
  }
  return crete;
}

// ── Exécution ───────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
let instance: any = null;
let chargement: Promise<any> | null = null;
let addModuleAdapte = false;
/**
 * Les noms déjà présents dans le système de fichiers virtuel.
 *
 * Il suit l'instance : elle n'est jamais détruite, ses fichiers ne s'effacent pas, et comme
 * chaque nom vaut pour un seul contenu, savoir qu'un nom est là suffit à ne pas le réécrire.
 */
const fichiersEcrits = new Set<string>();
/** Numéro de rendu, qui donne au fichier de sortie un nom que personne n'a encore porté. */
let numeroRendu = 0;

/**
 * Fait accepter le worklet de Csound par la politique de sécurité de l'application.
 *
 * Csound charge son AudioWorklet depuis une URL « data: ». Or le CSP d'Attic autorise
 * « blob: » dans script-src mais PAS « data: », si bien que `addModule` échouait sur
 * « AbortError: Unable to load a worklet's module » — et seulement dans l'application, une
 * page de test isolée n'ayant aucun CSP. Diagnostic mesuré : un worklet en blob passe, le
 * même en data: est refusé.
 *
 * On convertit donc la data: URL en blob avant de la passer. L'alternative était d'ajouter
 * « data: » au script-src de l'application, ce qui aurait relâché sa sécurité pour tous ses
 * scripts au bénéfice d'une seule dépendance. Le correctif est ici, et il est neutre pour
 * tous les autres appelants : une URL qui n'est pas en data: passe telle quelle.
 */
function adapterAddModule(): void {
  if (addModuleAdapte || typeof AudioWorklet === "undefined") return;
  addModuleAdapte = true;
  const original = AudioWorklet.prototype.addModule;
  AudioWorklet.prototype.addModule = function (url: string, options?: WorkletOptions) {
    if (typeof url === "string" && url.startsWith("data:")) {
      const virgule = url.indexOf(",");
      const entete = url.slice(0, virgule);
      const charge = url.slice(virgule + 1);
      const source = entete.includes(";base64") ? atob(charge) : decodeURIComponent(charge);
      const blob = URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
      return original.call(this, blob, options);
    }
    return original.call(this, url, options);
  };
}

/**
 * L'instance unique, créée à la première demande.
 *
 * On ne la détruit jamais : la détruire pour en recréer une mène au blocage décrit en tête
 * de fichier. Elle est remise à zéro entre deux rendus, ce qui suffit.
 */
async function obtenirCsound(): Promise<any> {
  if (instance) return instance;
  if (!chargement) {
    chargement = (async () => {
      adapterAddModule();
      const { Csound } = await import("@csound/browser");
      const cs = await Csound({ useWorker: false, useSAB: false, autoConnect: false });
      if (!cs) throw new Error("Csound n'a pas pu être initialisé");
      instance = cs;
      return cs;
    })();
  }
  return chargement;
}

export interface EntreeFichier {
  nom: string;
  buffer: AudioBuffer;
  /**
   * Garder les deux canaux. Par défaut le fichier est écrit en MONO, et ce n'est pas un
   * détail : `diskin2` de Csound exige que le nombre de sorties demandées corresponde au
   * nombre de canaux du fichier, et refuse la note sinon. Un orchestre écrit pour du mono
   * — ce que tout le monde écrit d'abord — échouait donc dès qu'on lui branchait un son
   * stéréo, avec pour seule trace « number of output args inconsistent with number of file
   * channels » au fond des messages. Le mono par défaut rend le nœud prévisible ; qui lit
   * deux canaux dans son orchestre demande explicitement le stéréo.
   */
  stereo?: boolean;
}

/**
 * Nomme un fichier d'après son CONTENU, parce que le système de fichiers de Csound n'écrase pas.
 *
 * Mesuré sur `@csound/browser` 6.17.3 : écrire deux fois le même chemin avec des octets
 * différents laisse le PREMIER contenu en place, et `readdir("/")` montre alors trois entrées
 * du même nom après trois écritures — la couche JavaScript empile des entrées de répertoire au
 * lieu de remplacer le fichier, et la lecture rend toujours la première. `unlink()` tient sa
 * promesse sans rien effacer : le fichier se relit juste après. Une réécriture plus courte ne
 * tronque pas davantage.
 *
 * Conséquence dans l'application, et c'est ainsi que le défaut a été signalé : le premier son
 * branché sur un nœud Csound restait dans la sortie pour toute la session, même débranché,
 * même remplacé par un autre. L'orchestre lisait « entree1.wav », et ce nom désignait pour
 * toujours le premier son écrit.
 *
 * Le contournement ne peut donc pas être d'effacer : il faut ne jamais réutiliser un nom pour
 * un contenu différent. Le nom devient une empreinte des octets, ce qui donne les deux
 * propriétés voulues d'un coup : deux sons différents ont deux fichiers, et le MÊME son
 * réexécuté retrouve le sien sans rien écrire — un graphe relancé à l'identique n'accumule
 * rien. L'empreinte est un FNV-1a sur 64 bits, en deux moitiés indépendantes ; sur un mégaoctet
 * elle coûte moins d'une milliseconde, à comparer aux dizaines de millisecondes du rendu.
 */
export function nomDuContenu(octets: Uint8Array, suffixe: string): string {
  // FNV-1a, deux graines différentes : 32 bits collisionneraient une fois sur deux à
  // soixante-cinq mille fichiers, et une collision ramènerait exactement le défaut corrigé ici.
  let a = 0x811c9dc5, b = 0x01000193;
  for (let i = 0; i < octets.length; i++) {
    a = ((a ^ octets[i]) * 0x01000193) >>> 0;
    b = ((b ^ octets[i]) * 0x85ebca6b) >>> 0;
  }
  const hexa = a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
  return `e${hexa}-${suffixe}`;
}

/**
 * Remplace un nom de fichier dans un CSD, partout où il apparaît.
 *
 * Les noms apparaissent entre guillemets dans l'orchestre (`diskin2 "entree1.wav", 1`) et dans
 * la partition (`f1 0 0 1 "entree1.wav" 0 0 0`), parfois plusieurs fois. Un remplacement
 * littéral suffit et évite d'échapper quoi que ce soit ; les appelants continuent d'écrire les
 * noms simples qu'ils ont toujours écrits, sans rien savoir de tout ceci.
 */
export function substituerNom(csd: string, ancien: string, nouveau: string): string {
  return csd.split(ancien).join(nouveau);
}

/** Réduit un buffer à un canal, par moyenne. */
function versMono(buffer: AudioBuffer): AudioBuffer {
  if (buffer.numberOfChannels === 1) return buffer;
  const mono = new AudioBuffer({
    numberOfChannels: 1, length: buffer.length, sampleRate: buffer.sampleRate,
  });
  const sortie = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) sortie[i] += d[i] / buffer.numberOfChannels;
  }
  mono.copyToChannel(sortie, 0);
  return mono;
}

export interface ResultatCsound {
  audio: AudioBuffer | null;
  erreur: string | null;
  messages: string[];
  /** Nombre de blocs de contrôle calculés : proportionnel à la durée rendue. */
  blocs: number;
  ms: number;
  /** Crête avant limitation : au-delà de 1, l'orchestre sature. */
  crete: number;
}

/**
 * Rend un CSD et en ramène un AudioBuffer à 44 100 Hz.
 *
 * Les fichiers d'entrée sont écrits en WAV dans le système de fichiers virtuel, où
 * `diskin2` et `soundin` savent les lire par leur nom.
 */
/**
 * File d'attente : les rendus passent UN À UN.
 *
 * L'instance de Csound étant unique et portant son propre état — orchestre compilé, fichiers,
 * position dans la partition —, deux nœuds qui rendraient en même temps se marcheraient
 * dessus : le second compilerait par-dessus le premier, et les boucles de blocs
 * s'entremêleraient. Le moteur d'Attic exécute en ordre topologique, mais rien ne garantit
 * qu'il n'exécutera jamais deux branches indépendantes de front, et ce serait alors
 * indéboguable. La file rend la question sans objet.
 */
let queue: Promise<unknown> = Promise.resolve();

export function rendreCsd(
  csd: string, entrees: EntreeFichier[] = [],
): Promise<ResultatCsound> {
  const suivant = queue.then(() => rendreCsdSansFile(csd, entrees), () => rendreCsdSansFile(csd, entrees));
  queue = suivant.catch(() => undefined);
  return suivant;
}

async function rendreCsdSansFile(
  csd: string, entrees: EntreeFichier[] = [],
): Promise<ResultatCsound> {
  const debut = performance.now();
  const messages: string[] = [];
  const vide: ResultatCsound = { audio: null, erreur: null, messages, blocs: 0, ms: 0, crete: 0 };
  let csound: any;
  try {
    csound = await obtenirCsound();
  } catch (e) {
    return { ...vide, erreur: e instanceof Error ? e.message : String(e) };
  }

  const collecter = (m: string) => { messages.push(String(m)); };
  csound.on?.("message", collecter);
  try {
    // Chaque entrée est écrite sous un nom tiré de ses octets, et le CSD est réécrit pour
    // lire ce nom-là. Les noms les plus longs d'abord : un nom ne doit pas être substitué
    // dans le résultat de la substitution d'un autre.
    let programme = csd;
    for (const e of [...entrees].sort((x, y) => y.nom.length - x.nom.length)) {
      const buffer = e.stereo ? e.buffer : versMono(e.buffer);
      const octets = new Uint8Array(await bufferVersWavBlob(buffer).arrayBuffer());
      const nom = nomDuContenu(octets, e.nom);
      // Déjà écrit : le fichier porte le même contenu, puisque son nom EST son contenu.
      if (!fichiersEcrits.has(nom)) {
        await csound.fs.writeFile(`/${nom}`, octets);
        fichiersEcrits.add(nom);
      }
      programme = substituerNom(programme, e.nom, nom);
    }
    // `performBuffer` calcule un tampon entier par appel là où `performKsmps` n'en fait
    // qu'un bloc de contrôle : autant de résultat pour bien moins d'allers-retours. On
    // retombe sur `performKsmps` si le portage ne l'expose pas.
    const avancer: () => Promise<number> = typeof csound.performBuffer === "function"
      ? () => csound.performBuffer()
      : () => csound.performKsmps();

    let octets = new Uint8Array(0);
    let blocs = 0;
    let sansFin = false;
    for (let essai = 1; essai <= TENTATIVES; essai++) {
      // La sortie porte un nom neuf à chaque tentative. Ce nom-là ne s'accumule pas : le
      // `cleanup()` de la fin retronque le fichier à son en-tête dès qu'il est lu, et il ne
      // reste qu'une entrée de répertoire de quatre-vingts octets.
      const nomSortie = `sortie-${++numeroRendu}.wav`;
      const code = await csound.compileCsdText(substituerNom(programme, NOM_SORTIE, nomSortie));
      if (code !== 0) {
        // Remettre l'instance à zéro même ici : la laisser avec un orchestre à moitié compilé
        // fait que le rendu SUIVANT ne s'arrête jamais — mesuré, et c'est indéchiffrable.
        await csound.reset?.();
        return {
          ...vide,
          erreur: premiereErreur(messages) ?? `compilation refusée (code ${code})`,
          ms: performance.now() - debut,
        };
      }
      await csound.start();
      blocs = 0;
      while (blocs < BLOCS_MAX && (await avancer()) === 0) blocs++;
      sansFin = blocs >= BLOCS_MAX;

      // LIRE MAINTENANT : cleanup() retronque le fichier à son en-tête.
      octets = await csound.fs.readFile(`/${nomSortie}`);
      await csound.cleanup?.();
      await csound.reset?.();
      // Pas d'effacement des entrées : `unlink()` résout sans effacer (voir `nomDuContenu`), et
      // les fichiers n'ont plus besoin de disparaître puisqu'un nom ne désigne qu'un contenu.

      if (sansFin || octets.length > 128) break;
      messages.push(`(tentative ${essai} perdue : ${octets.length} octets écrits)`);
    }

    if (sansFin) {
      return {
        ...vide,
        erreur: "la partition ne se termine pas : vérifiez qu'elle finit par « e » et qu'aucune"
          + " durée n'est infinie",
        blocs,
        ms: performance.now() - debut,
      };
    }
    if (octets.length <= 128) {
      return {
        ...vide,
        // La taille est dite : un fichier de quatre-vingts octets est un en-tête WAV seul, et
        // c'est une panne du côté de Csound, pas une erreur d'orchestre.
        erreur: premiereErreur(messages)
          ?? `l'orchestre n'a rien produit (fichier de sortie de ${octets.length} octets)`,
        blocs,
        ms: performance.now() - debut,
      };
    }

    // Décodage DANS un contexte à 44 100 Hz : c'est lui qui fait la conversion de taux.
    const decodeur = new OfflineAudioContext(1, 1, FREQUENCE_ECH);
    const audio = await decodeur.decodeAudioData(
      octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) as ArrayBuffer,
    );
    const canaux: Float32Array[] = [];
    for (let c = 0; c < audio.numberOfChannels; c++) canaux.push(audio.getChannelData(c));
    const crete = limiter(canaux);
    // Recopie explicite : `getChannelData` peut rendre une vue ou une copie selon
    // l'implémentation, et l'on veut que la limitation compte dans les deux cas.
    for (let c = 0; c < audio.numberOfChannels; c++) {
      audio.copyToChannel(new Float32Array(canaux[c]), c);
    }

    // Un orchestre peut « réussir » en ne produisant que du silence : Csound signale alors
    // une erreur d'initialisation et rend un fichier plein de zéros. Mesuré sur un
    // diskin2 mal apparié, le nœud annonçait un succès de trois secondes muettes. On
    // remonte donc l'erreur quand le rendu est silencieux — et faute d'erreur imprimée, on le
    // dit quand même, plutôt que de rendre un buffer vide en annonçant un succès.
    if (crete < 1e-6) {
      return {
        ...vide,
        erreur: premiereErreur(messages) ?? "le rendu est silencieux",
        blocs,
        ms: performance.now() - debut,
      };
    }
    return { audio, erreur: null, messages, blocs, ms: performance.now() - debut, crete };
  } catch (e) {
    return {
      ...vide,
      erreur: e instanceof Error ? e.message : String(e),
      ms: performance.now() - debut,
    };
  } finally {
    csound.removeListener?.("message", collecter);
  }
}
