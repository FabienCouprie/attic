// plugins/composer-plan.ts — Un plan de chanson écrit à la main, ou relevé d'un audio.
//
// CE QUE CE COMPOSANT COMBLE. « Planifier une chanson » écrit un plan à partir d'une phrase, et
// « Rendre une chanson » le rend : entre les deux, rien ne permettait de PARTIR D'UN AUDIO. Les
// pièces d'un plan étaient toutes mesurables séparément — le tempo par son détecteur, la tonalité
// par « Analyse harmonique », les paroles par la reconnaissance de parole, la description par
// « Décrire un audio » — et aucune ne pouvait être rassemblée en plan. C'est ce nœud.
//
// UN ASSEMBLEUR ET NON UN ANALYSEUR, et c'est un choix. Un nœud unique qui aurait tout analysé
// lui-même referait ce que quatre nœuds font déjà, et cacherait ses mesures : ici chaque champ
// arrive par un port qu'on voit, se corrige à la main, et le plan reste un document lisible.
//
// IL N'ÉCRIT PAS DE CODES AUDIO, ET C'EST LA MESURE QUI DÉCIDE DE CE QUE CELA SIGNIFIE. Le plan
// qu'écrit le planificateur porte un champ `audio_codes` — cent quarante-six entiers pour vingt-neuf
// secondes, soit cinq par seconde, le modèle étant un `acestep-5Hz-lm`. Rien n'expose l'inverse :
// `ace-lm` ne prend aucune entrée audio, et `ace-synth` encode bien un audio source pour la reprise
// mais ne rend jamais ses codes. Relevé le 2026-10-21 en rendant DEUX FOIS le même plan, avec ses
// codes et sans :
//
//   avec les codes   1 401 600 échantillons (29,2 s)   RMS −24,02 dB
//   sans les codes   1 440 000 échantillons (30,00 s)  RMS −19,85 dB
//   corrélation entre les deux : 0,0660
//
// DEUX CONSÉQUENCES, ET LA NOTICE LES DIT. Les codes DICTENT la durée réelle ; sans eux, « Durée »
// reprend la main et elle est tenue à l'échantillon. Et les codes portent la substance : à 0,066 de
// corrélation, un rendu sans eux n'est pas un rendu appauvri, c'est un AUTRE morceau, guidé par la
// seule description. Ce composant sert donc à écrire une pièce neuve dans la forme d'un morceau
// reçu, non à le reconstituer — et il ne prétend pas le contraire.
//
// IL N'ÉMET PAS `synth_model`, et ce n'est pas un oubli. `appliquerTache` construit la requête de
// rendu en posant son modèle PUIS en étalant le plan par-dessus : un plan qui porterait ce champ
// écraserait le choix de la tâche, et « Accompagner une voix », qui exige le modèle de base,
// repartirait sur le modèle rapide — dont la mesure a montré qu'il ne construit rien sur cette
// tâche. Le plan dit la musique ; la tâche dit le moteur.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { LANGUES } from "./chanson-aides";

/** Les signatures que le moteur reçoit. Le champ est une CHAÎNE dans le plan, non un nombre. */
const SIGNATURES = ["2", "3", "4", "6"];

/**
 * La tonalité, débarrassée de ce qui n'en fait pas partie.
 *
 * ÉCRIT D'UNE MESURE SUR LE NŒUD VOISIN. « Analyse harmonique » rend sa tonalité sous la forme
 * `G major (87%)` : la confiance y est jointe, ce qui est juste pour un humain qui lit et faux pour
 * le champ `keyscale` d'un plan, que le moteur attend sous la forme `G major`. Plutôt que de changer
 * la sortie d'un nœud dont d'autres lecteurs dépendent peut-être, le parenthésage est retiré ici.
 *
 * LA CHAÎNE VIDE EST RENDUE TELLE QUELLE : c'est à l'appelant de décider qu'un champ absent ne
 * s'écrit pas, et non à ce nettoyage de deviner une tonalité.
 */
