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
 * LES CHAMPS VIDES NE S'ÉCRIVENT PAS. Un `lyrics` vide ferait chanter du silence annoncé, et une
 * graine négative est la convention du dépôt pour « au hasard » : l'écrire ferait une graine posée.
 * Le plan n'a donc que ce qu'on lui a donné, comme celui du planificateur.
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
    notice: "Ce composant écrit un plan de chanson, le même document que « Planifier une chanson » rend, mais "
      + "à partir de pièces qu'on lui donne. Chaque pièce arrive par une entrée ou, à défaut, par le réglage "
      + "du même nom.\n\n"
      + "C'est ainsi qu'un audio devient un plan. Brancher « Décrire un audio » sur « Description », "
      + "« Détecteur de tempo » sur « Tempo », « Analyse harmonique » sur « Tonalité », et une "
      + "reconnaissance de parole sur « Paroles » : le plan qui sort se branche sur « Rendre une chanson ».\n\n"
      + "Ce que le plan ne porte pas, et ce que cela change. Le planificateur écrit aussi des codes audio, "
      + "cinq par seconde, qui portent la musique elle-même ; rien ne sait les tirer d'un son, et ce "
      + "composant n'en écrit donc aucun. Mesuré en rendant deux fois le même plan, avec ses codes et sans : "
      + "les deux rendus ne corrèlent qu'à 0,066, c'est-à-dire qu'ils n'ont rien de commun. Un plan sans "
      + "codes fait donc une pièce neuve, dans la forme du morceau reçu, et non une reconstitution. Pour "
      + "refaire une version d'un morceau existant, c'est « Reprendre une chanson » qu'il faut.\n\n"
      + "En contrepartie, « Durée » décide vraiment : sans codes, la longueur demandée est tenue à "
      + "l'échantillon. Avec eux, c'est leur nombre qui l'impose.\n\n"
      + "« Tonalité » accepte la forme que rend « Analyse harmonique », confiance comprise : « G major (87%) » "
      + "est lu comme « G major ». « Tempo » à zéro laisse le champ absent du plan. « Graine » à moins un "
      + "laisse le rendu libre ; posée, elle rend le rendu reproductible. « Signature » est le nombre de temps "
      + "par mesure.\n\n"
      + "La sortie « Plan » rend le document en texte, lisible et corrigeable avant d'être rendu.",
    noticeEn: "This component writes a song plan, the same document « Plan a Song » returns, but from pieces "
      + "it is given. Each piece arrives through an input or, failing that, through the setting of the same "
      + "name.\n\n"
      + "This is how an audio becomes a plan. Connect « Describe an Audio » to « Description », « Tempo "
      + "Detector » to « Tempo », « Harmonic Analysis » to « Key », and a speech recognition to « Lyrics »: "
      + "the plan that comes out connects to « Render a Song ».\n\n"
      + "What the plan does not carry, and what that changes. The planner also writes audio codes, five per "
      + "second, which carry the music itself; nothing can extract them from a sound, so this component "
      + "writes none. Measured by rendering the same plan twice, with its codes and without: the two results "
      + "correlate at only 0.066, that is, they have nothing in common. A plan without codes therefore makes "
      + "a new piece, in the shape of the received track, not a reconstruction. To make a version of an "
      + "existing track, use « Cover a Song ».\n\n"
      + "In exchange, « Length » really decides: without codes, the requested length is held to the sample. "
      + "With them, their count imposes it.\n\n"
      + "« Key » accepts the form « Harmonic Analysis » returns, confidence included: « G major (87%) » is "
      + "read as « G major ». « Tempo » at zero leaves the field out of the plan. « Seed » at minus one "
      + "leaves the render free; set, it makes the render reproducible. « Time signature » is the number of "
      + "beats per bar.\n\n"
      + "The « Plan » output returns the document as text, readable and correctable before being rendered.",
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
        doc: "La tonalité, sous la forme « G major » ou « A minor ». La forme que rend « Analyse harmonique », confiance comprise, est acceptée. Vide, le champ est absent du plan.",
        docEn: "The key, as « G major » or « A minor ». The form « Harmonic Analysis » returns, confidence included, is accepted. Empty, the field is absent from the plan." },
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
        doc: "Rend le rendu reproductible. À moins un, chaque exécution diffère et le champ est absent du plan.",
        docEn: "Makes the render reproducible. At minus one, every run differs and the field is absent from the plan." },
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

      return {
        valeurs: [plan],
        message: traduire("msg.composerPlan.rendu", String(ctx.paramNombre("Durée", 60))),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
