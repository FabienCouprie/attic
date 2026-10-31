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
import {
  CANAL_PLANIFIER, CANAL_RENDRE, LANGUES, PARAMETRES_RENDU, PARAMETRE_MODELE, api, guidageDe, modeleChoisi,
  octetsWav, paquetsEcartes, suivre,
} from "./chanson-aides";
import { PARAMETRE_CALCUL } from "./parametre-calcul";
import { fiches as variantes } from "./chanson-variantes";
import { fiches as accompagnement } from "./chanson-accompagnement";
import { fiches as compositionDePlan } from "./composer-plan";
import { choixLangues, libelleLangue } from "../core/langues";

const locales = ([
  {
    id: "planifier-chanson", nom: "Planifier une chanson", nomEn: "Plan a Song",
    univers: "Entrées", famille: "Génération",
    resume: "Écrit le plan d'une chanson : ses paroles, sa forme et ses codes audio.",
    resumeEn: "Writes a song's plan: its lyrics, its form and its audio codes.",
    notice: "Ce composant écrit le plan d'une chanson à partir d'une description, et le rend en texte. Le plan "
      + "porte les paroles, le tempo, la tonalité, la durée et les codes audio que le rendu emploiera.\n\n"
      + "« Description » dit ce qu'on veut entendre : un genre, une instrumentation, un caractère. L'entrée du "
      + "même nom la reçoit d'un autre composant quand elle est branchée, et le réglage sert alors de repli.\n\n"
      + "« Paroles » fixe le texte chanté. Vide, le planificateur l'écrit lui-même : le texte dépend alors de "
      + "« Graine », il peut être une pièce instrumentale, et il ne suit pas toujours la langue demandée. Fourni, "
      + "il le garde mot pour mot et se contente de la forme, ce qui raccourcit son travail.\n\n"
      + "« Langue du chant » dit en quelle langue chanter, parmi les dix que le modèle tient le mieux. « Durée » "
      + "fixe la longueur visée en secondes ; à zéro, le planificateur la choisit. « Graine » rend le plan "
      + "reproductible ; à moins un, chaque exécution diffère.\n\n"
      + "« Calcul » nomme le périphérique employé. La sortie « Plan » rend le document à passer au rendu, et la "
      + "sortie « Paroles » le texte chanté, qui se lit et se corrige avant de rendre.",
    noticeEn: "This component writes a song's plan from a description, and returns it as text. The plan carries the "
      + "lyrics, the tempo, the key, the length and the audio codes the render will use.\n\n"
      + "« Description » says what is wanted: a genre, an instrumentation, a character. The input of the same name "
      + "receives it from another component when connected, and the setting then serves as a fallback.\n\n"
      + "« Lyrics » sets the sung text. Empty, the planner writes it itself: the text then depends on « Seed », it "
      + "may be an instrumental piece, and it does not always follow the requested language. Given, it keeps it "
      + "word for word and only settles the form, which shortens its work.\n\n"
      + "« Singing language » says in which language to sing, among the ten the model holds best. « Length » sets the target length in seconds; at zero, "
      + "the planner chooses it. « Seed » makes the plan reproducible; at minus one, every run differs.\n\n"
      + "« Compute » names the device used. The « Plan » output returns the document to pass to the render, and the "
      + "« Lyrics » output the sung text, which can be read and corrected before rendering.",
    entrees: [
      { nom: "Description", nomEn: "Description", type: "texte", requis: false },
      { nom: "Paroles", nomEn: "Lyrics", type: "texte", sousType: "paroles", requis: false },
    ],
    sorties: [
      { nom: "Plan", nomEn: "Plan", type: "texte", sousType: "plan" },
      { nom: "Paroles", nomEn: "Lyrics", type: "texte", sousType: "paroles" },
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
        ...choixLangues(LANGUES), defaut: "Français", defautEn: "French",
        doc: "La langue dans laquelle la voix chante. Les dix proposées sont celles que le modèle tient le mieux ; il en connaît davantage, moins bien chantées. Quand « Paroles » est vide, le texte écrit ne suit pas toujours cette langue.",
        docEn: "The language the voice sings in. The ten offered are those the model holds best; it knows more, less well sung. When « Lyrics » is empty, the written text does not always follow this language." },
      { nom: "Durée", nomEn: "Length", type: "nombre", plage: [0, 600], pas: 10, defaut: 60, unite: "s",
        doc: "Longueur visée. À zéro, le planificateur choisit, et il voit large.",
        docEn: "Target length. At zero, the planner chooses, and it aims long." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "nombre", plage: [-1, 999999], pas: 1, defaut: -1,
        doc: "Rend le plan reproductible. À moins un, chaque exécution diffère. Quand « Paroles » est vide, elle décide aussi du texte écrit, qui ne suit pas toujours la langue demandée : donner les paroles est le seul moyen de fixer ce qui sera chanté.",
        docEn: "Makes the plan reproducible. At minus one, every run differs. When « Lyrics » is empty, it also decides the written text, which does not always follow the requested language: giving the lyrics is the only way to settle what will be sung." },
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
      + "L'entrée « Timbre » reçoit un audio dont la couleur sonore est reprise : le moteur en encode le "
      + "timbre et l'applique au rendu. La forme, les paroles et la durée restent celles du plan.\n\n"
      + "« Modèle » choisit le débruiteur qui rend le son. « Rapide » et « Base » rendent un morceau "
      + "différent du même plan. « Base » est un second fichier de modèle, pris depuis le panneau des "
      + "modèles ; absent, le composant le signale et ne rend rien.\n\n"
      + "« Pas de débruitage » décide du nombre d'étapes. À zéro, le modèle prend le sien : huit pour "
      + "« Rapide », cinquante pour « Base ». Le calcul s'allonge avec le nombre d'étapes.\n\n"
      + "« Glissement » déplace les instants auxquels le débruitage travaille. À zéro, le modèle prend "
      + "sa propre valeur : trois pour « Rapide », un pour « Base ».\n\n"
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
      + "The « Timbre » input receives an audio whose tone colour is taken up: the engine encodes its timbre "
      + "and applies it to the render. The form, the lyrics and the length stay those of the plan.\n\n"
      + "« Model » chooses the denoiser that renders the sound. « Fast » and « Base » render a different "
      + "piece from the same plan. « Base » is a second model file, taken from the models panel; when it "
      + "is missing, the component reports it and returns nothing.\n\n"
      + "« Denoising steps » decides the number of steps. At zero, the model takes its own: eight for "
      + "« Fast », fifty for « Base ». The computation lengthens with the number of steps.\n\n"
      + "« Shift » moves the instants at which denoising works. At zero, the model takes its own value: "
      + "three for « Fast », one for « Base ».\n\n"
      + "« Compute » names the device used.\n\n"
      + "« Decoder tile » and « Overlap » decide how the audio decoding is cut up. The memory required follows "
      + "the tile size, never the piece's length: a tile of one thousand and twenty-four frames asks for more "
      + "than three gigabytes at once, two hundred and fifty-six ask for less than one. The overlap is what "
      + "keeps a seam from being heard.\n\n"
      + "The « Audio » output renders the sound, in stereo at forty-eight kilohertz.",
    entrees: [
      { nom: "Plan", nomEn: "Plan", type: "texte", sousType: "plan" },
      // LES PAROLES CORRIGÉES REVIENNENT PAR ICI, et c'est ce qui donne son sens à la séparation
      // des deux nœuds : sans cette entrée, la sortie « Paroles » du planificateur ne menait nulle
      // part et le plan ne se corrigeait qu'en le réécrivant à la main.
      { nom: "Paroles", nomEn: "Lyrics", type: "texte", sousType: "paroles", requis: false },
      // LE TIMBRE EST INDÉPENDANT DE LA TÂCHE : le moteur l'encode à part et ne le lit qu'en
      // ligne de commande, d'où un port et non un champ du plan. `electron/acestep-plan.cjs`
      // porte le relevé de ce partage.
      { nom: "Timbre", nomEn: "Timbre", type: "audio", requis: false },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    // LE GUIDAGE EST DANS LA LISTE PARTAGÉE, À 7,5, et ce composant n'a donc rien à surcharger :
    // les quatre rendus partent de la même valeur, par décision du propriétaire. C'est ici que la
    // mesure la soutient le mieux, ce composant n'ayant pas d'audio source : le guidage n'y arbitre
    // qu'entre le rendu et la description, et 7,5 sort plus fort et plus ouvert dans l'aigu que le
    // défaut du moteur. `chanson-aides.ts` porte ce que cela coûte aux trois autres.
    parametres: [PARAMETRE_MODELE, ...PARAMETRES_RENDU],
    async executer(ctx: any) {
      const pont = api();
      if (!pont?.acestepRendre) {
        return { valeurs: [null], erreur: true, message: traduire("msg.n_cessite_electron") };
      }
      const plan = ctx.entree(0);
      if (typeof plan !== "string" || plan.trim() === "") {
        return { valeurs: [null], erreur: true, message: traduire("msg.chanson.aucunPlan") };
      }
      await annoncerModele(ctx, "rendre-chanson", traduire("progress.chanson.modeles"), paquetsEcartes(ctx));
      const paroles = ctx.entree(1);
      const timbre = await octetsWav(ctx.entree(2));
      const debrancher = suivre(ctx);
      try {
        let r: { ok: boolean; donnees?: Uint8Array; nom?: string; journal?: string };
        try {
          r = await pont.acestepRendre({
            plan,
            paroles: typeof paroles === "string" && paroles.trim() ? paroles : undefined,
            audioTimbre: timbre,
            ...modeleChoisi(ctx),
            pas: ctx.paramNombre("Pas de débruitage", 0),
            shift: ctx.paramNombre("Glissement", 0),
            peripherique: ctx.paramTexte("Calcul", "").trim(),
            tuile: ctx.paramNombre("Tuile du décodeur", 256),
            recouvrement: ctx.paramNombre("Recouvrement", 32),
            ...guidageDe(ctx),
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

// LA FAMILLE ENTIÈRE SORT PAR ICI, les sept nœuds d'ACE-Step ensemble : les deux de ce fichier,
// les quatre de `chanson-variantes.ts` et celui de `chanson-accompagnement.ts`, qui tire un
// second débruiteur. Le registre de `index.ts` dépasse la norme de taille et n'a donc pas le droit
// de grossir ; ce qu'on y ajouterait va ailleurs, et l'ailleurs d'une famille est sa propre entrée.
export const fiches = [...locales, ...variantes, ...accompagnement, ...compositionDePlan];
