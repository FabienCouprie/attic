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
import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { annoncerModele } from "./message-modele";
import { messageEchecPont } from "./pont-electron";
import { choixLangues } from "../core/langues";
import {
  CANAL_PLANIFIER, ENTREES_SOURCE, LANGUES, NOTICE_RENDU_EN, NOTICE_RENDU_FR, NOTICE_TIMBRE_EN,
  NOTICE_TIMBRE_FR, PARAMETRES_RENDU, PARAMETRE_MODELE, SORTIE_AUDIO, SORTIE_NOTICE_EN,
  SORTIE_NOTICE_FR, api, modeleChoisi, paquetsEcartes, rendreSurAudio, suivre,
} from "./chanson-aides";
import { PARAMETRE_CALCUL } from "./parametre-calcul";

export const fiches = ([
  fiche({
    id: "reprendre-chanson", nom: "Reprendre une chanson", nomEn: "Cover a Song",
    univers: "Entrées", famille: "Génération",
    resume: "Rend une nouvelle version d'un audio, en suivant un plan de chanson.",
    resumeEn: "Renders a new version of an audio, following a song plan.",
    notice: "Ce composant rend une nouvelle version d'un audio, en suivant le plan de chanson qu'il reçoit. "
      + "L'entrée « Plan » reçoit le plan, et l'entrée « Audio » le son dont la version est tirée.\n\n"
      + NOTICE_TIMBRE_FR
      + "« Dosage » règle la part des étapes de débruitage qui suivent l'audio reçu. La forme de cet audio "
      + "se décide dans les premières étapes : au-dessous d'un seuil, le rendu ne suit que le plan ; "
      + "au-dessus, il garde cette forme. Le passage de l'un à l'autre se fait d'un cran du curseur au "
      + "suivant : entre 0,2 et 0,25 sur « Rapide » avec « Glissement » à zéro, entre 0,1 et 0,15 sur "
      + "« Base ». Sur « Rapide » avec « Glissement » à un, la forme est déjà gardée à 0,15. Une description "
      + "de plan éloignée de l'audio reçu fait monter ce seuil. Au-dessus du seuil, avec « Quantification "
      + "des codes » sur « Avec », un dosage plus haut ne change presque plus le résultat ; sur « Sans », "
      + "le rendu se rapproche de l'audio reçu à mesure que le dosage monte. À zéro, l'audio reçu n'est "
      + "pas suivi.\n\n"
      + "« Départ sur l'audio » règle le point d'où le rendu part. À zéro, il part du bruit seul. En montant, "
      + "il part d'un mélange de bruit et de l'audio reçu, avec moins d'étapes de débruitage, et le rendu se "
      + "rapproche de cet audio ; à un, il en est presque la copie.\n\n"
      + "« Quantification des codes » décide du traitement des codes audio tirés de l'audio reçu. "
      + "« Avec » les quantifie : le rendu garde la forme de l'audio reçu et s'en écarte dans le détail. "
      + "« Sans » les garde continus : le rendu suit l'audio reçu de bien plus près, dans sa forme comme "
      + "dans son harmonie.\n\n"
      + NOTICE_RENDU_FR + SORTIE_NOTICE_FR,
    noticeEn: "This component renders a new version of an audio, following the song plan it receives. The "
      + "« Plan » input receives the plan, and the « Audio » input the sound the version is drawn from.\n\n"
      + NOTICE_TIMBRE_EN
      + "« Strength » sets the share of denoising steps that follow the received audio. The form of that "
      + "audio is settled in the first steps: below a threshold, the render follows the plan alone; above "
      + "it, it keeps that form. The change from one to the other happens from one slider notch to the "
      + "next: between 0.2 and 0.25 on « Fast » with « Shift » at zero, between 0.1 and 0.15 on « Base ». "
      + "On « Fast » with « Shift » at one, the form is already kept at 0.15. A plan description far from "
      + "the received audio raises this threshold. Above the threshold, with « Code quantization » on "
      + "« With », a higher strength hardly changes the result any more; on « Without », the render comes "
      + "closer to the received audio as the strength rises. At zero, the received audio is not "
      + "followed.\n\n"
      + "« Start from the audio » sets the point the render starts from. At zero, it starts from noise alone. "
      + "Higher up, it starts from a mix of noise and the received audio, with fewer denoising steps, and the "
      + "render comes closer to that audio; at one, it is almost a copy of it.\n\n"
      + "« Code quantization » decides how the audio codes drawn from the received audio are treated. "
      + "« With » quantizes them: the render keeps the form of the received audio and departs from it in "
      + "the detail. « Without » keeps them continuous: the render follows the received audio much more "
      + "closely, in its form as in its harmony.\n\n"
      + NOTICE_RENDU_EN + SORTIE_NOTICE_EN,
    entrees: [...ENTREES_SOURCE],
    sorties: [...SORTIE_AUDIO],
    parametres: [
      // LE DOSAGE EST UN SEUIL, ET C'EST LE MODÈLE QUI LE VEUT. Le moteur lit `audio_cover_strength`
      // comme la part des pas qui voient la source, et bascule au pas `int(pas × dosage)` sur le silence
      // et la consigne `text2music`. La forme de la source se décide dans les tout premiers pas : un
      // basculement après eux la garde, un basculement avant la perd. Le point dépend du modèle et du
      // glissement (bruit 0,929 perdu et 0,915 gardé sur le rapide, 0,90 encore perdu sur la base),
      // non du nombre de pas. Mesuré le 2026-11-27
      // sur 30 s du loup, motif spectral au même instant contre la source (`EXECUTION/reprise-proche/`) :
      //   Rapide, glissement 3 : 1 → 0,535 ; 0,5 → 0,572 ; 0,25 → 0,443 ; 0,125 → 0,022 ; 0 → −0,140
      //   Rapide, 32 pas : 6 pas sur la source → 0,056 ; 7 pas → 0,422 (la marche n'est pas la résolution)
      //   Rapide, glissement 1 : 0,15 → 0,487
      //   Base : 0,05 → 0,005 ; 0,1 → 0,092 ; 0,15 → 0,287 ; 1 → 0,286
      //   style piano, Rapide : 0,25 → 0,002
      //   « Sans », Rapide : 1 → 0,927 ; 0,5 → 0,670 ; 0,25 → 0,247 ; 0,2 → 0,009 ; 0,1 → −0,140
      //   « Sans », Base : 0,1 → 0,193 ; 0,15 → 0,294
      // Le seuil est le même sur les deux quantifications ; au-dessus, « Avec » fait un plateau et
      // « Sans » une pente.
      // L'échelle et le défaut restent ceux du moteur, par décision de Fabien : la notice dit le seuil.
      { nom: "Dosage", nomEn: "Strength", type: "curseur", plage: [0, 1], pas: 0.05, defaut: 1,
        doc: "Part des étapes de débruitage qui suivent l'audio reçu. Sa forme se décide dans les premières : au-dessous d'un seuil, le rendu ne suit que le plan ; au-dessus, il la garde. Le seuil est entre 0,2 et 0,25 sur « Rapide » avec « Glissement » à zéro, entre 0,1 et 0,15 sur « Base ». Au-dessus, sur « Avec », le dosage ne change presque plus rien ; sur « Sans », le rendu se rapproche de l'audio à mesure qu'il monte.",
        docEn: "Share of the denoising steps that follow the received audio. Its form is settled in the first ones: below a threshold, the render follows the plan alone; above it, it keeps that form. The threshold lies between 0.2 and 0.25 on « Fast » with « Shift » at zero, between 0.1 and 0.15 on « Base ». Above it, on « With », the strength hardly changes anything more; on « Without », the render comes closer to the audio as it rises." },
      // CE RÉGLAGE S'APPELAIT « BRUIT », ET IL DISAIT LE CONTRAIRE DE CE QU'IL FAIT. Le moteur lit
      // `cover_noise_strength` comme la proximité du point de départ à la source : « 0 = pure noise,
      // 1 = source » (`request.h` d'acestep.cpp), et il part de `t × bruit + (1 − t) × source`, `t`
      // étant le pas le plus proche de 1 − valeur, la liste des pas tronquée d'autant. La notice
      // promettait du bruit mêlé à l'audio : monter le curseur pour s'éloigner de l'original l'en
      // rapprochait. Mesuré le 2026-11-27 sur 30 s du loup, motif spectral au même instant contre la
      // source : 0,535 à zéro, puis 0,719, 0,850, 0,929 et 0,947 à 0,1, 0,25, 0,5 et 1, le moteur ne
      // gardant que six, quatre, deux puis un pas (`EXECUTION/reprise-proche/RAPPORT.md`).
      //
      // LA VALEUR ENVOYÉE N'A PAS CHANGÉ, SEULS LE NOM ET LE TEXTE ONT CHANGÉ. L'autre réparation,
      // envoyer `1 − valeur` sous l'ancien nom, aurait fait d'un graphe enregistré à zéro une
      // quasi-copie de sa source sans rien dire. Le nom d'avant est hérité : un projet qui porte
      // « Bruit » rouvre avec sa valeur ici (`ui/pertes-chargement.ts`).
      { nom: "Départ sur l'audio", nomEn: "Start from the audio", nomsHerites: ["Bruit"],
        type: "curseur", plage: [0, 1], pas: 0.05, defaut: 0,
        doc: "Point d'où le rendu part. À zéro, le bruit seul ; en montant, un mélange de bruit et de l'audio reçu, avec moins d'étapes, et le rendu s'en rapproche ; à un, il en est presque la copie.",
        docEn: "Point the render starts from. At zero, noise alone; higher up, a mix of noise and the received audio, with fewer steps, and the render comes closer to it; at one, it is almost a copy of it." },
      // « SANS » SUIT L'AUDIO REÇU DE BIEN PLUS PRÈS, et la notice le dit depuis le 2026-11-27. Le moteur
      // saute alors l'aller-retour FSQ (25 Hz → 5 Hz → 25 Hz) qui efface le détail de la source. Mesuré
      // sur 30 s du loup, au dosage 1, contre la source : motif spectral au même instant 0,927 contre
      // 0,535 sur « Avec », DTW du chroma 0,030 contre 0,093. Le timbre n'en est pas plus proche (MFCC
      // 17,5 contre 17,2), et le son est plus clair (centroïde +1 274 Hz).
      { nom: "Quantification des codes", nomEn: "Code quantization", type: "choix",
        options: ["Avec", "Sans"], optionsEn: ["With", "Without"], optionIds: ["cover", "cover-nofsq"],
        defaut: "Avec", defautEn: "With",
        doc: "Traitement des codes audio tirés de l'audio reçu. « Avec » les quantifie, et le rendu s'écarte de l'audio dans le détail ; « Sans » les garde continus, et le rendu le suit de bien plus près, dans sa forme comme dans son harmonie.",
        docEn: "How the audio codes drawn from the received audio are treated. « With » quantizes them, and the render departs from the audio in the detail; « Without » keeps them continuous, and the render follows it much more closely, in its form as in its harmony." },
      PARAMETRE_MODELE,
      ...PARAMETRES_RENDU,
    ],
    async executer(ctx) {
      const annoncer = () => annoncerModele(ctx, "reprendre-chanson", traduire("progress.chanson.modeles"), paquetsEcartes(ctx));
      return rendreSurAudio(ctx, annoncer, (c) => ({
        ...modeleChoisi(c),
        // LA LISTE PORTE LE NOM DE LA TÂCHE DANS SON IDENTIFIANT D'OPTION : « Avec » vaut `cover`
        // et « Sans » vaut `cover-nofsq`, donc le choix se lit sans table de correspondance.
        tache: c.paramTexte("Quantification des codes", "cover") || "cover",
        dosage: c.paramNombre("Dosage", 1),
        // LE CHAMP DU PONT GARDE SON NOM, `bruit`, que `appliquerTache` verse tel quel dans
        // `cover_noise_strength` : c'est le nom que le moteur donne à cette proximité.
        bruit: c.paramNombre("Départ sur l'audio", 0),
      }));
    },
  }),
  fiche({
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
      PARAMETRE_MODELE,
      ...PARAMETRES_RENDU,
    ],
    async executer(ctx) {
      const annoncer = () => annoncerModele(ctx, "retoucher-chanson", traduire("progress.chanson.modeles"), paquetsEcartes(ctx));
      return rendreSurAudio(ctx, annoncer, (c) => ({
        ...modeleChoisi(c),
        tache: "repaint",
        debut: c.paramNombre("Début", 0),
        fin: c.paramNombre("Fin", 8),
      }));
    },
  }),
  fiche({
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
      PARAMETRE_MODELE,
      ...PARAMETRES_RENDU,
    ],
    async executer(ctx) {
      const annoncer = () => annoncerModele(ctx, "prolonger-chanson", traduire("progress.chanson.modeles"), paquetsEcartes(ctx));
      return rendreSurAudio(ctx, annoncer, (c, source) => ({
        ...modeleChoisi(c),
        // LA PLAGE SE CALCULE DANS LE PROCESSUS PRINCIPAL, qui porte le relevé des deux formules.
        // Le nœud ne transmet que le côté, la durée et celle de l'audio reçu.
        tache: "repaint",
        prolongement: { cote: c.paramTexte("Côté", "apres") || "apres", ajout: c.paramNombre("Durée ajoutée", 8) },
        dureeSource: source.duration,
      }));
    },
  }),
  fiche({
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
    async executer(ctx) {
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
  }),
] as FicheAudio[]).map(avecDoc);
