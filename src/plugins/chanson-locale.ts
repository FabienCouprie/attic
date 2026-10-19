// plugins/chanson-locale.ts — Deux nœuds : planifier une chanson, puis la rendre.
//
// POURQUOI DEUX ET NON UN. Le moteur travaille en deux temps : un planificateur écrit les paroles,
// les métadonnées et les codes audio, puis un rendu en tire le son. Les séparer laisse CORRIGER LE
// PLAN entre les deux — les paroles sortent en texte, donc elles se lisent, se retouchent et
// rentrent par l'autre nœud — et rendre plusieurs fois le même plan sans le replanifier, ce qui
// coûte une minute de calcul à chaque fois.
//
// LE PLAN VOYAGE EN TEXTE, et c'est délibéré. C'est le document JSON que le moteur écrit et relit ;
// le faire circuler tel quel évite d'inventer un type de flux pour un seul couple de nœuds, et un
// graphe enregistré garde le plan avec lui.
//
// LE CALCUL EST UN RÉGLAGE, PAS UNE DEVINETTE. Mesuré sur la machine de Fabien : le moteur offre
// deux périphériques Vulkan, et le premier est le circuit intégré, pas la carte graphique. Laisser
// « le meilleur disponible » choisir, c'est accepter de tourner onze fois plus lentement sans le
// savoir.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { annoncerModele } from "./message-modele";
import { messageEchecPont } from "./pont-electron";

const LANGUES = [
  { id: "fr", fr: "Français", en: "French" },
  { id: "en", fr: "Anglais", en: "English" },
  { id: "es", fr: "Espagnol", en: "Spanish" },
  { id: "de", fr: "Allemand", en: "German" },
  { id: "it", fr: "Italien", en: "Italian" },
  { id: "pt", fr: "Portugais", en: "Portuguese" },
  { id: "ja", fr: "Japonais", en: "Japanese" },
  { id: "zh", fr: "Chinois", en: "Chinese" },
];

/**
 * Le réglage du périphérique, partagé par les deux nœuds : même liste, même sens.
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

const PARAMETRE_CALCUL = {
  nom: "Calcul", nomEn: "Compute", type: "choix" as const,
  options: CALCULS.map((c) => c.fr), optionsEn: CALCULS.map((c) => c.en),
  optionIds: CALCULS.map((c) => c.id),
  defaut: "Automatique", defautEn: "Automatic",
  doc: "Le périphérique de calcul. « Automatique » laisse le moteur prendre ce qu'il juge le meilleur, ce qui n'est pas toujours la carte graphique : une machine à deux cartes expose souvent le circuit intégré en premier, et les deux numéros sont là pour les départager. « Processeur » tourne partout, et bien plus lentement.",
  docEn: "The compute device. « Automatic » lets the engine take what it deems best, which is not always the graphics card: a machine with two cards often exposes the integrated one first, and the two numbers are there to tell them apart. « Processor » runs everywhere, and far more slowly.",
};

/** Les deux canaux du processus principal, nommes une fois : on les appelle et on les reconnait. */
const CANAL_PLANIFIER = "acestep:planifier";
const CANAL_RENDRE = "acestep:rendre";

const api = () => (globalThis as unknown as { api?: Record<string, (...a: unknown[]) => Promise<unknown>> }).api;

/** Branche l'avancement du moteur sur celui du nœud, et rend de quoi se débrancher. */
function suivre(ctx: { onProgress?: (m: string) => void }) {
  const pont = api()?.acestepProgression as unknown as
    ((cb: (e: { phase: string; ligne: string }) => void) => () => void) | undefined;
  if (!pont) return () => { /* hors application : rien à suivre */ };
  return pont(({ ligne }) => ctx.onProgress?.(ligne));
}

