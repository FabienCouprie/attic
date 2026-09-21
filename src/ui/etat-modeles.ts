// ui/etat-modeles.ts — Ce que l'icône des modèles montre, et ce qu'un clic y fait.
//
// POURQUOI CETTE LOGIQUE VIT HORS DU COMPOSANT. Un bouton qui change d'apparence selon six états —
// on ne sait pas encore, tout est là, il manque des modèles, ça télécharge, ça extrait, ça a
// échoué — est exactement le genre d'endroit où l'on se trompe sans le voir : sur un poste de
// développement qui a déjà tous les modèles, cinq des six états ne s'affichent JAMAIS. Ils se
// découvrent chez quelqu'un qui installe la version allégée.
//
// Le composant ne fait donc que dessiner ce que cette fonction décide, et la décision s'éprouve.
//
// LE TEXTE N'EST PAS TRADUIT ICI : la fonction rend une CLÉ et ses variables. Les clés littérales
// sont vérifiées par `i18n.test.ts`, qui exige que toute clé citée dans le code existe dans le
// dictionnaire — une clé oubliée en anglais se voit donc à la compilation des tests, et non à
// l'écran d'un anglophone.

/** L'inventaire tel que le processus principal le rend. */
export interface EtatModeles {
  complets: number;
  total: number;
  octetsAPrendre: number;
  manquants: string[];
  sansAdresse: string[];
}

/** Un message de progression du processus principal. */
export interface ProgressionModeles {
  phase: "telechargement" | "extraction" | "fini" | "erreur" | "annule";
  modele?: string;
  nom?: string;
  erreur?: string;
  fraction?: number;
  fait?: number;
  nombre?: number;
}

export type VarianteModeles =
  | "inconnu" | "complet" | "manquants" | "telechargement" | "extraction" | "erreur";

export interface ApparenceModeles {
  variante: VarianteModeles;
  /** Ce qui s'écrit dans la pastille, ou `null` quand il n'y a rien à signaler. */
  badge: string | null;
  /** La clé d'infobulle, et ses variables, à passer à `traduire`. */
  cle: string;
  vars: (string | number)[];
  /** Un clic fait-il quelque chose ? Faux tant qu'on ne sait pas ce qu'il y a. */
  actionnable: boolean;
  /** Un clic pendant un téléchargement l'interrompt, il ne le relance pas. */
  interrompt: boolean;
}

/**
 * Un poids en mégaoctets, ou en gigaoctets au-delà de mille.
 *
 * « 1172 Mo » se lit mal quand il s'agit de décider si on lance le téléchargement maintenant ;
 * « 1,1 Go » se compare à ce qu'on sait de sa connexion.
 */
export function formaterOctets(octets: number): string {
  const mo = octets / 1048576;
  if (mo < 1) return `${Math.max(1, Math.round(octets / 1024))} Ko`;
  if (mo < 1024) return `${Math.round(mo)} Mo`;
  return `${(mo / 1024).toFixed(1).replace(".", ",")} Go`;
}

/** Le pourcentage affiché : entier, jamais 100 % avant la fin. */
function pourcent(fraction: number): string {
  const p = Math.max(0, Math.min(1, fraction)) * 100;
  return `${p >= 99.5 && p < 100 ? 99 : Math.round(p)} %`;
}

export function apparenceModeles(
  etat: EtatModeles | null,
  progression: ProgressionModeles | null,
): ApparenceModeles {
  // Un téléchargement en cours l'emporte sur tout : c'est ce qu'on regarde à ce moment-là.
  if (progression && (progression.phase === "telechargement" || progression.phase === "extraction")) {
    const fraction = progression.fraction ?? 0;
    return {
      variante: progression.phase === "extraction" ? "extraction" : "telechargement",
      badge: progression.phase === "extraction" ? "…" : pourcent(fraction),
      cle: progression.phase === "extraction" ? "modeles.extraction" : "modeles.encours",
      vars: [progression.nom ?? progression.modele ?? "", (progression.fait ?? 0) + 1, progression.nombre ?? 1],
      actionnable: true,
      interrompt: true,
    };
  }
  if (progression?.phase === "erreur") {
    return {
      variante: "erreur", badge: "!",
      cle: "modeles.erreur", vars: [progression.erreur ?? ""],
      actionnable: true, interrompt: false,
    };
  }
  if (!etat) {
    // Tant que l'inventaire n'est pas revenu, ne rien promettre : un bouton qui paraît prêt et ne
    // fait rien au clic est pire qu'un bouton visiblement en attente.
    return { variante: "inconnu", badge: null, cle: "modeles.verification", vars: [], actionnable: false, interrompt: false };
  }

  const aPrendre = etat.manquants.length;
  if (aPrendre === 0) {
    // Rien à prendre, mais il peut rester des modèles sans source publiée : le dire, sinon
    // l'utilisateur d'une version allégée croirait que tout est là alors qu'un nœud restera muet.
    if (etat.sansAdresse.length > 0) {
      return {
        variante: "manquants", badge: "?",
        cle: "modeles.sansAdresse", vars: [etat.sansAdresse.length],
        actionnable: false, interrompt: false,
      };
    }
    return {
      variante: "complet", badge: null,
      cle: "modeles.complets", vars: [etat.total],
      actionnable: true, interrompt: false,
    };
  }
  return {
    variante: "manquants", badge: String(aPrendre),
    cle: "modeles.manquants", vars: [aPrendre, formaterOctets(etat.octetsAPrendre)],
    actionnable: true, interrompt: false,
  };
}
