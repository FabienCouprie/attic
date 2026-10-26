// plugins/chanson-variantes.ts — Quatre nœuds de plus autour d'ACE-Step : reprendre, retoucher,
// prolonger un audio, et écrire un plan depuis une phrase.
//
// UN NŒUD PAR GESTE, ET NON UNE LISTE DE TÂCHES SUR UN SEUL. Le moteur accepte sept `task_type`,
// et chacun réclame autre chose : un dosage, une plage de temps, un nom de piste. Réunis sur un
// nœud, la moitié des réglages serait morte à chaque exécution, et c'est le terrain exact du
// défaut « paramètres jetés ». Réunis sur un nœud, la notice devrait aussi décrire sept conduites
// à la fois. `electron/acestep-plan.cjs` porte le relevé de ce que chaque tâche exige, et
// `acestep-plan.test.ts` l'éprouve sans le binaire.
//
// LES TROIS TÂCHES À MODÈLE DE BASE NE SONT PAS ICI. `lego`, `extract` et `complete` partent avec
// le modèle rapide, mais le moteur avertit lui-même que leur sortie ne vaut rien. Le champ
// `offerte` de la table les tient à l'écart, et un cas le garde.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { annoncerModele } from "./message-modele";
import { messageEchecPont } from "./pont-electron";
import { choixLangues } from "../core/langues";
import {
  CANAL_PLANIFIER, ENTREES_SOURCE, LANGUES, NOTICE_RENDU_EN, NOTICE_RENDU_FR, NOTICE_TIMBRE_EN,
  NOTICE_TIMBRE_FR, PARAMETRES_RENDU, SORTIE_AUDIO, SORTIE_NOTICE_EN,
  SORTIE_NOTICE_FR, api, rendreSurAudio, suivre,
} from "./chanson-aides";
import { PARAMETRE_CALCUL } from "./parametre-calcul";