export const fiches = ([
  {
    id: "planifier-chanson", nom: "Planifier une chanson", nomEn: "Plan a Song",
    univers: "Entrées", famille: "Génération",
    resume: "Écrit le plan d'une chanson : ses paroles, sa forme et ses codes audio.",
    resumeEn: "Writes a song's plan: its lyrics, its form and its audio codes.",
    notice: "Ce composant écrit le plan d'une chanson à partir d'une description, et le rend en texte. Le plan "
      + "porte les paroles, le tempo, la tonalité, la durée et les codes audio que le rendu emploiera.\n\n"
      + "« Description » dit ce qu'on veut entendre : un genre, une instrumentation, un caractère. L'entrée du "
      + "même nom la reçoit d'un autre composant quand elle est branchée, et le réglage sert alors de repli.\n\n"
      + "« Paroles » fixe le texte chanté. Vide, le planificateur l'écrit lui-même, et il peut choisir une pièce "
      + "instrumentale ; fourni, il le garde et se contente de la forme, ce qui raccourcit son travail.\n\n"
      + "« Langue du chant » dit en quelle langue chanter. « Durée » fixe la longueur visée en secondes ; à zéro, "
      + "le planificateur la choisit. « Graine » rend le plan reproductible ; à moins un, chaque exécution diffère.\n\n"
      + "« Calcul » nomme le périphérique employé. La sortie « Plan » rend le document à passer au rendu, et la "
      + "sortie « Paroles » le texte chanté, qui se lit et se corrige avant de rendre.",
    noticeEn: "This component writes a song's plan from a description, and returns it as text. The plan carries the "
      + "lyrics, the tempo, the key, the length and the audio codes the render will use.\n\n"
      + "« Description » says what is wanted: a genre, an instrumentation, a character. The input of the same name "
      + "receives it from another component when connected, and the setting then serves as a fallback.\n\n"
      + "« Lyrics » sets the sung text. Empty, the planner writes it itself, and it may choose an instrumental "
      + "piece; given, it keeps it and only settles the form, which shortens its work.\n\n"
      + "« Singing language » says in which language to sing. « Length » sets the target length in seconds; at zero, "
      + "the planner chooses it. « Seed » makes the plan reproducible; at minus one, every run differs.\n\n"
      + "« Compute » names the device used. The « Plan » output returns the document to pass to the render, and the "
      + "« Lyrics » output the sung text, which can be read and corrected before rendering.",
    entrees: [
      { nom: "Description", nomEn: "Description", type: "texte", requis: false },
      { nom: "Paroles", nomEn: "Lyrics", type: "texte", requis: false },
    ],
    sorties: [
      { nom: "Plan", nomEn: "Plan", type: "texte" },
      { nom: "Paroles", nomEn: "Lyrics", type: "texte" },
    ],
    parametres: [
      { nom: "Description", nomEn: "Description", type: "texte",
        defaut: "a calm acoustic guitar ballad, warm and slow",
        defautEn: "a calm acoustic guitar ballad, warm and slow",
        doc: "Ce qu'on veut entendre. L'entrée « Description » la remplace quand elle est branchée.",
        docEn: "What is wanted. The « Description » input replaces it when connected." },
      { nom: "Paroles", nomEn: "Lyrics", type: "texte", defaut: "", defautEn: "",
        placeholder: "[verse]\nLa nuit descend sur la ville", placeholderEn: "[verse]\nThe night falls on the city",
        doc: "Le texte chanté, avec ses marques de partie entre crochets. Vide, le planificateur l'écrit.",
        docEn: "The sung text, with its section markers in brackets. Empty, the planner writes it." },
      { nom: "Langue du chant", nomEn: "Singing language", type: "choix",
        options: LANGUES.map((l) => l.fr), optionsEn: LANGUES.map((l) => l.en),
        optionIds: LANGUES.map((l) => l.id), defaut: "Français", defautEn: "French",
        doc: "La langue dans laquelle la voix chante.",
        docEn: "The language the voice sings in." },
      { nom: "Durée", nomEn: "Length", type: "nombre", plage: [0, 600], pas: 10, defaut: 60, unite: "s",
        doc: "Longueur visée. À zéro, le planificateur choisit, et il voit large.",
        docEn: "Target length. At zero, the planner chooses, and it aims long." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "nombre", plage: [-1, 999999], pas: 1, defaut: -1,
        doc: "Rend le plan reproductible. À moins un, chaque exécution diffère.",
        docEn: "Makes the plan reproducible. At minus one, every run differs." },
      PARAMETRE_CALCUL,
    ],
    async executer(ctx: any) {
      const pont = api();
      if (!pont?.acestepPlanifier) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.n_cessite_electron") };
      }
      const entreeDescription = ctx.entree(0);
      const entreeParoles = ctx.entree(1);
      await annoncerModele(ctx, "planifier-chanson", traduire("progress.chanson.modeles"));
      const debrancher = suivre(ctx);
      try {
        let r: { ok: boolean; plan?: string; journal?: string };
        try {
          r = await pont.acestepPlanifier({
            description: typeof entreeDescription === "string" && entreeDescription.trim()
              ? entreeDescription : ctx.paramTexte("Description", ""),
            paroles: typeof entreeParoles === "string" && entreeParoles.trim()
              ? entreeParoles : ctx.paramTexte("Paroles", ""),
            dureeSec: ctx.paramNombre("Durée", 60),
            langue: ctx.paramTexte("Langue du chant", "fr"),
            graine: ctx.paramNombre("Graine", -1),
            peripherique: ctx.paramTexte("Calcul", "").trim(),
          }) as typeof r;
        } catch (erreur) {
          // L'APPEL LUI-MÊME PEUT ÉCHOUER, et pas seulement le travail demandé : un processus
          // principal plus vieux que le préchargement ne porte pas le canal. Voir `pont-electron.ts`.
          return { valeurs: [null, null], erreur: true, message: messageEchecPont(erreur, CANAL_PLANIFIER) };
        }
        if (!r.ok || !r.plan) {
          return { valeurs: [null, null], erreur: true, message: (r.journal ?? "").slice(-240) };
        }
        const plan = JSON.parse(r.plan) as { lyrics?: string; duration?: number; bpm?: number };
        return {
          valeurs: [r.plan, plan.lyrics ?? ""],
          message: traduire("msg.chanson.plan",
            (plan.duration ?? 0).toFixed(0), String(plan.bpm ?? 0),
            (plan.lyrics ?? "").replace(/\s+/g, " ").slice(0, 40)),
        };
      } finally {
        debrancher();
      }
    },
  },
  {
    id: "rendre-chanson", nom: "Rendre une chanson", nomEn: "Render a Song",
    univers: "Entrées", famille: "Génération",
    resume: "Rend l'audio d'un plan de chanson, en stéréo 48 kHz.",
    resumeEn: "Renders the audio of a song plan, in 48 kHz stereo.",
    notice: "Ce composant rend l'audio d'un plan écrit par « Planifier une chanson ». Le plan arrive sur "
      + "l'entrée « Plan » ; le même plan se rend autant de fois qu'on veut.\n\n"
      + "L'entrée « Paroles » remplace le texte chanté du plan, et rien d'autre : la forme, le tempo, la "
      + "tonalité et les codes restent ceux du planificateur. C'est par là que reviennent les paroles qu'on "
      + "a relues et corrigées.\n\n"
      + "« Pas de débruitage » décide du nombre d'étapes. Huit est la valeur du modèle rapide ; davantage "
      + "allonge le calcul sans toujours changer ce qu'on entend.\n\n"
      + "« Glissement » déplace les instants auxquels le débruitage travaille. Trois est la valeur usuelle.\n\n"
      + "« Calcul » nomme le périphérique employé.\n\n"
      + "« Tuile du décodeur » et « Recouvrement » décident du découpage du décodage audio. La mémoire "
      + "demandée suit la taille de la tuile, jamais la durée du morceau : une tuile de mille vingt-quatre "
      + "trames réclame plus de trois gigaoctets d'un bloc, deux cent cinquante-six en réclament moins d'un. "
      + "Le recouvrement est ce qui empêche une jointure de s'entendre.\n\n"
      + "La sortie « Audio » rend le son, en stéréo à quarante-huit kilohertz.",
    noticeEn: "This component renders the audio of a plan written by « Plan a Song ». The plan arrives on the "
      + "« Plan » input; the same plan can be rendered as many times as wanted.\n\n"
      + "The « Lyrics » input replaces the plan's sung text, and nothing else: the form, the tempo, the key "
      + "and the codes stay those of the planner. This is where the lyrics one has read over and corrected "
      + "come back.\n\n"
      + "« Denoising steps » decides the number of steps. Eight is the fast model's value; more lengthens the "
      + "computation without always changing what is heard.\n\n"
      + "« Shift » moves the instants at which denoising works. Three is the usual value.\n\n"
      + "« Compute » names the device used.\n\n"
      + "« Decoder tile » and « Overlap » decide how the audio decoding is cut up. The memory required follows "
      + "the tile size, never the piece's length: a tile of one thousand and twenty-four frames asks for more "
      + "than three gigabytes at once, two hundred and fifty-six ask for less than one. The overlap is what "
      + "keeps a seam from being heard.\n\n"
      + "The « Audio » output renders the sound, in stereo at forty-eight kilohertz.",
    entrees: [
      { nom: "Plan", nomEn: "Plan", type: "texte" },
      // LES PAROLES CORRIGÉES REVIENNENT PAR ICI, et c'est ce qui donne son sens à la séparation
      // des deux nœuds : sans cette entrée, la sortie « Paroles » du planificateur ne menait nulle
      // part et le plan ne se corrigeait qu'en le réécrivant à la main.
      { nom: "Paroles", nomEn: "Lyrics", type: "texte", requis: false },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Pas de débruitage", nomEn: "Denoising steps", type: "nombre", plage: [4, 50], pas: 1, defaut: 8,
        doc: "Nombre d'étapes de débruitage. Huit est la valeur du modèle rapide.",
        docEn: "Number of denoising steps. Eight is the fast model's value." },
      { nom: "Glissement", nomEn: "Shift", type: "nombre", plage: [0.5, 6], pas: 0.5, defaut: 3,
        doc: "Déplace les instants auxquels le débruitage travaille.",
        docEn: "Moves the instants at which denoising works." },
      PARAMETRE_CALCUL,
      { nom: "Tuile du décodeur", nomEn: "Decoder tile", type: "nombre", plage: [64, 1024], pas: 64, defaut: 256,
        unite: "trames", uniteEn: "frames",
        doc: "Trames latentes décodées d'un bloc, à vingt-cinq par seconde. La mémoire demandée suit cette taille, et non la durée du morceau.",
        docEn: "Latent frames decoded at once, at twenty-five per second. The memory required follows this size, not the piece's length." },
      { nom: "Recouvrement", nomEn: "Overlap", type: "nombre", plage: [0, 128], pas: 8, defaut: 32,
        unite: "trames", uniteEn: "frames",
        doc: "Trames décodées en plus de part et d'autre de chaque tuile, et jetées ensuite. C'est ce qui empêche une jointure de s'entendre.",
        docEn: "Frames decoded on each side of every tile, then dropped. This is what keeps a seam from being heard." },
    ],
    async executer(ctx: any) {
      const pont = api();
      if (!pont?.acestepRendre) {
        return { valeurs: [null], erreur: true, message: traduire("msg.n_cessite_electron") };
      }
      const plan = ctx.entree(0);
      if (typeof plan !== "string" || plan.trim() === "") {
        return { valeurs: [null], erreur: true, message: traduire("msg.chanson.aucunPlan") };
      }
      await annoncerModele(ctx, "rendre-chanson", traduire("progress.chanson.modeles"));
      const paroles = ctx.entree(1);
      const debrancher = suivre(ctx);
      try {
        let r: { ok: boolean; donnees?: Uint8Array; nom?: string; journal?: string };
        try {
          r = await pont.acestepRendre({
            plan,
            paroles: typeof paroles === "string" && paroles.trim() ? paroles : undefined,
            pas: ctx.paramNombre("Pas de débruitage", 8),
            shift: ctx.paramNombre("Glissement", 3),
            peripherique: ctx.paramTexte("Calcul", "").trim(),
            tuile: ctx.paramNombre("Tuile du décodeur", 256),
            recouvrement: ctx.paramNombre("Recouvrement", 32),
          }) as typeof r;
        } catch (erreur) {
          // Même cas que pour la planification : le canal peut manquer au processus principal.
          return { valeurs: [null], erreur: true, message: messageEchecPont(erreur, CANAL_RENDRE) };
        }
        if (!r.ok || !r.donnees) {
          return { valeurs: [null], erreur: true, message: (r.journal ?? "").slice(-240) };
        }
        const { decoderBlob } = await import("../audio");
        const audio = await decoderBlob(new Blob([new Uint8Array(r.donnees)]), ctx.runtime);
        return {
          valeurs: [audio],
          message: traduire("msg.chanson.rendu",
            audio.duration.toFixed(1), String(audio.sampleRate), String(audio.numberOfChannels)),
        };
      } finally {
        debrancher();
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