export function tonaliteNormalisee(brute: string): string {
  return brute.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/**
 * Le plan, tel que `rendre-chanson` le lira.
 *
 * LES CHAMPS VIDES NE S'ÉCRIVENT PAS. Un `lyrics` vide ferait chanter du silence annoncé, et un
 * tempo nul ferait un plan qui impose zéro battement par minute. Le plan n'a donc que ce qu'on lui
 * a donné.
 *
 * LA BRANCHE DE LA GRAINE NÉGATIVE NE SERT PAS DANS L'APPLICATION, et c'est une chose à savoir
 * avant de la croire morte ou de l'enlever. Le moteur résout les graines AU CENTRE, avant d'appeler
 * l'exécuteur : `resoudreGraine` remplace toute valeur inférieure ou égale à zéro par une graine
 * tirée, qu'il reporte ensuite sur le nœud. Un `-1` n'arrive donc jamais ici par cette voie, et le
 * plan porte toujours sa graine, ce que la documentation du réglage dit. La branche reste pour un
 * appel direct, et parce qu'un plan portant `seed: -1` serait accepté par le moteur sans être
 * reproductible.
 */
export function planDepuis(champs: {
  description: string; paroles: string; tempo: number; tonalite: string;
  dureeSec: number; langue: string; signature: string; graine: number;
}): string {
  const tonalite = tonaliteNormalisee(champs.tonalite);
  const plan: Record<string, unknown> = {
    caption: champs.description.trim() || "instrumental",
    ...(champs.paroles.trim() ? { lyrics: champs.paroles } : {}),
    ...(champs.tempo > 0 ? { bpm: Math.round(champs.tempo) } : {}),
    duration: champs.dureeSec,
    ...(tonalite ? { keyscale: tonalite } : {}),
    ...(champs.signature ? { timesignature: champs.signature } : {}),
    vocal_language: champs.langue || "fr",
    ...(champs.graine >= 0 ? { seed: champs.graine, lm_seed: champs.graine } : {}),
    output_format: "wav16",
  };
  return JSON.stringify(plan, null, 2);
}

export const fiches = ([
  {
    id: "composer-plan", nom: "Composer un plan", nomEn: "Compose a Plan",
    univers: "Entrées", famille: "Génération",
    resume: "Assemble un plan de chanson à partir de pièces mesurées sur un audio ou écrites à la main.",
    resumeEn: "Assembles a song plan from pieces measured on an audio or written by hand.",
    notice: "Ce composant écrit en texte le plan d'une chanson : sa description, ses paroles, son tempo, sa "
      + "tonalité, sa durée, sa langue de chant et sa signature. Chaque valeur arrive par l'entrée du même "
      + "nom ; à défaut, le réglage du même nom sert.\n\n"
      + "Le plan écrit ne porte aucun code audio. La durée demandée est donc tenue à l'échantillon, et le "
      + "contenu musical suit la description au lieu d'être déjà fixé.\n\n"
      + "« Description » dit ce qu'on veut entendre : un genre, une instrumentation, un caractère. Vide, le "
      + "plan porte « instrumental ».\n\n"
      + "« Paroles » fixe le texte chanté, avec ses marques de partie entre crochets. Vide, le champ est "
      + "absent du plan et le rendu est instrumental.\n\n"
      + "« Tempo » fixe le nombre de battements par minute. À zéro, le champ est absent du plan.\n\n"
      + "« Tonalité » s'écrit sous la forme « G major » ou « A minor ». Une mention entre parenthèses à la "
      + "fin, telle qu'un pourcentage de confiance, est retirée. Vide, le champ est absent du plan.\n\n"
      + "« Durée » fixe la longueur visée en secondes. « Langue du chant » dit en quelle langue chanter. "
      + "« Signature » donne le nombre de temps par mesure.\n\n"
      + "« Graine » rend le rendu reproductible. À moins un, le moteur en tire une à chaque exécution et "
      + "l'inscrit dans le plan ; celle qui a servi est donnée dans le message.\n\n"
      + "La sortie « Plan » rend le document en texte, qui se lit et se corrige avant d'être rendu. Le "
      + "message donne le tempo et la tonalité inscrits, ainsi que la durée visée.",
    noticeEn: "This component writes a song's plan as text: its description, its lyrics, its tempo, its key, "
      + "its length, its singing language and its time signature. Each value arrives through the input of "
      + "the same name; failing that, the setting of the same name serves.\n\n"
      + "The written plan carries no audio code. The requested length is therefore held to the sample, and "
      + "the musical content follows the description instead of being already settled.\n\n"
      + "« Description » says what is wanted: a genre, an instrumentation, a character. Empty, the plan "
      + "carries « instrumental ».\n\n"
      + "« Lyrics » sets the sung text, with its section markers in brackets. Empty, the field is absent "
      + "from the plan and the render is instrumental.\n\n"
      + "« Tempo » sets the number of beats per minute. At zero, the field is absent from the plan.\n\n"
      + "« Key » is written as « G major » or « A minor ». A mention in parentheses at the end, such as a "
      + "confidence percentage, is removed. Empty, the field is absent from the plan.\n\n"
      + "« Length » sets the target length in seconds. « Singing language » says which language to sing in. "
      + "« Time signature » gives the number of beats per bar.\n\n"
      + "« Seed » makes the render reproducible. At minus one, the engine draws one at each run and writes "
      + "it into the plan; the one that served is given in the message.\n\n"
      + "The « Plan » output returns the document as text, which is read and corrected before being "
      + "rendered. The message gives the tempo and key written in, as well as the target length.",
    entrees: [
      { nom: "Description", nomEn: "Description", type: "texte", requis: false },
      { nom: "Paroles", nomEn: "Lyrics", type: "texte", requis: false },
      // LE TEMPO ARRIVE EN NOMBRE SUR UN PORT DE CONTRÔLE, comme pour « Transcription MIDI » : un
      // détecteur en rend un, et le recopier à la main serait une occasion de se tromper.
      { nom: "Tempo", nomEn: "Tempo", type: "controle", requis: false },
      { nom: "Tonalité", nomEn: "Key", type: "texte", requis: false },
    ],
    sorties: [{ nom: "Plan", nomEn: "Plan", type: "texte" }],
    parametres: [
      { nom: "Description", nomEn: "Description", type: "texte",
        defaut: "a calm acoustic guitar ballad, warm and slow",
        defautEn: "a calm acoustic guitar ballad, warm and slow",
        doc: "Ce qu'on veut entendre. L'entrée « Description » la remplace quand elle est branchée.",
        docEn: "What is wanted. The « Description » input replaces it when connected." },
      { nom: "Paroles", nomEn: "Lyrics", type: "texte", defaut: "", defautEn: "",
        placeholder: "[verse]\nLa nuit descend sur la ville", placeholderEn: "[verse]\nThe night falls on the city",
        doc: "Le texte chanté, avec ses marques de partie entre crochets. Vide, le champ est absent du plan et le rendu est instrumental.",
        docEn: "The sung text, with its section markers in brackets. Empty, the field is absent from the plan and the render is instrumental." },
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [0, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Le tempo écrit dans le plan. À zéro, le champ est absent et le moteur décide. L'entrée « Tempo » le remplace quand elle est branchée.",
        docEn: "The tempo written into the plan. At zero, the field is absent and the engine decides. The « Tempo » input replaces it when connected." },
      { nom: "Tonalité", nomEn: "Key", type: "texte", defaut: "C major", defautEn: "C major",
        doc: "La tonalité, sous la forme « G major » ou « A minor ». Une mention entre parenthèses à la fin, telle qu'un pourcentage de confiance, est retirée avant l'écriture. Vide, le champ est absent du plan. L'entrée « Tonalité » la remplace quand elle est branchée.",
        docEn: "The key, as « G major » or « A minor ». A mention in parentheses at the end, such as a confidence percentage, is removed before writing. Empty, the field is absent from the plan. The « Key » input replaces it when connected." },
      { nom: "Durée", nomEn: "Length", type: "nombre", plage: [5, 600], pas: 5, defaut: 60, unite: "s",
        doc: "Longueur visée. Ce plan ne portant pas de codes audio, elle est tenue à l'échantillon.",
        docEn: "Target length. As this plan carries no audio codes, it is held to the sample." },
      { nom: "Langue du chant", nomEn: "Singing language", type: "choix",
        options: LANGUES.map((l) => l.fr), optionsEn: LANGUES.map((l) => l.en),
        optionIds: LANGUES.map((l) => l.id), defaut: "Français", defautEn: "French",
        doc: "La langue dans laquelle la voix chante. Les dix proposées sont celles que le modèle tient le mieux.",
        docEn: "The language the voice sings in. The ten offered are those the model holds best." },
      { nom: "Signature", nomEn: "Time signature", type: "choix",
        options: SIGNATURES, optionsEn: SIGNATURES, optionIds: SIGNATURES,
        defaut: "4", defautEn: "4",
        doc: "Le nombre de temps par mesure, écrit dans le plan.",
        docEn: "The number of beats per bar, written into the plan." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "nombre", plage: [-1, 999999], pas: 1, defaut: -1,
        doc: "Rend le rendu reproductible. À moins un, le moteur en tire une à chaque exécution et l'inscrit dans le plan : les rendus diffèrent, et celle qui a servi est lisible dans le message, de sorte qu'un résultat réussi peut être refait.",
        docEn: "Makes the render reproducible. At minus one, the engine draws one at each run and writes it into the plan: the renders differ, and the one that served is readable in the message, so a successful result can be made again." },
    ],
    async executer(ctx: any) {
      const entreeDescription = ctx.entree(0);
      const entreeParoles = ctx.entree(1);
      const entreeTempo = ctx.entree(2);
      const entreeTonalite = ctx.entree(3);

      const texteOu = (valeur: unknown, repli: string) =>
        typeof valeur === "string" && valeur.trim() ? valeur : repli;

      const plan = planDepuis({
        description: texteOu(entreeDescription, ctx.paramTexte("Description", "")),
        paroles: texteOu(entreeParoles, ctx.paramTexte("Paroles", "")),
        tempo: typeof entreeTempo === "number" && entreeTempo > 0
          ? entreeTempo : ctx.paramNombre("Tempo", 120),
        tonalite: texteOu(entreeTonalite, ctx.paramTexte("Tonalité", "")),
        dureeSec: ctx.paramNombre("Durée", 60),
        langue: ctx.paramTexte("Langue du chant", "fr"),
        signature: ctx.paramTexte("Signature", "4"),
        graine: ctx.paramNombre("Graine", -1),
      });

      // LE MESSAGE DIT CE QUE LE PLAN PORTE, et non seulement qu'il a été écrit. Relevé par Fabien,
      // qui demandait comment s'assurer que le réglage « Tempo » agit : la sortie est un document
      // que le nœud n'affiche pas, de sorte que rien ne distinguait un tempo venu du port d'un
      // tempo venu du réglage, ni un champ écrit d'un champ omis. Les deux valeurs qui peuvent
      // arriver par un port sont donc relues DANS LE PLAN, après assemblage, et non recopiées des
      // réglages — sans quoi le message dirait ce qu'on a demandé plutôt que ce qui est écrit.
      const ecrit = JSON.parse(plan);
      const resume = [
        ecrit.bpm ? `${ecrit.bpm} BPM` : traduire("msg.composerPlan.sansTempo"),
        ecrit.keyscale || traduire("msg.composerPlan.sansTonalite"),
      ].join(" · ");

      return {
        valeurs: [plan],
        message: traduire("msg.composerPlan.rendu", resume, String(ecrit.duration)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