export const fiches = ([
  {
    id: "reprendre-chanson", nom: "Reprendre une chanson", nomEn: "Cover a Song",
    univers: "Entrées", famille: "Génération",
    resume: "Rend une nouvelle version d'un audio, en suivant un plan de chanson.",
    resumeEn: "Renders a new version of an audio, following a song plan.",
    notice: "Ce composant rend une nouvelle version d'un audio, en suivant le plan de chanson qu'il reçoit. "
      + "L'entrée « Plan » reçoit le plan, et l'entrée « Audio » le son dont la version est tirée.\n\n"
      + NOTICE_TIMBRE_FR
      + "« Dosage » règle la part de l'audio reçu que le rendu suit. À un, le rendu s'en approche au plus "
      + "près ; plus bas, il s'en écarte.\n\n"
      + "« Bruit » règle le bruit mêlé à l'audio reçu avant le rendu.\n\n"
      + "« Quantification des codes » décide du traitement des codes audio tirés de l'audio reçu. "
      + "« Avec » les quantifie, « Sans » les garde continus.\n\n"
      + NOTICE_RENDU_FR + SORTIE_NOTICE_FR,
    noticeEn: "This component renders a new version of an audio, following the song plan it receives. The "
      + "« Plan » input receives the plan, and the « Audio » input the sound the version is drawn from.\n\n"
      + NOTICE_TIMBRE_EN
      + "« Strength » sets how closely the render follows the received audio. At one, the render comes as "
      + "close as it can; lower, it departs from it.\n\n"
      + "« Noise » sets the noise mixed into the received audio before the render.\n\n"
      + "« Code quantization » decides how the audio codes drawn from the received audio are treated. "
      + "« With » quantizes them, « Without » keeps them continuous.\n\n"
      + NOTICE_RENDU_EN + SORTIE_NOTICE_EN,
    entrees: [...ENTREES_SOURCE],
    sorties: [...SORTIE_AUDIO],
    parametres: [
      { nom: "Dosage", nomEn: "Strength", type: "curseur", plage: [0, 1], pas: 0.05, defaut: 1,
        doc: "Part de l'audio reçu que le rendu suit. À un, il s'en approche au plus près.",
        docEn: "How closely the render follows the received audio. At one, it comes as close as it can." },
      { nom: "Bruit", nomEn: "Noise", type: "curseur", plage: [0, 1], pas: 0.05, defaut: 0,
        doc: "Bruit mêlé à l'audio reçu avant le rendu.",
        docEn: "Noise mixed into the received audio before the render." },
      { nom: "Quantification des codes", nomEn: "Code quantization", type: "choix",
        options: ["Avec", "Sans"], optionsEn: ["With", "Without"], optionIds: ["cover", "cover-nofsq"],
        defaut: "Avec", defautEn: "With",
        doc: "Traitement des codes audio tirés de l'audio reçu. « Avec » les quantifie, « Sans » les garde continus.",
        docEn: "How the audio codes drawn from the received audio are treated. « With » quantizes them, « Without » keeps them continuous." },
      ...PARAMETRES_RENDU,
    ],
    async executer(ctx: any) {
      const annoncer = () => annoncerModele(ctx, "reprendre-chanson", traduire("progress.chanson.modeles"));
      return rendreSurAudio(ctx, annoncer, (c) => ({
        // LA LISTE PORTE LE NOM DE LA TÂCHE DANS SON IDENTIFIANT D'OPTION : « Avec » vaut `cover`
        // et « Sans » vaut `cover-nofsq`, donc le choix se lit sans table de correspondance.
        tache: c.paramTexte("Quantification des codes", "cover") || "cover",
        dosage: c.paramNombre("Dosage", 1),
        bruit: c.paramNombre("Bruit", 0),
      }));
    },
  },
  {
    id: "retoucher-chanson", nom: "Retoucher une chanson", nomEn: "Repaint a Song",
    univers: "Entrées", famille: "Génération",
    resume: "Refait un passage d'un audio entre deux instants, et garde le reste.",
    resumeEn: "Repaints a passage of an audio between two instants, and keeps the rest.",
    notice: "Ce composant refait un passage d'un audio entre deux instants, et garde le reste tel quel. "
      + "L'entrée « Plan » reçoit le plan de chanson, et l'entrée « Audio » le son à retoucher.\n\n"
      + NOTICE_TIMBRE_FR
      + "« Début » et « Fin » fixent en secondes les bornes du passage refait. La fin doit être après le "
      + "début ; sinon le composant le signale et ne rend rien.\n\n"
      + NOTICE_RENDU_FR
      + "La sortie « Audio » rend le son entier, le passage refait à sa place, en stéréo à quarante-huit "
      + "kilohertz.",
    noticeEn: "This component repaints a passage of an audio between two instants, and keeps the rest as it "
      + "is. The « Plan » input receives the song plan, and the « Audio » input the sound to repaint.\n\n"
      + NOTICE_TIMBRE_EN
      + "« Start » and « End » set in seconds the bounds of the repainted passage. The end must be after "
      + "the start; otherwise the component reports it and returns nothing.\n\n"
      + NOTICE_RENDU_EN
      + "The « Audio » output returns the whole sound, with the repainted passage in place, in stereo at "
      + "forty-eight kilohertz.",
    entrees: [...ENTREES_SOURCE],
    sorties: [...SORTIE_AUDIO],
    parametres: [
      { nom: "Début", nomEn: "Start", type: "nombre", plage: [0, 600], pas: 0.5, defaut: 0, unite: "s",
        doc: "Instant où le passage refait commence.",
        docEn: "Instant at which the repainted passage starts." },
      { nom: "Fin", nomEn: "End", type: "nombre", plage: [0, 600], pas: 0.5, defaut: 8, unite: "s",
        doc: "Instant où le passage refait finit. Il doit être après « Début ».",
        docEn: "Instant at which the repainted passage ends. It must be after « Start »." },
      ...PARAMETRES_RENDU,
    ],
    async executer(ctx: any) {
      const annoncer = () => annoncerModele(ctx, "retoucher-chanson", traduire("progress.chanson.modeles"));
      return rendreSurAudio(ctx, annoncer, (c) => ({
        tache: "repaint",
        debut: c.paramNombre("Début", 0),
        fin: c.paramNombre("Fin", 8),
      }));
    },
  },
  {
    id: "prolonger-chanson", nom: "Prolonger une chanson", nomEn: "Extend a Song",
    univers: "Entrées", famille: "Génération",
    resume: "Ajoute de la musique avant ou après un audio, en suivant un plan de chanson.",
    resumeEn: "Adds music before or after an audio, following a song plan.",
    notice: "Ce composant ajoute de la musique avant ou après un audio, en suivant le plan de chanson qu'il "
      + "reçoit. L'entrée « Plan » reçoit le plan, et l'entrée « Audio » le son à prolonger.\n\n"
      + NOTICE_TIMBRE_FR
      + "« Côté » choisit où la musique s'ajoute. « Avant » la place devant le son reçu, « Après » la place "
      + "à sa suite.\n\n"
      + "« Durée ajoutée » fixe en secondes la longueur ajoutée. La sortie dure celle du son reçu plus "
      + "cette durée.\n\n"
      + NOTICE_RENDU_FR + SORTIE_NOTICE_FR,
    noticeEn: "This component adds music before or after an audio, following the song plan it receives. The "
      + "« Plan » input receives the plan, and the « Audio » input the sound to extend.\n\n"
      + NOTICE_TIMBRE_EN
      + "« Side » chooses where the music is added. « Before » puts it ahead of the received sound, "
      + "« After » puts it next.\n\n"
      + "« Added length » sets in seconds the length added. The output lasts that of the received sound "
      + "plus this length.\n\n"
      + NOTICE_RENDU_EN + SORTIE_NOTICE_EN,
    entrees: [...ENTREES_SOURCE],
    sorties: [...SORTIE_AUDIO],
    parametres: [
      { nom: "Côté", nomEn: "Side", type: "choix",
        options: ["Après", "Avant"], optionsEn: ["After", "Before"], optionIds: ["apres", "avant"],
        defaut: "Après", defautEn: "After",
        doc: "Où la musique s'ajoute. « Avant » la place devant le son reçu, « Après » à sa suite.",
        docEn: "Where the music is added. « Before » puts it ahead of the received sound, « After » next to it." },
      { nom: "Durée ajoutée", nomEn: "Added length", type: "nombre", plage: [1, 300], pas: 1, defaut: 8, unite: "s",
        doc: "Longueur ajoutée au son reçu.",
        docEn: "Length added to the received sound." },
      ...PARAMETRES_RENDU,
    ],
    async executer(ctx: any) {
      const annoncer = () => annoncerModele(ctx, "prolonger-chanson", traduire("progress.chanson.modeles"));
      return rendreSurAudio(ctx, annoncer, (c, source) => ({
        // LA PLAGE SE CALCULE DANS LE PROCESSUS PRINCIPAL, qui porte le relevé des deux formules.
        // Le nœud ne transmet que le côté, la durée et celle de l'audio reçu.
        tache: "repaint",
        prolongement: { cote: c.paramTexte("Côté", "apres") || "apres", ajout: c.paramNombre("Durée ajoutée", 8) },
        dureeSource: source.duration,
      }));
    },
  },
  {
    id: "ecrire-chanson", nom: "Écrire une chanson", nomEn: "Write a Song",
    univers: "Entrées", famille: "Génération",
    resume: "Écrit le plan complet d'une chanson à partir d'une phrase courte.",
    resumeEn: "Writes a song's complete plan from a short sentence.",
    notice: "Ce composant écrit le plan complet d'une chanson à partir d'une phrase courte, et le rend en "
      + "texte. Il rédige la description détaillée, les paroles, le tempo, la tonalité et la durée.\n\n"
      + "« Phrase » dit en quelques mots ce qu'on veut entendre. L'entrée du même nom la reçoit d'un autre "
      + "composant quand elle est branchée, et le réglage sert alors de repli.\n\n"
      + "« Langue du chant » dit en quelle langue chanter, parmi les dix proposées.\n\n"
      + "« Graine » rend le plan reproductible ; à moins un, chaque exécution diffère.\n\n"
      + "« Calcul » nomme le périphérique employé.\n\n"
      + "La longueur du plan est décidée par le composant, et ne se règle pas.\n\n"
      + "La sortie « Plan » rend le document à passer au rendu, et la sortie « Paroles » le texte chanté, "
      + "qui se lit et se corrige avant de rendre.",
    noticeEn: "This component writes a song's complete plan from a short sentence, and returns it as text. It "
      + "writes the detailed description, the lyrics, the tempo, the key and the length.\n\n"
      + "« Sentence » says in a few words what is wanted. The input of the same name receives it from "
      + "another component when connected, and the setting then serves as a fallback.\n\n"
      + "« Singing language » says in which language to sing, among the ten offered.\n\n"
      + "« Seed » makes the plan reproducible; at minus one, every run differs.\n\n"
      + "« Compute » names the device used.\n\n"
      + "The plan's length is decided by the component, and is not adjustable.\n\n"
      + "The « Plan » output returns the document to pass to the render, and the « Lyrics » output the sung "
      + "text, which can be read and corrected before rendering.",
    entrees: [
      { nom: "Phrase", nomEn: "Sentence", type: "texte", requis: false },
    ],
    sorties: [
      { nom: "Plan", nomEn: "Plan", type: "texte", sousType: "plan" },
      { nom: "Paroles", nomEn: "Lyrics", type: "texte", sousType: "paroles" },
    ],
    parametres: [
      { nom: "Phrase", nomEn: "Sentence", type: "texte",
        defaut: "une ballade triste au piano", defautEn: "a sad piano ballad",
        doc: "Ce qu'on veut entendre, en quelques mots. L'entrée « Phrase » la remplace quand elle est branchée.",
        docEn: "What is wanted, in a few words. The « Sentence » input replaces it when connected." },
      { nom: "Langue du chant", nomEn: "Singing language", type: "choix",
        ...choixLangues(LANGUES), defaut: "Français", defautEn: "French",
        doc: "La langue dans laquelle la voix chante. Les dix proposées sont celles que le modèle tient le mieux.",
        docEn: "The language the voice sings in. The ten offered are those the model holds best." },
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
      const entreePhrase = ctx.entree(0);
      await annoncerModele(ctx, "ecrire-chanson", traduire("progress.chanson.modeles"));
      const debrancher = suivre(ctx);
      try {
        let r: { ok: boolean; plan?: string; journal?: string };
        try {
          // AUCUNE DURÉE N'EST TRANSMISE, et c'est voulu : dans ce mode le planificateur choisit la
          // longueur du morceau. Une durée demandée serait remplacée par la sienne, donc un réglage
          // de durée sur ce nœud ne tiendrait pas sa promesse.
          r = await pont.acestepPlanifier({
            mode: "inspire",
            description: typeof entreePhrase === "string" && entreePhrase.trim()
              ? entreePhrase : ctx.paramTexte("Phrase", ""),
            langue: ctx.paramTexte("Langue du chant", "fr"),
            graine: ctx.paramNombre("Graine", -1),
            peripherique: ctx.paramTexte("Calcul", "").trim(),
          }) as typeof r;
        } catch (erreur) {
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
] as FicheAudio[]).map(avecDoc);
