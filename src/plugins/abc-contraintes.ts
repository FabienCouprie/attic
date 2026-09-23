// plugins/abc-contraintes.ts — Nœuds « Contraintes ABC » et « Édition ABC par LLM ».
// Le vérificateur et l'éditeur vivent dans audio/abc-contraintes.ts et
// audio/abc-edition-llm.ts, testés ; l'éditeur l'est avec un modèle simulé.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import {
  lireAbcUnique, verifierContraintes, lireInvariants, PREREGLAGES, type Invariant, type Qualite,
} from "../audio/abc-contraintes";
import { editerAbc, type OperationEdition } from "../audio/abc-edition-llm";
import { ollamaGenerer } from "./ollama";

const CONSIGNE_DEFAUT = "Reharmonize with a different, richer harmonization (seventh chords, relative minors, secondary dominants), consonant with the melody.";

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)} %`);
const texteQualite = (q: Qualite) =>
  traduire("msg.abc_contraintes.qualite_var_0_var_1", pct(q.consonanceTempsForts), pct(q.notesDansLaGamme));

export const fiches: FicheAudio[] = ([
  {
    id: "contraintes-abc", nom: "Contraintes ABC", nomEn: "ABC Constraints",
    univers: "Visualisation", famille: "Notation",
    resume: "Vérifie qu'une retouche d'une partition ABC a gardé ce qui devait rester fixe : mesures, métrique, tonalité, mélodie, rythme, accords.",
    resumeEn: "Checks that an edit of an ABC score kept what had to stay fixed: bars, meter, key, melody, rhythm, chords.",
    entrees: [
      { nom: "Origine", nomEn: "Original", type: "texte", requis: true },
      { nom: "Modifié", nomEn: "Edited", type: "texte", requis: true },
    ],
    sorties: [
      { nom: "ABC validé", nomEn: "Validated ABC", type: "texte" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Contrôle", nomEn: "Check", type: "choix",
        options: ["Réharmonisation", "Changement de hauteurs", "Variation", "Structure seule", "Personnalisé"],
        optionsEn: ["Reharmonization", "Pitch change", "Variation", "Structure only", "Custom"],
        optionIds: ["reharmonisation", "hauteurs", "variation", "structure", "personnalise"],
        defaut: "Réharmonisation", defautEn: "Reharmonization",
        doc: "Ce qui doit rester fixe, selon la retouche. Réharmonisation : mesures, métrique, tonalité et mélodie. Changement de hauteurs : mesures, métrique et rythme. Variation : mesures, métrique et tonalité. Structure seule : mesures et métrique. Personnalisé : la liste du paramètre Invariants.",
        docEn: "What must stay fixed, depending on the edit. Reharmonization: bars, meter, key and melody. Pitch change: bars, meter and rhythm. Variation: bars, meter and key. Structure only: bars and meter. Custom: the list in the Invariants parameter." },
      // Les deux langues sont acceptées à la lecture (cf. lireInvariants) : un
      // projet enregistré en français s'ouvre en anglais sans rien casser.
      { nom: "Invariants", nomEn: "Invariants", type: "texte", defaut: "mesures, métrique", defautEn: "bars, meter",
        doc: "Utilisé avec Contrôle « Personnalisé ». Parmi : mesures, métrique, tonalité, mélodie, rythme, accords, ambitus. Mélodie et rythme portent sur la première voix ; ambitus vérifie qu'aucune note ne sort de la plage de l'original.",
        docEn: "Used with Check « Custom ». Among: bars, meter, key, melody, rhythm, chords, range. Melody and rhythm apply to the first voice; range checks that no note leaves the original's span." },
    ],
    async executer(ctx: any) {
      const [origineTexte, modifieTexte] = [ctx.entree(0), ctx.entree(1)];
      if (typeof origineTexte !== "string" || typeof modifieTexte !== "string") {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.abc_contraintes.entrees") };
      }
      const origine = lireAbcUnique(origineTexte), modifie = lireAbcUnique(modifieTexte);
      if (!origine) return { valeurs: [null, null], erreur: true, message: traduire("msg.abc_contraintes.illisible_var_0", traduire("msg.abc_contraintes.origine")) };
      if (!modifie) return { valeurs: [null, null], erreur: true, message: traduire("msg.abc_contraintes.illisible_var_0", traduire("msg.abc_contraintes.modifie")) };

      const controle = ctx.paramTexte("Contrôle", "reharmonisation");
      let invariants: Invariant[];
      if (controle === "personnalise") {
        const lu = lireInvariants(ctx.paramTexte("Invariants", "mesures, métrique"));
        if (lu.inconnus.length) return { valeurs: [null, null], erreur: true, message: traduire("msg.abc_contraintes.inconnus_var_0", lu.inconnus.join(", ")) };
        invariants = lu.invariants;
      } else {
        invariants = PREREGLAGES[controle] ?? PREREGLAGES.reharmonisation;
      }

      const r = verifierContraintes(origine, modifie, invariants);
      const rapport = [
        r.ok ? traduire("msg.abc_contraintes.conforme") : traduire("msg.abc_contraintes.non_conforme_var_0", r.violations.length),
        ...r.violations.map((v) => `- ${v}`),
        texteQualite(r.qualite),
      ].join("\n");
      return {
        valeurs: [r.ok ? modifieTexte : null, rapport],
        erreur: !r.ok,
        message: (r.ok ? traduire("msg.abc_contraintes.conforme") : r.violations.slice(0, 3).join(" · ") + (r.violations.length > 3 ? " …" : ""))
          + ` · ${texteQualite(r.qualite)}`,
      };
    },
  },
  {
    id: "edition-abc-llm", nom: "Édition ABC par LLM", nomEn: "ABC Editing by LLM",
    univers: "Autres", famille: "Texte",
    resume: "Retouche une partition ABC avec un modèle local Ollama (nouveaux accords, ou nouvelles hauteurs sur le même rythme) sans qu'il puisse casser ce qui doit rester fixe.",
    resumeEn: "Edits an ABC score with a local Ollama model (new chords, or new pitches on the same rhythm) without it being able to break what must stay fixed.",
    entrees: [
      { nom: "ABC", type: "texte", requis: true },
      { nom: "Consigne", nomEn: "Instruction", type: "texte", requis: false },
    ],
    sorties: [
      { nom: "ABC", type: "texte" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Opération", nomEn: "Operation", type: "choix",
        options: ["Réharmoniser", "Réécrire les hauteurs"], optionsEn: ["Reharmonize", "Rewrite pitches"],
        optionIds: ["reharmoniser", "hauteurs"], defaut: "Réharmoniser", defautEn: "Reharmonize",
        doc: "Réharmoniser : le modèle ne rend que les accords de chaque mesure, posés ensuite sur la mélodie d'origine, qu'il ne peut donc pas abîmer. Réécrire les hauteurs : il ne rend qu'une hauteur par note, posée sur le rythme d'origine, changement de mode, de tonalité, de contour. Il n'y a pas de variation libre du rythme : mesuré sur deux modèles locaux, elle a échoué 10 fois sur 10, les modèles se trompant sur la durée des mesures.",
        docEn: "Reharmonize: the model only returns the chords of each bar, then placed on the original melody, which it therefore cannot damage. Rewrite pitches: it only returns one pitch per note, placed on the original rhythm, change of mode, key, contour. There is NO free rhythmic variation: measured on two local models, it failed 10 times out of 10, the models getting bar lengths wrong." },
      { nom: "Consigne", nomEn: "Instruction", type: "texte",
        defaut: CONSIGNE_DEFAUT, defautEn: CONSIGNE_DEFAUT,
        doc: "Ce qui est demandé au modèle, de préférence en anglais. Ignorée si l'entrée Consigne est connectée. Pour « Réécrire les hauteurs », par exemple : « Rewrite this melody in E minor, keeping its contour. »",
        docEn: "What is asked of the model, preferably in English. Ignored if the Instruction input is connected. For « Rewrite pitches », for instance: « Rewrite this melody in E minor, keeping its contour. »" },
      // « Garder » et « Keep » sont tous deux acceptés (cf. abc-edition-llm.ts) :
      // l'anglais affiche « Keep », et un projet français reste lisible.
      { nom: "Tonalité du résultat", nomEn: "Result key", type: "texte", defaut: "Garder", defautEn: "Keep",
        doc: "Pour « Réécrire les hauteurs » : « Garder », ou un champ K: d'ABC (« Em », « Ddor »). Elle fixe l'armure du résultat et est donnée au modèle. Si elle change, les accords chiffrés d'origine sont retirés, puisqu'ils ne valent plus, le rapport le dit.",
        docEn: "For « Rewrite pitches »: « Keep », or an ABC K: field (« Em », « Ddor »). It sets the result's key signature and is given to the model. If it changes, the original chord symbols are removed, since they no longer apply, the report says so." },
      { nom: "Modèle", nomEn: "Model", type: "texte", defaut: "gemma4:12b", defautEn: "gemma4:12b",
        doc: "Modèle Ollama installé. Mesuré sur la réharmonisation et le passage en mineur : gemma4:12b et qwen3:4b réussissent tous deux 10 fois sur 10 ; gemma4:12b est plus musical (accords idiomatiques, de 91 à 100 % des notes dans la gamme, mais met 20 à 80 s ; qwen3:4b répond en 2 à 9 s avec des choix plus étranges (accords hors tonalité, 83) 88 % de notes dans la gamme).",
        docEn: "Installed Ollama model. Measured on reharmonization and switching to minor: gemma4:12b and qwen3:4b both succeed 10 times out of 10; gemma4:12b is more musical (idiomatic chords, 91 to 100 % of notes in the scale) but takes 20 to 80 s; qwen3:4b answers in 2 to 9 s with odder choices (out-of-key chords, 83) 88% of notes in the scale)." },
      { nom: "Température", nomEn: "Temperature", type: "nombre", plage: [0, 2], pas: 0.1, defaut: 0.7,
        doc: "Variété des réponses. Basse : proche d'une réponse sûre ; haute : plus d'invention, plus de relances.",
        docEn: "Variety of answers. Low: close to a safe answer; high: more invention, more retries." },
      { nom: "Essais", nomEn: "Attempts", type: "nombre", plage: [1, 5], pas: 1, defaut: 3,
        doc: "Nombre d'appels au modèle au plus. Une réponse refusée (JSON illisible, accord inconnu, copie de l'original) est renvoyée au modèle avec la liste précise des problèmes.",
        docEn: "Maximum number of calls to the model. A rejected answer (unreadable JSON, unknown chord, copy of the original) is sent back to the model with the precise list of problems." },
      { nom: "Délai max", nomEn: "Timeout", type: "nombre", plage: [30, 1800], pas: 30, defaut: 600, unite: "s",
        doc: "Délai d'un appel. Le premier appel à un modèle doit le charger en mémoire : comptez plusieurs minutes.",
        docEn: "Timeout of one call. The first call to a model must load it into memory: allow several minutes." },
    ],
    async executer(ctx: any) {
      const abc = ctx.entree(0);
      if (typeof abc !== "string" || !abc.trim()) return { valeurs: [null, null], erreur: true, message: traduire("msg.abc_edition.aucun_abc") };
      const consigneEntree = ctx.entree(1);
      const operation = (ctx.paramTexte("Opération", "reharmoniser") === "hauteurs" ? "hauteurs" : "reharmoniser") as OperationEdition;
      const consigne = typeof consigneEntree === "string" && consigneEntree.trim() ? consigneEntree : ctx.paramTexte("Consigne", CONSIGNE_DEFAUT);
      if (!consigne.trim()) return { valeurs: [null, null], erreur: true, message: traduire("msg.abc_edition.aucune_consigne") };
      const modele = ctx.paramTexte("Modèle", "gemma4:12b").trim() || "gemma4:12b";
      const debut = Date.now();

      const r = await editerAbc(abc, {
        operation, consigne,
        essais: Math.round(ctx.paramNombre("Essais", 3)),
        tonaliteCible: ctx.paramTexte("Tonalité du résultat", "Garder"),
      }, (prompt, format) => ollamaGenerer({
        model: modele, prompt, format,
        options: { temperature: ctx.paramNombre("Température", 0.7), num_predict: 2048 },
        timeout: ctx.paramNombre("Délai max", 600) * 1000,
      }), (etape) => ctx.onProgress(traduire("progress.abc_edition.var_0_var_1", modele, etape)));

      const secondes = Math.round((Date.now() - debut) / 1000);
      const lignesEssais = r.essais.map((e) => e.erreurs.length
        ? traduire("msg.abc_edition.essai_refuse_var_0_var_1", e.numero, e.erreurs.join(" ; "))
        : traduire("msg.abc_edition.essai_accepte_var_0", e.numero));
      const rapport = [
        r.ok ? traduire("msg.abc_edition.reussi_var_0_var_1", r.essais.length, secondes) : traduire("msg.abc_edition.echec_var_0", r.erreur ?? ""),
        ...lignesEssais,
        ...(r.accordsRetires ? [traduire("msg.abc_edition.accords_retires")] : []),
        ...(r.verification ? [texteQualite(r.verification.qualite)] : []),
      ].join("\n");
      if (!r.ok) return { valeurs: [null, rapport], erreur: true, message: r.erreur ?? rapport };
      return {
        valeurs: [r.abc, rapport],
        message: traduire("msg.abc_edition.reussi_var_0_var_1", r.essais.length, secondes)
          + (r.accordsRetires ? ` · ${traduire("msg.abc_edition.accords_retires")}` : "")
          + ` · ${texteQualite(r.verification!.qualite)}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
