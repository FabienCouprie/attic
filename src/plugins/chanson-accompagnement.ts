// plugins/chanson-accompagnement.ts — Une voix seule reçoit son accompagnement.
//
// UN FICHIER À PART, ET POUR UNE RAISON DE FOND : ce nœud est le seul à tirer le débruiteur de
// base d'ACE-Step, un second modèle de 1,88 Gio que rien d'autre ne réclame. Le champ `noeuds` du
// manifeste le relie à lui seul, de sorte que les autres nœuds de chanson ne font pas télécharger
// ce qu'ils n'emploient pas.
//
// CE QUE LA MESURE A ÉTABLI, ET QUI DÉCIDE DES DEUX RÉGLAGES. Sur une voix seule de vingt
// secondes, le modèle rapide ne construit rien : sa sortie corrèle à 0,996 avec la voix reçue, et
// le moteur avertit lui-même que sa sortie est incohérente sur cette tâche. Le modèle de base
// construit, mais le guidage décide de tout : à 1,0 la sortie corrèle encore à 0,964 avec la voix
// et deux descriptions opposées rendent presque le même son, 0,9935 ; à 7,5 la corrélation tombe à
// 0,598, le niveau gagne sept décibels, et les deux descriptions se séparent. Le choix des
// instruments ne compte qu'une fois le guidage monté : à 7,5 les quatre formations offertes
// s'écartent de 0,80 à 0,96 les unes des autres, là qu'à 1,0 elles étaient indistinctes. Une seule
// piste demandée reste inerte quel que soit le guidage, 0,9956 : aucune formation n'en propose.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { annoncerModele } from "./message-modele";
import {
  ENTREES_SOURCE, NOTICE_RENDU_EN, NOTICE_RENDU_FR, NOTICE_TIMBRE_EN, NOTICE_TIMBRE_FR,
  SORTIE_AUDIO, parametresRenduAvec, rendreSurAudio,
} from "./chanson-aides";

/**
 * Les quatre formations, chacune éprouvée. L'identifiant d'option est la chaîne que le moteur
 * lit : il nomme les pistes en anglais, séparées par une barre verticale, et n'en valide aucune.
 */
const FORMATIONS = [
  { id: "drums | bass | guitar | keyboard", fr: "Groupe complet", en: "Full band" },
  { id: "drums | bass", fr: "Batterie et basse", en: "Drums and bass" },
  { id: "strings | brass | woodwinds | percussion", fr: "Orchestre", en: "Orchestra" },
  { id: "synth | drums | bass", fr: "Électronique", en: "Electronic" },
];

const DEFAUT = FORMATIONS[0].id;

