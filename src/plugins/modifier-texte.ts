// plugins/modifier-texte.ts — Nœud « Modifier le texte ».
// Se place derrière n'importe quelle sortie texte et rend le texte transformé.
// La logique vit dans audio/texte.ts, testée.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { modifierTexte, type OperationTexte } from "../audio/texte";

const OPERATIONS_FR = ["Remplacer", "Remplacer (regex)", "Majuscules", "Minuscules", "Nettoyer les espaces", "Encadrer"];
const OPERATIONS_EN = ["Replace", "Replace (regex)", "Uppercase", "Lowercase", "Tidy whitespace", "Wrap"];
const OPERATIONS_IDS: OperationTexte[] = ["remplacer", "regex", "majuscules", "minuscules", "espaces", "encadrer"];

export const fiches: FicheAudio[] = ([
  {
    id: "modifier-texte", nom: "Modifier le texte", nomEn: "Edit Text",
    univers: "Autres", famille: "Texte",
    resume: "Transforme un texte reçu en entrée : remplacement, casse, espaces, encadrement.",
    resumeEn: "Transforms incoming text: replace, case, whitespace, wrapping.",
    entrees: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    sorties: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    parametres: [
      { nom: "Opération", nomEn: "Operation", type: "choix",
        options: OPERATIONS_FR, optionsEn: OPERATIONS_EN, optionIds: OPERATIONS_IDS,
        defaut: "Remplacer", defautEn: "Replace",
        doc: "Transformation appliquée. Une seule à la fois : pour en combiner plusieurs, chaînez plusieurs exemplaires de ce nœud.",
        docEn: "Transformation applied. One at a time: to combine several, chain several copies of this node." },
      { nom: "Chercher", nomEn: "Find", type: "texte", defaut: "", defautEn: "",
        placeholder: "texte à remplacer", placeholderEn: "text to replace",
        doc: "Ce qu'il faut trouver. Pris à la lettre en mode « Remplacer », interprété comme expression régulière en mode « Remplacer (regex) ». Vide = le texte ressort inchangé.",
        docEn: "What to find. Taken literally in \"Replace\" mode, treated as a regular expression in \"Replace (regex)\" mode. Empty = the text passes through unchanged." },
      { nom: "Remplacer par", nomEn: "Replace with", type: "texte", defaut: "", defautEn: "",
        placeholder: "laisser vide pour supprimer", placeholderEn: "leave empty to delete",
        doc: "Ce qui prend la place. En mode regex, $1 et $2 reprennent les groupes capturés. Vide = suppression de ce qui a été trouvé.",
        docEn: "What takes its place. In regex mode, $1 and $2 refer to captured groups. Empty = deletes what was found." },
      { nom: "Avant", nomEn: "Before", type: "texte", defaut: "", defautEn: "",
        doc: "Texte ajouté au début, en mode « Encadrer ». Utile pour préfixer une consigne à un prompt.",
        docEn: "Text added at the start, in \"Wrap\" mode. Useful to prefix an instruction to a prompt." },
      { nom: "Après", nomEn: "After", type: "texte", defaut: "", defautEn: "",
        doc: "Texte ajouté à la fin, en mode « Encadrer ».",
        docEn: "Text added at the end, in \"Wrap\" mode." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (typeof entree !== "string") return { valeurs: [null], message: traduire("msg.aucun_texte_en_entr_e") };

      const brut = ctx.paramTexte("Opération", "remplacer");
      const operation = (OPERATIONS_IDS.includes(brut as OperationTexte) ? brut : "remplacer") as OperationTexte;

      const r = modifierTexte(entree, {
        operation,
        chercher: ctx.paramTexte("Chercher", ""),
        remplacerPar: ctx.paramTexte("Remplacer par", ""),
        avant: ctx.paramTexte("Avant", ""),
        apres: ctx.paramTexte("Après", ""),
      });

      // Un motif invalide n'interrompt pas le graphe : le texte passe
      // inchangé, et le nœud DIT pourquoi. On écrit ces motifs en tâtonnant,
      // faire échouer toute la chaîne à chaque parenthèse oubliée serait
      // insupportable.
      if (r.erreur) {
        return { valeurs: [r.texte], message: traduire("msg.regex_invalide_var_0", r.erreur) };
      }

      // Le message dit ce qui a changé, pas seulement que c'est passé : sur un
      // remplacement qui ne trouve rien, « 0 remplacement » est l'information
      // utile, et la longueur inchangée le confirme.
      const detail = (operation === "remplacer" || operation === "regex")
        ? traduire("msg.texte_remplacements_var_0", r.remplacements)
        : "";
      return {
        valeurs: [r.texte],
        message: traduire("msg.texte_modifie_var_0_var_1", entree.length, r.texte.length) + (detail ? ` · ${detail}` : ""),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
