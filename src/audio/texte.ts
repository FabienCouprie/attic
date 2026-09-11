// audio/texte.ts — Transformations de texte du nœud « Modifier le texte ».
//
// Ce nœud se place derrière n'importe quelle sortie texte — transcription
// Sherpa, extraction PDF, sortie d'un LLM, paroles générées — pour l'adapter
// avant ce qui suit : un prompt MusicGen, une synthèse vocale, un Texte → MIDI.
// C'est le maillon qui manquait entre des nœuds qui produisent du texte et des
// nœuds qui en consomment, et qui obligeait jusqu'ici à passer par un
// Processeur Python pour un simple remplacement.
//
// UN SEUL NŒUD AVEC UNE OPÉRATION AU CHOIX, plutôt que six nœuds : le
// catalogue en compte déjà 245, et les opérations se composent en chaînant
// plusieurs exemplaires du même nœud — ce que le graphe rend naturel.

export type OperationTexte =
  | "remplacer" | "regex" | "majuscules" | "minuscules" | "espaces" | "encadrer";

export interface OptionsTexte {
  operation: OperationTexte;
  chercher?: string;
  remplacerPar?: string;
  avant?: string;
  apres?: string;
}

export interface ResultatTexte {
  texte: string;
  /** Nombre de remplacements effectués, pour les opérations qui en font. */
  remplacements: number;
  /** Motif refusé par le moteur d'expressions régulières, le cas échéant. */
  erreur?: string;
}

/** Échappe une chaîne pour qu'elle soit cherchée à la lettre. */
function echapper(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Applique une transformation.
 *
 * Ne lève jamais : un motif d'expression régulière invalide — ce qui arrive
 * constamment, on les écrit en tâtonnant — rend le texte INCHANGÉ avec la
 * cause, plutôt que de faire échouer le nœud et d'interrompre tout le graphe
 * en aval pour une parenthèse oubliée.
 */
export function modifierTexte(entree: string, options: OptionsTexte): ResultatTexte {
  const chercher = options.chercher ?? "";
  const remplacerPar = options.remplacerPar ?? "";

  switch (options.operation) {
    case "remplacer": {
      // Chaîne vide : ne rien faire. `replaceAll("")` insérerait le
      // remplacement entre chaque caractère — surprenant, et jamais voulu.
      if (chercher === "") return { texte: entree, remplacements: 0 };
      const motif = new RegExp(echapper(chercher), "g");
      const remplacements = (entree.match(motif) ?? []).length;
      return { texte: entree.replace(motif, remplacerPar), remplacements };
    }

    case "regex": {
      if (chercher === "") return { texte: entree, remplacements: 0 };
      let motif: RegExp;
      try {
        motif = new RegExp(chercher, "g");
      } catch (e) {
        return { texte: entree, remplacements: 0, erreur: String((e as Error)?.message ?? e) };
      }
      const remplacements = (entree.match(motif) ?? []).length;
      return { texte: entree.replace(motif, remplacerPar), remplacements };
    }

    case "majuscules":
      return { texte: entree.toUpperCase(), remplacements: 0 };

    case "minuscules":
      return { texte: entree.toLowerCase(), remplacements: 0 };

    case "espaces": {
      // Ce que produit une transcription : des espaces doublés, des espaces en
      // fin de ligne, des lignes vides en série. On normalise SANS écraser les
      // sauts de ligne — un texte de paroles perdrait sa structure.
      const texte = entree
        .split("\n")
        .map((l) => l.replace(/[ \t]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return { texte, remplacements: 0 };
    }

    case "encadrer":
      return { texte: (options.avant ?? "") + entree + (options.apres ?? ""), remplacements: 0 };

    default:
      return { texte: entree, remplacements: 0 };
  }
}