export const fiches = ([
  {
    id: "accompagner-voix", nom: "Accompagner une voix", nomEn: "Back a Vocal",
    univers: "Entrées", famille: "Génération",
    resume: "Construit un accompagnement instrumental autour d'une voix seule.",
    resumeEn: "Builds an instrumental backing around an isolated vocal.",
    notice: "Ce composant construit un accompagnement instrumental autour d'une voix seule, en suivant le "
      + "plan de chanson qu'il reçoit. L'entrée « Audio » reçoit la voix, isolée de tout accompagnement, et "
      + "l'entrée « Plan » le plan, dont la description dit le caractère de ce qui est construit.\n\n"
      + NOTICE_TIMBRE_FR
      + "« Instruments » choisit la formation construite autour de la voix. « Groupe complet » emploie "
      + "batterie, basse, guitare et clavier ; « Batterie et basse » s'en tient à la section rythmique ; "
      + "« Orchestre » emploie cordes, cuivres, bois et percussions ; « Électronique » emploie des sons de "
      + "synthèse avec batterie et basse.\n\n"
      + "« Guidage » décide du poids de la description du plan. Au plus bas, l'accompagnement reste proche "
      + "de la voix reçue, la description pèse peu, et le choix des instruments ne s'entend presque pas. En "
      + "montant, la description décide davantage, l'accompagnement s'éloigne de la voix, son niveau "
      + "augmente, et les formations se distinguent.\n\n"
      + "« Pas de débruitage » décide du nombre d'étapes. Cinquante est la valeur du modèle employé ici.\n\n"
      + "« Glissement » déplace les instants auxquels le débruitage travaille. Un est la valeur du modèle "
      + "employé ici.\n\n"
      + "« Calcul » nomme le périphérique employé.\n\n"
      + "« Tuile du décodeur » et « Recouvrement » décident du découpage du décodage audio. La mémoire "
      + "demandée suit la taille de la tuile, jamais la durée du morceau. Le recouvrement est ce qui "
      + "empêche une jointure de s'entendre.\n\n"
      + "La sortie « Audio » rend la voix et son accompagnement, en stéréo à quarante-huit kilohertz. Sa "
      + "durée est celle de la voix reçue.",
    noticeEn: "This component builds an instrumental backing around an isolated vocal, following the song "
      + "plan it receives. The « Audio » input receives the vocal, isolated from any backing, and the "
      + "« Plan » input the plan, whose description says the character of what is built.\n\n"
      + NOTICE_TIMBRE_EN
      + "« Instruments » chooses the line-up built around the vocal. « Full band » uses drums, bass, guitar "
      + "and keyboard; « Drums and bass » keeps to the rhythm section; « Orchestra » uses strings, brass, "
      + "woodwinds and percussion; « Electronic » uses synthesized sounds with drums and bass.\n\n"
      + "« Guidance » decides how much weight the plan's description carries. At the lowest, the backing "
      + "stays close to the received vocal, the description weighs little, and the choice of instruments is "
      + "barely heard. Higher up, the description decides more, the backing moves away from the vocal, its "
      + "level rises, and the line-ups tell apart.\n\n"
      + "« Denoising steps » decides the number of steps. Fifty is this model's value.\n\n"
      + "« Shift » moves the instants at which denoising works. One is this model's value.\n\n"
      + "« Compute » names the device used.\n\n"
      + "« Decoder tile » and « Overlap » decide how the audio decoding is cut up. The memory required "
      + "follows the tile size, never the piece's length. The overlap is what keeps a seam from being "
      + "heard.\n\n"
      + "The « Audio » output returns the vocal and its backing, in stereo at forty-eight kilohertz. Its "
      + "length is that of the received vocal.",
    entrees: [...ENTREES_SOURCE],
    sorties: [...SORTIE_AUDIO],
    parametres: [
      { nom: "Instruments", nomEn: "Instruments", type: "choix",
        options: FORMATIONS.map((f) => f.fr), optionsEn: FORMATIONS.map((f) => f.en),
        optionIds: FORMATIONS.map((f) => f.id),
        defaut: FORMATIONS[0].fr, defautEn: FORMATIONS[0].en,
        doc: "La formation construite autour de la voix. Les quatre se distinguent d'autant mieux que « Guidage » est haut.",
        docEn: "The line-up built around the vocal. The four tell apart the better the higher « Guidance » is." },
      { nom: "Guidage", nomEn: "Guidance", type: "curseur", plage: [1, 10], pas: 0.5, defaut: 7.5,
        doc: "Poids de la description du plan. Au plus bas, l'accompagnement reste proche de la voix reçue ; en montant, il s'en éloigne et suit la description.",
        docEn: "How much weight the plan's description carries. At the lowest, the backing stays close to the received vocal; higher up, it moves away and follows the description." },
      ...parametresRenduAvec({
        "Pas de débruitage": {
          defaut: 50,
          doc: "Nombre d'étapes de débruitage. Cinquante est la valeur du modèle employé ici.",
          docEn: "Number of denoising steps. Fifty is this model's value.",
        },
        "Glissement": {
          defaut: 1,
          doc: "Déplace les instants auxquels le débruitage travaille. Un est la valeur du modèle employé ici.",
          docEn: "Moves the instants at which denoising works. One is this model's value.",
        },
      }),
    ],
    async executer(ctx: any) {
      const annoncer = () => annoncerModele(ctx, "accompagner-voix", traduire("progress.chanson.modeles"));
      return rendreSurAudio(ctx, annoncer, (c) => ({
        // LE DÉBRUITEUR N'EST PAS NOMMÉ ICI : `electron/acestep-plan.cjs` porte le relevé de ce que
        // chaque tâche réclame, et donne à celle-ci le modèle de base. Un nœud qui nommerait un
        // fichier de modèle doublerait ce savoir, et les deux finiraient par diverger.
        tache: "complete",
        piste: c.paramTexte("Instruments", DEFAUT) || DEFAUT,
        guidage: c.paramNombre("Guidage", 7.5),
      }));
    },
  },
] as FicheAudio[]).map(avecDoc);
